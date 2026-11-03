import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { layoutMap, routeMarks } from '../docs/core/layout.js';
import { diagnose, splitWarnings } from '../docs/core/diagnose.js';
import { recognizeSet } from '../docs/core/recognize.js';
import { route } from '../docs/core/route.js';

const FIX = new URL('./fixtures/', import.meta.url);
const expected = JSON.parse(fs.readFileSync(new URL('sample-run-1.expected.json', FIX), 'utf8'));
const load = (i) => { const p = PNG.sync.read(fs.readFileSync(new URL(`sample-run-1_0${i}.png`, FIX))); return { width: p.width, height: p.height, data: p.data }; };
const n = (row, type = 'battle') => ({ row, type, badge: null });

test('layout: 노드·선 개수와 열·행 간격, fixture에 고아 노드 없음', () => {
  const L = layoutMap(expected);
  assert.equal(L.nodes.length, expected.columns.flat().length);
  assert.equal(L.edges.length, expected.edges.length);
  assert.equal(L.orphanCount, 0);
  assert.equal(L.colLabels.length, 16);
  assert.equal(L.rowLabels.length, 5);
  const a = L.nodes.find((x) => x.col === 0 && x.row === 0), b = L.nodes.find((x) => x.col === 1 && x.row === 0);
  assert.ok(b.x > a.x + L.nodeW);                       // 열 사이에 선이 보일 틈
  assert.ok(L.nodes.every((x) => x.x < L.width && x.y < L.height));
});

test('layout: 들어오는/나가는 선이 없는 노드는 orphan (첫·마지막 열은 한쪽만 본다)', () => {
  const m = { rows: 2, columns: [[n(0), n(1)], [n(0), n(1)], [n(0)]], edges: [[0, 0, 0], [0, 1, 0], [1, 0, 0]] };
  const o = layoutMap(m).nodes.filter((x) => x.orphan).map((x) => [x.col, x.row]);
  assert.deepEqual(o, [[1, 1]]);   // 가운데 열 행1: 들어오는 선 없음·나가는 선 없음
});

test('routeMarks: 순서 번호와 굵은 선, start는 번호 0', () => {
  const path = [[0, 1], [1, 1], [2, 0]];
  const a = routeMarks(path);
  assert.deepEqual(a.marks.map((m) => m.n), [1, 2, 3]);
  assert.deepEqual([...a.edgeKeys], ['0,1,1', '1,1,0']);
  assert.deepEqual(routeMarks(path, true).marks.map((m) => m.n), [0, 1, 2]);
});

test('splitWarnings·diagnose: fixture 3장 → 겹침 불확실만 serious, 맵은 사용 가능', () => {
  const map = recognizeSet([1, 2, 3].map(load));
  assert.equal(diagnose(map, 3), null);
  const { serious, minor } = splitWarnings(map.meta.warnings);
  assert.equal(serious.length, 1);
  assert.match(serious[0], /겹침 불확실/);
  assert.equal(minor.length, 0);
});

test('diagnose: 순서가 뒤바뀐 스샷 → 이어붙이기 실패, 이유와 할 일', () => {
  const map = recognizeSet([load(3), load(1)]);
  const d = diagnose(map, 2);
  assert.match(d.reason, /스샷 2/);
  assert.match(d.todo, /2열 이상 겹치게/);
  assert.equal(splitWarnings(map.meta.warnings).serious.length, 1);
});

test('diagnose: 맵이 아닌 이미지 → 맵을 찾지 못함', () => {
  const blank = recognizeSet([{ width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4) }]);
  const d = diagnose(blank, 1);
  assert.match(d.reason, /맵을 찾지 못했어요/);
  assert.match(d.todo, /카오스 맵 화면인지 확인/);
  assert.equal(route(blank, { camp: 1 }).routes.length, 0);   // 빈 맵이어도 route는 죽지 않는다
});

test('diagnose: 열 1개, 경고 등급 분류', () => {
  assert.match(diagnose({ columns: [[n(0)]], edges: [], meta: { warnings: [] } }, 1).reason, /1개만/);
  const w = ['스샷 2: 겹침 불확실 (겹친 열 1개)', '행 간격 100px가 노드 크기로 예측한 80px와 다름 (x)', '스샷 2: 겹친 열 3의 행 1 뱃지가 스샷마다 다름', 'y=300px 노드가 행 격자에서 벗어남'];
  const { serious, minor } = splitWarnings(w);
  assert.equal(serious.length, 2);
  assert.equal(minor.length, 2);
});
