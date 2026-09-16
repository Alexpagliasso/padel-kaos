import { describe, expect, it, vi } from 'vitest'
import { assertTournamentAdminMembership as requireTournamentAdmin } from '../../../supabase/functions/_shared/tournamentAdmin'

function client(member: string | null, error: unknown = null) {
  return vi.fn().mockResolvedValue({ data: member ? { user_id: member } : null, error })
}
const admin = { id: 'admin-id', role: 'admin', tournament_id: 'original' }

describe('Edge tournament membership authorization', () => {
  it.each(['original', 'second'])('authorizes an Admin with membership in %s', async tournamentId => {
    const db = client(admin.id)
    await expect(requireTournamentAdmin(admin, tournamentId, db)).resolves.toBeUndefined()
    expect(db).toHaveBeenCalledWith(admin.id, tournamentId)
  })
  it.each(['original', 'unrelated'])('rejects missing membership even for %s', async tournamentId => {
    await expect(requireTournamentAdmin(admin, tournamentId, client(null))).rejects.toThrow('not authorized')
  })
  it.each(['team', 'referee', 'court_display', 'main_display'])('rejects %s even with a membership row', async role => {
    const db = client(admin.id)
    await expect(requireTournamentAdmin({ ...admin, role }, 'second', db)).rejects.toThrow('not authorized')
    expect(db).not.toHaveBeenCalled()
  })
  it('fails closed on query errors and unexpected returned users', async () => {
    await expect(requireTournamentAdmin(admin, 'second', client(admin.id, new Error('Database unavailable')))).rejects.toThrow('Unable to verify')
    await expect(requireTournamentAdmin(admin, 'second', client('someone-else'))).rejects.toThrow('not authorized')
  })
  it('does not finish authorization until membership resolves', async () => {
    const db = client(null)
    let resolve!: (value: { data: { user_id: string }; error: null }) => void
    db.mockReturnValue(new Promise(done => { resolve = done }))
    const authorized = vi.fn()
    const pending = requireTournamentAdmin(admin, 'second', db).then(authorized)
    await Promise.resolve()
    expect(authorized).not.toHaveBeenCalled()
    resolve({ data: { user_id: admin.id }, error: null })
    await pending
    expect(authorized).toHaveBeenCalledOnce()
  })
  it.each(['', '   '])('rejects an empty tournament target', async tournamentId => {
    const db = client(admin.id)
    await expect(requireTournamentAdmin(admin, tournamentId, db)).rejects.toThrow('not authorized')
    expect(db).not.toHaveBeenCalled()
  })
})
