import { useState, useEffect, useMemo } from 'react';
import { getAllExtinguishers, resetStorage } from '../../services/extinguisherService';
import { calcStatus, calcReplaceMonth, STATUS_STYLE } from '../../utils/statusCalc';
import type { Extinguisher } from '../../types/extinguisher';
import type { ComputedStatus } from '../../utils/statusCalc';

/* ────────────────────────────────────────────────────────── */
/* 타입                                                         */
/* ────────────────────────────────────────────────────────── */
type FilterStatus = '전체' | ComputedStatus;

interface EnrichedExtinguisher extends Extinguisher {
  computedStatus: ComputedStatus;
  replaceMonth: string;
  no: number;
}

/* ────────────────────────────────────────────────────────── */
/* 요약 카드 정의                                               */
/* ────────────────────────────────────────────────────────── */
const SUMMARY_CARDS: {
  key: FilterStatus;
  label: string;
  cardBg: string;
  iconBg: string;
  iconColor: string;
  textColor: string;
  icon: string;
}[] = [
  { key: '전체',    label: '전체 소화기', cardBg: 'bg-blue-50',   iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   textColor: 'text-blue-700',   icon: '🧯' },
  { key: '양호',    label: '양호',       cardBg: 'bg-green-50',  iconBg: 'bg-green-100',  iconColor: 'text-green-600',  textColor: 'text-green-700',  icon: '✅' },
  { key: '점검필요', label: '점검 필요',  cardBg: 'bg-orange-50', iconBg: 'bg-orange-100', iconColor: 'text-orange-600', textColor: 'text-orange-700', icon: '⚠️' },
  { key: '교체대상', label: '교체 대상',  cardBg: 'bg-red-50',    iconBg: 'bg-red-100',    iconColor: 'text-red-600',    textColor: 'text-red-700',    icon: '🔴' },
];

