# czn-route (카오스 내비)
카오스 제로 나이트메어 카오스 맵 스샷 → 칸·연결선 자동 인식 → 원하는 칸을 가장 많이 밟는 루트 계산. 정적 사이트(GitHub Pages, `docs/`).
요구사항·알고리즘·단계·완료 기준은 `SPEC.md`에 있다. 통째로 읽지 말고 필요한 장만 읽어라 (인식 4장, 루트 5장, 화면 6장, 단계 10장). 지금 몇 단계인지는 SPEC 10장 기준으로 말한다.

## Stack
- 바닐라 HTML/CSS/JS (ES modules), 빌드 없음. 외부 라이브러리 없음 (OpenCV.js 금지)
- 테스트: Node 내장 `node --test`, PNG 읽기는 `pngjs`(devDependency)
- 참고 원본: `reference/prototype.py` (Python + OpenCV, 검증 완료). 실행하려면 conda env `czn` (opencv-python, numpy)

## Commands
- 테스트: `npm test` (= `node --test tests/`)
- 미리보기: `python -m http.server -d docs 8000` → http://localhost:8000
- 프로토타입 실행: `conda run --no-capture-output -n czn python reference/prototype.py tests/fixtures/sample-run-1_01.png tests/fixtures/sample-run-1_02.png tests/fixtures/sample-run-1_03.png`

## Structure
- `docs/core/*`는 DOM·window에 의존하지 않는 순수 모듈 (Node 테스트가 그대로 import)
- 색 기준·비율 상수·칸 종류 표·표시 이름은 `docs/core/config.js` 한 곳에만 둔다
- `docs/app.js`만 DOM을 만진다
- fixture는 `tests/fixtures/<세트이름>_NN.png` + `<세트이름>.expected.json`

## Rules
- 픽셀 단위 숫자를 코드에 박지 않는다. 노드 크기·행/열 간격에서 비율로 계산한다 (프로토타입 상수는 1917×1078 전용)
- 인식이 애매하면 추측해서 채우지 말고 경고로 표시한다 (틀린 인식 < 경고)
- 알고리즘을 바꾸면 모든 fixture 세트 테스트를 돌리고 결과를 보여준다
- 화면을 고치면 데스크톱·모바일(400px), 라이트·다크 모드에서 확인한다
- 단계는 SPEC 10장 순서대로, 사용자가 다음 단계를 지시할 때만 넘어간다

## Critical
- NEVER: expected.json을 테스트 통과용으로 고치지 않는다. 정답이 틀린 것 같으면 근거(좌표·스샷 부분)를 보여주고 사용자에게 묻는다
- NEVER: 게임 자동 조작·화면 실시간 캡처 기능을 만들지 않는다
- NEVER: 스샷을 외부로 업로드하지 않는다 (전부 브라우저 안에서 처리)
- NEVER: `reference/prototype.py`를 고치지 않는다

## Gotchas
- 흐리게 표시된 노드는 밝기(V)≈110 → 마스크 V 기준이 120이면 놓친다
- 흐린 연결선은 회색조≈194 → 고정 임계값 200이면 놓친다. top-hat 후 판정
- 노드 아이콘(흰색)이 색 영역을 쪼갠다 → 닫힘 연산 후 연결 요소. 단, 너무 크게 닫으면 뱃지가 노드에 붙어 크기 필터에 걸린다 (15×15는 실패, 7×7 성공)
- 선택 가능한 노드 아래 청록 하이라이트 테두리가 event로 잡힌다 → 채움비율(면적/박스) ≥0.3으로 거름
- 보스 엠블럼은 battle과 같은 분홍 → 행 격자 이탈로 거름
- 연결선 끝점 y는 탐지된 노드 중심이 아니라 행 격자 위치를 쓴다
- 색 하나씩 도는 반복문 안에서 종류 변수를 덮어쓰지 말 것 (camp→compass 덮어쓰기로 이후 노드 전부 오분류됐던 버그)

## Compaction
- When compacting, always preserve the list of modified files, the current step in SPEC.md, and test commands.
