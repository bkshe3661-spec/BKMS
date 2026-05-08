import { useState, useRef, useCallback, useEffect } from 'react';
import type { BuildingPolygon, Point } from '../../types/polygon';

/* ─────────────────────────────────────────
   상수
───────────────────────────────────────── */
const IMG_W = 1024;
const IMG_H = 768;
const MAX_SCALE = 8;
const CLOSE_THRESHOLD = 14; // 시작점 닫기 임계값 (원본 px 기준)
const DRAG_THRESHOLD  = 5;  // 드래그 vs 클릭 판별 (화면 px)

const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#06b6d4','#f97316','#ec4899',
  '#84cc16','#14b8a6','#a855f7','#fb923c',
];

/* ─────────────────────────────────────────
   유틸
───────────────────────────────────────── */
function toSvgPoints(pts: Point[]): string {
  return pts.map(p => `${p.x * IMG_W},${p.y * IMG_H}`).join(' ');
}

function centroid(pts: Point[]): { cx: number; cy: number } {
  return {
    cx: pts.reduce((s, p) => s + p.x, 0) / pts.length * IMG_W,
    cy: pts.reduce((s, p) => s + p.y, 0) / pts.length * IMG_H,
  };
}

/** 두 점 사이 거리 – 원본 이미지 px 기준 */
function imgDist(a: Point, b: Point): number {
  return Math.sqrt(((a.x - b.x) * IMG_W) ** 2 + ((a.y - b.y) * IMG_H) ** 2);
}

