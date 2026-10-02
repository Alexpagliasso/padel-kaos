import { useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { PageShell, SectionHeader, EmptyState, StatusChip } from '../../../shared/components/Foundation'
import type { Match, Tournament } from '../../../shared/types/domain'
import { useScheduleManagement } from '../../../repositories/scheduleRepository'
import { entryFromTournament, useWorkspaceStore, type WorkspaceEntry } from '../workspace/workspaceStore'
import { OperationsControls } from './OperationsControls'
import { getControlRoomMode, getControlRoomRound, getCurrentRoundMatches, getNextControlRoomAction, getOperationalAttention, getRoundReadiness, type ControlRoomMode } from './controlRoomState'
import { useLiveOrchestrationRepository, type SetAction } from '../../../repositories/liveOrchestrationRepository'
import { SetTimer } from '../../../shared/components/SetTimer'
import { formatStatusLabel } from '../../../shared/lib/uiLabels'
import { CardPlayNotification } from '../../../shared/components/LiveEffects'
import { GlobalDiceReveal } from '../../../shared/components/GlobalDiceReveal'
import { GlobalSpecialEventReveal } from '../../../shared/components/GlobalSpecialEventReveal'
import { LiveEventPresenter } from '../../../shared/components/LiveEventPresenter'
import { RefereeCourtAssignmentsPanel } from './RefereeCourtAssignmentsPanel'
import { dataProvider } from '../../../repositories'
import { LineupEditor } from '../../../shared/components/LineupEditor'
import { canConfirmSet1, canConfirmSet2, canRollDice, canStartSet1, canStartSet2, getRoundFlow, roundFlowLabel, type RoundFlow } from '../../../domain/live/roundFlow'
import { OperationalAudioControl } from '../../../shared/components/OperationalAudioControl'
import { useLiveMatchRepository } from '../../../repositories/liveMatchRepository'
import { getSetTimer } from '../../../domain/live/setTimer'
import { useSharedClock } from '../../../shared/hooks/useSharedClock'

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
  const [mode,setMode]=useState<ControlRoomMode>(()=>getControlRoomMode(getCurrentRoundMatches(tournament,getControlRoomRound(tournament))))
  const [intervention,setIntervention]=useState('')
  const [feedback,setFeedback]=useState('')
  const entry = providedEntry ?? workspace.entries[tournament.id] ?? entryFromTournament(tournament)
  const round = getControlRoomRound(tournament)
  const matches = getCurrentRoundMatches(tournament, round)
  const active = matches.some(match=>['live_set_1','live_set_2','super_tiebreak'].includes(match.status))
  const scheduled = Boolean(round)&&matches.length>0&&matches.every(match=>['scheduled','ready'].includes(match.status))
  const cardsReady = tournament.cardsEnabled===false||Boolean(round?.cardReadinessReady)
  const attention=getOperationalAttention(tournament,round)
  const refereeCourtIds=referees.map(referee=>referee.courtId)
  const readiness=getRoundReadiness(tournament,round,refereeCourtIds)
  const nextAction=getNextControlRoomAction(tournament,round,refereeCourtIds)
  const flow=getRoundFlow(tournament,round)
  const run=async(action:()=>Promise<unknown>,success:string)=>{setFeedback('');try{await action();setFeedback(success)}catch(cause){setFeedback(cause instanceof Error?cause.message:'Operazione non riuscita.')}}
  const startRound=()=>{if(!round)return;void run(()=>tournament.setControlMode==='referee'?live.openRound(round.id):live.controlRound(round.id,'start_set_1'),`${round.name} avviato.`)}
  return <PageShell>
    <GlobalDiceReveal tournament={tournament} audience="admin"/><GlobalSpecialEventReveal tournament={tournament} audience="admin"/><CardPlayNotification tournament={tournament} audience="admin"/><LiveEventPresenter tournament={tournament} audience="admin"/>
    <Stack direction={{xs:'column',md:'row'}} sx={{justifyContent:'space-between',gap:2}}><SectionHeader eyebrow="Regia" title={tournament.name} detail={round?.name??'Nessun turno configurato'}/><Stack direction="row" spacing={1} sx={{alignItems:'center'}}><StatusChip label={entry.config.status}/><OperationalAudioControl tournament={tournament}/></Stack></Stack>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',md:'repeat(4,1fr)'},gap:1.5,mb:2}}><Metric label="Stato" value={formatStatusLabel(round?.status??entry.config.status)}/><Metric label="Campi" value={String(tournament.courts.length)}/><Metric label="Squadre" value={String(tournament.teams.length)}/><Metric label="Turno" value={round?.name??'Da creare'}/></Box>
    <GuidedRoundFlow flow={flow} roundName={round?.name} diceEnabled={tournament.diceEnabled!==false}/>
    <Paper sx={{p:2.5,mb:3,border:1,borderColor:'primary.main',background:'var(--event-gradient)'}}><Typography variant="overline">PROSSIMA AZIONE</Typography><Typography variant="h2">{nextAction.label}</Typography><GuidedPrimaryAction flow={flow} roundId={round?.id} refereeMode={tournament.setControlMode==='referee'} pending={live.isPending} onRun={(action,label)=>void run(action,label)} live={live}/></Paper>
    <Paper sx={{mb:3}}><Tabs value={mode} onChange={(_,value:ControlRoomMode)=>setMode(value)} variant="fullWidth" aria-label="Modalità Regia"><Tab value="preparation" label="PREPARAZIONE"/><Tab value="live" label="LIVE"/></Tabs></Paper>
    {feedback&&<Alert severity={feedback.includes('non')?'error':'success'} sx={{mb:2}}>{feedback}</Alert>}
    {mode==='preparation'&&<Stack spacing={2}>
      <Paper sx={{p:2.5}}><Typography variant="overline">PREPARAZIONE TORNEO</Typography><Typography variant="h2">{round?.name??'Nessun turno'}</Typography><Typography color="text.secondary">{matches.length} partite · {tournament.courts.length} campi · {active?'In corso':'In preparazione'}</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{mt:2}}><Button href="/admin/groups" variant="outlined">GIRONI E SORTEGGIO</Button><Button href="/admin/calendar" variant="outlined">CALENDARIO E TURNI</Button></Stack>{!tournament.groups.length&&<Alert severity="warning" sx={{mt:2}}>Crea e conferma i gironi prima di preparare il calendario.</Alert>}{!round&&<Alert severity="warning" sx={{mt:2}}>Genera il calendario per creare il primo turno.</Alert>}</Paper>
      {dataProvider==='supabase'&&<RefereeCourtAssignmentsPanel tournament={tournament}/>}
      {round&&<RoundLineupManagement tournament={tournament} matches={matches} roundId={round.id}/>}
      <Box><Typography variant="h3" sx={{mb:1}}>INCONTRI DEL TURNO</Typography>{!matches.length&&<Alert severity="info">Nessuna partita configurata</Alert>}<Box sx={{display:'grid',gridTemplateColumns:{lg:'repeat(2,minmax(0,1fr))'},gap:1}}>{matches.map(match=><CourtCard key={match.id} tournament={tournament} match={match} referee={referees.find(item=>item.courtId===match.courtId)?.name} intervention={intervention===match.id} onToggle={()=>setIntervention(value=>value===match.id?'':match.id)} onAction={(action)=>{if(!window.confirm('Confermare l’intervento eccezionale della Regia?'))return;void run(()=>live.adminControlMatch(match.id,action),'Intervento Regia completato.')}} pending={live.isPending} cardsReady={cardsReady}/>)}</Box></Box>
      <OperationsControls section="cards" entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name}/>
      <OperationsControls section="effects" entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name}/>
      <Paper sx={{p:3}}><Typography variant="overline">CONTROLLO PRE-AVVIO</Typography><Stack spacing={1} sx={{mt:2}}><ReadinessLine ready={matches.length>0} text={`${matches.length} partite configurate`}/><ReadinessLine ready={readiness.missingLineups===0} text={`${readiness.lineupsReady}/${readiness.lineupTargets} formazioni confermate`}/><ReadinessLine ready={readiness.coveredCourts===matches.length} text={`${readiness.coveredCourts}/${matches.length} campi coperti`}/><ReadinessLine ready={cardsReady} text={`Carte ${round?.cardReadyTeams??0}/${round?.cardTotalTeams??matches.length*2} squadre`}/>{attention.map(item=><Alert key={item.id} severity="warning">{item.message}</Alert>)}</Stack><Button variant="contained" size="large" fullWidth sx={{mt:2,minHeight:64}} disabled={!round||!scheduled||!cardsReady||attention.length>0||live.isPending} onClick={startRound}>AVVIA TURNO</Button></Paper>
      <OperationsControls section="settings" entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name}/>
    </Stack>}
    {mode==='live'&&<Stack spacing={2}><Paper sx={{p:2.5}}><Typography variant="overline">TORNEO LIVE</Typography><Typography variant="h2">{round?.name??'Turno corrente'}</Typography><Typography color="text.secondary">{matches.filter(match=>match.status==='completed').length}/{matches.length} partite completate</Typography></Paper><Box sx={{display:'grid',gridTemplateColumns:{md:'repeat(2,minmax(0,1fr))'},gap:2}}>{matches.map(match=><CourtCard key={match.id} tournament={tournament} match={match} referee={referees.find(item=>item.courtId===match.courtId)?.name} intervention={intervention===match.id} onToggle={()=>setIntervention(value=>value===match.id?'':match.id)} onAction={(action)=>{if(!window.confirm('Confermare l’intervento eccezionale della Regia?'))return;void run(()=>live.adminControlMatch(match.id,action),'Intervento Regia completato.')}} pending={live.isPending} cardsReady={cardsReady}/>)}</Box>{attention.length>0&&<Paper sx={{p:2}}>{attention.map(item=><Alert key={item.id} severity="warning" sx={{mb:1}}>{item.message}</Alert>)}</Paper>}<OperationsControls section="live" entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name}/><OperationsControls section="settings" entry={entry} tournament={tournament} matches={matches} roundId={round?.id} roundName={round?.name}/></Stack>}
  </PageShell>
}

