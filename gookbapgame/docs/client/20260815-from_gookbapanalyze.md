# 1. 이미지 합성 관련 전달사항

```json
{
  "base_images": [
    {
      "id": 14,
      "level": 4,
      "title": {
        "en": "Sky Capsule",
        "ja": "スカイーカプセル",
        "ko": "스카이캡슐"
      },
      // 1) 바탕이 될 가장 기본 캔버스 이미지입니다. (맨 밑에 렌더링)
      "image_url": "https://pglhlesnyfncaupiwkwz.supabase.co/storage/v1/object/public/game_assets/base_images/base_326b0298-235d-40c5-8933-0ead2fc5e426.webp",
      // 2) 이 이미지에서 찾아야 하는 정답(다른 점)은 2개입니다.
      "questions_count": 2,
      "slots": [
        {
          "id": 54,
          // 3) 파츠가 그려질 중심 좌표(x, y)입니다.
          "x_coordinate": 111,
          "y_coordinate": 425,
          "scale": 1.62,
          "z_index": 1,
          // 4) 이 위치에는 'category_id'가 46인(하늘 카테고리) 파츠들만 부착될 수 있습니다.
          "category_id": 46
        }
        // ... (나머지 슬롯 생략)
      ]
    }
    // ... (나머지 기본 이미지 생략)
  ],
  "categories": [
    {
      "id": 46,
      "name": {
        "en": "Sky",
        "ja": "空",
        "ko": "하늘"
      },
      "parts": [
        {
          "id": 112,
          "name": {
            "en": "airplane",
            "ja": "飛行機",
            "ko": "비행기"
          },
          "scale": 1,
          "offset_x": 0,
          "offset_y": 0,
          // 5) 위 슬롯(category_id: 46)에 넣기로 결정했다면, 이 비행기 이미지를 투명 캔버스 좌표 (111, 425)에 부착(렌더링)합니다.
          "image_url": "https://pglhlesnyfncaupiwkwz.supabase.co/storage/v1/object/public/game_assets/parts/part_5fc001f1-f305-4b22-8b0c-4436b9c3db05.webp"
        },
        {
          "id": 115,
          "name": {
            "en": "sky is clear",
            "ja": "きれい天気",
            "ko": "맑은 하늘"
          },
          "scale": 1,
          "offset_x": 0,
          "offset_y": 0,
          // 6) 무작위 구성에 따라, 비행기 대신 이 맑은 하늘 이미지를 넣을 수도 있습니다.
          "image_url": "https://pglhlesnyfncaupiwkwz.supabase.co/storage/v1/object/public/game_assets/parts/part_cc34af32-09ef-4886-af87-f65b06a9df84.webp"
        }
      ]
    }
    // ... (나머지 카테고리 생략)
  ]
}
```

제가 로딩 과정 원인을 보니깐, 게임 목록을 조회를 하는데 너무 많은 시간을 할당하는거같아서 아예 한번 조회로 한번에 값을 반환하도록 RPC 함수를 만들어 뒀습니다
이제 이걸로 데이터베이스에서 일일히 이미지를 가져오는 방식 대신, 이 함수로 RPC 조회를 한 뒤 이 데이터를 기반으로 게임 할 것을 판단해서 API로 이미지만 가져와주시면 전부 해결될 것 같습니다

### JIT 이미지 합성 API 가이드 (/api/generate-unified)
대시보드 또는 클라이언트가 동적으로 특정 조합의 파츠를 합성한 이미지가 필요할 때 호출하는 백엔드 API입니다. 
최근 업데이트로 벌크(다중) 처리 및 캐시 최적화가 적용되어 수십 개의 이미지를 한 번에 초고속으로 요청할 수 있습니다.

##### 단일 이미지 요청 (Legacy 호환 포맷)
하나의 이미지 조합만 생성할 때 사용합니다.
Endpoint: POST /api/generate-unified
Headers: Content-Type: application/json
Request Body (JSON):
```json
{
  "baseImageId": 14,
  "imageSlots": {
    "46": 112,
    "47": 115
  }
}
Response
{
  "success": true,
  "url": "https://.../unified_cache/base14_abc.webp"
}
```

##### 다중(벌크) 이미지 요청 (권장)
최대 수십 개의 파츠 조합을 한 번에 요청합니다. 병렬 처리 및 RPC 마스터 데이터 캐싱을 통해 압도적으로 빠른 속도로 이미지를 반환받을 수 있습니다.
Request Body (JSON):
```json
{
  "combinations": [
    {
      "baseImageId": 14,
      "imageSlots": { "46": 112, "47": 115 }
    },
    {
      "baseImageId": 15,
      "imageSlots": { "48": 120 }
    }
  ]
}
Response
{
  "success": true,
  "results": [
    {
      "baseImageId": 14,
      "imageSlots": { "46": "112", "47": "115" },
      "url": "https://.../unified_cache/base14_abc.webp"
    },
    {
      "baseImageId": 15,
      "imageSlots": { "48": "120" },
      "url": "https://.../unified_cache/base15_def.webp"
    }
  ]
}
```

