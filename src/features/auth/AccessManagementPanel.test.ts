import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDemoTournament } from '../../demo/demoSeed'
import { credentialsToCsv, getProvisioningErrorMessage } from '../../services/supabase/provisioning'
import { AccessManagementPanel } from './AccessManagementPanel'
import {
  buildCredentialsFileName,
  buildProvisionPresets,
  getExistingAccountDisplay,
  validateManualPassword,
  validateSingleAccountInput,
} from './accessManagementState'

describe('AccessManagementPanel helpers', () => {
  it('renders the access management creation and bulk controls', () => {
    const html = renderToStaticMarkup(createElement(AccessManagementPanel, { tournament: createDemoTournament() }))

    expect(html).toContain('Crea account singolo')
    expect(html).toContain('Role')
    expect(html).toContain('Nome utente')
    expect(html).toContain('Modalità password')
    expect(html).toContain('Auto generate')
    expect(html).toContain('Manual password')
    expect(html).toContain('Assignment')
    expect(html).toContain('CREA ACCOUNT TORNEO')
    expect(html).toContain('Arbitri')
    expect(html).toContain('2 campi')
    expect(html).toContain('0 arbitri configurati')
    expect(html).toContain('2 arbitri mancanti')
  })

  it('renders manual password fields when manual mode is selected', () => {
    const html = renderToStaticMarkup(createElement(AccessManagementPanel, {
      tournament: createDemoTournament(),
      initialPasswordMode: 'manual',
    }))

    expect(html).toContain('Password')
    expect(html).toContain('Conferma password')
  })

  it('builds provisioning presets for the end-to-end RLS test accounts', () => {
    const presets = buildProvisionPresets(createDemoTournament())

    expect(presets.map((preset) => preset.username)).toEqual([
      'team_red',
      'team_blue',
      'referee_test',
      'court_display_test',
      'main_display_test',
    ])
    expect(presets.find((preset) => preset.username === 'team_red')).toMatchObject({ role: 'team' })
    expect(presets.find((preset) => preset.username === 'referee_test')).toMatchObject({ role: 'referee' })
    expect(presets.find((preset) => preset.username === 'main_display_test')).toMatchObject({ role: 'main_display' })
  })

  it('maps unavailable edge function errors to a user-facing message', () => {
    expect(getProvisioningErrorMessage(new Error('FunctionsHttpError: Edge Function returned a non-2xx status code'))).toBe('Servizio di creazione credenziali non disponibile.')
    expect(getProvisioningErrorMessage(new Error('duplicate key value violates unique constraint'))).toBe('Il nome utente o il profilo esiste già.')
  })

  it('validates manual passwords before provisioning', () => {
    expect(validateManualPassword('short1')).toBe('La password deve contenere almeno 10 caratteri.')
    expect(validateManualPassword('longpassword')).toBe('La password deve contenere almeno un numero.')
    expect(validateManualPassword('1234567890')).toBe('La password deve contenere almeno una lettera.')
    expect(validateManualPassword('validpass1')).toBe('')
  })

  it('validates single account manual password confirmation', () => {
    expect(validateSingleAccountInput({
      username: 'team_red',
      assignmentId: 'team-red',
      needsAssignment: true,
      passwordMode: 'manual',
      password: 'validpass1',
      confirmPassword: 'different1',
    })).toBe('Passwords do not match.')

    expect(validateSingleAccountInput({
      username: 'team_red',
      assignmentId: 'team-red',
      needsAssignment: true,
      passwordMode: 'manual',
      password: 'validpass1',
      confirmPassword: 'validpass1',
    })).toBe('')
  })

  it('allows generated password creation without a password value', () => {
    expect(validateSingleAccountInput({
      username: 'main_display_test',
      needsAssignment: false,
      passwordMode: 'auto',
      password: '',
      confirmPassword: '',
    })).toBe('')
  })

  it('exports only session credentials in the requested team csv format', () => {
    const csv = credentialsToCsv([
      { role: 'team', teamId: 'red-id', teamName: 'Team Red', username: 'team_red', temporaryPassword: 'Temp"Pass1' },
    ])

    expect(csv.split('\n')[0]).toBe('"role","team_name","username","temporary_password"')
    expect(csv).toContain('"team","Team Red","team_red","Temp""Pass1"')
    expect(csv).not.toContain('red-id')
    expect(csv).not.toContain('@auth.padelkaos.internal')
  })

  it('uses dated team credential filenames', () => {
    expect(buildCredentialsFileName(new Date('2026-09-05T12:00:00.000Z'))).toBe('padel-kaos-team-credentials-2026-09-05.csv')
  })

  it('shows existing account passwords as not stored', () => {
    const tournament = createDemoTournament()
    const display = getExistingAccountDisplay({
      id: 'profile-red',
      role: 'team',
      username: 'team_red',
      displayName: 'team_red',
      teamId: tournament.teams[0].id,
    }, tournament)

    expect(display.title).toBe(tournament.teams[0].name)
    expect(display.username).toBe('team_red')
    expect(display.passwordLabel).toBe('Password: NON SALVATA')
    expect(JSON.stringify(display)).not.toContain('temporary')
  })
})