function RoundLineupManagement({tournament,matches,roundId}:{tournament:Tournament;matches:Match[];roundId:string}){
  const live=useLiveOrchestrationRepository(tournament.id,false);const [confirm,setConfirm]=useState(false);const [feedback,setFeedback]=useState('')
  const editable=matches.flatMap(match=>{const setNumber:1|2|undefined=!match.set1StartedAt&&['scheduled','ready','lineup'].includes(match.status)?1:match.set1EndedAt&&!match.set2StartedAt&&['set_break','lineup_set_2'].includes(match.status)?2:undefined;return setNumber?[match.teamAId,match.teamBId].map(teamId=>({match,team:tournament.teams.find(item=>item.id===teamId),setNumber})):[]})
  const targets=editable.filter(({match,team,setNumber})=>team&&!match.lineups.some(item=>item.teamId===team.id&&item.setNumber===setNumber))
  const generate=async()=>{setFeedback('');const setNumber=editable[0]?.setNumber;if(!setNumber){setFeedback('Nessuna fase formazione modificabile.');return}try{const result=await live.generateMissingLineups(roundId,setNumber) as {generated?:number;remaining?:number;complete?:boolean;skipped?:Array<{matchId:string;teamId:string;setNumber:number;reason:string}>};const skipped=result.skipped??[];setFeedback(result.complete?`✓ FORMAZIONI SET ${setNumber} COMPLETE`:`${result.generated??0} formazioni generate; ${result.remaining??targets.length} ancora mancanti${skipped.length?`: ${skipped.map(item=>`${tournament.teams.find(team=>team.id===item.teamId)?.name??item.teamId} (${item.reason})`).join(', ')}`:'.'}`);setConfirm(false)}catch(cause){setFeedback(cause instanceof Error?cause.message:'Generazione non riuscita.')}}
  return <Paper sx={{p:2.5}}><Typography variant="h3">FORMAZIONI DEL TURNO</Typography><Typography color="text.secondary" sx={{mt:1}}>{editable.length-targets.length}/{editable.length} confermate · {targets.length} mancanti per la fase corrente</Typography>{feedback&&<Alert severity={feedback.includes('saltate')?'warning':'success'} sx={{mt:2}}>{feedback}</Alert>}<Button fullWidth variant="contained" sx={{mt:2}} disabled={!targets.length||live.isPending} onClick={()=>setConfirm(true)}>GENERA FORMAZIONI MANCANTI</Button><Box sx={{display:'grid',gap:2,mt:2,gridTemplateColumns:{md:'repeat(2,minmax(0,1fr))'}}}>{editable.map(({match,team,setNumber})=>team?<LineupEditor key={`${match.id}-${team.id}-${setNumber}-${match.lineups.find(item=>item.teamId===team.id&&item.setNumber===setNumber)?.confirmedAt??'missing'}`} tournamentId={tournament.id} match={match} team={team} setNumber={setNumber}/>:null)}</Box><Dialog open={confirm} onClose={()=>!live.isPending&&setConfirm(false)} fullWidth><DialogTitle>Genera formazioni mancanti</DialogTitle><DialogContent><Typography>Turno: <strong>{tournament.rounds?.find(round=>round.id===roundId)?.name??'Turno corrente'}</strong></Typography><Typography sx={{mt:1}}>Saranno create {targets.length} formazioni mancanti in {new Set(targets.map(item=>item.match.id)).size} incontri. Le formazioni già confermate non saranno modificate.</Typography></DialogContent><DialogActions><Button disabled={live.isPending} onClick={()=>setConfirm(false)}>ANNULLA</Button><Button variant="contained" disabled={live.isPending} onClick={()=>void generate()}>{live.isPending?'GENERAZIONE…':'CONFERMA GENERAZIONE…'}</Button></DialogActions></Dialog></Paper>
}

