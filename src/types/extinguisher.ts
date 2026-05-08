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
}
