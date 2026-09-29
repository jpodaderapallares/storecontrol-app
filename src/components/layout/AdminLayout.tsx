import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { AsistenteIA } from '@/components/ui/AsistenteIA'

export default function AdminLayout() {
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
