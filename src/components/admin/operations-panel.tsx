'use client';

import { useState } from 'react';
import { Activity, AlertCircle, BarChart3, ChevronDown, Clock3, Database, ExternalLink, History, Layers, ShieldAlert } from 'lucide-react';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import type { AdminApiLedgerItem, AdminAuditEvent, AdminCandidate, AdminCrowdSummary, AdminEnrichmentCoverage, AdminSourceHealth, AdminSyncError, AdminSyncRun } from '@/lib/admin/types';

const KTO_SYNC_WORKFLOW_URL = 'https://github.com/ChoiKkang/Moon_suwon_web/actions/workflows/kto-data-sync.yml';
const PUBLIC_DATA_SYNC_WORKFLOW_URL = 'https://github.com/ChoiKkang/Moon_suwon_web/actions/workflows/public-data-sync.yml';

const manualSyncJobs = [
  { id: 'content', label: '장소·이미지', description: 'KTO 장소와 대표 이미지를 갱신합니다.' },
  { id: 'crowd', label: '방문 집중도 예측', description: '일 단위 방문 집중도 예측을 갱신합니다.' },
  { id: 'pet', label: '반려동물 정보', description: '장소별 반려동물 동반 정책을 갱신합니다.' },
  { id: 'access', label: '무장애 정보', description: '경사로·화장실 등 접근성 정보를 갱신합니다.' },
  { id: 'audio', label: '오디오 해설', description: '공개 장소 주변 오디오 해설을 다시 잇습니다.' },
] as const;

const publicManualSyncJobs = [
  { id: 'photo', label: '관광 사진', description: '검수 후보 사진을 수집합니다. 승인 전에는 공개하지 않습니다.' },
  { id: 'wellness', label: '웰니스 관광', description: '웰니스 후보 정보를 수집합니다. 수원 범위와 원천을 검수합니다.' },
  { id: 'local_hub', label: '기초지자체 관광지', description: '수원 기초지자체 관광지 정보를 갱신합니다.' },
  { id: 'related', label: '연관 관광지', description: '관광지별 연관 정보를 갱신하고 중복·범위를 검수합니다.' },
  { id: 'durunubi', label: '두루누비', description: '수원 교차 코스가 없으면 정상 0건으로 유지합니다.' },
  { id: 'visitors', label: '지역별 방문자수', description: '운영 분석용 지역 방문자 통계를 갱신합니다.' },
  { id: 'weather_short', label: '기상청 단기예보', description: '공개 화면에 사용할 단기예보를 갱신합니다.' },
  { id: 'weather_mid', label: '기상청 중기예보', description: '공개 화면에 사용할 중기예보를 갱신합니다.' },
  { id: 'bus_arrival', label: '경기도 버스도착', description: '정류장 매핑이 승인되기 전까지 보류 상태입니다.' },
] as const;

