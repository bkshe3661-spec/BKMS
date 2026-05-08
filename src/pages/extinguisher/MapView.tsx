import { useState, useRef, useCallback, useEffect } from 'react';
import type { Point, BuildingPolygon } from '../../types/polygon';

/* ── 폴리곤 색상 팔레트 ── */
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
  '#84cc16', '#14b8a6',
];

/* ── 시작점과의 거리 판단 (닫기 임계값 px) ── */
const CLOSE_THRESHOLD = 12;

/* ── 유틸: SVG points 문자열 생성 ── */
function toSvgPoints(points: Point[], w: number, h: number): string {
  return points.map(p => `${p.x * w},${p.y * h}`).join(' ');
}

/* ── 유틸: 점이 폴리곤 내부인지 판단 (Ray-casting) ── */
function isPointInPolygon(px: number, py: number, points: Point[], w: number, h: number): boolean {
  let inside = false;
  const pts = points.map(p => ({ x: p.x * w, y: p.y * h }));
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export default function MapView() {
  /* ── 줌/패닝 상태 ── */
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  /* ── 폴리곤 상태 ── */
  const [polygons, setPolygons] = useState<BuildingPolygon[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<Point[]>([]); // 현재 그리는 중인 점들
  const [mousePos, setMousePos] = useState<Point | null>(null); // 미리보기 선용
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /* ── 컨테이너 / SVG ref ── */
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  /* ── 이미지 실제 렌더링 크기 ── */
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => setImgSize({ w: img.offsetWidth, h: img.offsetHeight });
    img.addEventListener('load', update);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(img);
    return () => { img.removeEventListener('load', update); ro.disconnect(); };
  }, []);

  /* ── 이미지/SVG 위 좌표를 상대 비율로 변환 ── */
  const toRelPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg || imgSize.w === 0) return null;
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left) / imgSize.w;
    const y = (clientY - rect.top) / imgSize.h;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, [imgSize]);

  /* ── 줌: 마우스 휠 ── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.max(0.3, Math.min(5, s * delta)));
  }, []);

  /* ── 패닝: 마우스 드래그 (일반 모드만) ── */
  const handleMouseDownPan = useCallback((e: React.MouseEvent) => {
    if (drawMode) return;
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
  }, [drawMode, offset]);

  const handleMouseMovePan = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      setOffset({
        x: offsetStart.current.x + (e.clientX - panStart.current.x),
        y: offsetStart.current.y + (e.clientY - panStart.current.y),
      });
    }
  }, []);

  const handleMouseUpPan = useCallback(() => {
    isPanning.current = false;
  }, []);

  /* ── 줌 리셋 버튼 ── */
  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  /* ── 드로잉 모드 토글 ── */
  const toggleDrawMode = () => {
    setDrawMode(prev => {
      if (!prev) {
        // 그리기 모드 ON → draft 초기화
        setDraft([]);
        setMousePos(null);
      } else {
        // 그리기 모드 OFF → 작업 중인 draft 버림
        setDraft([]);
        setMousePos(null);
      }
      return !prev;
    });
  };

  /* ── SVG 마우스 이동: 미리보기 선 ── */
  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawMode) return;
    const pt = toRelPoint(e.clientX, e.clientY);
    if (pt) setMousePos(pt);
  }, [drawMode, toRelPoint]);

  /* ── SVG 클릭: 점 추가 or 닫기 ── */
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawMode) return;
    e.stopPropagation();
    const pt = toRelPoint(e.clientX, e.clientY);
    if (!pt) return;

    // 첫 번째 점과 가까우면 닫기
    if (draft.length >= 3) {
      const first = draft[0];
      const dx = (pt.x - first.x) * imgSize.w;
      const dy = (pt.y - first.y) * imgSize.h;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CLOSE_THRESHOLD) {
        closeDraft();
        return;
      }
    }

    setDraft(prev => [...prev, pt]);
  }, [drawMode, draft, imgSize, toRelPoint]);

  /* ── 더블클릭: 닫기 ── */
  const handleSvgDblClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawMode) return;
    e.preventDefault();
    if (draft.length >= 3) closeDraft();
  }, [drawMode, draft]);

  /* ── draft 닫기 → 이름 입력 → 저장 ── */
  const closeDraft = useCallback(() => {
    const name = window.prompt('건물 이름을 입력하세요 (예: 관리동)', '');
    if (!name || name.trim() === '') {
      // 취소하면 draft 유지 (계속 그리기)
      return;
    }
    const color = COLORS[polygons.length % COLORS.length];
    const newPolygon: BuildingPolygon = {
      id: `poly-${Date.now()}`,
      name: name.trim(),
      points: [...draft],
      color,
    };
    setPolygons(prev => [...prev, newPolygon]);
    setDraft([]);
    setMousePos(null);
    setDrawMode(false);
  }, [draft, polygons.length]);

  /* ── ESC 키: 그리기 취소 ── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawMode) {
        setDraft([]);
        setMousePos(null);
        setDrawMode(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [drawMode]);

  /* ── 폴리곤 클릭 (일반 모드) ── */
  const handlePolygonClick = useCallback((poly: BuildingPolygon, e: React.MouseEvent) => {
    if (drawMode) return;
    e.stopPropagation();
    alert(`[${poly.name}]이(가) 선택되었습니다.\n\n다음 단계에서 1층/2층 도면 선택 UI로 넘어갈 예정입니다.`);
  }, [drawMode]);

  /* ── 폴리곤 삭제 ── */
  const deletePolygon = (id: string) => {
    setPolygons(prev => prev.filter(p => p.id !== id));
  };

  /* ── 첫 번째 점 근접 여부 (시각적 강조) ── */
  const isNearFirst = useCallback((pos: Point | null): boolean => {
    if (!pos || draft.length < 3) return false;
    const first = draft[0];
    const dx = (pos.x - first.x) * imgSize.w;
    const dy = (pos.y - first.y) * imgSize.h;
    return Math.sqrt(dx * dx + dy * dy) < CLOSE_THRESHOLD;
  }, [draft, imgSize]);

  const nearFirst = isNearFirst(mousePos);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 110px)' }}>

      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">🗺 공장 조감도</span>
          <span className="text-xs text-gray-400">· 태경BK 단양1공장</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 줌 컨트롤 */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
            <button
              onClick={() => setScale(s => Math.min(5, s * 1.2))}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-base"
              title="줌인"
            >+</button>
            <span className="text-xs text-gray-500 w-12 text-center">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(s => Math.max(0.3, s * 0.8))}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-base"
              title="줌아웃"
            >−</button>
            <button
              onClick={resetView}
              className="ml-1 text-xs text-gray-500 hover:text-blue-600 px-1"
              title="뷰 초기화"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* 폴리곤 목록 뱃지 */}
          {polygons.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              건물 {polygons.length}개
            </span>
          )}

          {/* 그리기 모드 토글 버튼 */}
          <button
            onClick={toggleDrawMode}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all',
              drawMode
                ? 'bg-orange-500 text-white shadow-md ring-2 ring-orange-300 animate-pulse'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {drawMode ? '✏️ 그리기 중... (ESC 취소)' : '✏️ 건물 영역 지정 (폴리곤)'}
          </button>
        </div>
      </div>

      {/* ── 그리기 모드 안내 메시지 ── */}
      {drawMode && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-200 text-orange-700 text-xs">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>클릭</strong>으로 꼭짓점을 추가하세요.&nbsp;
            {draft.length >= 3
              ? <><strong>처음 점(녹색 원)</strong>을 클릭하거나 <strong>더블클릭</strong>으로 영역을 완성하세요.</>
              : <>최소 3개의 점이 필요합니다. (현재 {draft.length}개)</>
            }
          </span>
        </div>
      )}

      {/* ── 메인 캔버스 영역 ── */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-gray-900"
        style={{ cursor: drawMode ? 'crosshair' : isPanning.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDownPan}
        onMouseMove={handleMouseMovePan}
        onMouseUp={handleMouseUpPan}
        onMouseLeave={handleMouseUpPan}
        onWheel={handleWheel}
      >
        {/* 줌/패닝 변환 컨테이너 */}
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isPanning.current ? 'none' : 'transform 0.05s',
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* 항공 사진 이미지 */}
          <div style={{ position: 'relative', display: 'inline-block', userSelect: 'none' }}>
            <img
              ref={imgRef}
              src="/factory-aerial.jpg"
              alt="단양1공장 항공 조감도"
              draggable={false}
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 160px)',
                display: 'block',
                userSelect: 'none',
              }}
            />

            {/* SVG 오버레이 (이미지 위에 정확히 겹침) */}
            {imgSize.w > 0 && (
              <svg
                ref={svgRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: imgSize.w,
                  height: imgSize.h,
                  cursor: drawMode ? 'crosshair' : 'default',
                }}
                onClick={handleSvgClick}
                onDoubleClick={handleSvgDblClick}
                onMouseMove={handleSvgMouseMove}
                onMouseLeave={() => drawMode && setMousePos(null)}
              >
                {/* ── 완성된 폴리곤들 ── */}
                {polygons.map(poly => {
                  const isHovered = hoveredId === poly.id;
                  return (
                    <g key={poly.id}>
                      <polygon
                        points={toSvgPoints(poly.points, imgSize.w, imgSize.h)}
                        fill={poly.color}
                        fillOpacity={isHovered ? 0.55 : 0.3}
                        stroke={poly.color}
                        strokeWidth={isHovered ? 3 : 2}
                        strokeLinejoin="round"
                        style={{ cursor: drawMode ? 'crosshair' : 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={() => !drawMode && setHoveredId(poly.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={(e) => handlePolygonClick(poly, e)}
                      />
                      {/* 건물명 라벨 */}
                      {(() => {
                        const pts = poly.points;
                        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length * imgSize.w;
                        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length * imgSize.h;
                        return (
                          <g
                            style={{ cursor: drawMode ? 'crosshair' : 'pointer', pointerEvents: 'none' }}
                          >
                            <rect
                              x={cx - 36}
                              y={cy - 11}
                              width={72}
                              height={22}
                              rx={5}
                              fill={isHovered ? poly.color : 'rgba(0,0,0,0.6)'}
                              fillOpacity={isHovered ? 0.9 : 0.75}
                              style={{ transition: 'all 0.15s' }}
                            />
                            <text
                              x={cx}
                              y={cy + 4}
                              textAnchor="middle"
                              fontSize={11}
                              fontWeight="bold"
                              fill="white"
                              fontFamily="system-ui, sans-serif"
                            >
                              {poly.name}
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}

                {/* ── 그리는 중인 draft 폴리곤 ── */}
                {draft.length > 0 && (
                  <g>
                    {/* 채워진 영역 미리보기 */}
                    {draft.length >= 3 && (
                      <polygon
                        points={toSvgPoints(draft, imgSize.w, imgSize.h)}
                        fill="#f97316"
                        fillOpacity={0.2}
                        stroke="none"
                      />
                    )}

                    {/* 선분들 */}
                    {draft.map((pt, i) => {
                      if (i === 0) return null;
                      const prev = draft[i - 1];
                      return (
                        <line
                          key={i}
                          x1={prev.x * imgSize.w} y1={prev.y * imgSize.h}
                          x2={pt.x * imgSize.w}   y2={pt.y * imgSize.h}
                          stroke="#f97316"
                          strokeWidth={2}
                          strokeDasharray="none"
                        />
                      );
                    })}

                    {/* 마우스 미리보기 선 */}
                    {mousePos && draft.length > 0 && (
                      <line
                        x1={draft[draft.length - 1].x * imgSize.w}
                        y1={draft[draft.length - 1].y * imgSize.h}
                        x2={mousePos.x * imgSize.w}
                        y2={mousePos.y * imgSize.h}
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        opacity={0.7}
                      />
                    )}

                    {/* 꼭짓점 점들 */}
                    {draft.map((pt, i) => {
                      const isFirst = i === 0;
                      const isNear = isFirst && nearFirst;
                      return (
                        <circle
                          key={i}
                          cx={pt.x * imgSize.w}
                          cy={pt.y * imgSize.h}
                          r={isFirst ? (isNear ? 10 : 7) : 5}
                          fill={isFirst ? (isNear ? '#22c55e' : '#f97316') : '#f97316'}
                          stroke="white"
                          strokeWidth={2}
                          style={{
                            cursor: isFirst ? 'pointer' : 'default',
                            transition: 'all 0.15s',
                            filter: isNear ? 'drop-shadow(0 0 6px #22c55e)' : 'none',
                          }}
                        />
                      );
                    })}
                  </g>
                )}
              </svg>
            )}
          </div>
        </div>

        {/* ── 우측 하단: 폴리곤 목록 패널 ── */}
        {polygons.length > 0 && (
          <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 p-3 min-w-[180px] max-w-[220px]">
            <p className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              등록된 건물 영역
            </p>
            <div className="space-y-1.5">
              {polygons.map(poly => (
                <div
                  key={poly.id}
                  className="flex items-center gap-2 text-xs group"
                  onMouseEnter={() => setHoveredId(poly.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: poly.color }}
                  />
                  <span className="flex-1 text-gray-700 font-medium truncate">{poly.name}</span>
                  <button
                    onClick={() => deletePolygon(poly.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
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

        {/* ── 좌측 하단: 줌 힌트 ── */}
        <div className="absolute bottom-4 left-4 text-xs text-white/60 bg-black/30 rounded-lg px-2 py-1.5 pointer-events-none">
          🖱 휠: 줌 &nbsp;|&nbsp; 드래그: 이동 &nbsp;|&nbsp; ESC: 그리기 취소
        </div>
      </div>
    </div>
  );
}
