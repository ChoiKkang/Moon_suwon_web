import Link from 'next/link';
import { Activity, AlertCircle, CalendarDays, Castle, CheckCircle, Clock3, FileText, ImageIcon, MapPin, Route, ShieldAlert } from 'lucide-react';
import { getAdminDashboardData } from '@/lib/admin/queries';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import { KTOImportPanel } from '@/components/admin/kto-import-panel';

function formatDate(value: string | null) {
  if (!value) return '정보 없음';
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function AdminDashboardPage() {
  const { data, error } = await getAdminDashboardData();
  const publishedPlaces = data.places.filter((place) => place.isPublished);
  const unpublishedPlaces = data.places.filter((place) => !place.isPublished);
  const liveCourses = data.courses.filter((course) => course.isPublished);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const activeEvents = data.events.filter((event) => event.endDate >= today);
  const missingCopy = data.places.filter((place) => !place.copy.shortDescription || !place.copy.nightHighlight);
  const reviewQueue = data.candidates.filter((candidate) => candidate.ingestionStatus === 'candidate' || candidate.ingestionStatus === 'stale');

  const kpis = [
    { label: '전체 활성 장소', value: `${data.places.length}개`, helper: 'core.places', href: '/admin/places', icon: Castle, tone: 'info' as const },
    { label: '공개 장소', value: `${publishedPlaces.length}개`, helper: `${unpublishedPlaces.length}개 비공개`, href: '/admin/places?filter=published', icon: CheckCircle, tone: 'success' as const },
    { label: '공개 코스', value: `${liveCourses.length}개`, helper: `전체 ${data.courses.length}개`, href: '/admin/courses', icon: Route, tone: 'info' as const },
    { label: '진행·예정 행사', value: `${activeEvents.length}개`, helper: `전체 ${data.events.length}개`, href: '/admin/events', icon: CalendarDays, tone: 'warning' as const },
    { label: '오늘 예측', value: `${data.crowd.todayRows}건`, helper: data.crowd.stale ? '최신성 확인 필요' : '정상 최신 상태', href: '/admin/operations', icon: Activity, tone: data.crowd.stale ? 'warning' as const : 'success' as const },
    { label: '최근 sync 오류', value: `${data.syncErrors.length}건`, helper: '최근 50건 기준', href: '/admin/operations', icon: AlertCircle, tone: data.syncErrors.length > 0 ? 'danger' as const : 'success' as const },
    { label: '검수 대기 후보', value: `${reviewQueue.length}건`, helper: 'KTO 원본 후보', href: '/admin/places?filter=candidate', icon: ShieldAlert, tone: reviewQueue.length > 0 ? 'warning' as const : 'success' as const },
  ];

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 p-6 md:p-12 xl:p-16">
      <header className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-[#ffd700]">Editorial & Data Console</p>
          <h2 className="text-3xl font-black tracking-tight text-[#fff6df] md:text-5xl">콘텐츠 운영 대시보드</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#d0c6ab] md:text-base">
            공개 웹에 노출되는 장소·코스와 원천 데이터의 상태를 한 곳에서 검수합니다.
          </p>
        </div>
        <Link href="/" className="inline-flex items-center justify-center rounded-xl border border-[#ffd700]/40 px-4 py-3 text-sm font-black text-[#ffd700] transition hover:bg-[#ffd700]/10">
          서비스 화면 보기
        </Link>
      </header>

      {error ? (
        <section className="mb-8 rounded-3xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm leading-relaxed text-amber-100">
          운영 데이터를 일부 불러오지 못했습니다. 새로고침 후에도 계속되면 Supabase service-role 환경변수와 스키마 권한을 확인해 주세요.
        </section>
      ) : null}

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.label} href={kpi.href} className="group rounded-2xl border border-[#2d3449] bg-[#171f33] p-5 transition hover:-translate-y-0.5 hover:border-[#ffd700]/40">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-[#ffd700]" />
                <AdminStatusBadge label={kpi.tone === 'danger' ? '주의' : '상태 보기'} tone={kpi.tone} />
              </div>
              <p className="mt-5 text-xs font-bold text-[#d0c6ab]">{kpi.label}</p>
              <p className="mt-1 text-2xl font-black text-white">{kpi.value}</p>
              <p className="mt-2 text-[11px] text-[#8f9bb3]">{kpi.helper}</p>
            </Link>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">최근 수집 상태</p>
              <h3 className="mt-2 text-xl font-black text-white">sync run 타임라인</h3>
            </div>
            <Link href="/admin/operations" className="text-xs font-black text-[#ffd700]">전체 보기 →</Link>
          </div>
          <div className="space-y-3">
            {data.syncRuns.slice(0, 5).map((run) => (
              <div key={run.id} className="flex flex-col gap-3 rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Clock3 className="h-4 w-4 text-[#ffd700]" />
                  <div>
                    <p className="text-sm font-bold text-white">{run.source}</p>
                    <p className="mt-1 text-[11px] text-[#8f9bb3]">{formatDate(run.startedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#d0c6ab]">
                  <span>{run.itemsFetched} fetched</span>
                  <span>{run.itemsUpserted} upserted</span>
                  <AdminStatusBadge label={run.status} tone={run.errorCount > 0 ? 'warning' : 'success'} />
                </div>
              </div>
            ))}
            {data.syncRuns.length === 0 ? <p className="rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">수집 실행 이력이 없습니다.</p> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">보강 필요 콘텐츠</p>
              <h3 className="mt-2 text-xl font-black text-white">문구·미디어 상태</h3>
            </div>
            <Link href="/admin/places?filter=missing-copy" className="text-xs font-black text-[#ffd700]">편집하기 →</Link>
          </div>
          <div className="space-y-3">
            {missingCopy.slice(0, 6).map((place) => (
              <Link key={place.id} href={`/admin/places?place=${place.id}`} className="flex items-center justify-between rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4 transition hover:border-[#ffd700]/30">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ffd700]/10 text-[#ffd700]">
                    {place.heroImageUrl ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{place.displayName}</p>
                    <p className="mt-1 text-[11px] text-[#8f9bb3]">{place.copy.shortDescription ? '야간 포인트 보강 필요' : '운영 문구 없음'}</p>
                  </div>
                </div>
                <MapPin className="h-4 w-4 shrink-0 text-[#ffd700]" />
              </Link>
            ))}
            {missingCopy.length === 0 ? <p className="rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">필수 운영 문구가 모두 준비되었습니다.</p> : null}
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">공개 코스</p>
              <h3 className="mt-2 text-xl font-black text-white">현재 서비스 동선</h3>
            </div>
            <Link href="/admin/courses" className="text-xs font-black text-[#ffd700]">관리 →</Link>
          </div>
          <div className="mt-5 space-y-3">
            {liveCourses.map((course) => (
              <Link key={course.id} href={`/admin/courses?course=${course.id}`} className="flex items-center justify-between rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4">
                <div>
                  <p className="text-sm font-bold text-white">{course.copy.heroTitle || course.slug}</p>
                  <p className="mt-1 text-xs text-[#8f9bb3]">{course.places.length}개 스팟 · 우선순위 {course.displayPriority}</p>
                </div>
                <Route className="h-4 w-4 text-[#ffd700]" />
              </Link>
            ))}
            {liveCourses.length === 0 ? <p className="rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">공개된 코스가 없습니다.</p> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">방문 집중도 예측 상태</p>
              <h3 className="mt-2 text-xl font-black text-white">오늘의 예측 파이프라인</h3>
            </div>
            <Link href="/admin/operations" className="text-xs font-black text-[#ffd700]">상세 →</Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {Object.entries(data.crowd.byLevel).map(([level, count]) => (
              <div key={level} className="rounded-2xl bg-[#0b1326]/60 p-4">
                <p className="text-xs font-bold text-[#d0c6ab]">{level}</p>
                <p className="mt-1 text-2xl font-black text-white">{count}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4 text-xs">
            <span className="text-[#8f9bb3]">최신 원천 갱신</span>
            <span className="font-bold text-white">{formatDate(data.crowd.latestSourceUpdatedAt)}</span>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <KTOImportPanel />
      </section>

      <section className="mt-8 rounded-3xl border border-[#ffd700]/20 bg-[#171f33]/80 p-6">
        <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Review Queue</p><h3 className="mt-2 text-xl font-black text-white">최근 검수 대기 후보</h3></div><Link href="/admin/places?filter=candidate" className="text-xs font-black text-[#ffd700]">검수 열기 →</Link></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">{reviewQueue.slice(0, 6).map((candidate) => <Link key={candidate.placeId} href={`/admin/places?place=${candidate.placeId}`} className="rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4 transition hover:border-[#ffd700]/30"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-bold text-white">{candidate.displayName}</p><AdminStatusBadge label={candidate.ingestionStatus === 'stale' ? '오래됨' : '대기'} tone={candidate.ingestionStatus === 'stale' ? 'warning' : 'info'} /></div><p className="mt-2 text-xs text-[#8f9bb3]">{candidate.ktoContentId ?? 'KTO ID 없음'} · {candidate.hasCoordinates ? '좌표 있음' : '좌표 확인 필요'}</p></Link>)}{reviewQueue.length === 0 ? <p className="col-span-full rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">현재 검수 대기 후보가 없습니다.</p> : null}</div>
      </section>
    </main>
  );
}
