import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const selectedTournamentStorageKey = 'padel-kaos-selected-tournament'

const memory = new Map<string, string>()
const fallbackStorage: Storage = {
  get length() { return memory.size }, clear: () => memory.clear(),
  getItem: key => memory.get(key) ?? null, key: index => [...memory.keys()][index] ?? null,
  removeItem: key => { memory.delete(key) }, setItem: (key, value) => { memory.set(key, value) },
}
function getSelectionStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    return fallbackStorage
  }
  return fallbackStorage
}

type SelectedTournamentState = {
  selectedTournamentId: string | null
  selectTournament: (tournamentId: string | null) => void
}

export const useSelectedTournamentStore = create<SelectedTournamentState>()(
  persist(
    (set) => ({
      selectedTournamentId: null,
      selectTournament: (selectedTournamentId) => set({ selectedTournamentId }),
    }),
    {
      name: selectedTournamentStorageKey,
      storage: createJSONStorage(getSelectionStorage),
      partialize: ({ selectedTournamentId }) => ({ selectedTournamentId }),
    },
  ),
)

export function resolveSelectedTournamentId(
  selectedTournamentId: string | null,
  accessibleTournamentIds: string[],
) {
  if (selectedTournamentId && accessibleTournamentIds.includes(selectedTournamentId)) return selectedTournamentId
  return accessibleTournamentIds[0] ?? null
}
