import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Tournament } from '../types/domain'
import { DICE_REVEAL_MS, diceCubeRotation, diceFaces, diceShowPhase } from '../../domain/live/diceShow'
import { DICE_CONTINUE_MS, DICE_DISMISSED_EVENT, dismissDiceReveal, openDiceReveal, type DiceAudience } from '../../domain/live/dicePresentation'
import { dataProvider } from '../../repositories'
import { requireSupabase } from '../../services/supabase/client'
import { supabaseTournamentKeys } from '../../repositories/supabase/queryKeys'
import './globalDiceReveal.css'

export function GlobalDiceReveal({ tournament, audience }: { tournament: Tournament; audience: DiceAudience }) {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const reveal = openDiceReveal(tournament, audience, now)
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  )

  useEffect(() => {
    if (dataProvider !== 'supabase' || !tournament.id || tournament.id === 'demo-tournament' || tournament.id === 'empty-tournament') return
    const client = requireSupabase()
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: supabaseTournamentKeys.detail(tournament.id) }) }
    const channel = client.channel(`dice-show:${tournament.id}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `tournament_id=eq.${tournament.id}` }, refresh)
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [queryClient, tournament.id])

  useEffect(() => {
    if (!reveal) return
    const update = () => setNow(Date.now())
    update()
    const timer = window.setInterval(update, 40)
    window.addEventListener(DICE_DISMISSED_EVENT, update)
    return () => { window.clearInterval(timer); window.removeEventListener(DICE_DISMISSED_EVENT, update) }
  }, [reveal?.key])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  if (!reveal) return null
  const elapsed = reveal.elapsed
  const phase = diceShowPhase(reveal.rolledAt, Math.min(now, reveal.rolledAt + DICE_REVEAL_MS - 1))
  const rotation = diceCubeRotation(reveal.face, elapsed, reducedMotion)
  const showResult = reducedMotion || elapsed >= 5300
  const showArtwork = reducedMotion || elapsed >= DICE_CONTINUE_MS

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Risultato dado globale" className={`dice-show dice-show--${phase.toLowerCase()}${reducedMotion ? ' dice-show--reduced' : ''}`}>
      <div className="dice-show__glow" aria-hidden="true" />
      <div className="dice-show__content">
        <p className="dice-show__eyebrow">PADEL KAOS · DADO GLOBALE</p>
        <p className="dice-show__intro">{elapsed < 1200 && !reducedMotion ? 'IL DADO È STATO LANCIATO' : 'IL RISULTATO È DECISO'}</p>
        <div className="dice-show__stage">
          <div className="dice-show__perspective" aria-label={`Dado: ${showResult ? reveal.face.title : 'in movimento'}`}>
            <div className="dice-show__cube" style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)` }}>
              {diceFaces.map(face => <div key={face.value} className={`dice-show__face dice-show__face--${face.value}`}>
                <span className="dice-show__face-number">{String(face.value).padStart(2, '0')}</span>
                <strong>{face.title}</strong>
              </div>)}
            </div>
          </div>
          {showResult && <div className="dice-show__outcome" aria-live="polite">
            <p>RISULTATO DEL DADO</p>
            <h1>{reveal.face.title}</h1>
          </div>}
        </div>
        {showArtwork && <div className="dice-show__rule">
          <img src={reveal.face.artwork} alt={`Illustrazione ${reveal.face.title}`} />
          <div><p className="dice-show__rule-kicker">REGOLA GLOBALE · 5 MINUTI</p><h2>{reveal.face.title}</h2><p>{reveal.face.shortDescription}</p></div>
        </div>}
        {audience !== 'court_display' && audience !== 'main_display' && elapsed >= DICE_CONTINUE_MS && <button type="button" className="dice-show__continue" onClick={() => dismissDiceReveal(reveal.key)}>CONTINUA</button>}
        <div className="dice-show__progress" aria-hidden="true"><span style={{ transform: `scaleX(${Math.min(1, Math.max(0, elapsed / DICE_REVEAL_MS))})` }} /></div>
      </div>
    </div>, document.body,
  )
}
