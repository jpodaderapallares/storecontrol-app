// StoreControl · Modal de escaneo QR
// Abre la webcam (o webcam USB) y lee un QR con html5-qrcode.
// Cae siempre a un campo manual — nunca deja al usuario bloqueado.
// Al detectar un QR con la URL del propio dominio, navega a /qr/<slug>.
// Con cualquier otra URL, la abre directa en la misma pestaña.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, X, Keyboard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

// html5-qrcode se carga dinámicamente para no engordar el bundle inicial.
type QrCodeSuccessCallback = (decodedText: string, decodedResult: unknown) => void
type QrCodeErrorCallback = (errorMessage: string, error: unknown) => void
interface Html5QrcodeCtor {
  new (elementId: string, verbose?: boolean): {
    start: (
      cameraIdOrConfig: string | { facingMode: string } | { deviceId: { exact: string } },
      config: { fps: number; qrbox: { width: number; height: number } | number },
      qrCodeSuccessCallback: QrCodeSuccessCallback,
      qrCodeErrorCallback?: QrCodeErrorCallback,
    ) => Promise<void>
    stop: () => Promise<void>
    clear: () => void
  }
  getCameras: () => Promise<Array<{ id: string; label: string }>>
}
interface Html5QrcodeModule {
  Html5Qrcode: Html5QrcodeCtor
}

