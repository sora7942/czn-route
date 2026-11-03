// 색 기준·비율 상수·칸 종류 표·표시 이름은 이 파일 한 곳에만 둔다 (CLAUDE.md).
// 길이 상수는 전부 u(탐지된 노드 폭, 1917×1078 샘플에서 ≈136px) 단위의 비율이다.
// 괄호 안은 프로토타입(reference/prototype.py)의 1917×1078 원래 값.

// 칸 종류: 키 → 표시 이름·다이어그램 색·기준 색상(H, OpenCV 0~179)
// 표시 이름(name)은 게임 범례(reference/legend)의 공식 명칭, glyph는 다이어그램용 글자. 둘 다 여기서만 바꾼다
export const NODE_TYPES = {
  battle:  { name: '일반 전투 구역',   glyph: '✕', color: '#ff3d86', hue: 167 }, // 분홍 마름모, 교차한 검
  event:   { name: '미확인 구역',       glyph: '?', color: '#14c4d6', hue: 99 },  // 청록 마름모, 물음표
  elite:   { name: '엘리트 전투 구역', glyph: '★', color: '#9b6bff', hue: 128 }, // 보라 마름모, 몬스터 얼굴
  camp:    { name: '안전 구역',         glyph: '▲', color: '#ff9a1f', hue: 14 },  // 주황 마름모, 흰 불꽃
  compass: { name: '웨이포인트 구역',   glyph: '✦', color: '#e6c200', hue: 14 },  // camp와 같은 주황, 흰 4각 별(나침반)
};
// 색 마스크로 따로 덩어리를 찾는 종류 (compass는 camp 덩어리에서 갈라짐)
export const MASK_TYPES = ['battle', 'event', 'elite', 'camp'];
// 가장자리에서 잘린 노드는 불꽃/나침반을 못 가르므로 색 계열로만 비교한다
export const TYPE_FAMILY = { battle: 'battle', event: 'event', elite: 'elite', camp: 'orange', compass: 'orange' };

// 뱃지: 노드 오른쪽 위에 붙는 작은 아이콘. card = 범례의 '상점' 아이콘과 일치(확인).
// flame(보라 불꽃)은 범례에 없어 공식 명칭 미확인 — 외형 이름 유지
export const BADGES = {
  flame: { name: '보라 불꽃', color: '#b44bff', hue: 135, hueTol: 15, sMin: 80, vMin: 120 },
  card:  { name: '상점', color: '#ffd23f', hue: 22,  hueTol: 10, sMin: 60, vMin: 150 },
};
// 뱃지 판정 순서 (프로토타입: 보라 먼저, 그다음 노랑)
export const BADGE_ORDER = ['flame', 'card'];

// 색 마스크: 흐리게 표시된 노드는 V≈110이라 vMin을 120으로 올리면 놓친다 (Gotcha)
export const MASK = { hueTol: 10, sMin: 110, vMin: 95 };

// 노드 후보 필터
export const NODE = {
  fillMin: 0.3,               // 면적/박스, 하이라이트 테두리 제거 (0.3)
  bootCloseFrac: 7 / 1917,    // u를 알기 전 첫 닫힘 커널 (이미지 폭 비율). u를 알면 closeK로 다시 계산
  closeK: 0.05,              // 닫힘 연산 커널 (7px). 크게 닫으면 뱃지가 노드에 붙는다 (15px 실패)
  // 프로토타입의 80~200 / 35~120 / 1500은 u를 모르던 시절의 느슨한 값. 실측 노드는 폭 0.97~1.08u, 높이 0.57~0.67u, 면적 ≥0.27u²
  // 배경 청록 번짐(103×57)·보스 받침(91×56)은 폭·면적으로 걸러진다 (프로토타입은 행 격자 이탈로 걸렀음)
  // 상한은 "선택 가능" 하이라이트가 붙어 커진 노드(166×110 = 1.28u×0.85u)까지 허용
  widthRange: [0.85, 1.35],   // 노드 폭
  heightRange: [0.5, 0.9],    // 노드 높이
  areaMin: 0.2,               // 면적, u² 단위
  // u를 처음 정할 때 쓰는 후보 조건 (u를 모르는 상태라 이미지 면적·가로세로비로 거른다)
  bootAreaFrac: 0.0003,       // 이미지 면적 대비 최소 면적
  bootAspect: [1.3, 2.2],     // 마름모 폭/높이 ≈ 1.6
  // 상단 UI·하단 버튼 제외 (170 / 940, 이미지 높이 비율). 5단계에서 크기 필터만으로 충분한지 시험
  uiTopFrac: 170 / 1078,
  uiBottomFrac: 940 / 1078,
  edgeMargin: 0.66,           // 잘린 열 제외: 중심 x가 가장자리에서 이 안쪽이면 잘린 것 (90px)
  clippedWidthMin: 0.15,      // 잘린 노드 후보의 폭 하한 (겹침 보조 근거용)
  clippedAreaMin: 0.1,        // 잘린 노드 후보의 면적 하한, u² 단위 (채움비율은 보지 않음 — 잘리면 모양이 달라짐)
};

