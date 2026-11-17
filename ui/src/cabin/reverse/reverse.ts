import type { LiveState } from '../state/store'

/** A point in a view's drawing space (SVG px). */
export interface Point {
  x: number
  y: number
}

/**
 * Whether the truck is in reverse: the gear the game shows the driver (`R1`, `R2`, FIXES §35).
 */
export function reversing(live: LiveState): boolean {
  return (live.telemetry?.displayedGear ?? 0) < 0
}

/**
 * The vehicles whose own centre console WestPlay steps aside for in reverse, instead of drawing its own camera
 * (owner 2026-11-07: 「让福特烈马和F50挂R挡时显示游戏原版中控（倒车影像）」): Road Trip's two cars, which show their
 * own reversing picture on the screen under the page. Their ids as the SDK gives them, `vehicle.` and all.
 */
const PARKING_ON_THE_GAMES_CONSOLE: readonly string[] = ['vehicle.ford.bronco_24', 'vehicle.ford.f150_23']

/**
 * Whether reverse steps the page aside whole for the game's own centre console, this vehicle showing its
 * reverse picture there (`PARKING_ON_THE_GAMES_CONSOLE`). Every other vehicle keeps WestPlay's own camera, which
 * draws the rig itself.
 */
export function parksOnTheGamesConsole(live: LiveState): boolean {
  const id = live.truck?.id ?? ''
  return PARKING_ON_THE_GAMES_CONSOLE.includes(id)
}

/** Which view the camera shows: the rig from above with a trailer hitched, the road behind without one. */
export type ReverseView = 'rear' | 'roof'

export function reverseView(live: LiveState): ReverseView {
  const connected = live.telemetry?.trailerConnected
  // The game's own flag while it says: a trailer unhitched keeps its last id a moment longer.
  if (typeof connected === 'boolean') return connected ? 'roof' : 'rear'
  return (live.trailer?.id ?? '') === '' ? 'rear' : 'roof'
}

/** The wheels' dead zone: a steering in it draws straight guides. */
export const STEERING_DEAD_ZONE = 0.02

/** The steering as the guides bend by it: the SDK's -1 (right) to 1 (left), 0 in the dead zone. */
export function bend(steering: number): number {
  if (!Number.isFinite(steering)) return 0
  const turn = Math.max(-1, Math.min(1, steering))
  return Math.abs(turn) < STEERING_DEAD_ZONE ? 0 : turn
}

/**
 * The rear view's drawing space and the road it draws: the ground is a trapezoid whose rows stand for distances
 * behind the bumper, nearer rows lower and wider (FIXES §35.3's projection: `y = horizon + 350 / (1 + 0.9d)`).
 */
export const REAR_VIEW = {
  width: 960,
  height: 480,
  /** Where the road starts, px: high enough that the sky is a strip, not half the picture. */
  horizon: 170,
  /** The road's half width at the bumper, px. */
  nearHalf: 258,
  /** How fast a row narrows with distance: the projection's `0.9` per metre. */
  spread: 0.9,
  /** How far behind the truck the guides reach, metres. */
  reach: 12,
  /** How far behind the bumper the picture's bottom edge is, metres. */
  near: 0.34,
} as const

/** The rows drawn across the road behind: their distance from the bumper, in metres. */
export const REAR_ROWS = [1, 2, 3, 5, 8, 12] as const

/** Where the ground at `metres` behind the truck is drawn: its row's `y`, and its half width. */
export function groundAt(metres: number): { y: number; half: number } {
  const near = 1 + REAR_VIEW.spread * Math.max(0, metres)
  return { y: REAR_VIEW.horizon + 350 / near, half: REAR_VIEW.nearHalf / near }
}

/** How far the far end of the guides swings at full lock, px. */
const SWING = 190

/** How far the row at `metres` is swung by `turn`: the further away, the more the truck's heading has turned. */
function swing(metres: number, turn: number): number {
  const along = metres / REAR_VIEW.reach
  return SWING * turn * along * along
}

/** Where the point `across` of the road's half width at `metres` is drawn, swung by `turn`. */
function xAt(metres: number, across: number, turn: number): number {
  const { half } = groundAt(metres)
  return REAR_VIEW.width / 2 + across * half + swing(metres, turn)
}

