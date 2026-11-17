/** What to do with the video as the player goes away from the game or comes back. */
export type WithGame = 'pause' | 'play' | null

/**
 * The video pauses while the player is away from the game (it's paused: its menu, its help; or its window
 * doesn't show: minimised) and plays on as they come back, but only if it was playing when they left:
 * one the player paused stays paused. `paused`: WestPlay paused it for this. `powered`: the truck's
 * electrics are on (off, nothing plays on: the screen is dark, as CarPlay is gone).
 */
export function withGame(
  away: boolean,
  wasAway: boolean,
  playing: boolean,
  paused: boolean,
  powered: boolean,
): WithGame {
  if (away && !wasAway && playing) return 'pause'
  if (!away && wasAway && paused && powered) return 'play'
  return null
}

/** Whether the truck's electrics just went off: the video stops (paused, and left so until the electrics come
 * back: `poweredOn`). */
export function poweredOff(wasOff: boolean, off: boolean): boolean {
  return off && !wasOff
}

/**
 * Whether the truck's electrics just came back (they were off, and aren't now): what WestPlay stopped for them
 * plays on again by itself (musicWithGame.ts, web/pauseWithPower.ts).
 *
 * Apple Music's own rule is the opposite — it stays paused, and the player presses play (owner 2026-10-21) —
 * but the owner asked for the music to come back with the electrics (2026-10-31). Bilibili is left out of it
 * (a video starting again by itself isn't wanted there: `playsOnWithPower`).
 */
export function poweredOn(wasOff: boolean, off: boolean): boolean {
  return wasOff && !off
}
