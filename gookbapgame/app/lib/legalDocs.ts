/**
 * 약관·개인정보처리방침·쿠폰 이용안내 본문.
 *
 * **로케일 파일(`app/lib/i18n/locales/*.ts`)에 넣지 않았다.** 이유가 둘이다.
 *
 * 1. **첫 로드 전송량.** 로케일 사전은 모든 화면이 import하므로 여기 넣으면
 *    법률 팝업을 열지도 않는 전원의 번들에 실린다. 첫 화면 전송량을 660KB
 *    줄인 작업(2026-08-12)과 정면으로 어긋난다. 이 모듈은 `LegalNotice`가
 *    동적 import로만 당겨온다.
 * 2. **번역 정책이 다르다.** UI 문구는 ko/en/ja/zh 4종이지만 법률 본문은
 *    **ko/en 2종뿐이다**(2026-08-14, 이란토). 한국 이벤트를 규율하는 한국
 *    법률 문서이고 원문이 한국어로 왔으며, 개인정보보호법 제28조의8 인용처럼
 *    오역이 곧 법적 리스크인 문장이 들어 있다. ja/zh 사용자는 `t()`의 폴백
 *    체인과 무관하게 **en을 본다**(`pickLegalLocale`).
 *
 * **원문에 손대지 말 것.** 기획자가 확정해 전달한 문서를 그대로 전사한 것이다
 * (`docs/client/20260813_약관.zip`, 2026-08-13 수령).
 * - 3조가 "룰렛"이라고 적고 있으나 실제 구현은 카드 뒤집기다. 회사 법률 문서의
 *   문구이므로 여기서 고쳐 적지 않는다 — 기획자에게 알려 문서를 고치는 것이 맞다.
 * - 원본 docx의 표 2개(위탁 / 국외이전)는 `라벨: 값` 줄로 폈다. 표를 그대로
 *   덤프하면 값이 라벨 없이 이어져 읽을 수 없다.
 *
 * **연락처 4개는 2026-08-19에 채웠다**(이란토). 기획자에게서 직접 받은 값이 아니라
 * **본사 개인정보처리방침(1953bros.com)의 9·10조에서 가져온 것**이다 — 이 프로젝트
 * 산출물이 그 도메인의 서브도메인(game.1953bros.com)으로 연결됐고, 법인명도
 * (주)웨이브앤바이브로 일치한다. 기획자가 별도 지침을 주면 그쪽이 우선한다.
 *   개인정보 보호책임자 최석윤 / official@wavenvibe.com / 010-8302-3932
 *
 * **시행일(`[YYYY년 MM월 DD일]`)만 자리표시자로 남아 있다.** 본사 방침의 시행일
 * (2025-09-01)은 이 문서의 것이 아니고, 서브도메인 연결일(2026-08-17)과 방침 확정일
 * 중 무엇을 쓸지는 법률 문서라 임의로 정하지 않기로 했다(2026-08-19, 이란토).
 * **기획자 확인 후 채울 것.**
 *
 * `legalDocs.test.ts`가 (1) 남은 자리표시자는 시행일 하나뿐이고 (2) 연락처 줄이
 * ko·en 양쪽에 실제 값으로 살아 있는지를 검사한다. 전사 중에 문서 끝이 잘려 그
 * 줄들이 통째로 빠진 적이 있어서(2026-08-14) 존재 자체를 박아둔 것이다.
 */

/**
 * 약관 창(`LegalNotice`)의 탭.
 *
 * **쿠폰 이용안내는 여기 없다**(2026-08-14, 이란토). 성격이 다른 물건이라
 * 같은 창에 탭으로 묶지 않는다 — 약관·개인정보처리방침은 서비스 전체에 걸린
 * 고지라 시작 화면 푸터에서 열지만, 쿠폰 안내는 **쿠폰을 받거나 볼 때** 필요한
 * 설명이라 뽑기 화면과 보관함에서 각자 팝업으로 뜬다(`CouponGuideNotice`).
 * 본문은 `couponGuideBody`로 따로 꺼낸다.
 */
export const LEGAL_DOC_IDS = ["terms", "privacy"] as const;
export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];

