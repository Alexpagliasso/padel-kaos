import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, Check, ChevronLeft, ChevronRight, CreditCard, Info, Mars, Swords, Table2, Venus, X } from 'lucide-react'
import { Dialog, DialogContent, IconButton } from '@mui/material'
import { MobileRoleShell } from '../../shared/components/Foundation'
import { validateMatchLineup } from '../../domain/rules/rulesEngine'
import { useLineupRepository } from '../../repositories/lineupRepository'
import { getPlayerDisplayName } from '../../shared/lib/playerNames'
import type { CardDefinition, Match, Team, TeamCard, Tournament } from '../../shared/types/domain'
import type { PlayerRouteState } from '../../routes/playerRouteState'
import type { DemoEvent } from '../../demo/demoTypes'
import { EventPresentationOverlay } from '../../shared/components/EventPresentationOverlay'
import { GlobalEventOverlay } from '../../shared/components/GlobalEventOverlay'
import { getDiceRuleForMatch } from '../tournament/selectors'

type TeamTab = 'match' | 'standings' | 'results'

export function TeamMobileApp({ tournament, events, routeState, onSelectDemoTeam, onPlayDemoCard, headerAction }: {
  tournament: Tournament
  events: DemoEvent[]
  routeState: Extract<PlayerRouteState, { type: 'ready' }>
  onSelectDemoTeam: (teamId: string) => void
  onPlayDemoCard: (teamCardId: string) => string
  headerAction?: ReactNode
}) {
  const [tab, setTab] = useState<TeamTab>('match')
  const [selectedMatchId, setSelectedMatchId] = useState(routeState.match.id)
  const [deckOpen, setDeckOpen] = useState(false)
  const { playerTeam, matches, cards, greetingName, showDemoTeamSelector } = routeState
  const match = matches.find(item => item.id === selectedMatchId) ?? routeState.match
  const matchCards = getOwnMatchCards(cards, playerTeam.id, match.id)

  return <MobileRoleShell title={playerTeam.name} status={tournament.status ?? match.status} action={headerAction}>
    <main className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">{showDemoTeamSelector ? 'Demo giocatore' : 'Area giocatore'}</p><p className="truncate text-sm text-white/60">Ciao {greetingName}</p></div>
        {showDemoTeamSelector ? <select aria-label="Visualizza come squadra" className="max-w-40 rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" value={playerTeam.id} onChange={event => onSelectDemoTeam(event.target.value)}>{tournament.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select> : null}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .16 }}>
          {tab === 'match' && <TeamMatchTab tournament={tournament} events={events} team={playerTeam} match={match} />}
          {tab === 'standings' && <TeamStandingsTab tournament={tournament} team={playerTeam} />}
          {tab === 'results' && <TeamResultsTab tournament={tournament} team={playerTeam} matches={matches} selectedMatchId={match.id} onSelectMatch={(id) => { setSelectedMatchId(id); setTab('match') }} />}
        </motion.div>
      </AnimatePresence>
    </main>
    <TeamBottomNavigation active={tab} cardsCount={matchCards.length} onChange={setTab} onOpenCards={() => setDeckOpen(true)} />
    <TeamCardDeck open={deckOpen} onClose={() => setDeckOpen(false)} cards={matchCards} definitions={tournament.cards} demo={showDemoTeamSelector} onPlayDemoCard={onPlayDemoCard} />
  </MobileRoleShell>
}

