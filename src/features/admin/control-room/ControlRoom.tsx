import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, Paper, Stack, Tab, Tabs, Typography } from '@mui/material'
import { PageShell, SectionHeader, EmptyState, StatusChip } from '../../../shared/components/Foundation'
import type { Match, Tournament } from '../../../shared/types/domain'
import { useScheduleManagement } from '../../../repositories/scheduleRepository'
import { entryFromTournament, useWorkspaceStore, type WorkspaceEntry } from '../workspace/workspaceStore'
import { OperationsControls } from './OperationsControls'
import { getControlRoomRound, getCurrentRoundMatches, getOperationalAttention } from './controlRoomState'
import { useLiveOrchestrationRepository, type SetAction } from '../../../repositories/liveOrchestrationRepository'
import { SetTimer } from '../../../shared/components/SetTimer'
import { useSharedClock } from '../../../shared/hooks/useSharedClock'
import { getSetTimer } from '../../../domain/live/setTimer'
import { formatStatusLabel } from '../../../shared/lib/uiLabels'
import { CardPlayNotification } from '../../../shared/components/LiveEffects'
import { GlobalDiceReveal } from '../../../shared/components/GlobalDiceReveal'
import { LiveEventPresenter } from '../../../shared/components/LiveEventPresenter'
import { RefereeCourtAssignmentsPanel } from './RefereeCourtAssignmentsPanel'
import { dataProvider } from '../../../repositories'

type RegiaTab = 'overview' | 'turn' | 'live' | 'settings'

export function ControlRoom() {
  const workspace = useScheduleManagement()
  if (!workspace.entry) return <PageShell><EmptyState title="Seleziona o crea un torneo" /></PageShell>
  if (workspace.isLoading && !workspace.entry.local) return <PageShell><EmptyState title="Caricamento Regia" /></PageShell>
  if (workspace.error && !workspace.entry.local) return <PageShell><EmptyState title="Impossibile caricare la Regia" detail={workspace.error} /></PageShell>
  return <ControlRoomContent key={workspace.data.id} tournament={workspace.data} entry={workspace.entry} referees={workspace.referees} />
}

