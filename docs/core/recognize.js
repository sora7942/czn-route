// 스샷 → 노드·연결선 인식. DOM 의존 없음. 길이 상수는 전부 config.js의 u(노드 폭) 비율.
// 행 번호는 세트 전체의 y로 정하므로 detectNodes는 픽셀 y만 돌려주고, recognizeSet이 이어서 처리한다.
import {
  MASK_TYPES, NODE_TYPES, MASK, NODE, REGION, WHITE, BADGES, BADGE_ORDER, BADGE_MIN_FRAC, LINE, odd,
} from './config.js';
import {
  rgbaToHsv, toGray, hueMask, hueDist, close, connectedComponents, tophat, countIn,
} from './image.js';
import { assignRows, groupColumns, stitch } from './stitch.js';

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const px = (v) => Math.round(v);

// 색별 마스크 → 닫힘 → 연결 요소. 종류별로 따로 돌린다 (종류 변수를 덮어쓰지 않도록 요소에 type을 붙여 둠)
function components(hsv, closeK) {
  const { width: W, height: H } = hsv;
  const all = [];
  for (const type of MASK_TYPES) {
    const m = hueMask(hsv, { hue: NODE_TYPES[type].hue, tol: MASK.hueTol, sMin: MASK.sMin, vMin: MASK.vMin, y0: NODE.uiTopFrac * H, y1: NODE.uiBottomFrac * H });
    for (const c of connectedComponents(close(m, W, H, closeK), W, H)) all.push({ ...c, type });
  }
  return all;
}

// u 부트스트랩: 노드 후보(면적·채움·가로세로비)의 폭 중앙값
function estimateU(comps, W, H) {
  const ws = comps
    .filter((c) => c.area >= NODE.bootAreaFrac * W * H && c.area / (c.w * c.h) >= NODE.fillMin && c.w / c.h >= NODE.bootAspect[0] && c.w / c.h <= NODE.bootAspect[1])
    .map((c) => c.w);
  return ws.length ? median(ws) : 0;
}

// 스샷 1장 → {nodes: [{x,y,type,badge}], clipped: {left, right}, u, warnings}
// y는 픽셀 값 (행 배정은 세트 단위). 잘린 열은 버리되 (y, 종류)만 clipped에 기록 (이어붙이기 보조 근거)
export function detectNodes(img) {
  const { width: W, height: H } = img, warnings = [];
  const hsv = rgbaToHsv(img);
  // 닫힘 커널은 u에서 정해야 하는데 u는 닫힘 뒤에 알 수 있다 → 이미지 폭 비율로 한 번 추정하고, u로 다시 계산해 다르면 재실행
  let k = odd(px(NODE.bootCloseFrac * W));
  let comps = components(hsv, k);
  let u = estimateU(comps, W, H);
  if (!u) return { nodes: [], clipped: { left: [], right: [] }, u: 0, warnings: ['노드를 찾지 못함 (칸 색 후보 없음)'], width: W, height: H };
  const k2 = odd(px(NODE.closeK * u));
  if (k2 !== k) { k = k2; comps = components(hsv, k); u = estimateU(comps, W, H) || u; }

  const margin = NODE.edgeMargin * u;
  const nodes = [], clipped = { left: [], right: [] };
  for (const c of comps) {
    const cx = Math.floor(c.x + c.w / 2), cy = Math.floor(c.y + c.h / 2);
    const heightOk = c.h >= NODE.heightRange[0] * u && c.h <= NODE.heightRange[1] * u;
    const fillOk = c.area / (c.w * c.h) >= NODE.fillMin;
    const full = c.area >= NODE.areaMin * u * u && c.w >= NODE.widthRange[0] * u && c.w <= NODE.widthRange[1] * u && heightOk && fillOk;
    const inside = cx > margin && cx < W - margin;
    if (full && inside) {
      let type = c.type;
      if (type === 'camp') { // 주황은 아이콘 흰 픽셀 비율로 불꽃/나침반 구분
        const [x0, x1, y0, y1] = REGION.white;
        const r = countIn(W, H, { x0: cx + px(x0 * u), x1: cx + px(x1 * u), y0: cy + px(y0 * u), y1: cy + px(y1 * u) },
          (i) => hsv.S[i] < WHITE.sMax && hsv.V[i] > WHITE.vMin);
        if (r.count / r.area < WHITE.campFrac) type = 'compass';
      }
      nodes.push({ x: cx, y: cy, type, badge: badgeOf(hsv, cx, cy, u) });
    } else if (!inside && heightOk && c.w >= NODE.clippedWidthMin * u && c.area >= NODE.clippedAreaMin * u * u) {
      // 화면 끝에 걸쳐 잘린 열: 버리되 (y, 종류)만 기록. 일부만 보여 종류는 색 마스크 기준 그대로
      (cx < W / 2 ? clipped.left : clipped.right).push({ y: cy, type: c.type });
    }
  }
  return { nodes, clipped, u, warnings, width: W, height: H };
}

