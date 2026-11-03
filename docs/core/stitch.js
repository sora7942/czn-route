// 세트(스샷 여러 장) 단위 조립: 행 배정, 열 묶기, 이어붙이기. 픽셀·DOM 비의존 순수 함수.
import { GRID, TYPE_FAMILY, OVERLAP } from './config.js';

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// 정렬된 값을 간격 > tol 에서 끊어 묶고 [{center, values}] 반환
function cluster1d(values, tol) {
  const s = [...values].sort((a, b) => a - b), out = [];
  for (const v of s) {
    const last = out[out.length - 1];
    if (last && v - last.values[last.values.length - 1] <= tol) last.values.push(v);
    else out.push({ values: [v] });
  }
  for (const c of out) c.center = c.values.reduce((a, b) => a + b, 0) / c.values.length;
  return out;
}

// 세트 전체 노드 y(픽셀) → 행 격자. 같은 세트의 스샷은 행 y가 같다고 본다 (맵은 가로로만 스크롤).
// 맨 위 클러스터 = 행 0, 클러스터 사이 최소 간격 = 행 간격. 간격이 2배면 빈 행. 절대 행 번호는 의미 없음.
// u = 탐지된 노드 폭 (허용오차·교차 점검용)
export function assignRows(ys, u) {
  const warnings = [];
  if (!ys.length) return { grid: null, rowOf: () => 0, rows: 0, warnings };
  const cl = cluster1d(ys, GRID.rowClusterTol * u), centers = cl.map((c) => c.center);
  const pred = GRID.rowPitch * u;
  let pitch = pred, top = centers[0];
  if (centers.length >= 2) {
    pitch = Math.min(...centers.slice(1).map((c, i) => c - centers[i]));
    if (Math.abs(pitch - pred) / pred > GRID.pitchMismatchMax) {
      warnings.push(`행 간격 ${pitch.toFixed(1)}px가 노드 크기로 예측한 ${pred.toFixed(1)}px와 다름 (행이 빠졌거나 인식 오류)`);
    }
  }
  const rows = centers.map((c) => Math.round((c - top) / pitch));
  centers.forEach((c, i) => {
    if (Math.abs((c - top) / pitch - rows[i]) > GRID.rowResidualMax) {
      warnings.push(`y=${c.toFixed(0)}px 노드가 행 격자에서 벗어남 (행 간격의 ${(Math.abs((c - top) / pitch - rows[i]) * 100).toFixed(0)}%)`);
    }
    if (rows.indexOf(rows[i]) !== i) warnings.push(`y=${c.toFixed(0)}px 가 다른 클러스터와 같은 행(${rows[i]})으로 배정됨`);
  });
  // 최소제곱 재적합: y = top + pitch·row (행이 멀수록 쌓이는 오차 줄이기)
  if (new Set(rows).size >= 2) {
    const n = rows.length, mr = rows.reduce((a, b) => a + b, 0) / n, my = centers.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    rows.forEach((r, i) => { sxy += (r - mr) * (centers[i] - my); sxx += (r - mr) ** 2; });
    pitch = sxy / sxx; top = my - pitch * mr;
  }
  const rowOf = (y) => Math.max(0, Math.round((y - top) / pitch));
  return { grid: { top, pitch }, rowOf, rows: Math.max(...rows) + 1, warnings };
}

// 한 스샷의 노드 [{x,...}] → x로 열 묶기 [{x, nodes}] (왼→오). 열 사이 간격이 열 간격의 정수배에서 벗어나거나
// 2배 이상이면(빈 열) 추측하지 않고 경고
export function groupColumns(nodes, u) {
  const warnings = [];
  const byX = [...nodes].sort((a, b) => a.x - b.x), cols = [];
  for (const n of byX) {
    const last = cols[cols.length - 1];
    if (last && n.x - last.nodes[last.nodes.length - 1].x <= GRID.colClusterTol * u) last.nodes.push(n);
    else cols.push({ nodes: [n] });
  }
  for (const c of cols) c.x = median(c.nodes.map((n) => n.x));
  const pitch = GRID.colPitch * u;
  cols.slice(1).forEach((c, i) => {
    const r = (c.x - cols[i].x) / pitch, k = Math.round(r);
    if (Math.abs(r - k) > GRID.colResidualMax) warnings.push(`열 간격 불규칙: x=${cols[i].x.toFixed(0)}→${c.x.toFixed(0)}px (열 간격의 ${r.toFixed(2)}배)`);
    else if (k >= 2) warnings.push(`빈 열 의심: x=${cols[i].x.toFixed(0)}→${c.x.toFixed(0)}px 사이 열 ${k - 1}개 누락`);
  });
  return { columns: cols, warnings };
}

