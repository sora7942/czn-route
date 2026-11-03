"""카오스 맵 인식·최적 루트 Python 프로토타입 (참고용, 고치지 않는다)
- 2026-11 채팅에서 스샷 3장(1917x1078, PC)으로 검증한 코드. JS 포팅의 기준 알고리즘.
- 상수(ROW0/ROWH/COLW, 78/13 오프셋, UI 제외 영역 170/940, 흰 픽셀 310 등)는 전부 1917x1078 기준 하드코딩 → JS에서는 노드 크기로부터 비율로 계산할 것.
실행: python prototype.py <스샷1> <스샷2> ...   (opencv-python, numpy 필요)
"""
import cv2, numpy as np, sys, glob
HUES = {'battle':167, 'event':99, 'elite':128, 'camp':14}
ROW0, ROWH = 225, 162

def hue_dist(a, b): d = abs(a-b); return min(d, 180-d)

def detect(path):
    im = cv2.imread(path); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[...,0].astype(int), hsv[...,1], hsv[...,2]
    base = (S > 110) & (V > 95)
    base[:170, :] = False; base[940:, :] = False          # 상단 UI·하단 버튼 제외
    nodes = []
    for typ, h0 in HUES.items():                           # 색상별로 따로 덩어리 찾기
        mask = (base & (np.minimum(abs(H-h0), 180-abs(H-h0)) < 10)).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7,7), np.uint8))
        n, lab, st, cen = cv2.connectedComponentsWithStats(mask, 8)
        for i in range(1, n):
            x, y, w, h, a = st[i]
            if a < 1500 or not (80 < w < 200 and 35 < h < 120): continue
            if a / (w*h) < 0.3: continue                   # 테두리 하이라이트 제외
            cx, cy = int(x+w/2), int(y+h/2)
            k = round((cy-ROW0)/ROWH)
            if abs(cy - (ROW0 + k*ROWH)) > 25: continue    # 행 격자에서 벗어난 것(보스 등) 제외
            t = typ
            if typ == 'camp':                              # 주황은 아이콘 흰 픽셀 양으로 불꽃/나침반 구분
                r = hsv[cy-35:cy+25, cx-30:cx+30]
                if ((r[...,1] < 70) & (r[...,2] > 190)).sum() < 310: t = 'compass'
            nodes.append(dict(x=cx, y=cy, type=t))
    return im, nodes

def line_score(im, p, q):
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    g = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, np.ones((9,9), np.uint8))   # 어두운 선도 잡기
    pts = np.linspace(p, q, 60)[5:-5]
    hit = sum(g[int(y)-2:int(y)+3, int(x)-2:int(x)+3].max() > 90 for x, y in pts)
    return hit / len(pts)

# ---------------- pipeline ----------------
ROW0, ROWH, COLW = 225, 162, 246

def badge(hsv, n):
    x, y = n['x'], n['y']
    r = hsv[y-95:y-20, x+25:x+80]
    H, S, V = r[...,0].astype(int), r[...,1], r[...,2]
    purple = ((abs(H-135)<15)&(S>80)&(V>120)).sum()
    gold = ((abs(H-22)<10)&(S>60)&(V>150)).sum()
    return 'flame' if purple>150 else 'card' if gold>150 else None

def parse(path):
    im, nodes = detect(path)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    W = im.shape[1]
    nodes = [n for n in nodes if 90 < n['x'] < W-90]          # 잘린 열 제외
    cols = {}
    for n in nodes:
        n['row'] = round((n['y']-ROW0)/ROWH)
        n['badge'] = badge(hsv, n)
        cols.setdefault(round(n['x']/COLW*2)/2, []).append(n)   # x로 열 묶기
    ks = sorted(cols)
    columns = [{n['row']: n for n in cols[k]} for k in ks]
    colx = [int(np.median([n['x'] for n in c.values()])) for c in columns]
    edges = []   # (열 i, 행 a) -> (열 i+1, 행 b)
    for i in range(len(columns)-1):
        for a, A in columns[i].items():
            for b, B in columns[i+1].items():
                p = (colx[i]+78, ROW0+a*ROWH+13); q = (colx[i+1]-78, ROW0+b*ROWH+13)
                if line_score(im, p, q) > 0.5:
                    edges.append((i, a, b))
    return columns, edges

def sig(col): return tuple(sorted((r, n['type']) for r, n in col.items()))

def stitch(parts):
    cols, edges = [], []
    for c, e in parts:
        k = 0
        for kk in range(min(len(cols), len(c)), 0, -1):    # 가장 긴 겹침 찾기
            if [sig(x) for x in cols[-kk:]] == [sig(x) for x in c[:kk]]:
                k = kk; break
        off = len(cols) - k
        cols += c[k:]
        edges += [(i+off, a, b) for i, a, b in e if (i+off, a, b) not in edges]
        print(f'  겹친 열 {k}개')
    return cols, edges

def best(cols, edges, weight):
    """DAG 최장 경로: 각 노드 점수 = weight(node), 첫 열 아무데서나 시작 → 마지막 열"""
    nxt = {}
    for i, a, b in edges: nxt.setdefault((i, a), []).append(b)
    dp = {}
    for i in range(len(cols)-1, -1, -1):
        for r, n in cols[i].items():
            w = weight(n)
            cand = [(dp[(i+1, b)][0], b) for b in nxt.get((i, r), []) if (i+1, b) in dp]
            if i < len(cols)-1 and not cand: continue
            s, b = max(cand) if cand else (0, None)
            dp[(i, r)] = (s + w, b)
    start = max(((dp[(0, r)][0], r) for r in cols[0] if (0, r) in dp))
    path, r = [], start[1]
    for i in range(len(cols)):
        path.append((i, r)); r = dp[(i, r)][1]
    return start[0], path

if __name__ == '__main__':
    files = sys.argv[1:]
    parts = [parse(f) for f in files]
    cols, edges = stitch(parts)
    print(f'열 {len(cols)}개, 노드 {sum(map(len,cols))}개, 연결 {len(edges)}개')
    for i, c in enumerate(cols):
        print(i, ' '.join(f"{r}:{n['type']}{'+'+n['badge'] if n['badge'] else ''}" for r, n in sorted(c.items())))
    for label, fn in [('elite 최다', lambda n: n['type']=='elite'),
                      ('camp 최다', lambda n: n['type']=='camp'),
                      ('불꽃 뱃지 최다', lambda n: n['badge']=='flame')]:
        s, p = best(cols, edges, fn)
        print(f'\n[{label}] {s}개:', ' → '.join(f"{cols[i][r]['type']}(행{r+1})" for i, r in p))