/* ─────────────────────────────────────────
   컴포넌트
───────────────────────────────────────── */
export default function MapView() {

  /* ── 뷰포트 크기 → minScale 자동 계산 ─────────────────
   *  minScale = max(viewW/IMG_W, viewH/IMG_H)
   *  → 어떤 화면 크기에서도 이미지가 컨테이너를 꽉 채움
   *  → 검은 여백 원천 차단
   ──────────────────────────────────────────────────── */
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [minScale, setMinScale] = useState(1);

  const calcMinScale = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const ms = Math.max(vw / IMG_W, vh / IMG_H);
    setMinScale(ms);
    // 현재 scale이 minScale보다 작으면 보정
    setScale(s => Math.max(s, ms));
    // 최초 진입 시 이미지가 화면 중앙에 맞도록 offset 초기화
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    calcMinScale();
    const ro = new ResizeObserver(calcMinScale);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [calcMinScale]);

  /* ── 줌 / 패닝 상태 ── */
  const [scale, setScale]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  /* ── 폴리곤 상태 ── */
  const [polygons,  setPolygons]  = useState<BuildingPolygon[]>([]);
  const [drawMode,  setDrawMode]  = useState(false);
  const [draft,     setDraft]     = useState<Point[]>([]);
  const [cursorPt,  setCursorPt]  = useState<Point | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /* ── 드래그/클릭 판별 ref ── */
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const didDrag     = useRef(false);
  const panOrigin   = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  /* ─────────────────────────────────────────
   * 핵심 좌표 변환
   *
   * 레이아웃 구조:
   *   wrapperRef (overflow:hidden, flex center)
   *     └─ inner div  (width=IMG_W, height=IMG_H)
   *          transform: translate(offset.x, offset.y) scale(scale)
   *          transform-origin: center center  ← ★ 중앙 기준
   *     └─ img + svg  (width=IMG_W, height=IMG_H 고정)
   *
   * transform-origin이 center center이므로
   * 화면 상의 img 실제 rect = getBoundingClientRect() 로 직접 읽으면
   * scale / offset 이 모두 반영된 실제 위치가 나온다.
   * → (clientX - rect.left) / rect.width  = 이미지 내 0~1 비율
   * → scale 별도 보정 불필요
   ──────────────────────────────────────── */
  const imgRef = useRef<HTMLImageElement>(null);

  const clientToRatio = useCallback((cx: number, cy: number): Point | null => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const x = (cx - r.left)  / r.width;
    const y = (cy - r.top)   / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  /* ── 오프셋 범위 제한 (이미지가 컨테이너를 항상 채우도록) ────
   *  transform-origin: center center 이므로:
   *    화면에 표시되는 이미지 크기 = IMG_W * scale  ×  IMG_H * scale
   *    컨테이너 크기              = vw  ×  vh
   *    최대 허용 오프셋:
   *      maxOffX = (IMG_W * scale - vw)  / 2
   *      maxOffY = (IMG_H * scale - vh)  / 2
   ─────────────────────────────────────────────────────────── */
  const clampOffset = useCallback((ox: number, oy: number, sc: number) => {
    const el = wrapperRef.current;
    if (!el) return { x: ox, y: oy };
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const maxX = Math.max(0, (IMG_W * sc - vw)  / 2);
    const maxY = Math.max(0, (IMG_H * sc - vh)  / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, []);

  /* ── 휠 줌 (커서 위치 중심) ── */
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;

    setScale(prev => {
      const next = Math.max(minScale, Math.min(MAX_SCALE, prev * factor));

      /* transform-origin: center center 기준 커서 위치 보정
       *   wrapper 중심 = (vw/2, vh/2)
       *   커서의 wrapper 내 위치 = (mx, my)
       *   줌 후 커서 아래 이미지 픽셀이 유지되려면:
       *     newOffset = oldOffset * (next/prev) + (커서~중심 벡터) * (1 - next/prev)
       */
      const el = wrapperRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const mx   = e.clientX - rect.left - rect.width  / 2;
        const my   = e.clientY - rect.top  - rect.height / 2;
        const ratio = next / prev;
        setOffset(o => {
          const nx = o.x * ratio + mx * (1 - ratio);
          const ny = o.y * ratio + my * (1 - ratio);
          return clampOffset(nx, ny, next);
        });
      }
      return next;
    });
  }, [minScale, clampOffset]);

  /* ── 마우스 다운 ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    if (!drawMode) {
      panOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    }
  }, [drawMode, offset]);

  /* ── 마우스 이동: 패닝 + 미리보기 ── */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (pointerDown.current) {
      const dx = e.clientX - pointerDown.current.x;
      const dy = e.clientY - pointerDown.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) didDrag.current = true;
    }
    if (!drawMode && panOrigin.current && didDrag.current) {
      const { mx, my, ox, oy } = panOrigin.current;
      const nx = ox + (e.clientX - mx);
      const ny = oy + (e.clientY - my);
      setOffset(clampOffset(nx, ny, scale));
    }
    if (drawMode) setCursorPt(clientToRatio(e.clientX, e.clientY));
  }, [drawMode, scale, clientToRatio, clampOffset]);

  /* ── 마우스 업: 점 추가 판별 ── */
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const wasDrag = didDrag.current;
    pointerDown.current = null;
    didDrag.current     = false;
    panOrigin.current   = null;
    if (!drawMode || wasDrag) return;

    const pt = clientToRatio(e.clientX, e.clientY);
    if (!pt) return;

    if (draft.length >= 3 && imgDist(pt, draft[0]) < CLOSE_THRESHOLD) {
      closeDraft(draft); return;
    }
    setDraft(prev => [...prev, pt]);
  }, [drawMode, draft, clientToRatio]);

  /* ── 더블클릭: 닫기 ── */
  const handleDblClick = useCallback((e: React.MouseEvent) => {
    if (!drawMode || draft.length < 3) return;
    e.preventDefault();
    closeDraft(draft);
  }, [drawMode, draft]);

  /* ── 닫기 → 이름 입력 → 저장 ── */
  const closeDraft = useCallback((cur: Point[]) => {
    const name = window.prompt('건물 이름을 입력하세요\n예: 관리동, 원료창고, 생산1동', '');
    if (!name?.trim()) return;
    const color = PALETTE[polygons.length % PALETTE.length];
    setPolygons(prev => [...prev, {
      id: `poly-${Date.now()}`, name: name.trim(), points: cur, color,
    }]);
    setDraft([]); setCursorPt(null); setDrawMode(false);
  }, [polygons.length]);

  /* ── ESC 키 ── */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawMode) { setDraft([]); setCursorPt(null); setDrawMode(false); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [drawMode]);

  /* ── 그리기 모드 토글 ── */
  const toggleDraw = () => setDrawMode(p => { setDraft([]); setCursorPt(null); return !p; });

  /* ── 뷰 리셋 ── */
  const resetView = () => { setScale(minScale); setOffset({ x: 0, y: 0 }); };

  /* ── 폴리곤 클릭 (일반 모드) ── */
  const onPolyClick = useCallback((poly: BuildingPolygon, e: React.MouseEvent) => {
    if (drawMode || didDrag.current) return;
    e.stopPropagation();
    alert(`[${poly.name}]이(가) 선택되었습니다.\n\n✅ 다음 단계에서 1층/2층 도면 선택 UI로 넘어갈 예정입니다.`);
  }, [drawMode]);

  /* ── 시작점 근접 여부 ── */
  const nearFirst = draft.length >= 3 && cursorPt !== null
    && imgDist(cursorPt, draft[0]) < CLOSE_THRESHOLD;

  /* ─────────────────────────────────────────
   * 렌더
   ───────────────────────────────────────── */
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 108px)' }}>

      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">🗺 공장 조감도</span>
          <span className="text-xs text-gray-400">· 태경BK 단양1공장</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 줌 컨트롤 */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
            <button
              onClick={() => setScale(s => { const n = Math.min(MAX_SCALE, s * 1.25); setOffset(o => clampOffset(o.x, o.y, n)); return n; })}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg leading-none">+</button>
            <span className="text-xs text-gray-500 w-14 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(s => { const n = Math.max(minScale, s * 0.8); setOffset(o => clampOffset(o.x, o.y, n)); return n; })}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg leading-none">−</button>
            <button onClick={resetView} className="ml-1 text-gray-500 hover:text-blue-600 px-1" title="뷰 초기화">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          </div>
          {polygons.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
              건물 {polygons.length}개
            </span>
          )}
          <button
            onClick={toggleDraw}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all select-none',
              drawMode
                ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            {drawMode ? '✏️ 그리기 중… (ESC 취소)' : '✏️ 건물 영역 지정 (폴리곤)'}
          </button>
        </div>
      </div>

      {/* ── 안내 배너 ── */}
      {drawMode && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-50 border-b border-orange-200 text-orange-700 text-xs flex-shrink-0">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>
            <strong>클릭</strong>으로 꼭짓점 추가.&nbsp;
            {draft.length >= 3
              ? <><strong className="text-green-700">초록 원</strong> 클릭 또는 <strong>더블클릭</strong>으로 영역 완성</>
              : `최소 3개 필요 (현재 ${draft.length}개)`
            }
          </span>
        </div>
      )}

      {/* ─────────────────────────────────────────
       * 뷰포트
       *   - overflow: hidden
       *   - display: flex + center  → 이미지가 항상 정중앙
       *   - 마우스 이벤트 여기서 통합 처리
       ───────────────────────────────────────── */}
      <div
        ref={wrapperRef}
        className="flex-1 overflow-hidden flex items-center justify-center bg-gray-900 select-none"
        style={{ cursor: drawMode ? 'crosshair' : didDrag.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          pointerDown.current = null; didDrag.current = false; panOrigin.current = null;
          setCursorPt(null);
        }}
        onDoubleClick={handleDblClick}
        onWheel={handleWheel}
      >
        {/* ─────────────────────────────────────
         * 이미지 + SVG 래퍼
         *
         * ★ 핵심 포인트:
         *   1. width/height = 원본 px (IMG_W × IMG_H) 로 고정
         *      → 브라우저가 작은 컨테이너에 맞춰 이미지를 축소 캐싱하지 않음
         *   2. transform-origin: 50% 50% (기본값, 명시적으로 설정)
         *      → 줌인/줌아웃이 항상 중앙 기준 → 검은 여백 없음
         *   3. will-change 제거 → 중간 레스터화 레이어 생성 안 함 → 화질 유지
         *   4. translate(offset) scale(scale) 순서
         *      → offset이 먼저 이동, scale이 중앙 기준 적용
         ─────────────────────────────────────── */}
        <div
          style={{
            width: IMG_W,
            height: IMG_H,
            flexShrink: 0,
            position: 'relative',
            transformOrigin: '50% 50%',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            // will-change 제거 (화질 저하 원인)
          }}
        >
          {/* ── img: 원본 px 고정 + 고화질 CSS ── */}
          <img
            ref={imgRef}
            src="/factory-aerial.jpg"
            alt="단양1공장 항공 조감도"
            draggable={false}
            width={IMG_W}
            height={IMG_H}
            style={{
              display: 'block',
              width:  IMG_W,
              height: IMG_H,
              /*
               * image-rendering: pixelated
               *   → 브라우저 안티앨리어싱(스무딩) 완전 차단
               *   → 원본 픽셀 그대로 표시 (줌인 시 선명)
               *
               * backface-visibility: hidden
               *   → GPU 레이어 분리 방지 → 중간 레스터화 억제
               *
               * transform-style: preserve-3d
               *   → 상위 transform 과 동일 compositing layer 유지
               */
              imageRendering: 'pixelated',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
              userSelect: 'none',
              pointerEvents: 'none',
            } as React.CSSProperties}
          />

          {/* ── SVG 오버레이: 이미지와 동일 좌표계 ── */}
          <svg
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: IMG_W, height: IMG_H,
              overflow: 'visible',
              pointerEvents: drawMode ? 'none' : 'auto',
            }}
          >
            {/* 완성 폴리곤 */}
            {polygons.map(poly => {
              const isHov = hoveredId === poly.id;
              const { cx, cy } = centroid(poly.points);
              const lw = Math.min(Math.max(poly.name.length * 8 + 20, 64), 130);
              return (
                <g key={poly.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredId(poly.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={e => onPolyClick(poly, e as unknown as React.MouseEvent)}
                >
                  <polygon
                    points={toSvgPoints(poly.points)}
                    fill={poly.color}
                    fillOpacity={isHov ? 0.5 : 0.28}
                    stroke={poly.color}
                    strokeWidth={isHov ? 2.5 : 1.8}
                    strokeLinejoin="round"
                    style={{ transition: 'fill-opacity .12s, stroke-width .12s' }}
                  />
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={cx - lw/2} y={cy - 12} width={lw} height={24} rx={6}
                      fill={isHov ? poly.color : 'rgba(0,0,0,0.65)'}
                      style={{ transition: 'fill .12s' }}/>
                    <text x={cx} y={cy + 4.5} textAnchor="middle"
                      fontSize={12} fontWeight="700" fill="white"
                      fontFamily="-apple-system,'Malgun Gothic',sans-serif">
                      {poly.name}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Draft 그리기 중 */}
            {draft.length > 0 && (
              <g style={{ pointerEvents: 'none' }}>
                {draft.length >= 3 && (
                  <polygon points={toSvgPoints(draft)}
                    fill="#f97316" fillOpacity={0.15} stroke="none"/>
                )}
                {draft.map((pt, i) => i === 0 ? null : (
                  <line key={`s${i}`}
                    x1={draft[i-1].x*IMG_W} y1={draft[i-1].y*IMG_H}
                    x2={pt.x*IMG_W}         y2={pt.y*IMG_H}
                    stroke="#f97316" strokeWidth={2} strokeLinecap="round"/>
                ))}
                {cursorPt && (
                  <line
                    x1={draft[draft.length-1].x*IMG_W} y1={draft[draft.length-1].y*IMG_H}
                    x2={cursorPt.x*IMG_W}              y2={cursorPt.y*IMG_H}
                    stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.65}/>
                )}
                {draft.map((pt, i) => {
                  const isFirst = i === 0;
                  const hi = isFirst && nearFirst;
                  return (
                    <circle key={`d${i}`}
                      cx={pt.x*IMG_W} cy={pt.y*IMG_H}
                      r={isFirst ? (hi ? 11 : 7) : 4.5}
                      fill={isFirst ? (hi ? '#22c55e' : '#f97316') : '#f97316'}
                      stroke="white" strokeWidth={2}
                      style={{ transition: 'r .1s, fill .1s',
                        filter: hi ? 'drop-shadow(0 0 5px #22c55e)' : 'none' }}/>
                  );
                })}
                {nearFirst && (
                  <circle cx={draft[0].x*IMG_W} cy={draft[0].y*IMG_H} r={16}
                    fill="none" stroke="#22c55e" strokeWidth={2}
                    strokeDasharray="4 3" opacity={0.8}/>
                )}
              </g>
            )}
          </svg>
        </div>

        {/* ── 우측 하단: 건물 목록 패널 ── */}
        {polygons.length > 0 && (
          <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200 p-3"
            style={{ minWidth: 180, maxWidth: 230, zIndex: 20 }}>
            <p className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
              등록 건물 영역
            </p>
            <div className="space-y-1.5">
              {polygons.map(poly => (
                <div key={poly.id}
                  className="flex items-center gap-2 text-xs group cursor-pointer rounded px-1 py-0.5 hover:bg-gray-50"
                  onMouseEnter={() => setHoveredId(poly.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: poly.color }}/>
                  <span className="flex-1 text-gray-700 font-medium truncate">{poly.name}</span>
                  <button
                    onClick={() => setPolygons(p => p.filter(x => x.id !== poly.id))}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                    title="삭제"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 좌측 하단: 조작 힌트 ── */}
        <div className="absolute bottom-4 left-4 text-white/60 text-xs rounded-lg px-2.5 py-1.5 pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.35)', zIndex: 20 }}>
          🖱 휠: 줌 &nbsp;·&nbsp; 드래그: 이동 &nbsp;·&nbsp; ESC: 취소
        </div>

        {/* ── 우측 상단: 줌 레벨 ── */}
        <div className="absolute top-3 right-3 text-white/50 text-xs font-mono rounded px-2 py-1 pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.3)', zIndex: 20 }}>
          ×{scale.toFixed(2)}
        </div>
      </div>
    </div>
  );
}
