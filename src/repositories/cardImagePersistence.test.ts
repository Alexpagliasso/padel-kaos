import { describe, expect, it, vi } from 'vitest'
import type { CardDefinition } from '../shared/types/domain'
import type { CardDefinitionInput } from './contracts'
import { removePersistedCardImage, replacePersistedCardImage } from './cardImagePersistence'

const card = { id: 'card-1', imageUrl: 'https://old.test/image.jpg' } as CardDefinition
const input = { imageUrl: card.imageUrl } as CardDefinitionInput

describe('card image persistence', () => {
  it('non elimina la vecchia immagine prima di persistere quella nuova', async () => {
    const calls: string[] = []
    const operations = {
      upload: vi.fn(async () => { calls.push('upload'); return 'https://new.test/image.jpg' }),
      persist: vi.fn(async () => { calls.push('persist'); return { ...card, imageUrl: 'https://new.test/image.jpg' } }),
      remove: vi.fn(async (_id: string, url: string) => { calls.push(`remove:${url}`) }),
    }
    await replacePersistedCardImage(card, input, {} as File, operations)
    expect(calls).toEqual(['upload', 'persist', 'remove:https://old.test/image.jpg'])
  })

  it('mantiene la vecchia immagine se la persistenza del nuovo riferimento fallisce', async () => {
    const remove = vi.fn(async () => undefined)
    await expect(replacePersistedCardImage(card, input, {} as File, {
      upload: async () => 'https://new.test/image.jpg', persist: async () => { throw new Error('DB failure') }, remove,
    })).rejects.toThrow('DB failure')
    expect(remove).toHaveBeenCalledWith('card-1', 'https://new.test/image.jpg')
    expect(remove).not.toHaveBeenCalledWith('card-1', card.imageUrl)
  })

  it('azzera il riferimento prima di rimuovere il vecchio oggetto', async () => {
    const calls: string[] = []
    await removePersistedCardImage(card, input, {
      upload: vi.fn(), persist: async (_id, next) => { calls.push(`persist:${next.imageUrl}`); return { ...card, imageUrl: null } },
      remove: async () => { calls.push('remove') },
    })
    expect(calls).toEqual(['persist:null', 'remove'])
  })
})
