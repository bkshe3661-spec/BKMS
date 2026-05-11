import { useState, useEffect, useMemo, useRef } from 'react';
import { getAllExtinguishers, updateExtinguisher, deleteExtinguisher } from '../../services/extinguisherService';
import { addNewExtinguisher, getNextExtinguisherId } from '../../services/floorPlanService';
import { calcStatus, calcReplaceMonth } from '../../utils/statusCalc';
import type { Extinguisher, ExtinguisherStatus } from '../../types/extinguisher';
import type { ComputedStatus } from '../../utils/statusCalc';

/* ─────────────────────────────────────────
   공통 상수
───────────────────────────────────────── */
const FE_TYPES = [
  'ABC 분말 3.3kg',
  'ABC 분말 4.5kg',
  '하론 3kg',
  'K급(4L) 7.5kg',
  '자동확산 3kg',
] as const;

/** 점검 체크리스트 항목 */
const CHECK_ITEMS = [
  '안전핀 및 봉인 상태 확인',
  '압력계(게이지) 정상 범위 확인',
  '호스 및 노즐 파손 여부 확인',
  '본체 부식, 변형, 누출 여부 확인',
  '소화기 표지 및 전면 적치 금지 상태 확인',
] as const;

/**
 * 제조년월 입력 자동 포맷
 *  - "202405"  → "2024-05"
 *  - "2024-05" → "2024-05"
 *  - 그 외      → 그대로 반환
 */
function formatMfgDate(raw: string): string {
  const digits = raw.replace(/-/g, '').trim();
  if (digits.length === 6 && /^\d{6}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
  }
  return raw;
}

/** 오늘 날짜 "YYYY-MM-DD" */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─────────────────────────────────────────
   타입
───────────────────────────────────────── */
type FilterStatus = '전체' | ComputedStatus;
type SummaryKey   = '전체' | '양호' | '점검필요' | '교체대상' | '불량';

interface EnrichedExtinguisher extends Extinguisher {
  computedStatus: ComputedStatus;
  replaceMonth: string;
  no: number;
}

/* ─────────────────────────────────────────
   요약 카드 정의
───────────────────────────────────────── */
interface SummaryCard {
  key: SummaryKey;
  label: string;
  gradient: string;
  icon: JSX.Element;
}

