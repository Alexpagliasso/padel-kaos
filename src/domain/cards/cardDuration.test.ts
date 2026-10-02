import { describe, expect, it } from 'vitest'
import {
  formatTimedCardDuration,
  timedCardMinutesToSeconds,
  timedCardSecondsToMinutes,
} from './cardDuration'

describe('timed card duration conversion', () => {
  it('formats 300 canonical seconds as 5 minutes', () => {
    expect(formatTimedCardDuration(300)).toBe('5 minuti')
    expect(timedCardSecondsToMinutes(300)).toBe(5)
  })

  it('converts 5 Admin UI minutes to 300 persisted seconds', () => {
    expect(timedCardMinutesToSeconds(5)).toBe(300)
  })
})
