// 루트 계산 (SPEC 5장). DOM 의존 없음.
// route(map, weights, options) → { routes: [{score, path, counts}] (최대 3), sameScoreCount, noWeights }
//   map: recognizeSet 결과 {rows, columns, edges}. 노드 = [col, row]
//   weights: {battle, event, elite, camp, compass, flame, card} 각 숫자 (없으면 0)
//   options.start: [col, row] — 그 노드부터 시작, 그 노드는 점수·counts에서 뺀다
//   sameScoreCount: 최고 점수와 같은 점수인 루트의 전체 개수 (routes에는 3개까지만)
import { NODE_TYPES, BADGES } from './config.js';

const TOP = 3;

export function route(map, weights = {}, options = {}) {
  if (!Object.values(weights).some(w => w)) return { routes: [], sameScoreCount: 0, noWeights: true };

  const { columns, edges } = map;
  const last = columns.length - 1;
  const find = (c, r) => columns[c]?.find(n => n.row === r);
  const w = n => (weights[n.type] || 0) + (n.badge ? weights[n.badge] || 0 : 0);

  const next = new Map(); // "col,row" → [toRow]
  for (const [c, a, b] of edges) {
    if (!find(c, a) || !find(c + 1, b)) continue;
    const k = `${c},${a}`;
    next.set(k, [...(next.get(k) || []), b]);
  }

  // 한 열씩 앞으로: 노드마다 상위 TOP개 {score, path}, 그리고 최고 점수 경로 수 {s, n}
  let startCol = 0;
  let cur = new Map(); // row → {top, best}
  if (options.start) {
    const [c, r] = options.start;
    if (!find(c, r)) throw new Error(`start 노드 없음: [${c},${r}]`);
    startCol = c;
    cur.set(r, { top: [{ score: 0, path: [[c, r]] }], best: { s: 0, n: 1 } });
  } else {
    for (const n of columns[0] || []) {
      cur.set(n.row, { top: [{ score: w(n), path: [[0, n.row]] }], best: { s: w(n), n: 1 } });
    }
  }
  for (let c = startCol; c < last; c++) {
    const nxt = new Map();
    for (const [r, st] of cur) {
      for (const b of next.get(`${c},${r}`) || []) {
        const node = find(c + 1, b), add = w(node);
        const e = nxt.get(b) || { cand: [], best: null };
        for (const t of st.top) e.cand.push({ score: t.score + add, path: [...t.path, [c + 1, b]] });
        const s = st.best.s + add;
        if (!e.best || s > e.best.s) e.best = { s, n: st.best.n };
        else if (s === e.best.s) e.best.n += st.best.n;
        nxt.set(b, e);
      }
    }
    cur = new Map();
    for (const [b, e] of nxt) cur.set(b, { top: e.cand.sort((x, y) => y.score - x.score).slice(0, TOP), best: e.best });
  }

  // 막다른 노드는 next가 없어 위에서 전파가 끊기므로, 마지막 열에 닿은 것만 남는다
  const all = [...cur.values()].flatMap(s => s.top).sort((x, y) => y.score - x.score).slice(0, TOP);
  const topScore = all[0]?.score;
  let sameScoreCount = 0;
  for (const s of cur.values()) {
    if (s.best.s === topScore) sameScoreCount += s.best.n;
  }

  const routes = all.map(({ score, path }) => {
    const counts = Object.fromEntries([...Object.keys(NODE_TYPES), ...Object.keys(BADGES)].map(k => [k, 0]));
    for (const [c, r] of path.slice(options.start ? 1 : 0)) {
      const n = find(c, r);
      counts[n.type]++;
      if (n.badge) counts[n.badge]++;
    }
    return { score, path, counts };
  });
  return { routes, sameScoreCount, noWeights: false };
}