export function TeamBottomNavigation({ active, cardsCount, onChange, onOpenCards }: { active: TeamTab; cardsCount: number; onChange: (tab: TeamTab) => void; onOpenCards: () => void }) {
  const items = [
    { id: 'match' as const, label: 'Partita', icon: Swords },
    { id: 'standings' as const, label: 'Classifica', icon: Table2 },
    { id: 'results' as const, label: 'Risultati', icon: CalendarDays },
  ]
  return <nav aria-label="Navigazione squadra" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0b0b]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_rgba(0,0,0,.35)] backdrop-blur-xl"><div className="mx-auto grid max-w-lg grid-cols-4 items-end px-2 py-2"><NavItem item={items[0]} active={active} onChange={onChange} /><NavItem item={items[1]} active={active} onChange={onChange} /><button type="button" aria-label={cardsCount ? `Apri carte, ${cardsCount} disponibili` : 'Apri carte, nessuna disponibile'} disabled={!cardsCount} onClick={onOpenCards} className="relative grid min-h-14 place-items-center gap-1 rounded-xl text-xs font-black uppercase tracking-wide text-[var(--event-primary)] disabled:text-white/30"><span className="relative -mt-5 grid size-12 place-items-center rounded-xl border border-[var(--event-primary)]/50 bg-[var(--event-primary)] text-black shadow-[0_0_24px_var(--event-soft)]"><CreditCard className="size-5" />{cardsCount > 0 && <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-white text-[10px] font-black text-black">{cardsCount}</span>}</span><span>Carte</span></button><NavItem item={items[2]} active={active} onChange={onChange} /></div></nav>
}

function NavItem({ item, active, onChange }: { item: { id: TeamTab; label: string; icon: typeof Swords }; active: TeamTab; onChange: (tab: TeamTab) => void }) { const selected = active === item.id; return <button type="button" aria-current={selected ? 'page' : undefined} onClick={() => onChange(item.id)} className={`grid min-h-14 place-items-center gap-1 rounded-xl text-xs font-black uppercase tracking-wide transition ${selected ? 'bg-[var(--event-primary)]/15 text-[var(--event-primary)]' : 'text-white/55'}`}><item.icon className="size-5" />{item.label}</button> }

function TeamMatchTab({ tournament, events, team, match }: { tournament: Tournament; events: DemoEvent[]; team: Team; match: Match }) {
  const opponent = tournament.teams.find(item => item.id === (match.teamAId === team.id ? match.teamBId : match.teamAId))
  const round = tournament.rounds?.find(item => item.id === match.roundId)
  const court = tournament.courts.find(item => item.id === match.courtId)
  const phase = getRequiredLineupSet(match)
  const confirmed = phase ? match.lineups.some(item => item.teamId === team.id && item.setNumber === phase) : true
  const live = ['live', 'live_set_1', 'live_set_2'].includes(match.status)
  const diceRule = getDiceRuleForMatch(tournament, match)
  const globalEvent = tournament.globalEvents.find(event => event.status === 'active' || event.status === 'completed')
  return <div className="grid gap-4">
    <EventPresentationOverlay events={events} />
    <section className={`relative overflow-hidden rounded-[28px] border p-5 shadow-2xl ${live ? 'border-emerald-400/45 bg-gradient-to-br from-emerald-500/15 via-[#171717] to-black' : 'border-[var(--event-primary)]/30 bg-gradient-to-br from-[var(--event-primary)]/15 via-[#171717] to-black'}`}>
      <div className="absolute -right-12 -top-12 size-36 rounded-full bg-[var(--event-primary)]/10 blur-3xl" />
      <div className="relative text-center"><div className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/60"><span>{round?.name ?? 'Turno'}</span><span>·</span><span>{court?.name ?? 'Campo da assegnare'}</span></div>{live && <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black uppercase text-emerald-300"><span className="size-2 rounded-full bg-emerald-300" />In corso</p>}<div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3"><h1 className="min-w-0 break-words text-xl font-black leading-tight">{team.name}</h1><span className="text-sm font-black text-[var(--event-primary)]">VS</span><h2 className="min-w-0 break-words text-xl font-black leading-tight">{opponent?.name ?? 'Avversario'}</h2></div><p className="mt-5 text-2xl font-black">{matchSetLabel(match)}</p><p className="mt-1 text-sm text-white/60">{matchStatusLabel(match.status)}</p></div>
    </section>
    <section className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-white/45">Adesso</p><p className="mt-1 text-lg font-black text-[var(--event-primary)]">{phase && !confirmed ? `Schiera formazione Set ${phase}` : confirmed ? 'Formazione confermata' : 'In attesa della prossima fase'}</p></section>
    <TeamLineupSection tournament={tournament} team={team} match={match} />
    {diceRule && <section className="rounded-2xl border border-[var(--event-primary)]/25 bg-[var(--event-primary)]/10 p-4"><p className="text-xs font-black uppercase text-[var(--event-primary)]">Regola Kaos</p><p className="mt-1 font-black">{diceRule.title}</p><p className="mt-1 text-sm text-white/65">{diceRule.description}</p></section>}
    <GlobalEventOverlay event={globalEvent} />
  </div>
}

