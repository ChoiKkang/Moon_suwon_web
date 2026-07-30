'use client';

import { X } from 'lucide-react';
import { SocialLoginButtons } from './social-login-buttons';
import Link from 'next/link';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b1326] p-6 shadow-2xl z-10 transition-all">
        {/* Ambient glow decoration */}
        <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-[radial-gradient(circle,rgba(255,246,223,0.15)_0%,rgba(11,19,38,0)_70%)] blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-white mb-2">
            달빛수원 시작하기
          </h2>
          <p className="text-sm text-zinc-400">
            소셜 계정으로 로그인하여 소중한 찜 목록과 코스 완주 기록을 웹과 모바일에서 함께 관리하세요.
          </p>
        </div>

        {/* OAuth Buttons */}
        <SocialLoginButtons onSuccess={onClose} />

        {/* Policy Footer */}
        <p className="text-center text-xs text-zinc-500 mt-6 leading-relaxed">
          로그인 시 달빛수원의{' '}
          <Link href="/terms" className="underline hover:text-zinc-300">이용약관</Link> 및{' '}
          <Link href="/privacy" className="underline hover:text-zinc-300">개인정보처리방침</Link>에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
}
