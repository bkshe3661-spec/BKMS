/**
 * ExtinguisherService
 *
 * ✅ 현재: localStorage 기반 시뮬레이션
 * 🔄 추후: 각 함수의 주석 처리된 API 호출 코드로 교체하면 백엔드 연동 완료
 *
 * 백엔드 개발자 안내:
 *   - BASE_URL 상수를 실제 API 서버 주소로 변경
 *   - 각 함수 내부의 localStorage 로직을 제거하고 fetch/axios 호출로 교체
 *   - 반환 타입(Extinguisher, Extinguisher[])은 동일하게 유지
 */

import type { Extinguisher } from '../types/extinguisher';
import { initialExtinguishers } from '../data/initialData';

const STORAGE_KEY = 'bkms_extinguishers';
// const BASE_URL = 'http://your-api-server.com/api/v1'; // 🔄 백엔드 연동 시 활성화

/** localStorage 초기화 — 데이터가 없을 때만 샘플 삽입, 있으면 절대 덮어쓰지 않음 */
export function initStorage(): void {
  const existing = localStorage.getItem(STORAGE_KEY);
  // 키 자체가 없을 때만 초기 샘플 세팅 (빈 배열 []도 "있는 것"으로 간주해 건드리지 않음)
  if (existing === null) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialExtinguishers));
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

/** 소화기 정보 수정 */
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

/** 소화기 신규 등록 */
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
    const n = parseInt(e.id.replace('BK-FE-', ''), 10);
    return Math.max(acc, n);
  }, 0);
  const newItem: Extinguisher = {
    ...data,
    id: `BK-FE-${String(maxNum + 1).padStart(3, '0')}`,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, newItem]));
  return newItem;
}

/** 소화기 삭제 */
export async function deleteExtinguisher(id: string): Promise<void> {
  // 🔄 백엔드 연동 시:
  // await fetch(`${BASE_URL}/extinguishers/${id}`, { method: 'DELETE' });

  const list = await getAllExtinguishers();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter((e) => e.id !== id)));
}

/** localStorage 전체 초기화 (개발/디버그용) */
export function resetStorage(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialExtinguishers));
}
