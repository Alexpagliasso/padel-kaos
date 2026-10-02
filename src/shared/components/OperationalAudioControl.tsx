import {Volume2,VolumeX} from 'lucide-react'
import type {Tournament} from '../types/domain'
import {useOperationalAudioAlerts} from '../hooks/useOperationalAudioAlerts'

export function OperationalAudioControl({tournament}:{tournament:Tournament}){
  const audio=useOperationalAudioAlerts(tournament)
  return <div className="flex items-center gap-2"><button type="button" title={audio.enabled?'Disattiva alert audio':'Attiva alert audio'} aria-label={audio.enabled?'Audio attivo, disattiva':'Attiva audio'} aria-pressed={audio.enabled} onClick={()=>void audio.toggle()} className="flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 text-sm font-black">{audio.enabled?<Volume2 className="size-5 text-[var(--event-primary)]"/>:<VolumeX className="size-5 text-white/55"/>}<span className="hidden sm:inline">{audio.enabled?'Audio attivo':'Attiva audio'}</span></button>{audio.lastAlert&&<span role="status" className="hidden text-xs font-bold text-white/55 lg:inline">{audio.lastAlert.label}</span>}</div>
}
