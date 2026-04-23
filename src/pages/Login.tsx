import { useState } from 'react'
import { useAuth } from '@/stores/authStore'
import { ShieldCheck } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await login(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  return (
    <div className="min-h-screen grid place-items-center bg-bg">
      <div className="surface p-10 w-[440px]">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-display text-2xl font-extrabold">StoreControl</div>
            <div className="text-xs text-slate-400 font-mono">HLA · EASA Part 145</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full mt-1"
              placeholder="tunombre@hla.es"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full mt-1"
              required
            />
          </div>
          {error && (
            <div className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg p-3">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? 'Verificando…' : 'Entrar'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t text-center text-xs text-slate-500 font-mono">
          Acceso restringido · Personal autorizado Logística HLA
        </div>
      </div>
    </div>
  )
}
