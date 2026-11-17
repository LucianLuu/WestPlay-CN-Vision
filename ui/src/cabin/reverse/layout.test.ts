import { afterEach, describe, expect, it, vi } from 'vitest'
import { layoutShows, REVERSE_LAYOUTS, saveLayout, savedLayout } from './layout'

/** The page's storage as this module uses it: one string by its key. */
function storage(held: Record<string, string> = {}) {
  const kept = new Map(Object.entries(held))
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the camera’s layout', () => {
  it('keeps the player’s choice, and starts on the two drawings', () => {
    const page = storage()
    vi.stubGlobal('localStorage', page)
    expect(savedLayout()).toBe('both')
    saveLayout('roofPip')
    expect(page.getItem('westplay.reverseLayout')).toBe('roofPip')
    expect(savedLayout()).toBe('roofPip')
    // The package's own key: a layout it kept is read here, not a new one beside it.
    vi.stubGlobal('localStorage', storage({ 'westplay.reverseLayout': 'rearPip' }))
    expect(savedLayout()).toBe('rearPip')
  })

  it('takes anything else kept there as the two drawings', () => {
    for (const kept of ['sideways', 'REAR', '', 'both ']) {
      vi.stubGlobal('localStorage', storage({ 'westplay.reverseLayout': kept }))
      expect(savedLayout()).toBe('both')
    }
  })

  it('starts on the two drawings when the page has no storage to read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(savedLayout()).toBe('both')
    // The camera still changes now: storing it is what fails, silently.
    expect(() => saveLayout('rear')).not.toThrow()
  })

  it('shows what each layout draws', () => {
    expect(REVERSE_LAYOUTS).toEqual(['both', 'rear', 'roof', 'rearPip', 'roofPip'])
    // The game's own camera draws nothing: the page steps aside for its picture (shell/Shell.tsx). Not offered
    // until the engine (or the plugin) has a picture for a truck: it shows the park target's placeholder.
    expect(layoutShows('live')).toEqual({ rear: false, roof: false, main: 'rear', pip: null })
    expect(layoutShows('both')).toEqual({ rear: true, roof: true, main: 'rear', pip: null })
    expect(layoutShows('rear')).toEqual({ rear: true, roof: false, main: 'rear', pip: null })
    expect(layoutShows('roof')).toEqual({ rear: false, roof: true, main: 'roof', pip: null })
    expect(layoutShows('rearPip')).toEqual({ rear: true, roof: true, main: 'rear', pip: 'roof' })
    expect(layoutShows('roofPip')).toEqual({ rear: true, roof: true, main: 'roof', pip: 'rear' })
  })
})
