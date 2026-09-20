import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Accessibility, ArrowLeft, Camera, Compass, Dog, ExternalLink, Headphones, MapPin, Moon, Navigation, Phone, Route, Sparkles } from 'lucide-react';
import { filterCoursesContainingPlace, getPublishedCourses } from '@/lib/courses/queries';
import { getPlaceAudioStories, getPublishedPlaceBySlug } from '@/lib/places/queries';
import { groupAccessibility } from '@/lib/places/accessibility';
import { formatPlayTime, splitAudioStories } from '@/lib/places/audio-stories';
import { StatusPill } from '@/components/public/status-pill';
import { buildPlaceNavigationLinks } from '@/lib/navigation/links';

type PlaceDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const petPolicyLabels: Record<string, string> = {
  allowed: '반려동물 동반 가능',
  partial: '반려동물 조건부 가능',
  not_allowed: '반려동물 동반 불가',
  unknown: '반려동물 정보 확인 필요',
};

// Per-place metadata so each published spot has its own share title instead of
// falling back to the site-wide default.
export async function generateMetadata({ params }: PlaceDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { place } = await getPublishedPlaceBySlug(decodeURIComponent(slug));

  if (!place) {
    return { title: '장소 정보' };
  }

  const description = place.shortDescription ?? place.nightHighlight ?? `${place.displayName}의 야경 방문 정보`;
  return {
    title: place.displayName,
    description,
    alternates: { canonical: `/places/${encodeURIComponent(place.slug)}` },
    openGraph: {
      title: `${place.displayName} | 달빛수원`,
      description,
      url: `/places/${encodeURIComponent(place.slug)}`,
      type: 'article',
      ...(place.heroImageUrl ? { images: [{ url: place.heroImageUrl }] } : {}),
    },
  };
}