/** A band across the road the guides draw, as a camera's colours say: red the nearest, then yellow, then green. */
export interface GuideBand {
  colour: 'red' | 'yellow' | 'green'
  /** Its quad on the ground: near left, near right, far right, far left. */
  corners: readonly [Point, Point, Point, Point]
}

/** The bands across the road, nearest first: from and to (metres behind the bumper) and the colour of each. */
const BANDS = [
  { from: 0.9, to: 1.3, colour: 'red' },
  { from: 1.9, to: 2.3, colour: 'yellow' },
  { from: 2.9, to: 3.3, colour: 'green' },
] as const

/**
 * The three bands across the road behind, swung by `turn`: each follows the ground's perspective, so its far edge
 * swings further out than its near one — what a reversing camera's guides do as the wheels turn (§35.3).
 */
export function guides(turn: number): GuideBand[] {
  return BANDS.map(({ from, to, colour }) => {
    const near = groundAt(from)
    const far = groundAt(to)
    return {
      colour,
      corners: [
        { x: xAt(from, -1, turn), y: near.y },
        { x: xAt(from, 1, turn), y: near.y },
        { x: xAt(to, 1, turn), y: far.y },
        { x: xAt(to, -1, turn), y: far.y },
      ],
    }
  })
}

/** How many steps the courses are drawn in. */
const COURSE_STEPS = 8

/** The two courses the rear wheels will take, either side of the road: a camera's guide lines (§35.3). */
export function courses(turn: number): readonly [readonly Point[], readonly Point[]] {
  const left: Point[] = []
  const right: Point[] = []
  for (let step = 0; step <= COURSE_STEPS; step += 1) {
    const metres = REAR_VIEW.near + ((REAR_VIEW.reach - REAR_VIEW.near) * step) / COURSE_STEPS
    const { y } = groundAt(metres)
    left.push({ x: xAt(metres, -0.94, turn), y })
    right.push({ x: xAt(metres, 0.94, turn), y })
  }
  return [left, right]
}

/**
 * The roof view's drawing space and where the rig sits in it (1 m = 20 px, the truck's nose at the top): the cab,
 * the 13 m trailer behind it, and the tail's rear axle the sweep starts from (FIXES §35).
 */
export const ROOF_VIEW = {
  width: 1000,
  height: 580,
  cab: { x: 476, y: 24, width: 48, height: 120 },
  trailer: { x: 474, y: 148, width: 52, height: 272 },
  /** The trailer's rear axle: the point its tail swings about. */
  axle: { x: 500, y: 396 },
  /** Each step of the sweep's length, and how far it turns for a full lock, radians. */
  step: 14,
  turn: 0.03,
  /** How wide the band the tail sweeps either side of its line is, px. */
  halfBand: 23,
  /** How many steps the sweep is drawn for. */
  steps: 12,
} as const

/** Where a wheel pair is drawn in the roof view: the centre line's y and how wide the pair is. */
export const ROOF_AXLES = [116, 140, 374, 396, 416] as const

/** The line the trailer's tail will follow, and the band it sweeps either side of it. */
export interface RoofArc {
  centre: readonly Point[]
  left: readonly Point[]
  right: readonly Point[]
}

/**
 * The band the trailer's tail sweeps as it reverses, from its rear axle: a step at a time, turned by `0.03 · turn`
 * radians each step — a curvature exaggerated past the real truck's, as a screen this size needs (§35.3).
 */
export function roofArc(turn: number): RoofArc {
  const centre: Point[] = []
  const left: Point[] = []
  const right: Point[] = []
  let x = ROOF_VIEW.axle.x
  let y = ROOF_VIEW.axle.y
  // Straight down the screen: the way behind the truck.
  let heading = Math.PI / 2
  const each = ROOF_VIEW.turn * turn
  for (let step = 0; step <= ROOF_VIEW.steps; step += 1) {
    centre.push({ x, y })
    // Either side of the line, across it.
    const across = heading + Math.PI / 2
    left.push({
      x: x + Math.cos(across) * ROOF_VIEW.halfBand,
      y: y + Math.sin(across) * ROOF_VIEW.halfBand,
    })
    right.push({
      x: x - Math.cos(across) * ROOF_VIEW.halfBand,
      y: y - Math.sin(across) * ROOF_VIEW.halfBand,
    })
    x += Math.cos(heading) * ROOF_VIEW.step
    y += Math.sin(heading) * ROOF_VIEW.step
    heading += each
  }
  return { centre, left, right }
}