그리고, 이미지 조회 함수도 한번에 여러개를 입력할 수 있도록 변경됐고 (병렬처리), 속도도 비약적으로 향상시켰습니다

일단 지금 버그 잡고있어서 잠시 롤백해뒀어요
완성된거 확인하면 말씀드릴게요
rpc 함수는 정상 작동하니 그거 먼저 적용해주셔도 될거에요

---

# 설문조사 완료 여부를 구분하는 로직에 관하여

https://1953bros-dashboard.kro.kr/api/gatcha/draw 403 (Forbidden)
(anonymous) @ VM204:4
VM204:14 🎉 추첨 결과: 

{error: '설문조사를 먼저 완료해주세요.', code: 'SURVEY_REQUIRED'}
code
: 
"SURVEY_REQUIRED"
error
: 
"설문조사를 먼저 완료해주세요."

제 의도는 게임이 종료되면 필수적으로 check_pending_survey RPC 함수를 호출해서 남은 설문이 있는지 탐지하고 NULL 반응이 올 때 그때 설문을 건너뛰는게 의도였는데, 설문조사를 한 적이 없는데 설문조사를 건너뛰고 그대로 룰렛에 들어가서 이런 오류가 나타난 것 같습니다.
지금보니 RPC 함수를 전혀 호출하지 않는거같아 보이더라고요

설문조사 완료 여부 감지는 클라이언트(UI 흐름 제어)와 서버/DB(실제 자격 검증)의 2중 구조로 동작합니다.

---

클라이언트단 감지: localStorage 기반 UI 힌트
클라이언트(브라우저)에서는 사용자가 이전에 설문을 제출했는지를 localStorage로 감지합니다.

저장 키: gukbap_survey_submitted = "1" ([`app/lib/surveySubmitted.ts`](./gookbapgame/app/lib/surveySubmitted.ts))
기록 시점: 설문 화면에서 답변 제출([`submitSurveyResponses`](./gookbapgame/app/actions.ts))이 성공하면 markSurveySubmitted()를 호출해 브라우저에 저장합니다.
감지 및 화면 분기 ([`app/page.tsx`](./gookbapgame/app/page.tsx#L218-L245)):
게임 종료 후 설문 흐름(enterSurveyFlow)에 진입할 때 hasSurveySubmitted()를 확인합니다.
true인 경우: 이미 설문을 완료한 기기이므로 설문 안내/설문 화면을 건너뛰고 곧바로 룰렛(wheel) 뽑기 화면으로 직행합니다.
false인 경우: 정상적으로 설문 안내(surveyIntro) 및 설문(survey) 화면을 띄웁니다.

💡 클라이언트에서 localStorage를 쓰는 이유
Supabase의 survey_responses 테이블은 보안 정책(RLS)상 익명 사용자(anon)에게 INSERT만 열려 있고 SELECT 권한이 없습니다. 클라이언트가 DB를 직접 조회해서 설문 여부를 알 수 없기 때문에, UI 상에서 중복 설문을 생략하기 위한 힌트로 localStorage를 활용합니다.

---

서버/백엔드단 검증: survey_responses DB 조회 (최종 진실)
localStorage는 조작되거나 브라우저 청소로 지워질 수 있으므로, 쿠폰 발급 자격의 최종 판정은 항상 서버가 합니다.

식별 기준: 참여자의 브라우저 쿠키(gookbapgame_token)를 해싱한 고유 participant_id.
매장 쿠폰 뽑기 ([`/api/gatcha/draw`](./gookbapgame/app/actions.ts#L867-L901)):
룰렛을 돌릴 때 서버가 DB의 survey_responses 테이블에서 해당 participant_id로 제출된 Phase 1 설문 응답이 있는지 직접 SELECT하여 검증합니다.
설문 응답이 없으면 403 (SURVEY_REQUIRED)으로 뽑기를 거절합니다.
온라인몰 쿠폰 발급 ([`/api/web-coupons/assign`](./gookbapgame/app/actions.ts#L813-L838)):
설문 제출 직후 100% 확정 지급되는 온라인몰 쿠폰 역시 서버가 survey_responses를 검증한 후 미배정 코드를 지급합니다.
여기에서 2번에 중대한 오류가 있는데, 애초에 데이터베이스의 servey_responses에는 SELECT권한이 따로 없습니다
그래서 제가 그거를 보안하기 위해서 check_pending_survey RPC 함수를 호출해서 어느 설문을 해야하는지 질문하는 기능을 집어넣었는데, 프론트엔드에서 이 기능이 아닌 직접 SELECT하는 기능을 넣었더라고요
온라인몰 쿠폰의 경우 localstorage에서 쿠폰을 발급받았는지 확인하는 value를 집어넣는것을 권장하지만 (설문 쪼개서 하면 쿠폰을 여러번 받을 수 있으니), 매장 쿠폰의 경우 무조건 RPC 함수로만 감지해서 쿠폰을 썼는지 안썼는지 확인을 해보시기를 강력히 권장합니다
