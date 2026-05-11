export type ExtinguisherStatus = '정상' | '교체대상' | '점검필요' | '폐기';

export interface Extinguisher {
  id: string;           // "BK-FE-001"
  location: string;     // 설치 위치
  type: string;         // 소화기 종류
  mfgDate: string;      // 제조년월 "YYYY-MM"
  lastCheckDate: string;// 최종점검일 "YYYY-MM-DD"
  status: ExtinguisherStatus;
  manager: string;      // 담당자
  note: string;         // 비고
  // 점검 체크리스트 결과 (점검 완료 시 저장)
  checkResults?: (boolean | null)[];  // 각 항목 true=정상, false=비정상, null=미선택
  // 점검 사진 (base64 또는 URL)
  checkPhotos?: string[];
  // 도면 위치 정보 (선택적 - 편집 모드에서 설정)
  mapX?: number;        // 이미지 내 X 비율 (0~1)
  mapY?: number;        // 이미지 내 Y 비율 (0~1)
  floor?: string;       // 배치된 도면 식별자 (예: "관리동_1층")
}
