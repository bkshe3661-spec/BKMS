/**
 * 소화기 상태 자동 계산 유틸
 *
 * 우선순위:
 *  1순위 교체대상 : 제조년월 + 10년 < 오늘
 *  2순위 점검필요 : 최근 점검일이 30일 초과 or 비어있음
 *  3순위 양호     : 최근 점검일이 30일 이내
 */

export type ComputedStatus = '교체대상' | '점검필요' | '양호';

export interface StatusStyle {
  label: ComputedStatus;
  bg: string;
  text: string;
  dot: string;
}

/** "YYYY-MM" → Date (해당 월 1일 기준) */
function parseMfgDate(mfgDate: string): Date | null {
  const match = mfgDate.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1);
}

/** "YYYY-MM-DD" → Date */
function parseCheckDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/** 제조년월 + 10년 = 교체년월 (표시용 "YYYY-MM") */
export function calcReplaceMonth(mfgDate: string): string {
  const d = parseMfgDate(mfgDate);
  if (!d) return '-';
  const replaceYear = d.getFullYear() + 10;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${replaceYear}-${mm}`;
}

/** 상태 자동 계산 */
export function calcStatus(mfgDate: string, lastCheckDate: string): ComputedStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1순위: 교체대상
  const mfg = parseMfgDate(mfgDate);
  if (mfg) {
    const replaceDate = new Date(mfg);
    replaceDate.setFullYear(replaceDate.getFullYear() + 10);
    if (replaceDate <= today) return '교체대상';
  }

  // 2순위: 점검필요
  const checked = parseCheckDate(lastCheckDate);
  if (!checked) return '점검필요';
  const diffDays = Math.floor((today.getTime() - checked.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 30) return '점검필요';

  // 3순위: 양호
  return '양호';
}

/** 상태별 Tailwind 스타일 */
export const STATUS_STYLE: Record<ComputedStatus, StatusStyle> = {
  양호:    { label: '양호',    bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  점검필요: { label: '점검필요', bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  교체대상: { label: '교체대상', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
};
