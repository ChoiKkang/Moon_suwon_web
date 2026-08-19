import { getAdminOperations } from '@/lib/admin/queries';
import { OperationsPanel } from '@/components/admin/operations-panel';

export default async function AdminOperationsPage() {
  const { data, error } = await getAdminOperations();

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 p-6 md:p-12 xl:p-16">
      <header className="mb-8"><p className="text-xs font-black uppercase tracking-[0.28em] text-[#ffd700]">Operations Health</p><h1 className="mt-3 text-3xl font-black text-[#fff6df] md:text-5xl">혼잡도·동기화 현황</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#d0c6ab]">원천 데이터가 서비스 화면에 도달하는 마지막 상태를 확인합니다. 이 화면은 원천 데이터를 직접 수정하지 않습니다.</p></header>
      {error ? <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 text-sm text-amber-100">운영 이력을 불러오지 못했습니다. {error}</div> : <OperationsPanel {...data} />}
    </main>
  );
}