/* ────────────────────────────────────────────────────────── */
/* 컴포넌트                                                     */
/* ────────────────────────────────────────────────────────── */
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

  useEffect(() => { loadData(); }, []);

  /* 요약 카드 집계 */
  const counts = useMemo(() => ({
    전체:    data.length,
    양호:    data.filter(d => d.computedStatus === '양호').length,
    점검필요: data.filter(d => d.computedStatus === '점검필요').length,
    교체대상: data.filter(d => d.computedStatus === '교체대상').length,
  }), [data]);

  /* 필터 + 검색 */
  const filtered = useMemo(() => {
    let result = filterStatus === '전체' ? data : data.filter(d => d.computedStatus === filterStatus);
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

  /* 초기화 핸들러 */
  const handleReset = () => {
    if (window.confirm('모든 데이터를 초기값으로 되돌릴까요?')) {
      resetStorage();
      loadData();
      setFilterStatus('전체');
      setSearchText('');
    }
  };

  return (
    <div className="p-6 space-y-5">

      {/* ── 상단 액션 버튼 ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">소화기 목록표</h2>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            <span className="text-base">↺</span> 초기화
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            <span className="text-base font-bold">+</span> 소화기 추가
          </button>
        </div>
      </div>

      {/* ── 요약 카드 ── */}
      <div className="grid grid-cols-4 gap-4">
        {SUMMARY_CARDS.map(({ key, label, cardBg, iconBg, iconColor, textColor, icon }) => {
          const count = counts[key as keyof typeof counts] ?? 0;
          const isActive = filterStatus === key;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(isActive ? '전체' : key)}
              className={[
                'flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all shadow-sm',
                cardBg,
                isActive ? 'border-current ring-2 ring-offset-1' : 'border-transparent hover:border-gray-200',
                textColor,
              ].join(' ')}
            >
              <div className={`${iconBg} ${iconColor} w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0`}>
                {icon}
              </div>
              <div>
                <p className="text-xs font-medium opacity-70">{label}</p>
                <p className={`text-3xl font-extrabold ${textColor}`}>{count}</p>
                <p className="text-xs opacity-60 mt-0.5">개</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── 검색창 ── */}
      <div className="relative">
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
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
        {searchText && (
          <button
            onClick={() => setSearchText('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >✕</button>
        )}
      </div>

      {/* ── 데이터 테이블 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* 테이블 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">
            {filtered.length}
            <span className="font-normal text-gray-400"> 개 항목</span>
          </span>
          {filterStatus !== '전체' && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLE[filterStatus as ComputedStatus]?.bg} ${STATUS_STYLE[filterStatus as ComputedStatus]?.text}`}>
              {filterStatus} 필터 적용 중
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <th className="px-4 py-3 text-center w-10">NO.</th>
                <th className="px-4 py-3 text-left">고유 번호</th>
                <th className="px-4 py-3 text-left min-w-[220px]">설치 위치</th>
                <th className="px-4 py-3 text-left">소화기 종류</th>
                <th className="px-4 py-3 text-center">제조년월</th>
                <th className="px-4 py-3 text-center">교체년월</th>
                <th className="px-4 py-3 text-center">최근 점검일</th>
                <th className="px-4 py-3 text-center">상태</th>
                <th className="px-4 py-3 text-center">담당자</th>
                <th className="px-4 py-3 text-left min-w-[120px]">비고</th>
                <th className="px-4 py-3 text-center min-w-[130px]">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-gray-400">
                    <div className="text-4xl mb-2">🔍</div>
                    <p className="text-sm">검색 결과가 없습니다.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const style = STATUS_STYLE[item.computedStatus];
                  const isReplace = item.computedStatus === '교체대상';
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50 transition-colors ${isReplace ? 'bg-red-50/40' : ''}`}
                    >
                      {/* NO. */}
                      <td className="px-4 py-3 text-center text-gray-400 text-xs">{item.no}</td>

                      {/* 고유번호 */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{item.id}</td>

                      {/* 설치 위치 */}
                      <td className="px-4 py-3 text-gray-800">
                        <div className="text-xs text-gray-400 mb-0.5">{item.location.split(' - ')[0]}</div>
                        <div className="font-medium text-gray-700">{item.location.split(' - ')[1] ?? item.location}</div>
                      </td>

                      {/* 소화기 종류 */}
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                          {item.type}
                        </span>
                      </td>

                      {/* 제조년월 */}
                      <td className="px-4 py-3 text-center text-gray-600 text-xs whitespace-nowrap">{item.mfgDate}</td>

                      {/* 교체년월 (자동계산) */}
                      <td className={`px-4 py-3 text-center text-xs font-semibold whitespace-nowrap ${isReplace ? 'text-red-600' : 'text-gray-500'}`}>
                        {item.replaceMonth}
                        {isReplace && <span className="block text-red-500 text-[10px]">기한 초과</span>}
                      </td>

                      {/* 최근 점검일 */}
                      <td className="px-4 py-3 text-center text-gray-600 text-xs whitespace-nowrap">{item.lastCheckDate || '-'}</td>

                      {/* 상태 뱃지 */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {item.computedStatus}
                        </span>
                      </td>

                      {/* 담당자 */}
                      <td className="px-4 py-3 text-center text-gray-700 text-sm whitespace-nowrap">{item.manager}</td>

                      {/* 비고 */}
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {item.note || <span className="text-gray-300">-</span>}
                      </td>

                      {/* 관리 버튼 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* 점검 버튼 */}
                          <button className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition whitespace-nowrap">
                            점검
                          </button>
                          {/* 수정 버튼 */}
                          <button
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                            title="수정"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536M9 11l6.536-6.536a2 2 0 0 1 2.828 0l.172.172a2 2 0 0 1 0 2.828L12 14H9v-3z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18" />
                            </svg>
                          </button>
                          {/* 삭제 버튼 */}
                          <button
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition"
                            title="삭제"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
