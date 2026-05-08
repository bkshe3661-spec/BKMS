import { useState, useRef, useCallback, useEffect } from 'react';
import type { BuildingPolygon, Point } from '../../types/polygon';
import type { Extinguisher } from '../../types/extinguisher';
import {
  loadPolygons, addPolygon, removePolygon,
} from '../../services/polygonService';
import {
  getExtinguishersOnFloor,
  getUnplacedExtinguishers,
  saveExtinguisherPosition,
  updateExtinguisherInfo,
  removeExtinguisherPosition,
  getExtinguisherById,
} from '../../services/floorPlanService';

/* ─────────────────────────────────────────
   상수
───────────────────────────────────────── */
const AERIAL_W = 1024;
const AERIAL_H = 768;
const MAX_SCALE = 8;
const CLOSE_THRESHOLD = 14;
const DRAG_THRESHOLD  = 5;

const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#06b6d4','#f97316','#ec4899',
  '#84cc16','#14b8a6','#a855f7','#fb923c',
];

const STATUS_COLOR: Record<string, string> = {
  '정상':    '#22c55e',
  '점검필요': '#f59e0b',
  '교체대상': '#ef4444',
  '폐기':    '#6b7280',
};
const STATUS_LABEL: Record<string, string> = {
  '정상':    '정상',
  '점검필요': '점검필요',
  '교체대상': '교체대상',
  '폐기':    '폐기',
};

/* ─────────────────────────────────────────
   층 정의 — 실제 이미지 + 필터 키워드
───────────────────────────────────────── */
interface FloorDef {
  id: string;
  label: string;
  img: string;
  imgW: number;
  imgH: number;
  keywords: string[];   // location 필드에 모두 포함돼야 하는 키워드
}

const BUILDING_FLOORS: Record<string, FloorDef[]> = {
  '관리동': [
    {
      id: '관리동_1층',
      label: '1층',
      img: '/floor-1f.png',
      imgW: 799,
      imgH: 621,
      keywords: ['관리동', '1층'],
    },
    {
      id: '관리동_2층',
      label: '2층',
      img: '/floor-2f.png',
      imgW: 1024,
      imgH: 546,
      keywords: ['관리동'],   // 2층 키워드는 location에 없을 수 있어 관리동만 필터
    },
  ],
};

/* ─────────────────────────────────────────
   공통 Zoom/Pan Hook
───────────────────────────────────────── */
function useZoomPan(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  imgW: number,
  imgH: number,
) {
  const [containScale, setContainScale] = useState(1);
  const [scale, setScale]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const clampOffset = useCallback((ox: number, oy: number, sc: number) => {
    const el = canvasRef.current;
    if (!el) return { x: ox, y: oy };
    const maxX = Math.max(0, (imgW * sc - el.clientWidth)  / 2);
    const maxY = Math.max(0, (imgH * sc - el.clientHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, [canvasRef, imgW, imgH]);

  const applyContain = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const cs = Math.min(el.clientWidth / imgW, el.clientHeight / imgH);
    setContainScale(cs);
    setScale(cs);
    setOffset({ x: 0, y: 0 });
  }, [canvasRef, imgW, imgH]);

  useEffect(() => {
    applyContain();
    const ro = new ResizeObserver(applyContain);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [applyContain]);

  const resetView = useCallback(() => {
    setScale(containScale);
    setOffset({ x: 0, y: 0 });
  }, [containScale]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setScale(prev => {
      const next = Math.max(containScale, Math.min(MAX_SCALE, prev * factor));
      const el = canvasRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width  / 2;
        const my = e.clientY - rect.top  - rect.height / 2;
        const ratio = next / prev;
        setOffset(o => clampOffset(
          o.x * ratio + mx * (1 - ratio),
          o.y * ratio + my * (1 - ratio),
          next,
        ));
      }
      return next;
    });
  }, [containScale, clampOffset, canvasRef]);

  return { containScale, scale, setScale, offset, setOffset, clampOffset, resetView, handleWheel };
}

