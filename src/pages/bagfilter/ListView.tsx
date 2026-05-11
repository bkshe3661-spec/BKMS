import { useState, useEffect, useMemo } from 'react';
import {
  getAllBagFilters,
  addBagFilter,
  updateBagFilter,
  deleteBagFilter,
} from '../../services/bagfilterService';
import type { BagFilter } from '../../types/bagfilter';

/* ─────────────────────────────────────────
   교체 주기 상태 계산 (전교체일 기준 1년)
───────────────────────────────────────── */
type ReplaceStatus = '정상' | '교체임박' | '교체필요';

function calcReplaceStatus(lastReplaceDate: string): ReplaceStatus {
  if (!lastReplaceDate?.trim()) return '교체필요';
  const d = new Date(lastReplaceDate.trim());
  if (isNaN(d.getTime())) return '교체필요';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays >= 365) return '교체필요';
  if (diffDays >= 300) return '교체임박';
  return '정상';
}

const STATUS_STYLE: Record<ReplaceStatus, { bg: string; text: string; dot: string }> = {
  정상:    { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  교체임박: { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  교체필요: { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
};

/* ─────────────────────────────────────────
   공통 입력 스타일
───────────────────────────────────────── */
const INPUT_CLS = 'w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const LABEL_CLS = 'block text-xs font-semibold text-gray-500 mb-1.5';

/* ─────────────────────────────────────────
   폼 인터페이스
───────────────────────────────────────── */
interface BfForm {
  id: string;
  outletSeq: string;
  facilityName: string;
  preventionInfo: string;
  filterSpec: string;
  filterQty: string;
  material: string;
  prevReplaceDate: string;
  lastReplaceDate: string;
}

const EMPTY_FORM: BfForm = {
  id: '', outletSeq: '', facilityName: '',
  preventionInfo: '', filterSpec: '', filterQty: '',
  material: '', prevReplaceDate: '', lastReplaceDate: '',
};

/* ─────────────────────────────────────────
   폼 → BagFilter 변환
───────────────────────────────────────── */
function formToBf(f: BfForm, existing?: BagFilter): BagFilter {
  return {
    id:              f.id.trim(),
    outletSeq:       Number(f.outletSeq) || 0,
    facilityName:    f.facilityName.trim(),
    preventionInfo:  f.preventionInfo.trim(),
    filterSpec:      f.filterSpec.trim(),
    filterQty:       f.filterQty.trim(),
    material:        f.material.trim(),
    prevReplaceDate: f.prevReplaceDate.trim(),
    lastReplaceDate: f.lastReplaceDate.trim(),
    // 기존 도면 위치 보존
    mapX:  existing?.mapX,
    mapY:  existing?.mapY,
    floor: existing?.floor,
  };
}

/* ═══════════════════════════════════════════
   추가 모달
═══════════════════════════════════════════ */
function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<BfForm>(EMPTY_FORM);
  const set = (k: keyof BfForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.id.trim())           { alert('허가증상 배출구번호를 입력하세요.'); return; }
    if (!form.facilityName.trim()) { alert('시설명을 입력하세요.'); return; }
    try {
      await addBagFilter(formToBf(form));
      onSaved();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '저장 실패');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[95vw] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900">백필터 추가</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* 폼 */}
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>허가증상 배출구번호 <span className="text-red-500">*</span></label>
              <input type="text" value={form.id} onChange={e => set('id', e.target.value)} className={INPUT_CLS} placeholder="예) 1" autoFocus />
            </div>
            <div>
              <label className={LABEL_CLS}>배출구 일련번호</label>
              <input type="number" value={form.outletSeq} onChange={e => set('outletSeq', e.target.value)} className={INPUT_CLS} placeholder="예) 9" />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>시설명 <span className="text-red-500">*</span></label>
            <input type="text" value={form.facilityName} onChange={e => set('facilityName', e.target.value)} className={INPUT_CLS} placeholder="예) BK300 소성시설" />
          </div>
          <div>
            <label className={LABEL_CLS}>방지시설 정보</label>
            <input type="text" value={form.preventionInfo} onChange={e => set('preventionInfo', e.target.value)} className={INPUT_CLS} placeholder="예) 여과집진시설" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>여과포 규격</label>
              <input type="text" value={form.filterSpec} onChange={e => set('filterSpec', e.target.value)} className={INPUT_CLS} placeholder="예) Φ156 × 3085L" />
            </div>
            <div>
              <label className={LABEL_CLS}>여과포 수량</label>
              <input type="text" value={form.filterQty} onChange={e => set('filterQty', e.target.value)} className={INPUT_CLS} placeholder="예) 28×24=672" />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>재질</label>
            <input type="text" value={form.material} onChange={e => set('material', e.target.value)} className={INPUT_CLS} placeholder="예) nomex" />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
        <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-gray-100">
          <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            추가 완료
          </button>
          <button onClick={onClose} className="px-5 py-3 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition">취소</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   수정 모달
═══════════════════════════════════════════ */
function EditModal({ item, onClose, onSaved }: { item: BagFilter; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<BfForm>({
    id:              item.id,
    outletSeq:       String(item.outletSeq),
    facilityName:    item.facilityName,
    preventionInfo:  item.preventionInfo,
    filterSpec:      item.filterSpec,
    filterQty:       item.filterQty,
    material:        item.material,
    prevReplaceDate: item.prevReplaceDate,
    lastReplaceDate: item.lastReplaceDate,
  });
  const set = (k: keyof BfForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.facilityName.trim()) { alert('시설명을 입력하세요.'); return; }
    await updateBagFilter(formToBf(form, item));
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[95vw] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900">백필터 정보 수정</h2>
            <span className="ml-1 text-xs text-gray-400 font-mono">#{item.id}</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>허가증상 배출구번호</label>
              <input type="text" value={form.id} disabled className={INPUT_CLS + ' bg-gray-50 text-gray-400 cursor-not-allowed'} />
            </div>
            <div>
              <label className={LABEL_CLS}>배출구 일련번호</label>
              <input type="number" value={form.outletSeq} onChange={e => set('outletSeq', e.target.value)} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>시설명 <span className="text-red-500">*</span></label>
            <input type="text" value={form.facilityName} onChange={e => set('facilityName', e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>방지시설 정보</label>
            <input type="text" value={form.preventionInfo} onChange={e => set('preventionInfo', e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>여과포 규격</label>
              <input type="text" value={form.filterSpec} onChange={e => set('filterSpec', e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>여과포 수량</label>
              <input type="text" value={form.filterQty} onChange={e => set('filterQty', e.target.value)} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>재질</label>
            <input type="text" value={form.material} onChange={e => set('material', e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
        <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-gray-100">
          <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            저장
          </button>
          <button onClick={onClose} className="px-5 py-3 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition">취소</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   삭제 확인 모달
═══════════════════════════════════════════ */
function DeleteModal({ item, onClose, onDeleted }: { item: BagFilter; onClose: () => void; onDeleted: () => void }) {
  const handleDelete = async () => {
    await deleteBagFilter(item.id);
    onDeleted();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-[95vw] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">백필터를 삭제할까요?</h2>
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-700">"{item.facilityName}"</span> 항목이 영구 삭제됩니다.
          </p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleDelete} className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            삭제
          </button>
          <button onClick={onClose} className="px-5 py-3 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition">취소</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   메인 ListView
═══════════════════════════════════════════ */
type SummaryKey = '전체' | '정상' | '교체임박' | '교체필요';

interface EnrichedBf extends BagFilter {
  no: number;
  replaceStatus: ReplaceStatus;
}

const SUMMARY_CARDS: {
  key: SummaryKey;
  label: string;
  gradient: string;
  icon: React.ReactNode;
}[] = [
  {
    key: '전체',
    label: '전체 백필터',
    gradient: 'bg-gradient-to-br from-slate-600 to-slate-800',
    icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h7" /></svg>,
  },
  {
    key: '정상',
    label: '정상',
    gradient: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
    icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: '교체임박',
    label: '교체임박',
    gradient: 'bg-gradient-to-br from-amber-400 to-amber-600',
    icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  },
  {
    key: '교체필요',
    label: '교체필요',
    gradient: 'bg-gradient-to-br from-red-500 to-red-700',
    icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
];

export default function BagFilterListView() {
  const [data, setData]           = useState<EnrichedBf[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<SummaryKey>('전체');
  const [showAdd, setShowAdd]     = useState(false);
  const [editItem, setEditItem]   = useState<BagFilter | null>(null);
  const [deleteItem, setDeleteItem] = useState<BagFilter | null>(null);

  const loadData = async () => {
    const raw = await getAllBagFilters();
    const enriched: EnrichedBf[] = raw.map((item, idx) => ({
      ...item,
      no: idx + 1,
      replaceStatus: calcReplaceStatus(item.lastReplaceDate),
    }));
    setData(enriched);
  };

  useEffect(() => { loadData(); }, []);

  const counts = useMemo(() => ({
    전체:    data.length,
    정상:    data.filter(d => d.replaceStatus === '정상').length,
    교체임박: data.filter(d => d.replaceStatus === '교체임박').length,
    교체필요: data.filter(d => d.replaceStatus === '교체필요').length,
  }), [data]);

  const filtered = useMemo(() => {
    let result = filterStatus === '전체'
      ? data
      : data.filter(d => d.replaceStatus === filterStatus);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(d =>
        d.id.toLowerCase().includes(q) ||
        d.facilityName.toLowerCase().includes(q) ||
        d.preventionInfo.toLowerCase().includes(q) ||
        d.material.toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, filterStatus, searchText]);

  return (
    <div className="p-6 space-y-4 bg-gray-50 min-h-full">

      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-4 gap-4">
        {SUMMARY_CARDS.map(({ key, label, gradient, icon }) => {
          const count = counts[key] ?? 0;
          const isActive = filterStatus === key;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(prev => prev === key ? '전체' : key)}
              className={[
                gradient,
                'relative rounded-xl p-5 text-left text-white transition-all shadow-md cursor-pointer',
                isActive ? 'ring-4 ring-white ring-offset-2 ring-offset-gray-200 scale-[1.02]' : 'hover:brightness-105 hover:shadow-lg',
              ].join(' ')}
            >
              <div className="absolute top-4 right-4 opacity-60">{icon}</div>
              <p className="text-sm font-medium text-white/80 mb-1">{label}</p>
              <p className="text-4xl font-black text-white leading-none">
                {count}<span className="text-lg font-semibold ml-1">개</span>
              </p>
              {isActive && (
                <div className="mt-2 flex items-center gap-1 text-white/80 text-xs">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                  </svg>
                  필터 적용 중
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 검색 + 추가 버튼 */}
      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="배출구번호, 시설명, 방지시설, 재질 검색..."
          className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400"
        />
        {searchText && (
          <button onClick={() => setSearchText('')} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="h-4 w-px bg-gray-200" />
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          백필터 추가
        </button>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium">백필터 데이터가 없습니다</p>
            <p className="text-xs mt-1">우측 상단 '백필터 추가' 버튼을 눌러 등록하세요</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap w-12">NO</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">허가증상<br/>배출구번호</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">배출구<br/>일련번호</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">시설명</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">방지시설 정보</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">여과포 규격</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">여과포 수량</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">재질</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">전전교체일</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">전교체일</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">상태</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap">도면</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 whitespace-nowrap w-20">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(item => {
                  const st = STATUS_STYLE[item.replaceStatus];
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.no}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-gray-900 text-base">{item.id}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.outletSeq || '-'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{item.facilityName || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.preventionInfo || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">{item.filterSpec || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.filterQty || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{item.material || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.prevReplaceDate || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-medium">{item.lastReplaceDate || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {item.replaceStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.floor ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-xs font-medium">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            배치됨
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">미배치</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditItem(item)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="수정"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="삭제"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 하단 집계 */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-2 text-xs text-gray-400">
          <span>총 <strong className="text-gray-600">{filtered.length}</strong>개 표시 중 (전체 {data.length}개)</span>
          {filterStatus !== '전체' && (
            <button onClick={() => setFilterStatus('전체')} className="text-blue-500 hover:text-blue-700 font-medium transition">
              필터 초기화
            </button>
          )}
        </div>
      )}

      {/* 모달 */}
      {showAdd    && <AddModal    onClose={() => setShowAdd(false)}  onSaved={() => { setShowAdd(false);   loadData(); }} />}
      {editItem   && <EditModal   item={editItem}  onClose={() => setEditItem(null)}   onSaved={() => { setEditItem(null);   loadData(); }} />}
      {deleteItem && <DeleteModal item={deleteItem} onClose={() => setDeleteItem(null)} onDeleted={() => { setDeleteItem(null); loadData(); }} />}
    </div>
  );
}
