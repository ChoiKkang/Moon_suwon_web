import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "달빛수원 - 수원화성의 밤을 걷는 가장 로맨틱한 방법",
    template: "%s | 달빛수원",
  },
  description: "세계문화유산 수원화성의 시간을 초월한 아름다움을 야경과 함께 산책 코스로 즐기세요.",
  keywords: ["수원화성", "야간관광", "수원 야경", "화성행궁", "방화수류정", "수원 데이트 코스", "달빛수원"],
  openGraph: {
    title: "달빛수원 - 수원화성의 밤을 걷는 가장 로맨틱한 방법",
    description: "관광 데이터 기반 방문 집중도 예측과 검증된 야경 산책 코스를 제공합니다.",
    url: "/",
    siteName: "달빛수원",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "달빛수원 - 수원화성의 밤을 걷는 가장 로맨틱한 방법",
    description: "세계문화유산 수원화성의 야경 산책 코스 가이드",
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${manrope.variable} dark`}>
      <body className="antialiased min-h-screen bg-[#0b1326] text-[#dae2fd]">
        {children}
      </body>
    </html>
  );
}
