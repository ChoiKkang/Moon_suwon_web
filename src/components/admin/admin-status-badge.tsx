type StatusTone = 'success' | 'warning' | 'danger' | 'muted' | 'info';

const toneClass: Record<StatusTone, string> = {
  success: 'border-emerald-300/25 bg-[var(--status-success-surface)] text-emerald-200',
  warning: 'border-amber-300/25 bg-[var(--status-warning-surface)] text-amber-200',
  danger: 'border-rose-300/25 bg-[var(--status-danger-surface)] text-rose-200',
  muted: 'border-slate-400/20 bg-[var(--status-muted-surface)] text-slate-300',
  info: 'border-sky-300/25 bg-[var(--status-info-surface)] text-sky-200',
};

export function AdminStatusBadge({ label, tone = 'muted' }: { label: string; tone?: StatusTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wide ${toneClass[tone]}`}>
      {label}
    </span>
  );
}
