import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './stores/authStore'
import Login from './pages/Login'
import AdminLayout from './components/layout/AdminLayout'
import StorekeeperLayout from './components/layout/StorekeeperLayout'
import Dashboard from './pages/admin/Dashboard'
import BaseDetail from './pages/admin/BaseDetail'
import Tareas from './pages/admin/Tareas'
import Usuarios from './pages/admin/Usuarios'
import Formatos from './pages/admin/Formatos'
import Alertas from './pages/admin/Alertas'
import BibliotecaAdmin from './pages/admin/Biblioteca'
import Auditoria from './pages/admin/Auditoria'
import Config from './pages/admin/Config'
import PlantillasEmail from './pages/admin/PlantillasEmail'
import StorekeeperHome from './pages/storekeeper/Home'
import StorekeeperBiblioteca from './pages/storekeeper/Biblioteca'

export default function App() {
  const { usuario, cargando, inicializar } = useAuth()
  useEffect(() => { inicializar() }, [inicializar])

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-slate-400 font-mono text-sm">Cargando StoreControl…</div>
      </div>
    )
  }

  if (!usuario) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (usuario.rol === 'admin') {
    return (
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin/base/:codigo" element={<BaseDetail />} />
          <Route path="/tareas" element={<Tareas />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/formatos" element={<Formatos />} />
          <Route path="/alertas" element={<Alertas />} />
          <Route path="/biblioteca" element={<BibliotecaAdmin />} />
          <Route path="/emails" element={<PlantillasEmail />} />
          <Route path="/auditoria" element={<Auditoria />} />
          <Route path="/config" element={<Config />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    )
  }

  // Storekeeper
  return (
    <Routes>
      <Route element={<StorekeeperLayout />}>
        <Route path="/base/:codigo" element={<StorekeeperHome />} />
        <Route path="/base/:codigo/biblioteca" element={<StorekeeperBiblioteca />} />
        <Route path="*" element={<Navigate to={`/base/${useAuth.getState().base?.codigo_iata ?? 'PMI'}`} replace />} />
      </Route>
    </Routes>
  )
}
