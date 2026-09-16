import { canPreviewAsAdmin } from '../features/admin/preview/previewPolicy'
import type { ReactNode } from 'react'
import { RoleShell } from '../shared/components/RoleShell'
import { useRoleTournament as useTournament } from '../features/admin/preview/useRoleTournament'
import { useDemoStore } from '../demo/demoStore'
import { dataProvider } from '../repositories'
import { useAuth } from '../features/auth/authContext'
import { resolvePlayerRouteState, type PlayerRouteState } from './playerRouteState'
import type { DemoEvent } from '../demo/demoTypes'
import type { Tournament } from '../shared/types/domain'
import { LogoutButton } from '../features/auth/LogoutButton'
import { TeamMobileApp } from '../features/player/TeamMobileApp'
import { useEventRepository } from '../repositories/eventRepository'

export { getOwnMatchCards, getRequiredLineupSet, TeamCardDeck } from '../features/player/TeamMobileApp'

export function PlayerRoute() {
  const { data: tournament, isLoading, error } = useTournament()
  const events = useEventRepository().events
  const { profile, status: authStatus } = useAuth()
  const adminPreview = canPreviewAsAdmin(authStatus, profile?.role)
  const selectedTeamId = useDemoStore(state => state.selectedTeamId)
  const selectTeam = useDemoStore(state => state.selectTeam)
  const playCard = useDemoStore(state => state.playCard)
  const logoutAction = profile?.role === 'team' ? <LogoutButton minimal /> : undefined
  const routeState = resolvePlayerRouteState({
    provider: adminPreview ? 'demo' : dataProvider,
    tournament,
    isLoading,
    repositoryError: error,
    profile,
    demoSelectedTeamId: adminPreview && !tournament.teams.some(team => team.id === selectedTeamId) ? tournament.teams[0]?.id ?? '' : selectedTeamId,
  })

  if (routeState.type === 'loading') return <RoleShell action={logoutAction}><main className="mx-auto grid min-h-[70svh] max-w-5xl place-items-center px-4 text-center"><p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Caricamento area giocatore</p></main></RoleShell>
  if (routeState.type === 'error') return <RoleShell action={logoutAction}><main className="mx-auto grid min-h-[70svh] max-w-5xl place-items-center px-4 text-center"><section className="max-w-xl rounded border border-white/10 bg-[#171717] p-6"><p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--event-primary)]">Area giocatore non disponibile</p><h1 className="mt-3 text-3xl font-black">{routeState.title}</h1><p className="mt-3 text-white/60">{routeState.message}</p></section></main></RoleShell>

  return <PlayerRouteContent tournament={tournament} events={events} routeState={routeState} onSelectDemoTeam={selectTeam} onPlayDemoCard={teamCardId => adminPreview && dataProvider === 'supabase' ? 'Anteprima Admin in sola lettura' : playCard(teamCardId).message} headerAction={logoutAction} />
}

export function PlayerRouteContent({ tournament, events, routeState, onSelectDemoTeam, onPlayDemoCard, headerAction }: {
  tournament: Tournament
  events: DemoEvent[]
  routeState: Extract<PlayerRouteState, { type: 'ready' }>
  onSelectDemoTeam: (teamId: string) => void
  onPlayDemoCard: (teamCardId: string) => string
  headerAction?: ReactNode
}) {
  return <TeamMobileApp tournament={tournament} events={events} routeState={routeState} onSelectDemoTeam={onSelectDemoTeam} onPlayDemoCard={onPlayDemoCard} headerAction={headerAction} />
}