export function ScanQRModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const containerId = 'sc-qr-reader'
  const readerRef = useRef<InstanceType<Html5QrcodeCtor> | null>(null)
  const [permiso, setPermiso] = useState<'requesting' | 'granted' | 'denied' | 'unsupported'>('requesting')
  const [modo, setModo] = useState<'camara' | 'manual'>('camara')
  const [manualValue, setManualValue] = useState('')
  const [detectado, setDetectado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const origin = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), [])

  // Cargar html5-qrcode y arrancar cámara
  useEffect(() => {
    if (modo !== 'camara') return
    let cancelled = false

    async function init() {
      try {
        // @ts-ignore — carga dinámica desde el bundle
        const mod: Html5QrcodeModule = await import('html5-qrcode')
        if (cancelled) return
        const Html5Qrcode = mod.Html5Qrcode
        const reader = new Html5Qrcode(containerId, false)
        readerRef.current = reader

        const config = {
          fps: 10,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const min = Math.min(viewfinderWidth, viewfinderHeight)
            const side = Math.floor(min * 0.65)
            return { width: side, height: side }
          },
        } as any
        const onSuccess = (decodedText: string) => {
          if (cancelled) return
          setDetectado(decodedText)
          reader.stop().then(() => reader.clear()).catch(() => {})
          navegarAlResultado(decodedText)
        }
        const onError = () => { /* frames sin QR — silenciar */ }

        // 1) Enumerar cámaras. Si getCameras falla, cae a facingMode.
        let cameras: Array<{ id: string; label: string }> = []
        try {
          cameras = await Html5Qrcode.getCameras()
        } catch { /* fallback abajo */ }

        if (cameras && cameras.length > 0) {
          // Preferir cámara trasera en móvil; en PC coger la primera disponible
          const rear = cameras.find(c => /back|rear|environment/i.test(c.label))
          const target = rear ?? cameras[0]
          await reader.start(target.id, config, onSuccess, onError)
        } else {
          // Sin lista de cámaras: probar facingMode.environment y si peta, cualquier cámara
          try {
            await reader.start({ facingMode: 'environment' }, config, onSuccess, onError)
          } catch {
            await reader.start({ facingMode: 'user' as any }, config, onSuccess, onError)
          }
        }

        if (!cancelled) setPermiso('granted')
      } catch (e: any) {
        if (cancelled) return
        const msg = String(e?.message ?? e ?? '')
        if (/permission|denied|NotAllowed/i.test(msg)) {
          setPermiso('denied')
        } else if (/NotFound|NoDevices|OverconstrainedError/i.test(msg)) {
          setPermiso('unsupported')
        } else {
          setPermiso('denied')
          setError(msg || 'No se pudo acceder a la cámara')
        }
      }
    }
    init()

    return () => {
      cancelled = true
      const r = readerRef.current
      if (r) {
        r.stop().then(() => r.clear()).catch(() => {})
        readerRef.current = null
      }
    }
  }, [modo]) // eslint-disable-line react-hooks/exhaustive-deps

  function navegarAlResultado(raw: string) {
    setError(null)
    const val = raw.trim()
    if (!val) return
    // Caso 1: URL del propio dominio → SPA navigate
    if (origin && val.startsWith(origin)) {
      const path = val.slice(origin.length) || '/'
      onClose()
      nav(path)
      return
    }
    // Caso 2: URL externa completa → abrir en la misma pestaña
    if (/^https?:\/\//i.test(val)) {
      onClose()
      window.location.href = val
      return
    }
    // Caso 3: solo el slug (10 chars) → asumir /qr/<slug>
    if (/^[A-Za-z0-9]{6,32}$/.test(val)) {
      onClose()
      nav(`/qr/${val}`)
      return
    }
    // Caso 4: no reconocido
    setError('Código no reconocido: ' + val.slice(0, 60))
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault()
    if (!manualValue.trim()) return
    navegarAlResultado(manualValue)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-display font-extrabold leading-tight">Escanear QR</div>
              <div className="text-[11px] text-slate-500 font-mono">
                {modo === 'camara' ? 'Apunta el QR a la cámara' : 'Introduce el código a mano'}
              </div>
            </div>
          </div>
          <button className="btn-ghost px-2 py-1.5" onClick={onClose} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs modo */}
        <div className="flex gap-1 px-4 pt-4">
          <button
            onClick={() => setModo('camara')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              modo === 'camara'
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-bg-elevated',
            )}
          >
            <Camera className="w-4 h-4" /> Cámara
          </button>
          <button
            onClick={() => setModo('manual')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              modo === 'manual'
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-bg-elevated',
            )}
          >
            <Keyboard className="w-4 h-4" /> Introducir código
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {modo === 'camara' && (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black border border-bg-border" style={{ aspectRatio: '4/3' }}>
                <div id={containerId} className="w-full h-full" />

                {/* Overlay corners */}
                {permiso === 'granted' && !detectado && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 aspect-square border-2 border-success/60 rounded-xl" />
                  </div>
                )}

                {/* Estados */}
                {permiso === 'requesting' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/80 gap-2">
                    <Loader2 className="w-6 h-6 text-accent animate-spin" />
                    <div className="text-slate-300 text-sm">Solicitando cámara…</div>
                  </div>
                )}
                {permiso === 'denied' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/90 gap-2 px-6 text-center">
                    <AlertCircle className="w-7 h-7 text-warning" />
                    <div className="text-slate-200 text-sm font-medium">Sin acceso a la cámara</div>
                    <div className="text-slate-400 text-xs">
                      Permite la cámara en el candado de la barra del navegador y vuelve a abrir, o usa
                      "Introducir código".
                    </div>
                    <button className="btn-secondary mt-2" onClick={() => setModo('manual')}>
                      <Keyboard className="w-4 h-4" /> Introducir código
                    </button>
                  </div>
                )}
                {permiso === 'unsupported' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/90 gap-2 px-6 text-center">
                    <AlertCircle className="w-7 h-7 text-warning" />
                    <div className="text-slate-200 text-sm font-medium">
                      No se ha encontrado ninguna cámara
                    </div>
                    <div className="text-slate-400 text-xs">
                      Conecta una webcam USB o usa "Introducir código".
                    </div>
                    <button className="btn-secondary mt-2" onClick={() => setModo('manual')}>
                      <Keyboard className="w-4 h-4" /> Introducir código
                    </button>
                  </div>
                )}
                {detectado && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/90 gap-2">
                    <CheckCircle2 className="w-7 h-7 text-success" />
                    <div className="text-slate-200 text-sm font-medium">QR detectado</div>
                    <div className="text-slate-400 text-xs font-mono break-all px-4 text-center">
                      {detectado.slice(0, 80)}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <div className="text-slate-500">
                  Mantén el QR dentro del recuadro · lectura automática en 1–2 s
                </div>
                <button className="text-accent hover:underline" onClick={() => setModo('manual')}>
                  ¿No funciona? Introducir a mano
                </button>
              </div>
            </>
          )}

          {modo === 'manual' && (
            <form onSubmit={submitManual} className="space-y-3">
              <label className="block text-xs uppercase tracking-wider text-slate-400 font-medium">
                Código del documento o URL del QR
              </label>
              <input
                className="input w-full"
                value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                placeholder="ej: 9tk2mZaP4h  ó  https://…/qr/9tk2mZaP4h"
                autoFocus
              />
              <div className="text-[11px] text-slate-500">
                Pega la URL del QR o escribe el slug (10 caracteres). También sirve para lectores USB
                que "teclean" la URL automáticamente.
              </div>
              <button type="submit" className="btn-primary w-full justify-center" disabled={!manualValue.trim()}>
                <CheckCircle2 className="w-4 h-4" /> Abrir
              </button>
            </form>
          )}

          {error && (
            <div className="mt-3 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