const flowSteps=[
  {key:'cards',label:'Carte'}, {key:'lineups_set_1',label:'Formazioni S1'}, {key:'set_1',label:'Set 1'},
  {key:'results_set_1',label:'Risultati S1'}, {key:'dice',label:'Dado'}, {key:'lineups_set_2',label:'Formazioni S2'},
  {key:'set_2',label:'Set 2'}, {key:'tiebreak',label:'Tie-break'},
] as const
const phaseOrder:Record<RoundFlow['phase'],number>={cards:0,lineups_set_1:1,set_1_ready:2,set_1_live:2,results_set_1:3,confirm_set_1:3,dice:4,lineups_set_2:5,set_2_ready:6,set_2_live:6,results_set_2:6,confirm_set_2:6,tiebreak_lineups:7,tiebreak_live:7,round_complete:8}

function GuidedRoundFlow({flow,roundName,diceEnabled}:{flow:RoundFlow;roundName?:string;diceEnabled:boolean}){
  const current=phaseOrder[flow.phase]
  return <Paper sx={{p:2.5,mb:3}} aria-label="Flusso guidato del turno"><Typography variant="overline">FASE ATTUALE · {roundName??'Turno da configurare'}</Typography><Typography variant="h2" color="primary">● {roundFlowLabel[flow.phase]}</Typography><Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,1fr)',md:`repeat(${diceEnabled?8:7},1fr)`},gap:1,mt:2}}>{flowSteps.filter(step=>diceEnabled||step.key!=='dice').map((step,index)=>{const effective=diceEnabled?index:(index>=4?index+1:index);const state=effective<current?'✓':effective===current?'●':'○';return <Box key={step.key} sx={{p:1,borderRadius:1,bgcolor:effective===current?'rgba(255,208,0,.14)':'rgba(255,255,255,.03)',color:effective>current?'text.disabled':'text.primary'}}><Typography sx={{fontSize:12,fontWeight:900}}>{state} {step.label}</Typography></Box>})}</Box>{flow.waiting>0&&['results_set_1','results_set_2'].includes(flow.phase)&&<Alert severity="info" sx={{mt:2}}>{flow.completed} di {flow.total} campi hanno completato la fase · Attendi {flow.waiting} {flow.waiting===1?'campo':'campi'}</Alert>}</Paper>
}