function formatDate(value: string | null) {
  if (!value) return '정보 없음';
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

// Operator-facing labels for the audit actions recorded by the server actions
// and the Discord commands.
const auditActionLabels: Record<string, string> = {
  publish_enable: '장소 공개',
  publish_disable: '장소 비공개',
  course_create: '코스 생성',
  course_update: '코스 수정',
  draft_hold: '코스 초안 보류',
  candidate_approve: '후보 승인',
  candidate_reject: '후보 제외',
  candidate_hold: '후보 보류',
  pet_policy_override: '반려동물 정책 수동 적용',
  pet_policy_override_reset: '반려동물 정책 자동값 복귀',
};

function auditTone(action: string): 'success' | 'warning' | 'danger' | 'info' {
  if (action === 'publish_enable' || action === 'candidate_approve') return 'success';
  if (action === 'publish_disable' || action === 'candidate_reject') return 'danger';
  if (action.startsWith('pet_policy') || action.endsWith('hold')) return 'warning';
  return 'info';
}

function ledgerStatus(item: AdminApiLedgerItem) {
  if (item.latestStatus === 'healthy') return { label: item.zeroResult ? '정상 0건' : '정상', tone: 'success' as const };
  if (item.latestStatus === 'warning') return { label: '주의', tone: 'warning' as const };
  if (item.latestStatus === 'failed') return { label: '실패', tone: 'danger' as const };
  if (item.latestStatus === 'hold') return { label: '보류', tone: 'muted' as const };
  return { label: '미실행', tone: 'muted' as const };
}

function formatSla(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}분`;
  if (hours < 24) return `${hours}시간`;
  return `${Math.round(hours / 24)}일`;
}

export function OperationsPanel({ crowd, syncRuns, syncErrors, candidates, sourceHealth, auditEvents, auditAvailable, enrichmentCoverage, apiLedger }: { crowd: AdminCrowdSummary; syncRuns: AdminSyncRun[]; syncErrors: AdminSyncError[]; candidates: AdminCandidate[]; sourceHealth: AdminSourceHealth[]; auditEvents: AdminAuditEvent[]; auditAvailable: boolean; enrichmentCoverage: AdminEnrichmentCoverage[]; apiLedger: AdminApiLedgerItem[] }) {
  const [tab, setTab] = useState<'crowd' | 'runs' | 'errors' | 'audit'>('crowd');
  const maxLevelCount = Math.max(1, ...Object.values(crowd.byLevel));
  const reviewCount = candidates.filter((candidate) => candidate.ingestionStatus === 'candidate' || candidate.ingestionStatus === 'stale').length;

  return (
    <div className="space-y-6">
      {/* 지표 카드는 값 길이가 달라도 같은 높이를 유지한다. 숫자 카드와 배지
          카드가 섞여 있어 items-stretch와 h-full 없이는 줄이 어긋난다. */}
      <section className="grid grid-cols-2 items-stretch gap-4 md:grid-cols-5"><div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><Activity className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">오늘 예측</p><p className="mt-auto pt-1 text-3xl font-black text-white">{crowd.todayRows}</p></div><div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><BarChart3 className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">전체 예측</p><p className="mt-auto pt-1 text-3xl font-black text-white">{crowd.totalRows}</p></div><div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><Clock3 className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">최신 예측 날짜</p><p className="mt-auto pt-1 text-lg font-black text-white">{crowd.latestForecastDate ?? '없음'}</p></div><div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><AlertCircle className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">상태</p><div className="mt-auto pt-2"><AdminStatusBadge label={crowd.stale ? 'STALE' : 'HEALTHY'} tone={crowd.stale ? 'warning' : 'success'} /></div></div><div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><ShieldAlert className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">검수 대기</p><p className="mt-auto pt-1 text-3xl font-black text-white">{reviewCount}</p></div></section>
      <section className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-5 md:p-6"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Source Health</p><h2 className="mt-2 text-xl font-black text-white">원천별 최신 상태</h2></div><span className="text-xs text-[#8f9bb3]">48시간 SLA</span></div><div className="mt-5 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">{sourceHealth.map((source) => <div key={source.source} className="flex h-full flex-col rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4"><div className="flex items-start justify-between gap-2"><p className="text-sm font-black text-white">{source.source}</p><AdminStatusBadge label={source.freshness === 'fresh' ? '신선' : source.freshness === 'stale' ? '오래됨' : '미확인'} tone={source.freshness === 'fresh' ? 'success' : source.freshness === 'stale' ? 'warning' : 'muted'} /></div><p className="mt-2 flex-1 text-xs text-[#8f9bb3]">{source.lastCompletedAt ? formatDate(source.lastCompletedAt) : '완료 이력 없음'}</p><p className="mt-2 text-[11px] text-[#d0c6ab]">{source.fetched} fetched · {source.upserted} upserted · {source.errors} errors</p></div>)}{sourceHealth.length === 0 ? <p className="col-span-full rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">원천별 실행 이력이 없습니다.</p> : null}</div></section>
      <section className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Approved API Ledger</p>
            <h2 className="mt-2 text-xl font-black text-white">승인 API 14개 관리대장</h2>
            <p className="mt-2 text-xs leading-relaxed text-[#d0c6ab]">운영 전환 준비, 최근 수집, 검수 대기와 만료 상태를 한 화면에서 확인합니다.</p>
          </div>
          <Database className="h-5 w-5 text-[#ffd700]" />
        </div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-[#3e495d]/30">
          <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
            <caption className="sr-only">승인된 공공 API 14개 운영 현황</caption>
            <thead className="bg-[#0b1326] text-[#d0c6ab]">
              <tr><th className="p-3">API</th><th className="p-3">계정·구현</th><th className="p-3">주기·SLA</th><th className="p-3">최근 상태</th><th className="p-3">수집 결과</th><th className="p-3">검수</th><th className="p-3">만료</th></tr>
            </thead>
            <tbody>
              {apiLedger.map((item) => {
                const status = ledgerStatus(item);
                return (
                  <tr key={item.apiKey} className="border-t border-[#3e495d]/30 align-top text-[#d0c6ab]">
                    <td className="p-3"><p className="font-black text-white">{item.displayName}</p><p className="mt-1 text-[11px] text-[#8f9bb3]">{item.provider.toUpperCase()} · {item.apiKey}</p></td>
                    <td className="p-3"><p>{item.accountStage}</p><p className="mt-1 text-[11px] text-[#8f9bb3]">{item.implementationStatus} · {item.reviewPolicy}</p></td>
                    <td className="p-3"><p>{item.scheduleLabel}</p><p className="mt-1 text-[11px] text-[#8f9bb3]">SLA {formatSla(item.freshnessSlaHours)}</p></td>
                    <td className="p-3"><div className="flex items-center gap-2"><span aria-hidden className={status.tone === 'success' ? 'text-emerald-300' : status.tone === 'danger' ? 'text-rose-300' : status.tone === 'warning' ? 'text-amber-300' : 'text-[#8f9bb3]'}>●</span><AdminStatusBadge label={status.label} tone={status.tone} /></div><p className="mt-2 text-[11px] text-[#8f9bb3]">{formatDate(item.latestCompletedAt)} · {item.freshness}</p></td>
                    <td className="p-3"><p>{item.fetched} 조회 · {item.upserted} 저장</p><p className={`mt-1 text-[11px] ${item.errors > 0 ? 'text-rose-200' : 'text-[#8f9bb3]'}`}>오류 {item.errors}건</p></td>
                    <td className="p-3"><p>승인 {item.reviewCounts.approved} · 대기 {item.reviewCounts.pending}</p><p className="mt-1 text-[11px] text-[#8f9bb3]">보류 {item.reviewCounts.hold} · 제외 {item.reviewCounts.excluded}</p></td>
                    <td className="p-3"><AdminStatusBadge label={item.expirationStatus === 'expired' ? '만료' : item.expirationStatus === 'expiring' ? '만료 임박' : '유효'} tone={item.expirationStatus === 'expired' ? 'danger' : item.expirationStatus === 'expiring' ? 'warning' : 'success'} /><p className="mt-2 text-[11px] text-[#8f9bb3]">{item.expiresAt}</p></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {apiLedger.length === 0 ? <p className="p-5 text-sm text-[#8f9bb3]">API 관리대장을 불러오지 못했습니다.</p> : null}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[#8f9bb3]">두루누비는 수원과 교차하는 코스가 없으면 0건이어도 정상입니다. 검수 승인 전 데이터는 앱 공개 응답에 포함되지 않습니다.</p>
      </section>
      <section className="rounded-3xl border border-[#ffd700]/20 bg-[#171f33]/80 p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Manual Operations</p>
            <h2 className="mt-2 text-2xl font-black text-white">GitHub Actions 수동 동기화</h2>
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[#d0c6ab]">
              이 콘솔은 동기화 상태를 읽기 전용으로 보여줍니다. 실행하려면 GitHub Actions에서 <span className="font-black text-white">Run workflow</span>를 누르고 작업을 선택하세요. 웹 앱에는 GitHub 토큰을 보관하지 않습니다.
            </p>
          </div>
          <a href={KTO_SYNC_WORKFLOW_URL} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#ffd700]/50 px-4 py-3 text-xs font-black text-[#ffd700] transition hover:bg-[#ffd700]/10">
            워크플로 열기
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <div className="mt-5 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {manualSyncJobs.map((job) => (
            <a key={job.id} href={KTO_SYNC_WORKFLOW_URL} target="_blank" rel="noreferrer" className="group flex h-full flex-col rounded-2xl border border-[#3e495d]/40 bg-[#0b1326]/60 p-4 transition hover:border-[#ffd700]/40">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-white">{job.label}</p>
                <ExternalLink className="h-4 w-4 text-[#8f9bb3] transition group-hover:text-[#ffd700]" />
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-[#8f9bb3]">{job.description}</p>
              <p className="mt-3 text-[11px] font-bold text-[#ffd700]">Run workflow에서 `{job.id}` 선택</p>
            </a>
          ))}
        </div>
        <div className="mt-7 border-t border-[#3e495d]/30 pt-6">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Approved Public Data</p>
              <h3 className="mt-2 text-lg font-black text-white">승인 API 추가 수집</h3>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#d0c6ab]">
                공개 데이터 워크플로에서 작업을 선택합니다. 검수 전 후보는 관리자 화면에만 남고, 경기도 버스는 정류장 매핑 승인 전까지 보류입니다.
              </p>
            </div>
            <a href={PUBLIC_DATA_SYNC_WORKFLOW_URL} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#ffd700]/50 px-4 py-3 text-xs font-black text-[#ffd700] transition hover:bg-[#ffd700]/10">
              공개 데이터 워크플로
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-5 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publicManualSyncJobs.map((job) => (
              <a key={job.id} href={PUBLIC_DATA_SYNC_WORKFLOW_URL} target="_blank" rel="noreferrer" className="group flex h-full flex-col rounded-2xl border border-[#3e495d]/40 bg-[#0b1326]/60 p-4 transition hover:border-[#ffd700]/40">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-white">{job.label}</p>
                  <ExternalLink className="h-4 w-4 text-[#8f9bb3] transition group-hover:text-[#ffd700]" />
                </div>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-[#8f9bb3]">{job.description}</p>
                <p className="mt-3 text-[11px] font-bold text-[#ffd700]">Run workflow에서 `{job.id}` 선택</p>
              </a>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Content Coverage</p>
            <h2 className="mt-2 text-xl font-black text-white">공개 장소에 붙은 부가 정보</h2>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#d0c6ab]">
              동기화가 돌았는지와 별개로, 화면에 실제로 표시되는 정보가 얼마나 채워졌는지 보여줍니다. 비율이 낮은 항목은 원천에 데이터가 없는 경우가 많습니다.
            </p>
          </div>
          <Layers className="h-5 w-5 shrink-0 text-[#ffd700]" />
        </div>
        <div className="mt-5 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {enrichmentCoverage.map((coverage) => {
            const percent = coverage.publishedPlaces > 0
              ? Math.round((coverage.places / coverage.publishedPlaces) * 100)
              : 0;
            return (
              <div key={coverage.key} className="flex h-full flex-col rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-black text-white">{coverage.label}</p>
                  <p className="text-xs font-bold text-[#ffd700]">{`${percent}%`}</p>
                </div>
                <p className="mt-2 text-2xl font-black text-white">
                  {coverage.places}
                  <span className="ml-1 text-sm font-bold text-[#8f9bb3]">{`/ ${coverage.publishedPlaces}곳`}</span>
                </p>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#3e495d]/40"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${coverage.label} 채움 비율`}
                >
                  <div className="h-full rounded-full bg-[#ffd700]" style={{ width: `${percent}%` }} />
                </div>
                {coverage.items !== null ? (
                  <p className="mt-3 text-[11px] font-bold text-[#d0c6ab]">{`연결 ${coverage.items}건`}</p>
                ) : null}
                <p className="mt-auto pt-2 text-[11px] leading-relaxed text-[#8f9bb3]">{coverage.note}</p>
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-5 md:p-6"><div className="flex flex-wrap gap-2 border-b border-[#3e495d]/30 pb-5">{([['crowd', '방문 집중도'], ['runs', 'Sync Runs'], ['errors', 'Errors'], ['audit', `운영 이력 ${auditEvents.length}`]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-full px-4 py-2 text-xs font-black transition ${tab === value ? 'bg-[#ffd700] text-[#3a3000]' : 'bg-[#0b1326]/70 text-[#8f9bb3] hover:text-white'}`}>{label}</button>)}</div>
        {tab === 'crowd' ? <div className="mt-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Forecast Health</p><h2 className="mt-2 text-2xl font-black text-white">방문 집중도 예측 분포</h2></div><p className="text-xs text-[#8f9bb3]">마지막 원천 갱신: {formatDate(crowd.latestSourceUpdatedAt)}</p></div><div className="mt-6 grid gap-4 md:grid-cols-3">{Object.entries(crowd.byLevel).map(([level, count]) => <div key={level} className="rounded-2xl bg-[#0b1326]/60 p-4"><div className="flex items-center justify-between text-sm font-bold text-white"><span>{level}</span><span>{count}</span></div><div className="mt-3 h-2 rounded-full bg-[#2d3449]"><div className="h-full rounded-full bg-[#ffd700] transition-all" style={{ width: `${Math.max(4, (count / maxLevelCount) * 100)}%` }} /></div></div>)}</div>{crowd.missingTodayPlaceNames.length > 0 ? <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5"><p className="text-sm font-black text-amber-100">오늘 예측이 없는 공개 장소</p><p className="mt-2 text-xs leading-relaxed text-amber-100/80">{crowd.missingTodayPlaceNames.join(' · ')}</p></div> : <div className="mt-6 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-5 text-sm font-bold text-emerald-100">공개 장소에 대한 오늘 예측이 모두 연결되어 있습니다.</div>}<p className="mt-6 text-xs leading-relaxed text-[#8f9bb3]">예측 데이터가 36시간 이상 갱신되지 않았거나 최신 날짜가 오늘보다 이전이면 STALE로 표시합니다. 예측 재실행은 원천 수집 파이프라인에서 처리합니다.</p></div> : null}
        {tab === 'runs' ? <div className="mt-6 space-y-3">{syncRuns.map((run) => <div key={run.id} className="rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex items-center gap-3"><Clock3 className="h-4 w-4 text-[#ffd700]" /><div><p className="text-sm font-black text-white">{run.source}</p><p className="mt-1 text-xs text-[#8f9bb3]">{formatDate(run.startedAt)} → {formatDate(run.completedAt)}</p></div></div><div className="flex flex-wrap items-center gap-3 text-xs text-[#d0c6ab]"><span>fetched {run.itemsFetched}</span><span>upserted {run.itemsUpserted}</span><span>errors {run.errorCount}</span><AdminStatusBadge label={run.isStale ? 'STALE' : run.status} tone={run.isStale || run.status === 'failed' ? 'danger' : run.errorCount > 0 ? 'warning' : 'success'} /></div></div><details className="mt-3 text-xs text-[#8f9bb3]"><summary className="cursor-pointer font-bold text-[#d0c6ab]">metadata 펼치기</summary><pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-[#060e20] p-3">{JSON.stringify(run.metadata, null, 2)}</pre></details></div>)}{syncRuns.length === 0 ? <p className="rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">sync run 이력이 없습니다.</p> : null}</div> : null}
        {tab === 'errors' ? <div className="mt-6 space-y-3">{syncErrors.map((item) => <details key={item.id} className="group rounded-2xl border border-rose-300/20 bg-rose-300/5 p-4"><summary className="flex cursor-pointer list-none flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex items-center gap-3"><AlertCircle className="h-4 w-4 text-rose-200" /><div><p className="text-sm font-black text-white">{item.endpoint}</p><p className="mt-1 text-xs text-[#8f9bb3]">{formatDate(item.createdAt)} · contentId {item.contentId ?? '없음'}</p></div></div><div className="flex items-center gap-3"><AdminStatusBadge label={item.errorCode ?? 'UNKNOWN'} tone="danger" /><ChevronDown className="h-4 w-4 text-[#8f9bb3] transition group-open:rotate-180" /></div></summary><p className="mt-4 rounded-xl bg-[#0b1326]/80 p-3 text-xs leading-relaxed text-rose-100">{item.message}</p></details>)}{syncErrors.length === 0 ? <p className="rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">최근 sync 오류가 없습니다.</p> : null}</div> : null}
        {tab === 'audit' ? (
          <div className="mt-6">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Audit Trail</p>
                <h2 className="mt-2 text-2xl font-black text-white">누가 무엇을 바꿨는지</h2>
              </div>
              <p className="text-xs text-[#8f9bb3]">공개 전환·코스 편집·검수 결정을 최근 순으로 보여줍니다.</p>
            </div>
            <div className="mt-6 space-y-3">
              {auditEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <History className="h-4 w-4 shrink-0 text-[#ffd700]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">
                          {auditActionLabels[event.action] ?? event.action}
                        </p>
                        <p className="mt-1 text-xs text-[#8f9bb3]">
                          {formatDate(event.createdAt)} · {event.entityType} {event.entityId.slice(0, 8)}
                          {typeof event.metadata.source === 'string' ? ` · ${event.metadata.source}` : ''}
                        </p>
                      </div>
                    </div>
                    <AdminStatusBadge label={event.action} tone={auditTone(event.action)} />
                  </div>
                </div>
              ))}
              {auditEvents.length === 0 && auditAvailable ? (
                <p className="rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">
                  기록된 운영 이력이 없습니다. 공개 전환이나 검수를 실행하면 이 목록에 남습니다.
                </p>
              ) : null}
              {!auditAvailable ? (
                <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5 text-sm text-amber-100">
                  <p className="font-black">운영 이력을 읽을 수 없습니다</p>
                  <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
                    변경 기록은 정상적으로 저장되고 있지만, 조회용 함수가 아직 배포되지 않았습니다.
                    <span className="font-bold"> supabase/migrations/20260918190000_expose_admin_audit_reader.sql</span>을 적용하면 이 목록이 표시됩니다.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
