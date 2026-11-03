import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { route } from '../docs/core/route.js';

const expected = JSON.parse(readFileSync(new URL('./fixtures/sample-run-1.expected.json', import.meta.url), 'utf8'));

test('fixture: expected_best 재현', () => {
  for (const [key, want] of Object.entries(expected.expected_best)) {
    const k = key.replace('badge_', '');
    const { routes } = route(expected, { [k]: 1 });
    assert.equal(routes[0].score, want, key);
    assert.equal(routes[0].counts[k], want, `${key} counts`);
    assert.equal(routes[0].path.length, expected.columns.length);
  }
});

const n = (row, type, badge = null) => ({ row, type, badge });
// col0: r0 battle, r1 camp / col1: r0 camp, r1 elite, r2 camp(막다른) / col2: r0 event, r1 battle
const small = {
  rows: 3,
  columns: [[n(0, 'battle'), n(1, 'camp')], [n(0, 'camp'), n(1, 'elite'), n(2, 'camp')], [n(0, 'event'), n(1, 'battle')]],
  edges: [[0, 0, 0], [0, 0, 2], [0, 1, 1], [0, 1, 2], [1, 0, 0], [1, 0, 1], [1, 1, 1]],
};

test('동점: 서로 다른 경로 3개, 막다른 노드 경유 경로는 제외', () => {
  const { routes, sameScoreCount } = route(small, { camp: 1 });
  assert.deepEqual(routes.map(r => r.score), [1, 1, 1]);
  assert.equal(sameScoreCount, 3);
  assert.equal(new Set(routes.map(r => JSON.stringify(r.path))).size, 3);
  for (const r of routes) {
    assert.equal(r.path.length, 3);
    assert.ok(!r.path.some(([c, row]) => c === 1 && row === 2));
  }
});

test('동점이 3개 넘으면 같은 점수 루트 개수 반환', () => {
  const full = [0, 1, 2].map(() => [n(0, 'battle'), n(1, 'battle')]);
  const edges = [0, 1].flatMap(c => [[c, 0, 0], [c, 0, 1], [c, 1, 0], [c, 1, 1]]);
  const { routes, sameScoreCount } = route({ rows: 2, columns: full, edges }, { battle: 1 });
  assert.equal(routes.length, 3);
  assert.equal(sameScoreCount, 8);
  assert.equal(routes[0].score, 3);
});

test('음수 가중치는 피한다', () => {
  const { routes } = route(small, { camp: 1, elite: -1 });
  assert.deepEqual(routes.map(r => r.score), [1, 1, 0]);
  assert.deepEqual(routes[2].path, [[0, 1], [1, 1], [2, 1]]);
});

test('start 지정: 그 노드는 점수·counts에서 제외', () => {
  const { routes } = route(small, { camp: 1 }, { start: [0, 1] });
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].path, [[0, 1], [1, 1], [2, 1]]);
  assert.equal(routes[0].score, 0);
  assert.equal(routes[0].counts.camp, 0);
  assert.equal(routes[0].counts.elite, 1);
});

test('뱃지 가중치와 counts', () => {
  const m = { rows: 1, columns: [[n(0, 'battle', 'flame')], [n(0, 'camp', 'card')]], edges: [[0, 0, 0]] };
  const { routes } = route(m, { camp: 2, flame: 3, card: -1 });
  assert.equal(routes[0].score, 3 + 2 - 1);
  assert.equal(routes[0].counts.flame, 1);
  assert.equal(routes[0].counts.card, 1);
});

test('가중치 전부 0이면 계산하지 않고 알린다', () => {
  assert.deepEqual(route(small, {}), { routes: [], sameScoreCount: 0, noWeights: true });
  assert.equal(route(small, { camp: 0, elite: 0 }).noWeights, true);
});
