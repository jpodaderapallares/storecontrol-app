// StoreControl · Botón "Escanear QR"
// Componente visible y reutilizable. Dos variantes:
// - primary: bloque destacado tipo "call to action" (Storekeeper Home)
// - compact: botón inline (barra de acciones del Dashboard admin)
//
// Abre ScanQRModal al pulsar.

import { useState } from 'react'
import { ScanLine, Camera } from 'lucide-react'
import clsx from 'clsx'
import { ScanQRModal } from './ScanQRModal'

interface Props {
  variant?: 'primary' | 'compact'
  className?: string
  label?: string
  sublabel?: string
}

export function ScanQRButton({
  variant = 'primary',
  className,
  label,
  sublabel,
}: Props) {
  const [abierto, setAbierto] = useState(false)
  const finalLabel = label ?? 'Escanear QR'
  const finalSub = sublabel ?? 'Cámara del PC · certificado o herramienta'

  return (
    <>
      {variant === 'primary' ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className={clsx(
            'group w-full flex items-center gap-4 p-5 rounded-2xl',
            'bg-gradient-to-br from-accent/20 via-accent/10 to-cyan-500/10',
            'border border-accent/40 hover:border-accent',
            'shadow-[0_0_0_1px_rgba(59,130,246,0.1)] hover:shadow-[0_0_0_1px_rgba(59,130,246,0.35)]',
            'transition-all cursor-pointer text-left',
            className,
          )}
          aria-label="Activar cámara para escanear QR"
        >
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent to-cyan-500 grid place-items-center flex-shrink-0 shadow-lg shadow-accent/30 group-hover:scale-105 transition-transform">
            <ScanLine className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg font-extrabold text-white">
              {finalLabel}
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              {finalSub}
            </div>
          </div>
          <div className="text-accent text-2xl font-light group-hover:translate-x-1 transition-transform">
            ›
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className={clsx(
            'btn inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm',
            'bg-gradient-to-br from-accent to-cyan-500 text-white',
            'hover:brightness-110 shadow-md shadow-accent/25',
            'transition-all',
            className,
          )}
          aria-label="Activar cámara para escanear QR"
          title="Activa la cámara del PC para escanear un QR"
        >
          <Camera className="w-4 h-4" strokeWidth={2.5} />
          {finalLabel}
        </button>
      )}

      {abierto && <ScanQRModal onClose={() => setAbierto(false)} />}
    </>
  )
}
