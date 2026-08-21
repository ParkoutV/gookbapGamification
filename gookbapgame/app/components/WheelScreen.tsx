"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../lib/i18n/LocaleContext";
import { couponDateLines } from "../lib/couponDates";
import { useCardImageSave } from "../hooks/useCardImageSave";
import PixelPanel from "./PixelPanel";
import GatchaCard from "./GatchaCard";
import GatchaLoading from "./GatchaLoading";
import CouponGuideNotice from "./CouponGuideNotice";
import type { DrawCouponResult, WebCouponSettings } from "../actions";
import { resolveCardFace } from "../lib/cardFace";

/**
 * 카드 섞기 연출(2단계)의 고정 길이. 스킵 없음(2026-08-11, 이란토).
 *
 * **꽝도 똑같이 이 시간을 거친다.** 결과에 따라 섞는 시간이 달라지면 카드를
 * 뒤집기 전에 결과를 알아챈다.
 *
 * 서버가 이미 결과를 정한 뒤에 연출을 재생하는 구조이며, 가챠의 표준이고
 * 의도한 것이다. 이 값은 여기 한 곳에만 둔다.
 *
 * `GatchaCard`의 450ms 결과음 지연과는 **별개 타이머다.** 그쪽은 이 3초가 끝나
 * 카드가 나온 뒤 사용자가 탭해야 비로소 시작한다 — 합산하거나 통합하지 말 것.
 */
const SHUFFLE_MS = 3000;

interface WheelScreenProps {
  drawResult: DrawCouponResult | null;
  isDrawing: boolean;
  onSpin: () => void;
  onNext: () => void;
  /** 보관함에 쿠폰이 하나라도 있는가. 거절 화면의 안내를 가른다(아래 rejected 분기). */
  hasCoupons: boolean;
  onOpenMyCoupons: () => void;
  /**
   * 온라인몰 쿠폰의 표시 문구(`web_coupon_settings`). 가챠가 온라인몰 쿠폰을 뽑으면
   * 그 이름을 카드 앞면에 올려야 하는데, 혜택 내용은 운영자가 DB에 문장으로 적는다 —
   * 로케일 파일의 `webCoupon.label`은 조회 실패 시 기본값일 뿐이다.
   *
   * **예전에는 이 값을 받지 않아서** 카드를 못 그리고 "발급되었어요" 한 줄로
   * 때웠고, 그 분기가 `usesCard`를 false로 만들어 뽑기 연출이 통째로 사라졌다.
   */
  webCouponSettings: WebCouponSettings | null;
  /**
   * 설문 보상 안내(`WebCouponGrantedNotice`)가 떠 있는가.
   *
   * 그 팝업은 `page.tsx` 최상위에 있어 **phase 전환을 견디도록** 만들어져 있다
   * (설문 제출 성공이 곧 `wheel` 전이를 부르므로, 특정 phase 안에 두면 팝업이 함께
   * 사라진다). 그래서 설문을 마친 사람은 **누구나** 이 화면과 팝업이 겹쳐 보인다 —
   * 가챠까지 온라인몰 쿠폰을 뽑으면 비슷한 안내가 나란히 뜬다(2026-08-21 제보).
   *
   * **호출 순서가 아니라 보이는 순서만 미룬다.** draw는 마운트 이펙트가 이미
   * 보냈고 그래야 한다 — 호출까지 미루려고 `<WheelScreen>`을 부모에서 조건부로
   * 빼면 재마운트가 끼어 `drawStartedRef`에 걸려 뽑기가 조용히 죽는다.
   */
  grantedNoticeOpen: boolean;
}