function TeamLineupSection({ tournament, team, match }: { tournament: Tournament; team: Team; match: Match }) {
  const repository = useLineupRepository()
  const phase = getRequiredLineupSet(match)
  const persisted = phase ? match.lineups.find(item => item.teamId === team.id && item.setNumber === phase) : undefined
  const [editing, setEditing] = useState(!persisted)
  const [selected, setSelected] = useState<string[]>(persisted?.activePlayerIds ?? [])
  const [feedback, setFeedback] = useState('')
  useEffect(() => { setSelected(persisted?.activePlayerIds ?? []); setEditing(!persisted) }, [match.id, phase, persisted?.confirmedAt])
  const used = match.lineups.filter(item => item.teamId === team.id && item.setNumber !== phase && item.setNumber < 3)
  const validation = validateMatchLineup({ candidate: { activePlayerIds: selected }, usedLineups: used, roster: team.players })
  const stb = match.lineups.find(item => item.teamId === team.id && item.setNumber === 3)
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 2 ? [...current, id] : [current[1], id])
  const save = async () => { if (!phase || !validation.valid || selected.length !== 2) return; setFeedback(''); try { await repository.confirm({ tournamentId: tournament.id, matchId: match.id, teamId: team.id, setNumber: phase, playerIds: [selected[0], selected[1]] }); setFeedback('Formazione confermata.'); setEditing(false) } catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Impossibile confermare la formazione.') } }
  if (persisted && !editing) return <motion.section layout className="rounded-xl border border-emerald-400/25 bg-emerald-400/[.07] p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-black uppercase text-emerald-300">Formazione <span aria-hidden="true">✓</span><span className="sr-only">confermata</span></p><p className="mt-1 truncate text-sm font-bold">{formatPair(persisted.activePlayerIds, team)}</p></div><button type="button" onClick={() => setEditing(true)} className="min-h-11 shrink-0 rounded-lg border border-white/15 px-3 text-sm font-black">Modifica</button></div></motion.section>
  return <motion.section layout className="rounded-xl border border-white/10 bg-white/[.04] p-3"><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--event-primary)]">Formazione</p><h2 className="mt-1 text-lg font-black">{phase ? `Set ${phase} · scegli 2 giocatori` : lineupLifecycleMessage(match, team.id)}</h2>{phase ? <><p className="mt-1 text-sm text-white/60">Ogni coppia può essere usata una sola volta nella partita.</p><div className="mt-3 grid gap-2">{team.players.map(player => { const active = selected.includes(player.id); const Gender = player.gender === 'woman' ? Venus : player.gender === 'man' ? Mars : null; return <motion.button whileTap={{ scale: .98 }} key={player.id} type="button" aria-pressed={active} onClick={() => toggle(player.id)} className={`flex min-h-12 items-center justify-between rounded-lg border px-3 py-2 text-left ${active ? 'border-[var(--event-primary)] bg-[var(--event-primary)]/15 shadow-[0_0_18px_var(--event-soft)]' : 'border-white/10 bg-black/25'}`}><span><strong className="block text-sm">{player.firstName || getPlayerDisplayName(player)} {player.lastName}</strong><small className="flex items-center gap-1 text-white/55">{Gender && <Gender className="size-3.5" />}{genderLabel(player.gender)}</small></span>{active && <Check className="size-5 text-[var(--event-primary)]" />}</motion.button> })}</div>{!validation.valid && selected.length === 2 && <p className="mt-3 text-sm font-bold text-red-200">{validation.reason}</p>}{feedback || repository.error ? <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm font-bold">{feedback || repository.error}</p> : null}<button type="button" disabled={repository.isSaving || !validation.valid} onClick={save} className="mt-3 min-h-12 w-full rounded-lg bg-[var(--event-primary)] px-4 font-black uppercase text-black disabled:opacity-40">Conferma formazione</button>{persisted && <button type="button" onClick={() => setEditing(false)} className="mt-1 min-h-11 w-full text-sm font-bold text-white/60">Annulla modifica</button>}</> : <p className="mt-2 text-sm text-white/60">{stb ? `Super Tie-Break: ${formatPair(stb.activePlayerIds, team)}` : 'La coppia del Super Tie-Break sarà determinata automaticamente.'}</p>}</motion.section>
}

