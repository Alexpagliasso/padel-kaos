import { useState } from 'react'
import type { TeamRepositoryContract } from '../../../repositories/contracts'
import type { Team, Tournament } from '../../../shared/types/domain'

export function TeamRankingActions({ tournament, repository, onMessage, onError }: RankingActionProps) {
  const [saving, setSaving] = useState(false)
  const editable = isRankingEditable(tournament)

  async function assignRandom() {
    if (!repository.assignRandomTeamRankings || !window.confirm('Vuoi assegnare casualmente un ranking univoco a tutte le squadre?\nI ranking attuali verranno sostituiti.')) return
    setSaving(true); onError(''); onMessage('')
    try {
      await repository.assignRandomTeamRankings(tournament.id)
      onMessage('Ranking casuali assegnati e salvati.')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Impossibile assegnare i ranking casuali.')
    } finally { setSaving(false) }
  }

  return <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 bg-white/[0.03] p-3">
    <div><p className="font-black">Ranking squadre</p><p className="text-sm text-white/60">Valori univoci usati per la futura composizione dei gironi.</p></div>
    <button type="button" disabled={!editable || saving || !repository.assignRandomTeamRankings || tournament.teams.length === 0} className="rounded bg-[var(--event-primary)] px-4 py-2 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-45" onClick={() => void assignRandom()}>
      {saving ? 'Assegnazione…' : 'Assegna ranking casuale'}
    </button>
  </div>
}

export function TeamRankingEditor({ tournament, team, repository, onMessage, onError }: RankingEditorProps) {
  const [value, setValue] = useState(team.ranking === null ? '' : String(team.ranking))
  const [saving, setSaving] = useState(false)
  const editable = isRankingEditable(tournament)

  async function save(ranking: number | null) {
    if (!repository.setTeamRanking) return
    setSaving(true); onError(''); onMessage('')
    try {
      await repository.setTeamRanking(tournament.id, team.id, ranking)
      onMessage(ranking === null ? `Ranking rimosso da ${team.name}.` : `Ranking ${ranking} assegnato a ${team.name}.`)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Impossibile aggiornare il ranking.')
    } finally { setSaving(false) }
  }

  function submit() {
    if (!value.trim()) { void save(null); return }
    const ranking = Number(value)
    if (!Number.isInteger(ranking) || ranking < 1) { onError('Il ranking deve essere un numero intero maggiore o uguale a 1.'); return }
    void save(ranking)
  }

  return <div className="mt-4 border-t border-white/10 pt-3">
    <label className="text-xs font-black uppercase tracking-wide text-white/60" htmlFor={`ranking-${team.id}`}>Ranking</label>
    <div className="mt-1 flex flex-wrap gap-2">
      <input id={`ranking-${team.id}`} aria-label={`Ranking ${team.name}`} className="w-24 rounded border border-white/15 bg-black/30 px-3 py-2 font-black text-white disabled:opacity-55" type="number" min="1" step="1" value={value} disabled={!editable || saving} placeholder="—" onChange={(event) => setValue(event.target.value)} />
      <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm font-black disabled:opacity-45" disabled={!editable || saving || !repository.setTeamRanking} onClick={submit}>Salva ranking</button>
      <button type="button" className="rounded px-3 py-2 text-sm font-black text-white/70 disabled:opacity-45" disabled={!editable || saving || team.ranking === null || !repository.setTeamRanking} onClick={() => { setValue(''); void save(null) }}>Rimuovi ranking</button>
    </div>
  </div>
}

function isRankingEditable(tournament: Pick<Tournament, 'status'>) {
  return tournament.status === 'draft' || tournament.status === 'configured'
}

type RankingActionProps = { tournament: Tournament; repository: TeamRepositoryContract; onMessage: (message: string) => void; onError: (message: string) => void }
type RankingEditorProps = RankingActionProps & { team: Team }