export default function WheelScreen({
  drawResult,
  isDrawing,
  onSpin,
  onNext,
  hasCoupons,
  onOpenMyCoupons,
  webCouponSettings,
  grantedNoticeOpen,
}: WheelScreenProps) {
  const { t, locale } = useLocale();
  const [flipped, setFlipped] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  /*
   * 앞면에 무엇을 올릴지. **결과 문자열을 여기서 직접 가르지 말 것** — 예전에
   * `usesCard`를 `won || miss`로 적어두는 바람에 `wonOnline`이 빠져 카드 연출이
   * 통째로 건너뛰어졌다(`cardFace.ts` 주석). 판정과 구성이 한 함수에 있어야
   * 그 조합이 다시 생기지 않는다.
   *
   * `useMemo`인 것은 `useCardImageSave`가 이 값을 이펙트 의존성으로 쓰기 때문이다.
   */
  const face = useMemo(
    () =>
      resolveCardFace({
        status: drawResult?.status ?? "",
        coupon: drawResult?.status === "won" ? drawResult.coupon : null,
        code: drawResult?.status === "wonOnline" ? drawResult.code : null,
        settingsTitle: webCouponSettings?.title ?? null,
        locale,
        fallbackName: t("webCoupon.label"),
      }),
    [drawResult, webCouponSettings, locale, t]
  );

  const coupon = face?.kind === "store" ? face.coupon : null;

  // 화면과 저장 이미지가 같은 문구를 써야 한다 — 한쪽만 바뀌면 조용히 달라진다.
  // 조립은 couponDateLines 한 곳에서 하고 양쪽이 같은 배열을 받는다.
  // 온라인몰 쿠폰에는 사용기한이 없어 줄이 비고, 그러면 블록 자체가 안 그려진다.
  const dateLines = coupon ? couponDateLines(coupon, locale, t) : [];

  const { faceRef, save, saving, saveError } = useCardImageSave(
    face,
    flipped,
    locale,
    dateLines
  );

  // draw는 마운트 시 1회. 카드를 뒤집는 동작은 연출일 뿐이고 API를 다시 부르지
  // 않는다 — 호출 타이밍과 연출 타이밍을 분리하라는 ROADMAP B 메모대로다.
  // 여기서 옮기면 drawStartedRef가 막아주던 중복 호출 위험이 되살아난다.
  useEffect(() => {
    onSpin();
  }, [onSpin]);

  /**
   * 카드를 쓰는가. **판정은 `resolveCardFace`가 한다** — 여기서 결과 문자열을 다시
   * 나열하면 종류가 늘 때 한쪽만 고쳐져 어긋난다(실제로 `wonOnline`이 그렇게 빠졌다).
   *
   * 카드를 쓰지 않는 결과: `rejected`/`error`(뽑기가 소진되지 않았다 — 뒤집으면
   * 소비한 것처럼 보인다), `wonButHidden`(앞면에 올릴 payload가 없다).
   *
   * 이 값이 1단계의 출구를 가른다: true면 섞기 연출로, false면 곧장 텍스트 분기로.
   */
  const usesCard = face !== null;

  /**
   * 1단계 — 통신 중. 서버 응답을 기다리는 구간이다.
   *
   * **최소 노출 시간을 두지 않는다.** 결과를 아직 모르는 구간이라 늘려봐야
   * 얻을 게 없고, 거절당할 사람을 그만큼 더 붙잡아두는 것뿐이다. 연출의
   * "깜빡임"을 막는 역할은 이제 뒤따르는 3초짜리 2단계가 대신 맡는다.
   */
  const waiting = isDrawing || !drawResult;

  /**
   * 2단계 — 카드 섞기. 쿠폰이 실제로 발급된(usesCard) 뒤에만 재생한다.
   *
   * 타이머를 **마운트가 아니라 `usesCard`가 켜지는 시점에 건다.** 마운트 기준으로
   * 재면 응답이 3초보다 늦게 왔을 때 섞기 시간이 0이 되어 카드가 대뜸 튀어나온다 —
   * 1단계에는 최소 시간이 없으므로 두 구간의 시계는 반드시 분리돼야 한다.
   * usesCard는 응답이 도착할 때 false→true로 딱 한 번 바뀌므로 그 자체가 기점이다.
   *
   * rejected/error/wonButHidden은 usesCard가 false라 이 단계를 통째로 건너뛰고
   * 아래 텍스트 분기로 간다.
   */
  const [shuffleDone, setShuffleDone] = useState(false);

  useEffect(() => {
    if (!usesCard) return;
    const timer = setTimeout(() => setShuffleDone(true), SHUFFLE_MS);
    return () => clearTimeout(timer);
  }, [usesCard]);

  const shuffling = usesCard && !shuffleDone;

  // 카드는 usesCard && !shuffling일 때만 렌더되고, usesCard가 이미 drawResult
  // 존재를 포함한다 — 즉 카드가 보이는 시점은 언제나 뒤집을 수 있는 시점이다.
  // 그래도 조건을 남겨두는 이유는 GatchaCard가 canFlip=false일 때 커서·스케일
  // 피드백을 죽이기 때문이다. 렌더 조건이 나중에 느슨해져도 "못 누르는 카드"가
  // 눌리는 것처럼 보이지는 않는다.
  const canFlip = !isDrawing && usesCard;

  /**
   * 하단 버튼을 '내 쿠폰 보기 + →'로 바꾸는 두 경우.
   *
   * `rejected` + 보관함에 쿠폰 있음: 오늘 뽑기를 이미 쓴 사람이라 받은 쿠폰이
   * 보관함에 있다(2026-08-14, 이란토).
   *
   * **`wonOnline`이 여기 있었는데 뺐다**(2026-08-21). 그때는 온라인몰 쿠폰을 카드로
   * 못 그려서 앨범으로 보내는 것이 유일한 안내였다. 이제 코드가 카드 앞면에 올라가므로
   * 저장 버튼 쪽 분기를 타야 한다 — 두 버튼 스킴이 같은 자리를 다투면 저장 게이트가
   * 무력화된다.
   *
   * **결과가 확정된 뒤에만 띄워야 한다** — `drawResult`가 도착하기 전에도
   * `hasCoupons`는 이미 true일 수 있어(이전 화면에서 읽어둔 목록) 응답을 기다리는
   * 동안 이 버튼이 잠깐 스쳐 지나간다. 예전에는 여기에 `!waiting`을 걸어 막았는데,
   * 지금은 대기 구간이 아래에서 통째로 조기 반환되므로 그 조건이 필요 없다.
   */
  const showMyCouponsAction = drawResult?.status === "rejected" && hasCoupons;

  /*
   * 대기(1단계)·섞기(2단계) 동안은 **로딩 창만** 보여주고 패널은 아예 그리지 않는다.
   *
   * 예전에는 카드 뒷면을 미리 띄웠다가, 응답 전에도 카드가 나와 있어 "눌러도 안
   * 뒤집히는 카드"가 됐다(2026-08-11, 이란토). 그래서 로딩 창으로 바꿨는데 **패널은
   * 그대로 두고 그 위에 얹기만 해서**, '불러오는 중' 창 뒤로 아직 결과가 없는
   * "행운의 카드" 화면이 비쳐 보였다(2026-08-17 제보).
   *
   * `GatchaLoading`은 화면 전체를 덮지만 배경을 칠하지 않는다 — 시간대 배경이
   * 비쳐야 하기 때문이다(그쪽 주석). **스크림을 까는 방식으로 고치지 말 것**:
   * 그러면 시간대 배경까지 함께 덮인다. 아래를 안 그리는 것이 유일한 해법이다.
   *
   * **조기 반환이지 언마운트가 아니다.** `<WheelScreen>` 자체를 부모에서 조건부로
   * 빼면 draw를 부르는 마운트 이펙트가 다시 돌고 `drawStartedRef`에 걸려 뽑기가
   * 조용히 죽는다. 훅은 전부 이 위에서 부르므로 여기서 갈라도 안전하다.
   *
   * 두 단계가 같은 컴포넌트를 쓰는 이유는 창 껍데기를 공유해 전환에서 창이 튀지
   * 않게 하려는 것이다 — `GatchaLoading`의 주석 참고.
   */
  if (grantedNoticeOpen || waiting || shuffling) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh text-ink p-6 pb-[var(--footer-space)]">
        {/* 설문 보상 안내가 떠 있는 동안에는 로딩 창도 그리지 않는다 — 그 팝업이
            그 순간의 주인공이고, 뒤에 무엇이든 비치면 "두 개가 겹쳐 뜬다"는
            그 증상 그대로다. 팝업을 닫으면 이 조건이 풀리면서 아직 응답 전이면
            로딩 창이, 끝났으면 카드가 이어서 나온다. */}
        {!grantedNoticeOpen && <GatchaLoading variant={waiting ? "waiting" : "shuffle"} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh text-ink p-6 pb-[var(--footer-space)]">
      <PixelPanel size="card" title={t("window.brand")} className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-extrabold mb-6 text-ink">{t("wheel.title")}</h1>

        {/* 주의: 카드 앞면(card-front.webp) 안쪽 색이 패널 배경(--surface)과 가깝다.
            지금은 앞면 테두리 덕에 형체가 유지되지만, 배경을 더 밝게 바꾸면 카드가
            묻힌다. 이 화면은 뽑기 연출용으로 따로 꾸밀 예정이라 그때 같이 볼 것. */}
        {usesCard && (
          <div className="mb-6 w-full">
            <GatchaCard
              face={face}
              flipped={flipped}
              canFlip={canFlip}
              /* 한 번 뒤집은 뒤에도 다시 눌러 앞뒤를 오갈 수 있다(2026-08-11, 이란토).
                 저장 기능은 영향을 받지 않는다 — useCardImageSave는 flipped가 true가
                 되는 시점에 이미지를 구워 ref에 들고 있으므로, 뒷면으로 돌려놔도
                 저장할 것은 남아 있다. */
              onFlip={() => setFlipped((v) => !v)}
              faceRef={faceRef}
              dateLines={dateLines}
            />
          </div>
        )}

        {drawResult?.status === "wonButHidden" && (
          <div className="mb-8">
            <p className="font-extrabold mb-2 text-ink">{t("wheel.wonTitle")}</p>
            <p className="text-muted text-sm">{t("coupon.issuedButHidden")}</p>
          </div>
        )}

        {/* 거절. **보관함에 쿠폰이 있으면 그쪽으로 안내한다**(2026-08-14, 이란토).
            서버는 사유를 셋으로 보내지만(`LIMIT_EXCEEDED`/`PLAY_LIMIT_EXCEEDED`/
            `SURVEY_REQUIRED`) 화면은 아직 구분하지 않는다 — 사유별 문구는 쿨타임
            조건이 확정된 뒤로 미뤘고, "게임을 한 판 더 하면 됩니다" 류는 두 제한이
            AND라서 오해를 만든다(`gatchaApi.ts` 주석 참고).

            대신 **결과가 아니라 다음 행동을 알려준다.** 거절당한 사람은 대개 오늘
            뽑기를 이미 썼고, 그러면 받은 쿠폰이 보관함에 있다. 기존 문구는
            "잠시 후 다시 시도해주세요"라 하루치를 다 쓴 사람에게 **틀린 안내**였다.

            **쿠폰이 하나도 없으면 기존 문구를 그대로 쓴다.** 그때는 네트워크·DB 등
            원인이 여럿이라 단정할 수 없고, 빈 보관함으로 보내면 "이미 발급된 쿠폰이
            있어요"가 거짓말이 된다. 판정에 쓰는 `hasCoupons`는 `spin()`이 거절
            직후 이미 읽어둔 목록에서 온다(`useCouponFlow`) — 추가 요청이 없다. */}
        {drawResult?.status === "rejected" && (
          <p className="text-muted mb-8 text-sm">
            {hasCoupons ? t("wheel.rejectedHasCoupons") : t("wheel.rejected")}
          </p>
        )}

        {/* 요청이 서버에 닿지 못한 경우다. 발급도 쿨타임 갱신도 일어나지 않았으므로
            나중에 다시 시도하면 된다 — 전용 재시도 버튼 대신 `markPendingDraw()`가
            남긴 표시로 **시작 화면**에 뽑기 진입 버튼을 띄우는 경로를 쓴다.
            오늘의 결과의 '설문하고 쿠폰 받기'를 여기 기대하지 말 것: 그 버튼은
            설문 안내를 거절한 사람에게만 뜬다(page.tsx의 declinedSurvey). */}
        {drawResult?.status === "error" && (
          <p className="text-muted mb-8 text-sm">{t("wheel.error")}</p>
        )}

        {/* **'다음'을 처음부터 띄운다**(2026-08-13, 이란토).
            한때 '이미지로 저장'을 한 번 눌러야 '다음'이 나타났다 — 저장하려던 사람이
            실수로 넘어가면 그 카드를 **다시 볼 수 없었기** 때문이다. 내 쿠폰 앨범이
            생겨 언제든 카드를 다시 열고 저장할 수 있게 되면서 그 근거가 사라졌고,
            나중에 저장하고 싶은 사람의 선택지를 막을 이유도 없어졌다.

            대신 **유실 주의문을 함께 띄운다.** participant_id는 로그인이 아닌 느슨한
            식별자라 기기를 바꾸거나 브라우저 데이터를 지우면 쿠폰을 되찾을 수 없다 —
            "앨범에서 다시 볼 수 있다"만 알리고 그 조건을 숨기면, 나중에 못 찾는 사람이
            생겼을 때 우리가 알릴 의무를 다하지 않은 셈이 된다.

            꽝이거나 카드가 없는 경우엔 저장할 것이 없으므로 '다음'이 곧바로 전체 폭이다.

            **온라인몰 쿠폰도 여기 걸린다**(2026-08-21). 그쪽 카드에는 QR 대신 평문
            코드가 찍혀 있어 이미지로 남겨둘 값어치가 매장 쿠폰과 같다 — 오히려
            코드는 눈으로 옮겨 적어야 하는 물건이라 사본이 더 쓸모 있다. */}
        {flipped && face && face.kind !== "miss" ? (
          <div className="flex flex-col items-center gap-2 w-full">
            {/* w-full이 있어야 이 행의 w-full이 기준을 갖는다 — items-center 아래에서
                바깥 래퍼가 shrink-to-fit이 되면 버튼이 내용물 폭으로 쪼그라든다. */}
            <div className="flex w-full gap-2">
              <button
                onClick={() => save()}
                disabled={saving}
                className="pixel-mask-btn-solid flex-1 py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
              >
                {saving ? t("card.saving") : t("card.saveButton")}
              </button>
              <button
                onClick={onNext}
                aria-label={t("wheel.nextButton")}
                className="pixel-mask-btn-solid py-3 px-5 bg-surface text-ink font-bold transition-opacity active:scale-95"
              >
                <span aria-hidden="true">→</span>
              </button>
            </div>
            {saveError && <p className="text-error text-xs">{t("card.saveError")}</p>}
            <p className="text-muted text-xs text-center leading-snug">
              {t("card.saveRecommendNotice")}
            </p>
          </div>
        ) : showMyCouponsAction ? (
          /* 거절 + 보관함에 쿠폰이 있는 경우. 주 행동이 '내 쿠폰 보기'이므로 저장
             케이스와 **같은 모양**을 쓴다 — 넓은 주 버튼 + 화살표 '다음'.
             여기서 '다음'을 막지 않는다: 뽑기가 성립하지 않아 열어볼 카드가 없으므로
             (그 disabled는 카드를 안 보고 넘어가는 것을 막는 장치다) 보관함을 들르지
             않고 흐름을 계속할 수 있어야 한다. */
          <div className="flex w-full gap-2">
            <button
              onClick={onOpenMyCoupons}
              className="pixel-mask-btn-solid flex-1 py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95"
            >
              {t("coupon.myCouponsButton")}
            </button>
            <button
              onClick={onNext}
              aria-label={t("wheel.nextButton")}
              className="pixel-mask-btn-solid py-3 px-5 bg-surface text-ink font-bold transition-opacity active:scale-95"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : (
          /* 카드가 있는데 아직 안 뒤집었으면 '다음'을 막는다. 열어보지도 않고
             넘어가면 뽑기를 한 기억이 남지 않는다.
             섞기(2단계)는 따로 볼 필요가 없다 — 그 구간은 usesCard가 true이면서
             아직 flipped가 아니므로 뒤 조건에 이미 걸린다. */
          <button
            onClick={onNext}
            /* `waiting`은 위에서 조기 반환하므로 여기서 볼 필요가 없다. */
            disabled={usesCard && !flipped}
            className="pixel-mask-btn-solid w-full py-3 px-6 bg-accent text-accent-ink font-bold transition-opacity active:scale-95 disabled:opacity-50"
          >
            {t("wheel.nextButton")}
          </button>
        )}

        {/* 쿠폰 이용안내. **당첨 카드를 연 뒤에만 띄운다** — 아직 결과를 모르거나
            꽝인 사람에게는 안내할 쿠폰이 없다. 사용기한·1회 사용 같은 조건을 받은
            그 자리에서 알 수 있어야 하므로 시작 화면의 약관 창과 따로 둔다
            (2026-08-14, 이란토). */}
        {/* 매장 쿠폰 전용이다 — 안내 내용이 사용기한·QR 제시·1회 사용이라
            온라인몰 코드에는 해당하지 않는다. */}
        {flipped && coupon && (
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="mt-3 w-full text-xs text-muted underline underline-offset-2"
          >
            {t("couponGuide.openButton")}
          </button>
        )}
      </PixelPanel>

      {showGuide && <CouponGuideNotice onClose={() => setShowGuide(false)} />}
    </div>
  );
}
