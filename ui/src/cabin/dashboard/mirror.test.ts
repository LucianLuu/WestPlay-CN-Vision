import { describe, expect, it } from 'vitest'
import {
  HOP_MS,
  MIRROR_OFF,
    FAR_SLOT,
    NEAR_SLOT,
  STAY_MS,
  blinkerSide,
  holeInside,
  mirrorBox,
  mirrorDrawn,
  mirrorRect,
  mirrorTick,
} from './mirror'

describe('blinkerSide', () => {
  it('is the side whose blinker is on', () => {
    expect(blinkerSide(true, false)).toBe('left')
    expect(blinkerSide(false, true)).toBe('right')
  })

  it('is none with both on (hazards) or neither', () => {
    expect(blinkerSide(true, true)).toBe(null)
    expect(blinkerSide(false, false)).toBe(null)
  })
})

describe('mirrorTick', () => {
  it('waits a blink before showing the side whose blinker came on', () => {
    const waiting = mirrorTick(MIRROR_OFF, 'left', 1000)
    expect(mirrorDrawn(waiting)).toBe(null)
    expect(mirrorDrawn(mirrorTick(waiting, 'left', 1000 + HOP_MS - 1))).toBe(null)
    expect(mirrorDrawn(mirrorTick(waiting, 'left', 1000 + HOP_MS))).toBe('left')
  })

  it('stays after the blinker goes off, then goes', () => {
    const shown = mirrorTick(mirrorTick(MIRROR_OFF, 'right', 500), 'right', 500 + HOP_MS)
    expect(mirrorDrawn(shown)).toBe('right')
    const off = mirrorTick(shown, null, 2000)
    expect(off.phase).toBe('staying')
    expect(mirrorDrawn(mirrorTick(off, null, 2000 + STAY_MS - 1))).toBe('right')
    expect(mirrorDrawn(mirrorTick(off, null, 2000 + STAY_MS))).toBe(null)
  })

  it('does not show for a tap too short to be a turn', () => {
    // On and off inside the hop: it never showed, so there's nothing to stay for.
    const waiting = mirrorTick(MIRROR_OFF, 'left', 0)
    const off = mirrorTick(waiting, null, HOP_MS - 1)
    expect(off.phase).toBe('off')
    expect(mirrorDrawn(off)).toBe(null)
  })

  it('shows the new side at once when the other blinker is cancelled and the new one comes on', () => {
    const left = mirrorTick(mirrorTick(MIRROR_OFF, 'left', 0), 'left', HOP_MS)
    expect(mirrorDrawn(left)).toBe('left')
    const right = mirrorTick(left, 'right', 1000)
    expect(mirrorDrawn(right)).toBe(null)
    expect(mirrorDrawn(mirrorTick(right, 'right', 1000 + HOP_MS))).toBe('right')
  })

  it('shows nothing with hazards, and stays only after a mirror had shown', () => {
    const left = mirrorTick(mirrorTick(MIRROR_OFF, 'left', 0), 'left', HOP_MS)
    // Both on: like none, the mirror stays its time and goes.
    const hazards = mirrorTick(left, null, 1000)
    expect(mirrorDrawn(hazards)).toBe('left')
    expect(mirrorDrawn(mirrorTick(hazards, null, 1000 + STAY_MS))).toBe(null)
    // From nothing, hazards show nothing at all.
    expect(mirrorDrawn(mirrorTick(MIRROR_OFF, null, 1000))).toBe(null)
  })

  it('keeps the same mirror when the same blinker comes back on while it stays', () => {
    const shown = mirrorTick(mirrorTick(MIRROR_OFF, 'left', 0), 'left', HOP_MS)
    const staying = mirrorTick(shown, null, 500)
    const again = mirrorTick(staying, 'left', 600)
    expect(again.phase).toBe('shown')
    expect(mirrorDrawn(again)).toBe('left')
  })
})

describe('mirrorRect', () => {
    it('gives each mirror its own place on the page, each a mirror\u2019s shape', () => {
      const left = mirrorRect('left')
      const right = mirrorRect('right')
      expect(left).toEqual({
        left: NEAR_SLOT.left,
        top: NEAR_SLOT.top,
        width: NEAR_SLOT.right - NEAR_SLOT.left,
        height: NEAR_SLOT.bottom - NEAR_SLOT.top,
      })
      expect(right).toEqual({
        left: FAR_SLOT.left,
        top: FAR_SLOT.top,
        width: FAR_SLOT.right - FAR_SLOT.left,
        height: FAR_SLOT.bottom - FAR_SLOT.top,
      })
      // The two never overlap: each has its own corner of the page.
      expect(left.left + left.width).toBeLessThan(right.left)
      // Both a mirror's shape, wider than tall by the page's own aspect (1280 x 720): across in the page's
      // fractions is 1.78 times the page's height, so its pixels are wider than tall.
      for (const rect of [left, right]) {
        expect(rect.width * 1280).toBeGreaterThan(rect.height * 720 * 1.2)
      }
      // The two are the same size, one over the map, one over the column.
      expect(left.width).toBeCloseTo(right.width)
      expect(left.height).toBeCloseTo(right.height)
    })
})

describe('mirrorBox', () => {
  it('is the slot in the page’s own pixels: the numbers the mod’s element is written with', () => {
    // crates/setup/src/game_mod.rs writes the same fractions into the truck's screen script; the page's zoom
    // (`--ui-scale`) must not come into it (the hole and the frame are placed by these numbers, both).
    // Near: coords_l 199, coords_r 564, coords_t 688, coords_b 448 in a 720-row screen (so 32..272 from the top).
    const near = mirrorBox('left')
    expect(Math.round(near.left)).toBe(199)
    expect(Math.round(near.left + near.width)).toBe(564)
    expect(Math.round(near.top)).toBe(32)
    expect(Math.round(near.top + near.height)).toBe(272)
    // Far: coords_l 883, coords_r 1248, the same rows.
    const far = mirrorBox('right')
    expect(Math.round(far.left)).toBe(883)
    expect(Math.round(far.left + far.width)).toBe(1248)
    expect(Math.round(far.top)).toBe(Math.round(near.top))
  })

  it('moves left by the page’s own strip inset, and only left', () => {
    const plain = mirrorBox('left')
    const inset = mirrorBox('left', 12)
    expect(inset.left).toBeCloseTo(plain.left - 12)
    expect(inset.top).toBeCloseTo(plain.top)
    expect(inset.width).toBeCloseTo(plain.width)
  })
})

describe('holeInside', () => {
  it('keeps the rim outside the hole, and rounds the corners inside the frame', () => {
    expect(holeInside({ left: 100, top: 50, width: 200, height: 100 }, 2, 18)).toEqual({
      x: 102,
      y: 52,
      width: 196,
      height: 96,
      radius: 16,
    })
  })

  it('never asks for a hole of nothing', () => {
    expect(holeInside({ left: 0, top: 0, width: 3, height: 3 }, 2, 1)).toEqual({
      x: 2,
      y: 2,
      width: 0,
      height: 0,
      radius: 0,
    })
  })
})
