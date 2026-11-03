import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbaToHsv, toGray, hueMask, close, connectedComponents, tophat, countIn } from '../docs/core/image.js';

const rgba = (px) => ({ width: px.length, height: 1, data: Uint8ClampedArray.from(px.flatMap(([r, g, b]) => [r, g, b, 255])) });
const grid = (w, h, rows) => Uint8Array.from(rows.join('').split('').map(Number)); // 문자열 격자 → 0/1

test('HSV: OpenCV 규약 (H 0~179, S·V 0~255)', () => {
  const { H, S, V } = rgbaToHsv(rgba([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 0, 128], [100, 100, 100], [0, 0, 0]]));
  assert.deepEqual([...H], [0, 60, 120, 165, 0, 0]);
  assert.deepEqual([...S], [255, 255, 255, 255, 0, 0]);
  assert.deepEqual([...V], [255, 255, 255, 255, 100, 0]);
});

test('회색조: 0.299R+0.587G+0.114B', () => {
  assert.deepEqual([...toGray(rgba([[255, 255, 255], [255, 0, 0], [0, 255, 0]]))], [255, 76, 150]);
});

test('hueMask: 색상은 원형 거리, S·V는 초과 조건', () => {
  const hsv = { H: Uint8Array.from([178, 5, 20, 2]), S: Uint8Array.from([200, 200, 200, 100]), V: Uint8Array.from([200, 200, 200, 200]), width: 4, height: 1 };
  assert.deepEqual([...hueMask(hsv, { hue: 2, tol: 10, sMin: 110, vMin: 95 })], [1, 1, 0, 0]); // 178↔2 거리 4, S=100 탈락
});

test('닫힘: 1px 구멍은 메우고 커널보다 넓은 틈은 잇지 않는다', () => {
  const hole = grid(9, 9, ['000000000', '000000000', '001111100', '001111100', '001101100', '001111100', '001111100', '000000000', '000000000']);
  const c = close(hole, 9, 9, 3);
  assert.equal(c[4 * 9 + 4], 1);
  assert.equal(c.reduce((a, b) => a + b, 0), 25);
  const gap = grid(9, 1, ['111000111']); // 틈 3, 커널 3
  assert.deepEqual([...close(gap, 9, 1, 3)], [...gap]);
  const gap2 = grid(8, 1, ['11001111']); // 틈 2
  assert.deepEqual([...close(gap2, 8, 1, 3)], [1, 1, 1, 1, 1, 1, 1, 1]);
});

test('연결 요소: 박스·면적, 대각선도 연결(8-연결)', () => {
  const m = grid(6, 5, ['110000', '110000', '001000', '000000', '000011']);
  const cc = connectedComponents(m, 6, 5);
  assert.equal(cc.length, 2);
  assert.deepEqual(cc[0], { x: 0, y: 0, w: 3, h: 3, area: 5 }); // (2,2)가 대각선으로 붙음
  assert.deepEqual(cc[1], { x: 4, y: 4, w: 2, h: 1, area: 2 });
});

test('top-hat: 가는 밝은 선은 남기고 넓은 영역·배경은 지운다', () => {
  const w = 30, h = 30, g = new Uint8Array(w * h).fill(100);
  for (let x = 0; x < w; x++) g[15 * w + x] = 150;                       // 1px 선
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) g[y * w + x] = 200; // 커널(9)보다 큰 덩어리
  const t = tophat(g, w, h, 9);
  assert.equal(t[15 * w + 20], 50);   // 선
  assert.equal(t[25 * w + 20], 0);    // 배경
  assert.equal(t[5 * w + 5], 0);      // 큰 덩어리 안쪽
});

test('countIn: 이미지 밖은 잘라내고 넓이도 잘린 값', () => {
  const r = countIn(4, 4, { x0: -2, x1: 2, y0: 1, y1: 3 }, (i) => i % 2 === 0);
  assert.deepEqual(r, { count: 2, area: 4 });
});
