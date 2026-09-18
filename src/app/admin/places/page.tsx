import { getAdminCandidates, getAdminPlaces } from '@/lib/admin/queries';
import { PlaceManager } from '@/components/admin/place-manager';
import { CandidateReviewPanel } from '@/components/admin/candidate-review-panel';

export default async function AdminPlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string; filter?: string }>;
}) {
  const [{ data, error }, { data: candidates, error: candidatesError }, params] = await Promise.all([getAdminPlaces(), getAdminCandidates(), searchParams]);

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 p-6 md:p-12 xl:p-16">
      <header className="mb-8">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ffd700]">Place Editorial</p>
        <h1 className="mt-3 text-3xl font-black text-[#fff6df] md:text-5xl">장소 공개·문구 관리</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#d0c6ab]">
          KTO 원본은 보존하고, 공개 상태와 달빛수원 운영 문구만 안전하게 편집합니다.
        </p>
      </header>
      {error || candidatesError ? (
        <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">장소 운영 데이터를 불러오지 못했습니다. {error ?? candidatesError}</div>
      ) : (
        <>
          <CandidateReviewPanel candidates={candidates} />
          <PlaceManager places={data} initialPlaceId={params.place} initialFilter={params.filter} />
        </>
      )}
    </main>
  );
}