export default async function PlaceDetailPage({ params }: PlaceDetailPageProps) {
  const { slug } = await params;
  const { place, error } = await getPublishedPlaceBySlug(decodeURIComponent(slug));

  if (!place && !error) {
    notFound();
  }

  const navigationLinks = place ? buildPlaceNavigationLinks(place) : null;
  const heroImageUrl = place?.heroImageUrl ?? null;
  const hasHeroImage = Boolean(heroImageUrl);

  // 무장애 정보는 값이 있는 항목만 보여준다. KTO가 서술형으로 주는 원문을 그대로
  // 쓰고 등급으로 환산하지 않는다.
  const accessibilityGroups = place ? groupAccessibility(place.accessibility) : [];

  // 오디오 해설과 공개 코스는 장소 상세에서 함께 사용하는 읽기 데이터다.
  // 둘 다 실패해도 장소 본문은 유지하고 해당 부가 블록만 안전하게 숨긴다.
  const [audioStories, publishedCoursesResult] = place
    ? await Promise.all([getPlaceAudioStories(place.id), getPublishedCourses()])
    : [[], { courses: [], error: null }];
  const { playable: playableStories, readable: readableStories } = splitAudioStories(audioStories);
  const hasAudioStories = playableStories.length > 0 || readableStories.length > 0;
  const containingCourses = place && !publishedCoursesResult.error
    ? filterCoursesContainingPlace(publishedCoursesResult.courses, place.id)
    : [];

  return (
    <main className="min-h-screen bg-[#0b1326] text-[#dae2fd]">
      <section className={`ambient-glow relative overflow-hidden px-6 py-10 md:px-20 ${hasHeroImage ? 'min-h-[72vh]' : 'min-h-[52vh]'}`}>
        <div className="absolute inset-0">
          {heroImageUrl ? (
            <div
              role="img"
              aria-label={place?.displayName ?? '장소 이미지'}
              className="image-reveal h-full w-full bg-cover bg-center opacity-45"
              style={{ backgroundImage: `url(${heroImageUrl})` }}
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,215,0,0.16),transparent_30%),radial-gradient(circle_at_70%_70%,rgba(90,130,255,0.16),transparent_42%)]" aria-hidden="true" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1326]/50 via-[#0b1326]/80 to-[#0b1326]" />
        </div>

        <div className={`relative mx-auto flex max-w-[1440px] flex-col justify-between ${hasHeroImage ? 'min-h-[62vh]' : 'min-h-[42vh]'}`}>
          <Link href="/courses" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[#ffd700]">
            <ArrowLeft className="h-4 w-4" />
            코스 목록으로
          </Link>

          {error ? (
            <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">
              장소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </div>
          ) : place ? (
            <div className="max-w-4xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffd700]/25 bg-[#171f33]/75 px-4 py-2 text-xs font-black text-[#ffd700]">
                <Moon className="h-4 w-4" />
                달빛 스팟
              </div>
              {!hasHeroImage ? <p className="mb-4 text-xs font-bold text-[#8f9bb3]">대표 이미지를 준비 중인 장소입니다.</p> : null}
              <h1 className="motion-reveal text-5xl font-black leading-tight text-[#fff6df] md:text-8xl">{place.displayName}</h1>
              <p className="motion-reveal mt-6 max-w-2xl text-base leading-relaxed text-[#d0c6ab] [animation-delay:160ms] md:text-lg">
                {place.shortDescription ?? '소개 문구를 준비 중입니다. 위치와 방문 정보는 아래에서 확인할 수 있습니다.'}
              </p>
              {place.crowdForecast?.level ? (
                <div className="motion-reveal mt-6 flex flex-wrap items-center gap-3 [animation-delay:220ms]">
                  <StatusPill level={place.crowdForecast.level} />
                  <span className="text-xs text-[#8f9bb3]">
                    오늘 하루 예상 붐빔 정도
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {place ? (
        <section className="px-6 pb-20 md:px-20">
          <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
            <div className="rounded-[2rem] border border-[#3e495d]/35 bg-[#141d32] p-6 md:p-8">
              {place.nightHighlight || place.photoTip || place.shortStory ? (
                <div className="mb-8 space-y-4">
                  <h2 className="text-2xl font-black text-white">밤에 보는 이곳</h2>
                  {place.nightHighlight ? (
                    <div className="rounded-3xl border border-[#ffd700]/20 bg-[#ffd700]/5 p-5">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#ffd700]">
                        <Sparkles className="h-4 w-4" />
                        야간 포인트
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-[#fff6df]">{place.nightHighlight}</p>
                    </div>
                  ) : null}
                  {place.photoTip ? (
                    <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8f9bb3]">
                        <Camera className="h-4 w-4 text-[#ffd700]" />
                        포토 팁
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-[#d0c6ab]">{place.photoTip}</p>
                    </div>
                  ) : null}
                  {place.shortStory ? (
                    <p className="text-sm leading-relaxed text-[#d0c6ab]">{place.shortStory}</p>
                  ) : null}
                </div>
              ) : null}

              <h2 className="text-2xl font-black text-white">방문 정보</h2>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                {navigationLinks ? (
                  <div className="rounded-3xl bg-[#0b1326]/70 p-5 transition hover:bg-[#0b1326] md:col-span-2">
                    <div className="mb-4 flex items-center justify-between">
                      <MapPin className="h-5 w-5 text-[#ffd700]" />
                      <span className="text-xs font-bold text-[#ffd700]">길찾기</span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">주소</p>
                    <p className="mt-2 text-sm font-bold text-white">{place.addressFull ?? '주소 정보를 준비 중입니다'}</p>
                    <p className="mt-2 text-[11px] text-[#8f9bb3]">
                      {navigationLinks.hasExactCoordinates
                        ? '등록된 좌표를 기준으로 목적지와 도보 길찾기를 엽니다.'
                        : '좌표가 없어 장소명·주소 검색으로 연결합니다. 방문 전 위치를 확인해 주세요.'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={navigationLinks.kakao}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#ffd700]/30 px-3 py-2 text-xs font-bold text-[#ffd700] transition hover:bg-[#ffd700] hover:text-[#3a3000]"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        카카오맵 길찾기
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={navigationLinks.google}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#3e495d]/60 px-3 py-2 text-xs font-bold text-[#d0c6ab] transition hover:border-[#ffd700]/50 hover:text-white"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Google 도보
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={navigationLinks.naver}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#3e495d]/60 px-3 py-2 text-xs font-bold text-[#d0c6ab] transition hover:border-[#ffd700]/50 hover:text-white"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        네이버지도
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl bg-[#0b1326]/70 p-5 md:col-span-2">
                    <MapPin className="mb-4 h-5 w-5 text-[#ffd700]" />
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">주소</p>
                    <p className="mt-2 text-sm font-bold text-white">{place.addressFull ?? '주소 정보를 준비 중입니다'}</p>
                  </div>
                )}
                {place.contactPhone ? (
                  <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                    <Phone className="mb-4 h-5 w-5 text-[#ffd700]" />
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">문의</p>
                    <p className="mt-2 text-sm font-bold text-white">{place.contactPhone}</p>
                  </div>
                ) : null}
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <Compass className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">정보 출처</p>
                  <p className="mt-2 text-sm font-bold text-white">한국관광공사 공공데이터</p>
                  {place.sourceModifiedAt ? (
                    <p className="mt-2 text-[11px] text-[#8f9bb3]">
                      {new Date(place.sourceModifiedAt).toLocaleDateString('ko-KR')} 기준
                    </p>
                  ) : null}
                </div>
              </div>

              {place.petPolicy !== 'unknown' || place.petNote ? (
                <div className="mt-6 rounded-3xl border border-[#3e495d]/40 bg-[#0b1326]/70 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Dog className="h-5 w-5 text-[#ffd700]" />
                    <p className="text-sm font-black text-white">{petPolicyLabels[place.petPolicy] ?? petPolicyLabels.unknown}</p>
                    {place.petDataStatus === 'stale' ? (
                      <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-[10px] font-black text-amber-100">최신 확인 필요</span>
                    ) : null}
                  </div>
                  {place.petNote ? (
                    <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-[#d0c6ab]">{place.petNote}</p>
                  ) : null}
                  <p className="mt-3 text-[11px] text-[#8f9bb3]">한국관광공사 반려동물 동반여행 정보 기준입니다. 방문 전 현장 정책을 다시 확인해 주세요.</p>
                </div>
              ) : null}

              {accessibilityGroups.length > 0 ? (
                <div className="mt-6 rounded-3xl border border-[#3e495d]/40 bg-[#0b1326]/70 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Accessibility className="h-5 w-5 text-[#ffd700]" />
                    <p className="text-sm font-black text-white">편의시설과 접근성</p>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#8f9bb3]">
                    밤에는 낮보다 길이 어둡고 경사가 더 부담스럽습니다. 확인된 항목만 표시합니다.
                  </p>
                  <div className="mt-4 space-y-4">
                    {accessibilityGroups.map((group) => (
                      <div key={group.title}>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffd700]">{group.title}</p>
                        <dl className="mt-2 space-y-2">
                          {group.items.map((item) => (
                            <div key={item.label} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                              <dt className="shrink-0 text-xs font-bold text-[#8f9bb3] sm:w-20">{item.label}</dt>
                              <dd className="whitespace-pre-line text-xs leading-relaxed text-[#d0c6ab]">{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[11px] text-[#8f9bb3]">한국관광공사 무장애 여행 정보 기준입니다. 방문 전 현장에 다시 확인해 주세요.</p>
                </div>
              ) : null}

              {hasAudioStories ? (
                <div className="mt-6 rounded-3xl border border-[#3e495d]/40 bg-[#0b1326]/70 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Headphones className="h-5 w-5 text-[#ffd700]" />
                    <p className="text-sm font-black text-white">이 자리에서 듣는 이야기</p>
                  </div>

                  {playableStories.length > 0 ? (
                    <div className="mt-4 space-y-4">
                      {playableStories.map((story) => (
                        <div key={story.id} className="rounded-2xl border border-[#3e495d]/40 bg-[#171f33]/60 p-4">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <p className="text-sm font-bold text-white">{story.audioTitle}</p>
                            {formatPlayTime(story.playSeconds) ? (
                              <span className="text-[11px] text-[#8f9bb3]">{formatPlayTime(story.playSeconds)}</span>
                            ) : null}
                          </div>
                          {story.audioUrl ? (
                            <audio
                              controls
                              preload="none"
                              src={story.audioUrl}
                              aria-label={`${story.audioTitle} 오디오 해설`}
                              className="mt-3 w-full"
                            />
                          ) : null}
                          {story.script ? (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-bold text-[#ffd700]">해설 읽기</summary>
                              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[#d0c6ab]">{story.script}</p>
                            </details>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {readableStories.length > 0 ? (
                    <div className="mt-4">
                      <p className="text-xs leading-relaxed text-[#8f9bb3]">
                        걸으면서 읽기 좋은 해설입니다. 가까운 지점 순서로 정리했습니다.
                      </p>
                      <div className="mt-3 space-y-2">
                        {readableStories.map((story) => (
                          <details key={story.id} className="rounded-2xl border border-[#3e495d]/40 bg-[#171f33]/60 p-4">
                            <summary className="cursor-pointer text-sm font-bold text-white">
                              {story.audioTitle}
                              {story.distanceM !== null ? (
                                <span className="ml-2 text-[11px] font-normal text-[#8f9bb3]">{`약 ${story.distanceM}m`}</span>
                              ) : null}
                            </summary>
                            {story.script ? (
                              <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-[#d0c6ab]">{story.script}</p>
                            ) : null}
                          </details>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <p className="mt-4 text-[11px] text-[#8f9bb3]">
                    한국관광공사 오디오 가이드(오디) 정보입니다. 현장 음성 안내는 오디 앱에서 들을 수 있습니다.
                  </p>
                </div>
              ) : null}
            </div>

            <aside className="rounded-[2rem] border border-[#ffd700]/25 bg-[#171f33] p-6">
              <Route className="h-8 w-8 text-[#ffd700]" />
              <h2 className="mt-5 text-2xl font-black text-white">이 스팟이 포함된 코스</h2>
              {publishedCoursesResult.error ? (
                <p className="mt-3 text-sm leading-relaxed text-amber-100">공개 코스 연결을 확인하지 못했습니다. 전체 코스에서 다시 확인해 주세요.</p>
              ) : containingCourses.length > 0 ? (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-[#d0c6ab]">현재 공개된 코스에서 이 스팟이 포함된 순서를 확인하세요.</p>
                  <div className="mt-5 space-y-2">
                    {containingCourses.map((course) => (
                      <Link
                        key={course.id}
                        href={`/courses#course-${course.slug}`}
                        className="flex items-center justify-between rounded-2xl border border-[#ffd700]/20 bg-[#0b1326]/60 px-4 py-3 text-sm font-bold text-white transition hover:border-[#ffd700]/60"
                      >
                        <span>{course.title}</span>
                        <ExternalLink className="h-4 w-4 text-[#ffd700]" />
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-[#d0c6ab]">현재 공개 코스에는 포함되지 않은 스팟입니다.</p>
                  <Link
                    href="/courses"
                    className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[#ffd700] px-5 py-4 text-sm font-black text-[#3a3000] transition hover:bg-[#ffe16d]"
                  >
                    전체 코스 보기
                  </Link>
                </>
              )}
            </aside>
          </div>
        </section>
      ) : null}
    </main>
  );
}
