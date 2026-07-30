import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "달빛수원 - 수원화성의 밤을 걷는 가장 로맨틱한 방법",
  description: "세계문화유산 수원화성의 시간을 초월한 아름다움을 야경과 함께 산책 코스로 즐기세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${manrope.variable} dark`}>
      <head>
        {/* Material Symbols Outlined for Stitch Icons */}
        <link 
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block" 
          rel="stylesheet" 
        />
      </head>
      <body className="antialiased min-h-screen bg-[#0b1326] text-[#dae2fd]">
        {children}
      </body>
    </html>
  );
}

