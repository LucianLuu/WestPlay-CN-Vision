import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The store, in a page of its own (bare, as none of it needs the real DOM). */
async function page() {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  const { useCabin } = await import('./store')
  return { useCabin }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('the wallpapers by appearance', () => {
  it('are off to begin with, both the wallpaper on screen', async () => {
    const { useCabin } = await page()
    const state = useCabin.getState()
    expect(state.wallpapersByAppearance).toBe(false)
    expect(state.wallpaperLight).toBe(state.wallpaperId)
    expect(state.wallpaperDark).toBe(state.wallpaperId)
  })

  it('start as the wallpaper on screen the first time they are switched on', async () => {
    const { useCabin } = await page()
    useCabin.setState({ wallpaperId: 'custom:Dusk' })
    useCabin.getState().setWallpapersByAppearance(true)
    expect(useCabin.getState().wallpaperLight).toBe('custom:Dusk')
    expect(useCabin.getState().wallpaperDark).toBe('custom:Dusk')
  })

  it('keep a pair already chosen when they are switched on again', async () => {
    const { useCabin } = await page()
    const state = useCabin.getState()
    state.setWallpapersByAppearance(true)
    state.setWallpaperFor('light', 'custom:Day')
    state.setWallpaperFor('dark', 'custom:Night')
    state.setWallpapersByAppearance(false)
    useCabin.getState().setWallpapersByAppearance(true)
    expect(useCabin.getState().wallpaperLight).toBe('custom:Day')
    expect(useCabin.getState().wallpaperDark).toBe('custom:Night')
  })

  it('and the rotation take each other’s place', async () => {
    const { useCabin } = await page()
    useCabin.getState().setRotateWallpaper(true)
    expect(useCabin.getState().wallpapersByAppearance).toBe(false)
    useCabin.getState().setWallpapersByAppearance(true)
    expect(useCabin.getState().rotateWallpaper).toBe(false)
    useCabin.getState().setRotateWallpaper(true)
    expect(useCabin.getState().wallpapersByAppearance).toBe(false)
  })
})
