import test from 'node:test';
import assert from 'node:assert/strict';
import { assignRows, groupColumns, stitch } from '../docs/core/stitch.js';

const U = 136;                       // 합성 입력용 노드 폭
const P = 162, TOP = 225;            // 행 간격, 행 0 y (샘플 값, 테스트 입력 생성용)
const col = (...cells) => cells.map(([row, type, badge = null]) => ({ row, type, badge }));

test('assignRows: 스샷 1처럼 가운데 행이 비어도 간격으로 행 번호를 채운다', () => {
  const ys = [0, 1, 3, 4, 0, 1, 3, 4].map((r) => TOP + P * r + (r % 2 ? 2 : -3)); // 흔들림 포함
  const a = assignRows(ys, U);
  assert.deepEqual(ys.map(a.rowOf), [0, 1, 3, 4, 0, 1, 3, 4]);
  assert.equal(a.rows, 5);
  assert.equal(a.warnings.length, 0);
  assert.ok(Math.abs(a.grid.pitch - P) < 3);
});

test('assignRows: 세트에 모든 행이 있으면 스샷마다 빈 행이 달라도 같은 번호', () => {
  const shot1 = [0, 1, 3, 4].map((r) => TOP + P * r), shot2 = [0, 1, 2, 3, 4].map((r) => TOP + P * r);
  const a = assignRows([...shot1, ...shot2], U);
  assert.deepEqual(shot1.map(a.rowOf), [0, 1, 3, 4]);
  assert.deepEqual(shot2.map(a.rowOf), [0, 1, 2, 3, 4]);
});

test('assignRows: 행 격자에서 어긋난 y는 추측하지 않고 경고', () => {
  const ys = [0, 1, 2, 3].map((r) => TOP + P * r).concat([TOP + P * 1.5]);
  assert.ok(assignRows(ys, U).warnings.length > 0);
});

test('assignRows: 최소 간격이 노드 크기 예측과 크게 다르면 경고 (행 0·2만 있는 세트)', () => {
  const a = assignRows([TOP, TOP, TOP + 2 * P, TOP + 2 * P], U);
  assert.ok(a.warnings.some((w) => w.includes('행 간격')));
});

test('groupColumns: 열 묶기, 빈 열이면 경고', () => {
  const mk = (xs) => xs.map((x) => ({ x, y: 0 }));
  const ok = groupColumns(mk([100, 102, 346, 344, 592]), U);
  assert.deepEqual(ok.columns.map((c) => c.nodes.length), [2, 2, 1]);
  assert.equal(ok.warnings.length, 0);
  const gap = groupColumns(mk([100, 100 + 2 * 246]), U);
  assert.ok(gap.warnings.some((w) => w.includes('빈 열')));
});

// 3열짜리 두 스샷, 마지막/첫 열 1개 겹침
const A = { columns: [col([0, 'battle'], [1, 'event']), col([0, 'elite'], [2, 'camp']), col([1, 'battle'])], edges: [[0, 0, 0], [0, 1, 2], [1, 0, 1]] };
const B = { columns: [col([1, 'battle']), col([0, 'event'], [1, 'elite']), col([2, 'camp'])], edges: [[0, 1, 0], [0, 1, 1], [1, 1, 2]] };

test('stitch: k=1 겹침을 이어붙이고 간선을 합친다 (정렬·중복 제거)', () => {
  const r = stitch([A, B]);
  assert.equal(r.columns.length, 5);
  assert.deepEqual(r.edges, [[0, 0, 0], [0, 1, 2], [1, 0, 1], [2, 1, 0], [2, 1, 1], [3, 1, 2]]);
  assert.equal(r.rows, 3);
});

test('stitch: 겹침이 1열이고 잘린 열 근거가 없으면 "겹침 불확실" 경고', () => {
  assert.ok(stitch([A, B]).warnings.some((w) => w.includes('겹침 불확실')));
});

test('stitch: 잘린 열이 맞으면 경고를 내린다', () => {
  const a = { ...A, clippedRight: [{ row: 0, type: 'event' }, { row: 1, type: 'elite' }] };   // = B의 겹침 다음 열
  const b = { ...B, clippedLeft: [{ row: 0, type: 'elite' }, { row: 2, type: 'camp' }] };      // = A의 겹침 앞 열
  assert.equal(stitch([a, b]).warnings.length, 0);
  // camp/compass는 같은 계열로 비교
  const b2 = { ...B, clippedLeft: [{ row: 0, type: 'elite' }, { row: 2, type: 'compass' }] };
  assert.equal(stitch([a, b2]).warnings.length, 0);
});

test('stitch: 잘린 열에서 어두운 노드가 빠져도(부분집합) 맞는 것으로 본다', () => {
  const a = { ...A, clippedRight: [{ row: 1, type: 'elite' }] }; // B의 겹침 다음 열은 행 0·1
  assert.equal(stitch([a, B]).warnings.length, 0);
});

test('stitch: 잘린 열이 한쪽이라도 맞지 않으면 경고 유지', () => {
  const a = { ...A, clippedRight: [{ row: 0, type: 'event' }, { row: 1, type: 'elite' }] };
  const bad = { ...B, clippedLeft: [{ row: 0, type: 'battle' }] };
  const w = stitch([a, bad]).warnings;
  assert.ok(w.some((x) => x.includes('겹침 불확실') && x.includes('맞지 않음')));
});

test('stitch: 겹치는 열이 없으면 경고', () => {
  const C = { columns: [col([0, 'compass'])], edges: [] };
  const r = stitch([A, C]);
  assert.equal(r.columns.length, 4);
  assert.ok(r.warnings.some((w) => w.includes('겹치는 열이 없음')));
});

test('stitch: 가장 긴 겹침(k=2)을 고르고, 2열 이상이면 근거 없이도 경고 없음', () => {
  const X = { columns: [col([0, 'battle']), col([0, 'event']), col([0, 'elite'])], edges: [[0, 0, 0], [1, 0, 0]] };
  const Y = { columns: [col([0, 'event']), col([0, 'elite']), col([0, 'camp'])], edges: [[0, 0, 0], [1, 0, 0]] };
  const r = stitch([X, Y]);
  assert.equal(r.columns.length, 4);
  assert.deepEqual(r.edges, [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.equal(r.warnings.length, 0);
});

test('stitch: 겹친 열의 뱃지가 스샷마다 다르면 경고', () => {
  const b = { ...B, columns: [col([1, 'battle', 'flame']), ...B.columns.slice(1)] };
  assert.ok(stitch([A, b]).warnings.some((w) => w.includes('뱃지')));
});
