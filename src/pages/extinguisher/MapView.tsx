import { useState, useRef, useCallback, useEffect, WheelEvent } from 'react';
import type { BuildingPolygon, Point } from '../../types/polygon';

/* ────────────────────────────────────────────
   상수
──────────────────────────────────────────── */
const IMG_W = 1024;          // 원본 이미지 가로 px
const IMG_H = 768;           // 원본 이미지 세로 px
const MIN_SCALE = 0.3;
const MAX_SCALE = 8;
const CLOSE_THRESHOLD_PX = 14; // 시작점 닫기 임계값 (원본 이미지 px 기준)
const DRAG_THRESHOLD_PX = 5;   // 드래그 vs 클릭 판별 거리

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
  '#84cc16', '#14b8a6', '#a855f7', '#fb923c',
];

/* ────────────────────────────────────────────
   유틸
──────────────────────────────────────────── */
/** SVG polygon points 속성 문자열 (원본 px 좌표) */
function toSvgPoints(pts: Point[]): string {
  return pts.map(p => `${p.x * IMG_W},${p.y * IMG_H}`).join(' ');
}

/** 폴리곤 무게중심 (원본 px) */
function centroid(pts: Point[]): { cx: number; cy: number } {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length * IMG_W;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length * IMG_H;
  return { cx, cy };
}

/** 두 점 사이 거리 (원본 px) */
function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 * IMG_W ** 2 + (a.y - b.y) ** 2 * IMG_H ** 2);
}