export function ControlRoomContent({ tournament, entry: providedEntry, referees = [] }: {
  tournament: Tournament; entry?: WorkspaceEntry; referees?: Array<{ courtId: string; name: string }>
  porTresPrizeDraft?: string; onPorTresPrizeChange?: (value: string) => void
  onActivatePorTres?: (prize: string) => void; onRollGlobalDice?: (matchId: string) => void
}) {
  const workspace = useWorkspaceStore()
  const live = useLiveOrchestrationRepository(tournament.id)
  const [tab,setTab]=useState<RegiaTab>('overview')
  const [intervention,setIntervention]=useState('')
  const [feedback,setFeedback]=useState('')
  const expiryRequests=useRef(new Set<string>())
  const entry = providedEntry ?? workspace.entries[tournament.id] ?? entryFromTournament(tournament)
  const round = getControlRoomRound(tournament)
  const matches = getCurrentRoundMatches(tournament, round)
  const now=useSharedClock()
  const completed = round?.completionCompletedMatches ?? matches.filter(match=>match.status==='completed'&&Boolean(match.resultConfirmedAt)).length
  const total = round?.completionTotalMatches || matches.length
  const blockers = round?.completionBlockers ?? []
  const active = matches.some(match=>['live_set_1','live_set_2','super_tiebreak'].includes(match.status))
  const scheduled = Boolean(round)&&matches.length>0&&matches.every(match=>['scheduled','ready'].includes(match.status))
  const cardsReady = tournament.cardsEnabled===false||Boolean(round?.cardReadinessReady)
  const winnerReports=tournament.eventWinnerReports?.filter(report=>report.status==='pending')??[]
  const attention=getOperationalAttention(tournament,round)
  const run=async(action:()=>Promise<unknown>,success:string)=>{setFeedback('');try{await action();setFeedback(success)}catch(cause){setFeedback(cause instanceof Error?cause.message:'Operazione non riuscita.')}}
  const startRound=()=>{if(!round)return;void run(()=>tournament.setControlMode==='referee'?live.openRound(round.id):live.controlRound(round.id,'start_set_1'),`${round.name} avviato.`)}
  useEffect(()=>{
    matches.forEach(match=>{const timer=getSetTimer(match,now);const key=`${match.id}:${timer?.setNumber??0}`;if(!timer?.expired||expiryRequests.current.has(key))return;expiryRequests.current.add(key);void live.expireSet(match.id).catch(()=>expiryRequests.current.delete(key))})
  },[live,matches,now])
  return <PageShell>
    <GlobalDiceReveal tournament={tournament} audience="admin"/><CardPlayNotification tournament={tournament} audience="admin"/><LiveEventPresenter tournament={tournament} audience="admin"/>
    <Stack direction={{xs:'column',md:'row'}} sx={{justifyContent:'space-between',gap:2}}><SectionHeader eyebrow="Regia" title={tournament.name} detail={round?.name??'Nessun turno configurato'}/><StatusChip label={entry.config.status}/></Stack>
    <Paper sx={{mb:3}}><Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Sezioni Regia"><Tab value="overview" label="PANORAMICA"/><Tab value="turn" label="TURNO"/><Tab value="live" label="LIVE"/><Tab value="settings" label="IMPOSTAZIONI"/></Tabs></Paper>
    {feedback&&<Alert severity={feedback.includes('non')?'error':'success'} sx={{mb:2}}>{feedback}</Alert>}
    {tab==='overview'&&<Stack spacing={3}>
      <Paper sx={{p:3}}><Typography variant="overline">TURNO CORRENTE</Typography><Typography variant="h2">{round?.name??'Nessun turno'}</Typography><Typography sx={{mt:2,fontSize:28,fontWeight:900}}>{completed} / {total} PARTITE CONCLUSE</Typography><Typography color="text.secondary">{active?'Turno in corso':scheduled?'Pronto per essere avviato':round?.status==='completed'?'Turno completato':'In preparazione'}</Typography></Paper>
      <Paper sx={{p:3}}><Typography variant="h3">RICHIEDONO ATTENZIONE</Typography><Stack spacing={1} sx={{mt:2}}>{attention.map(item=><Alert key={item.id} severity="warning">{item.message}</Alert>)}{blockers.length?blockers.map((blocker,index)=><Alert key={`${blocker.matchId}-${index}`} severity="warning"><b>{tournament.courts.find(court=>court.id===blocker.courtId)?.name??'Campo'}</b> — {blocker.reason}</Alert>):!attention.length?<Alert severity={scheduled?'info':'success'}>{scheduled?'Il turno è pronto.':'Nessun blocco operativo.'}</Alert>:null}{winnerReports.map(report=><Alert key={report.id} severity="warning" action={<Button color="inherit" disabled={live.isPending} onClick={()=>void live.resolveEventWinnerReport(report.id)}>CONFERMA</Button>}>Vincitore evento segnalato: {tournament.teams.find(team=>team.id===report.teamId)?.name??'Squadra'}</Alert>)}</Stack></Paper>
      <Paper sx={{p:3}}><Typography variant="overline">PROSSIMA AZIONE</Typography>{scheduled?<><Typography variant="h3" sx={{my:1}}>Avvia {round?.name}</Typography>{!cardsReady&&<Alert severity="warning" sx={{mb:2}}>ASSEGNA LE CARTE PRIMA DI AVVIARE IL TURNO · {round?.cardReadyTeams??0} / {round?.cardTotalTeams??matches.length*2} squadre pronte</Alert>}<Stack direction={{xs:'column',sm:'row'}} spacing={1}><Button variant="contained" size="large" disabled={live.isPending||!cardsReady} onClick={startRound}>{(round?.sequence??1)>1?'AVVIA TURNO SUCCESSIVO':'AVVIA TURNO'}</Button>{!cardsReady&&<Button variant="outlined" size="large" onClick={()=>setTab('live')}>ASSEGNA CARTE</Button>}</Stack></>:round?.completionReady?<Typography variant="h3">AVVIA TURNO SUCCESSIVO</Typography>:<><Typography variant="h3" color="warning.main">TURNO SUCCESSIVO BLOCCATO</Typography><Typography sx={{mt:1,fontWeight:800}}>{completed} / {total} partite concluse</Typography><Typography color="text.secondary">Completa tutte le partite, incluso ogni Super Tie-Break, e conferma i risultati finali.</Typography></>}</Paper>
    </Stack>}
    {tab==='turn'&&<Stack spacing={3}>
      <OperationsControls section="turn" entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name}/>
      {dataProvider === 'supabase' && <RefereeCourtAssignmentsPanel tournament={tournament} />}
      <Box><Typography variant="h2" sx={{mb:2}}>CAMPI</Typography>{!matches.length&&<Alert severity="info">Nessuna partita configurata</Alert>}<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr'},gap:2}}>{matches.map(match=><CourtCard key={match.id} tournament={tournament} match={match} referee={referees.find(item=>item.courtId===match.courtId)?.name} intervention={intervention===match.id} onToggle={()=>setIntervention(value=>value===match.id?'':match.id)} onAction={(action)=>{if(!window.confirm('Confermare l’intervento eccezionale della Regia?'))return;void run(()=>live.adminControlMatch(match.id,action),'Intervento Regia completato.')}} pending={live.isPending} cardsReady={cardsReady}/>)}</Box></Box>
    </Stack>}
    {tab==='live'&&<OperationsControls section="live" entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name}/>}
    {tab==='settings'&&<OperationsControls section="settings" entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name}/>}
  </PageShell>
}

