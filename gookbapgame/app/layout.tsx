import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { LocaleProvider } from "./lib/i18n/LocaleContext";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const galmuri = localFont({
  src: "../public/fonts/Galmuri11.woff2",
  variable: "--font-galmuri",
  display: "swap",
});

/**
 * 흑백 이모지. 시스템 이모지는 대부분 컬러라 픽셀 아트 + 어두운 우드톤 화면에서
 * 튀고, 기기마다 모양도 다르다(아이폰은 Apple, 안드로이드는 Noto).
 *
 * 원본 1.98MB 가변 폰트를 wght=400으로 고정하고 실제 쓰는 14자만 남겨 4.7KB다.
 * **이모지를 새로 쓰면 서브셋에 없어서 두부(􏿽)로 보인다** — `app/lib/couponEmoji.ts`에
 * 이모지를 추가하면 폰트도 다시 만들어야 한다(방법은 docs/fonts.md).
 */
const notoEmoji = localFont({
  src: "../public/fonts/NotoEmoji-subset.woff2",
  variable: "--font-emoji",
  display: "swap",
});

export const metadata: Metadata = {
  title: "다른그림찾기 - 국밥",
  description: "국밥 한 상차림 다른그림찾기 게임",
  other: {
    /**
     * Darkreader 등 강제 다크모드 확장을 페이지 전체에서 끈다.
     *
     * 이 게임은 90s 데스크톱을 흉내낸 **밝은** 테마다. 회색 크롬과 흰 문서 영역,
     * 2색 베벨이 디자인의 핵심이라 강제 다크모드가 색을 뒤집으면 컨셉이 통째로
     * 무너진다 — 어두운 테마 시절보다 오히려 이 잠금이 더 중요해졌다
     * (밝은 사이트야말로 확장이 노리는 대상이다).
     *
     * 특히 **카드 앞면을 망가뜨린다** — 앞면은 밝은 픽셀 애셋 위에 어두운 글자를
     * 올리는 구조인데, 확장은 이미지는 그대로 두고 글자색만 뒤집어서 밝은 배경에
     * 밝은 글자가 된다(우드톤 시절 실측: #3A2E24 → #C9C3B8. 색만 바뀌었을 뿐
     * 밝은 면 위 어두운 글자라는 구조는 그대로라 증상도 같다).
     * 상품명·만료일·테두리가 사라진다.
     *
     * 서브트리만 제외하는 방법은 없다. `data-darkreader-ignore` 같은 속성은 실제
     * Darkreader 코드에 존재하지 않고, `color-scheme: only light`도 무시된다 —
     * 4.9.128 실물로 확인했다. 이 meta가 유일하게 동작하는 수단이다.
     *
     * content 값은 Darkreader가 보지 않는다(`meta[name="darkreader-lock"]` 존재만 확인).
     * 그래도 **빈 문자열은 안 된다** — Next가 값 없는 항목을 태그째 버려서 meta가
     * 아예 렌더되지 않는다(실측). 그래서 의미 없는 값이라도 채워 둔다.
     */
    "darkreader-lock": "1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKR.variable} ${galmuri.variable} ${notoEmoji.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
