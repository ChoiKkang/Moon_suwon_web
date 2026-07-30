'use client';

import { useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { LoginModal } from '@/components/auth/login-modal';
import { signOut } from '@/app/actions/auth';
import { Moon, Menu, Sparkles, Heart, Camera, Utensils, LogOut, LayoutDashboard, ShieldAlert, UserCog, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { ImportedPlace } from '@/lib/places/types';

interface LandingClientProps {
  initialUser: User | null;
  importedPlaces: ImportedPlace[];
  placesError: string | null;
  hasAuthError: boolean;
  hasAccountDeleted: boolean;
}

export function LandingClient({
  initialUser,
  importedPlaces,
  placesError,
  hasAuthError,
  hasAccountDeleted,
}: LandingClientProps) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="bg-[#0b1326] text-[#dae2fd] font-sans overflow-x-hidden min-h-screen flex flex-col selection:bg-yellow-500/20 selection:text-yellow-200">
      {/* OAuth 콜백 실패 알림. /auth/callback이 auth-error 파라미터를 붙여 되돌린다. */}
      {hasAuthError && (
        <div
          role="alert"
          className="fixed top-20 inset-x-0 z-[60] mx-auto w-[min(92%,32rem)] flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-950/90 px-4 py-3 text-sm text-red-200 shadow-lg backdrop-blur-md"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.</span>
        </div>
      )}

      {/* 회원 탈퇴 완료 알림 */}
      {hasAccountDeleted && (
        <div
          role="status"
          className="fixed top-20 inset-x-0 z-[60] mx-auto w-[min(92%,32rem)] flex items-start gap-3 rounded-xl border border-[#ffd700]/40 bg-[#171f33]/95 px-4 py-3 text-sm text-[#fff6df] shadow-lg backdrop-blur-md"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#ffd700]" aria-hidden="true" />
          <span>계정이 삭제되었습니다. 이용해 주셔서 감사합니다.</span>
        </div>
      )}

      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-[#0b1326]/80 backdrop-blur-xl border-b border-[#4d4732]/20 shadow-sm">
        <div className="flex justify-between items-center w-full px-6 md:px-20 py-4 max-w-[1440px] mx-auto">
          <div className="flex items-center gap-2">
            <Moon className="text-[#fff6df] fill-[#ffd700] w-6 h-6 animate-pulse" />
            <span className="text-lg font-extrabold text-[#fff6df] tracking-tight">달빛수원</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <Link className="text-[#d0c6ab] hover:text-[#fff6df] transition-colors duration-300 text-sm font-semibold tracking-wider" href="/courses">문화유산 코스</Link>
            <a className="text-[#d0c6ab] hover:text-[#fff6df] transition-colors duration-300 text-sm font-semibold tracking-wider" href="#kto-spots">달빛 스팟</a>
            <a className="text-[#d0c6ab] hover:text-[#fff6df] transition-colors duration-300 text-sm font-semibold tracking-wider" href="#heritage-story">수원 소개</a>
            <Link className="text-[#d0c6ab] hover:text-[#fff6df] transition-colors duration-300 text-sm font-semibold tracking-wider" href="/admin">운영 콘솔</Link>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {initialUser ? (
              <>
                <Link 
                  href="/admin" 
                  className="flex items-center gap-2 px-5 py-2 bg-[#171f33] border border-[#3e495d] text-white text-xs font-bold rounded-full hover:bg-[#222a3d] transition-all"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 text-[#ffd700]" />
                  <span>관리자 콘솔</span>
                </Link>
                <Link
                  href="/account"
                  className="flex items-center gap-2 px-5 py-2 bg-[#171f33] border border-[#3e495d] text-white text-xs font-bold rounded-full hover:bg-[#222a3d] transition-all"
                >
                  <UserCog className="w-3.5 h-3.5 text-[#ffd700]" />
                  <span>계정 설정</span>
                </Link>
                <button 
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-5 py-2 bg-red-950/20 border border-red-500/30 text-red-400 text-xs font-bold rounded-full hover:bg-red-950/40 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>로그아웃</span>
                </button>
              </>
            ) : (
              <button 
                onClick={() => setIsLoginModalOpen(true)}
                className="px-6 py-2.5 bg-[#ffd700] text-[#3a3000] font-bold text-sm rounded-full active:scale-95 transition-transform hover:bg-[#ffe16d]"
              >
                시작하기 (로그인)
              </button>
            )}
          </div>

          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden text-[#fff6df]"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-[#4d4732]/20 bg-[#0b1326] px-6 py-4 flex flex-col gap-4">
            <Link className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="/courses">문화유산 코스</Link>
            <a className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="#kto-spots">달빛 스팟</a>
            <a className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="#heritage-story">수원 소개</a>
            <Link className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="/admin">운영 콘솔</Link>
            <div className="h-px bg-[#4d4732]/10 my-1" />
            {initialUser ? (
              <div className="flex flex-col gap-2">
                <Link 
                  href="/admin"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 bg-[#171f33] text-white text-sm font-bold rounded-xl border border-[#3e495d]"
                >
                  관리자 콘솔
                </Link>
                <Link
                  href="/account"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 bg-[#171f33] text-white text-sm font-bold rounded-xl border border-[#3e495d]"
                >
                  계정 설정
                </Link>
                <button 
                  onClick={() => {
                    handleSignOut();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-center py-2.5 bg-red-950/20 text-red-400 text-sm font-bold rounded-xl border border-red-500/30"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setIsLoginModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full py-2.5 bg-[#ffd700] text-[#3a3000] font-bold text-sm rounded-xl"
              >
                시작하기 (로그인)
              </button>
            )}
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center pt-24 overflow-hidden">
          {/* Background Image Overlay */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-[#0b1326]/60 via-[#0b1326]/40 to-[#0b1326] z-10" />
            <img 
              alt="수원화성 야경" 
              className="w-full h-full object-cover" 
              src="/assets/AB6AXuAr2IWAb3hzIl4dB_UZ2hG1Fn3eVdPeJIAbvjMOFhxYoHoLogK3j5yXR7zW4X_qGufXYUV5wxbPOuXtWwJypmvLm66Gou28-e280c9c2a3b763e510ae172b5c07fc4f"
            />
          </div>

          <div className="relative z-20 container mx-auto px-6 md:px-20 max-w-[1440px] flex flex-col items-center text-center gap-8 mt-12 md:mt-0">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#ffd700]/30 bg-[#171f33]/50 backdrop-blur-sm mb-4">
              <Sparkles className="text-[#ffd700] w-4 h-4" />
              <span className="text-xs font-bold text-[#ffd700] tracking-widest uppercase">달빛 문화유산 발견하기</span>
            </div>
            
            <h1 className="text-4xl md:text-7xl font-extrabold max-w-4xl text-[#fff6df] leading-tight tracking-tight">
              수원화성의 밤을 걷는 가장 <br />
              <span className="bg-gradient-to-r from-[#ffd700] to-[#fff6df] bg-clip-text text-transparent">로맨틱한 방법</span>
            </h1>
            
            <p className="text-base md:text-lg text-[#d0c6ab] max-w-2xl leading-relaxed">
              세계문화유산 수원화성의 시간을 초월한 아름다움을 경험하세요. 달빛수원 앱을 다운로드하여 큐레이션된 산책 코스, 역사적 통찰, 그리고 특별한 야간 이벤트를 만나보세요.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full justify-center max-w-md">
              <Link href="/courses" className="flex items-center justify-center gap-3 px-8 py-4 bg-[#ffd700] text-[#3a3000] rounded-xl font-bold hover:bg-[#ffe16d] transition-colors w-full sm:w-auto shadow-lg shadow-yellow-500/10">
                <span>코스 둘러보기</span>
              </Link>
              <a href="#kto-spots" className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-900/40 border border-[#ffd700] text-[#ffd700] rounded-xl font-bold hover:bg-slate-900/60 transition-colors w-full sm:w-auto backdrop-blur-md">
                <span>달빛 스팟 보기</span>
              </a>
            </div>
          </div>
        </section>

        {/* Features Section (Bento Grid) */}
        <section className="py-24 relative bg-[#0b1326]">
          <div className="container mx-auto px-6 md:px-20 max-w-[1440px]">
            <div className="mb-16 md:w-2/3">
              <span className="text-[#ffd700] text-xs font-bold uppercase tracking-widest">추천 코스 3종</span>
              <h2 className="text-3xl md:text-5xl font-extrabold text-[#fff6df] mt-2 mb-4">큐레이션된 달빛 코스</h2>
              <p className="text-sm md:text-base text-[#d0c6ab] leading-relaxed">모든 상황에 완벽하게 어울리는, 가장 멋진 야경을 돋보이게 하도록 세심하게 설계된 길입니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Feature 1: Initial Date Course */}
              <div className="md:col-span-8 rounded-2xl overflow-hidden group relative min-h-[400px] flex flex-col justify-end p-8 border border-zinc-800/40 shadow-lg">
                <div className="absolute inset-0 z-0">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/90 to-transparent z-10 transition-opacity duration-300 group-hover:opacity-80" />
                  <img 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                    src="/assets/AB6AXuBczVTWJcMrUmxjSnFwyPhL88YDoWdrVPbVpVdfgEnKOz0d8GXJTBJolR-0M3HJOKmEJR3ZK8jRdVPs3zyTLLCp8xfI0Xtf-f22f3b68a1569960dfaa9253754a3d9f" 
                    alt="첫 데이트 코스"
                  />
                </div>
                <div className="relative z-20">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#171f33]/80 backdrop-blur-md border border-[#ffd700]/20 mb-6">
                    <Heart className="text-[#ffd700] w-5 h-5 fill-current" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">첫 데이트 코스</h3>
                  <p className="text-sm text-[#d0c6ab] max-w-lg mb-6 leading-relaxed">연무대에서 시작하는 완벽한 페이스의 40분 산책로. 완만한 경사와 아름답게 빛나는 성벽의 파노라마 뷰를 제공합니다.</p>
                  <button className="text-[#ffd700] font-bold text-xs flex items-center gap-2 hover:gap-3 transition-all">
                    <span>코스 상세 보기</span>
                    <span>→</span>
                  </button>
                </div>
              </div>

              {/* Feature 2: Photo Focus Course */}
              <div className="md:col-span-4 rounded-2xl overflow-hidden group relative min-h-[400px] flex flex-col justify-end p-8 border border-[#3e495d]/30 bg-slate-900/40 backdrop-blur-md shadow-lg">
                <div className="absolute inset-0 z-0 opacity-20">
                  <img 
                    className="w-full h-full object-cover" 
                    src="/assets/AB6AXuArki5EazvMuh3FMKJz6QaOgE_v2aGSMHVLA5ENA85zESuwsFnt_60eH9zl4IaZR3nUp29Li14_WV3H3-D6lMAnvT0M9D2B-ac29e5fbd9b8492e973e7e48a505553e" 
                    alt="포토 포커스 코스"
                  />
                </div>
                <div className="relative z-20">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#171f33]/80 backdrop-blur-md border border-[#ffd700]/20 mb-6">
                    <Camera className="text-[#ffd700] w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">포토 포커스 코스</h3>
                  <p className="text-sm text-[#d0c6ab] leading-relaxed mb-6">숨겨진 사진 명소를 발견하세요. 성곽의 야경을 담을 수 있는 최고의 뷰포인트 5곳으로 안내합니다.</p>
                  <button className="text-[#ffd700] font-bold text-xs flex items-center gap-2 hover:gap-3 transition-all">
                    <span>코스 상세 보기</span>
                    <span>→</span>
                  </button>
                </div>
              </div>

              {/* Feature 3: Haengnidan-gil Finish */}
              <div className="md:col-span-12 rounded-2xl overflow-hidden group relative min-h-[300px] bg-[#171f33] border border-[#3e495d]/20 flex flex-col md:flex-row items-center shadow-lg">
                <div className="p-8 md:p-12 md:w-1/2 flex flex-col justify-center h-full">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 mb-6">
                    <Utensils className="text-[#ffd700] w-5 h-5" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">행리단길 피니시 코스</h3>
                  <p className="text-sm text-[#d0c6ab] mb-6 leading-relaxed">수원의 가장 트렌디한 카페 거리로 자연스럽게 이동하며 역사적인 산책을 마무리하세요. 아름답게 복원된 현대식 한옥에서 크래프트 커피나 전통 차를 즐겨보세요.</p>
                  <div className="flex gap-4">
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#d0c6ab] bg-[#222a3d] px-3.5 py-1.5 rounded-full">
                      <span>1.5 시간</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#d0c6ab] bg-[#222a3d] px-3.5 py-1.5 rounded-full">
                      <span>2.3 km</span>
                    </span>
                  </div>
                </div>
                <div className="h-64 md:h-full w-full md:w-1/2 relative">
                  <img 
                    className="w-full h-full object-cover" 
                    src="/assets/AB6AXuCGLJWMMr2AsVQd0QPeSVCC1WKMV2qi0HNcHOcp-G3XoOdJzj_yASXA9gcQTjdnMc_1FmV9Kf4-mRMHEL54a8m1YIDpfV1U-698a694e1defc0602f5b7038f7c5871e" 
                    alt="행리단길 피니시"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="kto-spots" className="py-24 bg-[#10182b] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,215,0,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(103,140,255,0.14),transparent_36%)]" />
          <div className="relative container mx-auto px-6 md:px-20 max-w-[1440px]">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
              <div className="max-w-2xl">
                <span className="text-[#ffd700] text-xs font-bold uppercase tracking-widest">관광콘텐츠랩 연동</span>
                <h2 className="text-3xl md:text-5xl font-extrabold text-[#fff6df] mt-2 mb-4">
                  공공데이터로 검증한 달빛 스팟
                </h2>
                <p className="text-sm md:text-base text-[#d0c6ab] leading-relaxed">
                  TourAPI에서 받은 장소명, 좌표, 이미지와 달빛수원 운영 문구를 결합해 실제 코스 데이터로 확장합니다.
                </p>
              </div>
              <div className="rounded-full border border-[#ffd700]/20 bg-[#0b1326]/70 px-5 py-2 text-xs font-bold text-[#ffd700]">
                {importedPlaces.length > 0 ? `${importedPlaces.length}개 스팟 연동됨` : '연동 확인 필요'}
              </div>
            </div>

            {placesError ? (
              <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-8 text-sm text-amber-100">
                Supabase 공개 스팟 데이터를 불러오지 못했습니다. 운영 콘솔에서 연동 상태를 확인하세요.
              </div>
            ) : importedPlaces.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
                {importedPlaces.map((place) => (
                  <article
                    key={place.slug}
                    className="group rounded-3xl overflow-hidden border border-[#3e495d]/30 bg-[#171f33]/90 shadow-xl"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-[#0b1326]">
                      {place.heroImageUrl ? (
                        <div
                          role="img"
                          aria-label={place.displayName}
                          className="h-full w-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                          style={{ backgroundImage: `url(${place.heroImageUrl})` }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-[#d0c6ab]">
                          이미지 준비 중
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/85 via-transparent to-transparent" />
                      {place.ktoContentId ? (
                        <div className="absolute left-4 top-4 rounded-full bg-[#ffd700] px-3 py-1 text-[10px] font-black text-[#3a3000]">
                          KTO {place.ktoContentId}
                        </div>
                      ) : null}
                    </div>
                    <div className="p-5">
                      <h3 className="text-lg font-extrabold text-white mb-2">{place.displayName}</h3>
                      <p className="text-xs text-[#d0c6ab] leading-relaxed line-clamp-3">
                        {place.shortDescription ?? place.addressFull ?? '운영 문구 준비 중'}
                      </p>
                      <Link
                        href={`/places/${place.slug}`}
                        className="mt-4 inline-flex text-xs font-black text-[#ffd700] hover:text-[#ffe16d]"
                      >
                        상세 보기
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/70 p-8 text-sm text-[#d0c6ab]">
                아직 공개 가능한 KTO 스팟이 없습니다. 수집 스크립트와 적재 상태를 확인하세요.
              </div>
            )}
          </div>
        </section>

        {/* App Showcase & SEO Section */}
        <section id="heritage-story" className="py-24 bg-[#131b2e] relative overflow-hidden">
          <div className="container mx-auto px-6 md:px-20 max-w-[1440px]">
            <div className="flex flex-col md:flex-row items-center gap-16">
              {/* App Mockup */}
              <div className="w-full md:w-1/2 flex justify-center relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-[#ffd700]/10 blur-[100px] rounded-full" />
                <div className="relative w-[300px] h-[600px] bg-[#0b1326] border-8 border-[#2d3449] rounded-[40px] shadow-2xl overflow-hidden z-10">
                  <div className="absolute top-0 inset-x-0 h-6 bg-[#2d3449] rounded-b-2xl w-40 mx-auto z-20" />
                  <div className="w-full h-full bg-slate-950">
                    <img 
                      alt="달빛수원 앱 화면" 
                      className="w-full h-full object-cover" 
                      src="/assets/AB6AXuDO7PfXKUckL45tgjSDE65w2LHvcoN6ooDWGQ0K7o1VAkbfcZoPK77GtyQF6a0aVM-QEunw-3i6OlXLUQGADQnqCRVyn-Ao-b6c661e9eafb24fd55b06949a26cb564"
                    />
                  </div>
                </div>
              </div>

              {/* Story & Analytics */}
              <div className="w-full md:w-1/2 flex flex-col justify-center">
                <span className="text-[#ffd700] text-xs font-bold tracking-widest uppercase mb-4">우리의 유산</span>
                <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
                  달빛과 함께하는 <br />
                  <span className="bg-gradient-to-r from-[#ffd700] to-[#fff6df] bg-clip-text text-transparent">시간을 초월한 여정</span>
                </h2>
                <div className="space-y-6 text-sm md:text-base text-[#d0c6ab] leading-relaxed">
                  <p>
                    유네스코 세계문화유산인 수원화성은 18세기 군사 건축과 효심의 정점을 보여줍니다. 조선 정조가 세운 이 성곽은 단순한 방어 구조물을 넘어 역사와 문화, 그리고 영원한 사랑을 기념하는 기념비입니다.
                  </p>
                  <p>
                    낮에도 웅장하지만, 밤이 되면 성곽은 그 감성적인 깊이를 진정으로 드러냅니다. <strong>달빛수원</strong> 경험은 부드러운 황금빛 조명으로 물든 이 역사적인 성벽을 안내하기 위해 만들어졌습니다. 현대 도시의 소음이 사라지고 역사와 나란히 걸을 수 있는 고요하고 신비로운 환경입니다.
                  </p>
                  <p>
                    우리의 모바일 앱은 이 밤의 원더랜드로 안내하는 개인 가이드 역할을 합니다. 큐레이션된 오디오 투어, 인터랙티브 지도, 실시간 이벤트 업데이트를 통해 전통과 현대적 편리함이 어우러진 잊을 수 없는 달빛 산책을 보장합니다.
                  </p>
                </div>

                <div className="mt-12 flex items-center gap-6">
                  <div>
                    <p className="text-2xl md:text-3xl font-extrabold text-[#ffd700] mb-1">50k+</p>
                    <p className="text-xs text-[#d0c6ab]">월간 방문자</p>
                  </div>
                  <div className="w-px h-12 bg-[#3e495d]/30" />
                  <div>
                    <p className="text-2xl md:text-3xl font-extrabold text-[#ffd700] mb-1">4.9/5</p>
                    <p className="text-xs text-[#d0c6ab]">앱스토어 평점</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#060e20] border-t border-[#3e495d]/10">
        <div className="w-full px-6 md:px-20 py-12 flex flex-col items-center gap-6 max-w-[1440px] mx-auto">
          <div className="text-lg font-extrabold text-[#ffd700]">달빛수원</div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8 text-xs">
            <Link className="text-[#d0c6ab] hover:text-[#ffd700] underline transition-colors" href="/courses">코스 보기</Link>
            <a className="text-[#d0c6ab] hover:text-[#ffd700] underline transition-colors" href="#kto-spots">달빛 스팟</a>
            <a className="text-[#d0c6ab] hover:text-[#ffd700] underline transition-colors" href="https://www.cha.go.kr" target="_blank" rel="noreferrer">문화재 포털</a>
            <Link className="text-[#d0c6ab] hover:text-[#ffd700] underline transition-colors" href="/admin">운영 콘솔</Link>
          </div>
          <div className="text-center mt-4 text-xs text-zinc-500">
            © 2024 달빛수원. 수원화성의 달빛 문화유산을 보존합니다.
          </div>
        </div>
      </footer>

      {/* Social Login Modal */}
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
      />
    </div>
  );
}
