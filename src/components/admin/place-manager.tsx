'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle, FileText, ImageIcon, MapPin, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { updatePlaceCopyAction, updatePlacePublishStateAction } from '@/app/actions/admin';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import { isAwaitingPublish, publishBlockers, readinessLabels } from '@/lib/admin/readiness';
import type { AdminPlace, AdminPlaceCopy } from '@/lib/admin/types';

type Filter = 'all' | 'published' | 'unpublished' | 'missing-copy' | 'ready';

const copyFields: Array<{ key: keyof AdminPlaceCopy; label: string; placeholder: string; multiline?: boolean }> = [
  { key: 'displayName', label: '표시 이름', placeholder: '공개 페이지에 표시할 이름' },
  { key: 'shortDescription', label: '한 줄 설명', placeholder: '카드에 표시할 짧은 설명', multiline: true },
  { key: 'nightHighlight', label: '야간 포인트', placeholder: '밤에 이 장소를 추천하는 이유', multiline: true },
  { key: 'photoTip', label: '포토 팁', placeholder: '촬영 시간·구도·빛 정보', multiline: true },
  { key: 'missionTitle', label: '미션 제목', placeholder: '방문 미션 제목' },
  { key: 'missionBody', label: '미션 본문', placeholder: '방문 미션 안내', multiline: true },
  { key: 'missionPrompt', label: '미션 질문', placeholder: '사용자에게 던질 질문', multiline: true },
  { key: 'coupleQuestion', label: '커플 질문', placeholder: '함께 방문한 사람을 위한 질문', multiline: true },
  { key: 'shortStory', label: '짧은 이야기', placeholder: '장소에 대한 editorial story', multiline: true },
];

function inputClassName() {
  return 'mt-2 w-full rounded-xl border border-[#3e495d]/60 bg-[#0b1326]/80 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-[#64708a] focus:border-[#ffd700] focus:ring-2 focus:ring-[#ffd700]/15';
}