export function TeamCardDeck({ open, onClose, cards, definitions, demo, onPlayDemoCard }: { open: boolean; onClose: () => void; cards: TeamCard[]; definitions: CardDefinition[]; demo: boolean; onPlayDemoCard: (id: string) => string }) {
  const [index, setIndex] = useState(0)
  const [detail, setDetail] = useState<{ teamCard: TeamCard; definition: CardDefinition } | null>(null)
  const reducedMotion = useReducedMotion()
  useEffect(() => { if (open) setIndex(0) }, [open])
  const visible = cards.map(teamCard => ({ teamCard, definition: definitions.find(card => card.id === teamCard.cardId) })).filter((item): item is { teamCard: TeamCard; definition: CardDefinition } => Boolean(item.definition))
  const move = (direction: number) => setIndex(current => visible.length ? (current + direction + visible.length) % visible.length : 0)
  const positionOf = (cardIndex: number) => {
    let position = cardIndex - index
    if (position > visible.length / 2) position -= visible.length
    if (position < -visible.length / 2) position += visible.length
    return position
  }
  return <>
    <Dialog fullScreen open={open} onClose={onClose} slotProps={{ paper: { sx: { bgcolor: '#090909', backgroundImage: 'radial-gradient(circle at 50% 15%, var(--event-soft), transparent 42%)' } } }}>
      <div className="flex h-[100svh] min-h-0 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <header className="flex min-h-16 items-center justify-between px-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--event-primary)]">La tua mano</p><h2 className="text-xl font-black">Mazzo carte</h2></div><IconButton aria-label="Chiudi mazzo" onClick={onClose}><X /></IconButton></header>
        <div className="relative min-h-0 flex-1 overflow-hidden py-2">
          {visible.length ? <div className="relative mx-auto h-full min-h-[350px] max-h-[min(68svh,590px)] w-full max-w-md overflow-hidden">{visible.map((item, cardIndex) => {
            const position = positionOf(cardIndex)
            if (Math.abs(position) > 1) return null
            const front = position === 0
            const selectCard = () => { if (!front) setIndex(cardIndex) }
            return <div key={item.teamCard.id} className="pointer-events-none absolute inset-0 grid place-items-center">
              <motion.article
                role={front ? undefined : 'button'}
                tabIndex={front ? -1 : 0}
                aria-label={front ? undefined : `Seleziona carta ${item.definition.name}`}
                onClick={selectCard}
                onKeyDown={event => { if (!front && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectCard() } }}
                className="pointer-events-auto relative aspect-[.72] max-h-full w-[calc(100%-72px)] max-w-[300px] overflow-hidden rounded-[18px] border border-white/15 bg-[#171717] shadow-[0_24px_60px_rgba(0,0,0,.68)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-primary)]"
                style={{ zIndex: front ? 20 : 10 }}
                animate={{ x: position * 82, y: Math.abs(position) * 10, scale: front ? 1 : .9, rotate: position * 4, opacity: front ? 1 : .7 }}
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
                drag={front && !reducedMotion ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={.42}
                onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 55 || Math.abs(info.velocity.x) > 450) move(info.offset.x < 0 ? 1 : -1) }}
              >
                {item.definition.imageUrl ? <div className="h-[43%] bg-black/35 p-2"><img src={item.definition.imageUrl} alt="" className="h-full w-full object-contain" /></div> : <div className="grid h-[40%] place-items-center bg-gradient-to-br from-[var(--event-primary)]/35 to-black"><Swords className="size-14 text-[var(--event-primary)]" /></div>}
                <div className="grid gap-2 p-4">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.14em] text-[var(--event-primary)]">{cardStateLabel(item.teamCard.state)}</p><h3 className="mt-1 text-xl font-black leading-tight">{item.definition.name}</h3></div>{front && <IconButton aria-label={`Dettagli carta ${item.definition.name}`} onClick={() => setDetail(item)} sx={{ minWidth: 44, minHeight: 44 }}><Info /></IconButton>}</div>
                  <p className="line-clamp-2 text-sm leading-relaxed text-white/70">{item.definition.description}</p>
                  <span className="w-fit rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">Durata · {durationLabel(item.definition.durationType, item.definition.durationValue)}</span>
                  {front && <button type="button" disabled={!demo || item.teamCard.state !== 'available'} onClick={() => onPlayDemoCard(item.teamCard.id)} className="min-h-12 rounded-lg bg-[var(--event-primary)] px-4 font-black text-black disabled:bg-white/10 disabled:text-white/45">{demo ? 'Gioca carta' : 'Utilizzo non ancora disponibile'}</button>}
                </div>
              </motion.article>
            </div>
          })}</div> : <div className="grid h-full place-items-center px-6 text-center text-white/60">Nessuna carta assegnata per questa partita.</div>}
        </div>
        {visible.length > 0 && <footer className="px-4 pb-4"><div className="mx-auto flex max-w-xs items-center justify-between gap-3"><button aria-label="Carta precedente" onClick={() => move(-1)} className="grid size-12 place-items-center rounded-full bg-white/10"><ChevronLeft /></button><p aria-label={`Carta ${index + 1} di ${visible.length}`} className="text-sm font-black text-white/65">{index + 1} / {visible.length}</p><button aria-label="Carta successiva" onClick={() => move(1)} className="grid size-12 place-items-center rounded-full bg-white/10"><ChevronRight /></button></div><p className="mt-1 text-center text-xs text-white/40">Tocca una carta laterale o scorri</p></footer>}
      </div>
    </Dialog>
    <Dialog fullWidth open={Boolean(detail)} onClose={() => setDetail(null)} slotProps={{ paper: { sx: { m: 0, width: '100%', maxHeight: 'calc(100svh - 12px)', borderRadius: '18px 18px 0 0', alignSelf: 'flex-end', bgcolor: '#171717' } } }}>
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/25" />
      <div className="flex min-h-14 items-center justify-between px-4"><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--event-primary)]">Dettagli carta</p><IconButton aria-label="Chiudi dettagli carta" onClick={() => setDetail(null)}><X /></IconButton></div>
      <DialogContent sx={{ overflowY: 'auto', pt: 0, pb: 'calc(20px + env(safe-area-inset-bottom))' }}>{detail && <div>{detail.definition.imageUrl && <div className="mb-4 h-[min(30svh,260px)] rounded-xl bg-black/35 p-2"><img src={detail.definition.imageUrl} alt="" className="h-full w-full object-contain" /></div>}<h3 className="text-2xl font-black">{detail.definition.name}</h3><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[var(--event-primary)]/15 px-3 py-1 text-xs font-black text-[var(--event-primary)]">{cardStateLabel(detail.teamCard.state)}</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">Durata · {durationLabel(detail.definition.durationType, detail.definition.durationValue)}</span></div><p className="mt-5 text-xs font-black uppercase tracking-[.16em] text-white/45">Descrizione</p><p className="mt-2 whitespace-pre-line leading-relaxed text-white/75">{detail.definition.longDescription || detail.definition.description}</p></div>}</DialogContent>
    </Dialog>
  </>
}

