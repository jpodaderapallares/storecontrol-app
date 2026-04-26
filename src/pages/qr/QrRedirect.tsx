// StoreControl · /qr/:slug · Ruta pública de redirección.
// Llama a la Edge Function qr-redirect, recibe la signed URL y reemplaza
// window.location. No requiere sesión: la Edge Function usa service_role.
// El módulo es independiente del resto de StoreControl.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/qr-redirect`
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? ''

type Estado =
  | { kind: 'loading' }
  | { kind: 'error'; mensaje: string }
  | { kind: 'redirecting'; filename: string }

export default function QrRedirect() {
  const { slug } = useParams<{ slug: string }>()
  const [estado, setEstado] = useState<Estado>({ kind: 'loading' })

  useEffect(() => {
    if (!slug) {
      setEstado({ kind: 'error', mensaje: 'Slug no proporcionado.' })
      return
    }
    if (!FN_URL || FN_URL === '/functions/v1/qr-redirect') {
      setEstado({ kind: 'error', mensaje: 'StoreControl no está configurado (falta VITE_SUPABASE_URL).' })
      return
    }
    resolver(slug)
  }, [slug])

  async function resolver(s: string) {
    try {
      const resp = await fetch(`${FN_URL}?s=${encodeURIComponent(s)}`, {
        method: 'GET',
        headers: ANON
          ? { apikey: ANON, Authorization: `Bearer ${ANON}` }
          : {},
      })
      if (resp.status === 404) {
        setEstado({ kind: 'error', mensaje: 'Documento no encontrado o eliminado.' })
        return
      }
      if (resp.status === 410) {
        setEstado({ kind: 'error', mensaje: 'Este documento ha caducado.' })
        return
      }
      const body = await resp.json().catch(() => null)
      if (!resp.ok || !body?.ok || !body.signedUrl) {
        setEstado({ kind: 'error', mensaje: body?.error ?? `HTTP ${resp.status}` })
        return
      }
      setEstado({ kind: 'redirecting', filename: body.filename ?? '' })
      // Pequeña pausa para que el usuario vea la confirmación
      setTimeout(() => {
        window.location.replace(body.signedUrl as string)
      }, 250)
    } catch (e: any) {
      setEstado({ kind: 'error', mensaje: e?.message ?? String(e) })
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="surface max-w-md w-full p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <div className="font-display text-xl font-extrabold leading-none">StoreControl</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">QR · HLA Logistics</div>
          </div>
        </div>

        {estado.kind === 'loading' && (
          <>
            <Loader2 className="w-8 h-8 text-accent mx-auto mb-3 animate-spin" />
            <div className="text-slate-300 text-sm">Resolviendo documento…</div>
            <div className="text-[11px] text-slate-500 font-mono mt-1">{slug}</div>
          </>
        )}

        {estado.kind === 'redirecting' && (
          <>
            <Loader2 className="w-8 h-8 text-success mx-auto mb-3 animate-spin" />
            <div className="text-slate-200 text-sm font-medium">
              {estado.filename || 'Abriendo documento'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Si no se abre automáticamente, recarga la página.
            </div>
          </>
        )}

        {estado.kind === 'error' && (
          <>
            <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
            <div className="text-slate-200 text-sm font-medium mb-2">
              No se pudo abrir el documento
            </div>
            <div className="text-xs text-slate-500 font-mono">{estado.mensaje}</div>
            <div className="text-[11px] text-slate-600 mt-4">
              Contacta con Logística HLA si crees que es un error.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
