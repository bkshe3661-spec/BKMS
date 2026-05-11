/**
 * raw 저장 상태 (localStorage에 직접 저장되는 값)
 * - '정상'    : 수동 정상 지정
 * - '점검필요' : 수동 점검필요 지정
 * - '교체대상' : 수동 교체대상 지정
 * - '불량'    : 점검 체크리스트 비정상 항목 존재 시 자동 부여 (또는 수동)
 * - '폐기'    : 폐기 처리 완료 (legacy 호환용 — 표시 시 '불량'으로 매핑)
 */
export type ExtinguisherStatus = '정상' | '교체대상' | '점검필요' | '불량' | '폐기';

export interface Extinguisher {
  id: string;           // "BK-FE-001"
  location: string;     // 설치 위치
  type: string;         // 소화기 종류
  mfgDate: string;      // 제조년월 "YYYY-MM"
  lastCheckDate: string;// 최종점검일 "YYYY-MM-DD"
  status: ExtinguisherStatus;
  /**
   * 교체 년월 "YYYY-MM" (선택 입력)
   * - 입력 시: 이 날짜가 오늘을 지났으면 1순위 '교체대상' 강제
   * - 미입력 시: mfgDate + 10년으로 자동 계산
   */
  replaceDate?: string;
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