function TeamStandingsTab({ tournament, team }: { tournament: Tournament; team: Team }) {
  const rows = groupStandings(tournament, team.groupId)
  return <section><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--event-primary)]">Il tuo girone</p><h1 className="mt-1 text-3xl font-black">Classifica</h1><p className="mt-1 text-sm text-white/55">{tournament.groups.find(group => group.id === team.groupId)?.name ?? 'Girone da definire'}</p><div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#171717]"><div className="grid grid-cols-[32px_minmax(0,1fr)_repeat(4,32px)] gap-1 bg-white/[.07] px-3 py-3 text-center text-[11px] font-black uppercase text-white/45"><span>Pos.</span><span className="text-left">Squadra</span><span>PG</span><span>V</span><span>S</span><span>Pts</span></div>{rows.map((row, index) => <div data-current-team={row.team.id === team.id || undefined} key={row.team.id} className={`grid min-h-14 grid-cols-[32px_minmax(0,1fr)_repeat(4,32px)] items-center gap-1 border-t border-white/10 px-3 text-center text-sm ${row.team.id === team.id ? 'bg-[var(--event-primary)]/15 font-black text-[var(--event-primary)]' : ''}`}><span>{index + 1}</span><span className="truncate text-left">{row.team.name}</span><span>{row.standing?.played ?? '—'}</span><span>{row.standing?.won ?? '—'}</span><span>{row.standing?.lost ?? '—'}</span><span>{row.standing?.points ?? '—'}</span></div>)}</div></section>
}

