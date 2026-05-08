/**
 * polygonService.ts
 * ─────────────────────────────────────────────────────
 * 폴리곤 데이터 localStorage CRUD 서비스 레이어
 * 백엔드 연동 시 이 파일의 함수만 API 호출로 교체하면 됨
 * ─────────────────────────────────────────────────────
 */

import type { BuildingPolygon } from '../types/polygon';

const STORAGE_KEY = 'bkms_factory_polygons';

/** 전체 폴리곤 목록 읽기 */
export function loadPolygons(): BuildingPolygon[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BuildingPolygon[];
  } catch {
    return [];
  }
}

/** 전체 폴리곤 목록 저장 (덮어쓰기) */
export function savePolygons(polygons: BuildingPolygon[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(polygons));
  } catch {
    console.warn('[polygonService] localStorage 저장 실패');
  }
}

/** 폴리곤 추가 */
export function addPolygon(polygon: BuildingPolygon): BuildingPolygon[] {
  const current = loadPolygons();
  const next = [...current, polygon];
  savePolygons(next);
  return next;
}

/** 폴리곤 삭제 */
export function removePolygon(id: string): BuildingPolygon[] {
  const current = loadPolygons();
  const next = current.filter(p => p.id !== id);
  savePolygons(next);
  return next;
}

/** 전체 초기화 */
export function clearPolygons(): void {
  localStorage.removeItem(STORAGE_KEY);
}
