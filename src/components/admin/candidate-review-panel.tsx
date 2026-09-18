'use client';

import { Check, Clock3, ImageIcon, MapPin, RotateCcw, Search, ShieldAlert, X } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  resetPetPolicyOverrideAction,
  reviewPlaceCandidateAction,
  setPetPolicyOverrideAction,
} from '@/app/actions/admin';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import type { AdminCandidate, CandidateIngestionStatus } from '@/lib/admin/types';
import type { PetPolicy } from '@/lib/pet/policy';

type CandidateTab = CandidateIngestionStatus | 'all';

const policyLabels: Record<PetPolicy, string> = {
  allowed: '동반 가능',
  partial: '조건부 가능',
  not_allowed: '동반 불가',
  unknown: '확인 필요',
};

/**
 * KTO 콘텐츠 타입 이름. core.places.category는 원본이 비워 보내서 57건 전부
 * 비어 있고, 타입을 모르면 음식점과 숙박을 같은 화면에서 구분할 수 없다.
 */
const contentTypeLabels: Record<string, string> = {
  '12': '관광지',
  '14': '문화시설',
  '15': '행사',
  '28': '레포츠',
  '32': '숙박',
  '38': '쇼핑',
  '39': '음식점',
};

function contentTypeLabel(typeId: string | null): string {
  if (!typeId) return '분류 없음';
  return contentTypeLabels[typeId] ?? `타입 ${typeId}`;
}

function statusTone(status: CandidateIngestionStatus) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected') return 'danger' as const;
  if (status === 'stale') return 'warning' as const;
  return 'info' as const;
}

function statusLabel(status: CandidateIngestionStatus) {
  return { candidate: '검수 대기', approved: '승인됨', rejected: '제외됨', stale: '오래됨' }[status];
}

function formatDate(value: string | null) {
  if (!value) return '정보 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '정보 없음' : date.toLocaleDateString('ko-KR');
}

