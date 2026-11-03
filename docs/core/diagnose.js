// 인식 결과 판정 (순수): 맵을 쓸 수 없으면 이유와 할 일, 경고는 두 등급으로 나눈다.
import { SERIOUS_WARNINGS } from './config.js';

// 루트가 틀릴 수 있는 경고(serious)는 다이어그램 위에 바로, 나머지(minor)는 접이식
export function splitWarnings(warnings) {
  const serious = [], minor = [];
  for (const w of warnings) (SERIOUS_WARNINGS.some((re) => re.test(w)) ? serious : minor).push(w);
  return { serious, minor };
}

// 맵을 못 쓰는 경우 {reason, todo}, 쓸 수 있으면 null. 호출 쪽은 이때 루트를 계산하지 않는다
export function diagnose(map, shotCount) {
  const warnings = map.meta?.warnings ?? [];
  if (!map.columns.length) {
    return { reason: '맵을 찾지 못했어요.', todo: '카오스 맵 화면인지 확인해 주세요. 팝업이나 다른 화면이 가리고 있으면 닫고 다시 찍어 주세요.' };
  }
  if (map.columns.length === 1) {
    return { reason: '열을 1개만 찾았어요.', todo: '맵이 2열 이상 보이게 찍어 주세요. 맵 화면이 아닌 스샷이 섞이지 않았는지도 확인해 주세요.' };
  }
  const bad = [...new Set(warnings.filter((w) => /겹치는 열이 없음/.test(w)).map((w) => w.match(/스샷 (\d+)/)?.[1]).filter(Boolean))];
  if (shotCount > 1 && bad.length) {
    return {
      reason: `스샷 ${bad.join('·')}: 앞 스샷과 겹치는 열이 없어 이어붙이지 못했어요.`,
      todo: '스샷은 2열 이상 겹치게 찍고, 맵의 왼쪽 → 오른쪽 순서로 올렸는지 확인해 주세요. 썸네일의 ◀ ▶로 순서를 바꿀 수 있어요.',
    };
  }
  return null;
}
