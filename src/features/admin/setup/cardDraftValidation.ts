import type { CardDefinitionInput } from '../../../repositories/contracts'

export function validateCardDraft(input: CardDefinitionInput) {
  if (!input.name.trim() || !input.slug.trim() || !input.description.trim() || !input.longDescription.trim()) return 'Nome, descrizione breve e descrizione lunga sono obbligatori.'
  if (input.durationType === 'timed' && (!input.durationValue || input.durationValue <= 0)) return 'La durata in minuti deve essere maggiore di zero.'
  if (input.durationType === 'games' && (!input.durationValue || input.durationValue <= 0 || !Number.isInteger(input.durationValue))) return 'Il numero di game deve essere un intero positivo.'
  return ''
}
