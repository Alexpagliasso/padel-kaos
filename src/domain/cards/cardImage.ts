export const CARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const CARD_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type CardImageFile = { type: string; size: number }

export function validateCardImage(file: CardImageFile) {
  if (!CARD_IMAGE_MIME_TYPES.includes(file.type as typeof CARD_IMAGE_MIME_TYPES[number])) return 'Formato non supportato. Usa JPG, PNG o WebP.'
  if (file.size > CARD_IMAGE_MAX_BYTES) return "L'immagine non può superare 5 MB."
  return ''
}

export function cardImageExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  throw new Error('Formato immagine non supportato.')
}

export function cardImageObjectPath(cardId: string, uniqueId: string, mimeType: string) {
  if (!cardId.trim() || !uniqueId.trim()) throw new Error('Carta non valida.')
  return `cards/${cardId}/${uniqueId}.${cardImageExtension(mimeType)}`
}
