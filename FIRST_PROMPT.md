# Claude Code 시작하기

## 1. 폴더 준비 (PowerShell)
```powershell
# 받은 zip을 풀어서 원하는 위치에 둔 뒤
cd C:\dev\czn-route        # ← 실제 경로로
git init
"node_modules/`n__pycache__/`n" | Out-File -Encoding utf8 .gitignore
npm init -y
npm install --save-dev pngjs

# 프로토타입 실행용 env (1단계에서 결과 비교할 때 씀)
conda create -n czn python=3.12 -y
conda run -n czn pip install opencv-python numpy

# 새 프로젝트 체크리스트
uvx --python 3.11 --from git+https://github.com/oraios/serena serena project index
claude
```
세션 시작 후: 포니테일 단계가 lite인지 확인, 중간중간 `/context`로 사용량 확인.

## 2. 첫 프롬프트 (plan mode에서)
```
SPEC.md의 1, 4, 8, 9, 10장과 reference/prototype.py를 읽고 0~1단계 구현 계획을 세워줘.
- 0단계: tests/fixtures/sample-run-1.expected.json을 내가 스샷과 눈으로 대조할 수 있는 방법
  (예: 인식 결과를 다이어그램으로 그린 HTML을 tests/fixtures/ 스샷과 나란히 보여주는 확인용 페이지)
- 1단계: docs/core/의 image.js, recognize.js, stitch.js, config.js를 만들 파일·함수 단위로 나누고,
  프로토타입의 1917x1078 하드코딩 상수를 노드 크기 기반 비율로 바꾸는 방법을 구체적으로
- 각 단계마다 어떻게 동작을 확인할지 (실행할 명령 포함)
- SPEC에서 모호하거나 빠진 부분이 있으면 구현 전에 질문
아직 코드는 쓰지 마.
```

## 3. 이후 단계 프롬프트 예시
```
계획의 1단계를 구현해.
완료 기준: npm test 에서 tests/fixtures/sample-run-1_01~03.png 인식+이어붙이기 결과가
sample-run-1.expected.json의 columns, edges와 완전히 일치.
구현 후 테스트를 직접 실행하고, 실행한 명령과 출력 결과를 보여줘.
실패하면 근본 원인을 고쳐. expected.json을 고치거나 fixture 전용 특수 처리를 넣어서 통과시키지 마.
```
