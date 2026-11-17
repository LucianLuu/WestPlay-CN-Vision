import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../state/screen'

/**
 * The game's own mirror on the dashboard, fed by WestPlay's mod: the page leaves a hole where the mirror goes,
 * and the game draws its real mirror there, under the page (crates/setup/src/game_mod.rs `MIRROR_SLOT`, which
 * holds the same numbers as this file: the two are one agreement and change together).
 *
 * A truck's blinker shows its side's mirror: on ~150 ms after the blinker comes on (its first flash is short),
 * staying ~2 s after it goes off. Hazards, or nothing, show none.
 */

/** The side whose blinker is on, i.e. whose mirror the dashboard shows. */
export type MirrorSide = 'left' | 'right'

/** How long after a blinker comes on its mirror shows, and how long it stays after it goes off, ms. */
export const HOP_MS = 150
export const STAY_MS = 2000

/**
 * The mirror slot on the page: fractions of the page (1280 x 720) from its left edge and its top. It is the top
 * of the dashboard's widget column, right of the map card, the slot the page keeps empty for it. The mod draws
 * the near (left) mirror in its left half and the far (right) one in its right half: a UI script draws what it
 * is written with and can't change a material as the blinker changes, so each side has an element of its own,
 * and the page cuts its hole over the lit side's half.
 */
/** The left (near) mirror's own place on the page, fractions of it: over the map's top-left corner. */
export const NEAR_SLOT = { left: 0.1557, right: 0.4405, top: 0.0444, bottom: 0.3778 } as const

/** The right (far) mirror's own place: the top of the widget column. */
export const FAR_SLOT = { left: 0.6902, right: 0.9750, top: 0.0444, bottom: 0.3778 } as const

/** The slot's rectangle for `side`, as fractions of the page: the near mirror on the left, the far one on the right. */
export function mirrorRect(side: MirrorSide): { left: number; top: number; width: number; height: number } {
  const slot = side === 'left' ? NEAR_SLOT : FAR_SLOT
  return { left: slot.left, top: slot.top, width: slot.right - slot.left, height: slot.bottom - slot.top }
}

/**
 * The slot's box in the page's **own pixels** (0..1280 by 0..720, `state/screen.ts`): the units the mod's element is
 * written in (`crates/setup/src/game_mod.rs`, the same fractions), and the units the shell's mask takes. `insetLeft`
 * is the page's own strip inset (`--oem-left`): CarPlay, and the mask, start right of it.
 */
export function mirrorBox(
  side: MirrorSide,
  insetLeft = 0,
): { left: number; top: number; width: number; height: number } {
  const { left, top, width, height } = mirrorRect(side)
  return {
    left: left * SCREEN_WIDTH - insetLeft,
    top: top * SCREEN_HEIGHT,
    width: width * SCREEN_WIDTH,
    height: height * SCREEN_HEIGHT,
  }
}

/**
 * The hole the page cuts for a mirror whose box is `box` (page pixels): `box` less the frame's `rim`, which draws
 * over the page's edge, its corners rounded inside the frame's `radius`. All in the page's own pixels too.
 */
export function holeInside(
  box: { left: number; top: number; width: number; height: number },
  rim: number,
  radius: number,
): { x: number; y: number; width: number; height: number; radius: number } {
  return {
    x: box.left + rim,
    y: box.top + rim,
    width: Math.max(0, box.width - 2 * rim),
    height: Math.max(0, box.height - 2 * rim),
    radius: Math.max(0, radius - rim),
  }
}

/** The side whose blinker is on: none when both are (hazards) or neither is. */
export function blinkerSide(left: boolean, right: boolean): MirrorSide | null {
  if (left === right) return null
  return left ? 'left' : 'right'
}

/** What the dashboard's mirror is doing, as {@link mirrorTick} moves it. */
export interface MirrorState {
  /** The side whose blinker is on (`null`: none, or both). */
  side: MirrorSide | null
  /** When that blinker came on, or (once it goes off) when the mirror began staying. */
  since: number
  phase: 'off' | 'waiting' | 'shown' | 'staying'
}

/** No mirror, and nothing waiting to show. */
export const MIRROR_OFF: MirrorState = { side: null, since: 0, phase: 'off' }

/**
 * `state` advanced to `now`, its blinker on `side` (as {@link blinkerSide} says). A side coming on waits
 * {@link HOP_MS} before its mirror shows: the first flash of a blinker is short, and a tap of the stalk
 * shouldn't flash the mirror. A side going off leaves its mirror {@link STAY_MS} more, so the mirror is there
 * through the turn, not only while the lamp blinks.
 */
export function mirrorTick(state: MirrorState, side: MirrorSide | null, now: number): MirrorState {
  if (side !== null) {
    if (side !== state.side) return { side, since: now, phase: 'waiting' }
    if (state.phase === 'waiting') {
      return now - state.since >= HOP_MS ? { side, since: state.since, phase: 'shown' } : state
    }
    // Back on (or still on) while it shows: it keeps showing, its clock unbroken.
    return { side, since: state.since, phase: 'shown' }
  }
  // The blinker went off: one that never showed has nothing to stay for.
  if (state.phase === 'off' || state.phase === 'waiting') return MIRROR_OFF
  if (state.phase === 'shown') return { side: state.side, since: now, phase: 'staying' }
  return now - state.since >= STAY_MS ? MIRROR_OFF : state
}

/** The side of the game's mirror to show: `null` while none is. */
export function mirrorDrawn(state: MirrorState): MirrorSide | null {
  return state.phase === 'shown' || state.phase === 'staying' ? state.side : null
}
