// 인식은 무거워서(스샷 3장 ≈1.6초) Worker에서 돌린다. DOM 없음.
import { recognizeSet } from './core/recognize.js';

self.onmessage = ({ data: { id, images } }) => {
  try {
    self.postMessage({ id, map: recognizeSet(images) });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  }
};