/** Ray-casting: 원본 px 기준 폴리곤 내부 판별 */
function inPolygon(px: number, py: number, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x * IMG_W, yi = pts[i].y * IMG_H;
    const xj = pts[j].x * IMG_W, yj = pts[j].y * IMG_H;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/* ────────────────────────────────────────────
   컴포넌트
──────────────────────────────────────────── */
export default function MapView() {
  /* ── 줌 / 패닝 ── */
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  /* ── 폴리곤 ── */
  const [polygons, setPolygons] = useState<BuildingPolygon[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursorPt, setCursorPt] = useState<Point | null>(null); // 미리보기 커서 좌표
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /* ── ref ── */
  const wrapperRef = useRef<HTMLDivElement>(null);  // 뷰포트 컨테이너
  const imgRef = useRef<HTMLImageElement>(null);     // 실제 img 엘리먼트

  // 드래그 판별용 ref (state 대신 ref → 렌더 불필요)
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  // 패닝용 ref
  const panOrigin = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  /* ────────────────────────────────────────
     핵심: 화면 좌표 → 원본 이미지 비율 좌표
     
     원리:
       1. imgRef.getBoundingClientRect() → 브라우저 화면에서 img 태그의 실제 위치/크기
       2. (clientX - rect.left) / rect.width  → 0~1 비율 좌표
       rect.width = IMG_W * scale (CSS transform으로 확대된 크기)
       이 계산이 scale을 자동으로 보정하므로 별도의 /scale 불필요
  ─────────────────────────────────────────── */
  const clientToImgRatio = useCallback((clientX: number, clientY: number): Point | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect(); // ← scale 변환 후 실제 화면 위치
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    // 이미지 밖 클릭 방지
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  /* ────────────────────────────────────────
     마우스 휠: 줌 (마우스 위치 중심)
  ─────────────────────────────────────────── */
  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    // 마우스 커서를 중심으로 줌
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setScale(prev => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * factor));
      const ratio = next / prev;
      setOffset(o => ({
        x: mx - (mx - o.x) * ratio,
        y: my - (my - o.y) * ratio,
      }));
      return next;
    });
  }, []);

  /* ────────────────────────────────────────
     마우스 다운: 패닝 시작 기록
  ─────────────────────────────────────────── */
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
    if (!drawMode) {
      panOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    }
  }, [drawMode, offset]);

  /* ────────────────────────────────────────
     마우스 이동: 패닝 + 미리보기 커서
  ─────────────────────────────────────────── */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 드래그 판별
    if (pointerDown.current) {
      const dx = e.clientX - pointerDown.current.x;
      const dy = e.clientY - pointerDown.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
        isDragging.current = true;
      }
    }
    // 패닝
    if (!drawMode && panOrigin.current && isDragging.current) {
      const { mx, my, ox, oy } = panOrigin.current;
      setOffset({ x: ox + (e.clientX - mx), y: oy + (e.clientY - my) });
    }
    // 그리기 미리보기 커서
    if (drawMode) {
      const pt = clientToImgRatio(e.clientX, e.clientY);
      setCursorPt(pt);
    }
  }, [drawMode, clientToImgRatio]);

  /* ────────────────────────────────────────
     마우스 업: 클릭 확정 (드래그가 아닌 경우만)
  ─────────────────────────────────────────── */
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const wasDragging = isDragging.current;
    pointerDown.current = null;
    isDragging.current = false;
    panOrigin.current = null;

    if (!drawMode) return;         // 일반 모드: 클릭 처리 안 함 (폴리곤 클릭은 SVG에서)
    if (wasDragging) return;       // 드래그였으면 점 추가 안 함

    const pt = clientToImgRatio(e.clientX, e.clientY);
    if (!pt) return;

    // 시작점 근처면 닫기
    if (draft.length >= 3 && dist(pt, draft[0]) < CLOSE_THRESHOLD_PX) {
      closeDraft(draft);
      return;
    }

    setDraft(prev => [...prev, pt]);
  }, [drawMode, draft, clientToImgRatio]);

  /* ────────────────────────────────────────
     더블클릭: 닫기
  ─────────────────────────────────────────── */
  const handleDblClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawMode || draft.length < 3) return;
    e.preventDefault();
    closeDraft(draft);
  }, [drawMode, draft]);

  /* ────────────────────────────────────────
     draft 닫기 → 이름 입력 → 저장
  ─────────────────────────────────────────── */
  const closeDraft = useCallback((currentDraft: Point[]) => {
    const name = window.prompt('건물 이름을 입력하세요\n예: 관리동, 원료창고, 생산1동', '');
    if (!name || !name.trim()) return; // 취소 시 draft 유지

    const color = PALETTE[polygons.length % PALETTE.length];
    setPolygons(prev => [...prev, {
      id: `poly-${Date.now()}`,
      name: name.trim(),
      points: currentDraft,
      color,
    }]);
    setDraft([]);
    setCursorPt(null);
    setDrawMode(false);
  }, [polygons.length]);

  /* ────────────────────────────────────────
     ESC 키: 그리기 취소
  ─────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawMode) {
        setDraft([]);
        setCursorPt(null);
        setDrawMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawMode]);

  /* ────────────────────────────────────────
     그리기 모드 토글
  ─────────────────────────────────────────── */
  const toggleDrawMode = () => {
    setDrawMode(prev => {
      if (!prev) { setDraft([]); setCursorPt(null); }
      else       { setDraft([]); setCursorPt(null); }
      return !prev;
    });
  };

  /* ────────────────────────────────────────
     완성 폴리곤 클릭 (일반 모드)
     - SVG polygon에서 stopPropagation 처리
  ─────────────────────────────────────────── */
  const handlePolygonClick = useCallback((poly: BuildingPolygon, e: React.MouseEvent) => {
    if (drawMode) return;
    e.stopPropagation();
    // 클릭 vs 드래그 판별 (패닝 후 오작동 방지)
    if (isDragging.current) return;
    alert(`[${poly.name}]이(가) 선택되었습니다.\n\n✅ 다음 단계에서 1층/2층 도면 선택 UI로 넘어갈 예정입니다.`);
  }, [drawMode]);

  /* ────────────────────────────────────────
     시작점 근접 여부 (시각 강조)
  ─────────────────────────────────────────── */
  const nearFirst = draft.length >= 3 && cursorPt !== null
    && dist(cursorPt, draft[0]) < CLOSE_THRESHOLD_PX;

  /* ────────────────────────────────────────
     뷰 리셋
  ─────────────────────────────────────────── */
  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  /* ────────────────────────────────────────
     렌더
  ─────────────────────────────────────────── */
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 108px)' }}>

      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">🗺 공장 조감도</span>
          <span className="text-xs text-gray-400">· 태경BK 단양1공장</span>
          <span className="text-xs text-gray-300">|</span>
          <span className="text-xs text-gray-400">{IMG_W}×{IMG_H}px 원본</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 줌 컨트롤 */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
            <button onClick={() => { const n = Math.min(MAX_SCALE, scale * 1.25); const r = n / scale; setOffset(o => ({ x: o.x, y: o.y })); setScale(n); }}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-base leading-none">+</button>
            <span className="text-xs text-gray-500 w-14 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.max(MIN_SCALE, s * 0.8))}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-base leading-none">−</button>
            <button onClick={resetView} className="ml-1 text-gray-500 hover:text-blue-600 px-1" title="뷰 초기화">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* 등록 건물 수 */}
          {polygons.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
              건물 {polygons.length}개 등록
            </span>
          )}

          {/* 건물 영역 지정 버튼 */}
          <button
            onClick={toggleDrawMode}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all select-none',
              drawMode
                ? 'bg-orange-500 text-white shadow-lg ring-2 ring-orange-300'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>클릭</strong>으로 꼭짓점 추가.&nbsp;
            {draft.length >= 3
              ? <><strong className="text-green-700">초록 원</strong> 클릭 또는 <strong>더블클릭</strong>으로 영역 완성</>
              : `최소 3개 필요 (현재 ${draft.length}개)`
            }
            &nbsp;· 줌인 후에도 클릭 위치가 정확히 반영됩니다.
          </span>
        </div>
      )}

      {/* ── 뷰포트 (overflow hidden) ── */}
      <div
        ref={wrapperRef}
        className="flex-1 relative overflow-hidden bg-gray-900 select-none"
        style={{ cursor: drawMode ? 'crosshair' : isDragging.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          pointerDown.current = null;
          isDragging.current = false;
          panOrigin.current = null;
          setCursorPt(null);
        }}
        onDoubleClick={handleDblClick}
        onWheel={handleWheel}
      >
        {/* ── 이미지 + SVG 오버레이 (transform 변환) ── */}
        <div
          style={{
            position: 'absolute',
            /*
             * ★ 핵심: 원본 크기(1024×768)를 기준으로 transform-origin을 left top에 놓고
             *   translate + scale 적용.
             *   이미지 자체는 width/height를 원본 px로 고정 → 브라우저가 임의 축소 후
             *   재확대하는 blurring 원천 차단.
             */
            transformOrigin: '0 0',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            willChange: 'transform',
            width: IMG_W,
            height: IMG_H,
          }}
        >
          {/* 항공 사진 – 원본 1024×768 고정 */}
          <img
            ref={imgRef}
            src="/factory-aerial.jpg"
            alt="단양1공장 항공 조감도"
            draggable={false}
            width={IMG_W}
            height={IMG_H}
            style={{
              display: 'block',
              width: IMG_W,
              height: IMG_H,
              // ── 고화질 렌더링 강제 ──
              imageRendering: 'high-quality' as React.CSSProperties['imageRendering'],
              WebkitOptimizeContrast: true,
              userSelect: 'none',
              pointerEvents: 'none', // 이미지 자체 이벤트 차단 → 부모 div에서 처리
            } as React.CSSProperties}
          />

          {/* SVG 오버레이 – 이미지와 동일한 좌표계(원본 px) */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: IMG_W,
              height: IMG_H,
              overflow: 'visible',
              pointerEvents: drawMode ? 'none' : 'auto', // 그리기 모드에서는 부모 div가 이벤트 처리
            }}
          >
            {/* ── 완성 폴리곤 ── */}
            {polygons.map(poly => {
              const isHovered = hoveredId === poly.id;
              const { cx, cy } = centroid(poly.points);
              const labelW = Math.min(Math.max(poly.name.length * 7.5 + 16, 60), 120);

              return (
                <g key={poly.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredId(poly.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => handlePolygonClick(poly, e as unknown as React.MouseEvent)}
                >
                  <polygon
                    points={toSvgPoints(poly.points)}
                    fill={poly.color}
                    fillOpacity={isHovered ? 0.5 : 0.28}
                    stroke={poly.color}
                    strokeWidth={isHovered ? 2.5 : 1.8}
                    strokeLinejoin="round"
                    style={{ transition: 'fill-opacity 0.12s, stroke-width 0.12s' }}
                  />
                  {/* 건물 라벨 */}
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={cx - labelW / 2}
                      y={cy - 12}
                      width={labelW}
                      height={24}
                      rx={6}
                      fill={isHovered ? poly.color : 'rgba(0,0,0,0.65)'}
                      style={{ transition: 'fill 0.12s' }}
                    />
                    <text
                      x={cx}
                      y={cy + 4.5}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight="700"
                      fill="white"
                      fontFamily="-apple-system, 'Malgun Gothic', sans-serif"
                    >
                      {poly.name}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* ── Draft 그리기 중 ── */}
            {draft.length > 0 && (
              <g style={{ pointerEvents: 'none' }}>
                {/* 채워진 영역 미리보기 */}
                {draft.length >= 3 && (
                  <polygon
                    points={toSvgPoints(draft)}
                    fill="#f97316"
                    fillOpacity={0.18}
                    stroke="none"
                  />
                )}

                {/* 확정 선분 */}
                {draft.map((pt, i) => {
                  if (i === 0) return null;
                  const prev = draft[i - 1];
                  return (
                    <line
                      key={`seg-${i}`}
                      x1={prev.x * IMG_W} y1={prev.y * IMG_H}
                      x2={pt.x * IMG_W}   y2={pt.y * IMG_H}
                      stroke="#f97316"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  );
                })}

                {/* 커서까지 미리보기 점선 */}
                {cursorPt && (
                  <line
                    x1={draft[draft.length - 1].x * IMG_W}
                    y1={draft[draft.length - 1].y * IMG_H}
                    x2={cursorPt.x * IMG_W}
                    y2={cursorPt.y * IMG_H}
                    stroke="#f97316"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    opacity={0.65}
                  />
                )}

                {/* 꼭짓점 점 */}
                {draft.map((pt, i) => {
                  const isFirst = i === 0;
                  const highlight = isFirst && nearFirst;
                  return (
                    <circle
                      key={`dot-${i}`}
                      cx={pt.x * IMG_W}
                      cy={pt.y * IMG_H}
                      r={isFirst ? (highlight ? 11 : 7) : 4.5}
                      fill={isFirst ? (highlight ? '#22c55e' : '#f97316') : '#f97316'}
                      stroke="white"
                      strokeWidth={2}
                      style={{
                        transition: 'r 0.1s, fill 0.1s',
                        filter: highlight ? 'drop-shadow(0 0 5px #22c55e)' : 'none',
                      }}
                    />
                  );
                })}

                {/* 닫기 힌트 링 */}
                {nearFirst && (
                  <circle
                    cx={draft[0].x * IMG_W}
                    cy={draft[0].y * IMG_H}
                    r={16}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    opacity={0.8}
                  />
                )}
              </g>
            )}
          </svg>
        </div>

        {/* ── 우측 하단: 건물 목록 패널 ── */}
        {polygons.length > 0 && (
          <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200 p-3"
            style={{ minWidth: 180, maxWidth: 230, zIndex: 10 }}>
            <p className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
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
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: poly.color }} />
                  <span className="flex-1 text-gray-700 font-medium truncate">{poly.name}</span>
                  <button
                    onClick={() => setPolygons(prev => prev.filter(p => p.id !== poly.id))}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                    title="삭제"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 좌측 하단: 조작 힌트 ── */}
        <div
          className="absolute bottom-4 left-4 text-white/60 text-xs rounded-lg px-2.5 py-1.5 pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.35)', zIndex: 10 }}
        >
          🖱 휠: 줌 &nbsp;·&nbsp; 드래그: 이동 &nbsp;·&nbsp; ESC: 그리기 취소
        </div>

        {/* ── 줌 레벨 표시 (우측 상단 오버레이) ── */}
        <div
          className="absolute top-3 right-3 text-white/50 text-xs font-mono rounded px-2 py-1 pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.3)', zIndex: 10 }}
        >
          ×{scale.toFixed(2)}
        </div>
      </div>
    </div>
  );
}