function badgeOf(hsv, cx, cy, u) {
  const [x0, x1, y0, y1] = REGION.badge, { H, S, V, width: W, height } = hsv;
  const rect = { x0: cx + px(x0 * u), x1: cx + px(x1 * u), y0: cy + px(y0 * u), y1: cy + px(y1 * u) };
  for (const key of BADGE_ORDER) {
    const b = BADGES[key];
    const r = countIn(W, height, rect, (i) => hueDist(H[i], b.hue) < b.hueTol && S[i] > b.sMin && V[i] > b.vMin);
    if (r.area && r.count / r.area > BADGE_MIN_FRAC) return key;
  }
  return null;
}

// 연결선: 이웃한 열의 모든 (A,B) 쌍에서 A 오른쪽 점 → B 왼쪽 점 직선을 따라 표본을 뽑아 top-hat 밝기를 본다.
// 끝점 y는 탐지된 노드 중심이 아니라 행 격자 위치 (grid.top + pitch·row)를 쓴다.
// cols: [{x, rows: [row,...]}] (왼→오), tophatImg: Uint8Array
export function detectEdges(tophatImg, W, H, cols, grid, u) {
  const edges = [], dx = LINE.endDx * u, dy = LINE.endDy * u, r = Math.max(1, px(LINE.boxR * u));
  const rowY = (row) => grid.top + grid.pitch * row;
  const score = (p, q) => {
    const n = LINE.samples; let hit = 0, total = 0;
    for (let i = LINE.trim; i < n - LINE.trim; i++) {
      const t = i / (n - 1), x = Math.trunc(p[0] + (q[0] - p[0]) * t), y = Math.trunc(p[1] + (q[1] - p[1]) * t);
      let mx = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (tophatImg[yy * W + xx] > mx) mx = tophatImg[yy * W + xx];
      }
      if (mx > LINE.brightMin) hit++;
      total++;
    }
    return hit / total;
  };
  for (let i = 0; i < cols.length - 1; i++) {
    for (const a of cols[i].rows) for (const b of cols[i + 1].rows) {
      const p = [cols[i].x + dx, rowY(a) + dy], q = [cols[i + 1].x - dx, rowY(b) + dy];
      if (score(p, q) > LINE.hitFrac) edges.push([i, a, b]);
    }
  }
  return edges;
}

export function tophatOf(img, u) {
  return tophat(toGray(img), img.width, img.height, odd(px(LINE.tophatK * u), 3));
}

// 스샷 여러 장(올린 순서) → {rows, columns, edges, meta: {warnings, u, grid, shots}}
export function recognizeSet(images) {
  const det = images.map(detectNodes);
  const warnings = det.flatMap((d, i) => d.warnings.map((w) => `스샷 ${i + 1}: ${w}`));
  const good = det.filter((d) => d.u);
  if (!good.length) return { rows: 0, columns: [], edges: [], meta: { warnings, u: 0, grid: null, shots: [] } };
  const uSet = median(good.map((d) => d.u));
  const ys = det.flatMap((d) => d.nodes.map((n) => n.y));
  const rowsInfo = assignRows(ys, uSet);
  warnings.push(...rowsInfo.warnings);
  const { grid, rowOf } = rowsInfo;

  const parts = [], shots = [];
  det.forEach((d, si) => {
    if (!d.u) return;
    const g = groupColumns(d.nodes, d.u);
    warnings.push(...g.warnings.map((w) => `스샷 ${si + 1}: ${w}`));
    const columns = g.columns.map((c) => {
      const cells = c.nodes.map((n) => ({ row: rowOf(n.y), type: n.type, badge: n.badge }));
      if (new Set(cells.map((n) => n.row)).size !== cells.length) warnings.push(`스샷 ${si + 1}: x=${c.x.toFixed(0)}px 열에 같은 행으로 배정된 노드가 있음`);
      return cells;
    });
    const th = tophatOf(images[si], d.u);
    const edges = detectEdges(th, d.width, d.height, g.columns.map((c, i) => ({ x: c.x, rows: columns[i].map((n) => n.row) })), grid, d.u);
    const clip = (list) => list.map((n) => ({ row: rowOf(n.y), type: n.type }));
    parts.push({ columns, edges, clippedLeft: clip(d.clipped.left), clippedRight: clip(d.clipped.right) });
    shots.push({ u: d.u, width: d.width, height: d.height, colX: g.columns.map((c) => c.x), nodes: d.nodes.length });
  });
  const out = stitch(parts);
  warnings.push(...out.warnings);
  return { rows: out.rows, columns: out.columns, edges: out.edges, meta: { warnings, u: uSet, grid, shots } };
}
