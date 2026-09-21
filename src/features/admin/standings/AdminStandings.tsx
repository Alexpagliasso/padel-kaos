import { Box, Paper, Typography } from '@mui/material'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { groupStandings } from '../../../domain/standings/groupStandings'

export function AdminStandings() {
  const { data: tournament } = useAdminWorkspace()
  return <Box><Typography variant="h1">Classifiche</Typography><Typography color="text.secondary" sx={{mt:1,mb:3}}>Aggiornate in tempo reale dopo la conferma definitiva del risultato.</Typography><Box sx={{display:'grid',gap:3}}>{tournament.groups.map(group=>{
    const rows=groupStandings(tournament,group.id)
    return <Paper key={group.id} sx={{overflow:'hidden'}}><Typography variant="h2" sx={{p:2,textTransform:'uppercase'}}>{group.name}</Typography><Box sx={{display:'grid',gridTemplateColumns:'48px minmax(0,1fr) repeat(3,56px)',px:2,py:1,bgcolor:'action.hover',fontWeight:900}}><span>Pos.</span><span>Squadra</span><span>G</span><span>V</span><span>P</span></Box>{rows.map((row,index)=><Box key={row.team.id} sx={{display:'grid',gridTemplateColumns:'48px minmax(0,1fr) repeat(3,56px)',px:2,py:1.5,borderTop:'1px solid',borderColor:'divider'}}><b>{index+1}</b><b>{row.team.name}</b><span>{row.standing.played}</span><span>{row.standing.won}</span><span>{row.standing.lost}</span></Box>)}</Paper>
  })}</Box></Box>
}