function CourtCard({tournament,match,referee,intervention,onToggle,onAction,pending,cardsReady}:{tournament:Tournament;match:Match;referee?:string;intervention:boolean;onToggle:()=>void;onAction:(action:SetAction)=>void;pending:boolean;cardsReady:boolean}){
  const teamA=tournament.teams.find(team=>team.id===match.teamAId);const teamB=tournament.teams.find(team=>team.id===match.teamBId);const court=tournament.courts.find(item=>item.id===match.courtId)
  const blocker=tournament.rounds?.find(round=>round.id===match.roundId)?.completionBlockers?.find(item=>item.matchId===match.id)
  return <Paper sx={{p:3}}><Stack direction="row" sx={{justifyContent:'space-between',gap:2}}><Box><Typography color="primary" sx={{fontWeight:900}}>{court?.name??'Campo'}</Typography><Typography variant="h3" sx={{mt:1}}>{teamA?.shortName??'A'} vs {teamB?.shortName??'B'}</Typography></Box><Chip label={formatStatusLabel(match.status)}/></Stack><Box sx={{mt:2}}><SetTimer match={match} size="compact"/></Box><Typography sx={{mt:2,fontWeight:800}}>Set {match.score.currentSet} · {match.score.games.A}–{match.score.games.B}</Typography><Typography color="text.secondary">Arbitro · {referee??'Da assegnare'}</Typography>{blocker&&<Alert severity="warning" sx={{mt:2}}>{blocker.reason}</Alert>}{tournament.setControlMode==='referee'&&<><Button size="small" sx={{mt:2}} onClick={onToggle}>AZIONI REGIA</Button>{intervention&&<Stack direction="row" spacing={1} sx={{mt:1}}>{['scheduled','ready'].includes(match.status)&&<Button size="small" disabled={pending||!cardsReady} onClick={()=>onAction('start_set_1')}>Avvia Set 1</Button>}{match.status==='live_set_1'&&<Button size="small" color="warning" disabled={pending} onClick={()=>onAction('end_set_1')}>Termina Set 1</Button>}{match.status==='set_break'&&<Button size="small" disabled={pending} onClick={()=>onAction('start_set_2')}>Avvia Set 2</Button>}{match.status==='live_set_2'&&<Button size="small" color="warning" disabled={pending} onClick={()=>onAction('end_set_2')}>Termina Set 2</Button>}</Stack>}</>}</Paper>
}
