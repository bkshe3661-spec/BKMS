import { useState, useRef, useCallback, useEffect } from 'react';
import type { BuildingPolygon, Point } from '../../types/polygon';
import {
  loadPolygons, addPolygon, removePolygon,
} from '../../services/polygonService';

/* ─────────────────────────────────────────
   상수
───────────────────────────────────────── */
const IMG_W = 1024;
const IMG_H = 768;
const MAX_SCALE = 8;
const CLOSE_THRESHOLD = 14;  // 원본 px 기준 시작점 닫기 임계값
const DRAG_THRESHOLD  = 5;   // 화면 px 기준 드래그 판별

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

/** 두 Point 사이 거리 – 원본 이미지 px 기준 */
function imgDist(a: Point, b: Point): number {
  return Math.sqrt(((a.x - b.x) * IMG_W) ** 2 + ((a.y - b.y) * IMG_H) ** 2);
}

/* ─────────────────────────────────────────
   컴포넌트
───────────────────────────────────────── */
export default function MapView() {

  /* ── 뷰포트 ref + contain 모드 초기 scale ──────────────────
   *  contain: scale = min(viewW / IMG_W, viewH / IMG_H)
   *  → 전체 조감도가 여백 없이 도면 영역에 딱 맞게 표시
   *  검은 여백이 생기더라도 이미지 전체가 한눈에 보임
   ──────────────────────────────────────────────────────── */
  const canvasRef = useRef<HTMLDivElement>(null);   // 도면 뷰포트
  const imgRef    = useRef<HTMLImageElement>(null);

  const [containScale, setContainScale] = useState(1); // contain 배율
  const [scale,  setScale]  = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  /** contain scale 계산 + 적용 */
  const applyContain = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const cs = Math.min(el.clientWidth / IMG_W, el.clientHeight / IMG_H);
    setContainScale(cs);
    setScale(cs);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    applyContain();
    const ro = new ResizeObserver(applyContain);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [applyContain]);

  /* ── localStorage 연동 폴리곤 상태 ── */
  const [polygons,  setPolygons]  = useState<BuildingPolygon[]>(() => loadPolygons());
  const [drawMode,  setDrawMode]  = useState(false);
  const [draft,     setDraft]     = useState<Point[]>([]);
  const [cursorPt,  setCursorPt]  = useState<Point | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ── 드래그/클릭 판별 ref ── */
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const didDrag     = useRef(false);
  const panOrigin   = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  /* ── 오프셋 범위 제한 ──────────────────────────────────────
   *  transform-origin: center center 기준
   *  이미지가 뷰포트를 벗어나는 정도만큼 패닝 허용
   ──────────────────────────────────────────────────────── */
  const clampOffset = useCallback((ox: number, oy: number, sc: number) => {
    const el = canvasRef.current;
    if (!el) return { x: ox, y: oy };
    const maxX = Math.max(0, (IMG_W * sc - el.clientWidth)  / 2);
    const maxY = Math.max(0, (IMG_H * sc - el.clientHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, []);

  /* ── 핵심 좌표 변환 ─────────────────────────────────────────
   *  imgRef.getBoundingClientRect() → CSS transform 후 실제 화면 위치
   *  (clientX - rect.left) / rect.width = 이미지 내 0~1 비율
   *  scale / offset 자동 반영, 별도 보정 불필요
   ──────────────────────────────────────────────────────── */
  const clientToRatio = useCallback((cx: number, cy: number): Point | null => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const x = (cx - r.left) / r.width;
    const y = (cy - r.top)  / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  /* ── 휠 줌 (마우스 커서 위치 중심) ── */
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setScale(prev => {
      const next = Math.max(containScale, Math.min(MAX_SCALE, prev * factor));
      const el = canvasRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const mx   = e.clientX - rect.left - rect.width  / 2;
        const my   = e.clientY - rect.top  - rect.height / 2;
        const ratio = next / prev;
        setOffset(o => clampOffset(
          o.x * ratio + mx * (1 - ratio),
          o.y * ratio + my * (1 - ratio),
          next,
        ));
      }
      return next;
    });
  }, [containScale, clampOffset]);

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
      setOffset(clampOffset(ox + (e.clientX - mx), oy + (e.clientY - my), scale));
    }
    if (drawMode) setCursorPt(clientToRatio(e.clientX, e.clientY));
  }, [drawMode, scale, clientToRatio, clampOffset]);

  /* ── 마우스 업: 클릭 확정 ── */
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
      triggerClose(draft); return;
    }
    setDraft(prev => [...prev, pt]);
  }, [drawMode, draft, clientToRatio]);

  /* ── 더블클릭: 닫기 ── */
  const handleDblClick = useCallback((e: React.MouseEvent) => {
    if (!drawMode || draft.length < 3) return;
    e.preventDefault();
    triggerClose(draft);
  }, [drawMode, draft]);

  /* ── Draft 닫기 → 이름 입력 → localStorage 저장 ── */
  const triggerClose = useCallback((cur: Point[]) => {
    const name = window.prompt('건물 이름을 입력하세요\n예: 관리동, 원료창고, 생산1동', '');
    if (!name?.trim()) return;
    const color = PALETTE[polygons.length % PALETTE.length];
    const newPoly: BuildingPolygon = {
      id: `poly-${Date.now()}`,
      name: name.trim(),
      points: cur,
      color,
    };
    // 🔄 localStorage에 즉시 저장
    const next = addPolygon(newPoly);
    setPolygons(next);
    setDraft([]);
    setCursorPt(null);
    setDrawMode(false);
    setSelectedId(newPoly.id);
  }, [polygons.length]);

  /* ── 폴리곤 삭제 → localStorage 동기 ── */
  const handleDelete = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = removePolygon(id);
    setPolygons(next);
    if (selectedId === id) setSelectedId(null);
    if (hoveredId === id) setHoveredId(null);
  }, [selectedId, hoveredId]);

  /* ── ESC 키 ── */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawMode) {
        setDraft([]); setCursorPt(null); setDrawMode(false);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [drawMode]);

  /* ── 그리기 모드 토글 ── */
  const toggleDraw = () => setDrawMode(p => { setDraft([]); setCursorPt(null); return !p; });

  /* ── 뷰 리셋 (contain 상태로 복귀) ── */
  const resetView = () => { setScale(containScale); setOffset({ x: 0, y: 0 }); };

  /* ── 사이드바 건물 클릭 → 도면 포커스 이동 ────────────────
   *  폴리곤 무게중심이 뷰포트 중앙에 오도록 offset 계산
   *  scale은 적당한 배율(2x)로 줌인
   ──────────────────────────────────────────────────────── */
  const focusPolygon = useCallback((poly: BuildingPolygon) => {
    setSelectedId(poly.id);
    const { cx, cy } = centroid(poly.points);
    const targetScale = Math.min(MAX_SCALE, Math.max(containScale * 2.5, 2));

    // 무게중심이 뷰포트 정중앙에 오는 offset
    // center 기준 변환: offset = -(imgPoint - IMG_W/2) * scale
    const nx = -(cx - IMG_W / 2) * targetScale;
    const ny = -(cy - IMG_H / 2) * targetScale;

    setScale(targetScale);
    setOffset(clampOffset(nx, ny, targetScale));
  }, [containScale, clampOffset]);

  /* ── 폴리곤 클릭 (일반 모드) ── */
  const onPolyClick = useCallback((poly: BuildingPolygon, e: React.MouseEvent) => {
    if (drawMode) return;
    e.stopPropagation();
    if (didDrag.current) return;
    setSelectedId(poly.id);
    alert(`[${poly.name}]이(가) 선택되었습니다.\n\n✅ 다음 단계에서 1층/2층 도면 선택 UI로 넘어갈 예정입니다.`);
  }, [drawMode]);

  /* ── 시작점 근접 여부 ── */
  const nearFirst = draft.length >= 3 && cursorPt !== null
    && imgDist(cursorPt, draft[0]) < CLOSE_THRESHOLD;

  /* ─────────────────────────────────────────
   * 렌더
   ───────────────────────────────────────── */
  return (
    /* 전체 레이아웃: 좌(도면) + 우(사이드바) */
    <div className="flex" style={{ height: 'calc(100vh - 108px)' }}>

      {/* ══════════════════════════════════════
          LEFT: 도면 영역
      ══════════════════════════════════════ */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* ── 툴바 ── */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">🗺 공장 조감도</span>
            <span className="text-xs text-gray-400">· 태경BK 단양1공장</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 줌 컨트롤 */}
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg px-2 py-1">
              <button
                onClick={() => setScale(s => { const n = Math.min(MAX_SCALE, s * 1.25); setOffset(o => clampOffset(o.x, o.y, n)); return n; })}
                className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg"
              >+</button>
              <span className="text-xs text-gray-500 w-14 text-center tabular-nums">{Math.round(scale * 100)}%</span>
              <button
                onClick={() => setScale(s => { const n = Math.max(containScale, s * 0.8); setOffset(o => clampOffset(o.x, o.y, n)); return n; })}
                className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg"
              >−</button>
              <button onClick={resetView} className="ml-1 text-gray-400 hover:text-blue-600 px-1" title="전체 보기">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                </svg>
              </button>
            </div>
            {/* 그리기 모드 버튼 */}
            <button
              onClick={toggleDraw}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all select-none',
                drawMode
                  ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700',
              ].join(' ')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
              {drawMode ? '✏️ 그리기 중… (ESC 취소)' : '✏️ 건물 영역 지정'}
            </button>
          </div>
        </div>

        {/* ── 그리기 안내 배너 ── */}
        {drawMode && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-50 border-b border-orange-200 text-orange-700 text-xs flex-shrink-0">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>
              <strong>클릭</strong>으로 꼭짓점 추가 ·&nbsp;
              {draft.length >= 3
                ? <><strong className="text-green-700">초록 원</strong> 또는 <strong>더블클릭</strong>으로 완성</>
                : `최소 3개 필요 (현재 ${draft.length}개)`}
              &nbsp;· 드래그로 이동, ESC로 취소
            </span>
          </div>
        )}

        {/* ── 도면 뷰포트 ─────────────────────────────────────
         *  overflow: hidden + flex center
         *  → 이미지가 항상 도면 영역 정중앙에 contain 배치
         ──────────────────────────────────────────────────── */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-hidden flex items-center justify-center bg-gray-900 select-none"
          style={{ cursor: drawMode ? 'crosshair' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            pointerDown.current = null;
            didDrag.current = false;
            panOrigin.current = null;
            setCursorPt(null);
          }}
          onDoubleClick={handleDblClick}
          onWheel={handleWheel}
        >
          {/* ── 이미지 + SVG 변환 컨테이너 ─────────────────────
           *  ★ 핵심 설계:
           *    - width/height = 원본 px (브라우저 축소 캐싱 차단)
           *    - transform-origin: 50% 50% (중앙 기준 줌)
           *    - will-change 제거 (중간 레스터화 레이어 방지)
           *    - translate + scale 순서 적용
           ─────────────────────────────────────────────────── */}
          <div
            style={{
              width: IMG_W,
              height: IMG_H,
              flexShrink: 0,
              position: 'relative',
              transformOrigin: '50% 50%',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          >
            {/* img: 원본 px 고정 + 고화질 CSS */}
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
                /* ★ 화질 핵심:
                 *   pixelated → 브라우저 안티앨리어싱 완전 차단
                 *   backfaceVisibility → GPU 레이어 분리 방지
                 *   transformStyle preserve-3d → 상위와 동일 compositing
                 *   will-change 없음 → 중간 레스터화 억제
                 */
                imageRendering: 'pixelated',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transformStyle: 'preserve-3d',
                userSelect: 'none',
                pointerEvents: 'none',
              } as React.CSSProperties}
            />

            {/* SVG 오버레이: 이미지와 동일 좌표계 (원본 px) */}
            <svg
              style={{
                position: 'absolute',
                top: 0, left: 0,
                width: IMG_W, height: IMG_H,
                overflow: 'visible',
                pointerEvents: drawMode ? 'none' : 'auto',
              }}
            >
              {/* ── 완성 폴리곤 ── */}
              {polygons.map(poly => {
                const isHov = hoveredId === poly.id || selectedId === poly.id;
                const isSel = selectedId === poly.id;
                const { cx, cy } = centroid(poly.points);
                const lw = Math.min(Math.max(poly.name.length * 8 + 20, 64), 140);
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
                      fillOpacity={isHov ? 0.52 : 0.28}
                      stroke={poly.color}
                      strokeWidth={isSel ? 3 : isHov ? 2.5 : 1.8}
                      strokeLinejoin="round"
                      strokeDasharray={isSel ? '8 3' : 'none'}
                      style={{ transition: 'fill-opacity .12s, stroke-width .12s' }}
                    />
                    {/* 선택 시 외곽 글로우 */}
                    {isSel && (
                      <polygon
                        points={toSvgPoints(poly.points)}
                        fill="none"
                        stroke={poly.color}
                        strokeWidth={6}
                        strokeOpacity={0.25}
                        strokeLinejoin="round"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* 건물 라벨 */}
                    <g style={{ pointerEvents: 'none' }}>
                      <rect
                        x={cx - lw / 2} y={cy - 13}
                        width={lw} height={26} rx={7}
                        fill={isHov ? poly.color : 'rgba(0,0,0,0.68)'}
                        style={{ transition: 'fill .12s' }}
                      />
                      <text
                        x={cx} y={cy + 5}
                        textAnchor="middle"
                        fontSize={12} fontWeight="700" fill="white"
                        fontFamily="-apple-system,'Malgun Gothic',sans-serif"
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
                  {draft.length >= 3 && (
                    <polygon points={toSvgPoints(draft)}
                      fill="#f97316" fillOpacity={0.15} stroke="none"/>
                  )}
                  {draft.map((pt, i) => i === 0 ? null : (
                    <line key={`s${i}`}
                      x1={draft[i-1].x*IMG_W} y1={draft[i-1].y*IMG_H}
                      x2={pt.x*IMG_W}          y2={pt.y*IMG_H}
                      stroke="#f97316" strokeWidth={2} strokeLinecap="round"/>
                  ))}
                  {cursorPt && (
                    <line
                      x1={draft[draft.length-1].x*IMG_W} y1={draft[draft.length-1].y*IMG_H}
                      x2={cursorPt.x*IMG_W}               y2={cursorPt.y*IMG_H}
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
                    <circle cx={draft[0].x*IMG_W} cy={draft[0].y*IMG_H} r={17}
                      fill="none" stroke="#22c55e" strokeWidth={2}
                      strokeDasharray="4 3" opacity={0.85}/>
                  )}
                </g>
              )}
            </svg>
          </div>

          {/* 좌측 하단 힌트 */}
          <div
            className="absolute bottom-4 left-4 text-white/55 text-xs rounded-lg px-2.5 py-1.5 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.38)', zIndex: 20 }}
          >
            🖱 휠: 줌 &nbsp;·&nbsp; 드래그: 이동 &nbsp;·&nbsp; ESC: 취소
          </div>
          {/* 줌 레벨 */}
          <div
            className="absolute top-3 left-3 text-white/50 text-xs font-mono rounded px-2 py-1 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.32)', zIndex: 20 }}
          >
            ×{scale.toFixed(2)}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          RIGHT: 사이드바
      ══════════════════════════════════════ */}
      <div
        className="flex-shrink-0 flex flex-col bg-white border-l border-gray-200 shadow-lg"
        style={{ width: 240 }}
      >
        {/* 사이드바 헤더 */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-800">등록 건물 영역</p>
                <p className="text-[10px] text-gray-400">클릭하면 도면 포커스</p>
              </div>
            </div>
            {polygons.length > 0 && (
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                {polygons.length}개
              </span>
            )}
          </div>
        </div>

        {/* 건물 목록 */}
        <div className="flex-1 overflow-y-auto py-2">
          {polygons.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 text-gray-400">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
              </svg>
              <p className="text-xs font-medium text-gray-400">등록된 건물이 없습니다</p>
              <p className="text-[11px] text-gray-300 mt-1">
                ✏️ 건물 영역 지정 버튼으로<br/>폴리곤을 그려보세요
              </p>
            </div>
          ) : (
            <ul className="px-2 space-y-1">
              {polygons.map((poly, idx) => {
                const isSel = selectedId === poly.id;
                const isHov = hoveredId === poly.id;
                return (
                  <li key={poly.id}>
                    <button
                      onClick={() => focusPolygon(poly)}
                      onMouseEnter={() => setHoveredId(poly.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={[
                        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all',
                        isSel
                          ? 'bg-blue-50 ring-1 ring-blue-300'
                          : isHov
                            ? 'bg-gray-50'
                            : 'hover:bg-gray-50',
                      ].join(' ')}
                    >
                      {/* 색상 인디케이터 */}
                      <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
                        <span
                          className="w-3 h-3 rounded-full ring-2 ring-white shadow"
                          style={{ backgroundColor: poly.color }}
                        />
                        <span className="text-[9px] text-gray-300 font-mono leading-none">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                      </div>

                      {/* 건물명 */}
                      <div className="flex-1 min-w-0">
                        <p className={[
                          'text-sm font-semibold truncate leading-tight',
                          isSel ? 'text-blue-700' : 'text-gray-800',
                        ].join(' ')}>
                          {poly.name}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {poly.points.length}개 꼭짓점
                        </p>
                      </div>

                      {/* 포커스 아이콘 */}
                      {isSel && (
                        <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                      )}

                      {/* 삭제 버튼 */}
                      <button
                        onClick={(e) => handleDelete(poly.id, e)}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="삭제"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                      </button>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 사이드바 하단 정보 */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 14l-4-4 1.414-1.414L11 13.172l6.586-6.586L19 8l-8 8z"/>
            </svg>
            <span>데이터 자동 저장 중 (localStorage)</span>
          </div>
          {polygons.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('모든 건물 영역을 삭제할까요?')) {
                  polygons.forEach(p => removePolygon(p.id));
                  setPolygons([]);
                  setSelectedId(null);
                }
              }}
              className="mt-2 w-full text-[11px] text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg py-1.5 transition-colors border border-dashed border-red-200 hover:border-red-300"
            >
              전체 삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
