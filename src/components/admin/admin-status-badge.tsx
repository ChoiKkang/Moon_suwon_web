type StatusTone = 'success' | 'warning' | 'danger' | 'muted' | 'info';

const toneClass: Record<StatusTone, string> = {
  success: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200',
  warning: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
  danger: 'border-rose-300/25 bg-rose-300/10 text-rose-200',
  muted: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
  info: 'border-sky-300/25 bg-sky-300/10 text-sky-200',
};

export function AdminStatusBadge({ label, tone = 'muted' }: { label: string; tone?: StatusTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wide ${toneClass[tone]}`}>
      {label}
    </span>
  );
}
