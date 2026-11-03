// 화면. DOM을 만지는 유일한 파일. 계산은 core/*의 순수 모듈이 한다.
// 상태 → 화면은 한 방향: state를 고치고 renderMap()/recompute()를 부른다 (4단계 수정 UI도 state.map만 고치고 recompute()).
import { NODE_TYPES, BADGES, WEIGHT_RANGE, STORAGE_KEY, EDIT_HISTORY_MAX, EXPORT_NAME } from './core/config.js';
import { route } from './core/route.js';
import { layoutMap, routeMarks } from './core/layout.js';
import { diagnose, splitWarnings } from './core/diagnose.js';
import { setNode, addNode, removeNode, toggleEdge, exportMap } from './core/edit.js';

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
  start: null,      // 현재 위치 [col,row] — 있으면 루트는 그 칸부터 (그 칸은 점수 제외)
  mode: 'view',     // 'view' | 'node'(칸 수정) | 'edge'(선 수정) | 'start'(현재 위치)
  sel: null,        // 선택한 칸/빈 자리 [col,row]
  history: [],      // 수정 전 map들 (되돌리기). 비어 있지 않으면 "수정함" = 재인식 때 사라진다
  msg: '',          // 수정 결과 안내 한 줄
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

// 스샷을 바꾸면 다시 인식돼서 수정 내용이 사라진다 → 수정했으면 먼저 묻는다
function confirmDiscard() {
  return !state.history.length || confirm('수정한 내용이 사라져요. 계속할까요?\n(먼저 "내보내기"로 저장할 수 있어요)');
}