function GuidedPrimaryAction({flow,roundId,refereeMode,pending,onRun,live}:{flow:RoundFlow;roundId?:string;refereeMode:boolean;pending:boolean;onRun:(action:()=>Promise<unknown>,label:string)=>void;live:ReturnType<typeof useLiveOrchestrationRepository>}){
  if(!roundId)return <Button href="/admin/calendar" variant="contained" size="large" sx={{mt:2}}>CREA CALENDARIO E TURNO</Button>
  if(flow.phase==='cards')return <Button fullWidth variant="contained" size="large" sx={{mt:2,minHeight:60}} disabled={pending} onClick={()=>onRun(()=>live.assignCards(roundId,3,false),'Carte distribuite.')}>DISTRIBUISCI CARTE</Button>
  if(flow.phase==='lineups_set_1'||flow.phase==='lineups_set_2'){const setNumber:1|2=flow.phase==='lineups_set_1'?1:2;return <Button fullWidth variant="contained" size="large" sx={{mt:2,minHeight:60}} disabled={pending} onClick={()=>onRun(()=>live.generateMissingLineups(roundId,setNumber),'Formazioni mancanti generate.')}>GENERA FORMAZIONI MANCANTI</Button>}
  if(canStartSet1(flow))return <Button fullWidth variant="contained" size="large" sx={{mt:2,minHeight:60}} disabled={pending} onClick={()=>onRun(()=>refereeMode?live.openRound(roundId):live.controlRound(roundId,'start_set_1'),refereeMode?'Turno aperto agli arbitri.':'Primo set avviato.')}>{refereeMode?'APRI TURNO AGLI ARBITRI':'AVVIA PRIMO SET'}</Button>
  if(canConfirmSet1(flow))return <Button fullWidth variant="contained" size="large" sx={{mt:2,minHeight:60}} disabled={pending} onClick={()=>onRun(()=>live.confirmSubmittedRoundSet(roundId,1),'Primo set confermato dalla Regia.')}>CONFERMA PRIMO SET E PASSA AL DADO</Button>
  if(canRollDice(flow))return <Button fullWidth variant="contained" size="large" sx={{mt:2,minHeight:60}} disabled={pending} onClick={()=>window.confirm('Lanciare il dado globale? Non potrà essere rilanciato.')&&onRun(()=>live.rollGlobalDice(roundId),'Dado globale lanciato.')}>LANCIA IL DADO</Button>
  if(canStartSet2(flow))return <Button fullWidth variant="contained" size="large" sx={{mt:2,minHeight:60}} disabled={pending} onClick={()=>onRun(()=>live.startReadySet2(roundId),'Secondo set avviato.')}>AVVIA SECONDO SET</Button>
  if(canConfirmSet2(flow))return <Button fullWidth variant="contained" size="large" sx={{mt:2,minHeight:60}} disabled={pending} onClick={()=>onRun(()=>live.confirmSubmittedRoundSet(roundId,2),'Secondo set confermato dalla Regia.')}>CONFERMA SECONDO SET</Button>
  return <Button fullWidth variant="contained" size="large" sx={{mt:2,minHeight:60}} disabled>{flow.phase==='round_complete'?'CHIUDI TURNO':'ATTENDI I CAMPI'}</Button>
}

