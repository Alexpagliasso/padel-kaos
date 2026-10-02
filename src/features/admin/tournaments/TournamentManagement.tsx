import {useMemo,useState} from 'react'
import {Alert,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,MenuItem,Paper,TextField} from '@mui/material'
import {useNavigate} from 'react-router-dom'
import {PageShell} from '../../../shared/components/Foundation'
import type {WorkspaceEntry} from '../workspace/workspaceStore'
import {useAdminWorkspace} from '../workspace/useAdminWorkspace'

export function TournamentManagement(){
  const workspace=useAdminWorkspace()
  const navigate=useNavigate()
  return <TournamentManagementView entries={workspace.available} loading={Boolean(workspace.isLoading)} error={workspace.error} remote={workspace.remote}
    onOpen={entry=>{workspace.selectTournament(entry.domain.id);navigate('/admin/setup')}}
    onConfigure={entry=>{workspace.selectTournament(entry.domain.id);navigate('/admin/setup')}}
    onControlRoom={entry=>{workspace.selectTournament(entry.domain.id);navigate('/admin/control-room')}}
    onCreate={()=>navigate('/admin/new')}
    onDelete={async(entry,force)=>{if(!workspace.deleteWorkspaceTournament)throw new Error('Eliminazione torneo non disponibile');await workspace.deleteWorkspaceTournament(entry,force)}}/>
}

export function TournamentManagementView({entries,loading=false,error,remote=true,onOpen,onConfigure=onOpen,onControlRoom=onOpen,onCreate=()=>{},onDelete}:{entries:WorkspaceEntry[];loading?:boolean;error?:string;remote?:boolean;onOpen:(entry:WorkspaceEntry)=>void;onConfigure?:(entry:WorkspaceEntry)=>void;onControlRoom?:(entry:WorkspaceEntry)=>void;onCreate?:()=>void;onDelete:(entry:WorkspaceEntry,forceActive:boolean)=>Promise<void>}){
  const [query,setQuery]=useState('')
  const [sort,setSort]=useState<'newest'|'oldest'>('newest')
  const [target,setTarget]=useState<WorkspaceEntry|null>(null)
  const [confirmation,setConfirmation]=useState('')
  const [forceActive,setForceActive]=useState(false)
  const [deleting,setDeleting]=useState(false)
  const [failure,setFailure]=useState('')
  const visible=useMemo(()=>entries.filter(entry=>entry.config.name.toLocaleLowerCase('it').includes(query.trim().toLocaleLowerCase('it'))).sort((a,b)=>{
    const left=Date.parse(a.domain.createdAt??'')||0,right=Date.parse(b.domain.createdAt??'')||0
    return sort==='newest'?right-left:left-right
  }),[entries,query,sort])
  const active=target? !['draft','configured'].includes(target.domain.status??'draft'):false
  const close=()=>{if(deleting)return;setTarget(null);setConfirmation('');setForceActive(false);setFailure('')}
  const remove=async()=>{if(!target||confirmation!==target.config.name||(active&&!forceActive)||deleting)return;setDeleting(true);setFailure('');try{await onDelete(target,forceActive);setTarget(null);setConfirmation('');setForceActive(false);setDeleting(false)}catch(cause){setFailure(cause instanceof Error?cause.message:'Eliminazione non riuscita. Puoi riprovare in sicurezza.');setDeleting(false)}}
  return <PageShell><div className="grid gap-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-black uppercase tracking-[.18em] text-[var(--event-primary)]">I miei tornei</p><h1 className="mt-1 text-3xl font-black">Gestione tornei</h1><p className="mt-2 text-sm text-white/60">Apri, completa la configurazione o entra in Regia.</p></div><Button variant="contained" onClick={onCreate}>NUOVO TORNEO</Button></div>
    <div className="grid gap-2 sm:grid-cols-[1fr_220px]"><TextField label="Cerca per nome" value={query} onChange={event=>setQuery(event.target.value)}/><TextField select label="Ordina per data" value={sort} onChange={event=>setSort(event.target.value as 'newest'|'oldest')}><MenuItem value="newest">Più recenti</MenuItem><MenuItem value="oldest">Meno recenti</MenuItem></TextField></div>
    {loading&&<Paper sx={{p:3}}>Caricamento tornei…</Paper>}
    {error&&<Alert severity="error">{error}</Alert>}
    {!loading&&!error&&visible.length===0&&<Paper sx={{p:3}}>Nessun torneo trovato.</Paper>}
    <section className="grid gap-3 md:grid-cols-2">{visible.map(entry=><Paper component="article" key={entry.domain.id} sx={{p:3}}><p className="text-xs font-black uppercase text-white/45">{entry.domain.status??entry.config.status}</p><h2 className="mt-1 text-xl font-black">{entry.config.name}</h2><div className="mt-3 grid gap-1 text-sm text-white/65"><span>Creato: {formatDate(entry.domain.createdAt)}</span><span>Squadre: {entry.domain.teams.length||entry.domain.teamsCount||entry.config.teamsCount}</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><Button variant="contained" onClick={()=>onOpen(entry)}>APRI</Button><Button variant="outlined" onClick={()=>onConfigure(entry)}>CONTINUA CONFIGURAZIONE</Button><Button variant="outlined" onClick={()=>onControlRoom(entry)}>ENTRA IN REGIA</Button><Button color="error" variant="outlined" disabled={!remote||deleting} onClick={()=>{setTarget(entry);setConfirmation('');setForceActive(false);setFailure('')}}>ELIMINA TORNEO</Button></div>{!remote&&<p className="mt-2 text-xs text-white/45">Eliminazione definitiva disponibile solo per tornei Supabase.</p>}</Paper>)}</section>
    <Dialog open={Boolean(target)} onClose={close} fullWidth maxWidth="sm"><DialogTitle>Elimina definitivamente {target?.config.name}</DialogTitle><DialogContent><Alert severity="error">Saranno eliminati turni, incontri, formazioni, squadre, giocatori, carte assegnate, dado, eventi, arbitri, profili operativi, backup e immagini del torneo. Gli Admin e i dati condivisi restano protetti.</Alert>{active&&<FormControlLabel sx={{mt:2}} control={<Checkbox checked={forceActive} onChange={(_,checked)=>setForceActive(checked)}/>} label="Confermo di voler eliminare anche se ci sono partite in corso"/>}<TextField autoFocus fullWidth sx={{mt:2}} label="Digita esattamente il nome del torneo" value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={deleting}/>{failure&&<Alert severity="error" sx={{mt:2}}>{failure}</Alert>}</DialogContent><DialogActions><Button disabled={deleting} onClick={close}>ANNULLA</Button><Button color="error" variant="contained" disabled={!target||confirmation!==target.config.name||(active&&!forceActive)||deleting} onClick={()=>void remove()}>{deleting?'ELIMINAZIONE IN CORSO…':'ELIMINA DEFINITIVAMENTE'}</Button></DialogActions></Dialog>
  </div></PageShell>
}

function formatDate(value?:string|null){if(!value)return 'Data non disponibile';return new Intl.DateTimeFormat('it-IT',{dateStyle:'medium'}).format(new Date(value))}
