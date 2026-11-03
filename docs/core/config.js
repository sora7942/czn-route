// 색 기준·비율 상수·칸 종류 표·표시 이름은 이 파일 한 곳에만 둔다 (CLAUDE.md).
// 길이 상수는 전부 u(탐지된 노드 폭, 1917×1078 샘플에서 ≈136px) 단위의 비율이다.
// 괄호 안은 프로토타입(reference/prototype.py)의 1917×1078 원래 값.

// 칸 종류: 키 → 표시 이름·다이어그램 색·기준 색상(H, OpenCV 0~179)
// 공식 명칭을 아직 모름 → 표시 이름은 여기서만 바꾼다
export const NODE_TYPES = {
  battle:  { name: '전투',   color: '#ff3d86', hue: 167 },
  event:   { name: '이벤트', color: '#14c4d6', hue: 99 },
  elite:   { name: '정예',   color: '#9b6bff', hue: 128 },
  camp:    { name: '캠프',   color: '#ff9a1f', hue: 14 },
  compass: { name: '나침반', color: '#e6c200', hue: 14 }, // camp와 같은 주황, 흰 픽셀 양으로 구분
};
// 색 마스크로 따로 덩어리를 찾는 종류 (compass는 camp 덩어리에서 갈라짐)
export const MASK_TYPES = ['battle', 'event', 'elite', 'camp'];
// 가장자리에서 잘린 노드는 불꽃/나침반을 못 가르므로 색 계열로만 비교한다
export const TYPE_FAMILY = { battle: 'battle', event: 'event', elite: 'elite', camp: 'orange', compass: 'orange' };

export const BADGES = {
  flame: { name: '불꽃', color: '#b44bff', hue: 135, hueTol: 15, sMin: 80, vMin: 120 },
  card:  { name: '카드', color: '#ffd23f', hue: 22,  hueTol: 10, sMin: 60, vMin: 150 },
};
// 뱃지 판정 순서 (프로토타입: 보라 먼저, 그다음 노랑)
export const BADGE_ORDER = ['flame', 'card'];

// 색 마스크: 흐리게 표시된 노드는 V≈110이라 vMin을 120으로 올리면 놓친다 (Gotcha)
export const MASK = { hueTol: 10, sMin: 110, vMin: 95 };

// 노드 후보 필터
export const NODE = {
  fillMin: 0.3,               // 면적/박스, 하이라이트 테두리 제거 (0.3)
  closeK: 0.05,               // 닫힘 연산 커널 (7px). 크게 닫으면 뱃지가 노드에 붙는다 (15px 실패)
  widthRange: [0.59, 1.47],   // 노드 폭 (80~200px)
  heightRange: [0.26, 0.88],  // 노드 높이 (35~120px)
  areaMin: 0.08,              // 면적, u² 단위 (1500px)
  // u를 처음 정할 때 쓰는 후보 조건 (u를 모르는 상태라 이미지 면적·가로세로비로 거른다)
  bootAreaFrac: 0.0003,       // 이미지 면적 대비 최소 면적
  bootAspect: [1.3, 2.2],     // 마름모 폭/높이 ≈ 1.6
  // 상단 UI·하단 버튼 제외 (170 / 940, 이미지 높이 비율). 5단계에서 크기 필터만으로 충분한지 시험
  uiTopFrac: 170 / 1078,
  uiBottomFrac: 940 / 1078,
  edgeMargin: 0.66,           // 잘린 열 제외: 중심 x가 가장자리에서 이 안쪽이면 잘린 것 (90px)
  clippedWidthMin: 0.15,      // 잘린 노드 후보의 폭 하한 (겹침 보조 근거용)
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

// 격자 정수 배수 판정용 odd 커널 변환
export const odd = (x, min = 1) => Math.max(min, 2 * Math.floor(x / 2) + 1);
