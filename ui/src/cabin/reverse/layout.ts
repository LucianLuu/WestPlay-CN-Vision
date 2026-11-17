import { create } from 'zustand'

import type { ReverseView } from './reverse'

/**
 * The reversing camera's layout (owner 2026-11-03, from the increment package): the driver picks what the camera
 * shows instead of the screen deciding by the trailer alone. Two views together, one of them alone, or one big
 * with the other floating in a corner — the top view is what a hitched trailer needs, the road behind what the
 * bumper needs, and a driver in a tight yard wants one of them large.
 *
 * `live` was to be the game's own picture (owner 2026-11-04: 「挂r档时触发，开启时画面占据整个屏幕」), but the engine
 * draws no parking camera for a truck: the mod's element shows the target's own placeholder texture ("1x1 PARK"),
 * and the game's parking-camera key only switches the mirrors off (owner 2026-11-04, the second test). So it is not
 * offered; the code is kept for a picture the plugin renders itself later.
 *
 * The player's choice is kept in the page's own storage (the package's key, so a choice made there still
 * counts), as a preference of this screen rather than of the game: it is not part of the cabin's stored settings.
 */
export type ReverseLayout = 'live' | 'both' | 'rear' | 'roof' | 'rearPip' | 'roofPip'

/** The layouts the menu offers, in its order: the two views together (the default), each one alone, then each with
 * the other floating in the corner. `live` is not offered until the engine (or the plugin) has a picture for it. */
export const REVERSE_LAYOUTS: readonly ReverseLayout[] = ['both', 'rear', 'roof', 'rearPip', 'roofPip']

/** Where the choice is kept. The package's own key: an owner who set a layout there finds it again here. */
const KEY = 'westplay.reverseLayout'

/** What the camera starts on: both drawings, the way the camera worked before the layouts. */
const DEFAULT: ReverseLayout = 'both'

function isLayout(value: string | null): value is ReverseLayout {
  return value !== null && (REVERSE_LAYOUTS as readonly string[]).includes(value)
}

/**
 * The layout kept from the last time the camera was used; `both` without one, and for anything else found there
 * (another build's word for it, a hand-edited value): an unknown layout must not leave the camera blank.
 */
export function savedLayout(): ReverseLayout {
  try {
    const kept = localStorage.getItem(KEY)
    return isLayout(kept) ? kept : DEFAULT
  } catch {
    // A page whose storage is refused (a locked-down profile): the default, and the choice lasts the page.
    return DEFAULT
  }
}

/** Keeps `layout` for the next time WestPlay starts. */
export function saveLayout(layout: ReverseLayout): void {
  try {
    localStorage.setItem(KEY, layout)
  } catch {
    // As above: the camera still changes now, it just won't remember.
  }
}

/**
 * The layout and a setter that keeps it, in a store rather than in one component's state: the camera draws it
 * (`ReverseCamera.tsx`), the bar changes it (`ReverseBar.tsx`), and the page steps aside for the game's picture
 * in `live` (`shell/Shell.tsx`) — three readers, one choice, whichever of them is mounted.
 */
export const useReverseLayout = create<{ layout: ReverseLayout; choose: (layout: ReverseLayout) => void }>(
  (set) => ({
    layout: savedLayout(),
    choose: (layout) => {
      saveLayout(layout)
      set({ layout })
    },
  }),
)

/** What a layout draws: which views show, which one fills the screen, and which one floats. */
export interface LayoutViews {
  /** The road behind. */
  rear: boolean
  /** The rig from above. */
  roof: boolean
  /** The view that fills the screen; in `both` the rear one, as the left half (the two are equal there). */
  main: ReverseView
  /** The view in the floating window; `null` when the layout shows no second view. */
  pip: ReverseView | null
}

/** Which views a layout draws, and how. */
export function layoutShows(layout: ReverseLayout): LayoutViews {
  switch (layout) {
    case 'live':
      // The game's own camera: nothing drawn, and the screen stepped aside for its picture.
      return { rear: false, roof: false, main: 'rear', pip: null }
    case 'rear':
      return { rear: true, roof: false, main: 'rear', pip: null }
    case 'roof':
      return { rear: false, roof: true, main: 'roof', pip: null }
    case 'rearPip':
      return { rear: true, roof: true, main: 'rear', pip: 'roof' }
    case 'roofPip':
      return { rear: true, roof: true, main: 'roof', pip: 'rear' }
    case 'both':
      return { rear: true, roof: true, main: 'rear', pip: null }
  }
}
