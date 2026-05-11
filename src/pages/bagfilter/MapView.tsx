import { useState, useRef, useCallback, useEffect } from 'react';
import type { BagFilter } from '../../types/bagfilter';
import {
  getAllBagFilters,
  saveBagFilterPosition,
  removeBagFilterPosition,
  updateBagFilter,
  addBagFilter,
} from '../../services/bagfilterService';

/* ─────────────────────────────────────────
   상수
───────────────────────────────────────── */
const MAX_SCALE      = 8;
const DRAG_THRESHOLD = 5;

const FACTORY_IMG     = '/factory-aerial-bf.jpg';
const FACTORY_IMG_W   = 1024;
const FACTORY_IMG_H   = 768;

/* 화질 선명 고정 스타일 — will-change 절대 금지 */
const SHARP_IMG_STYLE: React.CSSProperties = {
  display: 'block',
  imageRendering: 'pixelated' as React.CSSProperties['imageRendering'],
  WebkitBackfaceVisibility: 'hidden' as React.CSSProperties['WebkitBackfaceVisibility'],
  backfaceVisibility: 'hidden' as React.CSSProperties['backfaceVisibility'],
  userSelect: 'none',
  pointerEvents: 'none',
};

/* 교체 주기 상태 → 핀 색상 */
function getPinColor(bf: BagFilter): string {
  if (!bf.lastReplaceDate?.trim()) return '#ef4444';
  const d = new Date(bf.lastReplaceDate.trim());
  if (isNaN(d.getTime())) return '#ef4444';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff >= 365) return '#ef4444';   // 교체필요 — 빨강
  if (diff >= 300) return '#f59e0b';   // 교체임박 — 주황
  return '#22c55e';                    // 정상 — 초록
}

/* 교체 상태 라벨 */
function getReplaceLabel(bf: BagFilter): string {
  if (!bf.lastReplaceDate?.trim()) return '교체필요';
  const d = new Date(bf.lastReplaceDate.trim());
  if (isNaN(d.getTime())) return '교체필요';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff >= 365) return '교체필요';
  if (diff >= 300) return '교체임박';
  return '정상';
}

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

  return { containScale, scale, setScale, offset, setOffset, clampOffset, handleWheel };
}

/* ─────────────────────────────────────────
   스타일 상수
───────────────────────────────────────── */
const INPUT_CLS = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const LABEL_CLS = 'block text-xs font-semibold text-gray-500 mb-1';

interface BfFormMap {
  outletSeq: string;
  facilityName: string;
  preventionInfo: string;
  filterSpec: string;
  filterQty: string;
  material: string;
  prevReplaceDate: string;
  lastReplaceDate: string;
}

