/**
 * 백필터 데이터 모델
 * localStorage 키: bkms_bagfilters
 */
export interface BagFilter {
  /** 허가증상 배출구번호 (Primary Key) */
  id: string;
  /** 배출구 일련번호 */
  outletSeq: number;
  /** 시설명 */
  facilityName: string;
  /** 방지시설 정보 */
  preventionInfo: string;
  /** 여과포 규격 */
  filterSpec: string;
  /** 여과포 수량 */
  filterQty: string;
  /** 재질 */
  material: string;
  /** 전전교체일 "YYYY-MM-DD" 또는 "YYYY-MM" */
  prevReplaceDate: string;
  /** 전교체일 "YYYY-MM-DD" 또는 "YYYY-MM" */
  lastReplaceDate: string;
  /** 도면 X 비율 (0~1) */
  mapX?: number;
  /** 도면 Y 비율 (0~1) */
  mapY?: number;
  /** 배치된 도면 식별자 (예: "관리동_1층") */
  floor?: string;
}
