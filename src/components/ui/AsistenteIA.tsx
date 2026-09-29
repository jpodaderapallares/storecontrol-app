// StoreControl · Asistente IA flotante
// Botón flotante bottom-right. Al pulsar abre un chat panel.
// Llama a la Edge Function sk-assistant con el historial.
// Sin persistencia: la conversación vive en el estado del componente.

import { useState, useRef, useEffect } from 'react'
import {
  Sparkles, X, Send, Loader2, MessageCircle, User as UserIcon,
} from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/authStore'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

const SAMPLE_QUESTIONS_SK = [
  '¿Cómo escaneo un QR desde el PC?',
  '¿Qué es el check-in semanal?',
  'El QR de un torquímetro no abre el cert, ¿qué hago?',
  '¿Cómo doy de baja una herramienta rota?',
]
const SAMPLE_QUESTIONS_ADMIN = [
  '¿Cómo purgo las alertas vencidas de golpe?',
  '¿Dónde veo qué herramientas vencen en octubre?',
  '¿Cómo cambio el idioma por defecto?',
  '¿Cuál es el flujo de traslado entre bases?',
]

export function AsistenteIA() {
  const { usuario, base } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const isAdmin = usuario?.rol === 'admin'
  const samples = isAdmin ? SAMPLE_QUESTIONS_ADMIN : SAMPLE_QUESTIONS_SK

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, enviando])

  async function enviar(texto?: string) {
    const contenido = (texto ?? input).trim()
    if (!contenido || enviando) return
    setError(null)
    const nuevos: Message[] = [
      ...messages,
      { role: 'user', content: contenido, ts: Date.now() },
    ]
    setMessages(nuevos)
    setInput('')
    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const url = (import.meta.env.VITE_SUPABASE_URL as string) + '/functions/v1/sk-assistant'
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nuevos.map(m => ({ role: m.role, content: m.content })),
          role: isAdmin ? 'admin' : 'storekeeper',
          base: base?.codigo_iata ?? null,
        }),
      })
      const body = await r.json().catch(() => null)
      if (!r.ok || !body?.ok) {
        setError(body?.error ?? ('Error HTTP ' + r.status))
        return
      }
      setMessages(prev => [...prev, { role: 'assistant', content: body.reply, ts: Date.now() }])
    } catch (e: any) {
      setError('Red: ' + (e?.message ?? String(e)))
    } finally {
      setEnviando(false)
    }
  }

  if (!usuario) return null

  return (
    <>
      {/* Botón flotante */}
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className={clsx(
            'fixed bottom-6 right-6 z-40',
            'w-14 h-14 rounded-full shadow-lg',
            'bg-gradient-to-br from-pink-500 via-purple-500 to-accent',
            'grid place-items-center text-white',
            'hover:scale-105 transition-transform',
            'ring-2 ring-white/10',
          )}
          aria-label="Abrir asistente IA"
          title="Asistente IA · pregúntame lo que necesites"
        >
          <Sparkles className="w-6 h-6" strokeWidth={2.2} />
        </button>
      )}

      {/* Panel de chat */}
      {abierto && (
        <div className="fixed bottom-6 right-6 z-40 w-[380px] max-w-[calc(100vw-24px)] h-[560px] max-h-[calc(100vh-48px)] surface flex flex-col overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-4 py-3 border-b border-bg-border flex items-center gap-3 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-accent/10">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 grid place-items-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold leading-none">Asistente StoreControl</div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Claude Haiku · {isAdmin ? 'modo admin' : 'modo storekeeper'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="p-1.5 rounded hover:bg-bg-elevated"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-4">
                <MessageCircle className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <div className="text-sm text-slate-300 font-medium mb-1">Hola {usuario.nombre?.split(' ')[0]}</div>
                <div className="text-xs text-slate-500 mb-4">
                  Pregúntame sobre la app, procedimientos o dudas del día.
                </div>
                <div className="space-y-1.5">
                  {samples.map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => enviar(q)}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs bg-bg-elevated hover:bg-bg-border text-slate-300 hover:text-slate-100 transition-colors border border-transparent hover:border-accent/30"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Burbuja key={i} msg={m} />
            ))}

            {enviando && (
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 grid place-items-center text-white flex-shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando…
              </div>
            )}
            {error && (
              <div className="text-danger text-xs bg-danger/10 border border-danger/30 rounded-lg p-2">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            className="border-t border-bg-border p-3 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); enviar() }}
          >
            <input
              className="input flex-1 text-sm"
              placeholder="Escribe tu pregunta…"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={enviando}
              autoFocus
            />
            <button
              type="submit"
              className="btn-primary px-3"
              disabled={!input.trim() || enviando}
              aria-label="Enviar"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}

function Burbuja({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={clsx('flex gap-2', isUser && 'flex-row-reverse')}>
      <div className={clsx(
        'w-7 h-7 rounded-lg grid place-items-center text-white flex-shrink-0',
        isUser
          ? 'bg-bg-elevated border border-bg-border text-slate-300'
          : 'bg-gradient-to-br from-pink-500 to-purple-500',
      )}>
        {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Sparkles className="w-4 h-4" />}
      </div>
      <div className={clsx(
        'max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words',
        isUser
          ? 'bg-accent/15 text-slate-100 border border-accent/30'
          : 'bg-bg-elevated text-slate-200 border border-bg-border',
      )}>
        {msg.content}
      </div>
    </div>
  )
}