const SUMMARY_CARDS: SummaryCard[] = [
  {
    key: '전체',
    label: '전체 소화기',
    gradient: 'bg-blue-600',
    icon: (
      <svg className="w-7 h-7 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 10h18M3 14h18M10 3v18M14 3v18" />
      </svg>
    ),
  },
  {
    key: '양호',
    label: '양호',
    gradient: 'bg-emerald-600',
    icon: (
      <svg className="w-7 h-7 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: '점검필요',
    label: '점검 필요',
    gradient: 'bg-amber-500',
    icon: (
      <svg className="w-7 h-7 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: '불량',
    label: '불량',
    gradient: 'bg-red-600',
    icon: (
      <svg className="w-7 h-7 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: '교체대상',
    label: '교체 대상',
    gradient: 'bg-purple-600',
    icon: (
      <svg className="w-7 h-7 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
];

/* ─────────────────────────────────────────
   상태 뱃지 스타일
───────────────────────────────────────── */
const BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  양호:    { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  점검필요: { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  교체대상: { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500'  },
  불량:    { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
};

/* ─────────────────────────────────────────
   상태 옵션
───────────────────────────────────────── */
const STATUS_OPTIONS: { value: ExtinguisherStatus; label: string }[] = [
  { value: '정상',    label: '정상' },
  { value: '점검필요', label: '점검필요' },
  { value: '교체대상', label: '교체대상' },
  { value: '폐기',    label: '폐기 (불량)' },
];

/* ═══════════════════════════════════════════
   소화기 추가 모달
═══════════════════════════════════════════ */
interface AddForm {
  location: string;
  type: string;
  mfgDate: string;
  lastCheckDate: string;
  manager: string;
  status: ExtinguisherStatus;
  note: string;
}

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AddForm>({
    location:      '',
    type:          FE_TYPES[0],
    mfgDate:       '',
    lastCheckDate: '',
    manager:       '',
    status:        '정상',
    note:          '',
  });

  const set = (k: keyof AddForm, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    const finalMfgDate = formatMfgDate(form.mfgDate.trim());
    if (!form.location.trim()) { alert('설치 위치를 입력하세요.'); return; }
    if (!finalMfgDate.trim())  { alert('제조년월을 입력하세요.'); return; }

    const newFe: Extinguisher = {
      id:            getNextExtinguisherId(),
      location:      form.location.trim(),
      type:          form.type,
      mfgDate:       finalMfgDate,
      lastCheckDate: form.lastCheckDate,
      manager:       form.manager.trim(),
      status:        form.status,
      note:          form.note.trim(),
    };
    addNewExtinguisher(newFe);
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900">소화기 추가</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 폼 */}
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              설치 위치 <span className="text-red-500">*</span>
            </label>
            <input
              type="text" value={form.location} onChange={e => set('location', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="예) 관리동 1층(현관)" autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              소화기 종류 <span className="text-red-500">*</span>
            </label>
            <select
              value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              {FE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              제조년월 <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(202405 또는 2024-05)</span>
            </label>
            <input
              type="text" value={form.mfgDate}
              onChange={e => set('mfgDate', e.target.value)}
              onBlur={e => set('mfgDate', formatMfgDate(e.target.value))}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="예) 202408 또는 2024-08" maxLength={7}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">담당자</label>
            <input
              type="text" value={form.manager} onChange={e => set('manager', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="담당자 이름"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">최근 점검일</label>
            <input
              type="date" value={form.lastCheckDate} onChange={e => set('lastCheckDate', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">상태</label>
            <select
              value={form.status} onChange={e => set('status', e.target.value as ExtinguisherStatus)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">비고</label>
            <textarea
              value={form.note} onChange={e => set('note', e.target.value)} rows={2}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="특이사항 입력"
            />
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-gray-100">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            추가 완료
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   점검 모달 (상세 체크리스트 + 사진 업로드)
═══════════════════════════════════════════ */
function InspectModal({
  item, onClose, onDone,
}: {
  item: EnrichedExtinguisher;
  onClose: () => void;
  onDone: (updated: Extinguisher) => void;
}) {
  // null = 미선택, true = 정상, false = 비정상
  const [checks, setChecks] = useState<(boolean | null)[]>(
    CHECK_ITEMS.map(() => null)
  );
  const [photos, setPhotos]     = useState<string[]>([]);
  const fileInputRef            = useRef<HTMLInputElement>(null);

  const toggle = (idx: number, val: boolean) =>
    setChecks(prev => prev.map((v, i) => (i === idx ? val : v)));

  const allSelected  = checks.every(v => v !== null);
  const hasAbnormal  = checks.some(v => v === false);
  // 최종 상태: 비정상 항목 있으면 '불량', 전부 정상이면 '정상'
  const finalStatus: ExtinguisherStatus = hasAbnormal ? '폐기' : '정상';

  /* 사진 파일 처리 — base64로 변환 */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (photos.length + files.length > 5) {
      alert('사진은 최대 5장까지 첨부할 수 있습니다.');
      return;
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result as string;
        setPhotos(prev => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
    // input 초기화 (같은 파일 재선택 가능)
    e.target.value = '';
  };

  const removePhoto = (idx: number) =>
    setPhotos(prev => prev.filter((_, i) => i !== idx));

  const handleDone = async () => {
    if (!allSelected) { alert('모든 항목을 선택해 주세요.'); return; }
    const updated: Extinguisher = {
      ...item,
      lastCheckDate: todayStr(),
      status:        finalStatus,
      checkResults:  [...checks],
      checkPhotos:   photos.length > 0 ? photos : item.checkPhotos,
    };
    await updateExtinguisher(updated);
    onDone(updated);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[500px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">소화기 점검</h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-8">
              항목별로 정상 여부를 선택하면 점검 결과가 자동으로 갱신됩니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── 스크롤 영역 ── */}
        <div className="overflow-y-auto flex-1">

          {/* 소화기 정보 카드 */}
          <div className="px-6 pt-4 pb-3">
            <div className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
              <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C10.34 2 9 3.34 9 5v1H7c-1.1 0-2 .9-2 2v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-2V5c0-1.66-1.34-3-3-3zm0 2c.55 0 1 .45 1 1v1h-2V5c0-.55.45-1 1-1zm0 7c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 6c-1.67 0-3-.9-3-2h6c0 1.1-1.33 2-3 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{item.location}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.type}
                  {item.mfgDate && ` · 제조 ${item.mfgDate.replace('-', '.')}`}
                  {` · ${item.id}`}
                </p>
              </div>
            </div>
          </div>

          {/* ── 체크리스트 ── */}
          <div className="px-6">
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {CHECK_ITEMS.map((label, idx) => {
                const isNormal   = checks[idx] === true;
                const isAbnormal = checks[idx] === false;
                return (
                  <div
                    key={idx}
                    className={[
                      'flex items-center justify-between px-4 py-3.5 transition-colors',
                      isAbnormal ? 'bg-red-50 border-l-4 border-l-red-400' : 'bg-white',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span
                        className={[
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          isAbnormal
                            ? 'bg-red-500 text-white'
                            : isNormal
                            ? 'bg-emerald-500 text-white'
                            : 'bg-gray-100 text-gray-500',
                        ].join(' ')}
                      >
                        {idx + 1}
                      </span>
                      <span className={[
                        'text-sm leading-snug',
                        isAbnormal ? 'text-red-700 font-medium' : 'text-gray-700',
                      ].join(' ')}>
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {/* 정상 버튼 */}
                      <button
                        onClick={() => toggle(idx, true)}
                        className={[
                          'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                          isNormal
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                        ].join(' ')}
                      >
                        {isNormal && (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        정상
                      </button>
                      {/* 비정상 버튼 */}
                      <button
                        onClick={() => toggle(idx, false)}
                        className={[
                          'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                          isAbnormal
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                        ].join(' ')}
                      >
                        {isAbnormal && (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        비정상
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 결과 알림 배너 ── */}
          {allSelected && (
            <div className={[
              'mx-6 mt-3 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm font-medium',
              hasAbnormal
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            ].join(' ')}>
              {hasAbnormal ? (
                <>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  비정상 항목이 있습니다. 점검 완료 시 <strong>불량</strong>으로 기록됩니다.
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  모든 항목 정상 — 점검 완료 시 <strong>양호</strong>로 갱신됩니다.
                </>
              )}
            </div>
          )}

          {/* ── 사진 업로드 ── */}
          <div className="px-6 mt-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              점검 사진 첨부
              <span className="font-normal text-gray-400 ml-1">(최대 5장, JPG·PNG)</span>
            </p>

            {/* 썸네일 그리드 */}
            {photos.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                    <img src={src} alt={`점검사진 ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 파일 선택 영역 */}
            {photos.length < 5 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 flex flex-col items-center gap-1.5
                           text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium">
                  클릭하여 사진 추가
                </span>
                <span className="text-[11px]">
                  {photos.length}/5장
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>{/* /스크롤 영역 끝 */}

        {/* ── 하단 버튼 ── */}
        <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleDone}
            disabled={!allSelected}
            className={[
              'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all',
              allSelected
                ? hasAbnormal
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed',
            ].join(' ')}
          >
            {allSelected && hasAbnormal ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            점검 완료
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3.5 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   수정 모달
═══════════════════════════════════════════ */
interface EditForm {
  location: string;
  type: string;
  mfgDate: string;
  manager: string;
  lastCheckDate: string;
  status: ExtinguisherStatus;
  note: string;
}

function EditModal({
  item, onClose, onSave,
}: {
  item: EnrichedExtinguisher;
  onClose: () => void;
  onSave: (updated: Extinguisher) => void;
}) {
  const [form, setForm] = useState<EditForm>({
    location:      item.location,
    type:          item.type,
    mfgDate:       item.mfgDate,
    manager:       item.manager,
    lastCheckDate: item.lastCheckDate,
    status:        item.status,
    note:          item.note,
  });

  const set = (k: keyof EditForm, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const finalMfgDate = formatMfgDate(form.mfgDate.trim());
    if (!form.location.trim()) { alert('설치 위치를 입력하세요.'); return; }
    if (!form.type.trim())     { alert('소화기 종류를 선택하세요.'); return; }
    if (!finalMfgDate.trim())  { alert('제조년월을 입력하세요.'); return; }

    const updated: Extinguisher = {
      ...item,
      location:      form.location.trim(),
      type:          form.type.trim(),
      mfgDate:       finalMfgDate,
      manager:       form.manager.trim(),
      lastCheckDate: form.lastCheckDate,
      status:        form.status,
      note:          form.note.trim(),
    };
    await updateExtinguisher(updated);
    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900">소화기 정보 수정</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 폼 */}
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              설치 위치 <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.location} onChange={e => set('location', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="예) 관리동 1층(현관)" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              소화기 종류 <span className="text-red-500">*</span>
            </label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
              {FE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              {!FE_TYPES.includes(form.type as typeof FE_TYPES[number]) && form.type && (
                <option value={form.type}>{form.type}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              제조년월 <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(202405 또는 2024-05)</span>
            </label>
            <input type="text" value={form.mfgDate}
              onChange={e => set('mfgDate', e.target.value)}
              onBlur={e => set('mfgDate', formatMfgDate(e.target.value))}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="예) 202408 또는 2024-08" maxLength={7} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">담당자</label>
            <input type="text" value={form.manager} onChange={e => set('manager', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="담당자 이름" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">최근 점검일</label>
            <input type="date" value={form.lastCheckDate} onChange={e => set('lastCheckDate', e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">상태</label>
            <select value={form.status} onChange={e => set('status', e.target.value as ExtinguisherStatus)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">비고</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="특이사항 입력" />
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-gray-100">
          <button onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            저장
          </button>
          <button onClick={onClose}
            className="px-5 py-3 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition">
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   삭제 확인 모달
═══════════════════════════════════════════ */
function DeleteModal({
  item, onClose, onDelete,
}: {
  item: EnrichedExtinguisher;
  onClose: () => void;
  onDelete: () => void;
}) {
  const handleDelete = async () => {
    await deleteExtinguisher(item.id);
    onDelete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-[95vw] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">소화기를 삭제할까요?</h2>
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-700">"{item.location}"</span> 항목이 영구 삭제됩니다.
          </p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleDelete}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            삭제
          </button>
          <button onClick={onClose}
            className="px-5 py-3 text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition">
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   메인 ListView 컴포넌트
═══════════════════════════════════════════ */
export default function ListView() {
  const [data, setData]                 = useState<EnrichedExtinguisher[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('전체');
  const [searchText, setSearchText]     = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [inspectTarget, setInspectTarget] = useState<EnrichedExtinguisher | null>(null);
  const [editTarget,    setEditTarget]    = useState<EnrichedExtinguisher | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<EnrichedExtinguisher | null>(null);

  /* 데이터 로드 */
  const loadData = async () => {
    const raw = await getAllExtinguishers();
    const enriched: EnrichedExtinguisher[] = raw.map((item, idx) => {
      // 점검 체크리스트 비정상 항목 여부 반영
      const hasAbnormal = Array.isArray(item.checkResults)
        ? item.checkResults.some(v => v === false)
        : false;
      return {
        ...item,
        computedStatus: calcStatus(item.mfgDate, item.lastCheckDate, item.status, hasAbnormal),
        replaceMonth:   calcReplaceMonth(item.mfgDate),
        no:             idx + 1,
      };
    });
    setData(enriched);
  };

  useEffect(() => { loadData(); }, []);

  /* 집계 */
  const counts = useMemo(() => ({
    전체:    data.length,
    양호:    data.filter(d => d.computedStatus === '양호').length,
    점검필요: data.filter(d => d.computedStatus === '점검필요').length,
    불량:    data.filter(d => d.computedStatus === '불량').length,
    교체대상: data.filter(d => d.computedStatus === '교체대상').length,
  }), [data]);

  /* 필터 클릭 — 같은 카드 재클릭 시 전체 복귀 */
  const handleFilterClick = (key: SummaryKey) => {
    setFilterStatus(prev => (prev === key ? '전체' : key));
  };

  /* 필터 + 검색 */
  const filtered = useMemo(() => {
    let result =
      filterStatus === '전체'
        ? data
        : data.filter(d => d.computedStatus === (filterStatus as ComputedStatus));
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(d =>
        d.location.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        d.manager.toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, filterStatus, searchText]);

  const handleInspectDone = (_: Extinguisher) => { setInspectTarget(null); loadData(); };
  const handleEditSave    = (_: Extinguisher) => { setEditTarget(null);    loadData(); };
  const handleDeleteDone  = ()               => { setDeleteTarget(null);  loadData(); };
  const handleAddSaved    = ()               => { setShowAddModal(false); loadData(); };

  return (
    <div className="p-6 space-y-4 bg-gray-50 min-h-full">

      {/* 요약 카드 5개 */}
      <div className="grid grid-cols-5 gap-4">
        {SUMMARY_CARDS.map(({ key, label, gradient, icon }) => {
          const count    = counts[key] ?? 0;
          const isActive = filterStatus === key;
          return (
            <button
              key={key}
              onClick={() => handleFilterClick(key)}
              className={[
                gradient,
                'relative rounded-xl p-5 text-left text-white transition-all shadow-md cursor-pointer',
                isActive
                  ? 'ring-4 ring-white ring-offset-2 ring-offset-gray-200 scale-[1.02]'
                  : 'hover:brightness-105 hover:shadow-lg',
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
                    <path fillRule="evenodd"
                      d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                      clipRule="evenodd" />
                  </svg>
                  필터 적용 중
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 검색창 + 추가 버튼 */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="위치, 종류, 담당자 검색..."
            className="w-full pl-10 pr-9 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
          />
          {searchText && (
            <button onClick={() => setSearchText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700
                     text-white text-sm font-semibold rounded-lg transition shadow-sm whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          + 소화기 추가
        </button>
      </div>

      {/* 데이터 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-800">{filtered.length}</span>개 항목
          </span>
          {filterStatus !== '전체' && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full font-medium border border-blue-100">
              필터: {filterStatus}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[
                  { label: 'NO.',        cls: 'w-12 text-center' },
                  { label: '고유 번호',   cls: 'text-left' },
                  { label: '설치 위치',   cls: 'text-left min-w-[200px]' },
                  { label: '소화기 종류', cls: 'text-left' },
                  { label: '제조년월',   cls: 'text-center' },
                  { label: '교체 년월',  cls: 'text-center' },
                  { label: '최근 점검일', cls: 'text-center' },
                  { label: '상태',       cls: 'text-center' },
                  { label: '담당자',     cls: 'text-center' },
                  { label: '비고',       cls: 'text-left min-w-[100px]' },
                  { label: '관리',       cls: 'text-center min-w-[130px]' },
                ].map(({ label, cls }) => (
                  <th key={label}
                    className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${cls}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-20 text-center text-gray-400">
                    <div className="text-4xl mb-3">🧯</div>
                    <p className="text-sm font-medium text-gray-500 mb-1">
                      {data.length === 0 ? '등록된 소화기가 없습니다.' : '검색 결과가 없습니다.'}
                    </p>
                    {data.length === 0 && (
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="mt-3 inline-flex items-center gap-1.5 px-4 py-2
                                   bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold
                                   rounded-lg transition shadow-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        소화기 추가하기
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map(item => {
                  const badge         = BADGE[item.computedStatus] ?? BADGE['양호'];
                  const isReplace     = item.computedStatus === '교체대상';
                  const isBad         = item.computedStatus === '불량';
                  const isCheckNeeded = item.computedStatus === '점검필요';
                  const locParts      = item.location.split(' - ');
                  const locTop        = locParts[0] ?? '';
                  const locBot        = locParts[1] ?? item.location;
                  const replaceColor  = isReplace ? 'text-red-500 font-bold' : 'text-gray-500';
                  const checkColor    = isCheckNeeded || isReplace ? 'text-amber-500 font-medium' : 'text-gray-600';

                  return (
                    <tr key={item.id}
                      className={[
                        'hover:bg-blue-50/30 transition-colors',
                        isBad     ? 'bg-red-50/40'    : '',
                        isReplace ? 'bg-purple-50/40' : '',
                      ].join(' ')}>
                      <td className="px-4 py-3.5 text-center text-xs text-gray-400 font-medium">{item.no}</td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{item.id}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[11px] text-gray-400 mb-0.5 truncate max-w-[180px]">{locTop}</div>
                        <div className="text-sm font-semibold text-gray-800">{locBot}</div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="text-xs text-gray-700 leading-snug">{item.type}</div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs text-gray-500 whitespace-nowrap">{item.mfgDate}</td>
                      <td className={`px-4 py-3.5 text-center text-xs whitespace-nowrap ${replaceColor}`}>
                        {item.replaceMonth}
                        {isReplace && <div className="text-[10px] text-red-400 mt-0.5">기한 초과</div>}
                      </td>
                      <td className={`px-4 py-3.5 text-center text-xs whitespace-nowrap ${checkColor}`}>
                        {item.lastCheckDate || '-'}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                                          text-xs font-semibold whitespace-nowrap ${badge.bg} ${badge.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {item.computedStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-sm text-gray-700 whitespace-nowrap">
                        {item.manager || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 max-w-[120px]">
                        {item.note
                          ? <span className="text-amber-600">{item.note}</span>
                          : <span className="text-gray-300">-</span>
                        }
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => setInspectTarget(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition whitespace-nowrap shadow-sm">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            점검
                          </button>
                          <button onClick={() => setEditTarget(item)}
                            className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-md transition" title="수정">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => setDeleteTarget(item)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition" title="삭제">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 모달 렌더링 */}
      {showAddModal   && <AddModal     onClose={() => setShowAddModal(false)}   onSaved={handleAddSaved}    />}
      {inspectTarget  && <InspectModal item={inspectTarget} onClose={() => setInspectTarget(null)} onDone={handleInspectDone} />}
      {editTarget     && <EditModal    item={editTarget}    onClose={() => setEditTarget(null)}    onSave={handleEditSave}    />}
      {deleteTarget   && <DeleteModal  item={deleteTarget}  onClose={() => setDeleteTarget(null)}  onDelete={handleDeleteDone} />}
    </div>
  );
}
