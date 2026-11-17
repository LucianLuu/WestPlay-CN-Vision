import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The wallpaper on screen, and the player's own, which are the pool a rotation picks from.
const A = 'silk'
const B = 'plain'
const C = 'custom:Dusk'
const D = 'custom:Dawn'

/**
 * The store and the rotation, in a page of its own (bare, as none of it needs the real DOM). `own`: two of the
 * player's wallpapers, which are what a rotation picks from (WestPlay's own two are kept out of the pool).
 */
async function page(own = true) {
  vi.stubGlobal('window', {})
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  const { useCabin } = await import('./store')
  const { useLooks } = await import('./looks')
  const rotation = await import('./wallpaperRotation')
  useCabin.setState({ wallpaperId: A })
  if (own) {
    useLooks.setState({
      custom: {
        wallpapers: [
          { id: C, name: 'Dusk', light: 'dusk.png', dark: 'dusk.png' },
          { id: D, name: 'Dawn', light: 'dawn.png', dark: 'dawn.png' },
        ],
        iconSets: [],
      },
    })
  }
  return { useCabin, ...rotation }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('chooseWallpaper', () => {
  it('never picks the one on screen nor the one picked last', async () => {
    const { chooseWallpaper } = await page()
    expect(chooseWallpaper([A, B, C], A, B)).toBe(C)
    expect(chooseWallpaper([A, B, C], B, C)).toBe(A)
  })

  it('picks any but the one on screen when there is none other to spare', async () => {
    const { chooseWallpaper } = await page()
    expect(chooseWallpaper([A, B], A, B)).toBe(B)
    expect(chooseWallpaper([A, B], A, null)).toMatch(/^(silk|plain)$/)
  })

  it('has nothing to pick when the one on screen is the only one', async () => {
    const { chooseWallpaper } = await page()
    expect(chooseWallpaper([A], A, null)).toBeNull()
    expect(chooseWallpaper([], A, A)).toBeNull()
  })

  it('draws from the pool it is given', async () => {
    const { chooseWallpaper } = await page()
    // 0 -> the first of the pool, 0.99 -> the last.
    expect(chooseWallpaper([A, B, C], A, null, () => 0)).toBe(B)
    expect(chooseWallpaper([A, B, C], A, null, () => 0.99)).toBe(C)
  })
})

describe('rotateWallpaper', () => {
  it('changes the wallpaper, away from the one on screen', async () => {
    const { useCabin, rotateWallpaper } = await page()
    useCabin.setState({ rotateWallpaper: true })
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    rotateWallpaper(true)
    expect(useCabin.getState().wallpaperId).not.toBe(A)
  })

  it('never rotates to WestPlay’s own two: the player’s alone are the pool', async () => {
    const { useCabin, rotateWallpaper } = await page(false)
    useCabin.setState({ rotateWallpaper: true })
    rotateWallpaper(true)
    expect(useCabin.getState().wallpaperId).toBe(A)
  })

  it('does nothing with the rotation off (the default)', async () => {
    const { useCabin, rotateWallpaper } = await page()
    rotateWallpaper(true)
    expect(useCabin.getState().wallpaperId).toBe(A)
  })

  it('two power-ups within the gap are one: the second does nothing', async () => {
    const { useCabin, rotateWallpaper, MIN_GAP_MS } = await page()
    useCabin.setState({ rotateWallpaper: true })
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    rotateWallpaper(true, 10_000)
    const first = useCabin.getState().wallpaperId
    rotateWallpaper(false, 10_000 + MIN_GAP_MS - 1)
    expect(useCabin.getState().wallpaperId).toBe(first)
    rotateWallpaper(false, 10_000 + MIN_GAP_MS)
    expect(useCabin.getState().wallpaperId).not.toBe(first)
  })

  it('never picks the one it picked last, even when the screen moved on since', async () => {
    const { useCabin, rotateWallpaper } = await page()
    useCabin.setState({ rotateWallpaper: true })
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    rotateWallpaper(true, 1_000)
    const first = useCabin.getState().wallpaperId
    // The player picks another in Settings, then a power-up comes.
    useCabin.setState({ wallpaperId: A })
    rotateWallpaper(false, 5_000)
    expect(useCabin.getState().wallpaperId).not.toBe(first)
  })
})
