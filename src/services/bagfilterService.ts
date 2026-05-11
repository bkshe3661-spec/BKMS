/**
 * BagFilterService — localStorage 기반 CRUD
 * 키: bkms_bagfilters
 *
 * ─── 데이터 보존 규칙 ────────────────────────────────────────────────────────
 * - 최초 실행 시 키가 없으면 빈 배열 [] 로 초기화
 * - 키가 이미 있으면 절대 덮어쓰지 않음
 * - 샘플/더미 데이터 자동 삽입 코드 절대 금지
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BagFilter } from '../types/bagfilter';

const STORAGE_KEY = 'bkms_bagfilters';

export function initBagFilterStorage(): void {
  if (localStorage.getItem(STORAGE_KEY) === null) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  }
}

export async function getAllBagFilters(): Promise<BagFilter[]> {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as BagFilter[]) : [];
}

export async function getBagFilterById(id: string): Promise<BagFilter | null> {
  const list = await getAllBagFilters();
  return list.find(e => e.id === id) ?? null;
}

export async function addBagFilter(bf: BagFilter): Promise<void> {
  const list = await getAllBagFilters();
  // 중복 ID 방지
  if (list.some(e => e.id === bf.id)) {
    throw new Error(`이미 존재하는 배출구번호입니다: ${bf.id}`);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, bf]));
}

export async function updateBagFilter(updated: BagFilter): Promise<void> {
  const list = await getAllBagFilters();
  const next = list.map(e => (e.id === updated.id ? updated : e));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function deleteBagFilter(id: string): Promise<void> {
  const list = await getAllBagFilters();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter(e => e.id !== id)));
}

/** 도면 위치 저장 */
export async function saveBagFilterPosition(
  id: string,
  floor: string,
  x: number,
  y: number,
): Promise<void> {
  const list = await getAllBagFilters();
  const next = list.map(e =>
    e.id === id ? { ...e, floor, mapX: x, mapY: y } : e,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** 도면에서 제거 (데이터는 유지) */
export async function removeBagFilterPosition(id: string): Promise<void> {
  const list = await getAllBagFilters();
  const next = list.map(e =>
    e.id === id ? { ...e, floor: undefined, mapX: undefined, mapY: undefined } : e,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** 특정 도면에 배치된 백필터 목록 */
export async function getBagFiltersOnFloor(floor: string): Promise<BagFilter[]> {
  const list = await getAllBagFilters();
  return list.filter(e => e.floor === floor && e.mapX !== undefined && e.mapY !== undefined);
}

/** 미배치 백필터 목록 */
export async function getUnplacedBagFilters(): Promise<BagFilter[]> {
  const list = await getAllBagFilters();
  return list.filter(e => !e.floor || e.mapX === undefined);
}
