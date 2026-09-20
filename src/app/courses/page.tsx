import Link from 'next/link';
import { ArrowLeft, ArrowRight, Clock, Dog, ExternalLink, MapPin, Moon, Navigation } from 'lucide-react';
import { getPublishedCourses } from '@/lib/courses/queries';
import { ScrollRail } from '@/components/public/scroll-rail';
import { buildCourseDirectionsUrl, buildPlaceNavigationLinks } from '@/lib/navigation/links';

export default async function CoursesPage() {
  const { courses, error } = await getPublishedCourses();

  return (
    <main className="min-h-screen bg-[#0b1326] text-[#dae2fd]">
      <section className="ambient-glow relative overflow-hidden px-6 py-10 md:px-20 md:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(90,130,255,0.14),transparent_34%)]" />
        <div className="relative mx-auto max-w-[1440px]">
          <Link href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-[#ffd700]">
            <ArrowLeft className="h-4 w-4" />
            홈으로 돌아가기
          </Link>

          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffd700]/25 bg-[#171f33]/70 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-[#ffd700]">
              <Moon className="h-4 w-4" />
              Moon Suwon Courses
            </div>
            <h1 className="motion-reveal text-4xl font-black leading-tight text-[#fff6df] md:text-7xl">
              밤의 수원을 걷는
              <span className="block bg-gradient-to-r from-[#ffd700] to-[#fff6df] bg-clip-text text-transparent">
                달빛 코스
              </span>
            </h1>
            <p className="motion-reveal mt-6 text-base leading-relaxed text-[#d0c6ab] [animation-delay:160ms] md:text-lg">
              걷는 순서, 소요 시간, 거리를 미리 정리했습니다. 수원화성의 밤을 헤매지 않고 둘러볼 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 md:px-20">
        <div className="mx-auto max-w-[1440px]">
          {error ? (
            <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-8 text-sm text-amber-100">
              코스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/70 p-10 text-center">
              <h2 className="text-2xl font-black text-white">코스를 준비 중입니다</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#d0c6ab]">
                새 코스가 준비되면 이 화면에서 바로 확인할 수 있습니다. 먼저 달빛 스팟을 둘러보세요.
              </p>
              <Link
                href="/#moon-spots"
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#ffd700] px-5 py-3 text-sm font-black text-[#3a3000]"
              >
                달빛 스팟 보기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ScrollRail label="달빛 코스 목록" className="xl:grid-cols-3">
              {courses.map((course) => {
                const courseDirectionsUrl = buildCourseDirectionsUrl(course.places);

                return (
                <article
                  key={course.id}
                  id={`course-${course.slug}`}
                  className="group relative flex h-full min-w-[86%] snap-start flex-col overflow-hidden rounded-[2rem] border border-[#3e495d]/40 bg-[#141d32] p-6 shadow-2xl motion-reveal md:min-w-0"
                >
                  {course.heroImageUrl ? (
                    <div
                      role="img"
                      aria-label={course.title}
                      className="image-reveal mb-6 aspect-[16/9] shrink-0 rounded-3xl bg-cover bg-center"
                      style={{ backgroundImage: `url(${course.heroImageUrl})` }}
                    />
                  ) : <div className="mb-6 flex aspect-[16/9] shrink-0 items-center justify-center rounded-3xl bg-[#0b1326] text-xs text-[#8f9bb3]">이미지 준비 중</div>}
                  <div className="relative flex flex-1 flex-col">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <span className="rounded-full bg-[#0b1326] px-3 py-1 text-[11px] font-black text-[#ffd700]">
                        추천 코스
                      </span>
                      <div className="flex items-center gap-2">
                        {course.petReadyFlag ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300/15 px-2.5 py-1 text-[10px] font-black text-emerald-100">
                            <Dog className="h-3 w-3" />
                            반려동물 동반
                          </span>
                        ) : null}
                        <span className="text-xs font-bold text-[#d0c6ab]">{course.theme}</span>
                      </div>
                    </div>

                    <h2 className="text-2xl font-black text-white">{course.title}</h2>
                    <p className="mt-2 text-sm font-bold text-[#ffd700]">{course.subtitle}</p>
                    <p className="mt-4 line-clamp-4 min-h-24 text-sm leading-relaxed text-[#d0c6ab]">{course.description}</p>
                    <p className="mt-3 text-[11px] leading-relaxed text-[#8f9bb3]">
                      거리와 시간은 운영 검수 기준의 참고값입니다. 실제 도보 경로는 지도에서 확인하세요.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {courseDirectionsUrl ? (
                        <a
                          href={courseDirectionsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-2xl bg-[#ffd700] px-4 py-3 text-xs font-black text-[#3a3000] transition hover:bg-[#ffe16d]"
                        >
                          <Navigation className="h-4 w-4" />
                          코스 전체 길찾기
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs font-bold text-amber-100">
                          스팟 좌표 확인 후 길찾기 제공
                        </span>
                      )}
                    </div>

                    <div className="mt-6 flex shrink-0 gap-3">
                      <div className="rounded-2xl bg-[#0b1326]/70 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-[#d0c6ab]">
                          <Clock className="h-4 w-4 text-[#ffd700]" />
                          소요시간
                        </div>
                        <p className="mt-1 text-lg font-black text-white">{course.durationMinutes}분</p>
                      </div>
                      <div className="rounded-2xl bg-[#0b1326]/70 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-[#d0c6ab]">
                          <MapPin className="h-4 w-4 text-[#ffd700]" />
                          거리
                        </div>
                        <p className="mt-1 text-lg font-black text-white">
                          {course.distanceKm === null ? '준비 중' : `${course.distanceKm}km`}
                        </p>
                      </div>
                    </div>

                    {/* 코스마다 정차지가 3~4곳으로 달라 목록 길이가 차이 난다.
                        정차지 묶음을 아래로 밀어 카드 바닥에 맞춘다. */}
                    <div className="mt-auto space-y-3 pt-7">
                      {course.places.map((place, index) => {
                        const placeNavigation = buildPlaceNavigationLinks(place);

                        return (
                          <div key={place.id} className="flex items-stretch gap-2">
                            <Link
                              href={`/places/${place.slug}`}
                              className="group flex min-w-0 flex-1 items-start gap-3 rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-3 transition hover:border-[#ffd700]/50"
                            >
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ffd700] text-xs font-black text-[#3a3000]">
                                {index + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-white">{place.displayName}</span>
                                {/* The night highlight is the reason this stop is on a
                                    night course, so show it instead of only the name. */}
                                {place.nightHighlight ? (
                                  <span className="mt-1 block text-xs leading-relaxed text-[#d0c6ab]">{place.nightHighlight}</span>
                                ) : null}
                              </span>
                              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#ffd700] transition group-hover:translate-x-1" />
                            </Link>
                            <a
                              href={placeNavigation.kakao}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`${place.displayName} 다음 스팟 길찾기`}
                              className="inline-flex w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ffd700]/25 bg-[#0b1326]/70 text-[#ffd700] transition hover:bg-[#ffd700] hover:text-[#3a3000]"
                            >
                              <Navigation className="h-4 w-4" />
                              <span className="sr-only">다음 스팟 길찾기</span>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
                );
              })}
            </ScrollRail>
          )}
        </div>
      </section>
    </main>
  );
}
