import { describe, expect, it } from 'vitest'
import type { Telemetry, TrailerInfo } from '../../shared/host'
import type { LiveState } from '../state/store'
import { bend, courses, groundAt, guides, parksOnTheGamesConsole, REAR_VIEW, reverseView, reversing, ROOF_VIEW, roofArc } from './reverse'

/** The live state with what these need, the rest as the store starts it. */
function at(telemetry?: Partial<Telemetry>, trailer?: Partial<TrailerInfo> | null): LiveState {
  return {
    telemetry: telemetry ? ({ ...telemetry } as Telemetry) : null,
    trailer: trailer ? ({ ...trailer } as TrailerInfo) : null,
  } as LiveState
}

/** The x a band's corner is drawn at. */
function x(band: ReturnType<typeof guides>[number], corner: 0 | 1 | 2 | 3): number {
  return band.corners[corner].x
}

describe('reversing', () => {
  it('is the gear the game shows: R1 and R2', () => {
    expect(reversing(at({ displayedGear: -1 }))).toBe(true)
    expect(reversing(at({ displayedGear: -2 }))).toBe(true)
    expect(reversing(at({ displayedGear: 0 }))).toBe(false)
    expect(reversing(at({ displayedGear: 4 }))).toBe(false)
    expect(reversing(at())).toBe(false)
  })

  it('shows the rig from above with a trailer hitched, the road behind without one', () => {
    expect(reverseView(at({ trailerConnected: true }))).toBe('roof')
    expect(reverseView(at({ trailerConnected: false }))).toBe('rear')
    // The game not saying: the trailer it last reported decides.
    expect(reverseView(at({}, { id: 'trailer.scs.box' }))).toBe('roof')
    expect(reverseView(at({}, { id: '' }))).toBe('rear')
    expect(reverseView(at({}, null))).toBe('rear')
  })
})

describe('bend', () => {
  it('is the steering, with the wheels’ dead zone drawn straight', () => {
    expect(bend(0.4)).toBe(0.4)
    expect(bend(-0.75)).toBe(-0.75)
    expect(bend(0.01)).toBe(0)
    expect(bend(-0.01)).toBe(0)
    expect(bend(-0.02)).toBe(-0.02)
    expect(bend(3)).toBe(1)
    expect(bend(Number.NaN)).toBe(0)
  })
})

describe('groundAt', () => {
  it('draws the ground behind in perspective: nearer rows lower and wider', () => {
    const near = groundAt(1)
    const far = groundAt(12)
    expect(near.y).toBeGreaterThan(far.y)
    expect(near.half).toBeGreaterThan(far.half)
    // The projection's own numbers (FIXES §35.3): `y = horizon + 350 / (1 + 0.9d)`, `half = nearHalf / (1 + 0.9d)`.
    expect(near.y).toBeCloseTo(REAR_VIEW.horizon + 350 / 1.9, 6)
    expect(near.half).toBeCloseTo(REAR_VIEW.nearHalf / 1.9, 6)
  })
})

describe('guides', () => {
  it('draws three bands across the road, red nearest and green furthest', () => {
    const bands = guides(0)
    expect(bands.map((band) => band.colour)).toEqual(['red', 'yellow', 'green'])
    for (const band of bands) {
      // Straight wheels: each band sits square across the road, either side of its middle.
      expect(x(band, 0) + x(band, 1)).toBeCloseTo(REAR_VIEW.width, 6)
      expect(x(band, 0)).toBeLessThan(x(band, 1))
      expect(band.corners[0].y).toBeGreaterThan(band.corners[3].y)
    }
  })

  it('swings with the wheels, further at the far edge than the near one, mirrored either way', () => {
    const straight = guides(0)
    const left = guides(0.5)
    const right = guides(-0.5)
    for (let index = 0; index < straight.length; index += 1) {
      const square = straight[index]
      const bent = left[index]
      const other = right[index]
      if (!square || !bent || !other) throw new Error('a band is missing')
      const nearSwing = x(bent, 0) - x(square, 0)
      const farSwing = x(bent, 3) - x(square, 3)
      expect(nearSwing).toBeGreaterThan(0)
      expect(farSwing).toBeGreaterThan(nearSwing)
      // The other way, as far the other way.
      expect(x(other, 0) + x(bent, 0)).toBeCloseTo(2 * x(square, 0), 6)
    }
  })
})

describe('courses', () => {
  it('runs two lines from the bumper to the far reach, together with straight wheels', () => {
    const [left, right] = courses(0)
    expect(left).toHaveLength(9)
    expect(left.length).toBe(right.length)
    const first = left[0]
    const last = left[left.length - 1]
    if (!first || !last) throw new Error('no course')
    expect(first.y).toBeGreaterThan(last.y)
    // Symmetric about the middle of the picture.
    expect(first.x + (right[0]?.x ?? 0)).toBeCloseTo(REAR_VIEW.width, 6)
  })
})

describe('roofArc', () => {
  it('goes straight back with straight wheels', () => {
    const arc = roofArc(0)
    expect(arc.centre).toHaveLength(ROOF_VIEW.steps + 1)
    for (const point of arc.centre) expect(point.x).toBeCloseTo(ROOF_VIEW.axle.x, 6)
    const first = arc.centre[0]
    const last = arc.centre[arc.centre.length - 1]
    if (!first || !last) throw new Error('no arc')
    expect(last.y).toBeGreaterThan(first.y)
  })

  it('curves with the wheels, either way, and the band is closed either side of its line', () => {
    const arc = roofArc(0.6)
    const first = arc.centre[0]
    const last = arc.centre[arc.centre.length - 1]
    const other = roofArc(-0.6)
    const otherLast = other.centre[other.centre.length - 1]
    if (!first || !last || !otherLast) throw new Error('no arc')
    // Not the straight line, and the other way for the other lock.
    expect(Math.abs(last.x - first.x)).toBeGreaterThan(1)
    expect(Math.sign(last.x - first.x)).toBe(-Math.sign(otherLast.x - first.x))
    expect(arc.left).toHaveLength(arc.centre.length)
    expect(arc.right).toHaveLength(arc.centre.length)
    // Either side of the line it starts on (straight down the screen), half the band wide.
    expect(arc.left[0]?.x).toBeCloseTo(ROOF_VIEW.axle.x - ROOF_VIEW.halfBand, 6)
    expect(arc.right[0]?.x).toBeCloseTo(ROOF_VIEW.axle.x + ROOF_VIEW.halfBand, 6)
  })
})

describe('parksOnTheGamesConsole', () => {
  /** The live state with a truck id, the rest as the store starts it. */
  function inTruck(id: string): LiveState {
    return { truck: { id, brandId: '', brand: '', name: '' } } as LiveState
  }

  it('steps aside for Road Trip\u2019s two cars, whose own console shows the reverse picture', () => {
    expect(parksOnTheGamesConsole(inTruck('vehicle.ford.bronco_24'))).toBe(true)
    expect(parksOnTheGamesConsole(inTruck('vehicle.ford.f150_23'))).toBe(true)
  })

  it('keeps WestPlay\u2019s own camera in every other vehicle', () => {
    const others = ['vehicle.scania.s_2016', 'vehicle.kenworth.t680_2022', 'vehicle.volvo.vnl2025', 'vehicle.ford.fmax']
    for (const id of others) expect(parksOnTheGamesConsole(inTruck(id))).toBe(false)
  })

  it('is nothing without a truck to read', () => {
    expect(parksOnTheGamesConsole({ truck: null } as LiveState)).toBe(false)
  })
})
