import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { BuildingPolygon, Point } from '../../types/polygon';
import type { Extinguisher, ExtinguisherStatus } from '../../types/extinguisher';
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
  addNewExtinguisher,
  getNextExtinguisherId,
} from '../../services/floorPlanService';
import { getAllExtinguishers } from '../../services/extinguisherService';

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
  keywords: string[];
}

const BUILDING_FLOORS: Record<string, FloorDef[]> = {
  '관리동': [
    {
      id: '관리동_1층',
      label: '1층',
      img: '/floor-1f.png',
      imgW: 1024,
      imgH: 765,
      keywords: ['관리동', '1층'],
    },
    {
      id: '관리동_2층',
      label: '2층',
      img: '/floor-2f.png',
      imgW: 1024,
      imgH: 546,
      keywords: ['관리동'],
    },
  ],
};

/* ─────────────────────────────────────────
   화질 선명 고정 스타일 (공통)
   - pixelated + crisp-edges 이중 적용
   - will-change 절대 사용 금지
───────────────────────────────────────── */
const SHARP_IMG_STYLE: React.CSSProperties = {
  display: 'block',
  imageRendering: 'pixelated' as React.CSSProperties['imageRendering'],
  WebkitBackfaceVisibility: 'hidden' as React.CSSProperties['WebkitBackfaceVisibility'],
  backfaceVisibility: 'hidden' as React.CSSProperties['backfaceVisibility'],
  userSelect: 'none',
  pointerEvents: 'none',
  /* will-change → 의도적으로 제거 (화질 뭉개짐 원인) */
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
   소화기 편집 모달 (기존 마커 클릭 시)
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
            { k: 'location'      as const, label: '설치 위치' },
            { k: 'type'          as const, label: '소화기 종류' },
            { k: 'mfgDate'       as const, label: '제조년월',    ph: 'YYYY-MM' },
            { k: 'lastCheckDate' as const, label: '최근 점검일', ph: 'YYYY-MM-DD' },
            { k: 'manager'       as const, label: '담당자' },
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
              value={form.note ?? ''}
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
   신규 소화기 추가 모달 ([+ 소화기 추가] 버튼용)
───────────────────────────────────────── */
interface NewExtinguisherForm {
  location: string;
  type: string;
  mfgDate: string;
  lastCheckDate: string;
  manager: string;
  status: string;
  note: string;
}

function AddModal({
  floor,
  pendingRatio,
  onSave,
  onClose,
}: {
  floor: FloorDef;
  pendingRatio: { x: number; y: number };
  onSave: (fe: Extinguisher) => void;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<NewExtinguisherForm>({
    location: '',
    type: 'ABC 분말 3.3kg',
    mfgDate: '',
    lastCheckDate: today,
    manager: '',
    status: '정상',
    note: '',
  });
  const set = (k: keyof NewExtinguisherForm, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.location.trim()) {
      alert('설치 위치를 입력하세요.');
      return;
    }
    // ID 자동 생성: 순번 방식 (BK-FE-001, 002, ...)
    const newId = getNextExtinguisherId();
    const newFe: Extinguisher = {
      id: newId,
      location: form.location,
      type: form.type,
      mfgDate: form.mfgDate,
      lastCheckDate: form.lastCheckDate,
      manager: form.manager,
      status: form.status as ExtinguisherStatus,
      note: form.note,
      mapX: pendingRatio.x,
      mapY: pendingRatio.y,
      floor: floor.id,
    };
    onSave(newFe);
  };

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
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 bg-blue-600">
          <div>
            <p className="text-xs text-blue-200">{floor.label} 도면 위치 지정 완료</p>
            <h2 className="text-base font-bold text-white mt-0.5">소화기 정보 입력</h2>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* 좌표 미리보기 */}
        <div className="mx-5 mt-4 mb-1 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span className="text-xs text-blue-700 font-mono">
            X: {(pendingRatio.x * 100).toFixed(1)}% &nbsp;/&nbsp; Y: {(pendingRatio.y * 100).toFixed(1)}%
          </span>
        </div>

        {/* 입력 폼 */}
        <div className="px-5 py-3 space-y-3 max-h-80 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              설치 위치 <span className="text-red-500">*</span>
            </label>
            <input
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="예: 관리동 1층 복도"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">소화기 종류</label>
            <select
              value={form.type}
              onChange={e => set('type', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white"
            >
              <option>ABC 분말 3.3kg</option>
              <option>ABC 분말 4.5kg</option>
              <option>하론 3kg</option>
              <option>자동확산 3kg</option>
              <option>K급 7.5L</option>
              <option>CO2 5kg</option>
              <option>기타</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">제조년월</label>
              <input
                value={form.mfgDate}
                onChange={e => set('mfgDate', e.target.value)}
                placeholder="YYYY-MM"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">최근 점검일</label>
              <input
                value={form.lastCheckDate}
                onChange={e => set('lastCheckDate', e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">담당자</label>
            <input
              value={form.manager}
              onChange={e => set('manager', e.target.value)}
              placeholder="담당자 이름"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
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
              placeholder="특이사항 입력"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            저장
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm transition-colors"
          >취소</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   왼쪽 건물/층 선택 사이드바
───────────────────────────────────────── */
function BuildingFloorPanel({
  selectedFloorId,
  onSelect,
}: {
  selectedFloorId: string | null;
  onSelect: (buildingName: string, floor: FloorDef) => void;
}) {
  const buildings = Object.entries(BUILDING_FLOORS);

  /* 건물별 펼침 상태 — 기본 전체 펼침 */
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    () => Object.fromEntries(buildings.map(([name]) => [name, true]))
  );

  const toggleBuilding = (name: string) =>
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }));

  return (
    <div
      className="flex-shrink-0 flex flex-col bg-white border-r border-gray-200"
      style={{ width: 200 }}
    >
      {/* 패널 헤더 */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800">건물 · 층 선택</p>
            <p className="text-[10px] text-gray-400 leading-tight">층을 클릭해 도면 열기</p>
          </div>
        </div>
      </div>

      {/* 건물 목록 */}
      <div className="flex-1 overflow-y-auto py-2">
        {buildings.map(([buildingName, floors]) => {
          const isOpen = expanded[buildingName] ?? true;
          const hasActive = floors.some(f => f.id === selectedFloorId);

          return (
            <div key={buildingName} className="mb-1">
              {/* 건물명 행 (클릭으로 펼침/접기) */}
              <button
                onClick={() => toggleBuilding(buildingName)}
                className={[
                  'w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors',
                  hasActive ? 'bg-blue-50' : 'hover:bg-gray-50',
                ].join(' ')}
              >
                {/* 건물 아이콘 */}
                <div className={[
                  'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                  hasActive ? 'bg-blue-600' : 'bg-gray-100',
                ].join(' ')}>
                  <svg
                    className={['w-4 h-4', hasActive ? 'text-white' : 'text-gray-500'].join(' ')}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={[
                    'text-sm font-bold truncate',
                    hasActive ? 'text-blue-700' : 'text-gray-800',
                  ].join(' ')}>{buildingName}</p>
                  <p className="text-[10px] text-gray-400">{floors.length}개 층</p>
                </div>
                {/* 펼침/접기 화살표 */}
                <svg
                  className={['w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform', isOpen ? 'rotate-90' : ''].join(' ')}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>

              {/* 층 목록 */}
              {isOpen && (
                <div className="ml-3 mr-2 mb-1 space-y-0.5">
                  {floors.map(floor => {
                    const isActive = floor.id === selectedFloorId;
                    return (
                      <button
                        key={floor.id}
                        onClick={() => onSelect(buildingName, floor)}
                        className={[
                          'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all',
                          isActive
                            ? 'bg-blue-600 shadow-sm'
                            : 'bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200',
                        ].join(' ')}
                      >
                        {/* 층 번호 배지 */}
                        <div className={[
                          'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-black',
                          isActive ? 'bg-white/20 text-white' : 'bg-white text-blue-600 border border-blue-200',
                        ].join(' ')}>
                          {floor.label.replace('층', '')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={[
                            'text-xs font-semibold',
                            isActive ? 'text-white' : 'text-gray-700',
                          ].join(' ')}>{floor.label}</p>
                          <p className={[
                            'text-[10px] leading-tight',
                            isActive ? 'text-blue-100' : 'text-gray-400',
                          ].join(' ')}>도면 보기</p>
                        </div>
                        {isActive && (
                          <svg className="w-3 h-3 text-white/80 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 안내 */}
      <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
          <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 14l-4-4 1.414-1.414L11 13.172l6.586-6.586L19 8l-8 8z"/>
          </svg>
          자동 저장 (localStorage)
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   내부 도면 뷰 (FloorView) — 1층·2층 공통
───────────────────────────────────────── */
function FloorView({
  floor,
  buildingName,
  onFloorSelect,
}: {
  floor: FloorDef;
  buildingName: string;
  onFloorSelect: (buildingName: string, floor: FloorDef) => void;
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

  /* 전체 소화기 ID 순서 맵 (NO. 열 동기화용) */
  const [allIdOrderMap, setAllIdOrderMap] = useState<Record<string, number>>({});

  useEffect(() => {
    getAllExtinguishers().then(all => {
      const map: Record<string, number> = {};
      all.forEach((fe, idx) => { map[fe.id] = idx + 1; });
      setAllIdOrderMap(map);
    });
  }, [markers]); // markers 변경 시 재계산

  /* 기존 마커 위치지정 모드 (편집 모드에서 미배치 소화기 선택 후 클릭) */
  const [selectedFe, setSelectedFe]     = useState<Extinguisher | null>(null);
  const [pendingPos, setPendingPos]     = useState<{ x: number; y: number } | null>(null);

  /* 신규 소화기 추가 모드 ([+ 소화기 추가] 버튼) */
  const [addMode,       setAddMode]       = useState(false);
  const [addPendingPos, setAddPendingPos] = useState<{ x: number; y: number } | null>(null);

  /* 편집 모달 (기존 마커 클릭) */
  const [editTarget, setEditTarget] = useState<Extinguisher | null>(null);
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);

  /* ── 드래그 이동 상태 ── */
  const draggingMarker   = useRef<{ id: string; startX: number; startY: number } | null>(null);
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
    draggingMarker.current   = { id: fe.id, startX: e.clientX, startY: e.clientY };
    isDraggingMarker.current = false;
  }, [editMode]);

  /* ── 캔버스 MouseDown ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (draggingMarker.current) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
    didDrag.current     = false;
    panOrigin.current   = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  /* ── 캔버스 MouseMove ── */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingMarker.current) {
      const dx = e.clientX - draggingMarker.current.startX;
      const dy = e.clientY - draggingMarker.current.startY;
      if (Math.sqrt(dx * dx + dy * dy) > 3) isDraggingMarker.current = true;
      return;
    }
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
      draggingMarker.current   = null;
      isDraggingMarker.current = false;
      return;
    }

    const wasDrag = didDrag.current;
    pointerDown.current = null;
    didDrag.current     = false;
    panOrigin.current   = null;
    if (wasDrag) return;

    // [+ 소화기 추가] 배치 모드 → 클릭 위치 저장 후 정보입력 모달
    if (addMode) {
      const pt = clientToRatio(e.clientX, e.clientY);
      if (pt) setAddPendingPos(pt);
      return;
    }

    // 편집 모드 + 기존 소화기 선택됨 → 위치 임시 지정
    if (editMode && selectedFe) {
      const pt = clientToRatio(e.clientX, e.clientY);
      if (pt) setPendingPos(pt);
    }
  }, [addMode, editMode, selectedFe, clientToRatio, floor.id]);

  /* ── 기존 미배치 소화기 위치 확정 ── */
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

  /* ── 신규 소화기 추가 저장 ── */
  const handleAddSave = useCallback((fe: Extinguisher) => {
    addNewExtinguisher(fe);
    setMarkers(prev => [...prev, fe]);
    setAddPendingPos(null);
    setAddMode(false);
  }, []);

  /* ── 마커 클릭 → 편집 모달 (일반 모드) ── */
  const onMarkerClick = useCallback((e: React.MouseEvent, fe: Extinguisher) => {
    e.stopPropagation();
    if (isDraggingMarker.current) return;
    if (editMode) return;
    if (addMode) return;
    setEditTarget(fe);
  }, [editMode, addMode]);

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
        setPendingPos(null);
        setSelectedFe(null);
        setEditTarget(null);
        setAddPendingPos(null);
        setAddMode(false);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  /* 층 전환 시 마커 재로드 */
  useEffect(() => {
    setMarkers(getExtinguishersOnFloor(floor.id));
    setUnplaced(getUnplacedExtinguishers(floor.id));
    setEditMode(false);
    setAddMode(false);
    setPendingPos(null);
    setSelectedFe(null);
    setAddPendingPos(null);
    setEditTarget(null);
  }, [floor.id]);

  const cursor = addMode
    ? 'crosshair'
    : (editMode && selectedFe ? 'crosshair' : 'grab');

  /* ── 이미지 style: 화질 선명 최우선 ── */
  const floorImgStyle: React.CSSProperties = {
    ...SHARP_IMG_STYLE,
    width: imgW,
    height: imgH,
    /* crisp-edges는 pixelated 폴백 — 두 속성 모두 inline으로 적용 */
  };

  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ height: '100%' }}>

      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          <span className="text-sm font-semibold text-gray-700">{buildingName}</span>
          <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full font-bold">{floor.label}</span>
          <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            소화기 {markers.length}개 배치됨
          </span>
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

          {/* [+ 소화기 추가] 버튼 */}
          <button
            onClick={() => {
              setAddMode(p => {
                const next = !p;
                if (next) {
                  setEditMode(false);
                  setSelectedFe(null);
                  setPendingPos(null);
                } else {
                  setAddPendingPos(null);
                }
                return next;
              });
            }}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all',
              addMode
                ? 'bg-blue-700 text-white ring-2 ring-blue-300'
                : 'bg-blue-600 text-white hover:bg-blue-700',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
            </svg>
            {addMode ? '도면 클릭 → 위치 지정 (ESC 취소)' : '소화기 추가'}
          </button>

          {/* 편집 토글 */}
          <button
            onClick={() => {
              setEditMode(p => {
                const next = !p;
                if (next) {
                  setAddMode(false);
                  setAddPendingPos(null);
                } else {
                  setSelectedFe(null);
                  setPendingPos(null);
                }
                return next;
              });
            }}
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
            {editMode ? '편집 중… (ESC 취소)' : '위치 편집'}
          </button>
        </div>
      </div>

      {/* ── 안내 배너 ── */}
      {(addMode || editMode) && (
        <div className={[
          'flex items-center gap-2 px-4 py-1.5 border-b text-xs flex-shrink-0',
          addMode
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-orange-50 border-orange-200 text-orange-700',
        ].join(' ')}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          {addMode
            ? <span>📍 도면의 원하는 위치를 <strong>클릭</strong>하면 소화기를 추가할 수 있습니다 · ESC로 취소</span>
            : selectedFe
              ? <span><strong className="text-blue-700">{selectedFe.id}</strong> 선택됨 – 도면 클릭으로 위치 지정 · 배치된 마커를 드래그해 이동</span>
              : <span>오른쪽 목록에서 소화기 선택 후 도면 클릭 배치 · 배치된 마커 드래그로 이동</span>
          }
        </div>
      )}

      {/* ── 도면 뷰포트 ── */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 select-none relative"
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (draggingMarker.current) {
            draggingMarker.current   = null;
            isDraggingMarker.current = false;
          }
          pointerDown.current = null;
          didDrag.current     = false;
          panOrigin.current   = null;
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
            /* will-change 제거 — 화질 뭉개짐 방지 */
          }}
        >
          {/* ── 도면 이미지: 화질 선명 최우선 ── */}
          <img
            ref={imgRef}
            src={floor.img}
            alt={`${buildingName} ${floor.label} 도면`}
            draggable={false}
            width={imgW}
            height={imgH}
            style={floorImgStyle}
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
            {markers.map((fe) => {
              const mx    = (fe.mapX ?? 0) * imgW;
              const my    = (fe.mapY ?? 0) * imgH;
              const color = STATUS_COLOR[fe.status] ?? '#6b7280';
              const isHov = hoveredId === fe.id;
              /* NO. 열과 동기화된 순번 */
              const seqNo = allIdOrderMap[fe.id] ?? null;

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
                  {/* 호버 시 외곽 링 */}
                  {isHov && (
                    <circle cx={mx} cy={my} r={20}
                      fill={color} fillOpacity={0.15}
                      stroke={color} strokeWidth={1.5} strokeDasharray="3 2"
                      style={{ pointerEvents: 'none' }}/>
                  )}

                  {/* 메인 마커 원 */}
                  <circle
                    cx={mx} cy={my}
                    r={isHov ? 15 : 12}
                    fill={color}
                    fillOpacity={0.92}
                    stroke="white"
                    strokeWidth={2.5}
                    style={{
                      transition: 'r .1s',
                      filter: isHov ? `drop-shadow(0 2px 6px ${color}99)` : 'none',
                    }}
                  />

                  {/* 소화기 이모지 */}
                  <text x={mx} y={my + 5} textAnchor="middle" fontSize={11}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}>🧯</text>

                  {/* ── 일련번호 배지 (마커 우측 상단) ── */}
                  {seqNo !== null && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle
                        cx={mx + 10} cy={my - 10}
                        r={7}
                        fill="#1d4ed8"
                        stroke="white"
                        strokeWidth={1.5}
                      />
                      <text
                        x={mx + 10} y={my - 6}
                        textAnchor="middle"
                        fontSize={7}
                        fontWeight="800"
                        fill="white"
                        fontFamily="-apple-system,'Malgun Gothic',sans-serif"
                        style={{ userSelect: 'none' }}
                      >
                        {seqNo}
                      </text>
                    </g>
                  )}

                  {/* 호버 툴팁 */}
                  {isHov && (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect x={mx - 46} y={my - 40} width={92} height={24} rx={6}
                        fill="rgba(15,15,30,0.85)"/>
                      <text x={mx} y={my - 23} textAnchor="middle"
                        fontSize={9.5} fill="white" fontWeight="700"
                        fontFamily="-apple-system,'Malgun Gothic',sans-serif">
                        {fe.id}
                      </text>
                      <text x={mx} y={my - 11} textAnchor="middle"
                        fontSize={8.5} fill={color} fontWeight="600"
                        fontFamily="-apple-system,'Malgun Gothic',sans-serif">
                        {STATUS_LABEL[fe.status] ?? fe.status}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* 기존 소화기 임시 배치 마커 (편집 모드) */}
            {pendingPos && (
              <g style={{ pointerEvents: 'none' }}>
                <circle
                  cx={pendingPos.x * imgW} cy={pendingPos.y * imgH}
                  r={14} fill="#3b82f6" fillOpacity={0.85}
                  stroke="white" strokeWidth={2.5} strokeDasharray="4 2"/>
                <text x={pendingPos.x * imgW} y={pendingPos.y * imgH + 5}
                  textAnchor="middle" fontSize={13}
                  style={{ userSelect: 'none' }}>📍</text>
              </g>
            )}
          </svg>
        </div>

        {/* 기존 소화기 위치 확인 팝업 (편집 모드) */}
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

        {/* 줌 레벨 표시 */}
        <div className="absolute top-3 left-3 text-gray-600 text-xs font-mono rounded px-2 py-1 pointer-events-none"
          style={{ background: 'rgba(255,255,255,0.75)', zIndex: 20 }}>
          ×{scale.toFixed(2)}
        </div>
        <div className="absolute bottom-4 left-4 text-gray-500 text-xs rounded-lg px-2.5 py-1.5 pointer-events-none"
          style={{ background: 'rgba(255,255,255,0.72)', zIndex: 20 }}>
          🖱 휠: 줌 · 드래그: 이동{editMode ? ' · 마커 드래그: 위치 이동' : ''}
        </div>
      </div>

      {/* 기존 소화기 편집 모달 */}
      {editTarget && (
        <EditModal
          item={editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
          onRemoveFromMap={handleRemoveFromMap}
        />
      )}

      {/* 신규 소화기 추가 모달 */}
      {addPendingPos && (
        <AddModal
          floor={floor}
          pendingRatio={addPendingPos}
          onSave={handleAddSave}
          onClose={() => setAddPendingPos(null)}
        />
      )}

      {/* (내부용 — 층 전환 콜백 전달, 실제로는 사이드바에서 처리) */}
      <div style={{ display: 'none' }} data-floor-select={JSON.stringify({ buildingName, onFloorSelect })} />
    </div>
  );
}

/* ─────────────────────────────────────────
   유틸 (조감도용)
───────────────────────────────────────── */
function toSvgPts(pts: Point[], W: number, H: number) {
  return pts.map(p => `${p.x * W},${p.y * H}`).join(' ');
}
function centroid(pts: Point[], W: number, H: number) {
  return {
    cx: pts.reduce((s, p) => s + p.x, 0) / pts.length * W,
    cy: pts.reduce((s, p) => s + p.y, 0) / pts.length * H,
  };
}
function imgDist(a: Point, b: Point, W: number, H: number) {
  return Math.sqrt(((a.x - b.x) * W) ** 2 + ((a.y - b.y) * H) ** 2);
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
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) didDrag.current = true;
    }
    if (!drawMode && panOrigin.current && didDrag.current) {
      const { mx, my, ox, oy } = panOrigin.current;
      setOffset(clampOffset(ox + (e.clientX - mx), oy + (e.clientY - my), scale));
    }
    if (drawMode) setCursorPt(clientToRatio(e.clientX, e.clientY));
  }, [drawMode, scale, clientToRatio, clampOffset]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const wasDrag = didDrag.current;
    pointerDown.current = null;
    didDrag.current     = false;
    panOrigin.current   = null;
    if (!drawMode || wasDrag) return;
    const pt = clientToRatio(e.clientX, e.clientY);
    if (!pt) return;
    if (draft.length >= 3 && imgDist(pt, draft[0], AERIAL_W, AERIAL_H) < CLOSE_THRESHOLD) {
      triggerClose(draft);
      return;
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
    const color    = PALETTE[polygons.length % PALETTE.length];
    const newPoly: BuildingPolygon = { id: `poly-${Date.now()}`, name: name.trim(), points: cur, color };
    setPolygons(addPolygon(newPoly));
    setDraft([]);
    setCursorPt(null);
    setDrawMode(false);
    setSelectedId(newPoly.id);
  }, [polygons.length]);

  const handleDelete = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPolygons(removePolygon(id));
    if (selectedId === id) setSelectedId(null);
    if (hoveredId  === id) setHoveredId(null);
  }, [selectedId, hoveredId]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawMode) {
        setDraft([]);
        setCursorPt(null);
        setDrawMode(false);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [drawMode]);

  const toggleDraw = () => setDrawMode(p => { setDraft([]); setCursorPt(null); return !p; });

  const focusPolygon = useCallback((poly: BuildingPolygon) => {
    setSelectedId(poly.id);
    const { cx, cy } = centroid(poly.points, AERIAL_W, AERIAL_H);
    const ts = Math.min(MAX_SCALE, Math.max(containScale * 2.5, 2));
    setScale(ts);
    setOffset(clampOffset(-(cx - AERIAL_W / 2) * ts, -(cy - AERIAL_H / 2) * ts, ts));
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

  /* 조감도 이미지 style */
  const aerialImgStyle: React.CSSProperties = {
    ...SHARP_IMG_STYLE,
    width: AERIAL_W,
    height: AERIAL_H,
  };

  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ height: '100%' }}>
      {/* 툴바 */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">🗺 공장 조감도</span>
          <span className="text-xs text-gray-400">· 태경BK 단양1공장</span>
          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-200">
            💡 왼쪽 패널에서 층 선택 또는 건물 클릭
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg px-2 py-1">
            <button
              onClick={() => setScale(s => { const n = Math.min(MAX_SCALE, s * 1.25); setOffset(o => clampOffset(o.x, o.y, n)); return n; })}
              className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg">+</button>
            <span className="text-xs text-gray-500 w-14 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(s => { const n = Math.max(containScale, s * 0.8); setOffset(o => clampOffset(o.x, o.y, n)); return n; })}
              className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-blue-600 font-bold text-lg">−</button>
            <button onClick={resetView} className="ml-1 text-gray-400 hover:text-blue-600 px-1" title="전체 보기">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
              </svg>
            </button>
          </div>
          <button
            onClick={toggleDraw}
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
        onMouseLeave={() => {
          pointerDown.current = null;
          didDrag.current     = false;
          panOrigin.current   = null;
          setCursorPt(null);
        }}
        onDoubleClick={handleDblClick}
        onWheel={handleWheel}
      >
        <div style={{
          width: AERIAL_W, height: AERIAL_H,
          flexShrink: 0, position: 'relative',
          transformOrigin: '50% 50%',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          /* will-change 제거 */
        }}>
          <img
            ref={imgRef}
            src="/factory-aerial.jpg"
            alt="단양1공장 항공 조감도"
            draggable={false}
            width={AERIAL_W}
            height={AERIAL_H}
            style={aerialImgStyle}
          />
          <svg style={{
            position: 'absolute', top: 0, left: 0,
            width: AERIAL_W, height: AERIAL_H,
            overflow: 'visible',
            pointerEvents: drawMode ? 'none' : 'auto',
          }}>
            {polygons.map(poly => {
              const isHov     = hoveredId === poly.id || selectedId === poly.id;
              const isSel     = selectedId === poly.id;
              const { cx, cy } = centroid(poly.points, AERIAL_W, AERIAL_H);
              const lw        = Math.min(Math.max(poly.name.length * 8 + 20, 64), 160);
              const hasFloors = !!BUILDING_FLOORS[poly.name];
              return (
                <g key={poly.id} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredId(poly.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={e => onPolyClick(poly, e as unknown as React.MouseEvent)}
                >
                  <polygon points={toSvgPts(poly.points, AERIAL_W, AERIAL_H)}
                    fill={poly.color} fillOpacity={isHov ? 0.52 : 0.28}
                    stroke={poly.color} strokeWidth={isSel ? 3 : isHov ? 2.5 : 1.8}
                    strokeLinejoin="round" strokeDasharray={isSel ? '8 3' : 'none'}
                    style={{ transition: 'fill-opacity .12s, stroke-width .12s' }}/>
                  {isSel && (
                    <polygon points={toSvgPts(poly.points, AERIAL_W, AERIAL_H)}
                      fill="none" stroke={poly.color} strokeWidth={6} strokeOpacity={0.25}
                      strokeLinejoin="round" style={{ pointerEvents: 'none' }}/>
                  )}
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={cx - lw / 2} y={cy - 13} width={lw} height={26} rx={7}
                      fill={isHov ? poly.color : 'rgba(0,0,0,0.68)'}
                      style={{ transition: 'fill .12s' }}/>
                    <text x={cx} y={cy + 5} textAnchor="middle"
                      fontSize={12} fontWeight="700" fill="white"
                      fontFamily="-apple-system,'Malgun Gothic',sans-serif">
                      {poly.name}{hasFloors ? ' 🏢' : ''}
                    </text>
                  </g>
                  {isHov && !drawMode && (
                    <g style={{ cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); handleDelete(poly.id); }}>
                      <circle cx={cx + lw / 2 + 2} cy={cy - 13} r={7} fill="#ef4444"/>
                      <text x={cx + lw / 2 + 2} y={cy - 9} textAnchor="middle"
                        fontSize={9} fill="white" fontWeight="bold">✕</text>
                    </g>
                  )}
                </g>
              );
            })}

            {draft.length > 0 && (
              <g style={{ pointerEvents: 'none' }}>
                {draft.length >= 3 && (
                  <polygon points={toSvgPts(draft, AERIAL_W, AERIAL_H)}
                    fill="#f97316" fillOpacity={0.15} stroke="none"/>
                )}
                {draft.map((pt, i) => i === 0 ? null : (
                  <line key={`s${i}`}
                    x1={draft[i - 1].x * AERIAL_W} y1={draft[i - 1].y * AERIAL_H}
                    x2={pt.x * AERIAL_W} y2={pt.y * AERIAL_H}
                    stroke="#f97316" strokeWidth={2} strokeLinecap="round"/>
                ))}
                {cursorPt && (
                  <line
                    x1={draft[draft.length - 1].x * AERIAL_W} y1={draft[draft.length - 1].y * AERIAL_H}
                    x2={cursorPt.x * AERIAL_W} y2={cursorPt.y * AERIAL_H}
                    stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.65}/>
                )}
                {draft.map((pt, i) => {
                  const isFirst = i === 0;
                  const hi = isFirst && nearFirst;
                  return (
                    <circle key={`d${i}`}
                      cx={pt.x * AERIAL_W} cy={pt.y * AERIAL_H}
                      r={isFirst ? (hi ? 11 : 7) : 4.5}
                      fill={isFirst ? (hi ? '#22c55e' : '#f97316') : '#f97316'}
                      stroke="white" strokeWidth={2}
                      style={{ transition: 'r .1s, fill .1s',
                        filter: hi ? 'drop-shadow(0 0 5px #22c55e)' : 'none' }}/>
                  );
                })}
                {nearFirst && (
                  <circle cx={draft[0].x * AERIAL_W} cy={draft[0].y * AERIAL_H} r={17}
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
  );
}

/* ─────────────────────────────────────────
   메인 MapView — 레이아웃 총괄
   [BuildingFloorPanel | AerialView or FloorView]
───────────────────────────────────────── */
export default function MapView() {
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [selectedFloor,    setSelectedFloor]    = useState<FloorDef | null>(null);

  /* 건물/층 선택 패널에서 선택 시 */
  const handleFloorSelect = useCallback((buildingName: string, floor: FloorDef) => {
    setSelectedBuilding(buildingName);
    setSelectedFloor(floor);
  }, []);

  /* 현재 선택된 층 ID */
  const activeFloorId = selectedFloor?.id ?? null;

  return (
    <div
      className="flex"
      style={{ height: 'calc(100vh - 108px)' }}
    >
      {/* ── 왼쪽: 건물/층 선택 패널 ── */}
      <BuildingFloorPanel
        selectedFloorId={activeFloorId}
        onSelect={handleFloorSelect}
      />

      {/* ── 오른쪽: 조감도 or 도면 뷰어 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedFloor && selectedBuilding ? (
          /* 층 도면 뷰 */
          <FloorView
            key={selectedFloor.id}
            floor={selectedFloor}
            buildingName={selectedBuilding}
            onFloorSelect={handleFloorSelect}
          />
        ) : (
          /* 조감도 — 폴리곤 클릭 시 해당 건물 첫 번째 층으로 진입 */
          <AerialView
            onBuildingSelect={(buildingName) => {
              const floors = BUILDING_FLOORS[buildingName];
              if (floors && floors.length > 0) {
                /* 층이 1개면 바로 진입, 여러 개면 첫 번째 층으로 진입 */
                handleFloorSelect(buildingName, floors[0]);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
