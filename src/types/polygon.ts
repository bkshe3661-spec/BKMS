/** 폴리곤 꼭짓점 좌표 (이미지 내 상대 비율 0~1) */
export interface Point {
  x: number; // 0 ~ 1 (이미지 가로 비율)
  y: number; // 0 ~ 1 (이미지 세로 비율)
}

/** 건물 영역 폴리곤 */
export interface BuildingPolygon {
  id: string;
  name: string;
  points: Point[];
  color: string; // 폴리곤 채우기 색상
}