// 노드 중심 기준 영역 (u 단위, [x0, x1, y0, y1], y는 아래가 +)
export const REGION = {
  white: [-0.22, 0.22, -0.26, 0.18],   // 불꽃/나침반 아이콘 (cx±30, cy-35~+25)
  badge: [0.18, 0.59, -0.70, -0.15],   // 노드 오른쪽 위 (x+25~80, y-95~-20)
};
export const WHITE = { sMax: 70, vMin: 190, campFrac: 310 / 3600 }; // 흰 비율 < campFrac 이면 compass (불꽃≈370, 나침반≈250)
export const BADGE_MIN_FRAC = 150 / 4125; // 영역 면적 대비 뱃지색 비율

// 연결선
export const LINE = {
  endDx: 0.57,       // 노드 중심에서 선 끝점까지 x (78px)
  endDy: 0.095,      // 선 끝점 y = 행 격자 y + 이만큼 (13px)
  tophatK: 0.066,    // top-hat 커널 (9px)
  boxR: 0.015,       // 표본 박스 반지름 (2px)
  samples: 60,       // 직선 표본 개수
  trim: 5,           // 양끝에서 버리는 표본 수
  brightMin: 90,     // top-hat 후 밝기 (밝기 값이라 해상도 무관)
  hitFrac: 0.5,      // 밝은 표본 비율 > 이 값이면 연결
};

// 격자 (노드 크기 대비). 열·행 번호를 정하는 데는 쓰지 않고 교차 점검·허용오차에만 쓴다
export const GRID = {
  colPitch: 246 / 136,    // 열 간격 ≈ 1.81u
  rowPitch: 162 / 136,    // 행 간격 ≈ 1.19u
  rowClusterTol: 0.3,     // y 클러스터링 허용오차 (u 단위)
  colClusterTol: 0.3,     // x 클러스터링 허용오차 (u 단위)
  rowResidualMax: 0.2,    // 행 간격 대비 잔차 한계, 넘으면 추측하지 않고 경고
  pitchMismatchMax: 0.2,  // 측정 행 간격 vs 노드 크기 예측 간격 허용 차이
  colResidualMax: 0.25,   // 열 간격 대비 잔차 한계
};

// 이어붙이기 겹침 후보 점수 (stitch.js overlapScore): 칸·간선 일치율
export const OVERLAP = {
  minScore: 0.75,        // 이 점수 미만이면 겹침 없음으로 보고 경고
  margin: 0.15,          // 2등 후보가 1등 - margin 이상이면 "겹침 불확실" (후보가 하나로 정해지지 않음)
  missingPenalty: 0.5,   // 한쪽 스샷에만 있는 칸·간선의 감점 (어둡거나 번진 칸이 빠졌을 수 있음)
};

// 오른쪽 위 ⓘ 버튼: 흰 원이라 노드 오른쪽 위 뱃지를 가린다. 흰색 연결 요소 중 정사각형·크기·채움이 맞는 것
// (실측: 2560×1440 68px=0.40u, 1917×1078 52px=0.38u, 채움 0.66)
export const INFO = {
  xMinFrac: 0.85, yMaxFrac: 0.35, // 찾는 영역 (이미지 크기 비율)
  sMax: 40, vMin: 235,            // 흰색 판정
  sizeRange: [0.3, 0.55],         // 폭·높이, u 단위
  aspectMax: 1.2,                 // 폭/높이가 1/aspectMax ~ aspectMax
  fillRange: [0.5, 0.85],         // 면적/박스 (원 + 'i' 글자 구멍)
};

// 격자 정수 배수 판정용 odd 커널 변환
export const odd = (x, min = 1) => Math.max(min, 2 * Math.floor(x / 2) + 1);

// 화면 (3단계)
export const WEIGHT_RANGE = [-3, 3];
export const STORAGE_KEY = 'czn-route:weights:v1';
// 인식 경고 중 "루트가 틀릴 수 있는" 것 → 다이어그램 위에 바로 노출. 나머지는 접이식 목록.
// 열·행 번호나 이어붙이기가 틀릴 수 있는 경고. 새 경고는 기본이 접이식이니 여기에 추가한다
export const SERIOUS_WARNINGS = [
  /겹치는 열이 없음/,   // 이어붙이기 실패
  /겹침 불확실/,
  /행 간격 .*다름/,     // 행이 빠졌거나 인식 오류
  /빈 열 의심/,
  /열 간격 불규칙/,
  /노드를 찾지 못함/,   // 그 스샷은 맵에서 빠졌다
];

// 다이어그램 (SVG). unit = 노드 폭의 SVG 단위, 나머지는 unit 배수. 열·행 간격은 GRID 비율을 따른다
// tapMin = 수정 모드에서 칸·빈 자리의 최소 탭 영역(SVG 단위 = 화면 px, 다이어그램은 1:1로 그려서). 손가락용 44px
export const DIAGRAM = { unit: 64, nodeH: 0.6, padLeft: 0.9, padTop: 0.9, padRight: 0.5, padBottom: 0.5, tapMin: 44 };

// 수정 UI
export const EDIT_HISTORY_MAX = 30;   // 되돌리기 최대 횟수
export const EXPORT_NAME = 'new-set.expected.json';
