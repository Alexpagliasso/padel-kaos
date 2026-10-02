import {useState} from 'react'
import {Alert,Button,Paper} from '@mui/material'
import {validateMatchLineup} from '../../domain/rules/rulesEngine'
import {useLineupRepository} from '../../repositories/lineupRepository'
import type {Match,Team} from '../types/domain'

export function LineupEditor({tournamentId,match,team,setNumber,title}:{tournamentId:string;match:Match;team:Team;setNumber:1|2;title?:string}){
  const repository=useLineupRepository();const persisted=match.lineups.find(item=>item.teamId===team.id&&item.setNumber===setNumber)
  const [selected,setSelected]=useState<string[]>(persisted?.activePlayerIds??[]);const [feedback,setFeedback]=useState('')
  const started=setNumber===1?Boolean(match.set1StartedAt):Boolean(match.set2StartedAt)||!match.set1EndedAt
  const used=match.lineups.filter(item=>item.teamId===team.id&&item.setNumber!==setNumber&&item.setNumber<3)
  const validation=validateMatchLineup({candidate:{activePlayerIds:selected},usedLineups:used,roster:team.players})
  const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):current.length<2?[...current,id]:[current[1],id])
  const save=async()=>{if(started||selected.length!==2||!validation.valid)return;setFeedback('');try{await repository.confirm({tournamentId,matchId:match.id,teamId:team.id,setNumber,playerIds:[selected[0],selected[1]]});setFeedback('Formazione confermata.')}catch(cause){setFeedback(cause instanceof Error?cause.message:'Impossibile confermare la formazione.')}}
  const bench=team.players.find(player=>!selected.includes(player.id))
  return <Paper variant="outlined" sx={{p:2}}><p className="text-xs font-black uppercase text-[var(--event-primary)]">{title??`${team.name} · Set ${setNumber}`}</p><p className="mt-1 text-xs text-white/55">Seleziona due giocatori. Il terzo resta in panchina.</p><div className="mt-3 grid gap-2">{team.players.map(player=><Button key={player.id} variant={selected.includes(player.id)?'contained':'outlined'} disabled={started} aria-pressed={selected.includes(player.id)} onClick={()=>toggle(player.id)} sx={{justifyContent:'flex-start',minHeight:44}}>{player.name}</Button>)}</div><p className="mt-2 text-sm text-white/60">Panchina: <strong>{selected.length===2?(bench?.name??'Da verificare'):'Seleziona la coppia'}</strong></p>{selected.length===2&&!validation.valid&&<Alert severity="warning" sx={{mt:2}}>{validation.reason}</Alert>}{feedback&&<Alert severity={feedback.includes('confermata')?'success':'error'} sx={{mt:2}}>{feedback}</Alert>}<Button fullWidth variant="contained" sx={{mt:2}} disabled={started||repository.isSaving||selected.length!==2||!validation.valid} onClick={()=>void save()}>{repository.isSaving?'SALVATAGGIO…':persisted?'AGGIORNA FORMAZIONE':'CONFERMA FORMAZIONE'}</Button>{started&&<p className="mt-2 text-xs font-bold text-amber-200">Il set è già iniziato: formazione non modificabile.</p>}</Paper>
}
