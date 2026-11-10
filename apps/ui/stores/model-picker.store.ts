import { create } from 'zustand'

// Lets something outside the composer, a notice saying the plan is out, open a model picker. Keyed
// by conversation tab rather than by agent: several tabs of the same agent stay mounted, and two
// pickers opening at once close each other on focus.
type ModelPickerState = {
    openFor: string | null
    request: (pickerKey: string) => void
    consume: () => void
}

export const useModelPickerStore = create<ModelPickerState>(set => ({
    openFor: null,
    request: pickerKey => set({ openFor: pickerKey }),
    consume: () => set({ openFor: null }),
}))
