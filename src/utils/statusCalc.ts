/**
 * 소화기 상태 자동 계산 유틸 (v2)
 *
 * ─── 우선순위 규칙 ────────────────────────────────────────────────────────
 *  1순위 (교체대상) : replaceDate(교체 년월)가 오늘을 지났으면 → '교체대상'
 *                    replaceDate 미입력 시 mfgDate + 10년으로 자동 계산
 *  2순위 (불량)     : 점검 체크리스트 비정상 항목 존재(hasAbnormal=true)
 *                    또는 status === '불량' | '폐기'(legacy) 수동 지정
 *  3순위 (점검필요) : 최근 점검일이 오늘 기준 30일 이상 지났거나 미입력
 *  4순위 (양호)     : 위 3가지에 해당하지 않는 경우
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ExtinguisherStatus } from '../types/extinguisher';

export type ComputedStatus = '불량' | '교체대상' | '점검필요' | '양호';

export interface StatusStyle {
  label: ComputedStatus;
  bg: string;
  text: string;
  dot: string;
}

/* ─── 파서 헬퍼 ──────────────────────────────────────────────────────────── */

/** "YYYY-MM" → Date (해당 월 1일, 00:00:00) */
function parseMfgDate(s: string): Date | null {
  const m = s?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" → Date (00:00:00) */
function parseDate(s: string): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s.trim());
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ─── 교체 년월 계산 ──────────────────────────────────────────────────────── */

/**
 * 교체 기준 Date 반환
 *  - replaceDate("YYYY-MM") 입력 시: 해당 월 1일
 *  - 미입력 시: mfgDate + 10년
 */
function getReplaceDate(mfgDate: string, replaceDate?: string): Date | null {
  if (replaceDate?.trim()) {
    return parseMfgDate(replaceDate.trim());
  }
  const mfg = parseMfgDate(mfgDate);
  if (!mfg) return null;
  const r = new Date(mfg);
  r.setFullYear(r.getFullYear() + 10);
  return r;
}

/* ─── 표시용 교체 년월 문자열 ─────────────────────────────────────────────── */

/**
 * 교체 년월 표시 문자열 ("YYYY-MM")
 *  - replaceDate 입력 시 그 값 사용
 *  - 미입력 시 mfgDate + 10년 자동 계산
 */
export function calcReplaceMonth(mfgDate: string, replaceDate?: string): string {
  if (replaceDate?.trim()) return replaceDate.trim();
  const mfg = parseMfgDate(mfgDate);
  if (!mfg) return '-';
  const yr = mfg.getFullYear() + 10;
  const mm = String(mfg.getMonth() + 1).padStart(2, '0');
  return `${yr}-${mm}`;
}

/* ─── 핵심: 상태 자동 계산 ───────────────────────────────────────────────── */

/**
 * 소화기 상태 자동 계산
 *
 * @param mfgDate       제조년월 "YYYY-MM"
 * @param lastCheckDate 최근 점검일 "YYYY-MM-DD"
 * @param status        저장된 raw 상태 (optional)
 * @param hasAbnormal   체크리스트 비정상 항목 존재 (optional, default false)
 * @param replaceDate   사용자 지정 교체 년월 "YYYY-MM" (optional)
 */
export function calcStatus(
  mfgDate: string,
  lastCheckDate: string,
  status?: ExtinguisherStatus,
  hasAbnormal?: boolean,
  replaceDate?: string,
): ComputedStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 1순위: 교체대상 ────────────────────────────────────────────────────
  // replaceDate(또는 mfgDate+10년)이 오늘 이전이면 무조건 교체대상
  const replaceDt = getReplaceDate(mfgDate, replaceDate);
  if (replaceDt && replaceDt <= today) return '교체대상';

  // ── 2순위: 불량 ────────────────────────────────────────────────────────
  // 체크리스트 비정상 또는 수동 '불량'/'폐기' 지정
  if (
    hasAbnormal === true ||
    status === '불량' ||
    status === '폐기'          // legacy 호환
  ) return '불량';

  // ── 3순위: 점검필요 ────────────────────────────────────────────────────
  // 최근 점검일 미입력 또는 30일 초과
  const checkedDt = parseDate(lastCheckDate);
  if (!checkedDt) return '점검필요';
  const diffDays = Math.floor(
    (today.getTime() - checkedDt.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays >= 30) return '점검필요';

  // ── 4순위: 양호 ────────────────────────────────────────────────────────
  return '양호';
}

/* ─── 상태별 Tailwind 스타일 ─────────────────────────────────────────────── */

export const STATUS_STYLE: Record<ComputedStatus, StatusStyle> = {
  교체대상: { label: '교체대상', bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  불량:     { label: '불량',     bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  점검필요:  { label: '점검필요', bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  양호:     { label: '양호',     bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
};

/* ─── 오늘 날짜 기준 점검 경과일 반환 (UI 표시용) ──────────────────────────── */

/** 최근 점검일로부터 경과한 일수 (미입력 시 null) */
export function daysSinceLastCheck(lastCheckDate: string): number | null {
  const d = parseDate(lastCheckDate);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}
