import { useEffect, useState } from 'react'
import { isInHost, logToHost } from '../../shared/host'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../state/screen'
import { useCabin, useLive } from '../state/store'
import { useMirrorHole } from './mirrorHole'
import {
  MIRROR_OFF,
  type MirrorSide,
  type MirrorState,
  blinkerSide,
  holeInside,
  mirrorBox,
  mirrorDrawn,
  mirrorTick,
} from './mirror'
import { useAnyWidget } from './widgetState'

/** The rim round the mirror, and the mirror's corners, in the page's own pixels. The page's hole is the frame
 * less the rim: the rim is outside it, so it draws over the page while the game's mirror shows through. */
const RIM = 2
const RADIUS = 18
/** How often the mirror's clock moves it on while it waits for its blinker, or stays after it, ms. */
const TICK_MS = 40

/** The page's own strip inset at its left (`--oem-left`, px): CarPlay starts right of the truck's own screen there,
 * and the page's mask is cut to the CarPlay area (`Shell.tsx`), so the mirror's place is `--oem-left` less. */
function insetLeft(): number {
  const style = getComputedStyle(document.documentElement)
  return parseFloat(style.getPropertyValue('--oem-left')) || 0
}

/** The layouts the mod draws WestPlay's own script on, where the game's mirror lies under the page. The tablet is a
 * model showing the texture itself, with no script to hold a mirror: the page stays whole there. */
function hasMirror(layout: string | null): boolean {
  return layout !== 'tablet'
}

/** The game's mirror the dashboard shows now, following the game's left and right blinkers (`mirror.ts`). */
function useMirrorSide(): MirrorSide | null {
  const left = useLive((state) => state.telemetry?.leftBlinker ?? false)
  const right = useLive((state) => state.telemetry?.rightBlinker ?? false)
  const side = blinkerSide(left, right)
  const [state, setState] = useState<MirrorState>(MIRROR_OFF)
  // A blinker changing moves the mirror at once: on to its wait, off to its stay.
  useEffect(() => {
    setState((before) => mirrorTick(before, side, performance.now()))
  }, [side])
  // While the mirror waits to come on or stays after its blinker, the clock moves it on.
  useEffect(() => {
    if (state.phase !== 'waiting' && state.phase !== 'staying') return
    const timer = setInterval(() => setState((before) => mirrorTick(before, side, performance.now())), TICK_MS)
    return () => clearInterval(timer)
  }, [state.phase, side])
  return mirrorDrawn(state)
}

/**
 * The dashboard's slot for the game's own mirror: the top of the widget column, which nothing of the dashboard's
 * draws in. When a blinker is on, the page is cut open over that side's half of the slot (`mirrorHole.ts`, the
 * shell's mask) and a frame round it is drawn, its rim outside the hole; the game's real mirror, drawn by the mod
 * under the page, shows through (crates/setup/src/game_mod.rs `MIRROR_SLOT`).
 *
 * Its place is in the page's **own pixels** (1280 x 720, `state/screen.ts`): the numbers the mod's element is
 * written with. Drawn over the CarPlay area but outside its content (`Shell.tsx`), it isn't touched by the page's
 * zoom (`--ui-scale`, 0.78 on some trucks) — measuring it there is what put the holes 78% of their size, over a
 * corner of each mirror (owner 2026-11-03: "这是什么问题"). The mask is cut to the CarPlay area, whose left edge is
 * the page's own less `--oem-left` (the truck's own strip), hence the inset.
 *
 * It shows only where the widget column does: with no widget at all the page has no column, and the mirror has no
 * slot to be in; and only while the player keeps it on (Settings › Display & Performance › Virtual Mirrors, on by
 * default).
 */
export function MirrorWidget() {
  const anyWidget = useAnyWidget()
  const mirrorOn = useCabin((state) => state.mirrorOn)
  const layout = useLive((state) => state.screenLayout)
  const side = useMirrorSide()
  const shown = anyWidget && mirrorOn && hasMirror(layout) && isInHost() ? side : null
  // The slot in the page's own pixels, less the strip inset: the frame's box and the hole's, one set of numbers.
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (shown === null) {
      setBox(null)
      useMirrorHole.setState({ hole: null })
      return
    }
    const place = () => {
      const slot = mirrorBox(shown, insetLeft())
      const hole = holeInside(slot, RIM, RADIUS)
      setBox(slot)
      useMirrorHole.setState({ hole })
      // One line in the app's log each time a mirror comes on: where the page put it, in the page's own pixels,
      // the same units as the mod's element — so "no mirror" and "a mirror in the wrong place" can be told apart.
      logToHost(
        `mirror: ${shown} slot ${Math.round(slot.left)},${Math.round(slot.top)} ${Math.round(slot.width)}x${Math.round(slot.height)}` +
          ` hole ${Math.round(hole.x)},${Math.round(hole.y)} ${Math.round(hole.width)}x${Math.round(hole.height)}` +
          ` of ${SCREEN_WIDTH}x${SCREEN_HEIGHT}`,
      )
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [shown])

  // The page is whole again as the dashboard goes (another screen, or the truck's own).
  useEffect(() => () => useMirrorHole.setState({ hole: null }), [])

  if (box === null) return null
  return (
    <div className="mirror-slot" aria-hidden style={box}>
      <div className="mirror-frame" />
    </div>
  )
}
