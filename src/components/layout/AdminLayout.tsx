import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { AsistenteIA } from '@/components/ui/AsistenteIA'

export default function AdminLayout() {
  // El admin sigue diseñado para 1280+ · marca el body para conservar el min-width
  useEffect(() => {
    document.body.classList.add('admin-view')
    return () => { document.body.classList.remove('admin-view') }
  }, [])

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <main className="pl-[220px]">
        <div className="p-8 max-w-[1600px]">
          <Outlet />
        </div>
      </main>
      <AsistenteIA />
    </div>
  )
}
