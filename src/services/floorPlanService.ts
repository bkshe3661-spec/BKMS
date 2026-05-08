/**
 * FloorPlanService
 * 소화기의 도면 위치(mapX, mapY, floor)를 localStorage에 저장/로드/삭제
 * extinguisherService와 연동하여 좌표만 별도 관리
 */

import type { Extinguisher } from '../types/extinguisher';

const STORAGE_KEY = 'bkms_extinguishers';

/** localStorage에서 전체 소화기 목록 동기 로드 */
function loadAll(): Extinguisher[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Extinguisher[]) : [];
}

/** localStorage에 전체 목록 저장 */
function saveAll(list: Extinguisher[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * 특정 floor에 배치된 소화기 목록 반환
 * @param floor  예: "관리동_1층"
 */
export function getExtinguishersOnFloor(floor: string): Extinguisher[] {
  return loadAll().filter(e => e.floor === floor && e.mapX !== undefined && e.mapY !== undefined);
}

/**
 * 소화기 위치(mapX, mapY, floor) 저장
 */
export function saveExtinguisherPosition(
  id: string,
  floor: string,
  mapX: number,
  mapY: number,
): void {
  const list = loadAll().map(e =>
    e.id === id ? { ...e, mapX, mapY, floor } : e
  );
  saveAll(list);
}

/**
 * 소화기 정보 전체 업데이트 (편집 모달에서 저장)
 */
export function updateExtinguisherInfo(updated: Extinguisher): void {
  const list = loadAll().map(e => (e.id === updated.id ? updated : e));
  saveAll(list);
}

/**
 * 소화기 위치 제거 (도면에서 삭제)
 */
export function removeExtinguisherPosition(id: string): void {
  const list = loadAll().map(e =>
    e.id === id ? { ...e, mapX: undefined, mapY: undefined, floor: undefined } : e
  );
  saveAll(list);
}

/**
 * 특정 floor에 미배치된 소화기 목록
 * location 필드에 floor명이 포함되어 있고, 아직 mapX가 없는 항목
 */
export function getUnplacedExtinguishers(floor: string): Extinguisher[] {
  const keyword = floorToKeyword(floor);
  return loadAll().filter(e =>
    e.location.includes(keyword) && (e.mapX === undefined || e.floor !== floor)
  );
}

/** floor 식별자 → 소화기 location 검색 키워드 변환 */
export function floorToKeyword(floor: string): string {
  const map: Record<string, string> = {
    '관리동_1층': '관리동 1층',
    '관리동_2층': '관리동 2층',
    '복지동_1층': '복지동',
    '식당_1층':   '식당',
  };
  return map[floor] ?? floor;
}

/** 특정 소화기 단건 동기 조회 */
export function getExtinguisherById(id: string): Extinguisher | null {
  return loadAll().find(e => e.id === id) ?? null;
}
