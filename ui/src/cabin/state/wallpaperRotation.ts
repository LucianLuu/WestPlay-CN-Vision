import { useEffect } from 'react'
import { useLooks } from './looks'
import { useCabin, useLive } from './store'

/**
 * Wallpaper rotation (Settings › Wallpaper, off by default): a different wallpaper every time the truck is
 * powered up, and when WestPlay starts. The screen comes up on it, the boot splash over the switch.
 *
 * A pick is never the wallpaper on screen, nor the one picked last: a power-up has to look like a change. The
 * player's own wallpapers join the pool as the companion gives them (looks.ts).
 */

/** Two power-ups can come close together (the key off and straight back on): only ones this far apart are
 * two, so a short one still rotates. */
export const MIN_GAP_MS = 400

/** The wallpaper the last rotation picked (`null`: none yet this run). */
let picked: string | null = null
/** When it picked (`0`: not yet this run). */
let pickedAt = 0
/** The page has had its first settings (the start's own power-up rotated then; the host echoes later ones). */
let settled = false

/**
 * Every wallpaper a rotation may show: the player's own. WestPlay's two are kept out (owner 2026-11-01: they are
 * the light and the dark wallpaper of Settings › Wallpaper), so a player with none of their own has nothing for a
 * rotation to pick and the wallpaper stays as it is.
 */
function pool(): string[] {
  return useLooks.getState().custom.wallpapers.map((wallpaper) => wallpaper.id)
}

/**
 * One of `ids` that is neither the wallpaper on screen nor the one picked last (`last`), if there is one;
 * with none, any but the one on screen; `null` with no other at all.
 */
export function chooseWallpaper(
  ids: string[],
  current: string,
  last: string | null,
  random: () => number = Math.random,
): string | null {
  const avoid = last && last !== current ? [current, last] : [current]
  const spare = ids.filter((id) => !avoid.includes(id))
  const from = spare.length > 0 ? spare : ids.filter((id) => id !== current)
  if (from.length === 0) return null
  return from[Math.floor(random() * from.length)] ?? null
}

/**
 * A new wallpaper for a rotation, if rotation is on: `start` for the page's own (its first settings), else a
 * power-up. A power-up within `MIN_GAP_MS` of the last pick is the same one (a burst of messages), and does
 * nothing.
 */
export function rotateWallpaper(start: boolean, now = Date.now()): void {
  const { rotateWallpaper: on, wallpaperId, setWallpaper } = useCabin.getState()
  if (!on) return
  if (!start && now - pickedAt < MIN_GAP_MS) return
  const next = chooseWallpaper(pool(), wallpaperId, picked)
  if (!next || next === wallpaperId) return
  picked = next
  pickedAt = now
  // Kept with WestPlay's settings, as choosing one in Settings does (the companion's Customize sees it).
  setWallpaper(next)
}

/**
 * The page's first settings (`store.ts`): the start's own power-up. Later settings messages are the host
 * echoing the player's choices and a power-up's own (it re-sends them), which must not rotate again.
 */
export function settingsShown(): void {
  if (settled) return
  settled = true
  rotateWallpaper(true)
}

/**
 * Follows the truck's electrics: every off -> on is a power-up, and rotates the wallpaper. The page's first
 * telemetry isn't one (the start's own rotation already happened with the settings). Returns the function
 * that stops it.
 */
export function followWallpaperRotation(): () => void {
  let first = true
  return useLive.subscribe((state, previous) => {
    const on = state.telemetry?.electricEnabled ?? false
    const was = previous.telemetry?.electricEnabled ?? false
    if (first) {
      first = false
      return
    }
    if (!was && on) rotateWallpaper(false)
  })
}

/** For tests: the next rotation starts as the page's first, with nothing picked yet. */
export function forgetRotations(): void {
  picked = null
  pickedAt = 0
  settled = false
}

/** Keeps the wallpaper rotating as the truck is powered up, from now on. Returns the function that stops it. */
export function useWallpaperRotation(): void {
  useEffect(() => followWallpaperRotation(), [])
}
