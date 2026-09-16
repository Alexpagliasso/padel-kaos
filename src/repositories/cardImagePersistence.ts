import type { CardDefinition } from '../shared/types/domain'
import type { CardDefinitionInput } from './contracts'

type ImageOperations = {
  upload: (cardId: string, file: File) => Promise<string>
  persist: (cardId: string, input: CardDefinitionInput) => Promise<CardDefinition>
  remove: (cardId: string, imageUrl: string) => Promise<void>
  cleanupFailed?: (cause: unknown) => void
}

export async function replacePersistedCardImage(card: CardDefinition, input: CardDefinitionInput, file: File, operations: ImageOperations) {
  const newUrl = await operations.upload(card.id, file)
  let updated: CardDefinition
  try { updated = await operations.persist(card.id, { ...input, imageUrl: newUrl }) }
  catch (cause) {
    try { await operations.remove(card.id, newUrl) } catch (cleanup) { operations.cleanupFailed?.(cleanup) }
    throw cause
  }
  if (card.imageUrl && card.imageUrl !== newUrl) {
    try { await operations.remove(card.id, card.imageUrl) } catch (cleanup) { operations.cleanupFailed?.(cleanup) }
  }
  return updated
}

export async function removePersistedCardImage(card: CardDefinition, input: CardDefinitionInput, operations: ImageOperations) {
  const updated = await operations.persist(card.id, { ...input, imageUrl: null })
  if (card.imageUrl) {
    try { await operations.remove(card.id, card.imageUrl) } catch (cleanup) { operations.cleanupFailed?.(cleanup) }
  }
  return updated
}
