/**
 * ExtinguisherService
 *
 * ✅ 현재: localStorage 기반 영구 저장
 * 🔄 추후: 각 함수의 주석 처리된 API 호출 코드로 교체하면 백엔드 연동 완료
 *
 * 백엔드 개발자 안내:
 *   - BASE_URL 상수를 실제 API 서버 주소로 변경
 *   - 각 함수 내부의 localStorage 로직을 제거하고 fetch/axios 호출로 교체
 *   - 반환 타입(Extinguisher, Extinguisher[])은 동일하게 유지
 *
 * ─── 데이터 보존 규칙 ────────────────────────────────────────────────────────
 * - 앱 최초 실행 시 localStorage에 키가 없으면 → 빈 배열 [] 로 초기화
 * - 키가 이미 존재하면(빈 배열 포함) → 절대 덮어쓰지 않음
 * - 더미/샘플 데이터 자동 삽입 코드 절대 금지
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Extinguisher } from '../types/extinguisher';

const STORAGE_KEY = 'bkms_extinguishers';
// const BASE_URL = 'http://your-api-server.com/api/v1'; // 🔄 백엔드 연동 시 활성화

/**
 * localStorage 초기화
 * - 키 자체가 없을 때만 빈 배열 [] 로 세팅
 * - 키가 있으면 (빈 배열 [] 이어도) 절대 건드리지 않음
 * - 샘플/더미 데이터 삽입 없음
 */
export function initStorage(): void {
  if (localStorage.getItem(STORAGE_KEY) === null) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  }
}

/** 전체 소화기 목록 조회 */
export async function getAllExtinguishers(): Promise<Extinguisher[]> {
  // 🔄 백엔드 연동 시:
  // const res = await fetch(`${BASE_URL}/extinguishers`);
  // return res.json();

  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Extinguisher[]) : [];
}

/** 소화기 단건 조회 */
export async function getExtinguisherById(id: string): Promise<Extinguisher | null> {
  // 🔄 백엔드 연동 시:
  // const res = await fetch(`${BASE_URL}/extinguishers/${id}`);
  // return res.ok ? res.json() : null;

  const list = await getAllExtinguishers();
  return list.find((e) => e.id === id) ?? null;
}

/** 소화기 정보 수정 — 변경 즉시 localStorage 덮어쓰기 */
export async function updateExtinguisher(updated: Extinguisher): Promise<void> {
  // 🔄 백엔드 연동 시:
  // await fetch(`${BASE_URL}/extinguishers/${updated.id}`, {
  //   method: 'PUT',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(updated),
  // });

  const list = await getAllExtinguishers();
  const next = list.map((e) => (e.id === updated.id ? updated : e));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** 소화기 신규 등록 — 추가 즉시 localStorage 덮어쓰기 */
export async function createExtinguisher(data: Omit<Extinguisher, 'id'>): Promise<Extinguisher> {
  // 🔄 백엔드 연동 시:
  // const res = await fetch(`${BASE_URL}/extinguishers`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(data),
  // });
  // return res.json();

  const list = await getAllExtinguishers();
  const maxNum = list.reduce((acc, e) => {
    const m = e.id.match(/BK-FE-(\d+)/);
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  const newItem: Extinguisher = {
    ...data,
    id: `BK-FE-${String(maxNum + 1).padStart(3, '0')}`,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, newItem]));
  return newItem;
}

/** 소화기 삭제 — 삭제 즉시 localStorage 덮어쓰기 */
export async function deleteExtinguisher(id: string): Promise<void> {
  // 🔄 백엔드 연동 시:
  // await fetch(`${BASE_URL}/extinguishers/${id}`, { method: 'DELETE' });

  const list = await getAllExtinguishers();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter((e) => e.id !== id)));
}
