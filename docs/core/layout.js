// 다이어그램 좌표·고아 노드·루트 표시 계산 (순수, DOM 없음). 좌표는 SVG 사용자 단위.
import { GRID, DIAGRAM } from './config.js';

const U = DIAGRAM.unit;

// map: {rows, columns, edges} → 그리기에 필요한 모든 좌표
export function layoutMap(map) {
  const { columns, edges, rows } = map;
  const w = U, h = U * DIAGRAM.nodeH;
  const colX = (c) => (DIAGRAM.padLeft + 0.5 + c * GRID.colPitch) * U;
  const rowY = (r) => (DIAGRAM.padTop + 0.5 + r * GRID.rowPitch) * U;
  const last = columns.length - 1;
  const hitW = Math.max(w, DIAGRAM.tapMin), hitH = Math.max(h, DIAGRAM.tapMin);   // 탭 영역은 마름모보다 넉넉하게

  const hasIn = new Set(edges.map(([c, , b]) => `${c + 1},${b}`));
  const hasOut = new Set(edges.map(([c, a]) => `${c},${a}`));
  const has = new Set(columns.flatMap((col, c) => col.map((n) => `${c},${n.row}`)));

  // 첫 열은 들어오는 선, 마지막 열은 나가는 선이 없는 게 정상. 나머지는 둘 다 있어야 한다 (SPEC 6장)
  const nodes = columns.flatMap((col, c) => col.map((n) => ({
    col: c, row: n.row, type: n.type, badge: n.badge ?? null, x: colX(c), y: rowY(n.row),
    orphan: (c > 0 && !hasIn.has(`${c},${n.row}`)) || (c < last && !hasOut.has(`${c},${n.row}`)),
  })));

  const lines = edges.filter(([c, a, b]) => has.has(`${c},${a}`) && has.has(`${c + 1},${b}`))
    .map(([c, a, b]) => ({ col: c, from: a, to: b, x1: colX(c) + w / 2, y1: rowY(a), x2: colX(c + 1) - w / 2, y2: rowY(b) }));

  // 칸 수정 모드에서 새 칸을 놓을 수 있는 빈 자리 (열 × 인식된 행 수)
  const emptySlots = columns.flatMap((col, c) => Array.from({ length: rows }, (_, r) => r)
    .filter((r) => !has.has(`${c},${r}`)).map((r) => ({ col: c, row: r, x: colX(c), y: rowY(r) })));

  return {
    nodeW: w, nodeH: h, hitW, hitH, nodes, edges: lines, emptySlots,
    colLabels: columns.map((_, c) => ({ col: c, x: colX(c), y: DIAGRAM.padTop * U * 0.5 })),
    rowLabels: Array.from({ length: rows }, (_, r) => ({ row: r, x: DIAGRAM.padLeft * U * 0.4, y: rowY(r) })),
    width: colX(Math.max(last, 0)) + (0.5 + DIAGRAM.padRight) * U,
    height: rowY(Math.max(rows - 1, 0)) + (0.5 + DIAGRAM.padBottom) * U,
    orphanCount: nodes.filter((n) => n.orphan).length,
  };
}

// path → 순서 번호가 붙을 노드와 굵게 그릴 선. hasStart면 path[0]은 번호 0(출발, 점수 제외)
export function routeMarks(path, hasStart = false) {
  return {
    marks: path.map(([col, row], i) => ({ col, row, n: i + (hasStart ? 0 : 1) })),
    edgeKeys: new Set(path.slice(1).map(([c, r], i) => `${path[i][0]},${path[i][1]},${r}`)),
  };
}