function ReadinessLine({ready,text}:{ready:boolean;text:string}) { return <Alert severity={ready?'success':'warning'}>{ready?'✓':'⚠'} {text}</Alert> }

function Metric({label,value}:{label:string;value:string}){return <Paper sx={{p:2}}><Typography variant="overline" color="text.secondary">{label}</Typography><Typography sx={{fontWeight:900,fontSize:20}}>{value}</Typography></Paper>}

function CourtCard({tournament,match,referee,intervention,onToggle,onAction,pending,cardsReady}:{tournament:Tournament;match:Match;referee?:string;intervention:boolean;onToggle:()=>void;onAction:(action:SetAction)=>void;pending:boolean;cardsReady:boolean}){
  const teamA=tournament.teams.find(team=>team.id===match.teamAId);const teamB=tournament.teams.find(team=>team.id===match.teamBId);const court=tournament.courts.find(item=>item.id===match.courtId)
  const blocker=tournament.rounds?.find(round=>round.id===match.roundId)?.completionBlockers?.find(item=>item.matchId===match.id)
  const resultSet=match.set2StartedAt?2:1
  const submitted=resultSet===1?match.set1ResultSubmittedAt:match.set2ResultSubmittedAt
  return <Paper sx={{p:3}}><Stack direction="row" sx={{justifyContent:'space-between',gap:2}}><Box><Typography color="primary" sx={{fontWeight:900}}>{court?.name??'Campo'}</Typography><Typography variant="h3" sx={{mt:1}}>{teamA?.shortName??'A'} vs {teamB?.shortName??'B'}</Typography></Box><Chip label={formatStatusLabel(match.status)}/></Stack><Box sx={{mt:2}}><SetTimer match={match} size="compact"/></Box><Typography sx={{mt:2,fontWeight:800}}>Set {match.score.currentSet} · {match.score.games.A}–{match.score.games.B}</Typography><Typography color="text.secondary">Arbitro · {referee??'Da assegnare'}</Typography>{submitted?<Alert severity="success" sx={{mt:2}}>✓ RISULTATO INVIATO DALL’ARBITRO · {teamA?.shortName} {match.score.games.A}–{match.score.games.B} {teamB?.shortName}</Alert>:<AdminResultFallback tournament={tournament} match={match}/>} {blocker&&<Alert severity="warning" sx={{mt:2}}>{blocker.reason}</Alert>}{tournament.setControlMode==='referee'&&<><Button size="small" sx={{mt:2}} onClick={onToggle}>AZIONI REGIA</Button>{intervention&&<Stack direction="row" spacing={1} sx={{mt:1}}>{['scheduled','ready'].includes(match.status)&&<Button size="small" disabled={pending||!cardsReady} onClick={()=>onAction('start_set_1')}>Avvia Set 1</Button>}{match.status==='live_set_1'&&<Button size="small" color="warning" disabled={pending} onClick={()=>onAction('end_set_1')}>Termina Set 1</Button>}{match.status==='set_break'&&<Button size="small" disabled={pending} onClick={()=>onAction('start_set_2')}>Avvia Set 2</Button>}{match.status==='live_set_2'&&<Button size="small" color="warning" disabled={pending} onClick={()=>onAction('end_set_2')}>Termina Set 2</Button>}</Stack>}</>}</Paper>
}

