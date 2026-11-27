import type { Maneuver } from './guidance'
import { headLine, heightOnSpan, type Heights, type Progress, type RaisedLine, type Spans } from './route'

/** Lengths along the drawn route in the game's world, separate from the GPS card's scaled distances. */
export const ROUTE_ARROW_MAX_OFFSET = 18
/** Below half a pixel even at the closest map zoom. */
const TIP_REACHED = 0.05
const TURN_LENGTH = 64
const EXIT_OF_ROUNDABOUT_LENGTH = 32

interface Sample {
  point: RaisedLine[number]
  along: number
}

function measure(line: RaisedLine): Sample[] {
  const samples: Sample[] = []
  for (const point of line) {
    const previous = samples.at(-1)
    if (!previous) {
      samples.push({ point, along: 0 })
      continue
    }
    const distance = Math.hypot(point[0] - previous.point[0], point[1] - previous.point[1])
    if (distance > 0) samples.push({ point, along: previous.along + distance })
  }
  return samples
}

function at(a: Sample, b: Sample, along: number): Sample {
  if (along === a.along) return a
  if (along === b.along) return b
  const t = (along - a.along) / (b.along - a.along)
  return {
    along,
    point: [
      a.point[0] + (b.point[0] - a.point[0]) * t,
      a.point[1] + (b.point[1] - a.point[1]) * t,
      a.point[2] + (b.point[2] - a.point[2]) * t,
    ],
  }
}

/** Keeps both end points, interpolating height where the cut falls inside a segment. */
function slice(samples: readonly Sample[], from: number, to: number): Sample[] {
  const part: Sample[] = []
  for (let i = 1; i < samples.length; i++) {
    const [a, b] = [samples[i - 1], samples[i]]
    if (b.along <= from) continue
    if (a.along >= to) break
    if (!part.length) part.push(at(a, b, Math.max(a.along, from)))
    part.push(at(a, b, Math.min(b.along, to)))
  }
  return part
}

/** The first span that can still have an arrow. Reaching a tip can precede the game's next-node update. */
export function routeArrowSpan(active: Spans, next: number, progress: Progress | null): number {
  const first = Math.max(0, next - 1)
  if (!progress || progress.distance > ROUTE_ARROW_MAX_OFFSET) return first
  const span = active[progress.span]
  if (!span) return first
  const tip = span.at(-1)
  const reached =
    tip &&
    progress.index === span.length - 2 &&
    Math.hypot(progress.at[0] - tip[0], progress.at[1] - tip[1]) <= TIP_REACHED
  return Math.max(first, progress.span + (reached ? 1 : 0))
}

/**
 * The centre of one arrow, along the remaining bright route only. A maneuver's node is the index of
 * its junction span. It is drawn as soon as its route is known. Progress distinguishes repeated visits
 * and trims the arrow behind the truck, including when a coach's stop ends partway through a span.
 */
export function nextRouteArrow(
  active: Spans,
  maneuvers: readonly Maneuver[],
  next: number,
  progress: Progress | null,
  heights: Heights,
): RaisedLine | null {
  const fromSpan = routeArrowSpan(active, next, progress)
  for (const turn of maneuvers) {
    if (turn.node < fromSpan) continue
    const junction = active[turn.node]
    if (!junction) break
    const within = progress?.span === turn.node && progress.distance <= ROUTE_ARROW_MAX_OFFSET ? progress : null
    const path = within ? headLine(active, within) : junction
    const height = within ? heightOnSpan(junction, within, heights) : 0
    const samples = measure(path.map((point, i) => [...point, within && i === 0 ? height : (heights.get(point) ?? 0)]))
    const end = samples.at(-1)?.along ?? 0
    if (end <= TIP_REACHED) continue
    const from = Math.max(0, end - (turn.turn === 'roundabout' ? EXIT_OF_ROUNDABOUT_LENGTH : TURN_LENGTH))
    return slice(samples, from, end).map(({ point }) => point)
  }
  return null
}

/** A triangle strip whose shaft and tapered head both follow the route's samples. Widths are half-widths in metres. */
function strip(
  samples: readonly Sample[],
  tail: number,
  shoulder: number,
  tip: number,
  shaft: number,
  head: number,
): RaisedLine {
  const body = slice(samples, tail, shoulder)
  const points = [...body, ...slice(samples, shoulder, tip).slice(1)]
  const vertices: RaisedLine = []
  points.forEach(({ point: [x, z, height], along }, i) => {
    const before = points[Math.max(0, i - 1)].point
    const after = points[Math.min(points.length - 1, i + 1)].point
    const dx = after[0] - before[0]
    const dz = after[1] - before[1]
    const length = Math.hypot(dx, dz) || 1
    const pair = (half: number) => {
      const acrossX = (-dz / length) * half
      const acrossZ = (dx / length) * half
      vertices.push([x - acrossX, z - acrossZ, height], [x + acrossX, z + acrossZ, height])
    }
    if (i < body.length) pair(shaft)
    if (i >= body.length - 1) pair((head * (tip - along)) / (tip - shoulder))
  })
  return vertices
}

export function arrowStrips(line: RaisedLine, routeWidth: number): { casing: RaisedLine; fill: RaisedLine } | null {
  const samples = measure(line)
  const length = samples.at(-1)?.along ?? 0
  if (length <= TIP_REACHED || routeWidth <= 0) return null
  // Let the white shaft cover the route fill, with a little room for the zoom buckets. Cap the width
  // on very short stretches, where the head still needs enough room to point along the route.
  const shaft = Math.min(routeWidth * 0.63, length * 0.42)
  const edge = shaft / 6
  const head = shaft * 1.5
  const headLength = Math.min(length * 0.52, Math.max(length * 0.28, shaft * 2.38))
  const shoulder = length - headLength
  return {
    casing: strip(samples, 0, shoulder, length, shaft, head),
    fill: strip(
      samples,
      edge,
      shoulder + edge,
      length - 1.8 * edge,
      shaft - edge,
      head * (1 - edge / headLength) - edge,
    ),
  }
}
