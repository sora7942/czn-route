// 화면. DOM을 만지는 유일한 파일. 계산은 core/*의 순수 모듈이 한다.
// 상태 → 화면은 한 방향: state를 고치고 renderMap()/recompute()를 부른다 (4단계 수정 UI도 state.map만 고치고 recompute()).
import { NODE_TYPES, BADGES, WEIGHT_RANGE, STORAGE_KEY } from './core/config.js';
import { route } from './core/route.js';
import { layoutMap, routeMarks } from './core/layout.js';
import { diagnose, splitWarnings } from './core/diagnose.js';

const KEYS = [...Object.keys(NODE_TYPES), ...Object.keys(BADGES)];
const info = (k) => NODE_TYPES[k] || BADGES[k];
const [WMIN, WMAX] = WEIGHT_RANGE;

const state = {
  shots: [],        // [{id, name, url, image: ImageData}] 올린 순서 = 이어붙이는 순서
  map: null,        // recognizeSet 결과
  block: null,      // diagnose() 결과: 맵을 못 쓰는 이유 {reason, todo}
  busy: false,
  error: '',
  weights: loadWeights(),
  result: null,     // route() 결과
  tab: 0,
  start: null,      // 4단계: 현재 위치 [col,row]
};

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, attrs = {}, ...kids) { return fill(document.createElement(tag), attrs, kids); }
function s(tag, attrs = {}, ...kids) { return fill(document.createElementNS(SVGNS, tag), attrs, kids); }
function fill(node, attrs, kids) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || (v === false && !k.startsWith('aria-'))) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? (k.startsWith('aria-') ? 'true' : '') : v);
  }
  node.append(...kids.flat().filter((x) => x != null));
  return node;
}

// ── 가중치 저장 (localStorage는 막혀 있을 수 있다) ──
function loadWeights() {
  const w = Object.fromEntries(KEYS.map((k) => [k, 0]));
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const k of KEYS) if (Number.isInteger(saved[k]) && saved[k] >= WMIN && saved[k] <= WMAX) w[k] = saved[k];
  } catch { /* 저장 없이 동작 */ }
  return w;
}
function saveWeights() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.weights)); } catch { /* 무시 */ } }

// ── 업로드 ──
async function decode(file) {
  const bmp = await createImageBitmap(file);
  const c = h('canvas', { width: bmp.width, height: bmp.height });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return ctx.getImageData(0, 0, c.width, c.height);
}

async function addFiles(files) {
  const bad = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) { bad.push(f.name); continue; }
    try { state.shots.push({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f), image: await decode(f) }); }
    catch { bad.push(f.name || '붙여넣은 이미지'); }
  }
  renderShots();
  recognize(bad.length ? `이미지를 읽지 못했어요: ${bad.join(', ')}` : '');
}

function moveShot(i, d) {
  const j = i + d;
  if (j < 0 || j >= state.shots.length) return;
  [state.shots[i], state.shots[j]] = [state.shots[j], state.shots[i]];
  renderShots();
  recognize();
}
function removeShot(i) {
  URL.revokeObjectURL(state.shots[i].url);
  state.shots.splice(i, 1);
  renderShots();
  recognize();
}

function renderShots() {
  $('thumbs').replaceChildren(...state.shots.map((sh, i) => h('li', {},
    h('img', { src: sh.url, alt: `스샷 ${i + 1}` }),
    h('div', { class: 'row' },
      h('span', {}, `스샷 ${i + 1}`),
      h('button', { type: 'button', 'aria-label': `스샷 ${i + 1} 앞으로`, disabled: i === 0, onclick: () => moveShot(i, -1) }, '◀'),
      h('button', { type: 'button', 'aria-label': `스샷 ${i + 1} 뒤로`, disabled: i === state.shots.length - 1, onclick: () => moveShot(i, 1) }, '▶'),
      h('button', { type: 'button', 'aria-label': `스샷 ${i + 1} 삭제`, onclick: () => removeShot(i) }, '✕')))));
}

