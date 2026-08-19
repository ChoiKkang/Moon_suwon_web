import { getAdminEvents } from '@/lib/admin/queries';
import { EventManager } from '@/components/admin/event-manager';

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ event?: string; new?: string }> }) {
  const [{ data, error }, params] = await Promise.all([getAdminEvents(), searchParams]);
  return <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 p-6 md:p-12 xl:p-16"><header className="mb-8"><p className="text-xs font-black uppercase tracking-[0.28em] text-[#ffd700]">Event Curation</p><h1 className="mt-3 text-3xl font-black text-[#fff6df] md:text-5xl">행사 관리</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#d0c6ab]">KTO 행사 원본과 수동 행사 정보를 확인하고 기간·장소·운영 문구를 관리합니다.</p></header>{error ? <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">행사 데이터를 불러오지 못했습니다. {error}</div> : <EventManager events={data} initialEventId={params.event} initialNew={params.new === '1'} />}</main>;
}
