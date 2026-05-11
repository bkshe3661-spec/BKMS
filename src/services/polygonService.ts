/**
 * polygonService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 폴리곤(건물 영역) 데이터 서비스
 *
 * ─── 좌표 수정 방법 ────────────────────────────────────────────────────────
 * 아래 MASTER_POLYGONS 배열의 각 건물 points를 수정하세요.
 * 좌표는 이미지(1024×768) 대비 비율(0~1)로 표현됩니다.
 * x: 가로 비율 (0=왼쪽, 1=오른쪽)
 * y: 세로 비율 (0=위쪽, 1=아래쪽)
 *
 * ─── Master Data 규칙 ────────────────────────────────────────────────────────
 * - localStorage에 사용자가 저장한 폴리곤이 있으면 그것을 우선 사용
 * - localStorage에 아무것도 없을 때만 MASTER_POLYGONS 반환
 * - clearPolygons() 호출 후에도 MASTER_POLYGONS로 복원됨
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BuildingPolygon } from '../types/polygon';

const STORAGE_KEY = 'bkms_factory_polygons';

/**
 * 마스터 폴리곤 데이터
 * ─────────────────────────────────────────────────────────────────────────────
 * 공장 조감도(factory-aerial.jpg, 1024×768) 기준 비율 좌표
 * 좌표를 직접 수정하려면 각 points 배열의 x/y 값을 변경하세요.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const MASTER_POLYGONS: BuildingPolygon[] = [
  // ── 관리동 (이미지 중앙 하단 좌측, 태양광 패널 있는 건물) ──
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

  // ── 생산1동 (중앙 상단 좌측, 대형 공장 건물) ──
  {
    id: 'poly-master-2',
    name: '생산1동',
    color: '#10b981',
    points: [
      { x: 0.155, y: 0.185 },
      { x: 0.345, y: 0.185 },
      { x: 0.345, y: 0.430 },
      { x: 0.155, y: 0.430 },
    ],
  },

  // ── 생산2동 (중앙, 대형 공장 건물 우측) ──
  {
    id: 'poly-master-3',
    name: '생산2동',
    color: '#f59e0b',
    points: [
      { x: 0.565, y: 0.195 },
      { x: 0.745, y: 0.195 },
      { x: 0.745, y: 0.420 },
      { x: 0.565, y: 0.420 },
    ],
  },

  // ── 원료창고 (상단 중앙, 흰 지붕 창고) ──
  {
    id: 'poly-master-4',
    name: '원료창고',
    color: '#8b5cf6',
    points: [
      { x: 0.340, y: 0.050 },
      { x: 0.560, y: 0.050 },
      { x: 0.560, y: 0.180 },
      { x: 0.340, y: 0.180 },
    ],
  },

  // ── 복지관 (하단 좌측, 소형 건물) ──
  {
    id: 'poly-master-5',
    name: '복지관',
    color: '#ec4899',
    points: [
      { x: 0.195, y: 0.660 },
      { x: 0.355, y: 0.660 },
      { x: 0.355, y: 0.800 },
      { x: 0.195, y: 0.800 },
    ],
  },

  // ── 제품창고 (우측 하단) ──
  {
    id: 'poly-master-6',
    name: '제품창고',
    color: '#06b6d4',
    points: [
      { x: 0.620, y: 0.580 },
      { x: 0.800, y: 0.580 },
      { x: 0.800, y: 0.720 },
      { x: 0.620, y: 0.720 },
    ],
  },
];

/** localStorage에 저장된 폴리곤이 있으면 반환, 없으면 MASTER_POLYGONS 반환 */
export function loadPolygons(): BuildingPolygon[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return MASTER_POLYGONS;
    const parsed = JSON.parse(raw) as BuildingPolygon[];
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
