const levelStyles: Record<string, string> = {
  여유: 'bg-emerald-300 text-emerald-950',
  보통: 'bg-amber-200 text-amber-950',
  혼잡: 'bg-rose-300 text-rose-950',
};

export function StatusPill({ level, label }: { level: string | null; label?: string }) {
  const safeLevel = level ?? '예보 확인 중';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black ${levelStyles[safeLevel] ?? 'bg-slate-200 text-slate-900'}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{label ?? safeLevel}</span>;
}
