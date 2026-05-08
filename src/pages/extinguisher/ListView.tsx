import { useState, useEffect, useMemo } from 'react';
import { getAllExtinguishers, resetStorage } from '../../services/extinguisherService';
import { calcStatus, calcReplaceMonth, STATUS_STYLE } from '../../utils/statusCalc';
import type { Extinguisher } from '../../types/extinguisher';
import type { ComputedStatus } from '../../utils/statusCalc';

/* ── 타입 ── */
type FilterStatus = '전체' | ComputedStatus;

interface EnrichedExtinguisher extends Extinguisher {
  computedStatus: ComputedStatus;
  replaceMonth: string;
  no: number;
}

/* ── 요약 카드 정의 (스크린샷 색상 정확히 반영) ── */
const SUMMARY_CARDS: {
  key: FilterStatus;
  label: string;
  gradient: string;
  icon: JSX.Element;
}[] = [
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
    key: '점검필요' as FilterStatus,
    label: '불량(준비중)',
    gradient: 'bg-purple-600',
    icon: (
      <svg className="w-7 h-7 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: '교체대상',
    label: '교체 대상',
    gradient: 'bg-red-600',
    icon: (
      <svg className="w-7 h-7 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
];

/* ── 상태 뱃지 스타일 ── */
const BADGE: Record<string, { bg: string; text: string; dot: string; icon: string }> = {
  양호:    { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: '●' },
  점검필요: { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: '●' },
  교체대상: { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500',     icon: '●' },
  불량:    { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500',  icon: '●' },
};

export default function ListView() {
  const [data, setData] = useState<EnrichedExtinguisher[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('전체');
  const [searchText, setSearchText] = useState('');

  /* 데이터 로드 */
  const loadData = async () => {
    const raw = await getAllExtinguishers();
    const enriched: EnrichedExtinguisher[] = raw.map((item, idx) => ({
      ...item,
      computedStatus: calcStatus(item.mfgDate, item.lastCheckDate),
      replaceMonth: calcReplaceMonth(item.mfgDate),
      no: idx + 1,
    }));
    setData(enriched);
  };

  useEffect(() => {
    loadData();

    /* 헤더 버튼 이벤트 연결 */
    const resetBtn = document.getElementById('header-reset-btn');
    const addBtn   = document.getElementById('header-add-btn');

    const handleReset = () => {
      if (window.confirm('모든 데이터를 초기값으로 되돌릴까요?')) {
        resetStorage();
        loadData();
        setFilterStatus('전체');
        setSearchText('');
      }
    };
    resetBtn?.addEventListener('click', handleReset);
    // addBtn은 다음 단계(모달)에서 연결
    void addBtn;

    return () => {
      resetBtn?.removeEventListener('click', handleReset);
    };
  }, []);

  /* 집계 */
  const counts = useMemo(() => ({
    전체:    data.length,
    양호:    data.filter(d => d.computedStatus === '양호').length,
    점검필요: data.filter(d => d.computedStatus === '점검필요').length,
    교체대상: data.filter(d => d.computedStatus === '교체대상').length,
  }), [data]);

  /* 필터 + 검색 */
  const filtered = useMemo(() => {
    let result =
      filterStatus === '전체'
        ? data
        : data.filter(d => d.computedStatus === filterStatus);
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

  /* 카드 클릭 */
  const handleCardClick = (key: FilterStatus) => {
    setFilterStatus(prev => prev === key ? '전체' : key);
  };

  return (
    <div className="p-6 space-y-4 bg-gray-50 min-h-full">

      {/* ── 요약 카드 5개 ── */}
      <div className="grid grid-cols-5 gap-4">
        {SUMMARY_CARDS.map(({ key, label, gradient, icon }) => {
          const count = counts[key as keyof typeof counts] ?? 0;
          const isActive = filterStatus === key;
          return (
            <button
              key={key}
              onClick={() => handleCardClick(key)}
              className={[
                gradient,
                'relative rounded-xl p-5 text-left text-white transition-all shadow-md',
                isActive ? 'ring-4 ring-white ring-offset-2 ring-offset-gray-200 scale-[1.02]' : 'hover:brightness-105 hover:shadow-lg',
              ].join(' ')}
            >
              {/* 아이콘 우측 상단 */}
              <div className="absolute top-4 right-4 opacity-60">{icon}</div>

              {/* 텍스트 */}
              <p className="text-sm font-medium text-white/80 mb-1">{label}</p>
              <p className="text-4xl font-black text-white leading-none">
                {count}
                <span className="text-lg font-semibold ml-1">개</span>
              </p>

              {/* 필터 중 표시 */}
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

      {/* ── 검색창 ── */}
      <div className="relative max-w-sm">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="위치, 종류, 담당자 검색..."
          className="w-full pl-10 pr-9 py-2.5 text-sm border border-gray-300 rounded-lg bg-white
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
        {searchText && (
          <button
            onClick={() => setSearchText('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── 데이터 테이블 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* 테이블 상단 항목 수 */}
        <div className="px-5 py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-800">{filtered.length}</span>개 항목
          </span>
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
                    <div className="text-4xl mb-2">🔍</div>
                    <p className="text-sm">검색 결과가 없습니다.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const badge = BADGE[item.computedStatus] ?? BADGE['양호'];
                  const isReplace = item.computedStatus === '교체대상';
                  const isCheckNeeded = item.computedStatus === '점검필요';

                  /* 위치 파싱 */
                  const locParts = item.location.split(' - ');
                  const locTop = locParts[0] ?? '';
                  const locBot = locParts[1] ?? item.location;

                  /* 교체년월 색상 */
                  const replaceColor = isReplace ? 'text-red-500 font-bold' : 'text-gray-500';

                  /* 최근점검일 색상 - 스크린샷처럼 주황색 */
                  const checkColor = isCheckNeeded || isReplace
                    ? 'text-amber-500 font-medium'
                    : 'text-gray-600';

                  return (
                    <tr
                      key={item.id}
                      className={[
                        'hover:bg-blue-50/30 transition-colors',
                        isReplace ? 'bg-red-50/50' : '',
                      ].join(' ')}
                    >
                      {/* NO. */}
                      <td className="px-4 py-3.5 text-center text-xs text-gray-400 font-medium">
                        {item.no}
                      </td>

                      {/* 고유번호 */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {item.id}
                        </span>
                      </td>

                      {/* 설치 위치 */}
                      <td className="px-4 py-3.5">
                        <div className="text-[11px] text-gray-400 mb-0.5 truncate max-w-[180px]">
                          {locTop}
                        </div>
                        <div className="text-sm font-semibold text-gray-800">
                          {locBot}
                        </div>
                      </td>

                      {/* 소화기 종류 */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="text-xs text-gray-700 leading-snug">
                          {item.type}
                        </div>
                      </td>

                      {/* 제조년월 */}
                      <td className="px-4 py-3.5 text-center text-xs text-gray-500 whitespace-nowrap">
                        {item.mfgDate}
                      </td>

                      {/* 교체년월 */}
                      <td className={`px-4 py-3.5 text-center text-xs whitespace-nowrap ${replaceColor}`}>
                        {item.replaceMonth}
                        {isReplace && (
                          <div className="text-[10px] text-red-400 mt-0.5">기한 초과</div>
                        )}
                      </td>

                      {/* 최근 점검일 */}
                      <td className={`px-4 py-3.5 text-center text-xs whitespace-nowrap ${checkColor}`}>
                        {item.lastCheckDate || '-'}
                      </td>

                      {/* 상태 뱃지 */}
                      <td className="px-4 py-3.5 text-center">
                        <span className={`
                          inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                          text-xs font-semibold whitespace-nowrap
                          ${badge.bg} ${badge.text}
                        `}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {item.computedStatus}
                        </span>
                      </td>

                      {/* 담당자 */}
                      <td className="px-4 py-3.5 text-center text-sm text-gray-700 whitespace-nowrap">
                        {item.manager || <span className="text-gray-300">-</span>}
                      </td>

                      {/* 비고 */}
                      <td className="px-4 py-3.5 text-xs text-gray-500 max-w-[120px]">
                        {item.note
                          ? <span className="text-amber-600">{item.note}</span>
                          : <span className="text-gray-300">-</span>
                        }
                      </td>

                      {/* 관리 */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* 점검 버튼 */}
                          <button className="
                            inline-flex items-center gap-1 px-2.5 py-1.5
                            text-xs font-semibold text-white bg-blue-600
                            rounded-md hover:bg-blue-700 transition whitespace-nowrap shadow-sm
                          ">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            점검
                          </button>

                          {/* 수정 */}
                          <button className="
                            p-1.5 text-gray-400 hover:text-blue-600
                            hover:bg-blue-50 rounded-md transition
                          " title="수정">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>

                          {/* 삭제 */}
                          <button className="
                            p-1.5 text-gray-400 hover:text-red-500
                            hover:bg-red-50 rounded-md transition
                          " title="삭제">
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
    </div>
  );
}
