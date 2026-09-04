import { Link, NavLink } from 'react-router-dom'
import { Activity, Crown, Radio, Shield, Trophy, Tv } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

const navItems = [
  { to: '/admin', label: 'Admin', icon: Shield },
  { to: '/player', label: 'Player', icon: Crown },
  { to: '/referee', label: 'Referee', icon: Radio },
  { to: '/court-display', label: 'Court', icon: Tv },
  { to: '/main-display', label: 'Main', icon: Trophy },
]

export function RoleShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-[#0B0B0B] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0B0B]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded bg-[#FFD000] text-black">
              <Activity className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-black uppercase tracking-[0.18em] text-[#FFD000]">
                Padel Kaos
              </span>
              <span className="block text-xs text-white/55">Realtime tournament control</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-bold text-white/65 transition',
                    isActive && 'bg-white/10 text-white',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}