/* ─────────────────────────────────────────
   층 선택 모달
───────────────────────────────────────── */
function FloorModal({
  buildingName, floors, onSelect, onClose,
}: {
  buildingName: string;
  floors: FloorDef[];
  onSelect: (f: FloorDef) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-80"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{buildingName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">층을 선택하세요</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg"
          >✕</button>
        </div>
        <div className="flex flex-col gap-2.5">
          {floors.map(f => (
            <button
              key={f.id}
              onClick={() => onSelect(f)}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-400 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-800">[{f.label}] 도면 보기</p>
                <p className="text-xs text-blue-500 mt-0.5">소화기 배치·편집 가능</p>
              </div>
              <svg className="w-4 h-4 text-blue-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm transition-colors"
        >닫기 ✕</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   소화기 편집 모달
───────────────────────────────────────── */
function EditModal({
  item, onSave, onClose, onRemoveFromMap,
}: {
  item: Extinguisher;
  onSave: (u: Extinguisher) => void;
  onClose: () => void;
  onRemoveFromMap: () => void;
}) {
  const [form, setForm] = useState({ ...item });
  const set = (k: keyof Extinguisher, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-96 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-blue-600">
          <div>
            <p className="text-xs text-blue-200 font-mono">{form.id}</p>
            <h2 className="text-base font-bold text-white mt-0.5">소화기 정보 편집</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-96 overflow-y-auto">
          {[
            { k: 'location' as const, label: '설치 위치' },
            { k: 'type'     as const, label: '소화기 종류' },
            { k: 'mfgDate'  as const, label: '제조년월', ph: 'YYYY-MM' },
            { k: 'lastCheckDate' as const, label: '최근 점검일', ph: 'YYYY-MM-DD' },
            { k: 'manager'  as const, label: '담당자' },
          ].map(({ k, label, ph }) => (
            <div key={k}>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
              <input
                value={(form[k] as string) ?? ''}
                onChange={e => set(k, e.target.value)}
                placeholder={ph}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">상태</label>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white"
            >
              <option>정상</option>
              <option>점검필요</option>
              <option>교체대상</option>
              <option>폐기</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">비고</label>
            <textarea
              value={form.note}
              onChange={e => set('note', e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button
            onClick={() => onSave(form)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            저장
          </button>
          <button
            onClick={onRemoveFromMap}
            title="도면에서 제거"
            className="px-3 py-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded-xl text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm transition-colors"
          >취소</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   내부 도면 뷰 (FloorView) — 1층·2층 공통
───────────────────────────────────────── */
function FloorView({
  floor, buildingName, onBack,
}: {
  floor: FloorDef;
  buildingName: string;
  onBack: () => void;
}) {
  const { imgW, imgH } = floor;
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);
  const { containScale, scale, setScale, offset, setOffset, clampOffset, resetView, handleWheel }
    = useZoomPan(canvasRef, imgW, imgH);

  /* ── 소화기 상태 ── */
  const [markers,  setMarkers]  = useState<Extinguisher[]>(() => getExtinguishersOnFloor(floor.id));
  const [unplaced, setUnplaced] = useState<Extinguisher[]>(() => getUnplacedExtinguishers(floor.id));
  const [editMode, setEditMode] = useState(false);
  const [selectedFe, setSelectedFe]  = useState<Extinguisher | null>(null); // 배치할 소화기
  const [pendingPos, setPendingPos]  = useState<{ x: number; y: number } | null>(null);
  const [editTarget, setEditTarget]  = useState<Extinguisher | null>(null); // 편집 모달 대상
  const [hoveredId,  setHoveredId]   = useState<string | null>(null);

  /* ── 드래그 이동 상태 ── */
  const draggingMarker = useRef<{ id: string; startX: number; startY: number } | null>(null);
  const isDraggingMarker = useRef(false);

  /* ── 뷰 패닝용 ── */
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const didDrag     = useRef(false);
  const panOrigin   = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  /* ── img 기준 비율 좌표 ── */
  const clientToRatio = useCallback((cx: number, cy: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const x = (cx - r.left) / r.width;
    const y = (cy - r.top)  / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  /* ── 마커 드래그 시작 ── */
  const onMarkerMouseDown = useCallback((e: React.MouseEvent, fe: Extinguisher) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    draggingMarker.current = { id: fe.id, startX: e.clientX, startY: e.clientY };
    isDraggingMarker.current = false;
  }, [editMode]);

  /* ── 캔버스 MouseDown ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (draggingMarker.current) return; // 마커 드래그 중이면 패닝 금지
    pointerDown.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    panOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  /* ── 캔버스 MouseMove ── */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 마커 드래그
    if (draggingMarker.current) {
      const dx = e.clientX - draggingMarker.current.startX;
      const dy = e.clientY - draggingMarker.current.startY;
      if (Math.sqrt(dx * dx + dy * dy) > 3) isDraggingMarker.current = true;
      return; // 마커 드래그 중엔 패닝 막음
    }
    // 뷰 패닝
    if (pointerDown.current) {
      const dx = e.clientX - pointerDown.current.x;
      const dy = e.clientY - pointerDown.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) didDrag.current = true;
    }
    if (panOrigin.current && didDrag.current) {
      const { mx, my, ox, oy } = panOrigin.current;
      setOffset(clampOffset(ox + (e.clientX - mx), oy + (e.clientY - my), scale));
    }
  }, [scale, clampOffset]);

  /* ── 캔버스 MouseUp ── */
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    // 마커 드래그 완료 → 새 좌표 저장
    if (draggingMarker.current) {
      if (isDraggingMarker.current) {
        const pt = clientToRatio(e.clientX, e.clientY);
        if (pt) {
          const { id } = draggingMarker.current;
          saveExtinguisherPosition(id, floor.id, pt.x, pt.y);
          const updated = getExtinguisherById(id);
          if (updated) {
            setMarkers(prev => prev.map(m => m.id === id ? updated : m));
          }
        }
      }
      draggingMarker.current = null;
      isDraggingMarker.current = false;
      return;
    }

    const wasDrag = didDrag.current;
    pointerDown.current = null;
    didDrag.current     = false;
    panOrigin.current   = null;
    if (wasDrag) return;

    // 편집 모드 + 소화기 선택됨 → 위치 임시 지정
    if (editMode && selectedFe) {
      const pt = clientToRatio(e.clientX, e.clientY);
      if (pt) setPendingPos(pt);
    }
  }, [editMode, selectedFe, clientToRatio, floor.id]);

  /* ── 임시 마커 확정 ── */
  const confirmPlace = useCallback(() => {
    if (!selectedFe || !pendingPos) return;
    saveExtinguisherPosition(selectedFe.id, floor.id, pendingPos.x, pendingPos.y);
    const updated = getExtinguisherById(selectedFe.id);
    if (updated) {
      setMarkers(prev => [...prev.filter(m => m.id !== updated.id), updated]);
      setUnplaced(prev => prev.filter(u => u.id !== updated.id));
    }
    setPendingPos(null);
    setSelectedFe(null);
  }, [selectedFe, pendingPos, floor.id]);

  /* ── 마커 클릭 → 편집 모달 (일반 모드) ── */
  const onMarkerClick = useCallback((e: React.MouseEvent, fe: Extinguisher) => {
    e.stopPropagation();
    if (isDraggingMarker.current) return;
    if (editMode) return; // 편집 모드에서는 드래그만
    setEditTarget(fe);
  }, [editMode]);

  /* ── 편집 저장 ── */
  const handleSave = useCallback((updated: Extinguisher) => {
    updateExtinguisherInfo(updated);
    setMarkers(prev => prev.map(m => m.id === updated.id ? updated : m));
    setEditTarget(null);
  }, []);

  /* ── 도면에서 제거 ── */
  const handleRemoveFromMap = useCallback(() => {
    if (!editTarget) return;
    removeExtinguisherPosition(editTarget.id);
    setMarkers(prev => prev.filter(m => m.id !== editTarget.id));
    const fresh = getExtinguisherById(editTarget.id);
    if (fresh) setUnplaced(prev => [...prev, fresh]);
    setEditTarget(null);
  }, [editTarget]);

  /* ── ESC ── */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingPos(null); setSelectedFe(null); setEditTarget(null);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const cursor = editMode && selectedFe ? 'crosshair' : 'grab';

  return (
    <div className="flex" style={{ height: 'calc(100vh - 108px)' }}>
      {/* ── 도면 영역 ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* 툴바 */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
              </svg>
              조감도로
            </button>
            <span className="text-gray-300">|</span>
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            <span className="text-sm font-semibold text-gray-700">{buildingName}</span>
            <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full font-bold">{floor.label}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* 줌 컨트롤 */}
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg px-2 py-1">
              <button
                onClick={() => setScale(s => { const n = Math.min(MAX_SCALE, s*1.25); setOffset(o => clampOffset(o.x,o.y,n)); return n; })}
                className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg"
              >+</button>
              <span className="text-xs text-gray-500 w-14 text-center tabular-nums">{Math.round(scale*100)}%</span>
              <button
                onClick={() => setScale(s => { const n = Math.max(containScale, s*0.8); setOffset(o => clampOffset(o.x,o.y,n)); return n; })}
                className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg"
              >−</button>
              <button onClick={resetView} className="ml-1 text-gray-400 hover:text-blue-600 px-1" title="전체 보기">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                </svg>
              </button>
            </div>
            {/* 편집 토글 */}
            <button
              onClick={() => { setEditMode(p => !p); setSelectedFe(null); setPendingPos(null); }}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all',
                editMode
                  ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700',
              ].join(' ')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
              {editMode ? '편집 중… (ESC 취소)' : '소화기 위치 편집'}
            </button>
          </div>
        </div>

        {/* 편집 안내 배너 */}
        {editMode && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-orange-50 border-b border-orange-200 text-orange-700 text-xs flex-shrink-0">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            {selectedFe
              ? <span><strong className="text-blue-700">{selectedFe.id}</strong> 선택됨 – 도면 클릭으로 위치 지정 · 배치된 마커를 드래그해 이동</span>
              : <span>오른쪽 목록에서 소화기 선택 후 도면 클릭 배치 · 배치된 마커 드래그로 이동 · 일반 모드에서 클릭 시 편집 모달</span>
            }
          </div>
        )}

        {/* 도면 뷰포트 */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 select-none relative"
          style={{ cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (draggingMarker.current) {
              draggingMarker.current = null;
              isDraggingMarker.current = false;
            }
            pointerDown.current = null;
            didDrag.current = false;
            panOrigin.current = null;
          }}
          onWheel={handleWheel}
        >
          <div
            style={{
              width: imgW,
              height: imgH,
              flexShrink: 0,
              position: 'relative',
              transformOrigin: '50% 50%',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          >
            {/* 도면 이미지 */}
            <img
              ref={imgRef}
              src={floor.img}
              alt={`${buildingName} ${floor.label} 도면`}
              draggable={false}
              width={imgW}
              height={imgH}
              style={{
                display: 'block',
                width: imgW,
                height: imgH,
                imageRendering: 'pixelated',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transformStyle: 'preserve-3d',
                userSelect: 'none',
                pointerEvents: 'none',
              } as React.CSSProperties}
            />

            {/* SVG 마커 오버레이 */}
            <svg
              style={{
                position: 'absolute', top: 0, left: 0,
                width: imgW, height: imgH,
                overflow: 'visible',
                pointerEvents: 'none',
              }}
            >
              {/* 배치된 소화기 마커 */}
              {markers.map(fe => {
                const mx = (fe.mapX ?? 0) * imgW;
                const my = (fe.mapY ?? 0) * imgH;
                const color = STATUS_COLOR[fe.status] ?? '#6b7280';
                const isHov = hoveredId === fe.id;
                return (
                  <g
                    key={fe.id}
                    style={{ cursor: editMode ? 'grab' : 'pointer', pointerEvents: 'auto' }}
                    onMouseEnter={() => setHoveredId(fe.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onMouseDown={e => onMarkerMouseDown(e, fe)}
                    onMouseUp={e => {
                      if (!isDraggingMarker.current) onMarkerClick(e as unknown as React.MouseEvent, fe);
                    }}
                  >
                    {/* 외곽 링 (호버) */}
                    {isHov && (
                      <circle cx={mx} cy={my} r={20}
                        fill={color} fillOpacity={0.15}
                        stroke={color} strokeWidth={1.5} strokeDasharray="3 2"
                        style={{ pointerEvents: 'none' }}/>
                    )}
                    {/* 마커 원 */}
                    <circle
                      cx={mx} cy={my}
                      r={isHov ? 15 : 12}
                      fill={color}
                      fillOpacity={0.92}
                      stroke="white"
                      strokeWidth={2.5}
                      style={{ transition: 'r .1s', filter: isHov ? `drop-shadow(0 2px 6px ${color}99)` : 'none' }}
                    />
                    {/* 소화기 아이콘 */}
                    <text x={mx} y={my+5} textAnchor="middle" fontSize={13}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>🧯</text>
                    {/* 툴팁 */}
                    {isHov && (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={mx-44} y={my-38} width={88} height={22} rx={6}
                          fill="rgba(15,15,30,0.82)"/>
                        <text x={mx} y={my-22} textAnchor="middle"
                          fontSize={9.5} fill="white" fontWeight="700"
                          fontFamily="-apple-system,'Malgun Gothic',sans-serif">
                          {fe.id}
                        </text>
                        <text x={mx} y={my-10} textAnchor="middle"
                          fontSize={8.5} fill={color} fontWeight="600"
                          fontFamily="-apple-system,'Malgun Gothic',sans-serif">
                          {STATUS_LABEL[fe.status] ?? fe.status}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* 임시 배치 마커 */}
              {pendingPos && (
                <g style={{ pointerEvents: 'none' }}>
                  <circle
                    cx={pendingPos.x * imgW} cy={pendingPos.y * imgH}
                    r={14} fill="#3b82f6" fillOpacity={0.85}
                    stroke="white" strokeWidth={2.5} strokeDasharray="4 2"/>
                  <text x={pendingPos.x*imgW} y={pendingPos.y*imgH+5}
                    textAnchor="middle" fontSize={13}
                    style={{ userSelect: 'none' }}>📍</text>
                </g>
              )}
            </svg>
          </div>

          {/* 위치 확인 팝업 */}
          {pendingPos && selectedFe && (
            <div
              className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl px-5 py-4 z-30 flex items-center gap-4"
              style={{ border: '2px solid #3b82f6' }}
            >
              <div>
                <p className="text-sm font-bold text-gray-800">{selectedFe.id}</p>
                <p className="text-xs text-gray-500 mt-0.5">이 위치에 저장하시겠습니까?</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={confirmPlace}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
                >✔ 저장</button>
                <button
                  onClick={() => setPendingPos(null)}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm transition-colors"
                >취소</button>
              </div>
            </div>
          )}

          {/* 줌 레벨 */}
          <div className="absolute top-3 left-3 text-gray-600 text-xs font-mono rounded px-2 py-1 pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.75)', zIndex: 20 }}>
            ×{scale.toFixed(2)}
          </div>
          <div className="absolute bottom-4 left-4 text-gray-500 text-xs rounded-lg px-2.5 py-1.5 pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.72)', zIndex: 20 }}>
            🖱 휠: 줌 · 드래그: 이동{editMode ? ' · 마커 드래그: 위치 이동' : ''}
          </div>
        </div>
      </div>

      {/* ── 오른쪽 사이드바 ── */}
      <div className="flex-shrink-0 flex flex-col bg-white border-l border-gray-200 shadow-lg" style={{ width: 256 }}>

        {/* 배치된 소화기 */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700">🧯 배치된 소화기</p>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{markers.length}개</span>
          </div>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: editMode ? '38%' : '70%' }}>
          {markers.length === 0
            ? <p className="text-xs text-gray-400 text-center py-6">아직 배치된 소화기가 없습니다</p>
            : (
              <ul className="px-2 py-1.5 space-y-1">
                {markers.map(fe => {
                  const color = STATUS_COLOR[fe.status] ?? '#6b7280';
                  const isHov = hoveredId === fe.id;
                  return (
                    <li key={fe.id}>
                      <button
                        onClick={() => { if (!editMode) setEditTarget(fe); }}
                        onMouseEnter={() => setHoveredId(fe.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className={[
                          'w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors',
                          isHov ? 'bg-blue-50' : 'hover:bg-gray-50',
                        ].join(' ')}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}/>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-700 truncate">{fe.id}</p>
                          <p className="text-[10px] truncate" style={{ color }}>{fe.status}</p>
                        </div>
                        {!editMode && (
                          <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                          </svg>
                        )}
                        {editMode && (
                          <span className="text-[9px] text-orange-400 font-bold">드래그</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </div>

        {/* 미배치 소화기 (편집 모드) */}
        {editMode && (
          <>
            <div className="px-4 py-2.5 border-t border-b border-orange-100 bg-orange-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-orange-700">📋 미배치 소화기</p>
                <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{unplaced.length}개</span>
              </div>
              <p className="text-[10px] text-orange-500 mt-0.5">선택 후 도면 클릭으로 배치</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {unplaced.length === 0
                ? <p className="text-xs text-gray-400 text-center py-6">모든 소화기 배치 완료 ✅</p>
                : (
                  <ul className="px-2 py-1.5 space-y-1">
                    {unplaced.map(fe => {
                      const color = STATUS_COLOR[fe.status] ?? '#6b7280';
                      const isSel = selectedFe?.id === fe.id;
                      return (
                        <li key={fe.id}>
                          <button
                            onClick={() => { setSelectedFe(isSel ? null : fe); setPendingPos(null); }}
                            className={[
                              'w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all',
                              isSel ? 'bg-blue-100 ring-1 ring-blue-400' : 'hover:bg-orange-50',
                            ].join(' ')}
                          >
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}/>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-bold truncate ${isSel ? 'text-blue-700' : 'text-gray-700'}`}>{fe.id}</p>
                              <p className="text-[10px] text-gray-400 truncate leading-tight">{fe.location.split(' - ').pop()}</p>
                            </div>
                            {isSel && <span className="text-blue-500 text-[10px] font-bold flex-shrink-0">선택</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              }
            </div>
          </>
        )}

        {/* 범례 */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <p className="text-[10px] font-bold text-gray-500 mb-1.5">상태 범례</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {Object.entries(STATUS_COLOR).map(([st, color]) => (
              <div key={st} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}/>
                <span className="text-[10px] text-gray-600">{st}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-400">
            <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 14l-4-4 1.414-1.414L11 13.172l6.586-6.586L19 8l-8 8z"/>
            </svg>
            자동 저장 (localStorage)
          </div>
        </div>
      </div>

      {/* 편집 모달 */}
      {editTarget && (
        <EditModal
          item={editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
          onRemoveFromMap={handleRemoveFromMap}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   유틸 (조감도용)
───────────────────────────────────────── */
function toSvgPts(pts: Point[], W: number, H: number) {
  return pts.map(p => `${p.x*W},${p.y*H}`).join(' ');
}
function centroid(pts: Point[], W: number, H: number) {
  return {
    cx: pts.reduce((s,p) => s+p.x, 0) / pts.length * W,
    cy: pts.reduce((s,p) => s+p.y, 0) / pts.length * H,
  };
}
function imgDist(a: Point, b: Point, W: number, H: number) {
  return Math.sqrt(((a.x-b.x)*W)**2 + ((a.y-b.y)*H)**2);
}

/* ─────────────────────────────────────────
   조감도 뷰 (AerialView)
───────────────────────────────────────── */
function AerialView({ onBuildingSelect }: { onBuildingSelect: (name: string) => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);
  const { containScale, scale, setScale, offset, setOffset, clampOffset, resetView, handleWheel }
    = useZoomPan(canvasRef, AERIAL_W, AERIAL_H);

  const [polygons,   setPolygons]   = useState<BuildingPolygon[]>(() => loadPolygons());
  const [drawMode,   setDrawMode]   = useState(false);
  const [draft,      setDraft]      = useState<Point[]>([]);
  const [cursorPt,   setCursorPt]   = useState<Point | null>(null);
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const didDrag     = useRef(false);
  const panOrigin   = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const clientToRatio = useCallback((cx: number, cy: number): Point | null => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const x = (cx - r.left) / r.width;
    const y = (cy - r.top)  / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    if (!drawMode) panOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  }, [drawMode, offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (pointerDown.current) {
      const dx = e.clientX - pointerDown.current.x;
      const dy = e.clientY - pointerDown.current.y;
      if (Math.sqrt(dx*dx+dy*dy) > DRAG_THRESHOLD) didDrag.current = true;
    }
    if (!drawMode && panOrigin.current && didDrag.current) {
      const { mx, my, ox, oy } = panOrigin.current;
      setOffset(clampOffset(ox+(e.clientX-mx), oy+(e.clientY-my), scale));
    }
    if (drawMode) setCursorPt(clientToRatio(e.clientX, e.clientY));
  }, [drawMode, scale, clientToRatio, clampOffset]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const wasDrag = didDrag.current;
    pointerDown.current = null; didDrag.current = false; panOrigin.current = null;
    if (!drawMode || wasDrag) return;
    const pt = clientToRatio(e.clientX, e.clientY);
    if (!pt) return;
    if (draft.length >= 3 && imgDist(pt, draft[0], AERIAL_W, AERIAL_H) < CLOSE_THRESHOLD) {
      triggerClose(draft); return;
    }
    setDraft(prev => [...prev, pt]);
  }, [drawMode, draft, clientToRatio]);

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    if (!drawMode || draft.length < 3) return;
    e.preventDefault();
    triggerClose(draft);
  }, [drawMode, draft]);

  const triggerClose = useCallback((cur: Point[]) => {
    const name = window.prompt('건물 이름을 입력하세요\n예: 관리동, 원료창고, 생산1동', '');
    if (!name?.trim()) return;
    const color = PALETTE[polygons.length % PALETTE.length];
    const newPoly: BuildingPolygon = { id: `poly-${Date.now()}`, name: name.trim(), points: cur, color };
    setPolygons(addPolygon(newPoly));
    setDraft([]); setCursorPt(null); setDrawMode(false); setSelectedId(newPoly.id);
  }, [polygons.length]);

  const handleDelete = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPolygons(removePolygon(id));
    if (selectedId === id) setSelectedId(null);
    if (hoveredId  === id) setHoveredId(null);
  }, [selectedId, hoveredId]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawMode) { setDraft([]); setCursorPt(null); setDrawMode(false); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [drawMode]);

  const toggleDraw = () => setDrawMode(p => { setDraft([]); setCursorPt(null); return !p; });

  const focusPolygon = useCallback((poly: BuildingPolygon) => {
    setSelectedId(poly.id);
    const { cx, cy } = centroid(poly.points, AERIAL_W, AERIAL_H);
    const ts = Math.min(MAX_SCALE, Math.max(containScale*2.5, 2));
    setScale(ts);
    setOffset(clampOffset(-(cx-AERIAL_W/2)*ts, -(cy-AERIAL_H/2)*ts, ts));
  }, [containScale, clampOffset]);

  const onPolyClick = useCallback((poly: BuildingPolygon, e: React.MouseEvent) => {
    if (drawMode) return;
    e.stopPropagation();
    if (didDrag.current) return;
    setSelectedId(poly.id);
    if (BUILDING_FLOORS[poly.name]) {
      onBuildingSelect(poly.name);
    } else {
      alert(`[${poly.name}]이(가) 선택되었습니다.\n이 건물은 아직 층 도면이 등록되지 않았습니다.`);
    }
  }, [drawMode, onBuildingSelect]);

  const nearFirst = draft.length >= 3 && cursorPt !== null
    && imgDist(cursorPt, draft[0], AERIAL_W, AERIAL_H) < CLOSE_THRESHOLD;

  return (
    <div className="flex" style={{ height: 'calc(100vh - 108px)' }}>
      <div className="flex flex-col flex-1 min-w-0">
        {/* 툴바 */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">🗺 공장 조감도</span>
            <span className="text-xs text-gray-400">· 태경BK 단양1공장</span>
            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-200">
              💡 관리동 클릭 시 층 도면 진입
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg px-2 py-1">
              <button onClick={() => setScale(s => { const n=Math.min(MAX_SCALE,s*1.25); setOffset(o=>clampOffset(o.x,o.y,n)); return n; })}
                className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg">+</button>
              <span className="text-xs text-gray-500 w-14 text-center tabular-nums">{Math.round(scale*100)}%</span>
              <button onClick={() => setScale(s => { const n=Math.max(containScale,s*0.8); setOffset(o=>clampOffset(o.x,o.y,n)); return n; })}
                className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg">−</button>
              <button onClick={resetView} className="ml-1 text-gray-400 hover:text-blue-600 px-1" title="전체 보기">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                </svg>
              </button>
            </div>
            <button onClick={toggleDraw}
              className={['flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all select-none',
                drawMode ? 'bg-orange-500 text-white ring-2 ring-orange-300' : 'bg-blue-600 text-white hover:bg-blue-700'].join(' ')}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
              {drawMode ? '✏️ 그리기 중… (ESC 취소)' : '✏️ 건물 영역 지정'}
            </button>
          </div>
        </div>

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

        {/* 도면 뷰포트 */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-hidden flex items-center justify-center bg-gray-900 select-none"
          style={{ cursor: drawMode ? 'crosshair' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { pointerDown.current=null; didDrag.current=false; panOrigin.current=null; setCursorPt(null); }}
          onDoubleClick={handleDblClick}
          onWheel={handleWheel}
        >
          <div style={{
            width: AERIAL_W, height: AERIAL_H, flexShrink: 0, position: 'relative',
            transformOrigin: '50% 50%',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}>
            <img
              ref={imgRef}
              src="/factory-aerial.jpg"
              alt="단양1공장 항공 조감도"
              draggable={false}
              width={AERIAL_W} height={AERIAL_H}
              style={{
                display: 'block', width: AERIAL_W, height: AERIAL_H,
                imageRendering: 'pixelated',
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                transformStyle: 'preserve-3d', userSelect: 'none', pointerEvents: 'none',
              } as React.CSSProperties}
            />
            <svg style={{
              position: 'absolute', top: 0, left: 0,
              width: AERIAL_W, height: AERIAL_H, overflow: 'visible',
              pointerEvents: drawMode ? 'none' : 'auto',
            }}>
              {polygons.map(poly => {
                const isHov = hoveredId===poly.id || selectedId===poly.id;
                const isSel = selectedId===poly.id;
                const { cx, cy } = centroid(poly.points, AERIAL_W, AERIAL_H);
                const lw = Math.min(Math.max(poly.name.length*8+20, 64), 160);
                const hasFloors = !!BUILDING_FLOORS[poly.name];
                return (
                  <g key={poly.id} style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredId(poly.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={e => onPolyClick(poly, e as unknown as React.MouseEvent)}
                  >
                    <polygon points={toSvgPts(poly.points,AERIAL_W,AERIAL_H)}
                      fill={poly.color} fillOpacity={isHov ? 0.52 : 0.28}
                      stroke={poly.color} strokeWidth={isSel ? 3 : isHov ? 2.5 : 1.8}
                      strokeLinejoin="round" strokeDasharray={isSel ? '8 3' : 'none'}
                      style={{ transition: 'fill-opacity .12s, stroke-width .12s' }}/>
                    {isSel && (
                      <polygon points={toSvgPts(poly.points,AERIAL_W,AERIAL_H)}
                        fill="none" stroke={poly.color} strokeWidth={6} strokeOpacity={0.25}
                        strokeLinejoin="round" style={{ pointerEvents: 'none' }}/>
                    )}
                    <g style={{ pointerEvents: 'none' }}>
                      <rect x={cx-lw/2} y={cy-13} width={lw} height={26} rx={7}
                        fill={isHov ? poly.color : 'rgba(0,0,0,0.68)'}
                        style={{ transition: 'fill .12s' }}/>
                      <text x={cx} y={cy+5} textAnchor="middle"
                        fontSize={12} fontWeight="700" fill="white"
                        fontFamily="-apple-system,'Malgun Gothic',sans-serif">
                        {poly.name}{hasFloors ? ' 🏢' : ''}
                      </text>
                    </g>
                    {isHov && !drawMode && (
                      <g style={{ cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); handleDelete(poly.id); }}>
                        <circle cx={cx+lw/2+2} cy={cy-13} r={7} fill="#ef4444"/>
                        <text x={cx+lw/2+2} y={cy-9} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">✕</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {draft.length > 0 && (
                <g style={{ pointerEvents: 'none' }}>
                  {draft.length >= 3 && (
                    <polygon points={toSvgPts(draft,AERIAL_W,AERIAL_H)} fill="#f97316" fillOpacity={0.15} stroke="none"/>
                  )}
                  {draft.map((pt, i) => i===0 ? null : (
                    <line key={`s${i}`}
                      x1={draft[i-1].x*AERIAL_W} y1={draft[i-1].y*AERIAL_H}
                      x2={pt.x*AERIAL_W} y2={pt.y*AERIAL_H}
                      stroke="#f97316" strokeWidth={2} strokeLinecap="round"/>
                  ))}
                  {cursorPt && (
                    <line
                      x1={draft[draft.length-1].x*AERIAL_W} y1={draft[draft.length-1].y*AERIAL_H}
                      x2={cursorPt.x*AERIAL_W} y2={cursorPt.y*AERIAL_H}
                      stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.65}/>
                  )}
                  {draft.map((pt, i) => {
                    const isFirst = i===0;
                    const hi = isFirst && nearFirst;
                    return (
                      <circle key={`d${i}`}
                        cx={pt.x*AERIAL_W} cy={pt.y*AERIAL_H}
                        r={isFirst ? (hi ? 11 : 7) : 4.5}
                        fill={isFirst ? (hi ? '#22c55e' : '#f97316') : '#f97316'}
                        stroke="white" strokeWidth={2}
                        style={{ transition:'r .1s, fill .1s',
                          filter: hi ? 'drop-shadow(0 0 5px #22c55e)' : 'none' }}/>
                    );
                  })}
                  {nearFirst && (
                    <circle cx={draft[0].x*AERIAL_W} cy={draft[0].y*AERIAL_H} r={17}
                      fill="none" stroke="#22c55e" strokeWidth={2}
                      strokeDasharray="4 3" opacity={0.85}/>
                  )}
                </g>
              )}
            </svg>
          </div>

          <div className="absolute bottom-4 left-4 text-white/55 text-xs rounded-lg px-2.5 py-1.5 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.38)', zIndex: 20 }}>
            🖱 휠: 줌 · 드래그: 이동 · ESC: 취소
          </div>
          <div className="absolute top-3 left-3 text-white/50 text-xs font-mono rounded px-2 py-1 pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.32)', zIndex: 20 }}>
            ×{scale.toFixed(2)}
          </div>
        </div>
      </div>

      {/* 사이드바 */}
      <div className="flex-shrink-0 flex flex-col bg-white border-l border-gray-200 shadow-lg" style={{ width: 240 }}>
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
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{polygons.length}개</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {polygons.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 text-gray-400">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
              </svg>
              <p className="text-xs font-medium text-gray-400">등록된 건물이 없습니다</p>
              <p className="text-[11px] text-gray-300 mt-1">✏️ 건물 영역 지정 버튼으로<br/>폴리곤을 그려보세요</p>
            </div>
          ) : (
            <ul className="px-2 space-y-1">
              {polygons.map((poly, idx) => {
                const isSel = selectedId===poly.id;
                const isHov = hoveredId===poly.id;
                const hasFloors = !!BUILDING_FLOORS[poly.name];
                return (
                  <li key={poly.id}>
                    <button
                      onClick={() => focusPolygon(poly)}
                      onMouseEnter={() => setHoveredId(poly.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={['w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all',
                        isSel ? 'bg-blue-50 ring-1 ring-blue-300' : isHov ? 'bg-gray-50' : 'hover:bg-gray-50'].join(' ')}
                    >
                      <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
                        <span className="w-3 h-3 rounded-full ring-2 ring-white shadow" style={{ backgroundColor: poly.color }}/>
                        <span className="text-[9px] text-gray-300 font-mono leading-none">{String(idx+1).padStart(2,'0')}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate leading-tight ${isSel ? 'text-blue-700' : 'text-gray-800'}`}>
                          {poly.name}
                          {hasFloors && <span className="ml-1 text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded">층별 도면</span>}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{poly.points.length}개 꼭짓점</p>
                      </div>
                      {isSel && (
                        <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                      )}
                      <button onClick={e => handleDelete(poly.id, e)}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="삭제">
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

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 14l-4-4 1.414-1.414L11 13.172l6.586-6.586L19 8l-8 8z"/>
            </svg>
            데이터 자동 저장 중 (localStorage)
          </div>
          {polygons.length > 0 && (
            <button
              onClick={() => { if (window.confirm('모든 건물 영역을 삭제할까요?')) { polygons.forEach(p=>removePolygon(p.id)); setPolygons([]); setSelectedId(null); } }}
              className="mt-2 w-full text-[11px] text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg py-1.5 transition-colors border border-dashed border-red-200 hover:border-red-300"
            >전체 삭제</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   메인 MapView — 라우팅 제어
───────────────────────────────────────── */
export default function MapView() {
  const [view,             setView]             = useState<'aerial'|'floor-modal'|'floor-view'>('aerial');
  const [selectedBuilding, setSelectedBuilding] = useState<string|null>(null);
  const [selectedFloor,    setSelectedFloor]    = useState<FloorDef|null>(null);

  const handleBuildingSelect = (name: string) => {
    setSelectedBuilding(name);
    setView('floor-modal');
  };
  const handleFloorSelect = (floor: FloorDef) => {
    setSelectedFloor(floor);
    setView('floor-view');
  };
  const handleBack = () => {
    setView('aerial');
    setSelectedBuilding(null);
    setSelectedFloor(null);
  };

  if (view==='floor-view' && selectedFloor && selectedBuilding) {
    return <FloorView floor={selectedFloor} buildingName={selectedBuilding} onBack={handleBack}/>;
  }

  return (
    <>
      <AerialView onBuildingSelect={handleBuildingSelect}/>
      {view==='floor-modal' && selectedBuilding && BUILDING_FLOORS[selectedBuilding] && (
        <FloorModal
          buildingName={selectedBuilding}
          floors={BUILDING_FLOORS[selectedBuilding]}
          onSelect={handleFloorSelect}
          onClose={() => setView('aerial')}
        />
      )}
    </>
  );
}