/* ─────────────────────────────────────────
   핀 수정 모달
───────────────────────────────────────── */
function PinEditModal({
  item, onSave, onClose, onRemove,
}: {
  item: BagFilter;
  onSave: (u: BagFilter) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const [form, setForm] = useState<BfFormMap>({
    outletSeq:       String(item.outletSeq),
    facilityName:    item.facilityName,
    preventionInfo:  item.preventionInfo,
    filterSpec:      item.filterSpec,
    filterQty:       item.filterQty,
    material:        item.material,
    prevReplaceDate: item.prevReplaceDate,
    lastReplaceDate: item.lastReplaceDate,
  });
  const set = (k: keyof BfFormMap, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.facilityName.trim()) { alert('시설명을 입력하세요.'); return; }
    onSave({
      ...item,
      outletSeq:       Number(form.outletSeq) || 0,
      facilityName:    form.facilityName.trim(),
      preventionInfo:  form.preventionInfo.trim(),
      filterSpec:      form.filterSpec.trim(),
      filterQty:       form.filterQty.trim(),
      material:        form.material.trim(),
      prevReplaceDate: form.prevReplaceDate.trim(),
      lastReplaceDate: form.lastReplaceDate.trim(),
    });
  };

  const statusColor = getPinColor(item);
  const statusLabel = getReplaceLabel(item);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 bg-blue-600">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-blue-200 font-mono">배출구번호 #{item.id}</p>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: statusColor, color: 'white' }}>{statusLabel}</span>
            </div>
            <h2 className="text-base font-bold text-white mt-0.5">백필터 정보 수정</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        {/* 폼 */}
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>배출구 일련번호</label>
              <input type="number" value={form.outletSeq} onChange={e => set('outletSeq', e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>재질</label>
              <input type="text" value={form.material} onChange={e => set('material', e.target.value)} className={INPUT_CLS} placeholder="예) nomex" />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>시설명 <span className="text-red-400">*</span></label>
            <input type="text" value={form.facilityName} onChange={e => set('facilityName', e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>방지시설 정보</label>
            <input type="text" value={form.preventionInfo} onChange={e => set('preventionInfo', e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>여과포 규격</label>
              <input type="text" value={form.filterSpec} onChange={e => set('filterSpec', e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>여과포 수량</label>
              <input type="text" value={form.filterQty} onChange={e => set('filterQty', e.target.value)} className={INPUT_CLS} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>전전교체일</label>
              <input type="date" value={form.prevReplaceDate} onChange={e => set('prevReplaceDate', e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>전교체일</label>
              <input type="date" value={form.lastReplaceDate} onChange={e => set('lastReplaceDate', e.target.value)} className={INPUT_CLS} />
            </div>
          </div>
        </div>
        {/* 버튼 */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            저장
          </button>
          <button
            onClick={onRemove}
            title="도면에서 제거"
            className="px-3 py-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded-xl text-sm transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
          <button onClick={onClose} className="px-3 py-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm transition">취소</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   신규 핀 추가 모달 (도면 클릭 시)
───────────────────────────────────────── */
function PinAddModal({
  pendingRatio,
  onSave,
  onClose,
}: {
  pendingRatio: { x: number; y: number };
  onSave: (bf: BagFilter) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<BfFormMap & { id: string }>({
    id: '', outletSeq: '', facilityName: '',
    preventionInfo: '', filterSpec: '', filterQty: '',
    material: '', prevReplaceDate: '', lastReplaceDate: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.id.trim())           { alert('허가증상 배출구번호를 입력하세요.'); return; }
    if (!form.facilityName.trim()) { alert('시설명을 입력하세요.'); return; }
    const bf: BagFilter = {
      id:              form.id.trim(),
      outletSeq:       Number(form.outletSeq) || 0,
      facilityName:    form.facilityName.trim(),
      preventionInfo:  form.preventionInfo.trim(),
      filterSpec:      form.filterSpec.trim(),
      filterQty:       form.filterQty.trim(),
      material:        form.material.trim(),
      prevReplaceDate: form.prevReplaceDate.trim(),
      lastReplaceDate: form.lastReplaceDate.trim(),
      mapX:  pendingRatio.x,
      mapY:  pendingRatio.y,
      floor: 'factory',
    };
    onSave(bf);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 bg-blue-600">
          <div>
            <p className="text-xs text-blue-200">공장 도면 위치 지정 완료</p>
            <h2 className="text-base font-bold text-white mt-0.5">백필터 정보 입력</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        {/* 좌표 표시 */}
        <div className="mx-5 mt-4 mb-1 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span className="text-xs text-blue-700">
            위치: ({(pendingRatio.x * 100).toFixed(1)}%, {(pendingRatio.y * 100).toFixed(1)}%)
          </span>
        </div>
        {/* 폼 */}
        <div className="px-5 py-3 space-y-3 max-h-[55vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>허가증상 배출구번호 <span className="text-red-400">*</span></label>
              <input type="text" value={form.id} onChange={e => set('id', e.target.value)} className={INPUT_CLS} placeholder="예) 1" autoFocus />
            </div>
            <div>
              <label className={LABEL_CLS}>배출구 일련번호</label>
              <input type="number" value={form.outletSeq} onChange={e => set('outletSeq', e.target.value)} className={INPUT_CLS} placeholder="예) 9" />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>시설명 <span className="text-red-400">*</span></label>
            <input type="text" value={form.facilityName} onChange={e => set('facilityName', e.target.value)} className={INPUT_CLS} placeholder="예) BK300 소성시설" />
          </div>
          <div>
            <label className={LABEL_CLS}>방지시설 정보</label>
            <input type="text" value={form.preventionInfo} onChange={e => set('preventionInfo', e.target.value)} className={INPUT_CLS} placeholder="예) 여과집진시설" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>여과포 규격</label>
              <input type="text" value={form.filterSpec} onChange={e => set('filterSpec', e.target.value)} className={INPUT_CLS} placeholder="Φ156 × 3085L" />
            </div>
            <div>
              <label className={LABEL_CLS}>여과포 수량</label>
              <input type="text" value={form.filterQty} onChange={e => set('filterQty', e.target.value)} className={INPUT_CLS} placeholder="28×24=672" />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>재질</label>
            <input type="text" value={form.material} onChange={e => set('material', e.target.value)} className={INPUT_CLS} placeholder="예) nomex" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>전전교체일</label>
              <input type="date" value={form.prevReplaceDate} onChange={e => set('prevReplaceDate', e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>전교체일</label>
              <input type="date" value={form.lastReplaceDate} onChange={e => set('lastReplaceDate', e.target.value)} className={INPUT_CLS} />
            </div>
          </div>
        </div>
        {/* 버튼 */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            저장
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm transition">취소</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   메인 BagFilterMapView
   — 공장 항공사진 위에 핀 직접 추가/편집/드래그
───────────────────────────────────────── */
export default function BagFilterMapView() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { scale, offset, setOffset, clampOffset, handleWheel } = useZoomPan(
    canvasRef, FACTORY_IMG_W, FACTORY_IMG_H
  );

  const [pins, setPins]                   = useState<BagFilter[]>([]);
  const [addMode, setAddMode]             = useState(false);
  const [pendingRatio, setPendingRatio]   = useState<{ x: number; y: number } | null>(null);
  const [editPin, setEditPin]             = useState<BagFilter | null>(null);

  /* 드래그 이동 refs */
  const draggingPin    = useRef<string | null>(null);
  const dragStartPos   = useRef({ cx: 0, cy: 0 });
  const didDragPin     = useRef(false);

  /* 화면 팬 refs */
  const isPanning      = useRef(false);
  const panStart       = useRef({ cx: 0, cy: 0, ox: 0, oy: 0 });
  const didPan         = useRef(false);

  /* ESC 키 → 추가 모드 취소 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setAddMode(false); setPendingRatio(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 핀 목록 로드 — floor='factory' 기준 */
  const loadPins = useCallback(async () => {
    const all = await getAllBagFilters();
    // floor가 'factory' 이거나 mapX/mapY가 있는 항목만 표시
    setPins(all.filter(bf => bf.mapX !== undefined && bf.mapY !== undefined && bf.floor === 'factory'));
  }, []);

  useEffect(() => { loadPins(); }, [loadPins]);

  /* 클라이언트 좌표 → 이미지 비율 좌표 */
  const clientToRatio = useCallback((cx: number, cy: number): { x: number; y: number } | null => {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const mx = cx - rect.left - rect.width  / 2;
    const my = cy - rect.top  - rect.height / 2;
    const ix = (mx - offset.x) / scale + FACTORY_IMG_W / 2;
    const iy = (my - offset.y) / scale + FACTORY_IMG_H / 2;
    if (ix < 0 || ix > FACTORY_IMG_W || iy < 0 || iy > FACTORY_IMG_H) return null;
    return { x: ix / FACTORY_IMG_W, y: iy / FACTORY_IMG_H };
  }, [offset, scale]);

  /* ── 캔버스 이벤트 ── */
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (addMode) return;
    isPanning.current = true;
    didPan.current    = false;
    panStart.current  = { cx: e.clientX, cy: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    /* 핀 드래그 */
    if (draggingPin.current) {
      const dx = e.clientX - dragStartPos.current.cx;
      const dy = e.clientY - dragStartPos.current.cy;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) didDragPin.current = true;
      if (didDragPin.current) {
        const r = clientToRatio(e.clientX, e.clientY);
        if (r) {
          setPins(prev => prev.map(p =>
            p.id === draggingPin.current ? { ...p, mapX: r.x, mapY: r.y } : p
          ));
        }
      }
      return;
    }
    /* 팬 */
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.cx;
      const dy = e.clientY - panStart.current.cy;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) didPan.current = true;
      if (didPan.current) {
        setOffset(clampOffset(panStart.current.ox + dx, panStart.current.oy + dy, scale));
      }
    }
  };

  const handleCanvasMouseUp = async (e: React.MouseEvent) => {
    /* 핀 드래그 종료 → 위치 저장 */
    if (draggingPin.current) {
      const id = draggingPin.current;
      draggingPin.current = null;
      if (didDragPin.current) {
        const pin = pins.find(p => p.id === id);
        if (pin?.mapX !== undefined && pin?.mapY !== undefined) {
          await saveBagFilterPosition(id, 'factory', pin.mapX, pin.mapY);
        }
      }
      didDragPin.current = false;
      return;
    }
    /* 팬 종료 */
    if (isPanning.current) {
      isPanning.current = false;
      if (didPan.current) { didPan.current = false; return; }
    }
    /* 핀 추가 모드 클릭 → 좌표 저장 후 모달 오픈 */
    if (addMode) {
      const r = clientToRatio(e.clientX, e.clientY);
      if (r) {
        setPendingRatio(r);
        setAddMode(false);
      }
    }
  };

  /* 핀 mousedown → 드래그 시작 */
  const handlePinMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    draggingPin.current  = id;
    dragStartPos.current = { cx: e.clientX, cy: e.clientY };
    didDragPin.current   = false;
  };

  /* 핀 click → 수정 모달 (드래그가 아닌 경우만) */
  const handlePinClick = (e: React.MouseEvent, pin: BagFilter) => {
    e.stopPropagation();
    if (didDragPin.current) return;
    setEditPin(pin);
  };

  /* 저장 — 신규 추가 */
  const handleAddSave = async (bf: BagFilter) => {
    try {
      await addBagFilter(bf);
    } catch {
      await saveBagFilterPosition(bf.id, 'factory', bf.mapX!, bf.mapY!);
    }
    setPendingRatio(null);
    loadPins();
  };

  /* 저장 — 수정 */
  const handleEditSave = async (updated: BagFilter) => {
    await updateBagFilter(updated);
    setEditPin(null);
    loadPins();
  };

  /* 도면에서 핀 제거 */
  const handleRemovePin = async (id: string) => {
    await removeBagFilterPosition(id);
    setEditPin(null);
    loadPins();
  };

  /* 상태별 카운트 */
  const countByStatus = pins.reduce(
    (acc, bf) => {
      const lbl = getReplaceLabel(bf);
      if (lbl === '교체필요') acc.replace++;
      else if (lbl === '교체임박') acc.soon++;
      else acc.ok++;
      return acc;
    },
    { ok: 0, soon: 0, replace: 0 }
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── 상단 툴바 ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0 flex-wrap">
        {/* 타이틀 */}
        <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
          </svg>
          공장 전체 도면
        </span>

        <div className="h-4 w-px bg-gray-200" />

        {/* 현황 뱃지 */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-semibold">
            전체 <b className="text-gray-800">{pins.length}</b>
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            정상 <b>{countByStatus.ok}</b>
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            교체임박 <b>{countByStatus.soon}</b>
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            교체필요 <b>{countByStatus.replace}</b>
          </span>
        </div>

        <div className="flex-1" />

        {/* 범례 */}
        <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
          {([['#22c55e','정상'],['#f59e0b','교체임박'],['#ef4444','교체필요']] as const).map(([c,l]) => (
            <span key={l} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-200 hidden md:block" />

        {/* 핀 추가 버튼 */}
        <button
          onClick={() => setAddMode(v => !v)}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm',
            addMode
              ? 'bg-blue-600 text-white ring-2 ring-blue-300 animate-pulse'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200',
          ].join(' ')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
          </svg>
          {addMode ? '위치 클릭하여 핀 추가' : '도면에서 추가'}
        </button>
      </div>

      {/* ── 도면 영역 ── */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden bg-gray-900 select-none"
        style={{ cursor: addMode ? 'crosshair' : (isPanning.current ? 'grabbing' : 'grab') }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => {
          if (draggingPin.current) {
            draggingPin.current = null;
            loadPins();
          }
          isPanning.current = false;
        }}
        onWheel={handleWheel}
      >
        {/* 이미지 + 핀 컨테이너 */}
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: 'center center',
            width: FACTORY_IMG_W,
            height: FACTORY_IMG_H,
          }}
        >
          {/* 공장 항공사진 */}
          <img
            src={FACTORY_IMG}
            width={FACTORY_IMG_W}
            height={FACTORY_IMG_H}
            alt="공장 전체 도면"
            style={SHARP_IMG_STYLE}
          />

          {/* ── 핀 마커 ── */}
          {pins.map(pin => {
            if (pin.mapX === undefined || pin.mapY === undefined) return null;
            const px    = pin.mapX * FACTORY_IMG_W;
            const py    = pin.mapY * FACTORY_IMG_H;
            const color = getPinColor(pin);
            return (
              <div
                key={pin.id}
                style={{
                  position: 'absolute',
                  left: px,
                  top: py,
                  transform: 'translate(-50%, -100%)',
                  cursor: 'grab',
                  zIndex: 10,
                  userSelect: 'none',
                }}
                onMouseDown={e => handlePinMouseDown(e, pin.id)}
                onClick={e => handlePinClick(e, pin)}
              >
                {/* 물방울 핀 SVG */}
                <svg
                  width="28" height="36"
                  viewBox="0 0 28 36"
                  style={{ display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
                >
                  <path
                    d="M14 2C8.477 2 4 6.477 4 12c0 7.5 10 22 10 22s10-14.5 10-22C24 6.477 19.523 2 14 2z"
                    fill={color}
                    stroke="white"
                    strokeWidth="2"
                  />
                  <circle cx="14" cy="12" r="5" fill="white" fillOpacity="0.9"/>
                  <text
                    x="14" y="15.5"
                    textAnchor="middle"
                    fontSize="6"
                    fontWeight="bold"
                    fill={color}
                    style={{ pointerEvents: 'none' }}
                  >
                    {pin.id}
                  </text>
                </svg>
                {/* 툴팁 라벨 (hover) */}
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%) translateY(-2px)',
                  whiteSpace: 'nowrap',
                  background: 'rgba(0,0,0,0.75)',
                  color: 'white',
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  pointerEvents: 'none',
                  opacity: 0,
                  transition: 'opacity 0.15s',
                }}
                  className="pin-tooltip"
                >
                  #{pin.id} {pin.facilityName}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 추가 모드 안내 오버레이 ── */}
        {addMode && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm rounded-full shadow-xl pointer-events-none">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            </svg>
            백필터를 배치할 위치를 클릭하세요 &nbsp;—&nbsp;
            <span className="opacity-80 text-xs">ESC로 취소</span>
          </div>
        )}

        {/* ── 배치 카운트 뱃지 ── */}
        <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/50 text-white text-xs rounded-full pointer-events-none">
          {pins.length}개 배치됨
        </div>

        {/* ── 줌 안내 ── */}
        <div className="absolute bottom-3 right-3 text-xs text-white/50 pointer-events-none select-none">
          휠로 줌 · 드래그로 이동 · 핀 드래그로 위치 편집
        </div>
      </div>

      {/* ── 모달 ── */}
      {pendingRatio && (
        <PinAddModal
          pendingRatio={pendingRatio}
          onSave={handleAddSave}
          onClose={() => setPendingRatio(null)}
        />
      )}
      {editPin && (
        <PinEditModal
          item={editPin}
          onSave={handleEditSave}
          onClose={() => setEditPin(null)}
          onRemove={() => handleRemovePin(editPin.id)}
        />
      )}

      {/* ── 핀 hover 툴팁 CSS ── */}
      <style>{`
        div[style*="grab"]:hover .pin-tooltip { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
