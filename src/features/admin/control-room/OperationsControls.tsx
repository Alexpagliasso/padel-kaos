import { useEffect, useState } from 'react'
import { Alert, Box, Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material'
import Casino from '@mui/icons-material/Casino'
import { motion } from 'framer-motion'
import { useWorkspaceStore, type WorkspaceEntry } from '../workspace/workspaceStore'
import type { Match, Tournament } from '../../../shared/types/domain'
import { defaultCardsPerTeam, normalizeCardsPerTeam, useLiveOrchestrationRepository, type SetAction, type SetControlMode } from '../../../repositories/liveOrchestrationRepository'
import { dataProvider } from '../../../repositories'
import { getPersistedSetResult } from '../../../domain/live/readiness'
import { GlobalDiceReveal } from '../../../shared/components/LiveEffects'

export function OperationsControls({ entry, tournament, matches, roundId, roundName, section = 'all' }: { entry: WorkspaceEntry; tournament: Tournament; matches: Match[]; roundId?: string; roundName?: string; section?: 'all' | 'turn' | 'live' | 'settings' }) {
  const state = useWorkspaceStore()
  const [confirmDice, setConfirmDice] = useState(false)
  const [resultMatchId, setResultMatchId] = useState('')
  const [resultA, setResultA] = useState(0)
  const [resultB, setResultB] = useState(0)
  const [displayMode,setDisplayMode]=useState<'auto'|'fixed'>(tournament.mainDisplayMode??'auto')
  const [displayPage,setDisplayPage]=useState(tournament.mainDisplayPage??0)
  const [displayInterval,setDisplayInterval]=useState<4|5|8|10>(tournament.mainDisplayIntervalSeconds??5)
  const [eventId, setEventId] = useState('')
  const [cardsPerTeam, setCardsPerTeam] = useState(defaultCardsPerTeam)
  const [liveFeedback, setLiveFeedback] = useState('')
  const [defaultDuration,setDefaultDuration]=useState(tournament.defaultSetDurationMinutes??15)
  const [roundDuration,setRoundDuration]=useState(sourceDuration(tournament,roundId))
  const live = useLiveOrchestrationRepository(tournament.id)
  const events = state.events.filter(event => entry.activeEvents.includes(event.id))
  const selectedId = events.some(event => event.id === eventId) ? eventId : events[0]?.id ?? ''
  const active = entry.launchedEvent && !entry.launchedEvent.endedAt ? entry.launchedEvent : undefined
  const sourceRound = tournament.rounds?.find(round => round.id === roundId)
  useEffect(() => { setCardsPerTeam(sourceRound?.cardsPerTeam ?? defaultCardsPerTeam) }, [sourceRound?.cardsPerTeam, sourceRound?.id])
  const dice = sourceRound?.diceResult ? { value: sourceRound.diceResult, rolledAt: sourceRound.diceStartedAt } : undefined
  const setOneReadiness = matches.map(match => ({ match, result: getPersistedSetResult(tournament, match.id, 1), court: tournament.courts.find(court => court.id === match.courtId)?.name ?? 'Campo' }))
  const missingResults = setOneReadiness.filter(item => !item.match.set1EndedAt || !item.result)
  const canRollDice = tournament.diceEnabled!==false && Boolean(roundId) && matches.length > 0 && missingResults.length === 0 && matches.every(match => match.status === 'set_break') && !dice
  const canStartSet2 = (tournament.diceEnabled===false||Boolean(dice)) && missingResults.length === 0 && matches.every(match => match.status === 'set_break')
  const mode = tournament.setControlMode ?? 'centralized'
  const cardTotalTeams = sourceRound?.cardTotalTeams ?? matches.length * 2
  const cardReadyTeams = sourceRound?.cardReadyTeams ?? 0
  const cardsReady = tournament.cardsEnabled === false || Boolean(sourceRound?.cardReadinessReady)
  const cardsAssigned = cardReadyTeams > 0
  const pendingCards = tournament.teamCards.filter(card => card.matchId && matches.some(match => match.id===card.matchId) && card.state==='pending')
  const missingLineups = (setNumber: 1 | 2) => matches.flatMap(match => [match.teamAId, match.teamBId]
    .filter(teamId => !match.lineups.some(lineup => lineup.teamId === teamId && lineup.setNumber === setNumber))
    .map(teamId => ({ court: tournament.courts.find(court => court.id === match.courtId)?.name ?? 'Campo', team: tournament.teams.find(team => team.id === teamId)?.name ?? 'Squadra' })))
  const run = async (operation: () => Promise<unknown>, success: string) => {
    setLiveFeedback('')
    try { await operation(); setLiveFeedback(success) } catch (cause) { setLiveFeedback(cause instanceof Error ? cause.message : 'Operazione non riuscita.') }
  }
  const changeMode = (next: SetControlMode) => void run(() => live.setMode(next), 'Modalità di gestione aggiornata.')
  const drawCards = (redraw: boolean) => {
    if (!roundId) return
    if (redraw && !window.confirm('Le carte già assegnate per questo turno verranno sostituite. Continuare?')) return
    void run(() => live.assignCards(roundId, cardsPerTeam, redraw), redraw ? 'Carte riassegnate.' : 'Carte assegnate.')
  }
  const control = (action: SetAction, success: string) => roundId && void run(() => live.controlRound(roundId, action), success)
  const generateMissingLineups = () => {
    if (!roundId) return
    setLiveFeedback('')
    void live.generateMissingLineups(roundId).then(result => {
      const generated = typeof result === 'object' && result !== null && 'generated' in result ? Number(result.generated) : 0
      setLiveFeedback(generated > 0 ? `${generated} formazioni mancanti generate.` : 'Tutte le formazioni richieste sono già presenti.')
    }).catch(cause => setLiveFeedback(cause instanceof Error ? cause.message : 'Operazione non riuscita.'))
  }
  const settings={refereeCanManageScore:tournament.refereeCanManageScore!==false,refereeCanValidateCards:tournament.refereeCanValidateCards!==false,refereeCanReportEventWinner:tournament.refereeCanReportEventWinner!==false,cardsEnabled:tournament.cardsEnabled!==false,diceEnabled:tournament.diceEnabled!==false,specialEventsEnabled:tournament.specialEventsEnabled!==false}
  const activeSet=matches.some(match=>['live_set_1','live_set_2','super_tiebreak'].includes(match.status))
  const timedSetActive=matches.some(match=>['live_set_1','live_set_2'].includes(match.status))
  const saveSetting=(key:keyof typeof settings,value:boolean)=>void run(()=>live.setOperationalSettings({...settings,[key]:value}),'Impostazioni operative aggiornate.')
  return <Stack spacing={3}>
    {(section==='all'||section==='live')&&tournament.diceEnabled!==false&&<GlobalDiceReveal tournament={tournament} />}
    {(section==='all'||section==='settings')&&<Paper sx={{p:3}}><Typography variant="h3" sx={{mb:1}}>IMPOSTAZIONI OPERATIVE</Typography><Typography color="text.secondary" sx={{mb:2}}>La modalità Regia/Arbitro qui sotto resta l’unica autorità per avvio e fine set.</Typography><Stack>
      <FormControlLabel control={<Switch checked={settings.refereeCanManageScore} onChange={(_,value)=>saveSetting('refereeCanManageScore',value)}/>} label="Arbitro gestisce il punteggio" />
      <FormControlLabel control={<Switch checked={settings.refereeCanValidateCards} disabled={activeSet} onChange={(_,value)=>saveSetting('refereeCanValidateCards',value)}/>} label="Arbitro valida le carte" />
      <FormControlLabel control={<Switch checked={settings.refereeCanReportEventWinner} onChange={(_,value)=>saveSetting('refereeCanReportEventWinner',value)}/>} label="Arbitro segnala il vincitore evento" />
      <FormControlLabel control={<Switch checked={settings.cardsEnabled} disabled={activeSet} onChange={(_,value)=>saveSetting('cardsEnabled',value)}/>} label="Carte abilitate" />
      <FormControlLabel control={<Switch checked={tournament.displayCardNotificationsEnabled!==false} onChange={(_,value)=>void run(()=>live.setDisplayCardNotifications(value),'Notifiche carte sui display aggiornate.')} />} label="Notifiche carte sui display" />
      <Typography color="text.secondary" sx={{ml:4,mb:1,fontSize:13}}>Mostra sui display Campo e Maxischermo una notifica quando viene giocata una carta.</Typography>
      <FormControlLabel control={<Switch checked={settings.diceEnabled} disabled={activeSet} onChange={(_,value)=>saveSetting('diceEnabled',value)}/>} label="Dado globale abilitato" />
      <FormControlLabel control={<Switch checked={settings.specialEventsEnabled} onChange={(_,value)=>saveSetting('specialEventsEnabled',value)}/>} label="Eventi speciali abilitati" />
      <Typography sx={{fontWeight:900,mt:2}}>GESTIONE INIZIO E FINE SET</Typography><ButtonGroup fullWidth><Button variant={mode==='centralized'?'contained':'outlined'} disabled={live.isPending||dataProvider!=='supabase'} onClick={()=>changeMode('centralized')}>Regia centralizzata</Button><Button variant={mode==='referee'?'contained':'outlined'} disabled={live.isPending||dataProvider!=='supabase'} onClick={()=>changeMode('referee')}>Gestione arbitri</Button></ButtonGroup>
      <Typography sx={{fontWeight:900,mt:2}}>DURATA SET</Typography><Typography color="text.secondary" sx={{mb:1}}>Durata effettiva del turno: {sourceRound?.effectiveSetDurationMinutes??tournament.defaultSetDurationMinutes??15} minuti</Typography><Stack direction={{xs:'column',sm:'row'}} spacing={2}><TextField type="number" label="Durata predefinita (minuti)" value={defaultDuration} disabled={timedSetActive} slotProps={{htmlInput:{min:1,max:180}}} onChange={event=>setDefaultDuration(Math.max(1,Number(event.target.value)))}/><Button variant="outlined" disabled={timedSetActive||live.isPending} onClick={()=>void run(()=>live.setDefaultSetDuration(defaultDuration),'Durata predefinita salvata.')}>SALVA DEFAULT</Button></Stack>
      {roundId&&<Stack direction={{xs:'column',sm:'row'}} spacing={2} sx={{mt:2}}><TextField type="number" label="Durata turno (minuti)" value={roundDuration} disabled={timedSetActive} placeholder={`${tournament.defaultSetDurationMinutes??15}`} slotProps={{htmlInput:{min:1,max:180}}} onChange={event=>setRoundDuration(event.target.value)}/><Button variant="outlined" disabled={timedSetActive||live.isPending} onClick={()=>void run(()=>live.setRoundSetDuration(roundId,roundDuration===''?undefined:Number(roundDuration)),'Durata del turno salvata.')}>SALVA TURNO</Button></Stack>}
      {timedSetActive&&<Alert severity="warning" sx={{mt:1}}>NON MODIFICABILE DURANTE IL SET</Alert>}
      {activeSet&&<Alert severity="warning">NON MODIFICABILE DURANTE UN SET ATTIVO: carte, validazione carte e dado.</Alert>}
    </Stack></Paper>}
    {(section==='all'||section==='turn')&&<Paper sx={{ p: 3 }}>
      <Typography variant="h3">Orchestrazione turno</Typography>
      <Typography color="text.secondary" sx={{ my: 1 }}>{roundName ?? 'Nessun turno configurato'}</Typography>
      {dataProvider !== 'supabase' && <Alert severity="info" sx={{ mb: 2 }}>Controlli persistiti disponibili con Supabase.</Alert>}
      <Box sx={{ mt: 3, p: 2, border: 1, borderColor: 'warning.main', borderRadius: 2 }}>
        <Typography color="warning.main" sx={{ fontSize: 12, fontWeight: 900, mb: 1 }}>STRUMENTO TEST/ASSISTENZA</Typography>
        <Button fullWidth variant="outlined" color="warning" disabled={!roundId || live.isPending || dataProvider !== 'supabase'} onClick={generateMissingLineups}>GENERA FORMAZIONI MANCANTI</Button>
      </Box>
      {mode === 'centralized' ? <Stack spacing={1.25} sx={{ mt: 3 }}>
        {tournament.cardsEnabled!==false&&!cardsReady&&<Alert severity="warning" action={<Button color="inherit" disabled={!roundId||live.isPending} onClick={()=>drawCards(cardsAssigned)}>ASSEGNA CARTE</Button>}>ASSEGNA LE CARTE PRIMA DI AVVIARE IL TURNO · {cardReadyTeams} / {cardTotalTeams} squadre pronte</Alert>}
        <Button variant="contained" disabled={!roundId || live.isPending || !cardsReady || matches.some(match => !['scheduled','ready'].includes(match.status))} onClick={() => control('start_set_1', 'Set 1 avviato.')}>AVVIA SET 1</Button>
        <Button variant="outlined" disabled={!roundId || live.isPending || matches.some(match => match.status !== 'live_set_1')} onClick={() => window.confirm('TERMINARE IL SET 1 IN ANTICIPO SU TUTTI I CAMPI?') && control('end_set_1', 'Set 1 terminato.')}>TERMINA SET 1 IN ANTICIPO</Button>
        <Button variant="contained" disabled={!roundId || live.isPending || !canStartSet2} onClick={() => control('start_set_2', 'Set 2 avviato.')}>AVVIA SET 2</Button>
        <Button variant="outlined" disabled={!roundId || live.isPending || matches.some(match => match.status !== 'live_set_2')} onClick={() => window.confirm('TERMINARE IL SET 2 IN ANTICIPO SU TUTTI I CAMPI?') && control('end_set_2', 'Set 2 terminato.')}>TERMINA SET 2 IN ANTICIPO</Button>
        {setOneReadiness.map(item => <Alert key={`result-${item.match.id}`} severity={item.result ? 'success' : 'warning'} action={item.match.set1EndedAt ? <Button size="small" onClick={() => { setResultMatchId(item.match.id); setResultA(item.result?.gamesA ?? item.match.score.games.A); setResultB(item.result?.gamesB ?? item.match.score.games.B) }}>{item.result ? 'MODIFICA RISULTATO' : 'INSERISCI RISULTATO'}</Button> : undefined}>{item.court}: {item.result ? `Risultato Set 1 ${item.result.gamesA}–${item.result.gamesB}` : item.match.set1EndedAt ? 'RISULTATO SET 1 MANCANTE' : 'Set 1 non ancora terminato'}</Alert>)}
        {missingLineups(matches.some(match => match.status === 'set_break') ? 2 : 1).map(item => <Alert key={`${item.court}-${item.team}`} severity="warning">{item.court}: Formazione mancante — {item.team}</Alert>)}
      </Stack> : <Stack spacing={1.25} sx={{mt:3}}>{tournament.cardsEnabled!==false&&!cardsReady&&<Alert severity="warning" action={<Button color="inherit" disabled={!roundId||live.isPending} onClick={()=>drawCards(cardsAssigned)}>ASSEGNA CARTE</Button>}>ASSEGNA LE CARTE PRIMA DI AVVIARE IL TURNO · {cardReadyTeams} / {cardTotalTeams} squadre pronte</Alert>}<Button fullWidth variant="contained" disabled={!roundId || Boolean(sourceRound?.openedAt) || live.isPending || !cardsReady} onClick={() => roundId && void run(() => live.openRound(roundId), 'Turno aperto agli arbitri.')}>APRI TURNO</Button></Stack>}
      {(liveFeedback || live.error) && <Alert severity={(liveFeedback || live.error).includes('non') || (liveFeedback || live.error).includes('Impossibile') ? 'error' : 'success'} sx={{ mt: 2 }}>{liveFeedback || live.error}</Alert>}
    </Paper>}
    {(section==='all'||section==='live')&&<Paper sx={{p:3}}><Typography variant="h3">CARTE</Typography><Typography color={cardsReady?'success.main':'warning.main'} sx={{my:1,fontWeight:800}}>{tournament.cardsEnabled===false?'Carte disattivate':cardsReady?`CARTE ASSEGNATE - ${cardReadyTeams} / ${cardTotalTeams} squadre pronte`:`CARTE DA ASSEGNARE · ${cardReadyTeams} / ${cardTotalTeams} squadre pronte`}</Typography>{tournament.cardsEnabled!==false&&!cardsReady&&<Alert severity="warning" sx={{mb:2}}>ASSEGNA LE CARTE PRIMA DI AVVIARE IL TURNO</Alert>}{pendingCards.length>0&&<Alert severity="warning" sx={{mb:2}}><b>{pendingCards.length} {pendingCards.length===1?'CARTA IN ATTESA':'CARTE IN ATTESA'}</b>{pendingCards.map(card=>{const match=matches.find(item=>item.id===card.matchId);const court=tournament.courts.find(item=>item.id===match?.courtId);const team=tournament.teams.find(item=>item.id===card.teamId);const definition=tournament.cards.find(item=>item.id===card.cardId);return <Typography key={card.id} component="span" sx={{display:'block'}}>{court?.name??'Campo'} · {team?.name??'Squadra'} · {definition?.name??'Carta'}</Typography>})}</Alert>}<TextField type="number" fullWidth label="Carte per squadra" value={cardsPerTeam} slotProps={{htmlInput:{min:1,max:10}}} onChange={event=>setCardsPerTeam(normalizeCardsPerTeam(Number(event.target.value)))}/><Button fullWidth variant="contained" sx={{mt:2}} disabled={tournament.cardsEnabled===false||!roundId||live.isPending||dataProvider!=='supabase'} onClick={()=>drawCards(cardsAssigned)}>{tournament.cardsEnabled===false?'CARTE DISATTIVATE':cardsAssigned?'RIASSEGNA CARTE':'ASSEGNA CARTE'}</Button></Paper>}
    {(section==='all'||section==='live')&&<Paper sx={{ p: 3, background: 'var(--event-gradient)' }}>
      <Typography variant="h3">Dado globale</Typography><Typography color="text.secondary" sx={{ my: 1 }}>{roundName ?? 'Nessun turno configurato'}</Typography>
      <Box component={motion.div} key={dice?.rolledAt ?? 'waiting'} initial={{ rotate: -25, scale: .75 }} animate={{ rotate: 0, scale: 1 }} transition={{ duration: .25 }} sx={{ py: 3, textAlign: 'center', fontSize: 88, fontWeight: 900, color: 'primary.main' }}>{dice?.value ?? <Casino sx={{ fontSize: 88 }} />}</Box>
      <Typography sx={{ mb: 2 }}>{dice ? `Dado globale attuale: ${dice.value}` : 'Dado globale / Non lanciato'}</Typography>
      {tournament.diceEnabled===false?<Alert severity="info">Dado globale disattivato: il Set 2 può iniziare senza lancio.</Alert>:<Button fullWidth startIcon={<Casino />} variant="contained" sx={{ minHeight: 80, fontSize: 18 }} disabled={!canRollDice || live.isPending || dataProvider !== 'supabase'} onClick={() => setConfirmDice(true)}>LANCIA DADO GLOBALE</Button>}
      {missingResults.length > 0 && <Typography color="warning.main" sx={{ mt: 1, fontSize: 13 }}>Completa tutti i risultati del Set 1.</Typography>}
      {dice && <Alert severity="success">PRONTO PER IL SET 2</Alert>}
    </Paper>}
    {(section==='all'||section==='live')&&<Paper sx={{p:3}}><Typography variant="h3">MAXISCHERMO</Typography><Stack spacing={2} sx={{mt:2}}><TextField select label="Modalità" value={displayMode} onChange={event=>setDisplayMode(event.target.value as 'auto'|'fixed')}><MenuItem value="auto">Rotazione automatica</MenuItem><MenuItem value="fixed">Pagina fissa</MenuItem></TextField>{displayMode==='auto'?<TextField select label="Intervallo" value={displayInterval} onChange={event=>setDisplayInterval(Number(event.target.value) as 4|5|8|10)}>{[4,5,8,10].map(value=><MenuItem key={value} value={value}>{value} secondi</MenuItem>)}</TextField>:<TextField type="number" label="Pagina" value={displayPage+1} slotProps={{htmlInput:{min:1}}} onChange={event=>setDisplayPage(Math.max(0,Number(event.target.value)-1))}/>}<Button variant="contained" disabled={live.isPending||dataProvider!=='supabase'} onClick={()=>void run(()=>live.setMainDisplaySettings(displayMode,displayPage,displayInterval),'Impostazioni maxischermo salvate.')}>SALVA VISUALIZZAZIONE</Button><Button variant="outlined" href="/main-display" target="_blank">ANTEPRIMA MAXISCHERMO</Button></Stack></Paper>}
    {(section==='all'||section==='live')&&<Paper sx={{ p: 3 }}><Typography variant="h3" sx={{ mb: 3 }}>EVENTI SPECIALI</Typography>
      {events.length ? <TextField select fullWidth label="Eventi attivi del torneo" value={selectedId} onChange={event => setEventId(event.target.value)}>{events.map(event => <MenuItem key={event.id} value={event.id}>{event.name}</MenuItem>)}</TextField> : <Alert severity="info">Nessun evento attivo. Scegli gli eventi nella configurazione torneo.</Alert>}
      <Button sx={{ mt: 2 }} fullWidth variant="contained" disabled={!selectedId || Boolean(active) || entry.config.status === 'completed'} onClick={() => state.launchEvent(entry, selectedId)}>ATTIVA EVENTO</Button>
      {active && <Box sx={{ mt: 3, p: 2, border: 1, borderColor: 'primary.main', borderRadius: 2, background: 'var(--event-soft)' }}><Typography color="primary" sx={{ fontSize: 12, fontWeight: 900 }}>EVENTO ATTIVO</Typography><Typography variant="h3" sx={{ mt: 1 }}>{active.definition.name}</Typography><Typography sx={{ my: 1 }}>{active.definition.description}</Typography>{active.definition.prize && <Typography sx={{ fontWeight: 800 }}>{active.definition.prize}</Typography>}<Button fullWidth color="warning" variant="outlined" sx={{ mt: 2 }} onClick={() => state.endEvent(entry)}>TERMINA EVENTO</Button></Box>}
      {entry.launchedEvent?.endedAt && <Alert severity="success" sx={{ mt: 2 }}>Evento terminato · {entry.launchedEvent.definition.name}</Alert>}
    </Paper>}
    <Dialog open={confirmDice} onClose={() => setConfirmDice(false)}><DialogTitle>Lanciare il dado globale?</DialogTitle><DialogContent>Il risultato sarà persistito per {roundName} e non potrà essere rilanciato.</DialogContent><DialogActions><Button onClick={() => setConfirmDice(false)}>Annulla</Button><Button variant="contained" onClick={() => { if (roundId) void run(() => live.rollGlobalDice(roundId), 'Dado globale lanciato.'); setConfirmDice(false) }}>Conferma lancio</Button></DialogActions></Dialog>
    <Dialog open={Boolean(resultMatchId)} onClose={() => setResultMatchId('')}><DialogTitle>Risultato Set 1</DialogTitle><DialogContent><Stack direction="row" spacing={2} sx={{ mt: 1 }}><TextField type="number" label="Team A" value={resultA} onChange={event => setResultA(Math.max(0, Number(event.target.value)))} /><TextField type="number" label="Team B" value={resultB} onChange={event => setResultB(Math.max(0, Number(event.target.value)))} /></Stack></DialogContent><DialogActions><Button onClick={() => setResultMatchId('')}>Annulla</Button><Button variant="contained" onClick={() => { const previous = getPersistedSetResult(tournament, resultMatchId, 1); if (previous && !window.confirm(`Stai modificando il risultato del Set 1 da ${previous.gamesA}–${previous.gamesB} a ${resultA}–${resultB}.`)) return; void run(() => live.setCompletedSetResult(resultMatchId, 1, resultA, resultB), 'Risultato salvato.'); setResultMatchId('') }}>Salva risultato</Button></DialogActions></Dialog>
  </Stack>
}

function sourceDuration(tournament:Tournament,roundId?:string){const value=tournament.rounds?.find(round=>round.id===roundId)?.setDurationMinutes;return value===undefined?'':String(value)}