function TeamResultsTab({ tournament, team, matches, selectedMatchId, onSelectMatch }: { tournament: Tournament; team: Team; matches: Match[]; selectedMatchId: string; onSelectMatch: (id: string) => void }) {
  const completed = matches.filter(match => match.status === 'completed')
  const future = matches.filter(match => match.status !== 'completed')
  const next = future.find(match => match.id === selectedMatchId) ?? future[0]
  const programmed = future.filter(match => match.id !== next?.id)
  return <section><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--event-primary)]">Risultati</p><h1 className="mt-1 text-3xl font-black">Partite della squadra</h1><div className="mt-5 grid gap-6">{next && <MatchGroup title="Prossimo"><TeamMatchListItem tournament={tournament} team={team} match={next} featured onSelect={onSelectMatch} /></MatchGroup>}{programmed.length > 0 && <MatchGroup title="In programma">{programmed.map(match => <TeamMatchListItem key={match.id} tournament={tournament} team={team} match={match} onSelect={onSelectMatch} />)}</MatchGroup>}{completed.length > 0 && <MatchGroup title="Conclusi">{completed.map(match => <TeamMatchListItem key={match.id} tournament={tournament} team={team} match={match} completed onSelect={onSelectMatch} />)}</MatchGroup>}</div></section>
}

