"use client";

import { useState } from "react";

/**
 * 제작진 크레딧. 첫 화면 우상단의 작은 버튼으로만 들어온다.
 *
 * **이 화면만 한국어 하드코딩이다**(2026-08-20, 이란토 요청). 사람 이름과 상호는
 * 번역 대상이 아니고, 로케일 사전에 넣으면 같은 값을 4개 파일에 복사하게 된다 —
 * 푸터의 '(주)웨이브앤바이브'를 사전에서 뺀 것과 같은 근거다(AGENTS.md 연출 글자 절).
 *
 * 창(PixelPanel)이 아니라 화면 전체를 덮는 dimming이다. 엔딩 크레딧에 창틀이 끼면
 * 오히려 "설정 창"처럼 보인다.
 */
interface CreditsScreenProps {
  onClose: () => void;
}

/** 페이드 길이. 언마운트를 이만큼 미뤄야 나가는 연출이 보인다. */
const FADE_MS = 500;

const ROLES = [
  { part: "서버/데이터베이스", title: "개발자", name: "구자건 팀장" },
  { part: "기획/총괄", title: "프로젝트 매니저", name: "오혜진" },
  { part: "클라이언트/디자인", title: "개발자", name: "함이로" },
];

export default function CreditsScreen({ onClose }: CreditsScreenProps) {
  // 페이드는 양쪽 다 CSS 애니메이션이고(globals.css 주석 참고), state는 어느
  // 클래스를 붙일지와 언마운트 시점만 정한다.
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, FADE_MS);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="제작진"
      /* 스크롤은 이 요소가 들고 있다. 안쪽에 max-height를 주면 dimming만 화면을 덮고
         글자는 좁은 창 안에서 구르는 꼴이 된다. */
      className={`${
        closing ? "credits-fade-out" : "credits-fade-in"
      } fixed inset-0 z-[70] overflow-y-auto bg-[#111111]/80 backdrop-blur-sm text-white text-center`}
    >
      {/* 닫기는 진입 버튼과 같은 자리(우상단)에 둔다. **`fixed`를 쓰면 안 된다** —
          이 오버레이가 `backdrop-blur`를 들고 있어서 자손 fixed의 기준이 뷰포트가
          아니라 **스크롤되는 이 요소**가 된다(filter류가 containing block을 만든다).
          그러면 내려갈수록 ✕가 위로 사라지는데, 크레딧은 세로로 길고 다른 탈출구가
          없다. `sticky`는 그 영향을 받지 않는다. `h-0`은 흐름에서 자리를 빼는 몫. */}
      <div className="sticky top-2 z-10 flex h-0 justify-end pr-2">
        <button
          type="button"
          onClick={handleClose}
          aria-label="크레딧 닫기"
          className="w-9 h-9 flex items-center justify-center text-xl text-white"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col items-center gap-[34px] px-6 py-16">
        {/* next/image를 쓰지 않는다 — 고정 크기 장식 그래픽이라 최적화할 것이 없다
            (HintClipboard와 같은 판단). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/credits/gookbap_filled.webp" alt="" className="sticker-outline w-40 max-w-full" />

        <h1 className="text-3xl font-bold break-keep" style={{ fontFamily: "var(--font-pixel)" }}>
          프로젝트 완뚝
        </h1>
        {/* 세 사람을 가로로 늘어놓는다(2026-08-20, 이란토). 좁은 화면에서 넘치면
            `flex-wrap`이 줄을 나눈다 — 고정 줄바꿈(`<br>`)으로 되돌리지 말 것. */}
        <p className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
          <span>구자건</span>
          <span>오혜진</span>
          <span>함이로</span>
        </p>

        {/* 명단 위아래를 가르는 선. 장식이라 스크린리더에서는 숨긴다. */}
        <hr aria-hidden="true" className="w-40 max-w-full border-white/30 mt-6" />

        {ROLES.map((role) => (
          <section key={role.part}>
            <h2 className="text-base font-bold text-amber-300 break-keep">{role.part}</h2>
            <p className="text-sm mt-1">
              <b>{role.title}</b> {role.name}
            </p>
          </section>
        ))}

        <section>
          <h2 className="text-base font-bold text-amber-300">제작 기간</h2>
          <p className="text-sm mt-1">2026.06.29 – 2026.08.20</p>
        </section>

        <hr aria-hidden="true" className="w-40 max-w-full border-white/30 mb-6" />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/credits/gookbap_empty.webp" alt="" className="sticker-outline w-40 max-w-full mt-8" />
        <p className="text-lg font-bold break-keep">“준비된 국밥은 제작진이 맛있게 먹었습니다”</p>

        {/* 첫 화면 푸터와 같은 표기. 상호는 회사 문서 표기를 따른다. */}
        <p className="text-[0.65rem] mt-4">Copyright © 2026 (주)웨이브앤바이브</p>
      </div>
    </div>
  );
}