// ── 인식 (Worker: 스샷 3장 ≈1.6초라 메인 스레드를 막지 않는다) ──
let worker = null, reqId = 0;
function recognize(notice = '') {
  worker?.terminate();
  worker = null;
  const id = ++reqId;
  state.error = notice;
  state.map = null; state.block = null;
  if (!state.shots.length) { state.busy = false; renderMap(); recompute(); return; }
  state.busy = true;
  renderMap(); recompute();
  const done = (patch) => {
    if (id !== reqId) return;
    worker?.terminate(); worker = null;
    state.busy = false;
    Object.assign(state, patch);
    state.tab = 0;
    renderMap(); recompute();
  };
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch (e) {
    return done({ error: `인식기를 시작하지 못했어요: ${e.message}. 파일을 직접 열지 말고 웹 서버(http)로 열어 주세요.` });
  }
  worker.onmessage = ({ data }) => {
    if (data.error) return done({ error: `인식 중 오류가 났어요: ${data.error}` });
    done({ map: data.map, block: diagnose(data.map, state.shots.length), error: notice });
  };
  worker.onerror = (e) => done({ error: `인식기를 불러오지 못했어요 (${e.message || '알 수 없는 오류'}). 웹 서버(http)로 열었는지 확인해 주세요.` });
  const images = state.shots.map((sh) => ({ width: sh.image.width, height: sh.image.height, data: sh.image.data.slice() }));
  worker.postMessage({ id, images }, images.map((im) => im.data.buffer));
}

// ── 맵 영역: 상태·진단·경고·다이어그램 ──
function renderMap() {
  const m = state.map;
  const has = m && m.columns.length > 0;
  $('status').textContent = state.busy ? `인식 중… (스샷 ${state.shots.length}장)`
    : state.error ? state.error
    : !state.shots.length ? '스샷을 올리면 여기에 맵이 나와요.'
    : has ? `열 ${m.columns.length}개 · 칸 ${m.columns.flat().length}개 · 연결선 ${m.edges.length}개` : '';

  const dg = $('diagnosis');
  dg.hidden = !state.block;
  if (state.block) dg.replaceChildren(h('strong', {}, state.block.reason), h('p', {}, `할 일: ${state.block.todo}`));

  const { serious, minor } = splitWarnings(m?.meta.warnings ?? []);
  const shownSerious = state.block ? serious.filter((w) => !/겹치는 열이 없음/.test(w)) : serious;
  $('serious').hidden = !shownSerious.length;
  $('serious').replaceChildren(...shownSerious.map((w) => h('li', {}, '⚠ ', w)));

  const orphans = has ? layoutMap(m).orphanCount : 0;
  const notes = [...minor, ...(orphans ? [`연결선이 끊긴 칸 ${orphans}개 (빨간 테두리) — 인식 실수일 수 있어요`] : [])];
  const d = $('minor');
  d.hidden = !notes.length;
  d.querySelector('summary').textContent = `그 밖의 경고 ${notes.length}개`;
  d.querySelector('ul').replaceChildren(...notes.map((w) => h('li', {}, w)));

  $('scroll').hidden = !has;
  $('legend').hidden = !has;
}

function renderLegend() {
  $('legend').replaceChildren(
    ...Object.entries(NODE_TYPES).map(([, t]) => h('li', {}, h('i', { class: 'dia', style: `background:${t.color}` }), `${t.glyph} ${t.name}`)),
    ...Object.entries(BADGES).map(([, b]) => h('li', {}, h('i', { class: 'dot', style: `background:${b.color}` }), `${b.name} (뱃지)`)),
    h('li', {}, h('i', { class: 'bad' }), '연결선이 끊긴 칸'));
}

function renderDiagram() {
  const svg = $('diagram'), m = state.map;
  if (!m || !m.columns.length) { svg.replaceChildren(); return; }
  const L = layoutMap(m);
  const r = state.result?.routes[state.tab];
  const { marks, edgeKeys } = r ? routeMarks(r.path, !!state.start) : { marks: [], edgeKeys: new Set() };
  const on = (e) => edgeKeys.has(`${e.col},${e.from},${e.to}`);
  const line = (e) => s('line', { class: `edge${on(e) ? ' on' : ''}`, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, 'data-col': e.col, 'data-from': e.from, 'data-to': e.to });
  const w2 = L.nodeW / 2, h2 = L.nodeH / 2;
  const node = (n) => {
    const t = NODE_TYPES[n.type], b = n.badge && BADGES[n.badge];
    return s('g', { class: `node${n.orphan ? ' orphan' : ''}`, 'data-col': n.col, 'data-row': n.row },
      s('title', {}, `C${n.col} R${n.row} — ${t.name}${b ? ` + ${b.name}` : ''}${n.orphan ? ' (연결선 끊김)' : ''}`),
      s('polygon', { points: `${n.x},${n.y - h2} ${n.x + w2},${n.y} ${n.x},${n.y + h2} ${n.x - w2},${n.y}`, fill: t.color }),
      s('text', { class: 'glyph', x: n.x, y: n.y }, t.glyph),
      b && s('circle', { class: 'badge', cx: n.x + w2 * 0.62, cy: n.y - h2 * 1.05, r: 8, fill: b.color }));
  };
  const at = (c, rw) => L.nodes.find((n) => n.col === c && n.row === rw);
  const mark = ({ col, row, n }) => {
    const p = at(col, row);
    return p && s('g', { class: 'mark' }, s('circle', { cx: p.x - w2 * 0.62, cy: p.y - h2 * 1.05, r: 10 }), s('text', { x: p.x - w2 * 0.62, y: p.y - h2 * 1.05 }, n === 0 ? '출' : n));
  };
  svg.setAttribute('width', L.width);
  svg.setAttribute('height', L.height);
  svg.setAttribute('viewBox', `0 0 ${L.width} ${L.height}`);
  svg.setAttribute('aria-label', `맵 ${m.columns.length}열 × ${m.rows}행`);
  svg.replaceChildren(
    ...L.colLabels.map((c) => s('text', { x: c.x, y: c.y }, `C${c.col}`)),
    ...L.rowLabels.map((rw) => s('text', { x: rw.x, y: rw.y }, `R${rw.row}`)),
    ...L.edges.filter((e) => !on(e)).map(line),
    ...L.edges.filter(on).map(line),
    ...L.nodes.map(node),
    ...marks.map(mark));
}

