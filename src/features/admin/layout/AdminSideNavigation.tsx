import { NavLink } from 'react-router-dom'
import { cn } from '../../../shared/lib/cn'
import { adminNavigationItems } from './adminNavItems'

export function AdminNavigation() {
  return (
    <aside className="border-white/10 bg-[#101010] md:min-h-[calc(100svh-66px)] md:border-r">
      <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 md:grid md:w-64 md:px-3 md:py-5">
        {adminNavigationItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'inline-flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm font-black uppercase text-white/60 transition',
                isActive && 'bg-[#FFD000] text-black',
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
