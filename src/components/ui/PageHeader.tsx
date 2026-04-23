import type { ReactNode } from 'react'

export function PageHeader({
  title, subtitle, breadcrumb, actions,
}: {
  title: string
  subtitle?: string
  breadcrumb?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between mb-8">
      <div>
        {breadcrumb && (
          <div className="text-xs text-slate-500 font-mono mb-2">{breadcrumb}</div>
        )}
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