// 잘린 열 서명 (행, 색 계열). camp/compass는 일부만 보여 못 가르므로 같은 계열
const clipKeys = (col) => col.map((n) => `${n.row}:${TYPE_FAMILY[n.type] ?? n.type}`);
// 잘린 열은 어두운 노드가 빠질 수 있어서, 검출된 것이 모두 대상 열에 (행, 계열)로 있으면 맞는 것으로 본다
const clipMatches = (clip, col) => { const want = new Set(clipKeys(col)); return clipKeys(clip).every((k) => want.has(k)); };

// 앞 스샷 오른쪽 잘린 열 == 다음 스샷의 겹침 바로 다음 열, 다음 스샷 왼쪽 잘린 열 == 앞 스샷의 겹침 바로 앞 열.
// 근거가 있는 쪽이 모두 맞으면 true, 하나라도 틀리면 false, 근거가 아예 없으면 null
function clippedEvidence(prevCols, prev, next, k) {
  const checks = [];
  const after = next.columns[k], before = prevCols[prevCols.length - k - 1];
  if (prev.clippedRight?.length && after) checks.push(clipMatches(prev.clippedRight, after));
  if (next.clippedLeft?.length && before) checks.push(clipMatches(next.clippedLeft, before));
  return checks.length ? checks.every(Boolean) : null;
}

const family = (n) => TYPE_FAMILY[n.type] ?? n.type;
const byRow = (col) => new Map(col.map((n) => [n.row, n]));

// 겹침 후보 k의 일치 점수 (0~1). 칸은 행 단위로 비교: 같은 색 계열이면 일치, 다르면 불일치, 한쪽에만 있으면 "누락"(어둡거나
// 번진 칸이 빠진 것일 수 있어 절반 감점). 간선도 같이 본다: 선은 칸 색 인식과 무관해서 압축·흐림에 강한 근거다.
function overlapScore(cols, edges, c, partEdges, k) {
  const base = cols.length - k;
  let good = 0, bad = 0;
  for (let j = 0; j < k; j++) {
    const p = byRow(cols[base + j]), q = byRow(c[j]);
    for (const row of new Set([...p.keys(), ...q.keys()])) {
      if (p.has(row) && q.has(row)) { if (family(p.get(row)) === family(q.get(row))) good++; else bad++; }
      else bad += OVERLAP.missingPenalty;
    }
  }
  const prev = new Set([...edges.values()].filter(([i]) => i >= base && i < base + k - 1).map(([i, a, b]) => `${i - base},${a},${b}`));
  const next = new Set(partEdges.filter(([i]) => i < k - 1).map(([i, a, b]) => `${i},${a},${b}`));
  const both = [...prev].filter((e) => next.has(e)).length;
  good += both; bad += OVERLAP.missingPenalty * (prev.size + next.size - 2 * both);
  return good + bad ? good / (good + bad) : 0;
}

// 겹친 열의 한 칸 병합. 종류: 한쪽에만 있으면 그쪽, 둘 다 있으면 화면 가장자리에서 먼 쪽(가려짐·잘림이 덜한 쪽).
// 뱃지: 한쪽만 보이면 보이는 쪽. 둘 다 보이는데 다르면 경고하고 먼 쪽. ⓘ에 가려진 쪽(badgeHidden)은 판단에서 뺀다.
function mergeCell(p, q, where, warnings) {
  if (!p || !q) return p ?? q;
  const [far, near] = q.edgeDist > p.edgeDist ? [q, p] : [p, q];
  const out = { ...far };
  if (p.type !== q.type) warnings.push(`${where} 종류가 스샷마다 다름 (${p.type} / ${q.type}) → 가장자리에서 먼 쪽 ${far.type} 채택`);
  if (p.badge && q.badge) {
    if (p.badge !== q.badge) warnings.push(`${where} 뱃지가 스샷마다 다름 (${p.badge} / ${q.badge}) → ${far.badge} 채택`);
  } else if (p.badge || q.badge) {
    out.badge = p.badge || q.badge;
    if (!(p.badge ? q : p).badgeHidden) warnings.push(`${where} 뱃지가 스샷마다 다름 (한쪽은 없음) → ${out.badge} 채택`);
  }
  out.badgeHidden = out.badge == null && p.badgeHidden && q.badgeHidden;
  return out;
}

