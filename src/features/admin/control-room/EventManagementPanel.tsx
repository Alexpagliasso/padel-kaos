import { AlertTriangle } from 'lucide-react'

export function EventManagementPanel() {
  return (
    <section className="rounded border border-white/10 bg-[#171717] p-5">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="size-5 text-[#FFD000]" />
        <h2 className="text-xl font-black">Event Management</h2>
      </div>
      <div className="grid gap-2">
        <button type="button" className="rounded bg-white/10 px-3 py-3 font-black text-white/45" disabled>End Round</button>
        <button type="button" className="rounded bg-white/10 px-3 py-3 font-black text-white/45" disabled>Pause Event</button>
        <button type="button" className="rounded border border-red-400/30 px-3 py-3 font-black text-red-200/50" disabled>Emergency Controls</button>
      </div>
    </section>
  )
}
