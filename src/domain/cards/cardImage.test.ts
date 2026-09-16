import { describe, expect, it } from 'vitest'
import { CARD_IMAGE_MAX_BYTES, cardImageObjectPath, validateCardImage } from './cardImage'

describe('card images', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accetta %s', (type) => {
    expect(validateCardImage({ type, size: 1024 })).toBe('')
  })
  it('rifiuta MIME non supportati', () => {
    expect(validateCardImage({ type: 'image/gif', size: 1024 })).toContain('Formato non supportato')
  })
  it('rifiuta file oltre 5 MB', () => {
    expect(validateCardImage({ type: 'image/png', size: CARD_IMAGE_MAX_BYTES + 1 })).toContain('5 MB')
  })
  it('isola il percorso per carta e usa solo identificatori controllati', () => {
    expect(cardImageObjectPath('card-a', 'unique-id', 'image/webp')).toBe('cards/card-a/unique-id.webp')
    expect(cardImageObjectPath('card-b', 'unique-id', 'image/webp')).not.toContain('card-a')
  })
})