export function PlaceManager({
  places,
  initialPlaceId,
  initialFilter,
}: {
  places: AdminPlace[];
  initialPlaceId?: string;
  initialFilter?: string;
}) {
  const router = useRouter();
  const initialPlace = places.find((place) => place.id === initialPlaceId) ?? places[0] ?? null;
  const [filter, setFilter] = useState<Filter>(
    initialFilter === 'published' || initialFilter === 'unpublished' || initialFilter === 'missing-copy' || initialFilter === 'ready'
      ? initialFilter
      : 'all',
  );
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialPlace?.id ?? null);
  const [copyDraft, setCopyDraft] = useState<AdminPlaceCopy>(initialPlace?.copy ?? emptyCopy());
  const [publishDraft, setPublishDraft] = useState({
    isPublished: initialPlace?.isPublished ?? false,
    displayPriority: initialPlace?.displayPriority ?? 0,
    isNowGoodEnabled: initialPlace?.isNowGoodEnabled ?? false,
    nightSuitabilityScore: initialPlace?.nightSuitabilityScore ?? 0,
    recommendedFrom: initialPlace?.recommendedFrom ?? null,
    recommendedUntil: initialPlace?.recommendedUntil ?? null,
    recommendationBoost: initialPlace?.recommendationBoost ?? 0,
    opsMemo: initialPlace?.opsMemo ?? null,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = places.find((place) => place.id === selectedId) ?? null;
  const blockers = selected ? publishBlockers(selected) : [];
  // "공개 준비 완료" means the only thing left to do is flip the switch, so an
  // already published place does not belong here. The dashboard card links in
  // with filter=ready and counts with the same helper, so both surfaces agree.
  const readyCount = places.filter(isAwaitingPublish).length;

  function selectPlace(place: AdminPlace) {
    setSelectedId(place.id);
    setCopyDraft(place.copy);
    setPublishDraft({
      isPublished: place.isPublished,
      displayPriority: place.displayPriority,
      isNowGoodEnabled: place.isNowGoodEnabled,
      nightSuitabilityScore: place.nightSuitabilityScore,
      recommendedFrom: place.recommendedFrom,
      recommendedUntil: place.recommendedUntil,
      recommendationBoost: place.recommendationBoost,
      opsMemo: place.opsMemo,
    });
    setMessage(null);
  }

  const filteredPlaces = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return places.filter((place) => {
      const matchesFilter = filter === 'all'
        || (filter === 'published' && place.isPublished)
        || (filter === 'unpublished' && !place.isPublished)
        || (filter === 'missing-copy' && (!place.copy.shortDescription || !place.copy.nightHighlight))
        || (filter === 'ready' && isAwaitingPublish(place));
      const matchesSearch = !normalizedSearch || [place.displayName, place.officialName, place.slug, place.ktoContentId ?? ''].join(' ').toLowerCase().includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    });
  }, [filter, places, search]);

  function savePublishState() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updatePlacePublishStateAction({ placeId: selected.id, ...publishDraft });
      setMessage(result.success ? { type: 'success', text: result.message } : { type: 'error', text: result.error });
      if (result.success) router.refresh();
    });
  }

  function saveCopy() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updatePlaceCopyAction({ placeId: selected.id, ...copyDraft });
      setMessage(result.success ? { type: 'success', text: result.message } : { type: 'error', text: result.error });
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.65fr)]">
      <section className="min-w-0 rounded-3xl border border-white/10 bg-[#171f33]/80 p-5 md:p-6">
        <div className="flex flex-col gap-4 border-b border-[#3e495d]/30 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {([
              ['all', `전체 ${places.length}`],
              ['published', `공개 ${places.filter((place) => place.isPublished).length}`],
              ['unpublished', `비공개 ${places.filter((place) => !place.isPublished).length}`],
              ['missing-copy', `보강 필요 ${places.filter((place) => !place.copy.shortDescription || !place.copy.nightHighlight).length}`],
              ['ready', `공개 준비 완료 ${readyCount}`],
            ] as Array<[Filter, string]>).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full border px-3 py-2 text-xs font-black transition ${filter === value ? 'border-[#ffd700]/60 bg-[#ffd700]/15 text-[#ffd700]' : 'border-[#3e495d]/40 text-[#8f9bb3] hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="relative block min-w-[220px]">
            <span className="sr-only">장소 검색</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#8f9bb3]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClassName()} mt-0 pl-9`} placeholder="이름·slug·KTO ID 검색" />
          </label>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-[#3e495d]/30 text-[11px] uppercase tracking-wider text-[#8f9bb3]">
              <tr><th className="px-3 py-3">장소</th><th className="px-3 py-3">공개</th><th className="px-3 py-3">공개 준비</th><th className="px-3 py-3">문구</th><th className="px-3 py-3">미디어</th><th className="px-3 py-3">우선순위</th></tr>
            </thead>
            <tbody className="divide-y divide-[#3e495d]/20">
              {filteredPlaces.map((place) => {
                const placeBlockers = publishBlockers(place);
                return (
                <tr key={place.id} className={`cursor-pointer transition hover:bg-[#0b1326]/50 ${selectedId === place.id ? 'bg-[#ffd700]/5' : ''}`} onClick={() => selectPlace(place)}>
                  <td className="px-3 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0b1326] text-[#ffd700]"><MapPin className="h-4 w-4" /></div><div><p className="font-bold text-white">{place.displayName}</p><p className="mt-1 text-[11px] text-[#8f9bb3]">{place.ktoContentId ?? 'KTO ID 없음'}</p></div></div></td>
                  <td className="px-3 py-4"><AdminStatusBadge label={place.isPublished ? 'PUBLIC' : 'DRAFT'} tone={place.isPublished ? 'success' : 'muted'} /></td>
                  <td className="px-3 py-4">
                    {placeBlockers.length === 0
                      ? <AdminStatusBadge label="준비 완료" tone="success" />
                      : <span title={placeBlockers.map((blocker) => readinessLabels[blocker]).join(', ')}><AdminStatusBadge label={`${placeBlockers.length}개 보완`} tone="warning" /></span>}
                  </td>
                  <td className="px-3 py-4">{place.copy.shortDescription && place.copy.nightHighlight ? <CheckCircle className="h-4 w-4 text-emerald-300" /> : <FileText className="h-4 w-4 text-amber-300" />}</td>
                  <td className="px-3 py-4">{place.heroImageUrl ? <ImageIcon className="h-4 w-4 text-emerald-300" /> : <ImageIcon className="h-4 w-4 text-amber-300" />}</td>
                  <td className="px-3 py-4 text-sm font-bold text-[#d0c6ab]">{place.displayPriority}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {filteredPlaces.length === 0 ? <p className="py-12 text-center text-sm text-[#8f9bb3]">조건에 맞는 장소가 없습니다.</p> : null}
        </div>
      </section>

      {selected ? (
        <aside className="rounded-3xl border border-[#ffd700]/20 bg-[#171f33]/95 p-5 shadow-2xl md:p-6" aria-label={`${selected.displayName} 편집 패널`}>
          <div className="flex items-start justify-between gap-4 border-b border-[#3e495d]/30 pb-5">
            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Place Editor</p><h2 className="mt-2 text-2xl font-black text-white">{selected.displayName}</h2><p className="mt-1 text-xs text-[#8f9bb3]">원본: {selected.officialName}</p></div>
            <button type="button" onClick={() => setSelectedId(null)} className="rounded-lg p-2 text-[#8f9bb3] hover:bg-[#0b1326] hover:text-white" aria-label="편집 닫기"><X className="h-4 w-4" /></button>
          </div>

          <div className="mt-5 space-y-6">
            <section>
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black text-[#fff6df]">공개 상태</h3><AdminStatusBadge label={publishDraft.isPublished ? 'PUBLIC' : 'DRAFT'} tone={publishDraft.isPublished ? 'success' : 'muted'} /></div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-[#3e495d]/40 bg-[#0b1326]/60 p-3 text-xs font-bold text-white"><input type="checkbox" checked={publishDraft.isPublished} onChange={(event) => setPublishDraft((draft) => ({ ...draft, isPublished: event.target.checked }))} className="accent-[#ffd700]" /> 공개</label>
                <label className="flex items-center gap-2 rounded-xl border border-[#3e495d]/40 bg-[#0b1326]/60 p-3 text-xs font-bold text-white"><input type="checkbox" checked={publishDraft.isNowGoodEnabled} onChange={(event) => setPublishDraft((draft) => ({ ...draft, isNowGoodEnabled: event.target.checked }))} className="accent-[#ffd700]" /> 지금 추천</label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-[#d0c6ab]">노출 우선순위<input type="number" min="0" value={publishDraft.displayPriority} onChange={(event) => setPublishDraft((draft) => ({ ...draft, displayPriority: Number(event.target.value) }))} className={inputClassName()} /></label><label className="text-xs font-bold text-[#d0c6ab]">야간 적합도<input type="number" min="0" max="100" value={publishDraft.nightSuitabilityScore} onChange={(event) => setPublishDraft((draft) => ({ ...draft, nightSuitabilityScore: Number(event.target.value) }))} className={inputClassName()} /></label></div>
              <label className="mt-3 block text-xs font-bold text-[#d0c6ab]">운영 메모<textarea value={publishDraft.opsMemo ?? ''} onChange={(event) => setPublishDraft((draft) => ({ ...draft, opsMemo: event.target.value }))} className={`${inputClassName()} min-h-20`} /></label>

              {/* Show exactly what blocks publication so the operator does not
                  have to guess which field is missing. */}
              {blockers.length > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    공개 전 보완할 항목 {blockers.length}개
                  </div>
                  <ul className="mt-2 space-y-1">
                    {blockers.map((blocker) => (
                      <li key={blocker} className="text-[11px] text-amber-100/85">· {readinessLabels[blocker]}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 p-3 text-xs font-bold text-emerald-100">
                  <CheckCircle className="h-3.5 w-3.5" />
                  공개 조건을 모두 만족했습니다.
                </p>
              )}

              <button type="button" disabled={isPending} onClick={savePublishState} className="mt-3 w-full rounded-xl bg-[#ffd700] px-4 py-3 text-sm font-black text-[#3a3000] transition hover:bg-[#ffe16d] disabled:cursor-wait disabled:opacity-50">{isPending ? '저장 중…' : '공개 상태 저장'}</button>
            </section>

            <section className="border-t border-[#3e495d]/30 pt-6"><h3 className="text-sm font-black text-[#fff6df]">Editorial 문구</h3><div className="mt-3 space-y-3">{copyFields.map((field) => { const value = copyDraft[field.key] ?? ''; return <label key={field.key} className="block text-xs font-bold text-[#d0c6ab]">{field.label}{field.multiline ? <textarea value={value} onChange={(event) => setCopyDraft((draft) => ({ ...draft, [field.key]: event.target.value }))} placeholder={field.placeholder} className={`${inputClassName()} min-h-20`} /> : <input value={value} onChange={(event) => setCopyDraft((draft) => ({ ...draft, [field.key]: event.target.value }))} placeholder={field.placeholder} className={inputClassName()} />}</label>; })}</div><button type="button" disabled={isPending} onClick={saveCopy} className="mt-4 w-full rounded-xl border border-[#ffd700]/50 px-4 py-3 text-sm font-black text-[#ffd700] transition hover:bg-[#ffd700]/10 disabled:cursor-wait disabled:opacity-50">{isPending ? '저장 중…' : '운영 문구 저장'}</button></section>

            <section className="border-t border-[#3e495d]/30 pt-5"><p className="text-xs font-bold text-[#8f9bb3]">KTO 주소</p><p className="mt-1 text-sm text-white">{selected.addressFull ?? '주소 정보 없음'}</p><p className="mt-4 text-xs font-bold text-[#8f9bb3]">공개 미리보기</p>{selected.isPublished ? <Link href={`/places/${selected.slug}`} className="mt-2 inline-flex text-sm font-black text-[#ffd700]">서비스 상세 열기 →</Link> : <p className="mt-2 text-xs text-amber-200">현재 비공개라 공개 상세가 없습니다.</p>}</section>
            <div aria-live="polite" className={`rounded-xl p-3 text-xs font-bold ${message?.type === 'error' ? 'bg-rose-400/10 text-rose-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{message?.text ?? '필드를 편집한 후 저장하세요.'}</div>
          </div>
        </aside>
      ) : <div className="rounded-3xl border border-dashed border-[#3e495d]/40 p-10 text-center text-sm text-[#8f9bb3]">편집할 장소를 선택하세요.</div>}
    </div>
  );
}

function emptyCopy(): AdminPlaceCopy {
  return { id: null, displayName: null, shortDescription: null, nightHighlight: null, photoTip: null, missionTitle: null, missionBody: null, missionPrompt: null, coupleQuestion: null, shortStory: null };
}