function AdminResultFallback({tournament,match}:{tournament:Tournament;match:Match}){const live=useLiveMatchRepository(tournament.id,false);const now=useSharedClock();const timer=getSetTimer(match,now);const setNumber:1|2=match.set2StartedAt?2:1;const ended=setNumber===1?match.set1EndedAt:match.set2EndedAt;const submitted=setNumber===1?match.set1ResultSubmittedAt:match.set2ResultSubmittedAt;const available=!submitted&&Boolean(ended||timer?.expired);const[open,setOpen]=useState(false);const[a,setA]=useState(match.score.games.A);const[b,setB]=useState(match.score.games.B);const[feedback,setFeedback]=useState('');if(!available)return <Alert severity="info" sx={{mt:2}}>In attesa risultato arbitro</Alert>;return <><Button size="small" variant="outlined" sx={{mt:2}} onClick={()=>{setA(match.score.games.A);setB(match.score.games.B);setOpen(true)}}>INSERISCI RISULTATO</Button><Dialog open={open} onClose={()=>!live.isPending&&setOpen(false)}><DialogTitle>Risultato Set {setNumber}</DialogTitle><DialogContent><Stack direction="row" spacing={2} sx={{pt:1}}><TextField label="Team A" type="number" value={a} onChange={event=>setA(Number(event.target.value))}/><TextField label="Team B" type="number" value={b} onChange={event=>setB(Number(event.target.value))}/></Stack>{feedback&&<Alert severity="error" sx={{mt:2}}>{feedback}</Alert>}</DialogContent><DialogActions><Button disabled={live.isPending} onClick={()=>setOpen(false)}>ANNULLA</Button><Button variant="contained" disabled={live.isPending||a===b||a<0||b<0} onClick={()=>{setFeedback('');void live.submitSetScore(match.id,setNumber,a,b).then(()=>setOpen(false)).catch(cause=>setFeedback(cause instanceof Error?cause.message:'Invio non riuscito.'))}}>{live.isPending?'INVIO…':'INVIA ALLA REGIA'}</Button></DialogActions></Dialog></>}
