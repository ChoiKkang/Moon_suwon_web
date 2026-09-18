'use client';

import { useState } from 'react';
import { Activity, AlertCircle, BarChart3, ChevronDown, Clock3, ExternalLink } from 'lucide-react';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import type { AdminCrowdSummary, AdminSyncError, AdminSyncRun } from '@/lib/admin/types';

const KTO_SYNC_WORKFLOW_URL = 'https://github.com/ChoiKkang/Moon_suwon_web/actions/workflows/kto-data-sync.yml';

const manualSyncJobs = [
  { id: 'content', label: '장소·이미지', description: 'KTO 장소와 대표 이미지를 갱신합니다.' },
  { id: 'crowd', label: '방문 집중도 예측', description: '일 단위 방문 집중도 예측을 갱신합니다.' },
  { id: 'pet', label: '반려동물 정보', description: '장소별 반려동물 동반 정책을 갱신합니다.' },
] as const;

function formatDate(value: string | null) {
  if (!value) return '정보 없음';
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function OperationsPanel({ crowd, syncRuns, syncErrors }: { crowd: AdminCrowdSummary; syncRuns: AdminSyncRun[]; syncErrors: AdminSyncError[] }) {
  const [tab, setTab] = useState<'crowd' | 'runs' | 'errors'>('crowd');
  const maxLevelCount = Math.max(1, ...Object.values(crowd.byLevel));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4"><div className="rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><Activity className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">오늘 예측</p><p className="mt-1 text-3xl font-black text-white">{crowd.todayRows}</p></div><div className="rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><BarChart3 className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">전체 예측</p><p className="mt-1 text-3xl font-black text-white">{crowd.totalRows}</p></div><div className="rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><Clock3 className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">최신 예측 날짜</p><p className="mt-1 text-lg font-black text-white">{crowd.latestForecastDate ?? '없음'}</p></div><div className="rounded-2xl border border-white/10 bg-[#171f33]/80 p-5"><AlertCircle className="h-5 w-5 text-[#ffd700]" /><p className="mt-4 text-xs font-bold text-[#d0c6ab]">상태</p><div className="mt-2"><AdminStatusBadge label={crowd.stale ? 'STALE' : 'HEALTHY'} tone={crowd.stale ? 'warning' : 'success'} /></div></div></section>
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
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {manualSyncJobs.map((job) => (
            <a key={job.id} href={KTO_SYNC_WORKFLOW_URL} target="_blank" rel="noreferrer" className="group rounded-2xl border border-[#3e495d]/40 bg-[#0b1326]/60 p-4 transition hover:border-[#ffd700]/40">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-white">{job.label}</p>
                <ExternalLink className="h-4 w-4 text-[#8f9bb3] transition group-hover:text-[#ffd700]" />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#8f9bb3]">{job.description}</p>
              <p className="mt-3 text-[11px] font-bold text-[#ffd700]">Run workflow에서 `{job.id}` 선택</p>
            </a>
          ))}
        </div>
      </section>
      <section className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-5 md:p-6"><div className="flex flex-wrap gap-2 border-b border-[#3e495d]/30 pb-5">{([['crowd', '방문 집중도'], ['runs', 'Sync Runs'], ['errors', 'Errors']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-full px-4 py-2 text-xs font-black transition ${tab === value ? 'bg-[#ffd700] text-[#3a3000]' : 'bg-[#0b1326]/70 text-[#8f9bb3] hover:text-white'}`}>{label}</button>)}</div>
        {tab === 'crowd' ? <div className="mt-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Forecast Health</p><h2 className="mt-2 text-2xl font-black text-white">방문 집중도 예측 분포</h2></div><p className="text-xs text-[#8f9bb3]">마지막 원천 갱신: {formatDate(crowd.latestSourceUpdatedAt)}</p></div><div className="mt-6 grid gap-4 md:grid-cols-3">{Object.entries(crowd.byLevel).map(([level, count]) => <div key={level} className="rounded-2xl bg-[#0b1326]/60 p-4"><div className="flex items-center justify-between text-sm font-bold text-white"><span>{level}</span><span>{count}</span></div><div className="mt-3 h-2 rounded-full bg-[#2d3449]"><div className="h-full rounded-full bg-[#ffd700] transition-all" style={{ width: `${Math.max(4, (count / maxLevelCount) * 100)}%` }} /></div></div>)}</div>{crowd.missingTodayPlaceNames.length > 0 ? <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5"><p className="text-sm font-black text-amber-100">오늘 예측이 없는 공개 장소</p><p className="mt-2 text-xs leading-relaxed text-amber-100/80">{crowd.missingTodayPlaceNames.join(' · ')}</p></div> : <div className="mt-6 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-5 text-sm font-bold text-emerald-100">공개 장소에 대한 오늘 예측이 모두 연결되어 있습니다.</div>}<p className="mt-6 text-xs leading-relaxed text-[#8f9bb3]">예측 데이터가 36시간 이상 갱신되지 않았거나 최신 날짜가 오늘보다 이전이면 STALE로 표시합니다. 예측 재실행은 원천 수집 파이프라인에서 처리합니다.</p></div> : null}
        {tab === 'runs' ? <div className="mt-6 space-y-3">{syncRuns.map((run) => <div key={run.id} className="rounded-2xl border border-[#3e495d]/30 bg-[#0b1326]/60 p-4"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex items-center gap-3"><Clock3 className="h-4 w-4 text-[#ffd700]" /><div><p className="text-sm font-black text-white">{run.source}</p><p className="mt-1 text-xs text-[#8f9bb3]">{formatDate(run.startedAt)} → {formatDate(run.completedAt)}</p></div></div><div className="flex flex-wrap items-center gap-3 text-xs text-[#d0c6ab]"><span>fetched {run.itemsFetched}</span><span>upserted {run.itemsUpserted}</span><span>errors {run.errorCount}</span><AdminStatusBadge label={run.isStale ? 'STALE' : run.status} tone={run.isStale || run.status === 'failed' ? 'danger' : run.errorCount > 0 ? 'warning' : 'success'} /></div></div><details className="mt-3 text-xs text-[#8f9bb3]"><summary className="cursor-pointer font-bold text-[#d0c6ab]">metadata 펼치기</summary><pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-[#060e20] p-3">{JSON.stringify(run.metadata, null, 2)}</pre></details></div>)}{syncRuns.length === 0 ? <p className="rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">sync run 이력이 없습니다.</p> : null}</div> : null}
        {tab === 'errors' ? <div className="mt-6 space-y-3">{syncErrors.map((item) => <details key={item.id} className="group rounded-2xl border border-rose-300/20 bg-rose-300/5 p-4"><summary className="flex cursor-pointer list-none flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex items-center gap-3"><AlertCircle className="h-4 w-4 text-rose-200" /><div><p className="text-sm font-black text-white">{item.endpoint}</p><p className="mt-1 text-xs text-[#8f9bb3]">{formatDate(item.createdAt)} · contentId {item.contentId ?? '없음'}</p></div></div><div className="flex items-center gap-3"><AdminStatusBadge label={item.errorCode ?? 'UNKNOWN'} tone="danger" /><ChevronDown className="h-4 w-4 text-[#8f9bb3] transition group-open:rotate-180" /></div></summary><p className="mt-4 rounded-xl bg-[#0b1326]/80 p-3 text-xs leading-relaxed text-rose-100">{item.message}</p></details>)}{syncErrors.length === 0 ? <p className="rounded-2xl bg-[#0b1326]/60 p-5 text-sm text-[#8f9bb3]">최근 sync 오류가 없습니다.</p> : null}</div> : null}
      </section>
    </div>
  );
}
