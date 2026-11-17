import { afterEach, describe, expect, it, vi } from 'vitest'

/** A browser's storage holding what an earlier WestPlay saved (and the page around it, outside WestPlay). */
function savedStorage(state: unknown, version = 1) {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search: '' })
  const items = new Map([['westplay.cabin', JSON.stringify({ state, version })]])
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('the saved Settings choices', () => {
  it('come back as they were', async () => {
    vi.stubGlobal(
      'localStorage',
      savedStorage({
        dashboardWidgets: { nowPlaying: false, destination: true, weather: false, photo: true, vehicle: true },
        dashboardPhoto: 'plain',
        albumArt: false,
        hours24: false,
      }),
    )
    const { useCabin } = await import('./store')
    expect(useCabin.getState().dashboardWidgets).toEqual({
      nowPlaying: false,
      destination: true,
      weather: false,
      photo: true,
      vehicle: true,
    })
    expect(useCabin.getState().dashboardPhoto).toBe('plain')
    expect(useCabin.getState().hours24).toBe(false)
    expect(useCabin.getState().albumArt).toBe(false)
  })

  it('keep a widget shown unless it was turned off, and ignore what isn’t a choice', async () => {
    vi.stubGlobal(
      'localStorage',
      savedStorage({ dashboardWidgets: { weather: false, nowPlaying: 'no' }, albumArt: 'off' }),
    )
    const { useCabin } = await import('./store')
    expect(useCabin.getState().dashboardWidgets).toEqual({
      nowPlaying: true,
      destination: true,
      weather: false,
      photo: false,
      vehicle: false,
    })
    expect(useCabin.getState().albumArt).toBe(true)
  })

  it('take each widget’s own default when nothing was saved (an earlier WestPlay)', async () => {
    vi.stubGlobal('localStorage', savedStorage({ appearanceMode: 'dark' }))
    const { useCabin } = await import('./store')
    // The three the Dashboard had, on; the picture and the truck's status are the player's to turn on.
    expect(useCabin.getState().dashboardWidgets).toEqual({
      nowPlaying: true,
      destination: true,
      weather: true,
      photo: false,
      vehicle: false,
    })
    expect(useCabin.getState().dashboardPhoto).toBe('')
    expect(useCabin.getState().albumArt).toBe(true)
    expect(useCabin.getState().hours24).toBe(true)
    expect(useCabin.getState().appearanceMode).toBe('dark')
  })
})

describe('the saved Text Size', () => {
  it('stays the size it was when smaller steps are added below it', async () => {
    // 1.7, the sixth step of seven before 0.8 and 0.9 were added.
    vi.stubGlobal('localStorage', savedStorage({ textSize: 5 }, 2))
    const { useCabin } = await import('./store')
    const { textScale } = await import('./textSize')
    expect(textScale(useCabin.getState().textSize)).toBe(1.7)
  })

  it('starts on the default when it was kept from before the steps moved larger', async () => {
    vi.stubGlobal('localStorage', savedStorage({ textSize: 5 }, 1))
    const { useCabin } = await import('./store')
    const { DEFAULT_TEXT_SIZE } = await import('./textSize')
    expect(useCabin.getState().textSize).toBe(DEFAULT_TEXT_SIZE)
  })
})

describe('the game’s mirror on the dashboard', () => {
  it('is on until the player turns it off', async () => {
    vi.stubGlobal('localStorage', savedStorage({}))
    const { useCabin } = await import('./store')
    expect(useCabin.getState().mirrorOn).toBe(true)
    useCabin.getState().setMirrorOn(false)
    expect(useCabin.getState().mirrorOn).toBe(false)
  })

  it('comes back off as it was left', async () => {
    vi.stubGlobal('localStorage', savedStorage({ mirrorOn: false }))
    const { useCabin } = await import('./store')
    expect(useCabin.getState().mirrorOn).toBe(false)
  })
})