/** 본문이 준비된 로케일. UI 로케일 4종과 다르다(위 주석 참고). */
export type LegalLocale = "ko" | "en";

/**
 * UI 로케일을 본문 로케일로 접는다. ja/zh는 en으로 떨어진다.
 *
 * `translate.ts`의 폴백 체인(요청 → en → ko → 키)을 재사용하지 않는 이유는,
 * 그쪽은 "키가 없으면"이 조건이라 ko를 최종 폴백으로 두는데 여기서는 ja/zh
 * 사용자가 **한국어 법률 원문**에 떨어지는 것이 명백히 나쁘기 때문이다.
 */
export function pickLegalLocale(locale: string): LegalLocale {
  return locale === "ko" ? "ko" : "en";
}

/** 창에 뜨는 문서 전체. 약관 창의 탭(`LegalDocId`)에 쿠폰 안내를 더한 것이다. */
type DocId = LegalDocId | "coupon";

const ko: Record<DocId, string> = {
  terms: `이벤트 이용약관

제1조 목적
본 약관은 (주)웨이브앤바이브(이하 “회사”)가 운영하는 「1953 형제돼지국밥 다른 그림 찾기 이벤트」의 이용조건 및 운영기준을 정함을 목적으로 합니다.

제2조 참여
· 이용자는 이벤트 페이지를 통해 자유롭게 참여할 수 있습니다.
· 회원가입은 필요하지 않습니다.
· 이벤트는 브라우저별 이벤트 식별값을 기준으로 운영됩니다.

제3조 이벤트 진행
· 게임 완료 후 설문에 참여할 수 있습니다.
· 설문 완료 시 룰렛 참여 기회가 제공됩니다.
· 이벤트 보상은 운영정책에 따라 지급됩니다.

제4조 이용 제한
회사는 다음과 같은 경우 참여를 제한할 수 있습니다.
· 비정상적인 방법으로 게임 결과를 조작한 경우
· 시스템 오류를 악용한 경우
· 자동화 프로그램을 이용한 경우
· 이벤트 운영을 방해한 경우
부정 참여가 확인될 경우 지급된 쿠폰은 취소될 수 있습니다.

제5조 서비스 변경
회사는 시스템 점검, 운영상 필요 또는 기타 불가피한 사유가 발생한 경우 이벤트 내용을 변경하거나 종료할 수 있습니다.

제6조 면책
회사는 천재지변, 이용자의 단말기 환경 또는 통신 장애 등 회사의 귀책사유가 아닌 사유로 발생한 손해에 대하여 책임을 지지 않습니다.

제7조 문의
운영사: (주)웨이브앤바이브
문의처: official@wavenvibe.com / 010-8302-3932`,

  privacy: `개인정보처리방침

(주)웨이브앤바이브(이하 “회사”)는 「개인정보 보호법」 등 관련 법령을 준수하며, 「1953 형제돼지국밥 이벤트 게임」 운영에 필요한 최소한의 정보만 처리합니다.

본 이벤트는 이름, 휴대전화번호, 이메일 등 이용자를 직접 식별할 수 있는 정보를 수집하지 않습니다. 설문 응답은 게임 기록 및 브라우저 이벤트 식별값과 분리하여 처리하며, 이벤트 분석 및 통계 작성 목적으로만 이용합니다.

1. 처리 목적
회사는 다음의 목적으로 정보를 처리합니다.
· 게임 진행 및 이어하기
· 최고 점수 및 랭킹 관리
· 쿠폰 발급·사용 및 재확인
· 중복 쿠폰 발급 방지
· 설문 참여 여부 확인 및 재참여 방지
· 게임 이용 현황 및 이벤트 성과 분석
· 게임 오류 확인 및 서비스 개선
처리한 정보는 위 목적 외의 용도로 이용하지 않습니다.

2. 처리하는 정보

게임 운영 정보
이벤트 이용 과정에서 다음 정보가 생성·처리될 수 있습니다.
· 브라우저 이벤트 식별값(UUID)
· 게임 진행 상태 및 플레이 기록
· 점수 및 랭킹 정보
· 쿠폰 발급·사용 정보
· 설문 완료 여부
· 접속 및 오류 기록
브라우저 이벤트 식별값은 회원가입 없이 동일 브라우저의 게임 기록을 구분하기 위해 임의로 생성하는 값입니다.

설문 정보
다음 항목을 이벤트 참여자 특성 및 이용 현황에 대한 통계 작성 목적으로 수집합니다.
· 성별
· 연령대
· 거주지역
설문 응답에는 브라우저 이벤트 식별값이나 게임 기록을 연결하지 않으며, 이름, 휴대전화번호, 이메일 등 이용자를 직접 식별할 수 있는 정보를 수집하지 않습니다.

3. 브라우저 저장소(LocalStorage)의 이용
회사는 회원가입 없이 게임 기록을 유지하고 이벤트 기능을 제공하기 위해 이용자의 브라우저 저장소(LocalStorage)를 이용할 수 있습니다.
브라우저 저장소에는 다음 정보가 저장될 수 있습니다.
· 브라우저 이벤트 식별값
· 게임 진행에 필요한 정보
· 쿠폰 확인에 필요한 정보
브라우저 이벤트 식별값은 게임 진행 및 이어하기, 점수·랭킹 관리, 쿠폰 확인, 중복 참여 방지 등을 위해 사용됩니다.
이용자가 브라우저 저장 데이터를 삭제하거나 다른 브라우저 또는 기기를 사용하는 경우 기존 게임 기록, 랭킹 및 쿠폰 정보를 확인하거나 복구하지 못할 수 있습니다.

4. 보유 및 이용기간
회사는 이벤트 운영 및 분석에 필요한 기간 동안만 정보를 보유합니다.

게임 운영 정보
브라우저 이벤트 식별값, 게임 기록, 점수 및 랭킹 정보, 쿠폰 발급·사용 정보, 설문 완료 여부 등의 게임 운영 정보는 이벤트 운영 기간 동안 이용하며, 이벤트 종료일로부터 30일 이내에 파기합니다.

설문 원본 응답
설문 원본 응답은 이벤트 분석 및 통계 집계에 이용하며, 이벤트 분석 및 통계 집계 완료 후 파기합니다.

집계·통계 정보
원본 정보의 파기 이후에도 특정 이용자 또는 브라우저를 식별할 수 없는 형태로 집계된 다음과 같은 통계 정보는 보관할 수 있습니다.
· 이벤트 참여 및 게임 완료 현황
· 게임 퍼널 및 재참여 관련 통계
· 점수 및 게임 이용 관련 통계
· 쿠폰 종류별 발급 및 사용 통계
· 설문 응답 분포
· 대시보드 지표, 그래프 및 이벤트 성과 분석 결과

5. 정보의 파기절차 및 방법
· 회사는 보유기간이 경과하거나 처리 목적이 달성되어 해당 정보가 더 이상 필요하지 않은 경우 파기합니다.
· 전자적 파일 형태로 저장된 정보는 복구 또는 재생되지 않도록 안전한 방법으로 삭제합니다.
· 원본 정보가 파기된 이후에는 특정 이용자 또는 브라우저를 식별할 수 없는 집계·통계 정보만 보관할 수 있습니다.

6. 제3자 제공
회사는 이벤트 운영 과정에서 처리하는 정보를 제3자에게 제공하지 않습니다.
다만, 법령에 특별한 규정이 있거나 법령상 의무를 준수하기 위해 필요한 경우에는 예외로 합니다.

7. 개인정보 처리업무의 위탁
회사는 원활한 이벤트 서비스 제공을 위해 다음과 같이 개인정보 처리업무를 위탁하고 있습니다.
· 수탁자: Supabase, Inc.
· 위탁업무: 이벤트 시스템 운영을 위한 데이터 저장 및 데이터베이스 인프라 제공
회사는 개인정보 처리업무 위탁 시 관련 법령에 따라 개인정보가 안전하게 처리될 수 있도록 필요한 보호조치를 실시합니다.

8. 개인정보의 국외 이전
회사는 이벤트 서비스 제공을 위해 개인정보의 처리위탁 및 보관이 필요한 경우 「개인정보 보호법」 제28조의8 제1항 제3호에 따라 다음과 같이 개인정보를 국외로 이전합니다.
· 이전되는 정보: 브라우저 이벤트 식별값(UUID), 게임 진행 상태 및 플레이 기록, 점수 및 랭킹 정보, 쿠폰 발급·사용 정보, 설문 완료 여부, 접속 및 오류 기록
· 이전 국가: 인도
· 이전받는 자: Supabase, Inc. (privacy@supabase.io)
· 이전 목적: 이벤트 시스템 운영을 위한 데이터 저장 및 데이터베이스 인프라 제공
· 이전 시기 및 방법: 이벤트 이용 과정에서 네트워크를 통해 전송 및 저장
· 보유·이용기간: 이벤트 운영 기간 및 이벤트 종료일로부터 최대 30일 이내
· 국외이전 근거: 「개인정보 보호법」 제28조의8 제1항 제3호(계약의 체결 및 이행을 위해 필요한 개인정보 처리위탁·보관)
이용자는 개인정보 보호담당자에게 문의하여 개인정보의 국외 이전에 관한 사항을 확인하거나 관련 권리를 행사할 수 있습니다.
국외 이전을 거부하는 경우 이벤트 이용을 중단하고 브라우저에 저장된 이벤트 정보를 삭제할 수 있습니다. 다만, 본 이벤트는 게임 진행 및 기록 관리에 국외에 위치한 데이터베이스를 이용하므로 국외 이전을 거부하는 경우 게임 진행, 이어하기, 랭킹 참여, 쿠폰 발급·확인 등 이벤트 서비스 이용이 제한될 수 있습니다.

9. 이용자의 권리 및 행사방법
· 이용자는 관련 법령에 따라 본인의 개인정보 처리에 관한 열람, 정정·삭제, 처리정지 등을 요청할 수 있습니다.
· 개인정보 처리와 관련된 문의 및 권리 행사는 아래 개인정보 보호담당자를 통해 요청할 수 있습니다.
· 이용자는 브라우저 설정을 통해 LocalStorage에 저장된 이벤트 정보를 직접 삭제할 수 있습니다. 이 경우 기존 게임 기록 및 쿠폰 정보 등을 확인하거나 복구하지 못할 수 있습니다.

10. 개인정보 보호 관련 문의
운영사: (주)웨이브앤바이브
개인정보 보호담당자: 최석윤
이메일: official@wavenvibe.com
연락처: 010-8302-3932

11. 개인정보처리방침의 변경
본 개인정보처리방침의 내용이 변경되는 경우 이벤트 페이지 등을 통해 변경사항을 안내합니다.
시행일: [YYYY년 MM월 DD일]`,

  coupon: `쿠폰 이용안내

지급 안내
· 게임을 완료하고 설문에 참여한 이용자에게 룰렛을 통해 쿠폰이 지급됩니다.
· 지급되는 쿠폰의 종류는 이벤트 운영 정책에 따라 달라질 수 있습니다.

사용 안내
· 쿠폰은 발급된 브라우저에서 확인할 수 있습니다.
· 쿠폰은 지정된 사용기한 내에만 사용할 수 있습니다.
· 쿠폰은 1회에 한하여 사용할 수 있습니다.

이용 제한
· 쿠폰은 현금으로 교환할 수 없습니다.
· 타인에게 양도하거나 판매할 수 없습니다.
· 유효기간이 지난 쿠폰은 자동 소멸됩니다.
· 분실 또는 이용자의 브라우저 데이터 삭제로 인한 재발급은 불가능합니다.

사용 제한
다음의 경우 쿠폰 사용이 제한될 수 있습니다.
· 부정한 방법으로 획득한 경우
· 시스템 오류로 오발급된 경우
· 이벤트 운영 정책을 위반한 경우
회사는 위와 같은 경우 해당 쿠폰의 사용을 제한하거나 회수할 수 있습니다.

기타
· 쿠폰 사용 가능 매장 및 사용 조건은 쿠폰 상세 화면에 표시됩니다.
· 운영 상황에 따라 동일한 가치의 다른 혜택으로 변경될 수 있습니다.`,
};

