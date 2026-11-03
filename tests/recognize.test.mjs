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

test('recognizeSet: fixture 3장 → expected.json과 rows·columns·edges 완전 일치', () => {
  const r = recognizeSet(set1);
  assert.deepEqual(r.columns, expected.columns);
  assert.deepEqual(r.edges, expected.edges);
  assert.equal(r.rows, expected.rows);
});
