import { create } from 'zustand'

/** Where the page is cut open for the game's mirror, in pixels from the CarPlay area's corner (as the shell's
 * mask takes its holes) and round a rectangle. */
export interface MirrorHole {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

/** The hole the dashboard's mirror asks for while it shows (`MirrorWidget`), or none. */
export const useMirrorHole = create<{ hole: MirrorHole | null }>()(() => ({ hole: null }))
