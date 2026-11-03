// 맵 수정 연산 (순수). 전부 새 map을 돌려주고 원본은 건드리지 않는다 → 되돌리기는 이전 map을 쥐고 있으면 된다.
// 잘못된 인자는 throw (화면은 유효한 칸만 누르게 만든다). 사용자 실수인 선 토글만 {error}로 돌려준다.
import { NODE_TYPES, BADGES } from './config.js';

const copy = (map) => ({ ...map, columns: map.columns.map((c) => c.map((n) => ({ ...n }))), edges: map.edges.map((e) => [...e]) });
const find = (map, c, r) => map.columns[c]?.find((n) => n.row === r);
const byEdge = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

function check(map, col, row, { type, badge }) {
  if (!map.columns[col]) throw new Error(`열 ${col} 없음`);
  if (!Number.isInteger(row) || row < 0 || row >= map.rows) throw new Error(`행 ${row} 범위 밖`);
  if (type !== undefined && !NODE_TYPES[type]) throw new Error(`알 수 없는 종류: ${type}`);
  if (badge != null && !BADGES[badge]) throw new Error(`알 수 없는 뱃지: ${badge}`);
}

export function setNode(map, col, row, patch) {
  check(map, col, row, patch);
  const m = copy(map), n = find(m, col, row);
  if (!n) throw new Error(`C${col} R${row}에 칸 없음`);
  if (patch.type !== undefined) n.type = patch.type;
  if (patch.badge !== undefined) n.badge = patch.badge;
  return m;
}

export function addNode(map, col, row, { type, badge = null }) {
  check(map, col, row, { type, badge });
  if (!type) throw new Error('종류가 필요해요');
  if (find(map, col, row)) throw new Error(`C${col} R${row}에 이미 칸 있음`);
  const m = copy(map);
  m.columns[col].push({ row, type, badge });
  m.columns[col].sort((a, b) => a.row - b.row);
  return m;
}

// 그 칸에 닿는 선(들어오는·나가는)도 같이 지운다. 열 배열은 비어도 남겨 열 번호를 유지한다
export function removeNode(map, col, row) {
  if (!find(map, col, row)) throw new Error(`C${col} R${row}에 칸 없음`);
  const m = copy(map);
  m.columns[col] = m.columns[col].filter((n) => n.row !== row);
  m.edges = m.edges.filter(([c, a, b]) => !((c === col && a === row) || (c === col - 1 && b === row)));
  return m;
}

// 이웃한 열의 두 칸 사이 선을 켜고 끈다 → {map, added} | {error: 'no-node' | 'not-adjacent'}
export function toggleEdge(map, [c1, r1], [c2, r2]) {
  if (!find(map, c1, r1) || !find(map, c2, r2)) return { error: 'no-node' };
  if (Math.abs(c1 - c2) !== 1) return { error: 'not-adjacent' };
  const [c, from, to] = c1 < c2 ? [c1, r1, r2] : [c2, r2, r1];
  const m = copy(map);
  const i = m.edges.findIndex((e) => e[0] === c && e[1] === from && e[2] === to);
  if (i >= 0) m.edges.splice(i, 1); else m.edges.push([c, from, to]);
  m.edges.sort(byEdge);
  return { map: m, added: i < 0 };
}

// expected.json과 같은 형식 (meta는 빼고, 열 안 행 오름차순·badge null·선 정렬). expected_best는 계산 결과라 넣지 않는다
export function exportMap(map, note = 'czn-route 내보내기') {
  return {
    _note: note,
    rows: map.rows,
    columns: map.columns.map((col) => [...col].sort((a, b) => a.row - b.row).map((n) => ({ row: n.row, type: n.type, badge: n.badge ?? null }))),
    edges: map.edges.map((e) => [...e]).sort(byEdge),
  };
}
