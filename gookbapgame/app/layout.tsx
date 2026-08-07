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
