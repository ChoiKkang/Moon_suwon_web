'use client';

import { useState } from 'react';
import Image from 'next/image';
import { type User } from '@supabase/supabase-js';
import { LoginModal } from '@/components/auth/login-modal';
import { signOut } from '@/app/actions/auth';
import { Moon, Menu, Sparkles, LogOut, LayoutDashboard, ShieldAlert, UserCog, CheckCircle2, ArrowRight, Clock, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { ImportedPlace } from '@/lib/places/types';
import type { ServiceCourse } from '@/lib/courses/types';
import type { NowGoodSpot } from '@/lib/crowd/queries';
import type { UpcomingEvent } from '@/lib/events/queries';
import { MediaCard } from '@/components/public/media-card';
import { ScrollRail } from '@/components/public/scroll-rail';
import { SectionHeading } from '@/components/public/section-heading';
import { StatusPill } from '@/components/public/status-pill';

interface LandingClientProps {
  initialUser: User | null;
  initialIsAdmin: boolean;
  importedPlaces: ImportedPlace[];
  placesError: string | null;
  courses: ServiceCourse[];
  coursesError: string | null;
  nowGoodSpots: NowGoodSpot[];
  crowdError: string | null;
  events: UpcomingEvent[];
  eventsError: string | null;
  hasAuthError: boolean;
  hasAdminError: boolean;
  hasAccountDeleted: boolean;
}

export function LandingClient({
  initialUser,
  initialIsAdmin,
  importedPlaces,
  placesError,
  courses,
  coursesError,
  nowGoodSpots,
  crowdError,
  events,
  eventsError,
  hasAuthError,
  hasAdminError,
  hasAccountDeleted,
}: LandingClientProps) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // 예측이 전부 혼잡한 날에도 "여유로운 스팟"이라고 단정하면 화면과 데이터가
  // 어긋난다. 오늘 실제 분포에 맞춰 제목과 설명을 고른다.
  const relaxedSpotCount = nowGoodSpots.filter((spot) => spot.crowdLevel === '여유' || spot.crowdLevel === '보통').length;
  const hasRelaxedSpots = relaxedSpotCount > 0;
  const crowdHeadline = hasRelaxedSpots ? '오늘 더 여유로운 달빛 스팟' : '오늘은 어디나 붐빕니다';
  const crowdDescription = hasRelaxedSpots
    ? '오늘 사람이 덜 몰릴 곳부터 보여드립니다. 한국관광공사가 제공하는 하루 단위 예상치라 지금 현장 인원은 아닙니다.'
    : '오늘은 어느 곳이든 사람이 많을 전망입니다. 그래도 상대적으로 덜 붐빌 순서로 보여드립니다. 하루 단위 예상치라 지금 현장 인원은 아닙니다.';

  const formatEventDate = (startDate: string, endDate: string) => {
    const format = (value: string) => value.replace(/-/g, '.');
    return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
  };

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

      {/* 로그인은 정상이나 관리자 권한이 없을 때의 안내 */}
      {hasAdminError && (
        <div
          role="alert"
          className="fixed top-20 inset-x-0 z-[60] mx-auto w-[min(92%,32rem)] flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-950/90 px-4 py-3 text-sm text-amber-100 shadow-lg backdrop-blur-md"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>로그인은 정상입니다. 관리자 권한이 없어 운영 콘솔에 들어갈 수 없습니다.</span>
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
            <a className="text-[#d0c6ab] hover:text-[#fff6df] transition-colors duration-300 text-sm font-semibold tracking-wider" href="#now-good">오늘 붐빔 정도</a>
            <a className="text-[#d0c6ab] hover:text-[#fff6df] transition-colors duration-300 text-sm font-semibold tracking-wider" href="#moon-spots">달빛 스팟</a>
            <Link className="text-[#d0c6ab] hover:text-[#fff6df] transition-colors duration-300 text-sm font-semibold tracking-wider" href="/events">행사 소식</Link>
            <a className="text-[#d0c6ab] hover:text-[#fff6df] transition-colors duration-300 text-sm font-semibold tracking-wider" href="#heritage-story">수원 소개</a>
            {initialIsAdmin && (
              <Link className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors duration-300 text-sm font-semibold tracking-wider" href="/admin">운영 콘솔</Link>
            )}
          </div>


          <div className="hidden md:flex items-center gap-4">
            {initialUser ? (
              <>
                {initialIsAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-5 py-2 bg-[#171f33] border border-[#3e495d] text-white text-xs font-bold rounded-full hover:bg-[#222a3d] transition-all"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-[#ffd700]" />
                    <span>관리자 콘솔</span>
                  </Link>
                )}
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
            <Link onClick={() => setIsMobileMenuOpen(false)} className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="/courses">문화유산 코스</Link>
            <a onClick={() => setIsMobileMenuOpen(false)} className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="#now-good">오늘 붐빔 정도</a>
            <a onClick={() => setIsMobileMenuOpen(false)} className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="#moon-spots">달빛 스팟</a>
            <Link onClick={() => setIsMobileMenuOpen(false)} className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="/events">행사 소식</Link>
            <a onClick={() => setIsMobileMenuOpen(false)} className="text-[#d0c6ab] hover:text-[#fff6df] py-1 text-sm font-semibold" href="#heritage-story">수원 소개</a>
            {initialIsAdmin && (
              <Link onClick={() => setIsMobileMenuOpen(false)} className="text-[#d0c6ab] hover:text-[#ffd700] py-1 text-sm font-semibold" href="/admin">운영 콘솔</Link>
            )}

            <div className="h-px bg-[#4d4732]/10 my-1" />
            {initialUser ? (
              <div className="flex flex-col gap-2">
                {initialIsAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full text-center py-2.5 bg-[#171f33] text-white text-sm font-bold rounded-xl border border-[#3e495d]"
                  >
                    관리자 콘솔
                  </Link>
                )}
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
        <section className="ambient-glow relative min-h-screen flex items-center justify-center overflow-hidden pt-24">
          {/* Background Image Overlay */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-[#0b1326]/60 via-[#0b1326]/40 to-[#0b1326] z-10" />
            <div className="hero-shimmer z-10" aria-hidden="true" />
            <Image
              alt="수원화성 야경"
              className="object-cover"
              src="/assets/AB6AXuAr2IWAb3hzIl4dB_UZ2hG1Fn3eVdPeJIAbvjMOFhxYoHoLogK3j5yXR7zW4X_qGufXYUV5wxbPOuXtWwJypmvLm66Gou28-e280c9c2a3b763e510ae172b5c07fc4f"
              fill
              priority
              sizes="100vw"
            />
          </div>

          <div className="relative z-20 container mx-auto mt-12 flex max-w-[1440px] flex-col items-center gap-8 px-6 text-center md:mt-0 md:px-20">
            <div className="motion-reveal inline-flex items-center gap-2 rounded-full border border-[#ffd700]/30 bg-[#171f33]/50 px-4 py-2 backdrop-blur-sm">
              <Sparkles className="text-[#ffd700] w-4 h-4" />
              <span className="text-xs font-bold text-[#ffd700] tracking-widest uppercase">달빛 문화유산 발견하기</span>
            </div>
            
            <h1 className="motion-reveal text-4xl font-extrabold leading-tight tracking-tight text-[#fff6df] [animation-delay:120ms] md:text-7xl">
              수원화성의 밤을 걷는 가장 <br />
              <span className="bg-gradient-to-r from-[#ffd700] to-[#fff6df] bg-clip-text text-transparent">로맨틱한 방법</span>
            </h1>
            
            <p className="motion-reveal max-w-2xl text-base leading-relaxed text-[#d0c6ab] [animation-delay:240ms] md:text-lg">
              세계문화유산 수원화성의 시간을 초월한 아름다움을 경험하세요. 달빛수원 앱을 다운로드하여 큐레이션된 산책 코스, 역사적 통찰, 그리고 특별한 야간 이벤트를 만나보세요.
            </p>
            
            <div className="motion-reveal mt-8 flex w-full max-w-md flex-col justify-center gap-4 [animation-delay:360ms] sm:flex-row">
              <Link href="/courses" className="flex items-center justify-center gap-3 px-8 py-4 bg-[#ffd700] text-[#3a3000] rounded-xl font-bold hover:bg-[#ffe16d] transition-colors w-full sm:w-auto shadow-lg shadow-yellow-500/10">
                <span>코스 둘러보기</span>
              </Link>
              <a href="#moon-spots" className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-900/40 border border-[#ffd700] text-[#ffd700] rounded-xl font-bold hover:bg-slate-900/60 transition-colors w-full sm:w-auto backdrop-blur-md">
                <span>달빛 스팟 보기</span>
              </a>
            </div>
          </div>
        </section>

        {/* Published Courses Section */}
        <section className="ambient-glow relative bg-[#0b1326] py-24">
          <div className="container mx-auto max-w-[1440px] px-6 md:px-20">
            <SectionHeading eyebrow="추천 코스" title="오늘 걷기 좋은 달빛 코스" description="수원화성의 밤을 걷는 순서대로 엮었습니다. 소요 시간과 걷는 거리를 미리 확인하고 출발하세요." action={{ href: '/courses', label: '전체 코스 보기', icon: <ArrowRight className="h-4 w-4" /> }} />

            {coursesError ? (
              <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-8 text-sm text-amber-100">
                코스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </div>
            ) : courses.length === 0 ? (
              <div className="rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/70 p-8 text-sm text-[#d0c6ab]">
                준비된 코스를 곧 소개할 예정입니다. 먼저 아래 달빛 스팟을 둘러보세요.
              </div>
            ) : (
              <ScrollRail label="추천 코스 목록" className="xl:grid-cols-3">
                {courses.slice(0, 3).map((course) => (
                  <article key={course.id} className="group flex h-full min-w-[86%] snap-start flex-col overflow-hidden rounded-3xl border border-[#3e495d]/30 bg-[#171f33] shadow-xl motion-reveal md:min-w-0">
                    {course.heroImageUrl ? (
                      <div
                        role="img"
                        aria-label={course.title}
                        className="image-reveal aspect-[16/9] shrink-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${course.heroImageUrl})` }}
                      />
                    ) : <div className="flex aspect-[16/9] shrink-0 items-center justify-center bg-[#0b1326] text-xs text-[#8f9bb3]">이미지 준비 중</div>}
                    <div className="flex flex-1 flex-col p-6">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="rounded-full bg-[#0b1326] px-3 py-1 text-[10px] font-black text-[#ffd700]">추천 코스</span>
                        <span className="text-xs font-bold text-[#d0c6ab]">{course.theme}</span>
                      </div>
                      <h3 className="text-xl font-black text-white">{course.title}</h3>
                      <p className="mt-2 text-sm font-bold text-[#ffd700]">{course.subtitle}</p>
                      <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[#d0c6ab]">{course.description}</p>
                      <div className="mt-5 flex shrink-0 gap-3 text-xs text-[#d0c6ab]">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0b1326]/70 px-3 py-2">
                          <Clock className="h-3.5 w-3.5 text-[#ffd700]" />
                          {course.durationMinutes}분
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0b1326]/70 px-3 py-2">
                          <MapPin className="h-3.5 w-3.5 text-[#ffd700]" />
                          {course.distanceKm === null ? '준비 중' : `${course.distanceKm}km`}
                        </span>
                      </div>
                      <div className="mt-auto space-y-2 pt-5">
                        {course.places.slice(0, 3).map((place) => (
                          <Link key={place.id} href={`/places/${place.slug}`} className="flex items-center justify-between rounded-xl bg-[#0b1326]/60 px-3 py-2 text-xs font-bold text-white hover:text-[#ffd700]">
                            {place.displayName}
                            <ArrowRight className="h-3.5 w-3.5 text-[#ffd700]" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </ScrollRail>
            )}
          </div>
        </section>

        <section id="now-good" className="relative overflow-hidden bg-[#10182b] py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,0.11),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(103,140,255,0.12),transparent_36%)]" />
          <div className="relative container mx-auto max-w-[1440px] px-6 md:px-20">
            <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <span className="text-xs font-bold uppercase tracking-widest text-[#ffd700]">오늘 붐빔 정도</span>
                <h2 className="mt-2 text-3xl font-extrabold text-[#fff6df] md:text-5xl">{crowdHeadline}</h2>
                <p className="mt-4 text-sm leading-relaxed text-[#d0c6ab] md:text-base">
                  {crowdDescription}
                </p>
              </div>
              <span className="rounded-full border border-[#ffd700]/20 bg-[#0b1326]/70 px-5 py-2 text-xs font-bold text-[#ffd700]">
                {nowGoodSpots.length === 0
                  ? '예상치 준비 중'
                  : hasRelaxedSpots
                    ? `한적한 곳 ${relaxedSpotCount}곳`
                    : `${nowGoodSpots.length}곳 비교`}
              </span>
            </div>

            {crowdError ? (
              <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-8 text-sm text-amber-100">
                오늘 붐빔 정도를 불러오지 못했습니다. 장소 정보는 아래에서 계속 확인할 수 있습니다.
              </div>
            ) : nowGoodSpots.length === 0 ? (
              <div className="rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/70 p-8 text-sm text-[#d0c6ab]">
                오늘 붐빔 정도는 아직 준비되지 않았습니다.
              </div>
            ) : (
              <ScrollRail label="오늘 한적한 달빛 스팟" className="xl:grid-cols-4">
                {nowGoodSpots.map((spot) => (
                  <Link
                    key={spot.placeId}
                    href={`/places/${spot.slug}`}
                    className="group flex h-full min-w-[82%] snap-start flex-col overflow-hidden rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/90 shadow-xl transition hover:-translate-y-1 hover:border-[#ffd700]/40 md:min-w-0"
                  >
                    <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-[#0b1326]">
                      {spot.heroImageUrl ? (
                        <div
                          role="img"
                          aria-label={spot.displayName}
                          className="image-reveal h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${spot.heroImageUrl})` }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-[#d0c6ab]">이미지 준비 중</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/85 via-transparent to-transparent" />
                      <div className="absolute left-4 top-4"><StatusPill level={spot.crowdLevel} /></div>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="line-clamp-2 text-lg font-extrabold text-white">{spot.displayName}</h3>
                      <p className="mt-2 flex-1 text-xs text-[#d0c6ab]">
                        {spot.crowdLevel ? `오늘 ${spot.crowdLevel}할 것으로 보입니다` : '오늘 예상치 준비 중'}
                      </p>
                    </div>
                  </Link>
                ))}
              </ScrollRail>
            )}
          </div>
        </section>

        <section id="moon-spots" className="relative overflow-hidden bg-[#10182b] py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,215,0,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(103,140,255,0.14),transparent_36%)]" />
          <div className="relative container mx-auto px-6 md:px-20 max-w-[1440px]">
            <SectionHeading eyebrow="달빛 스팟" title="밤에 더 좋은 수원의 장소" description="한국관광공사 공공데이터로 위치를 확인하고, 야간에 무엇을 볼 수 있는지 직접 정리했습니다." />
            {importedPlaces.length > 0 ? (
              <div className="mb-10 rounded-full border border-[#ffd700]/20 bg-[#0b1326]/70 px-5 py-2 text-xs font-bold text-[#ffd700] md:ml-auto md:w-fit">
                {importedPlaces.length}곳 소개
              </div>
            ) : null}

            {placesError ? (
              <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-8 text-sm text-amber-100">
                장소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </div>
            ) : importedPlaces.length > 0 ? (
              <ScrollRail label="달빛 스팟 목록" className="xl:grid-cols-5">
                {importedPlaces.map((place) => (
                  <div key={place.slug} className="min-w-[82%] snap-start md:min-w-0"><MediaCard href={`/places/${place.slug}`} title={place.displayName} description={place.shortDescription ?? place.addressFull ?? '소개 문구 준비 중'} imageUrl={place.heroImageUrl} eyebrow={place.nightHighlight ? '야경 추천' : undefined} /></div>
                ))}
              </ScrollRail>
            ) : (
              <div className="rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/70 p-8 text-sm text-[#d0c6ab]">
                소개할 장소를 준비 중입니다. 조금만 기다려 주세요.
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
                  <div className="relative w-full h-full bg-slate-950">
                    <Image
                      alt="달빛수원 앱 화면"
                      className="object-cover"
                      src="/assets/AB6AXuDO7PfXKUckL45tgjSDE65w2LHvcoN6ooDWGQ0K7o1VAkbfcZoPK77GtyQF6a0aVM-QEunw-3i6OlXLUQGADQnqCRVyn-Ao-b6c661e9eafb24fd55b06949a26cb564"
                      fill
                      sizes="300px"
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
                    우리의 모바일 앱은 이 밤의 원더랜드로 안내하는 개인 가이드 역할을 합니다. 큐레이션된 오디오 투어, 인터랙티브 지도, 최신 행사 소식을 통해 전통과 현대적 편리함이 어우러진 잊을 수 없는 달빛 산책을 보장합니다.
                  </p>
                </div>

                <div className="mt-12 flex items-center gap-6">
                  <div>
                    <p className="text-2xl md:text-3xl font-extrabold text-[#ffd700] mb-1">{importedPlaces.length}</p>
                    <p className="text-xs text-[#d0c6ab]">달빛 스팟</p>
                  </div>
                  <div className="w-px h-12 bg-[#3e495d]/30" />
                  <div>
                    <p className="text-2xl md:text-3xl font-extrabold text-[#ffd700] mb-1">{courses.length}</p>
                    <p className="text-xs text-[#d0c6ab]">추천 코스</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="events" className="relative overflow-hidden bg-[#0b1326] py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,0.1),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(103,140,255,0.1),transparent_36%)]" />
          <div className="relative container mx-auto max-w-[1440px] px-6 md:px-20">
            <SectionHeading eyebrow="수원 행사 소식" title="달빛 산책과 함께 볼 행사" description="오늘 이후 열리는 행사만 모았습니다. 산책 일정에 맞춰 함께 둘러보세요." action={{ href: '/events', label: '전체 행사 보기', icon: <ArrowRight className="h-4 w-4" /> }} />
            {eventsError ? (
              <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-8 text-sm text-amber-100">
                행사 데이터를 불러오지 못했습니다. 장소와 코스 정보는 계속 확인할 수 있습니다.
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/70 p-8 text-sm text-[#d0c6ab]">
                지금은 예정된 행사가 없습니다. 새 일정이 잡히면 이곳에서 알려드립니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-3">
                {events.slice(0, 3).map((event) => (
                  <Link
                    key={event.id}
                    href={`/events/${encodeURIComponent(event.eventContentId)}`}
                    className="group flex h-full flex-col overflow-hidden rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/90 shadow-xl transition hover:-translate-y-1 hover:border-[#ffd700]/40"
                  >
                    {event.heroImageUrl ? (
                      <div role="img" aria-label={event.eventName} className="aspect-[16/9] shrink-0 bg-cover bg-center" style={{ backgroundImage: `url(${event.heroImageUrl})` }} />
                    ) : (
                      <div className="flex aspect-[16/9] shrink-0 items-center justify-center bg-[#10182b] text-xs text-[#8f9bb3]">이미지 준비 중</div>
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-xs font-black tracking-wide text-[#ffd700]">{formatEventDate(event.startDate, event.endDate)}</p>
                      <h3 className="mt-2 line-clamp-2 text-lg font-black text-white">{event.eventName}</h3>
                      <p className="mt-2 line-clamp-2 text-xs text-[#d0c6ab]">{event.eventPlace ?? event.venueAddress ?? '수원 지역 행사'}</p>
                      {event.playTime ? <p className="mt-3 line-clamp-1 text-xs text-[#8f9bb3]">운영 시간 {event.playTime}</p> : null}
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs font-black text-[#ffd700]">
                        자세히 보기
                        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#060e20] border-t border-[#3e495d]/10">
        <div className="w-full px-6 md:px-20 py-12 flex flex-col items-center gap-6 max-w-[1440px] mx-auto">
          <div className="text-lg font-extrabold text-[#ffd700]">달빛수원</div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8 text-xs">
            <Link className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors" href="/courses">코스 보기</Link>
            <a className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors" href="#now-good">오늘 붐빔 정도</a>
            <a className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors" href="#moon-spots">달빛 스팟</a>
            <Link className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors" href="/events">행사 소식</Link>
            <Link className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors" href="/support">고객 지원</Link>
            <Link className="text-[#fff6df] hover:text-[#ffd700] font-semibold transition-colors" href="/privacy">개인정보처리방침</Link>
            <Link className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors" href="/terms">이용약관</Link>
            <a className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors" href="https://www.cha.go.kr" target="_blank" rel="noreferrer">국가유산포털</a>
            {initialIsAdmin && (
              <Link className="text-[#d0c6ab] hover:text-[#ffd700] transition-colors" href="/admin">운영 콘솔</Link>
            )}
          </div>
          <div className="text-center mt-2 text-xs text-zinc-500">
            © 달빛수원. 수원화성의 밤을 걷는 야간 특화 문화유산 가이드.
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
