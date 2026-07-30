import Link from 'next/link';
import { ArrowLeft, ArrowRight, Clock, MapPin, Moon, Sparkles } from 'lucide-react';
import { getServiceCourses } from '@/lib/courses/catalog';
import { getImportedPlaces } from '@/lib/places/queries';

export default async function CoursesPage() {
  const { places, error } = await getImportedPlaces();
  const courses = getServiceCourses(places);

  return (
    <main className="min-h-screen bg-[#0b1326] text-[#dae2fd]">
      <section className="relative overflow-hidden px-6 py-10 md:px-20 md:py-16">
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
            <h1 className="text-4xl font-black leading-tight text-[#fff6df] md:text-7xl">
              밤의 수원을 걷는
              <span className="block bg-gradient-to-r from-[#ffd700] to-[#fff6df] bg-clip-text text-transparent">
                세 가지 방법
              </span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-[#d0c6ab] md:text-lg">
              관광콘텐츠랩에서 검증한 스팟과 달빛수원의 운영 큐레이션을 결합해, 첫 방문부터 사진 촬영과 로컬 상권까지 이어지는 서비스형 코스를 구성했습니다.
            </p>
          </div>

          {error ? (
            <div className="mt-10 rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">
              Supabase 코스 데이터를 불러오지 못했습니다. {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="px-6 pb-20 md:px-20">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 lg:grid-cols-3">
          {courses.map((course) => (
            <article
              key={course.slug}
              className="relative overflow-hidden rounded-[2rem] border border-[#3e495d]/40 bg-[#141d32] p-6 shadow-2xl"
            >
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#ffd700]/10 blur-3xl" />
              <div className="relative">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <span className="rounded-full bg-[#0b1326] px-3 py-1 text-[11px] font-black text-[#ffd700]">
                    {course.status === 'live' ? 'LIVE DATA' : 'CURATION'}
                  </span>
                  <span className="text-xs font-bold text-[#d0c6ab]">{course.theme}</span>
                </div>

                <h2 className="text-2xl font-black text-white">{course.title}</h2>
                <p className="mt-2 text-sm font-bold text-[#ffd700]">{course.subtitle}</p>
                <p className="mt-4 min-h-20 text-sm leading-relaxed text-[#d0c6ab]">{course.description}</p>

                <div className="mt-6 flex gap-3">
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
                    <p className="mt-1 text-lg font-black text-white">{course.distanceKm}km</p>
                  </div>
                </div>

                <div className="mt-7 space-y-3">
                  {course.places.map((place, index) => (
                    <Link
                      key={place.slug}
                      href={`/places/${place.slug}`}
                      className="group flex items-center gap-3 rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-3 transition hover:border-[#ffd700]/50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffd700] text-xs font-black text-[#3a3000]">
                        {index + 1}
                      </span>
                      <span className="flex-1 text-sm font-bold text-white">{place.displayName}</span>
                      <ArrowRight className="h-4 w-4 text-[#ffd700] transition group-hover:translate-x-1" />
                    </Link>
                  ))}

                  {course.plannedPlaces.map((place) => (
                    <div
                      key={place}
                      className="flex items-center gap-3 rounded-2xl border border-dashed border-[#3e495d]/40 bg-[#0b1326]/35 p-3"
                    >
                      <Sparkles className="h-4 w-4 text-[#ffd700]" />
                      <span className="text-sm font-bold text-[#d0c6ab]">{place}</span>
                      <span className="ml-auto text-[11px] font-black text-[#8f9bb3]">운영 후보</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
