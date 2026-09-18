'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Plus, Route, Save, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { generateCourseDraftsAction, saveCourseAction } from '@/app/actions/admin';
import type { AdminCourse, AdminPlace, CourseInput } from '@/lib/admin/types';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';

function fieldClass() {
  return 'mt-2 w-full rounded-xl border border-[#3e495d]/60 bg-[#0b1326]/80 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-[#64708a] focus:border-[#ffd700] focus:ring-2 focus:ring-[#ffd700]/15';
}

function fromCourse(course: AdminCourse): CourseInput {
  return {
    id: course.id,
    slug: course.slug,
    themeTags: course.themeTags,
    estimatedDurationMin: course.estimatedDurationMin,
    walkingDistanceKm: course.walkingDistanceKm,
    recommendedStartTime: course.recommendedStartTime,
    petReadyFlag: course.petReadyFlag,
    isPublished: course.isPublished,
    displayPriority: course.displayPriority,
    opsMemo: course.opsMemo,
    heroTitle: course.copy.heroTitle,
    subtitle: course.copy.subtitle,
    routeSummary: course.copy.routeSummary,
    ogTitle: course.copy.ogTitle,
    ogDescription: course.copy.ogDescription,
    ogImageUrl: course.copy.ogImageUrl,
    placeIds: [...course.places].sort((a, b) => a.orderIndex - b.orderIndex).map((place) => place.placeId),
    automationSource: course.automationSource,
  };
}

function emptyCourse(): CourseInput {
  return { slug: '', themeTags: [], estimatedDurationMin: 60, walkingDistanceKm: null, recommendedStartTime: '', petReadyFlag: false, isPublished: false, displayPriority: 0, opsMemo: '', heroTitle: '', subtitle: '', routeSummary: '', ogTitle: '', ogDescription: '', ogImageUrl: '', placeIds: [] };
}

