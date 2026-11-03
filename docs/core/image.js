// 순수 픽셀 연산. DOM·window 의존 없음. 이미지는 {data: RGBA 바이트 배열, width, height}.
// 마스크는 0/1 Uint8Array, 회색조·HSV 채널은 Uint8Array (행 우선, 길이 width*height).

// RGBA → HSV. OpenCV 8비트 규약: H 0~179, S·V 0~255
export function rgbaToHsv({ data, width, height }) {
  const n = width * height;
  const H = new Uint8Array(n), S = new Uint8Array(n), V = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    V[i] = mx;
    if (mx === 0 || d === 0) continue; // S=0, H=0
    S[i] = Math.round((255 * d) / mx);
    let h;
    if (mx === r) h = (60 * (g - b)) / d;
    else if (mx === g) h = 120 + (60 * (b - r)) / d;
    else h = 240 + (60 * (r - g)) / d;
    if (h < 0) h += 360;
    H[i] = Math.round(h / 2) % 180;
  }
  return { H, S, V, width, height };
}

// OpenCV cvtColor BGR2GRAY와 같은 가중치
export function toGray({ data, width, height }) {
  const n = width * height, g = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
  }
  return g;
}

export const hueDist = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 180 - d); };

// 색상 거리 < tol, S > sMin, V > vMin 인 픽셀 = 1. y0 ≤ y < y1 바깥은 0 (UI 영역 제외용)
export function hueMask(hsv, { hue, tol, sMin, vMin, y0 = 0, y1 = hsv.height }) {
  const { H, S, V, width, height } = hsv;
  const m = new Uint8Array(width * height);
  const ya = Math.max(0, Math.ceil(y0)), yb = Math.min(height, Math.ceil(y1));
  for (let y = ya; y < yb; y++) {
    for (let x = 0, i = y * width; x < width; x++, i++) {
      if (S[i] > sMin && V[i] > vMin && hueDist(H[i], hue) < tol) m[i] = 1;
    }
  }
  return m;
}

// k×k 정사각 최소/최대 필터. 정사각이라 가로·세로로 나눠 O(n·k). 이미지 밖은 무시
// (OpenCV 기본 경계값과 같아서 가장자리에서 침식이 먹히지 않는다)
function rank(src, w, h, k, isMax) {
  const r = (k - 1) >> 1;
  const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - r), b = Math.min(w - 1, x + r);
      let v = src[row + a];
      if (isMax) { for (let i = a + 1; i <= b && v < 255; i++) if (src[row + i] > v) v = src[row + i]; }
      else { for (let i = a + 1; i <= b && v > 0; i++) if (src[row + i] < v) v = src[row + i]; }
      tmp[row + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    const a = Math.max(0, y - r), b = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let v = tmp[a * w + x];
      if (isMax) { for (let j = a + 1; j <= b && v < 255; j++) if (tmp[j * w + x] > v) v = tmp[j * w + x]; }
      else { for (let j = a + 1; j <= b && v > 0; j++) if (tmp[j * w + x] < v) v = tmp[j * w + x]; }
      out[y * w + x] = v;
    }
  }
  return out;
}
export const dilate = (src, w, h, k) => rank(src, w, h, k, true);
export const erode = (src, w, h, k) => rank(src, w, h, k, false);
export const close = (src, w, h, k) => erode(dilate(src, w, h, k), w, h, k);
export const open = (src, w, h, k) => dilate(erode(src, w, h, k), w, h, k);

// 회색조 top-hat: 원본 − 열림. 주변보다 밝고 커널보다 가는 선만 남긴다
export function tophat(gray, w, h, k) {
  const o = open(gray, w, h, k), out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] - o[i];
  return out;
}

// 8-연결 요소. [{x, y, w, h, area}] (박스 좌상단·크기, 픽셀 수)
export function connectedComponents(mask, w, h) {
  const seen = new Uint8Array(mask.length), stack = [], out = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const p = stack.pop(), px = p % w, py = (p / w) | 0;
      area++;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
    }
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return out;
}

// 사각형 [x0,x1)×[y0,y1) 안에서 조건을 만족하는 픽셀 수와 사각형 넓이 (이미지 밖은 잘라냄)
export function countIn(w, h, rect, test) {
  const xa = Math.max(0, rect.x0), xb = Math.min(w, rect.x1);
  const ya = Math.max(0, rect.y0), yb = Math.min(h, rect.y1);
  let n = 0;
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) if (test(y * w + x)) n++;
  return { count: n, area: Math.max(0, xb - xa) * Math.max(0, yb - ya) };
}
