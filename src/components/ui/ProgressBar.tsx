import clsx from 'clsx'

export function ProgressBar({ pct, className, showLabel = false }: {
  pct: number
  className?: string
  showLabel?: boolean
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  const color = clamped >= 85 ? 'bg-success' : clamped >= 60 ? 'bg-warning' : 'bg-danger'
  return (
    <div className={clsx('relative w-full', className)}>
      <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 text-xs font-mono text-slate-400">{clamped}%</div>
      )}
    </div>
  )
}