// parts: [{columns: [[{row,type,badge,badgeHidden?}]], edges: [[col,a,b]], colX?, width?, clippedLeft?, clippedRight?}] (올린 순서)
// → {rows, columns, edges, offsets, warnings}. 열은 행 오름차순, 간선은 (열,from,to) 오름차순.
// 겹침은 후보마다 점수(overlapScore)를 매겨 정한다: 점수가 OVERLAP.minScore 이상이고 가장 높은 후보를 채택.
// 후보가 둘로 갈리거나(2등과 차이 < margin) 겹침이 1열이면 잘린 열 근거가 없는 한 "겹침 불확실" 경고.
export function stitch(parts) {
  const warnings = [];
  const cols = [], edges = new Map(), offsets = [];
  parts.forEach((part, pi) => {
    const c = part.columns.map((col, ci) => {
      const x = part.colX?.[ci], edgeDist = x != null && part.width ? Math.min(x, part.width - x) : 0;
      return [...col].sort((a, b) => a.row - b.row).map((n) => ({ ...n, edgeDist, badgeHidden: !!n.badgeHidden }));
    });
    let k = 0;
    if (cols.length) {
      const cand = [];
      for (let kk = Math.min(cols.length, c.length); kk >= 1; kk--) cand.push({ k: kk, score: overlapScore(cols, edges, c, part.edges, kk) });
      // 점수가 같으면 더 긴 겹침 (cand가 k 내림차순이라 > 로 비교하면 앞쪽이 남는다)
      const best = cand.reduce((m, x) => (x.score > m.score ? x : m), cand[0]);
      const tag = `스샷 ${pi + 1}`;
      if (best.score < OVERLAP.minScore) warnings.push(`${tag}: 앞 스샷과 겹치는 열이 없음 (이어붙임이 틀렸을 수 있음)`);
      else {
        k = best.k;
        const other = cand.filter((x) => x !== best && x.score >= best.score - OVERLAP.margin);
        if (k < 2 || other.length) {
          const ev = clippedEvidence(cols, parts[pi - 1], { ...part, columns: c }, k);
          if (ev !== true) {
            warnings.push(`${tag}: 겹침 불확실 (겹친 열 ${k}개${other.length ? `, 다른 후보 ${other.map((x) => x.k).join('·')}열` : ''}` +
              `${ev === false ? ', 잘린 열이 맞지 않음' : ', 잘린 열 근거 없음'})`);
          }
        }
      }
    }
    const off = cols.length - k;
    offsets.push(off);
    // 겹친 열 병합 (칸 종류·뱃지)
    for (let i = 0; i < k; i++) {
      const p = byRow(cols[off + i]), q = byRow(c[i]);
      cols[off + i] = [...new Set([...p.keys(), ...q.keys()])].sort((a, b) => a - b)
        .map((row) => mergeCell(p.get(row), q.get(row), `스샷 ${pi + 1}: 겹친 열 ${off + i}의 행 ${row}`, warnings));
    }
    // 겹친 열 사이 간선은 두 스샷이 같아야 한다 (다르면 합집합으로 두고 경고)
    if (cols.length && k >= 2) {
      const mine = new Set(part.edges.filter(([i]) => i < k - 1).map(([i, a, b]) => `${i + off},${a},${b}`));
      const theirs = new Set([...edges.keys()].filter((e) => { const i = +e.split(',')[0]; return i >= off && i < off + k - 1; }));
      if (mine.size !== theirs.size || [...mine].some((e) => !theirs.has(e))) warnings.push(`스샷 ${pi + 1}: 겹친 열 사이 간선이 스샷마다 다름`);
    }
    for (const [i, a, b] of part.edges) edges.set(`${i + off},${a},${b}`, [i + off, a, b]);
    cols.push(...c.slice(k));
  });
  // 모든 관측에서 뱃지가 가려진 칸: 추측하지 않고 경고. 내부 필드(edgeDist, badgeHidden)는 결과에서 뺀다
  const columns = cols.map((col, ci) => col.map((n) => {
    if (n.badge == null && n.badgeHidden) warnings.push(`열 ${ci} 행 ${n.row}: 뱃지가 ⓘ에 가려져 판단 못함`);
    return { row: n.row, type: n.type, badge: n.badge ?? null };
  }));
  const outEdges = [...edges.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const rows = columns.reduce((m, col) => col.reduce((mm, n) => Math.max(mm, n.row + 1), m), 0);
  return { rows, columns, edges: outEdges, offsets, warnings };
}
