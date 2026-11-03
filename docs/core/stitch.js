// 세트(스샷 여러 장) 단위 조립: 행 배정, 열 묶기, 이어붙이기. 픽셀·DOM 비의존 순수 함수.
import { GRID, TYPE_FAMILY } from './config.js';

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

// 열 서명 (행, 종류)
const sig = (col) => col.map((n) => `${n.row}:${n.type}`).sort().join(',');
// 잘린 열 서명 (행, 색 계열). camp/compass는 일부만 보여 못 가르므로 같은 계열
const clipSig = (col) => col.map((n) => `${n.row}:${TYPE_FAMILY[n.type] ?? n.type}`).sort().join(',');

// 앞 스샷 오른쪽 잘린 열 == 다음 스샷의 겹침 바로 다음 열, 다음 스샷 왼쪽 잘린 열 == 앞 스샷의 겹침 바로 앞 열.
// 근거가 있는 쪽이 모두 맞으면 true, 하나라도 틀리면 false, 근거가 아예 없으면 null
function clippedEvidence(prevCols, prev, next, k) {
  const checks = [];
  const after = next.columns[k], before = prevCols[prevCols.length - k - 1];
  if (prev.clippedRight?.length && after) checks.push(clipSig(prev.clippedRight) === clipSig(after));
  if (next.clippedLeft?.length && before) checks.push(clipSig(next.clippedLeft) === clipSig(before));
  return checks.length ? checks.every(Boolean) : null;
}

// parts: [{columns: [[{row,type,badge}]], edges: [[col,a,b]], clippedLeft?, clippedRight?}] (올린 순서)
// → {rows, columns, edges, warnings}. 열은 행 오름차순, 간선은 (열,from,to) 오름차순
export function stitch(parts) {
  const warnings = [];
  const cols = [], edges = new Map();
  parts.forEach((part, pi) => {
    const c = part.columns.map((col) => [...col].sort((a, b) => a.row - b.row));
    let k = 0;
    if (cols.length) {
      const matches = [];
      for (let kk = Math.min(cols.length, c.length); kk >= 1; kk--) {
        if (cols.slice(-kk).every((x, i) => sig(x) === sig(c[i]))) matches.push(kk);
      }
      k = matches[0] ?? 0;
      const tag = `스샷 ${pi + 1}`;
      if (!k) warnings.push(`${tag}: 앞 스샷과 겹치는 열이 없음 (이어붙임이 틀렸을 수 있음)`);
      else if (k < 2 || matches.length > 1) {
        const ev = clippedEvidence(cols, parts[pi - 1], part, k);
        if (ev !== true) {
          warnings.push(`${tag}: 겹침 불확실 (겹친 열 ${k}개${matches.length > 1 ? `, 다른 후보 ${matches.slice(1).join('·')}열` : ''}` +
            `${ev === false ? ', 잘린 열이 맞지 않음' : ', 잘린 열 근거 없음'})`);
        }
      }
      // 겹친 열 안의 뱃지는 두 스샷이 같아야 한다 (앞 것을 유지)
      for (let i = 0; i < k; i++) {
        const prev = cols[cols.length - k + i];
        c[i].forEach((n, j) => { if ((n.badge ?? null) !== (prev[j].badge ?? null)) warnings.push(`${tag}: 겹친 열 ${cols.length - k + i}의 행 ${n.row} 뱃지가 스샷마다 다름`); });
      }
    }
    const off = cols.length - k;
    // 겹친 열 사이 간선은 두 스샷이 같아야 한다 (다르면 합집합으로 두고 경고)
    if (cols.length && k >= 2) {
      const mine = new Set(part.edges.filter(([i]) => i < k - 1).map(([i, a, b]) => `${i + off},${a},${b}`));
      const theirs = new Set([...edges.keys()].filter((e) => { const i = +e.split(',')[0]; return i >= off && i < off + k - 1; }));
      if (mine.size !== theirs.size || [...mine].some((e) => !theirs.has(e))) warnings.push(`스샷 ${pi + 1}: 겹친 열 사이 간선이 스샷마다 다름`);
    }
    for (const [i, a, b] of part.edges) edges.set(`${i + off},${a},${b}`, [i + off, a, b]);
    cols.push(...c.slice(k));
  });
  const outEdges = [...edges.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const rows = cols.reduce((m, col) => col.reduce((mm, n) => Math.max(mm, n.row + 1), m), 0);
  return { rows, columns: cols, edges: outEdges, warnings };
}
