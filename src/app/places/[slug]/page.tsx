import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Accessibility, ArrowLeft, Camera, Compass, Dog, ExternalLink, MapPin, Moon, Phone, Route, Sparkles } from 'lucide-react';
import { getPublishedPlaceBySlug } from '@/lib/places/queries';
import { groupAccessibility } from '@/lib/places/accessibility';
import { StatusPill } from '@/components/public/status-pill';

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

  // Kakao Map resolves a Korean address or place name reliably, and the
  // coordinate link drops the visitor on the exact spot when we have one.
  const mapHref = place
    ? place.lat !== null && place.lng !== null
      ? `https://map.kakao.com/link/map/${encodeURIComponent(place.displayName)},${place.lat},${place.lng}`
      : `https://map.kakao.com/link/search/${encodeURIComponent(place.addressFull ?? place.displayName)}`
    : null;

  // 무장애 정보는 값이 있는 항목만 보여준다. KTO가 서술형으로 주는 원문을 그대로
  // 쓰고 등급으로 환산하지 않는다.
  const accessibilityGroups = place ? groupAccessibility(place.accessibility) : [];

  return (
    <main className="min-h-screen bg-[#0b1326] text-[#dae2fd]">
      <section className="ambient-glow relative min-h-[72vh] overflow-hidden px-6 py-10 md:px-20">
        <div className="absolute inset-0">
          {place?.heroImageUrl ? (
            <div
              role="img"
              aria-label={place.displayName}
              className="image-reveal h-full w-full bg-cover bg-center opacity-45"
              style={{ backgroundImage: `url(${place.heroImageUrl})` }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1326]/50 via-[#0b1326]/80 to-[#0b1326]" />
        </div>

        <div className="relative mx-auto flex min-h-[62vh] max-w-[1440px] flex-col justify-between">
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
                {place.addressFull && mapHref ? (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-3xl bg-[#0b1326]/70 p-5 transition hover:bg-[#0b1326] md:col-span-2"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <MapPin className="h-5 w-5 text-[#ffd700]" />
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#ffd700]">
                        길찾기
                        <ExternalLink className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">주소</p>
                    <p className="mt-2 text-sm font-bold text-white underline decoration-[#ffd700]/40 decoration-2 underline-offset-4 group-hover:decoration-[#ffd700]">
                      {place.addressFull}
                    </p>
                    <p className="mt-2 text-[11px] text-[#8f9bb3]">주소를 누르면 카카오맵에서 위치와 길찾기를 볼 수 있습니다.</p>
                  </a>
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
            </div>

            <aside className="rounded-[2rem] border border-[#ffd700]/25 bg-[#171f33] p-6">
              <Route className="h-8 w-8 text-[#ffd700]" />
              <h2 className="mt-5 text-2xl font-black text-white">이 스팟이 포함된 코스</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#d0c6ab]">
                이 장소를 지나는 산책 코스가 있는지 코스 목록에서 확인해 보세요.
              </p>
              <Link
                href="/courses"
                className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[#ffd700] px-5 py-4 text-sm font-black text-[#3a3000] transition hover:bg-[#ffe16d]"
              >
                코스에서 보기
              </Link>
            </aside>
          </div>
        </section>
      ) : null}
    </main>
  );
}
