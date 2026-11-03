import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { detectNodes, recognizeSet } from '../docs/core/recognize.js';

const FIX = new URL('./fixtures/', import.meta.url);
const load = (name) => { const p = PNG.sync.read(fs.readFileSync(new URL(name, FIX))); return { width: p.width, height: p.height, data: p.data }; };
const set1 = ['sample-run-1_01.png', 'sample-run-1_02.png', 'sample-run-1_03.png'].map(load);
const expected = JSON.parse(fs.readFileSync(new URL('sample-run-1.expected.json', FIX), 'utf8'));

// 프로토타입(reference/prototype.py)이 같은 스샷에서 찾은 노드 수 (잘린 열 제외 후)
test('detectNodes: 스샷별 노드 수와 종류 분포가 프로토타입과 같다', () => {
  const want = [
    { n: 20, battle: 9, event: 5, elite: 4, camp: 2, compass: 0 }, // 스샷 1
    { n: 29, battle: 6, event: 6, elite: 8, camp: 5, compass: 4 }, // 스샷 2
    { n: 20, battle: 6, event: 7, elite: 2, camp: 5, compass: 0 }, // 스샷 3
  ];
  set1.forEach((img, i) => {
    const { nodes } = detectNodes(img);
    const count = (t) => nodes.filter((n) => n.type === t).length;
    assert.equal(nodes.length, want[i].n, `스샷 ${i + 1} 노드 수`);
    for (const t of ['battle', 'event', 'elite', 'camp', 'compass']) assert.equal(count(t), want[i][t], `스샷 ${i + 1} ${t}`);
  });
});

// 정답(<세트>.expected.json)이 있는 fixture 세트는 전부 대조한다. 세트 추가 = 스샷 + expected.json 두 종류 파일만 넣으면 됨
const sets = fs.readdirSync(FIX).filter((f) => f.endsWith('.expected.json')).map((f) => f.replace('.expected.json', ''));
for (const name of sets) {
  test(`recognizeSet: ${name} → expected.json과 rows·columns·edges 완전 일치`, () => {
    const want = JSON.parse(fs.readFileSync(new URL(`${name}.expected.json`, FIX), 'utf8'));
    const files = fs.readdirSync(FIX).filter((f) => f.startsWith(`${name}_`) && f.endsWith('.png')).sort();
    assert.ok(files.length, `${name}_NN.png 없음`);
    const r = recognizeSet(files.map(load));
    assert.deepEqual(r.columns, want.columns);
    assert.deepEqual(r.edges, want.edges);
    assert.equal(r.rows, want.rows);
  });
}

// ── ⓘ 버튼 (오른쪽 위 흰 원) ──
test('detectNodes: ⓘ 버튼을 찾고 크기가 노드 폭의 0.3~0.5배', () => {
  for (const img of set1) {
    const { info, u } = detectNodes(img);
    assert.ok(info, 'ⓘ 상자');
    const w = info.x1 - info.x0;
    assert.ok(w / u > 0.3 && w / u < 0.5, `ⓘ 폭 ${(w / u).toFixed(2)}u`);
  }
});

test('pc2560-run-1: ⓘ에 가려진 뱃지 자리를 표시하고, 이어붙인 결과는 열 16개·안전 구역+상점', () => {
  const set2 = [1, 2, 3].map((i) => load(`pc2560-run-1_0${i}.png`));
  const first = detectNodes(set2[0]);
  assert.ok(first.info);
  assert.equal(first.nodes.filter((n) => n.badgeHidden).length, 1, '스샷 1에서 ⓘ에 가린 칸은 맨 오른쪽 위 안전 구역 하나');
  const r = recognizeSet(set2);
  assert.equal(r.columns.length, 16);
  assert.deepEqual(r.columns[6][0], { row: 0, type: 'camp', badge: 'card' });
  assert.deepEqual(r.meta.shots.map((s) => s.colStart), [0, 5, 10]);
});
