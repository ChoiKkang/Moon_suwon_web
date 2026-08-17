import Link from 'next/link';
import { AlertCircle, ArrowUp, Castle, CheckCircle, FileText, ImageIcon, MapPin, Route } from 'lucide-react';
import { getPublishedCourses } from '@/lib/courses/queries';
import { getPublishedPlaces } from '@/lib/places/queries';
import { KTOImportPanel } from '@/components/admin/kto-import-panel';

export default async function AdminDashboardPage() {
  const { places, error } = await getPublishedPlaces();
  const { courses, error: coursesError } = await getPublishedCourses();
  const dataError = error ?? coursesError;
  const heroImageCount = places.filter((place) => Boolean(place.heroImageUrl)).length;
  const addressCount = places.filter((place) => Boolean(place.addressFull)).length;
  const copyCount = places.filter((place) => Boolean(place.shortDescription)).length;
  const liveCourseCount = courses.filter((course) => course.status === 'live').length;

  const kpis = [
    {
      label: '공개 KTO 스팟',
      value: `${places.length}개`,
      helper: 'public.v_imported_places 기준',
      icon: Castle,
      ratio: places.length > 0 ? 100 : 0,
    },
    {
      label: 'Hero 이미지 보유',
      value: `${heroImageCount}/${places.length}`,
      helper: '카드/상세 대표 이미지',
      icon: ImageIcon,
      ratio: places.length > 0 ? Math.round((heroImageCount / places.length) * 100) : 0,
    },
    {
      label: '주소 좌표 보유',
      value: `${addressCount}/${places.length}`,
      helper: '방문 정보 표시 가능',
      icon: MapPin,
      ratio: places.length > 0 ? Math.round((addressCount / places.length) * 100) : 0,
    },
    {
      label: '운영 문구 보유',
      value: `${copyCount}/${places.length}`,
      helper: 'editorial copy 노출',
      icon: FileText,
      ratio: places.length > 0 ? Math.round((copyCount / places.length) * 100) : 0,
    },
  ];

  return (
    <main className="flex-1 p-6 md:p-20 max-w-[1440px] mx-auto w-full relative z-10">
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#fff6df] mb-2 tracking-tight">콘텐츠 운영 대시보드</h2>
          <p className="text-base md:text-lg text-[#d0c6ab] max-w-2xl">
            관광콘텐츠랩에서 적재한 스팟과 달빛수원 코스 큐레이션 상태를 확인합니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/courses"
            className="bg-[#ffd700] text-[#3a3000] rounded px-4 py-2 text-sm font-black hover:bg-[#ffe16d] transition-colors"
          >
            서비스 화면 보기
          </Link>
        </div>
      </header>

      {dataError ? (
        <section className="mb-10 rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">
          Supabase 콘텐츠 데이터를 불러오지 못했습니다. 운영자에게 데이터 연결 상태를 확인해 주세요.
        </section>
      ) : null}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <div key={kpi.label} className="bg-[#171f33] border border-[#2d3449] rounded-xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon className="w-16 h-16 text-[#ffd700]" />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Icon className="w-4 h-4 text-[#d0c6ab]" />
                <h3 className="text-xs font-bold text-[#d0c6ab] uppercase tracking-wider">{kpi.label}</h3>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-white">{kpi.value}</span>
                <span className="text-xs text-emerald-400 flex items-center font-bold">
                  <ArrowUp className="w-3.5 h-3.5" />
                  {kpi.ratio}%
                </span>
              </div>
              <p className="mt-3 text-xs text-[#d0c6ab]">{kpi.helper}</p>
              <div className="mt-4 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-[#ffd700]/80 rounded-full" style={{ width: `${kpi.ratio}%` }} />
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-[#1e293b]/40 backdrop-blur-md border border-white/10 rounded-xl p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-bold text-[#ffd700] mb-1">공개 스팟 운영 상태</h3>
              <p className="text-xs text-[#d0c6ab]">앱/웹에 노출되는 KTO 스팟의 이미지, 주소, 운영 문구 상태입니다.</p>
            </div>
            <Link href="/courses" className="text-[#ffd700] hover:text-[#ffe16d] text-sm font-bold transition-colors flex items-center gap-1">
              <span>코스 보기</span>
              <span>→</span>
            </Link>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-[#3e495d]/30 text-[#d0c6ab] text-xs font-bold tracking-wider">
                  <th className="py-4 px-2">스팟</th>
                  <th className="py-4 px-2">KTO ID</th>
                  <th className="py-4 px-2">주소</th>
                  <th className="py-4 px-2">Hero</th>
                  <th className="py-4 px-2">최종 확인</th>
                  <th className="py-4 px-2 text-right">상세</th>
                </tr>
              </thead>
              <tbody className="text-sm text-[#dae2fd] divide-y divide-[#3e495d]/20">
                {places.map((place) => (
                  <tr key={place.slug} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-slate-900 border border-zinc-800 flex items-center justify-center text-[#ffd700] group-hover:bg-[#ffd700]/10 transition-colors">
                          <Castle className="w-5 h-5" />
                        </div>
                        <span className="font-bold">{place.displayName}</span>
                      </div>
                    </td>
                    <td className="py-4 px-2">{place.ktoContentId}</td>
                    <td className="py-4 px-2 text-[#d0c6ab]">{place.addressFull ?? '없음'}</td>
                    <td className="py-4 px-2">
                      {place.heroImageUrl ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                      )}
                    </td>
                    <td className="py-4 px-2 text-xs text-[#d0c6ab]">
                      {place.sourceModifiedAt ? new Date(place.sourceModifiedAt).toLocaleDateString('ko-KR') : '정보 없음'}
                    </td>
                    <td className="py-4 px-2 text-right">
                      <Link href={`/places/${place.slug}`} className="text-[#ffd700] font-bold hover:text-[#ffe16d]">
                        보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#171f33] border border-[#2d3449] rounded-xl p-6 flex flex-col min-h-[500px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#ffd700]">코스 큐레이션</h3>
            <span className="text-xs text-[#d0c6ab]">{liveCourseCount}/{courses.length}개 공개</span>
          </div>

          <div className="flex-1 space-y-4">
            {courses.map((course) => (
              <div key={course.slug} className="rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/50 p-4">
                <div className="flex items-center gap-3">
                  <Route className="w-5 h-5 text-[#ffd700]" />
                  <div>
                    <p className="text-sm font-black text-white">{course.title}</p>
                    <p className="text-xs text-[#d0c6ab]">{course.places.length}개 스팟 구성</p>
                  </div>
                  <span className="ml-auto rounded-full bg-[#1e293b] px-2 py-1 text-[10px] font-black text-[#ffd700]">
                    LIVE
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/courses"
            className="mt-4 w-full py-2.5 border border-slate-800 rounded text-xs font-bold text-center text-[#d0c6ab] hover:text-[#ffd700] hover:border-[#ffd700]/50 transition-colors"
          >
            코스 페이지로 이동
          </Link>
        </div>
      </section>

      {/* KTO 실시간 API 수집 및 승인 적재 패널 */}
      <section className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <KTOImportPanel />
        </div>
        <div className="bg-[#171f33] border border-[#2d3449] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-bold text-[#ffd700] mb-4">데이터 수집 가이드</h3>
            <ul className="text-xs text-[#d0c6ab] space-y-5 leading-relaxed">
              <li>
                <strong className="text-white block mb-1">1. 실시간 조회 및 프리뷰</strong>
                좌측 드롭다운에서 장소를 선택하면 KTO 공공 API 서버에 실시간으로 상세 개요 정보 및 다량의 갤러리 이미지 데이터 조회를 요청합니다.
              </li>
              <li>
                <strong className="text-white block mb-1">2. 안전한 트랜잭션 적재</strong>
                &ldquo;최종 승인&rdquo;을 클릭하면 서버 단에서 관리자 세션 권한을 한 번 더 검증한 뒤, <code>core.places</code>, <code>core.place_sources</code>, <code>core.place_images</code>에 안전하게 Upsert(업데이트) 적재합니다.
              </li>
              <li>
                <strong className="text-white block mb-1">3. 서비스 온디맨드 갱신</strong>
                성공적으로 적재된 데이터는 Next.js 캐시 재유효화(Revalidation) 규칙을 통해 새로고침 없이 홈, 코스 목록, 상세 페이지 등에 즉각 갱신 및 배포됩니다.
              </li>
            </ul>
          </div>
          <div className="mt-8 pt-4 border-t border-[#2d3449] text-[10px] text-[#8f9bb3] tracking-wide">
            달빛수원 Editorial & Data Sync Console v1.0
          </div>
        </div>
      </section>

      <div className="fixed top-0 right-0 w-full h-full pointer-events-none -z-20 overflow-hidden opacity-30">
        <div className="absolute -top-[20%] -right-[10%] w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(255,246,223,0.06)_0%,rgba(11,19,38,0)_70%)] blur-3xl" />
      </div>
    </main>
  );
}
