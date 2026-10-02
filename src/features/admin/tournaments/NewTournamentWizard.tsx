import { useMemo, useState } from 'react'
import { Alert, Box, Button, Paper, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { PageShell, SectionHeader } from '../../../shared/components/Foundation'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { GeneralSetup } from '../setup/GeneralSetup'
import { LibraryPanel } from '../setup/LibraryPanel'
import { DiceLibraryPanel } from '../setup/DiceLibraryPanel'
import { TournamentSetupContent } from '../setup/TournamentSetup'
import { TournamentLifecycle } from '../setup/TournamentLifecycle'
import { isSupabaseProvider } from '../../../repositories'

const steps=['Informazioni','Effetti','Arbitri','Squadre','Riepilogo','Avvio']

export function NewTournamentWizard(){
  const workspace=useAdminWorkspace()
  const navigate=useNavigate()
  const [step,setStep]=useState(0)
  const [name,setName]=useState('')
  const [creating,setCreating]=useState(false)
  const [error,setError]=useState('')
  const [draftId,setDraftId]=useState<string|null>(null)
  const entry=workspace.available.find(item=>item.domain.id===draftId)
  const tournament=entry?workspace.data:null
  const incomplete=useMemo(()=>entry?[
    ...(tournament?.teams.length===entry.config.teamsCount?[]:[`Squadre: ${tournament?.teams.length??0}/${entry.config.teamsCount}`]),
    ...(tournament?.courts.length||entry.config.courtsCount?[]:['Nessun campo configurato']),
    ...(entry.activeCards.length?[]:['Nessuna carta attiva']),
    ...(entry.domain.diceRules.filter(rule=>rule.enabled).length>=6?[]:['Servono almeno sei effetti dado']),
  ]:[],[entry,tournament])
  const create=async()=>{if(!name.trim()||creating)return;setCreating(true);setError('');try{const created=await workspace.createTournament(name.trim());setDraftId('domain'in created?created.domain.id:created.id);setStep(0)}catch(cause){setError(cause instanceof Error?cause.message:'Creazione della bozza non riuscita.')}finally{setCreating(false)}}
  if(!entry)return <PageShell><SectionHeader eyebrow="I miei tornei" title="Nuovo torneo" detail="Crea una bozza autorevole e completala nel percorso guidato."/><Paper component="form" sx={{p:{xs:2,md:4},maxWidth:720}} onSubmit={event=>{event.preventDefault();void create()}}><Typography variant="h2" sx={{mb:1}}>Nome della bozza</Typography><Typography color="text.secondary" sx={{mb:3}}>La bozza viene salvata prima di configurare squadre, effetti e accessi.</Typography><TextField autoFocus fullWidth required label="Nome torneo" value={name} onChange={event=>setName(event.target.value)}/>{error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}<Button type="submit" variant="contained" disabled={!name.trim()||creating} sx={{mt:3}}>{creating?'CREAZIONEâ€¦':'CREA BOZZA E CONTINUA'}</Button></Paper></PageShell>
  const content=[
    <GeneralSetup key="info" entry={entry} persisted={workspace.remote} onSave={workspace.saveTournamentConfig}/>,
    <Box key="effects" sx={{display:'grid',gap:3}}><Alert severity="info">Le selezioni restano isolate nel torneo corrente. Per il dado devono essere disponibili almeno sei effetti.</Alert><LibraryPanel entry={entry} kind="cards"/><DiceLibraryPanel entry={entry}/><LibraryPanel entry={entry} kind="events"/></Box>,
    <Paper key="referees" sx={{p:{xs:2,md:4}}}><Typography variant="h2">Arbitri e campi</Typography><Typography color="text.secondary" sx={{my:2}}>Gli account arbitro sono specifici del torneo. Il backend attuale non supporta lo spostamento sicuro di account tra tornei.</Typography><Button variant="contained" onClick={()=>navigate('/admin/access')}>CREA E ASSEGNA ARBITRI</Button></Paper>,
    <Box key="teams"><TournamentSetupContent tournament={tournament!} initialTab="TEAMS" embedded enableTeamAccess={!entry.local&&isSupabaseProvider()} repositoryOverride={entry.local?{createTeam:input=>workspace.state.saveTeam(entry,input),updateTeam:(id,input)=>workspace.state.saveTeam(entry,input,id),setTeamRanking:(_tournamentId,teamId,ranking)=>workspace.state.setTeamRanking(entry,teamId,ranking),assignRandomTeamRankings:()=>workspace.state.assignRandomTeamRankings(entry)}:undefined}/><Alert severity="info" sx={{mt:2}}>Per generare squadre fittizie o riutilizzare rose come modelli apri Dati di test nella Configurazione. Le squadre originali non vengono modificate.</Alert><Button sx={{mt:2}} variant="outlined" onClick={()=>navigate('/admin/setup')}>APRI DATI DI TEST</Button></Box>,
    <Paper key="summary" sx={{p:{xs:2,md:4}}}><Typography variant="h2">Riepilogo</Typography><Box component="dl" sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(3,1fr)'},gap:2,my:3}}>{[['Squadre',`${tournament?.teams.length??0}/${entry.config.teamsCount}`],['Campi',String(entry.config.courtsCount)],['Carte',String(entry.activeCards.length)],['Dado',String(entry.domain.diceRules.filter(rule=>rule.enabled).length)],['Eventi',String(entry.activeEvents.length)],['Stato',entry.config.status]].map(([label,value])=><Box key={label}><Typography component="dt" color="text.secondary">{label}</Typography><Typography component="dd" variant="h3" sx={{m:0}}>{value}</Typography></Box>)}</Box>{incomplete.map(item=><Alert key={item} severity="warning" sx={{mb:1}}>{item}</Alert>)}</Paper>,
    <Paper key="start" sx={{p:{xs:2,md:4}}}><Typography variant="h2">Avvio torneo</Typography><Typography color="text.secondary" sx={{my:2}}>Lâ€™avvio usa il controllo di ciclo esistente e resta bloccato se la configurazione non Ã¨ valida.</Typography>{incomplete.length?<Alert severity="warning">Completa il riepilogo prima dellâ€™avvio.</Alert>:<TournamentLifecycle entry={entry}/>}<Button sx={{mt:3}} variant="outlined" onClick={()=>navigate('/admin/control-room')}>APRI REGIA</Button></Paper>,
  ][step]
  return <PageShell><SectionHeader eyebrow="Nuovo torneo" title={entry.config.name} detail={`Bozza Â· Passo ${step+1} di ${steps.length}`}/><Stepper activeStep={step} alternativeLabel sx={{my:4}}>{steps.map(label=><Step key={label}><StepLabel>{label}</StepLabel></Step>)}</Stepper>{content}<Box sx={{display:'flex',justifyContent:'space-between',gap:2,mt:3}}><Button disabled={step===0} onClick={()=>setStep(value=>value-1)}>INDIETRO</Button>{step<steps.length-1&&<Button variant="contained" onClick={()=>setStep(value=>value+1)}>CONTINUA</Button>}</Box></PageShell>
}

