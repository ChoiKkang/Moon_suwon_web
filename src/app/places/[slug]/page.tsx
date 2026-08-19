import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Compass, ExternalLink, MapPin, Moon, Phone, Route } from 'lucide-react';
import { getPublishedPlaceBySlug } from '@/lib/places/queries';

type PlaceDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PlaceDetailPage({ params }: PlaceDetailPageProps) {
  const { slug } = await params;
  const { place, error } = await getPublishedPlaceBySlug(decodeURIComponent(slug));

  if (!place && !error) {
    notFound();
  }

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
              장소 데이터를 불러오지 못했습니다. {error}
            </div>
          ) : place ? (
            <div className="max-w-4xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffd700]/25 bg-[#171f33]/75 px-4 py-2 text-xs font-black text-[#ffd700]">
                <Moon className="h-4 w-4" />
                KTO {place.ktoContentId}
              </div>
              <h1 className="motion-reveal text-5xl font-black leading-tight text-[#fff6df] md:text-8xl">{place.displayName}</h1>
              <p className="motion-reveal mt-6 max-w-2xl text-base leading-relaxed text-[#d0c6ab] [animation-delay:160ms] md:text-lg">
                {place.shortDescription ?? '달빛수원 운영 문구를 준비 중입니다. KTO 기준 위치와 이미지는 정상 연동되어 있습니다.'}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {place ? (
        <section className="px-6 pb-20 md:px-20">
          <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
            <div className="rounded-[2rem] border border-[#3e495d]/35 bg-[#141d32] p-6 md:p-8">
              <h2 className="text-2xl font-black text-white">방문 정보</h2>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <MapPin className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">주소</p>
                  <p className="mt-2 text-sm font-bold text-white">{place.addressFull ?? '주소 정보 없음'}</p>
                </div>
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <Compass className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">좌표</p>
                  <p className="mt-2 text-sm font-bold text-white">
                    {place.lat !== null && place.lng !== null ? `${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}` : '좌표 정보 없음'}
                  </p>
                </div>
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <Phone className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">연락처</p>
                  <p className="mt-2 text-sm font-bold text-white">{place.contactPhone ?? '연락처 정보 없음'}</p>
                </div>
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <Moon className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">최종 확인</p>
                  <p className="mt-2 text-sm font-bold text-white">
                    {place.sourceModifiedAt ? new Date(place.sourceModifiedAt).toLocaleDateString('ko-KR') : '정보 없음'}
                  </p>
                </div>
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <ExternalLink className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">공공데이터 기준</p>
                  <p className="mt-2 text-sm font-bold text-white">관광콘텐츠랩 contentId {place.ktoContentId}</p>
                </div>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-[#ffd700]/25 bg-[#171f33] p-6">
              <Route className="h-8 w-8 text-[#ffd700]" />
              <h2 className="mt-5 text-2xl font-black text-white">이 스팟이 포함된 코스</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#d0c6ab]">
                이 장소가 포함된 공개 코스가 있다면 코스 목록에서 실제 동선을 확인할 수 있습니다.
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