function MatchGroup({ title, children }: { title: string; children: ReactNode }) { return <div><h2 className="mb-2 text-xs font-black uppercase tracking-[.18em] text-white/45">{title}</h2><div className="grid gap-2">{children}</div></div> }
function TeamMatchListItem({ tournament, team, match, featured, completed, onSelect }: { tournament: Tournament; team: Team; match: Match; featured?: boolean; completed?: boolean; onSelect: (id: string) => void }) { const opponent = tournament.teams.find(item => item.id === (match.teamAId === team.id ? match.teamBId : match.teamAId)); const round = tournament.rounds?.find(item => item.id === match.roundId); const court = tournament.courts.find(item => item.id === match.courtId); return <button type="button" onClick={() => onSelect(match.id)} className={`min-h-20 rounded-2xl border p-4 text-left ${featured ? 'border-[var(--event-primary)]/40 bg-[var(--event-primary)]/10' : 'border-white/10 bg-[#171717]'} ${completed ? 'opacity-65' : ''}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase text-white/45">{round?.name ?? 'Turno'} · {court?.name ?? 'Campo da assegnare'}</p><p className="mt-1 truncate text-lg font-black">vs {opponent?.name ?? 'Avversario'}</p></div><span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold">{matchStatusLabel(match.status)}</span></div>{completed && <p className="mt-2 text-sm font-black">Risultato · {match.score.sets.A}–{match.score.sets.B}</p>}</button> }

export function getRequiredLineupSet(match: Match): 1 | 2 | null { if (!match.set1StartedAt && ['scheduled', 'ready', 'lineup'].includes(match.status)) return 1; if (match.set1EndedAt && !match.set2StartedAt && ['set_break', 'lineup_set_2'].includes(match.status)) return 2; return null }
export function getOwnMatchCards(cards: TeamCard[], teamId: string, matchId: string) { return cards.filter(card => card.teamId === teamId && card.matchId === matchId) }
function groupStandings(tournament: Tournament, groupId: string) { return tournament.teams.filter(team => team.groupId === groupId).map(team => ({ team, standing: tournament.standings.find(item => item.teamId === team.id) })).sort((a, b) => (b.standing?.points ?? -1) - (a.standing?.points ?? -1)) }
function matchSetLabel(match: Match) { if (match.status === 'set_break' || match.status === 'lineup_set_2' || match.status === 'live_set_2') return 'Set 2'; if (match.status === 'completed') return 'Terminata'; return 'Set 1' }
function matchStatusLabel(status: Match['status']) { const labels: Record<Match['status'], string> = { scheduled: 'Programmata', lineup: 'Formazioni', ready: 'Pronta', live: 'In corso', live_set_1: 'Set 1 in corso', set_break: 'Pausa tra i set', lineup_set_2: 'Formazioni Set 2', kaos_pending: 'Attesa Kaos', kaos_reveal: 'Rivelazione Kaos', kaos_event: 'Evento Kaos', live_set_2: 'Set 2 in corso', completed: 'Terminata' }; return labels[status] }
function lineupLifecycleMessage(match: Match, teamId: string) { if (match.lineups.some(item => item.teamId === teamId && item.setNumber === 2)) return 'Formazione del Set 2 confermata'; if (match.lineups.some(item => item.teamId === teamId && item.setNumber === 1)) return 'Formazione del Set 1 confermata'; return match.status === 'completed' ? 'Partita terminata' : 'In attesa della fase formazione' }
function cardStateLabel(state: TeamCard['state']) { return ({ available: 'Disponibile', pending: 'In attesa', active: 'Attiva', used: 'Usata', cancelled: 'Annullata' } as const)[state] }
function durationLabel(type: CardDefinition['durationType'], value: number) { const labels = { timed: 'tempo', games: 'game', instant: 'istantanea', until_condition: 'fino alla condizione indicata', point: 'punto', game: 'game', set: 'set', match: 'partita' }; return value > 0 && (type === 'timed' || type === 'games') ? `${value} ${labels[type]}` : labels[type] }
function genderLabel(gender: Team['players'][number]['gender']) { return ({ woman: 'Donna', man: 'Uomo', non_binary: 'Non binario', unspecified: 'Non specificato' } as const)[gender] }
function formatPair(pair: readonly [string, string], team: Team) { return pair.map(id => { const player = team.players.find(item => item.id === id); return player ? getPlayerDisplayName(player) : 'Da definire' }).join(' · ') }
