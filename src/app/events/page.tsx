import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight, CalendarDays, Clock, MapPin, Moon } from 'lucide-react';
import { getAllUpcomingEvents } from '@/lib/events/queries';

export const metadata: Metadata = {
  title: '수원 행사 소식',
  description: '한국관광공사 데이터로 확인한 수원 지역 축제와 행사 일정을 모았습니다.',
  alternates: { canonical: '/events' },
};

function formatRange(startDate: string, endDate: string): string {
  const format = (value: string) => value.replace(/-/g, '.');
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

export default async function EventsPage() {
  const { events, error } = await getAllUpcomingEvents();

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
              Suwon Festivals
            </div>
            <h1 className="motion-reveal text-4xl font-black leading-tight text-[#fff6df] md:text-7xl">
              달빛 산책과 함께 볼
              <span className="block bg-gradient-to-r from-[#ffd700] to-[#fff6df] bg-clip-text text-transparent">
                수원 행사
              </span>
            </h1>
            <p className="motion-reveal mt-6 text-base leading-relaxed text-[#d0c6ab] [animation-delay:160ms] md:text-lg">
              한국관광공사 축제·행사 데이터에서 오늘 이후 일정만 모았습니다. 야경 코스와 날짜를 맞춰 방문해 보세요.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 md:px-20">
        <div className="mx-auto max-w-[1440px]">
          {error ? (
            <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-8 text-sm text-amber-100">
              행사 데이터를 불러오지 못했습니다. 코스와 장소 정보는 계속 확인할 수 있습니다.
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/70 p-10 text-center">
              <h2 className="text-2xl font-black text-white">예정된 행사가 없습니다</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#d0c6ab]">
                새 행사 일정이 수집되면 이 화면에 자동으로 표시됩니다.
              </p>
              <Link href="/courses" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#ffd700] px-5 py-3 text-sm font-black text-[#3a3000]">
                야경 코스 보기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${encodeURIComponent(event.eventContentId)}`}
                  className="group flex h-full flex-col overflow-hidden rounded-3xl border border-[#3e495d]/30 bg-[#171f33]/90 shadow-xl transition hover:-translate-y-1 hover:border-[#ffd700]/40"
                >
                  {event.heroImageUrl ? (
                    <div
                      role="img"
                      aria-label={event.eventName}
                      className="image-reveal aspect-[16/9] shrink-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${event.heroImageUrl})` }}
                    />
                  ) : (
                    <div className="flex aspect-[16/9] shrink-0 items-center justify-center bg-[#10182b] text-xs text-[#8f9bb3]">
                      이미지 준비 중
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <p className="inline-flex items-center gap-1.5 text-xs font-black tracking-wide text-[#ffd700]">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatRange(event.startDate, event.endDate)}
                    </p>
                    <h2 className="mt-2 line-clamp-2 text-lg font-black text-white">{event.eventName}</h2>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-[#d0c6ab]">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#ffd700]" />
                      <span className="line-clamp-2">{event.eventPlace ?? event.venueAddress ?? '수원 지역'}</span>
                    </p>
                    {event.playTime ? (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-[#8f9bb3]">
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-1">{event.playTime}</span>
                      </p>
                    ) : null}
                    {/* 운영시간이 없는 행사도 있어 카드마다 줄 수가 다르다. 링크를
                        아래로 밀어 카드 바닥에 고정하면 줄이 고르게 보인다. */}
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
  );
}
