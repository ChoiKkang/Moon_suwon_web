import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, CalendarDays, Clock, Compass, MapPin, Phone, Sparkles, Ticket } from 'lucide-react';
import { getUpcomingEventByContentId } from '@/lib/events/queries';

type EventDetailPageProps = {
  params: Promise<{ contentId: string }>;
};

function formatRange(startDate: string, endDate: string): string {
  const format = (value: string) => value.replace(/-/g, '.');
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

/**
 * KTO program text arrives as one blob with newlines and leading hyphens.
 * Split it so a reader gets a list instead of a wall of text.
 */
function programLines(programRaw: string): string[] {
  return programRaw
    .split(/\r?\n|(?=\s-\s)/)
    .map((line) => line.replace(/^[\s-]+/, '').trim())
    .filter((line) => line.length > 0);
}

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { contentId } = await params;
  const { event } = await getUpcomingEventByContentId(decodeURIComponent(contentId));

  if (!event) return { title: '행사 정보' };

  const description = `${formatRange(event.startDate, event.endDate)} · ${event.eventPlace ?? event.venueAddress ?? '수원'}`;
  return {
    title: event.eventName,
    description,
    alternates: { canonical: `/events/${encodeURIComponent(event.eventContentId)}` },
    openGraph: {
      title: `${event.eventName} | 달빛수원`,
      description,
      url: `/events/${encodeURIComponent(event.eventContentId)}`,
      type: 'article',
      ...(event.heroImageUrl ? { images: [{ url: event.heroImageUrl }] } : {}),
    },
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { contentId } = await params;
  const { event, error } = await getUpcomingEventByContentId(decodeURIComponent(contentId));

  if (!event && !error) {
    notFound();
  }

  const mapQuery = event
    ? encodeURIComponent(event.venueAddress ?? event.eventPlace ?? event.eventName)
    : '';

  return (
    <main className="min-h-screen bg-[#0b1326] text-[#dae2fd]">
      <section className="ambient-glow relative overflow-hidden px-6 py-10 md:px-20">
        <div className="absolute inset-0">
          {event?.heroImageUrl ? (
            <div
              role="img"
              aria-label={event.eventName}
              className="image-reveal h-full w-full bg-cover bg-center opacity-40"
              style={{ backgroundImage: `url(${event.heroImageUrl})` }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1326]/55 via-[#0b1326]/80 to-[#0b1326]" />
        </div>

        <div className="relative mx-auto max-w-[1440px]">
          <Link href="/events" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[#ffd700]">
            <ArrowLeft className="h-4 w-4" />
            행사 목록으로
          </Link>

          {error ? (
            <div className="mt-10 rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">
              행사 정보를 불러오지 못했습니다. {error}
            </div>
          ) : event ? (
            <div className="mt-10 max-w-4xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffd700]/25 bg-[#171f33]/75 px-4 py-2 text-xs font-black text-[#ffd700]">
                <CalendarDays className="h-4 w-4" />
                {formatRange(event.startDate, event.endDate)}
              </div>
              <h1 className="motion-reveal text-4xl font-black leading-tight text-[#fff6df] md:text-6xl">
                {event.eventName}
              </h1>
              <p className="motion-reveal mt-5 text-base text-[#d0c6ab] [animation-delay:160ms]">
                {event.eventPlace ?? event.venueAddress ?? '수원 지역 행사'}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {event ? (
        <section className="px-6 pb-20 md:px-20">
          <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
            <div className="rounded-[2rem] border border-[#3e495d]/35 bg-[#141d32] p-6 md:p-8">
              {event.programRaw ? (
                <div className="mb-8">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#ffd700]">
                    <Sparkles className="h-4 w-4" />
                    프로그램
                  </div>
                  <ul className="mt-4 space-y-2">
                    {programLines(event.programRaw).map((line) => (
                      <li key={line} className="flex gap-2 text-sm leading-relaxed text-[#d0c6ab]">
                        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffd700]" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <h2 className="text-2xl font-black text-white">관람 정보</h2>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <Clock className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">운영 시간</p>
                  <p className="mt-2 whitespace-pre-line text-sm font-bold text-white">{event.playTime ?? '정보 없음'}</p>
                </div>
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <Ticket className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">이용 요금</p>
                  <p className="mt-2 whitespace-pre-line text-sm font-bold text-white">{event.usageFee ?? '정보 없음'}</p>
                </div>
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <MapPin className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">장소</p>
                  <p className="mt-2 text-sm font-bold text-white">{event.venueAddress ?? event.eventPlace ?? '정보 없음'}</p>
                </div>
                <div className="rounded-3xl bg-[#0b1326]/70 p-5">
                  <Phone className="mb-4 h-5 w-5 text-[#ffd700]" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f9bb3]">문의</p>
                  <p className="mt-2 whitespace-pre-line text-sm font-bold text-white">{event.contactPhone ?? '정보 없음'}</p>
                </div>
              </div>

              <p className="mt-6 text-[11px] leading-relaxed text-[#8f9bb3]">
                한국관광공사 축제·행사 정보 기준입니다. 방문 전 주최 측 공지로 일정과 요금을 다시 확인해 주세요.
              </p>
            </div>

            <aside className="rounded-[2rem] border border-[#ffd700]/25 bg-[#171f33] p-6">
              <Compass className="h-8 w-8 text-[#ffd700]" />
              <h2 className="mt-5 text-2xl font-black text-white">함께 걷기</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#d0c6ab]">
                행사 전후로 수원화성 야경 코스를 이어 걸으면 하루가 완성됩니다.
              </p>
              <Link
                href="/courses"
                className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[#ffd700] px-5 py-4 text-sm font-black text-[#3a3000] transition hover:bg-[#ffe16d]"
              >
                야경 코스 보기
              </Link>
              {mapQuery ? (
                <a
                  href={`https://map.kakao.com/link/search/${mapQuery}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#3e495d] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#222a3d]"
                >
                  <MapPin className="h-4 w-4 text-[#ffd700]" />
                  지도에서 위치 보기
                </a>
              ) : null}
            </aside>
          </div>
        </section>
      ) : null}
    </main>
  );
}
