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
      className={`${notoSansKR.variable} ${galmuri.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
