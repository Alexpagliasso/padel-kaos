import { useState } from 'react'
import { Alert, Box, Paper, Tab, Tabs, Typography } from '@mui/material'
import { EmptyState, PageShell, SectionHeader } from '../../../shared/components/Foundation'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { LibraryPanel } from '../setup/LibraryPanel'
import { DiceLibraryPanel } from '../setup/DiceLibraryPanel'

type CatalogTab='cards'|'dice'|'events'

export function AdminDefaultCatalog(){
  const {entry}=useAdminWorkspace()
  const [tab,setTab]=useState<CatalogTab>('cards')
  if(!entry)return <PageShell><EmptyState title="Catalogo predefinito" detail="Seleziona o crea un torneo per visualizzare e modificare il catalogo disponibile."/></PageShell>
  return <PageShell>
    <SectionHeader eyebrow="Libreria globale" title="Catalogo predefinito" detail="Gestisci gli effetti disponibili usando gli editor autorevoli già presenti."/>
    <Alert severity="info" sx={{mb:3}}>Il modello dati attuale conserva alcune definizioni e attivazioni nel contesto del torneo. Stai modificando il catalogo disponibile per <strong>{entry.config.name}</strong>; gli altri tornei non vengono aggiornati.</Alert>
    <Paper sx={{mb:3}}><Tabs value={tab} onChange={(_,value:CatalogTab)=>setTab(value)} variant="fullWidth" aria-label="Catalogo predefinito"><Tab value="cards" label="Carte"/><Tab value="dice" label="Dado"/><Tab value="events" label="Eventi"/></Tabs></Paper>
    <Box role="tabpanel">
      {tab==='cards'&&<LibraryPanel entry={entry} kind="cards"/>}
      {tab==='dice'&&<DiceLibraryPanel entry={entry}/>} 
      {tab==='events'&&<><Typography color="text.secondary" sx={{mb:2}}>Titolo, descrizioni, premio e immagine restano gestiti dall’editor eventi esistente.</Typography><LibraryPanel entry={entry} kind="events"/></>}
    </Box>
  </PageShell>
}
