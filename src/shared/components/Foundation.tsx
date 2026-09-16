import type { ReactNode } from 'react'
import { Avatar, Box, Button, Chip, Paper, Stack, Typography, type ButtonProps } from '@mui/material'
import SportsTennis from '@mui/icons-material/SportsTennis'
import { motion } from 'framer-motion'
import { formatStatusLabel } from '../lib/uiLabels'
export function TournamentLogo() {
  return <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
    <Avatar variant="rounded" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', transform: 'rotate(-8deg)' }}>
      <SportsTennis />
    </Avatar>
    <Typography sx={{ fontWeight: 900, letterSpacing: "-.04em" }}>PADEL <Box component="span" sx={{ color: 'primary.main' }}>KAOS</Box>
    </Typography>
  </Stack>
}
export function StatusChip({ label }: { label: string }) { return <Chip size="small" variant="outlined" color={label.includes('live') || label === 'active' ? 'success' : 'primary'} label={formatStatusLabel(label)} /> }
export function SectionHeader({ title, eyebrow, detail }: { title: string; eyebrow?: string; detail?: string }) { return <Box component="header" sx={{ mb: 3 }}>{eyebrow && <Typography color="primary" sx={{ fontSize: 12, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase" }}>{eyebrow}</Typography>}<Typography variant="h1" sx={{ mt: 1 }}>{title}</Typography>{detail && <Typography color="text.secondary" sx={{ mt: 1.5 }}>{detail}</Typography>}</Box> }
export function PageShell({ children, embedded = false }: { children: ReactNode; embedded?: boolean }) { return <Box component={embedded ? 'div' : 'main'} sx={{ maxWidth: 1600, mx: 'auto', width: '100%', p: embedded ? 0 : { xs: 2, md: 4 }, minWidth: 0 }}>{children}</Box> }
export function MobileRoleShell({ children, title, status, action }: { children: ReactNode; title?: string; status?: string; action?: ReactNode }) {
  return <Box className="role-mobile" sx={{ minHeight: '100svh', background: 'radial-gradient(ellipse at top right, var(--event-soft), transparent 50%)' }}>
    <Stack component="header" direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center", maxWidth: 1100, mx: 'auto', p: 2, borderBottom: 1, borderColor: 'divider' }}>
      <Box>
        <TournamentLogo />{title && <Typography sx={{ fontWeight: 700, mt: 1 }} >{title}</Typography>}</Box><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>{status && <StatusChip label={status} />}{action}</Stack></Stack>{children}</Box>
}
export function DisplayShell({ children }: { children: ReactNode }) {
  return <Box className="role-display" sx={{ minHeight: '100svh', background: 'radial-gradient(ellipse at top left, var(--event-soft), transparent 60%)', p: { xs: 2, lg: 4 } }}>
    <TournamentLogo />{children}</Box>
}
export function PrimaryAction(props: ButtonProps) { return <Button variant="contained" {...props} /> }
export function DangerAction(props: ButtonProps) { return <Button variant="outlined" color="error" {...props} /> }
export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <Paper sx={{ p: 5, textAlign: 'center' }}>
    <Typography variant="h3">{title}</Typography>
    <Typography color="text.secondary">{detail}</Typography>
  </Paper>
}
export function EventOverlay({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  return <Box component={motion.section} initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .25 }} sx={{ minHeight: '85svh', display: 'grid', placeItems: 'center', textAlign: 'center', background: 'var(--event-gradient)', borderRadius: 2, p: 4 }}>
    <Box>
      <Typography color="primary" sx={{ fontWeight: 900, fontSize: 'clamp(1.2rem, 2.5vw, 3rem)' }}>{kicker}</Typography>
      <Typography variant="h1" sx={{ my: 3, fontSize: 'clamp(3rem, 7vw, 9rem)' }}>{title}</Typography>
      <Typography sx={{ fontSize: 'clamp(1.2rem, 2.5vw, 3rem)' }}>{detail}</Typography>
    </Box>
  </Box>
}