export function CourseManager({
  courses,
  places,
  initialCourseId,
  initialNew,
}: {
  courses: AdminCourse[];
  places: AdminPlace[];
  initialCourseId?: string;
  initialNew: boolean;
}) {
  const router = useRouter();
  const firstId = initialNew ? null : initialCourseId ?? courses[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstId);
  const [draft, setDraft] = useState<CourseInput>(firstId ? fromCourse(courses.find((course) => course.id === firstId) ?? courses[0]) : emptyCourse());
  const [tagInput, setTagInput] = useState(draft.themeTags.join(', '));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(() => courses.find((course) => course.id === selectedId) ?? null, [courses, selectedId]);

  function selectCourse(id: string) {
    setSelectedId(id);
    const course = courses.find((item) => item.id === id);
    const next = course ? fromCourse(course) : emptyCourse();
    setDraft(next);
    setTagInput(next.themeTags.join(', '));
    setMessage(null);
  }

  function update<K extends keyof CourseInput>(key: K, value: CourseInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function togglePlace(placeId: string) {
    update('placeIds', draft.placeIds.includes(placeId) ? draft.placeIds.filter((id) => id !== placeId) : [...draft.placeIds, placeId]);
  }

  function movePlace(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.placeIds.length) return;
    const next = [...draft.placeIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    update('placeIds', next);
  }

  function createNew() {
    setSelectedId(null);
    setDraft(emptyCourse());
    setTagInput('');
    setMessage(null);
  }

  function save() {
    setMessage(null);
    const payload = { ...draft, themeTags: tagInput.split(',').map((tag) => tag.trim()).filter(Boolean) };
    startTransition(async () => {
      const result = await saveCourseAction(payload);
      setMessage(result.success ? { type: 'success', text: result.message } : { type: 'error', text: result.error });
      if (result.success) {
        if (result.courseId) setSelectedId(result.courseId);
        router.refresh();
      }
    });
  }

  function generateDrafts() {
    setMessage(null);
    startTransition(async () => {
      const result = await generateCourseDraftsAction();
      setMessage(result.success ? { type: 'success', text: result.message } : { type: 'error', text: result.error });
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className="rounded-3xl border border-white/10 bg-[#171f33]/80 p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Courses</p><h2 className="mt-2 text-xl font-black text-white">코스 목록</h2></div><button type="button" onClick={createNew} className="rounded-xl bg-[#ffd700] p-2 text-[#3a3000]" aria-label="새 코스 만들기"><Plus className="h-4 w-4" /></button></div>
        <div className="mt-5 space-y-3">{courses.map((course) => <button key={course.id} type="button" onClick={() => selectCourse(course.id)} className={`w-full rounded-2xl border p-4 text-left transition ${course.id === selectedId ? 'border-[#ffd700]/50 bg-[#ffd700]/10' : 'border-[#3e495d]/30 bg-[#0b1326]/60 hover:border-[#ffd700]/30'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-white">{course.copy.heroTitle || course.slug}</p><p className="mt-1 text-xs text-[#8f9bb3]">{course.places.length}개 스팟 · 우선순위 {course.displayPriority}</p></div><AdminStatusBadge label={course.isPublished ? 'PUBLIC' : 'DRAFT'} tone={course.isPublished ? 'success' : 'muted'} /></div></button>)}{courses.length === 0 ? <p className="rounded-2xl bg-[#0b1326]/60 p-4 text-sm text-[#8f9bb3]">아직 코스가 없습니다.</p> : null}</div>
      </section>

      <section className="rounded-3xl border border-[#ffd700]/20 bg-[#171f33]/90 p-5 md:p-7">
        <div className="flex flex-col justify-between gap-4 border-b border-[#3e495d]/30 pb-5 md:flex-row md:items-center"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd700]">Course Editor</p><h2 className="mt-2 text-2xl font-black text-white">{selected ? selected.copy.heroTitle || selected.slug : '새 코스'}</h2></div><div className="flex flex-wrap items-center gap-3"><AdminStatusBadge label={draft.isPublished ? 'PUBLIC' : 'DRAFT'} tone={draft.isPublished ? 'success' : 'muted'} /><button type="button" disabled={isPending} onClick={generateDrafts} className="inline-flex items-center gap-2 rounded-xl border border-[#ffd700]/40 px-4 py-2.5 text-sm font-black text-[#ffd700] disabled:opacity-50"><Sparkles className="h-4 w-4" />{isPending ? '생성 중…' : '자동 초안 생성'}</button><button type="button" disabled={isPending} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-[#ffd700] px-4 py-2.5 text-sm font-black text-[#3a3000] disabled:opacity-50"><Save className="h-4 w-4" />{isPending ? '저장 중…' : '저장'}</button></div></div>
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <label className="text-xs font-bold text-[#d0c6ab]">slug<input value={draft.slug} onChange={(event) => update('slug', event.target.value)} placeholder="night-wall-route" className={fieldClass()} /></label>
          <label className="text-xs font-bold text-[#d0c6ab]">코스 제목<input value={draft.heroTitle} onChange={(event) => update('heroTitle', event.target.value)} placeholder="야경 사진 집중 코스" className={fieldClass()} /></label>
          <label className="text-xs font-bold text-[#d0c6ab]">태그<input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="야경, 사진, 성곽" className={fieldClass()} /></label>
          <label className="text-xs font-bold text-[#d0c6ab]">부제<input value={draft.subtitle ?? ''} onChange={(event) => update('subtitle', event.target.value)} className={fieldClass()} /></label>
          <label className="text-xs font-bold text-[#d0c6ab]">예상 시간(분)<input type="number" min="1" value={draft.estimatedDurationMin} onChange={(event) => update('estimatedDurationMin', Number(event.target.value))} className={fieldClass()} /></label>
          <label className="text-xs font-bold text-[#d0c6ab]">도보 거리(km)<input type="number" min="0" step="0.1" value={draft.walkingDistanceKm ?? ''} onChange={(event) => update('walkingDistanceKm', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass()} /></label>
          <label className="text-xs font-bold text-[#d0c6ab]">추천 시작 시간<input value={draft.recommendedStartTime ?? ''} onChange={(event) => update('recommendedStartTime', event.target.value)} placeholder="19:00" className={fieldClass()} /></label>
          <label className="text-xs font-bold text-[#d0c6ab]">노출 우선순위<input type="number" min="0" value={draft.displayPriority} onChange={(event) => update('displayPriority', Number(event.target.value))} className={fieldClass()} /></label>
          <label className="flex items-center gap-2 rounded-xl border border-[#3e495d]/40 bg-[#0b1326]/60 p-3 text-xs font-bold text-white"><input type="checkbox" checked={draft.isPublished} onChange={(event) => update('isPublished', event.target.checked)} className="accent-[#ffd700]" /> 공개 상태</label>
          <label className="flex items-center gap-2 rounded-xl border border-[#3e495d]/40 bg-[#0b1326]/60 p-3 text-xs font-bold text-white"><input type="checkbox" checked={draft.petReadyFlag} onChange={(event) => update('petReadyFlag', event.target.checked)} className="accent-[#ffd700]" /> 반려동물 준비 코스</label>
          <label className="text-xs font-bold text-[#d0c6ab] lg:col-span-2">동선 요약<textarea value={draft.routeSummary ?? ''} onChange={(event) => update('routeSummary', event.target.value)} className={`${fieldClass()} min-h-24`} /></label>
          <label className="text-xs font-bold text-[#d0c6ab] lg:col-span-2">운영 메모<textarea value={draft.opsMemo ?? ''} onChange={(event) => update('opsMemo', event.target.value)} className={`${fieldClass()} min-h-20`} /></label>
        </div>

        <div className="mt-7 border-t border-[#3e495d]/30 pt-6"><div className="flex items-center justify-between"><div><h3 className="text-lg font-black text-white">코스 장소 순서</h3><p className="mt-1 text-xs text-[#8f9bb3]">공개 장소만 연결할 수 있습니다. 위·아래 버튼으로 순서를 바꿉니다.</p></div><Route className="h-5 w-5 text-[#ffd700]" /></div><div className="mt-4 space-y-2">{draft.placeIds.map((placeId, index) => { const place = places.find((item) => item.id === placeId); if (!place) return null; return <div key={placeId} className="flex items-center gap-3 rounded-xl border border-[#ffd700]/20 bg-[#ffd700]/5 p-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ffd700] text-xs font-black text-[#3a3000]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{place.displayName}</span><button type="button" onClick={() => movePlace(index, -1)} disabled={index === 0} className="rounded-lg p-2 text-[#d0c6ab] hover:bg-[#0b1326] disabled:opacity-30" aria-label={`${place.displayName} 위로 이동`}><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => movePlace(index, 1)} disabled={index === draft.placeIds.length - 1} className="rounded-lg p-2 text-[#d0c6ab] hover:bg-[#0b1326] disabled:opacity-30" aria-label={`${place.displayName} 아래로 이동`}><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => togglePlace(placeId)} className="rounded-lg p-2 text-rose-200 hover:bg-rose-400/10" aria-label={`${place.displayName} 제거`}><Trash2 className="h-4 w-4" /></button></div>; })}{draft.placeIds.length === 0 ? <p className="rounded-xl border border-dashed border-amber-300/30 bg-amber-300/5 p-4 text-sm text-amber-100">장소를 하나 이상 추가해야 공개할 수 있습니다.</p> : null}</div><div className="mt-4 flex flex-wrap gap-2">{places.filter((place) => !draft.placeIds.includes(place.id)).map((place) => <button key={place.id} type="button" onClick={() => togglePlace(place.id)} className="inline-flex items-center gap-1.5 rounded-full border border-[#3e495d]/50 px-3 py-2 text-xs font-bold text-[#d0c6ab] transition hover:border-[#ffd700]/50 hover:text-[#ffd700]"><Plus className="h-3.5 w-3.5" />{place.displayName}</button>)}</div></div>
        <div aria-live="polite" className={`mt-6 rounded-xl p-3 text-xs font-bold ${message?.type === 'error' ? 'bg-rose-400/10 text-rose-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{message?.text ?? '내용을 입력한 후 저장하세요.'}</div>
      </section>
    </div>
  );
}