async function addFiles(files) {
  if (!confirmDiscard()) return;
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
  if (j < 0 || j >= state.shots.length || !confirmDiscard()) return;
  [state.shots[i], state.shots[j]] = [state.shots[j], state.shots[i]];
  renderShots();
  recognize();
}
function removeShot(i) {
  if (!confirmDiscard()) return;
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
  Object.assign(state, { history: [], sel: null, start: null, msg: '' });
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
  const editing = state.mode !== 'view';
  const r = state.result?.routes[state.tab];
  const { marks, edgeKeys } = r ? routeMarks(r.path, !!state.start) : { marks: [], edgeKeys: new Set() };
  const on = (e) => edgeKeys.has(`${e.col},${e.from},${e.to}`);
  const line = (e) => s('line', { class: `edge${on(e) ? ' on' : ''}`, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, 'data-col': e.col, 'data-from': e.from, 'data-to': e.to });
  const w2 = L.nodeW / 2, h2 = L.nodeH / 2;
  const diamond = (x, y) => `${x},${y - h2} ${x + w2},${y} ${x},${y + h2} ${x - w2},${y}`;
  // 수정 모드의 탭 영역: 마름모보다 큰 투명 사각형 (최소 DIAGRAM.tapMin). 다이어그램은 1:1로 그려서 SVG 단위 = 화면 px
  const hit = (x, y) => s('rect', { class: 'hit', x: x - L.hitW / 2, y: y - L.hitH / 2, width: L.hitW, height: L.hitH });
  const isSel = (c, rw) => state.sel && state.sel[0] === c && state.sel[1] === rw;
  const node = (n) => {
    const t = NODE_TYPES[n.type], b = n.badge && BADGES[n.badge];
    const cls = ['node', n.orphan && 'orphan', isSel(n.col, n.row) && 'sel', state.start && state.start[0] === n.col && state.start[1] === n.row && 'start'].filter(Boolean).join(' ');
    return s('g', { class: cls, 'data-col': n.col, 'data-row': n.row },
      s('title', {}, `C${n.col} R${n.row} — ${t.name}${b ? ` + ${b.name}` : ''}${n.orphan ? ' (연결선 끊김)' : ''}`),
      s('polygon', { points: diamond(n.x, n.y), fill: t.color }),
      s('text', { class: 'glyph', x: n.x, y: n.y }, t.glyph),
      b && s('circle', { class: 'badge', cx: n.x + w2 * 0.62, cy: n.y - h2 * 1.05, r: 8, fill: b.color }),
      editing && hit(n.x, n.y));
  };
  const slot = (p) => s('g', { class: `slot${isSel(p.col, p.row) ? ' sel' : ''}`, 'data-col': p.col, 'data-row': p.row, 'data-empty': '' },
    s('title', {}, `C${p.col} R${p.row} 빈 자리`),
    s('polygon', { points: diamond(p.x, p.y) }), hit(p.x, p.y));
  const at = (c, rw) => L.nodes.find((n) => n.col === c && n.row === rw);
  const mark = ({ col, row, n }) => {
    const p = at(col, row);
    return p && s('g', { class: 'mark' }, s('circle', { cx: p.x - w2 * 0.62, cy: p.y - h2 * 1.05, r: 10 }), s('text', { x: p.x - w2 * 0.62, y: p.y - h2 * 1.05 }, n === 0 ? '출' : n));
  };
  svg.setAttribute('width', L.width);
  svg.setAttribute('height', L.height);
  svg.setAttribute('viewBox', `0 0 ${L.width} ${L.height}`);
  svg.setAttribute('class', `mode-${state.mode}`);
  svg.setAttribute('aria-label', `맵 ${m.columns.length}열 × ${m.rows}행`);
  svg.replaceChildren(
    ...L.colLabels.map((c) => s('text', { x: c.x, y: c.y }, `C${c.col}`)),
    ...L.rowLabels.map((rw) => s('text', { x: rw.x, y: rw.y }, `R${rw.row}`)),
    ...L.edges.filter((e) => !on(e)).map(line),
    ...L.edges.filter(on).map(line),
    ...(state.mode === 'node' ? L.emptySlots.map(slot) : []),
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
  if (state.start && !state.map?.columns[state.start[0]]?.some((n) => n.row === state.start[1])) state.start = null;   // route()는 없는 start에 throw
  state.result = state.map && !state.block && state.map.columns.length ? route(state.map, state.weights, { start: state.start }) : null;
  state.tab = Math.min(state.tab, Math.max((state.result?.routes.length ?? 1) - 1, 0));
  renderDiagram();
  renderRoutes();
  renderEditor();
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

// ── 수정 (칸 수정 / 선 수정 / 현재 위치) ──
const MODES = [['view', '보기'], ['node', '칸 수정'], ['edge', '선 수정'], ['start', '현재 위치']];
const HINTS = {
  view: '맵과 루트를 봐요. 인식을 고치려면 위에서 모드를 골라 주세요.',
  node: '칸을 눌러 종류·뱃지를 바꾸거나 삭제해요. 점선 빈 자리를 누르면 칸을 추가해요.',
  edge: '칸 A를 누르고, 이웃한 열의 칸 B를 누르면 선을 추가·삭제해요.',
  start: '지금 서 있는 칸을 누르면 그 칸부터 루트를 계산해요. 다시 누르면 해제돼요.',
};
const nodeAt = (c, r) => state.map?.columns[c]?.find((n) => n.row === r);
const tag = ([c, r]) => `C${c} R${r}`;

function setMode(mode) { state.mode = mode; state.sel = null; state.msg = ''; renderDiagram(); renderEditor(); }

// 모든 수정은 여기를 지난다: 되돌리기에 쌓고 → 맵 교체 → 경고·루트·다이어그램 즉시 갱신
function applyEdit(map, msg = '') {
  state.history.push(state.map);
  if (state.history.length > EDIT_HISTORY_MAX) state.history.shift();
  commitMap(map, msg);
}
function commitMap(map, msg) {
  state.map = map;
  state.block = diagnose(map, state.shots.length);
  if (state.mode === 'edge' && state.sel && !nodeAt(...state.sel)) state.sel = null;
  state.msg = msg;
  renderMap();
  recompute();
}
function undo() {
  if (!state.history.length) return;
  commitMap(state.history.pop(), '되돌렸어요.');
}

function onTap(col, row, empty) {
  const here = [col, row], same = state.sel && state.sel[0] === col && state.sel[1] === row;
  if (state.mode === 'start') {
    state.start = state.start && state.start[0] === col && state.start[1] === row ? null : here;
    state.msg = state.start ? `${tag(here)}부터 루트를 계산해요. (그 칸은 점수에서 빠져요)` : '현재 위치를 해제했어요.';
    return recompute();
  }
  if (state.mode === 'node') {
    state.sel = same ? null : here;
    state.msg = '';
    renderDiagram(); return renderEditor();
  }
  if (state.mode === 'edge') {
    if (empty) return;
    if (!state.sel) { state.sel = here; state.msg = `${tag(here)} 선택됨 — 이웃한 열(${[col - 1, col + 1].filter((c) => state.map.columns[c]).map((c) => `C${c}`).join('·')})의 칸을 눌러 주세요. 다시 누르면 취소돼요.`; renderDiagram(); return renderEditor(); }
    if (same) { state.sel = null; state.msg = ''; renderDiagram(); return renderEditor(); }
    const r = toggleEdge(state.map, state.sel, here);
    if (r.error) { state.msg = `${tag(here)}는 이웃한 열이 아니에요. ${tag(state.sel)} 바로 앞·뒤 열의 칸을 눌러 주세요.`; return renderEditor(); }
    const from = state.sel;
    state.sel = null;
    applyEdit(r.map, `선 ${r.added ? '추가' : '삭제'}: ${tag(from)} ↔ ${tag(here)}`);
  }
}

function renderEditor() {
  const has = !!state.map?.columns.length;
  $('tools').hidden = !has;
  if (!has) return;
  const edited = state.history.length > 0;
  $('modes').replaceChildren(...MODES.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': state.mode === k, onclick: () => setMode(k) }, label)));
  $('undo').textContent = `되돌리기 (${state.history.length})`;
  $('undo').disabled = !edited;
  $('editHint').textContent = HINTS[state.mode];
  $('editMsg').textContent = state.msg;
  const warn = $('editWarn');
  warn.hidden = !(edited || state.mode === 'node' || state.mode === 'edge');
  warn.classList.toggle('on', edited);
  warn.textContent = edited
    ? `⚠ 수정 ${state.history.length}번 반영 중 — 스샷을 추가·삭제·순서 변경하면 다시 인식돼서 수정이 사라져요. 먼저 "내보내기"로 저장하세요.`
    : '수정은 지금 인식 결과에만 적용돼요. 스샷을 추가·삭제·순서 변경하면 다시 인식돼서 수정이 사라져요.';
  renderNodePanel();
}

function renderNodePanel() {
  const box = $('editor'), sel = state.mode === 'node' ? state.sel : null;
  box.hidden = !sel;
  if (!sel) { box.replaceChildren(); return; }
  const [c, r] = sel, n = nodeAt(c, r);
  const typeBtns = (onPick, cur) => Object.entries(NODE_TYPES).map(([k, t]) =>
    h('button', { type: 'button', 'aria-pressed': cur === k, onclick: () => onPick(k) }, h('i', { class: 'dia', style: `background:${t.color}` }), t.name));
  if (!n) {   // 빈 자리 → 종류를 누르면 그 종류로 칸 추가
    box.replaceChildren(h('strong', {}, `${tag(sel)} 빈 자리`), h('p', {}, '종류를 누르면 칸이 추가돼요.'),
      h('div', { class: 'opts' }, ...typeBtns((k) => applyEdit(addNode(state.map, c, r, { type: k }), `${tag(sel)}에 추가: ${NODE_TYPES[k].name}`), null)));
    return;
  }
  const badgeBtn = (key, label) => h('button', { type: 'button', 'aria-pressed': (n.badge ?? null) === key, onclick: () => applyEdit(setNode(state.map, c, r, { badge: key }), `${tag(sel)} 뱃지: ${label}`) }, label);
  box.replaceChildren(h('strong', {}, `${tag(sel)} · ${NODE_TYPES[n.type].name}`),
    h('p', {}, '종류'),
    h('div', { class: 'opts' }, ...typeBtns((k) => k !== n.type && applyEdit(setNode(state.map, c, r, { type: k }), `${tag(sel)} 종류 변경: ${NODE_TYPES[k].name}`), n.type)),
    h('p', {}, '뱃지'),
    h('div', { class: 'opts' }, badgeBtn(null, '없음'), ...Object.entries(BADGES).map(([k, b]) => badgeBtn(k, b.name))),
    h('div', { class: 'opts' }, h('button', { type: 'button', class: 'danger', onclick: () => { state.sel = null; applyEdit(removeNode(state.map, c, r), `${tag(sel)} 삭제`); } }, '칸 삭제')));
}

// 수정 반영한 현재 맵 → expected.json과 같은 형식으로 다운로드 (5단계 새 fixture 정답용)
function exportJson() {
  if (!state.map?.columns.length) return;
  const note = `czn-route 내보내기 ${new Date().toISOString().slice(0, 10)} (스샷 ${state.shots.length}장${state.history.length ? `, 수정 ${state.history.length}번 반영` : ', 수정 없음'})`;
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(exportMap(state.map, note), null, 1)}\n`], { type: 'application/json' }));
  const a = h('a', { href: url, download: EXPORT_NAME });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 이벤트 ──
const drop = $('drop');
$('diagram').addEventListener('click', (e) => {
  const g = e.target.closest('[data-row]');   // 선(line)에는 data-row가 없다
  if (g && state.mode !== 'view' && state.map) onTap(+g.dataset.col, +g.dataset.row, g.hasAttribute('data-empty'));
});
$('undo').addEventListener('click', undo);
$('export').addEventListener('click', exportJson);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); undo(); }
});
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
