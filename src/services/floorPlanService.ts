/**
 * FloorPlanService
 * 소화기의 도면 위치(mapX, mapY, floor)를 localStorage에 저장/로드/삭제
 */

import type { Extinguisher } from '../types/extinguisher';

const STORAGE_KEY = 'bkms_extinguishers';

function loadAll(): Extinguisher[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Extinguisher[]) : [];
}

function saveAll(list: Extinguisher[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** floor ID → 필터링에 사용할 키워드 배열 (모두 포함되어야 매칭) */
const FLOOR_KEYWORDS: Record<string, string[]> = {
  '관리동_1층': ['관리동', '1층'],
  '관리동_2층': ['관리동'],   // 2층은 location에 "2층" 표기가 없는 경우도 포함
  '복지동_1층': ['복지동'],
  '식당_1층':   ['식당'],
};

function matchesFloor(location: string, floor: string): boolean {
  const keywords = FLOOR_KEYWORDS[floor] ?? [floor];
  return keywords.every(kw => location.includes(kw));
}

/** 특정 floor에 이미 배치된 소화기 목록 */
export function getExtinguishersOnFloor(floor: string): Extinguisher[] {
  return loadAll().filter(e =>
    e.floor === floor && e.mapX !== undefined && e.mapY !== undefined
  );
}

/** 소화기 위치 저장 */
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

/** 소화기 정보 전체 업데이트 */
export function updateExtinguisherInfo(updated: Extinguisher): void {
  const list = loadAll().map(e => (e.id === updated.id ? updated : e));
  saveAll(list);
}

/** 소화기 도면 위치 제거 */
export function removeExtinguisherPosition(id: string): void {
  const list = loadAll().map(e =>
    e.id === id ? { ...e, mapX: undefined, mapY: undefined, floor: undefined } : e
  );
  saveAll(list);
}

/**
 * 특정 floor에 배치 가능한 미배치 소화기 목록
 * - location에 floor 키워드가 모두 포함되어 있고
 * - 아직 이 floor에 배치되지 않은 항목
 */
export function getUnplacedExtinguishers(floor: string): Extinguisher[] {
  return loadAll().filter(e =>
    matchesFloor(e.location, floor) &&
    (e.mapX === undefined || e.floor !== floor)
  );
}

/**
 * 좌표(mapX, mapY)가 없는 모든 미배치 소화기 반환
 * (floor 키워드 무관 — 배치 대기 패널 전용)
 */
export function getAllUnplacedExtinguishers(): Extinguisher[] {
  return loadAll().filter(e => e.mapX === undefined || e.mapY === undefined);
}

/** 단건 조회 */
export function getExtinguisherById(id: string): Extinguisher | null {
  return loadAll().find(e => e.id === id) ?? null;
}

/** 신규 소화기 추가 (도면에서 직접 추가 시) */
export function addNewExtinguisher(fe: Extinguisher): void {
  const list = loadAll();
  // 중복 ID 방지
  if (list.some(e => e.id === fe.id)) {
    saveAll(list.map(e => e.id === fe.id ? fe : e));
  } else {
    saveAll([...list, fe]);
  }
}

/**
 * 다음 순번 소화기 ID 반환 (BK-FE-001, 002, ...)
 * 기존 목록에서 최대 번호를 찾아 +1
 */
export function getNextExtinguisherId(): string {
  const list = loadAll();
  const maxNum = list.reduce((acc, e) => {
    const m = e.id.match(/BK-FE-(\d+)/);
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  return `BK-FE-${String(maxNum + 1).padStart(3, '0')}`;
}

/**
 * 소화기 데이터 전체 초기화
 * 기존에 사용하던 모든 키를 삭제하고 빈 배열로 초기화
 */
export function clearAllExtinguishers(): void {
  // 현재 키 + 과거에 사용했을 수 있는 키 모두 삭제
  const keysToRemove = [
    'bkms_extinguishers',
    'bkms_fire_extinguishers',
    'extinguishers',
    'fire_extinguishers',
    'bkms_fe',
  ];
  keysToRemove.forEach(k => localStorage.removeItem(k));
  // 현재 사용 키를 빈 배열로 명시적 초기화
  saveAll([]);
}