export function CandidateReviewPanel({ candidates }: { candidates: AdminCandidate[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<CandidateTab>('candidate');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [policy, setPolicy] = useState<PetPolicy>('unknown');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = candidates.find((candidate) => candidate.placeId === selectedId) ?? null;
  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('ko-KR');
    return candidates.filter((candidate) => {
      const statusMatches = tab === 'all' || candidate.ingestionStatus === tab;
      const typeMatches = typeFilter === 'all' || (candidate.ktoContentTypeId ?? '') === typeFilter;
      const searchMatches = !normalized || [candidate.displayName, candidate.officialName, candidate.slug, candidate.ktoContentId ?? '']
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(normalized);
      return statusMatches && typeMatches && searchMatches;
    });
  }, [candidates, search, tab, typeFilter]);

  function select(candidate: AdminCandidate) {
    setSelectedId(candidate.placeId);
    setPolicy(candidate.petPolicy);
    setNote(candidate.petNote ?? '');
    setMessage(null);
  }

  function runReview(decision: 'approve' | 'reject' | 'hold') {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const result = await reviewPlaceCandidateAction({ placeId: selected.placeId, decision, note });
      setMessage(result.success ? { type: 'success', text: result.message } : { type: 'error', text: result.error });
      if (result.success) router.refresh();
    });
  }

  function savePolicy() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const result = await setPetPolicyOverrideAction({ placeId: selected.placeId, policy, note: note.trim() || null });
      setMessage(result.success ? { type: 'success', text: result.message } : { type: 'error', text: result.error });
      if (result.success) router.refresh();
    });
  }

  function resetPolicy() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resetPetPolicyOverrideAction(selected.placeId);
      setMessage(result.success ? { type: 'success', text: result.message } : { type: 'error', text: result.error });
      if (result.success) router.refresh();
    });
  }

  const count = (status: CandidateTab) => status === 'all' ? candidates.length : candidates.filter((candidate) => candidate.ingestionStatus === status).length;

  // 상태 탭 안에서 다시 타입으로 나눠야 비슷한 후보를 묶어서 처리할 수 있다. 음식점 20곳은
  // 영업시간이 이미 확인된 상태이고 숙박 13곳은 야간 산책과 무관한 경우가 많아,
  // 같은 판단을 반복하는 후보끼리 모아 보는 편이 빠르다.
  const typeOptions = useMemo(() => {
    const inTab = candidates.filter((candidate) => tab === 'all' || candidate.ingestionStatus === tab);
    const counts = new Map<string, number>();
    for (const candidate of inTab) {
      const key = candidate.ktoContentTypeId ?? '';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [candidates, tab]);

  return (
    <section className="mb-8 rounded-3xl border border-[#ffd700]/20 bg-[#171f33]/80 p-5 md:p-6" aria-labelledby="candidate-review-title">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Source Review Inbox</p>
          <h2 id="candidate-review-title" className="mt-2 text-2xl font-black text-white">KTO 후보 검수</h2>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#d0c6ab]">수집 성공만으로 공개하지 않습니다. 후보를 승인한 뒤에도 공개 상태는 별도로 확인하고, 원본 정책이 불명확하면 수동 override를 남겨 주세요.</p>
        </div>
        <label className="relative block min-w-[250px]">
          <span className="sr-only">후보 검색</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#8f9bb3]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름·slug·KTO ID" className="w-full rounded-xl border border-[#3e495d]/60 bg-[#0b1326]/80 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-[#ffd700] focus:ring-2 focus:ring-[#ffd700]/15" />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="후보 상태 필터">
        {(['candidate', 'stale', 'approved', 'rejected', 'all'] as CandidateTab[]).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-full border px-3 py-2 text-xs font-black transition ${tab === value ? 'border-[#ffd700]/60 bg-[#ffd700]/15 text-[#ffd700]' : 'border-[#3e495d]/40 text-[#8f9bb3] hover:text-white'}`}>
            {value === 'all' ? '전체' : statusLabel(value)} {count(value)}
          </button>
        ))}
      </div>

      {typeOptions.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="콘텐츠 타입 필터">
          <button type="button" aria-pressed={typeFilter === 'all'} onClick={() => setTypeFilter('all')} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${typeFilter === 'all' ? 'border-[#ffd700]/50 bg-[#ffd700]/10 text-[#ffd700]' : 'border-[#3e495d]/40 text-[#8f9bb3] hover:text-white'}`}>
            모든 분류
          </button>
          {typeOptions.map(([typeId, typeCount]) => (
            <button key={typeId || 'none'} type="button" aria-pressed={typeFilter === typeId} onClick={() => setTypeFilter(typeId)} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${typeFilter === typeId ? 'border-[#ffd700]/50 bg-[#ffd700]/10 text-[#ffd700]' : 'border-[#3e495d]/40 text-[#8f9bb3] hover:text-white'}`}>
              {contentTypeLabel(typeId || null)} {typeCount}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-x-auto rounded-2xl border border-[#3e495d]/30">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-[#3e495d]/30 text-[11px] uppercase tracking-wider text-[#8f9bb3]"><tr><th className="px-3 py-3">후보</th><th className="px-3 py-3">상태</th><th className="px-3 py-3">반려동물</th><th className="px-3 py-3">완성도</th><th className="px-3 py-3">최근 확인</th></tr></thead>
            <tbody className="divide-y divide-[#3e495d]/20">
              {filtered.map((candidate) => (
                <tr key={candidate.placeId} onClick={() => select(candidate)} className={`cursor-pointer transition hover:bg-[#0b1326]/60 ${selectedId === candidate.placeId ? 'bg-[#ffd700]/5' : ''}`}>
                  <td className="px-3 py-4"><p className="font-bold text-white">{candidate.displayName}</p><p className="mt-1 text-[11px] text-[#8f9bb3]">{contentTypeLabel(candidate.ktoContentTypeId)}{candidate.category ? ` · ${candidate.category}` : ''}</p></td>
                  <td className="px-3 py-4"><AdminStatusBadge label={statusLabel(candidate.ingestionStatus)} tone={statusTone(candidate.ingestionStatus)} /></td>
                  <td className="px-3 py-4"><AdminStatusBadge label={policyLabels[candidate.petPolicy]} tone={candidate.petPolicy === 'unknown' ? 'warning' : candidate.petPolicy === 'not_allowed' ? 'danger' : 'success'} /></td>
                  <td className="px-3 py-4"><div className="flex items-center gap-2 text-xs text-[#d0c6ab]"><span title="좌표">{candidate.hasCoordinates ? <MapPin className="h-4 w-4 text-emerald-300" /> : <MapPin className="h-4 w-4 text-rose-300" />}</span><span title="대표 이미지">{candidate.hasHeroImage ? <ImageIcon className="h-4 w-4 text-emerald-300" /> : <ImageIcon className="h-4 w-4 text-amber-300" />}</span></div></td>
                  <td className="px-3 py-4 text-xs text-[#8f9bb3]">{formatDate(candidate.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? <p className="p-8 text-center text-sm text-[#8f9bb3]">조건에 맞는 후보가 없습니다.</p> : null}
        </div>

        {selected ? (
          <aside className="rounded-2xl border border-[#ffd700]/20 bg-[#0b1326]/70 p-5" aria-label={`${selected.displayName} 후보 검수`}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffd700]">Review Detail</p><h3 className="mt-2 text-xl font-black text-white">{selected.displayName}</h3><p className="mt-1 text-xs font-bold text-[#d0c6ab]">{contentTypeLabel(selected.ktoContentTypeId)}</p><p className="mt-1 text-xs text-[#8f9bb3]">{selected.addressFull ?? '주소 정보 없음'}</p></div><button type="button" aria-label="후보 상세 닫기" onClick={() => setSelectedId(null)} className="rounded-lg p-2 text-[#8f9bb3] hover:bg-[#171f33] hover:text-white"><X className="h-4 w-4" /></button></div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-[#171f33] p-3"><p className="text-[#8f9bb3]">원본 수정</p><p className="mt-1 font-bold text-white">{formatDate(selected.sourceModifiedAt)}</p></div><div className="rounded-xl bg-[#171f33] p-3"><p className="text-[#8f9bb3]">공개 상태</p><p className="mt-1 font-bold text-white">{selected.isPublished ? '공개' : '비공개'}</p></div></div>
            <div className="mt-5 rounded-xl border border-[#3e495d]/40 bg-[#171f33] p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[#ffd700]" /><p className="text-xs font-black text-white">검수 결정</p></div><p className="mt-2 text-xs leading-relaxed text-[#8f9bb3]">승인은 수집 후보 상태만 바꾸며 자동 공개하지 않습니다.</p><div className="mt-3 grid grid-cols-3 gap-2"><button type="button" disabled={isPending} onClick={() => runReview('approve')} className="rounded-lg bg-emerald-300/15 px-2 py-2 text-xs font-black text-emerald-100 hover:bg-emerald-300/25 disabled:opacity-50"><Check className="mx-auto mb-1 h-4 w-4" />승인</button><button type="button" disabled={isPending} onClick={() => runReview('hold')} className="rounded-lg bg-amber-300/15 px-2 py-2 text-xs font-black text-amber-100 hover:bg-amber-300/25 disabled:opacity-50"><Clock3 className="mx-auto mb-1 h-4 w-4" />보류</button><button type="button" disabled={isPending} onClick={() => runReview('reject')} className="rounded-lg bg-rose-300/15 px-2 py-2 text-xs font-black text-rose-100 hover:bg-rose-300/25 disabled:opacity-50"><X className="mx-auto mb-1 h-4 w-4" />제외</button></div></div>
            <div className="mt-4 rounded-xl border border-[#3e495d]/40 bg-[#171f33] p-4"><p className="text-xs font-black text-white">반려동물 정책 override</p><select value={policy} onChange={(event) => setPolicy(event.target.value as PetPolicy)} className="mt-3 w-full rounded-lg border border-[#3e495d]/60 bg-[#0b1326] px-3 py-2 text-sm text-white"><option value="allowed">동반 가능</option><option value="partial">조건부 가능</option><option value="not_allowed">동반 불가</option><option value="unknown">확인 필요</option></select><textarea value={note} maxLength={240} onChange={(event) => setNote(event.target.value)} placeholder="근거·운영 메모 (최대 240자)" className="mt-3 min-h-20 w-full rounded-lg border border-[#3e495d]/60 bg-[#0b1326] px-3 py-2 text-xs text-white outline-none focus:border-[#ffd700]" /><div className="mt-3 flex gap-2"><button type="button" disabled={isPending} onClick={savePolicy} className="flex-1 rounded-lg bg-[#ffd700] px-3 py-2 text-xs font-black text-[#3a3000] disabled:opacity-50">수동 적용</button>{selected.petPolicy !== 'unknown' || selected.petNote ? <button type="button" disabled={isPending} onClick={resetPolicy} className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#3e495d]/60 px-3 py-2 text-xs font-black text-[#d0c6ab] disabled:opacity-50"><RotateCcw className="h-3 w-3" />자동값</button> : null}</div></div>
            <div aria-live="polite" className={`mt-4 rounded-xl p-3 text-xs font-bold ${message?.type === 'error' ? 'bg-rose-400/10 text-rose-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{message?.text ?? '결정과 정책 override는 감사 로그에 기록됩니다.'}</div>
          </aside>
        ) : <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-[#3e495d]/40 p-8 text-center text-sm text-[#8f9bb3]">후보를 선택하면 검수·정책 작업을 할 수 있습니다.</div>}
      </div>
    </section>
  );
}
