import type { Appearance } from '../state/appearance'
import { type Wallpaper, findWallpaper, pickVariant } from '../wallpapers'

/**
 * The picture the Dashboard's photo widget shows: the wallpaper `chosen` names, in the look the screen is in,
 * and its name (the picture's alt text — nothing is written over it, owner 2026-11-03). `chosen` is one of the
 * gallery's own (`wallpapers`); an id the player no longer has falls back to the default wallpaper, as the
 * screen's own does.
 *
 * Nothing is picked (`''`): the caller passes the wallpaper on screen, so turning the widget on shows a picture
 * at once and the player picks another when they want one (Settings › Dashboard, owner 2026-11-03).
 */
export function photoView(
  chosen: string,
  wallpapers: Wallpaper[],
  appearance: Appearance,
): { src: string; name: string } {
  const wallpaper = findWallpaper(chosen, wallpapers)
  return { src: pickVariant(wallpaper, appearance).src, name: wallpaper.name }
}