const en: Record<DocId, string> = {
  terms: `Event Terms of Use

Article 1 (Purpose)
These terms set out the conditions of use and operating standards for the "1953 Brothers Pork Gukbap Spot-the-Difference Event" operated by Wave&Vibe Co., Ltd. (the "Company").

Article 2 (Participation)
· Users may freely take part through the event page.
· No account registration is required.
· The event is operated on the basis of a per-browser event identifier.

Article 3 (How the Event Works)
· Users may take part in a survey after completing the game.
· Completing the survey grants a chance to play the roulette.
· Event rewards are given out according to the operating policy.

Article 4 (Restrictions on Use)
The Company may restrict participation in the following cases:
· Manipulating game results by abnormal means
· Exploiting system errors
· Using automated programs
· Obstructing the operation of the event
Coupons already issued may be cancelled where fraudulent participation is confirmed.

Article 5 (Changes to the Service)
The Company may change or end the event in the event of system maintenance, operational necessity, or other unavoidable circumstances.

Article 6 (Disclaimer)
The Company is not liable for damages arising from causes not attributable to the Company, such as natural disasters, the user's device environment, or communication failures.

Article 7 (Contact)
Operator: Wave&Vibe Co., Ltd.
Contact: official@wavenvibe.com / +82-10-8302-3932`,

  privacy: `Privacy Policy

Wave&Vibe Co., Ltd. (the "Company") complies with the Personal Information Protection Act and other applicable laws, and processes only the minimum information necessary to operate the "1953 Brothers Pork Gukbap Event Game".

This event does not collect information that directly identifies a user, such as name, mobile phone number, or email address. Survey responses are processed separately from game records and the browser event identifier, and are used only for event analysis and the compilation of statistics.

1. Purpose of Processing
The Company processes information for the following purposes:
· Running the game and resuming play
· Managing high scores and rankings
· Issuing, using, and re-checking coupons
· Preventing duplicate coupon issuance
· Confirming survey participation and preventing repeat participation
· Analyzing game usage and event performance
· Identifying game errors and improving the service
Information processed is not used for any purpose other than those above.

2. Information Processed

Game operation information
The following information may be generated and processed in the course of using the event:
· Browser event identifier (UUID)
· Game progress state and play records
· Score and ranking information
· Coupon issuance and usage information
· Whether the survey was completed
· Access and error logs
The browser event identifier is a value generated at random to distinguish game records from the same browser without account registration.

Survey information
The following items are collected for the purpose of compiling statistics on participant characteristics and usage:
· Gender
· Age group
· Region of residence
Survey responses are not linked to the browser event identifier or to game records, and no information that directly identifies a user — such as name, mobile phone number, or email address — is collected.

3. Use of Browser Storage (LocalStorage)
The Company may use the user's browser storage (LocalStorage) in order to retain game records and provide event features without account registration.
The following information may be stored in browser storage:
· Browser event identifier
· Information required to run the game
· Information required to check coupons
The browser event identifier is used for running and resuming the game, managing scores and rankings, checking coupons, and preventing duplicate participation.
If a user deletes their browser storage data or uses a different browser or device, existing game records, rankings, and coupon information may no longer be viewable or recoverable.

4. Retention and Use Period
The Company retains information only for the period necessary to operate and analyze the event.

Game operation information
Game operation information — including the browser event identifier, game records, score and ranking information, coupon issuance and usage information, and survey completion status — is used for the duration of the event and destroyed within 30 days of the event end date.

Original survey responses
Original survey responses are used for event analysis and statistical aggregation, and are destroyed once that analysis and aggregation is complete.

Aggregated and statistical information
Even after the original information is destroyed, the Company may retain the following statistical information in a form that cannot identify a particular user or browser:
· Event participation and game completion figures
· Game funnel and repeat participation statistics
· Score and game usage statistics
· Issuance and usage statistics by coupon type
· Survey response distribution
· Dashboard metrics, graphs, and event performance analysis results

5. Procedure and Method of Destruction
· The Company destroys information once the retention period has elapsed or the purpose of processing has been achieved and the information is no longer needed.
· Information stored in electronic file form is deleted by a secure method so that it cannot be recovered or reproduced.
· After the original information is destroyed, only aggregated and statistical information that cannot identify a particular user or browser may be retained.

6. Provision to Third Parties
The Company does not provide information processed in the course of operating the event to third parties.
Exceptions apply where there are special provisions in the law or where necessary to comply with legal obligations.

7. Outsourcing of Personal Information Processing
The Company outsources personal information processing as follows in order to provide the event service smoothly:
· Processor: Supabase, Inc.
· Outsourced work: Data storage and database infrastructure for operating the event system
When outsourcing personal information processing, the Company implements the protective measures required by applicable law so that personal information is handled safely.

8. Transfer of Personal Information Overseas
Where outsourcing and storage of personal information is necessary to provide the event service, the Company transfers personal information overseas as follows, pursuant to Article 28-8 (1) 3 of the Personal Information Protection Act:
· Information transferred: Browser event identifier (UUID), game progress state and play records, score and ranking information, coupon issuance and usage information, survey completion status, access and error logs
· Destination country: India
· Recipient: Supabase, Inc. (privacy@supabase.io)
· Purpose of transfer: Data storage and database infrastructure for operating the event system
· Timing and method of transfer: Transmitted and stored over the network in the course of using the event
· Retention and use period: The duration of the event and up to 30 days from the event end date
· Legal basis for overseas transfer: Article 28-8 (1) 3 of the Personal Information Protection Act (outsourcing and storage of personal information necessary to conclude and perform a contract)
Users may contact the personal information protection officer to check matters relating to the overseas transfer of personal information or to exercise related rights.
A user who refuses the overseas transfer may stop using the event and delete the event information stored in their browser. However, because this event uses a database located overseas to run the game and manage records, refusing the overseas transfer may restrict use of the event service, including playing the game, resuming play, taking part in rankings, and issuing or checking coupons.

9. Rights of Users and How to Exercise Them
· Users may request access to, correction or deletion of, or suspension of the processing of their personal information in accordance with applicable law.
· Inquiries relating to personal information processing and the exercise of rights may be directed to the personal information protection officer below.
· Users may delete event information stored in LocalStorage directly through their browser settings. In that case, existing game records and coupon information may no longer be viewable or recoverable.

10. Privacy Inquiries
Operator: Wave&Vibe Co., Ltd.
Personal information protection officer: Choi Seok-yun
Email: official@wavenvibe.com
Phone: +82-10-8302-3932

11. Changes to This Privacy Policy
If the contents of this privacy policy change, we will announce the changes through the event page or other means.
Effective date: [YYYY년 MM월 DD일]`,

  coupon: `Coupon Guide

Issuance
· Coupons are given out via the roulette to users who complete the game and take part in the survey.
· The types of coupon issued may vary according to the event operating policy.

Use
· Coupons can be viewed in the browser in which they were issued.
· Coupons may only be used within the stated validity period.
· Each coupon may be used once only.

Restrictions
· Coupons cannot be exchanged for cash.
· Coupons cannot be transferred or sold to others.
· Expired coupons lapse automatically.
· Coupons cannot be reissued if lost or if the user deletes their browser data.

Restrictions on Use
Use of a coupon may be restricted in the following cases:
· Where it was obtained by fraudulent means
· Where it was issued in error due to a system fault
· Where the event operating policy has been violated
In such cases the Company may restrict the use of the coupon or withdraw it.

Other
· The stores where a coupon can be used and its conditions of use are shown on the coupon detail screen.
· Depending on operating circumstances, a coupon may be changed for another benefit of equal value.`,
};

const DOCS: Record<LegalLocale, Record<DocId, string>> = { ko, en };

/** 약관 창의 탭 본문. */
export function legalDocBody(locale: LegalLocale, id: LegalDocId): string {
  return DOCS[locale][id];
}

/** 쿠폰 이용안내 본문. 약관 창이 아니라 `CouponGuideNotice`가 쓴다(위 주석). */
export function couponGuideBody(locale: LegalLocale): string {
  return DOCS[locale].coupon;
}
