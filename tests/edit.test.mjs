import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { setNode, addNode, removeNode, toggleEdge, exportMap } from '../docs/core/edit.js';
import { recognizeSet } from '../docs/core/recognize.js';
import { route } from '../docs/core/route.js';

const FIX = new URL('./fixtures/', import.meta.url);
const expected = JSON.parse(fs.readFileSync(new URL('sample-run-1.expected.json', FIX), 'utf8'));
const load = (i) => { const p = PNG.sync.read(fs.readFileSync(new URL(`sample-run-1_0${i}.png`, FIX))); return { width: p.width, height: p.height, data: p.data }; };
const core = (m) => ({ rows: m.rows, columns: m.columns, edges: m.edges });
const n = (row, type = 'battle', badge = null) => ({ row, type, badge });
// col0: r0 battle, r1 camp / col1: r0 event, r1 elite / col2: r0 battle
const small = () => ({ rows: 3, columns: [[n(0), n(1, 'camp')], [n(0, 'event'), n(1, 'elite')], [n(0)]], edges: [[0, 0, 0], [0, 1, 1], [1, 0, 0], [1, 1, 0]], meta: { warnings: ['x'] } });

test('export: 수정 없이 내보내면 expected.json과 같다 (fixture 3장 인식 결과 / expected 자체)', () => {
  const recognized = exportMap(recognizeSet([1, 2, 3].map(load)));
  assert.deepEqual(core(recognized), core(expected));
  assert.deepEqual(core(exportMap(expected)), core(expected));
  assert.ok(!('meta' in recognized) && !('expected_best' in recognized));
});

test('setNode: 종류·뱃지 변경, 원본 불변, 잘못된 값은 throw', () => {
  const m = small(), r = setNode(m, 0, 1, { type: 'elite', badge: 'flame' });
  assert.deepEqual(r.columns[0][1], { row: 1, type: 'elite', badge: 'flame' });
  assert.equal(m.columns[0][1].type, 'camp');
  assert.deepEqual(r.meta, m.meta);
  assert.equal(setNode(r, 0, 1, { badge: null }).columns[0][1].badge, null);
  assert.throws(() => setNode(m, 0, 1, { type: 'nope' }));
  assert.throws(() => setNode(m, 0, 2, { type: 'camp' }), /칸 없음/);
});

test('addNode: 행 정렬 삽입, 중복·범위 밖은 throw', () => {
  const r = addNode(small(), 2, 2, { type: 'camp', badge: 'card' });
  assert.deepEqual(r.columns[2].map((x) => x.row), [0, 2]);
  assert.throws(() => addNode(small(), 0, 0, { type: 'camp' }), /이미 칸/);
  assert.throws(() => addNode(small(), 0, 3, { type: 'camp' }), /범위 밖/);
  assert.throws(() => addNode(small(), 0, 2, {}), /종류/);
});

test('removeNode: 들어오는·나가는 선도 지운다, 열 번호는 유지', () => {
  const r = removeNode(small(), 1, 0);
  assert.deepEqual(r.edges, [[0, 1, 1], [1, 1, 0]]);
  assert.equal(r.columns.length, 3);
  assert.equal(removeNode(small(), 2, 0).columns[2].length, 0);   // 열이 비어도 남는다
  assert.throws(() => removeNode(small(), 2, 2), /칸 없음/);
});

test('toggleEdge: 추가·삭제 토글, 방향 무관, 비이웃·없는 칸은 error', () => {
  const a = toggleEdge(small(), [1, 1], [0, 0]);   // 큰 열에서 작은 열로 눌러도 from=낮은 열
  assert.equal(a.added, true);
  assert.deepEqual(a.map.edges, [[0, 0, 0], [0, 0, 1], [0, 1, 1], [1, 0, 0], [1, 1, 0]]);
  const b = toggleEdge(a.map, [0, 0], [1, 1]);
  assert.equal(b.added, false);
  assert.deepEqual(b.map.edges, small().edges);
  assert.equal(toggleEdge(small(), [0, 0], [2, 0]).error, 'not-adjacent');
  assert.equal(toggleEdge(small(), [0, 0], [0, 1]).error, 'not-adjacent');
  assert.equal(toggleEdge(small(), [0, 0], [1, 2]).error, 'no-node');
});

test('수정이 루트에 반영된다 (fixture: 종류 변경·칸 삭제·선 추가·start)', () => {
  const w = { camp: 1 };
  const base = route(expected, w).routes[0];
  assert.equal(base.score, 6);
  // 최고 경로의 camp 하나를 battle로 바꾸면 점수가 5 이하로 떨어진다
  const [c, r] = base.path.find(([cc, rr]) => expected.columns[cc].find((x) => x.row === rr).type === 'camp');
  assert.ok(route(setNode(expected, c, r, { type: 'battle' }), w).routes[0].score <= 5);
  // 그 칸을 지우면 그 칸을 지나는 경로는 사라진다
  const del = route(removeNode(expected, c, r), w);
  assert.ok(del.routes.every((x) => !x.path.some(([cc, rr]) => cc === c && rr === r)));
  // 선 추가: C0 R0 → C1 R3 (battle→battle)가 새로 생긴다
  assert.ok(toggleEdge(expected, [0, 0], [1, 3]).added);
  // start 지정: 그 칸부터, 그 칸은 점수·counts에서 제외
  const s = route(expected, w, { start: [c, r] }).routes[0];
  assert.deepEqual(s.path[0], [c, r]);
  assert.ok(s.score <= base.score);
});