// ── 가중치·루트 ──
function buildWeights() {
  $('weights').replaceChildren(...KEYS.map((k) => {
    const t = info(k);
    const out = h('output', { id: `wo-${k}`, for: `w-${k}` }, '0');
    const sw = h('span', { class: `sw ${NODE_TYPES[k] ? '' : 'dot'}`, style: `background:${t.color};${NODE_TYPES[k] ? 'transform:rotate(45deg) scale(.8)' : 'border-radius:50%'}` });
    return h('div', { class: 'w' },
      h('label', { for: `w-${k}` }, sw, t.name),
      h('input', { id: `w-${k}`, type: 'range', min: WMIN, max: WMAX, step: 1, value: 0, oninput: (e) => setWeight(k, +e.target.value) }),
      out);
  }));
  $('presets').replaceChildren(
    ...KEYS.map((k) => h('button', { type: 'button', onclick: () => setPreset(k) }, `${info(k).name} 최다`)),
    h('button', { type: 'button', onclick: () => setPreset(null) }, '초기화'));
  syncWeights();
}
function syncWeights() {
  for (const k of KEYS) {
    $(`w-${k}`).value = state.weights[k];
    $(`wo-${k}`).textContent = state.weights[k] > 0 ? `+${state.weights[k]}` : state.weights[k];
  }
}
function setWeight(k, v) { state.weights[k] = v; saveWeights(); syncWeights(); recompute(); }
function setPreset(key) {
  for (const k of KEYS) state.weights[k] = k === key ? 1 : 0;
  saveWeights(); syncWeights(); recompute();
}

function recompute() {
  state.result = state.map && !state.block && state.map.columns.length ? route(state.map, state.weights, { start: state.start }) : null;
  state.tab = Math.min(state.tab, Math.max((state.result?.routes.length ?? 1) - 1, 0));
  renderDiagram();
  renderRoutes();
}

function renderRoutes() {
  const r = state.result, tabs = $('tabs'), body = $('routeInfo');
  const msg = (t) => { tabs.replaceChildren(); body.replaceChildren(h('p', { class: 'tie' }, t)); };
  if (state.busy) return msg('인식이 끝나면 루트를 계산해요.');
  if (!state.map) return msg('스샷을 올리면 루트를 계산해요.');
  if (state.block) return msg('맵을 인식하지 못해 루트를 계산하지 않았어요. 위의 안내를 확인해 주세요.');
  if (r.noWeights) return msg('가중치를 하나 이상 0이 아니게 정해 주세요. (프리셋 버튼을 눌러도 돼요)');
  if (!r.routes.length) return msg('처음부터 끝까지 이어지는 루트가 없어요. 연결선 인식을 확인해 주세요.');
  tabs.replaceChildren(...r.routes.map((x, i) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': i === state.tab, onclick: () => { state.tab = i; renderDiagram(); renderRoutes(); },
  }, `루트 ${i + 1} · ${x.score}점`)));
  const cur = r.routes[state.tab];
  body.replaceChildren(
    h('p', {}, h('strong', {}, `${cur.score}점`)),
    h('p', { class: 'sum' }, ...KEYS.filter((k) => cur.counts[k]).map((k) => h('span', {}, `${info(k).name} ${cur.counts[k]}`))),
    r.sameScoreCount > r.routes.length ? h('p', { class: 'tie' }, `같은 점수 루트 ${r.sameScoreCount}개`) : null);
}

// ── 이벤트 ──
const drop = $('drop');
$('file').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); addFiles(files); }
});
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
// 영역 밖에 떨어뜨려도 브라우저가 이미지를 열어버리지 않게
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

buildWeights();
renderLegend();
renderShots();
renderMap();
recompute();
