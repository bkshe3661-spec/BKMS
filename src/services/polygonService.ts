/**
 * polygonService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 폴리곤(건물 영역) 데이터 서비스
 *
 * ─── Master Data 규칙 ────────────────────────────────────────────────────────
 * - 건물 폴리곤은 인프라 마스터 값이므로 코드 내부에 하드코딩
 * - localStorage에 사용자가 저장한 폴리곤이 있으면 그것을 우선 사용
 * - localStorage에 아무것도 없을 때만 MASTER_POLYGONS 하드코딩값 반환
 * - clearPolygons() 호출 후에도 MASTER_POLYGONS로 복원됨 (완전 삭제 불가)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BuildingPolygon } from '../types/polygon';

const STORAGE_KEY = 'bkms_factory_polygons';

/**
 * 마스터 폴리곤 데이터 (인프라 하드코딩값)
 * - 사용자가 조감도에서 직접 그린 건물 영역 좌표
 * - 새로고침/localStorage 삭제 후에도 이 값으로 복원됨
 * - 좌표 변경 시 이 배열을 직접 수정
 */
const MASTER_POLYGONS: BuildingPolygon[] = [
  {
    id: 'poly-master-1',
    name: '관리동',
    color: '#3b82f6',
    points: [
      { x: 0.3867, y: 0.2995 },
      { x: 0.5527, y: 0.2995 },
      { x: 0.5527, y: 0.5339 },
      { x: 0.3867, y: 0.5339 },
    ],
  },
];

/** localStorage에 저장된 폴리곤이 있으면 반환, 없으면 MASTER_POLYGONS 반환 */
export function loadPolygons(): BuildingPolygon[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return MASTER_POLYGONS;
    const parsed = JSON.parse(raw) as BuildingPolygon[];
    // 빈 배열이면 마스터로 복원
    if (!Array.isArray(parsed) || parsed.length === 0) return MASTER_POLYGONS;
    return parsed;
  } catch {
    return MASTER_POLYGONS;
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
  // 삭제 후 빈 배열이 되면 MASTER_POLYGONS를 저장해 복원
  const toSave = next.length === 0 ? MASTER_POLYGONS : next;
  savePolygons(toSave);
  return toSave;
}

/** localStorage 초기화 (MASTER_POLYGONS 으로 복원) */
export function clearPolygons(): void {
  savePolygons(MASTER_POLYGONS);
}

/** 마스터 폴리곤 목록 반환 (읽기 전용) */
export function getMasterPolygons(): BuildingPolygon[] {
  return MASTER_POLYGONS;
}
