import { useLive } from '../state/store'
import { useText } from '../state/text'
import { ReverseBar } from './ReverseBar'
import { layoutShows, useReverseLayout } from './layout'
import { bend, courses, groundAt, guides, parksOnTheGamesConsole, REAR_ROWS, REAR_VIEW, reversing, ROOF_AXLES, ROOF_VIEW, roofArc, type Point } from './reverse'
import './reverse.css'

/**
 * The reversing camera (FIXES §35, §40, §45): the whole cab screen becomes a monitor while the truck is in
 * reverse — the road behind, the rig from above with a trailer, or both, as the driver picked (layout.ts) — with
 * the gear, the speed, the trailer it is pulling, and the yellow warning under the picture.
 *
 * It is a drawing, not the game's picture: the game gives its data, never a world view, and the screen the cabin
 * shows can only be WestPlay's own page (§35.1). The numbers on it (gear, speed, steering) are the game's.
 *
 * The `live` layout is the other way round (owner 2026-11-04, §91): the game draws its own park camera into the
 * mod's element and the page steps aside for it whole, so the bar goes with `ReverseOver.tsx` and nothing is
 * drawn here.
 */
export function ReverseCamera() {
  const live = useLive()
  const text = useText()
  const layout = useReverseLayout((state) => state.layout)
  // A vehicle whose own console shows the reverse picture (`parksOnTheGamesConsole`): nothing is drawn here either,
  // whatever the layout, or WestPlay's camera would cover the console the player is meant to see.
  if (!reversing(live) || layout === 'live' || parksOnTheGamesConsole(live)) return null
  const turn = bend(live.telemetry?.steering ?? 0)
  const { rear, roof, pip } = layoutShows(layout)
  /** The view `which`, in the corner (`pip`) or filling the screen. */
  const view = (which: 'rear' | 'roof') => {
    const drawing = which === 'rear' ? <RearView turn={turn} /> : <RoofView turn={turn} />
    return pip === which ? <div className="rev-pip">{drawing}</div> : <div className="rev-panel">{drawing}</div>
  }
  return (
    <div className={`rev rev-${layout}`}>
      <ReverseBar />
      <div className={`rev-body rev-body-${layout}`}>
        {rear && view('rear')}
        {roof && view('roof')}
      </div>
      <p className="rev-warning">{text.reverseCamera.warning}</p>
    </div>
  )
}

/** A point list as an SVG `points` attribute. */
function points(list: readonly Point[]): string {
  return list.map((one) => `${one.x.toFixed(1)},${one.y.toFixed(1)}`).join(' ')
}

/**
 * The road behind the truck, in perspective: the rows across it, the three bands that swing with the wheels, the
 * two courses either side, and the bumper and its tail lights at the bottom of the picture (§35.2, §40).
 */
function RearView({ turn }: { turn: number }) {
  const near = groundAt(REAR_VIEW.near)
  const middle = REAR_VIEW.width / 2
  const road = [
    { x: middle, y: REAR_VIEW.horizon },
    { x: middle + near.half, y: near.y },
    { x: middle - near.half, y: near.y },
  ]
  const rows = REAR_ROWS.map((metres) => ({ metres, ...groundAt(metres) }))
  const bands = guides(turn)
  const [left, right] = courses(turn)
  return (
    <svg className="rev-svg" viewBox={`0 0 ${REAR_VIEW.width} ${REAR_VIEW.height}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="rev-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a1220" />
          <stop offset="100%" stopColor="#1b2733" />
        </linearGradient>
        <radialGradient id="rev-vignette" cx="50%" cy="52%" r="74%">
          <stop offset="56%" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="100%" stopColor="rgb(0 0 0 / 0.6)" />
        </radialGradient>
      </defs>
      <rect className="rev-ground" x="0" y="0" width={REAR_VIEW.width} height={REAR_VIEW.height} />
      <rect className="rev-sky" x="0" y="0" width={REAR_VIEW.width} height={REAR_VIEW.horizon} fill="url(#rev-sky)" />
      {/* Something to see past the road: the far side of the street, in the dark. */}
      <g className="rev-skyline">
        <rect x="150" y={REAR_VIEW.horizon - 54} width="120" height="54" rx="4" />
        <rect x="610" y={REAR_VIEW.horizon - 38} width="170" height="38" rx="4" />
        <rect x="700" y={REAR_VIEW.horizon - 66} width="60" height="28" rx="4" />
      </g>
      <line className="rev-horizon" x1="0" x2={REAR_VIEW.width} y1={REAR_VIEW.horizon} y2={REAR_VIEW.horizon} />
      <polygon className="rev-road" points={points(road)} />
      {rows.map(({ metres, y, half }) => (
        <g key={metres}>
          <line className="rev-row" x1={middle - half} x2={middle + half} y1={y} y2={y} />
          {/* Its distance, out beside the road: the far rows are narrower than the word for them. */}
          {half >= 30 ? (
            <text className="rev-row-text" x={middle - half - 12} y={y + 5} textAnchor="end">
              {metres} m
            </text>
          ) : null}
        </g>
      ))}
      {bands.map((band) => (
        <polygon key={band.colour} className={`rev-band rev-${band.colour}`} points={points(band.corners)} />
      ))}
      <polyline className="rev-course" points={points(left)} />
      <polyline className="rev-course" points={points(right)} />
      <rect className="rev-bumper" x={middle - near.half} y={near.y - 26} width={near.half * 2} height="26" rx="6" />
      <rect className="rev-light" x={middle - near.half + 14} y={near.y - 18} width="44" height="12" rx="4" />
      <rect className="rev-light" x={middle + near.half - 58} y={near.y - 18} width="44" height="12" rx="4" />
      <rect className="rev-vignette" x="0" y="0" width={REAR_VIEW.width} height={REAR_VIEW.height} />
    </svg>
  )
}

/**
 * The rig from above: the cab, the 13 m trailer, the wheels, the fifth wheel — and the band the trailer's tail
 * sweeps as it reverses, on a metre grid (§35.2, §40).
 */
function RoofView({ turn }: { turn: number }) {
  const arc = roofArc(turn)
  const { cab, trailer } = ROOF_VIEW
  const middle = ROOF_VIEW.width / 2
  const grid: number[] = []
  for (let x = 0; x <= ROOF_VIEW.width; x += 20) grid.push(x)
  return (
    <svg className="rev-svg" viewBox={`0 0 ${ROOF_VIEW.width} ${ROOF_VIEW.height}`} preserveAspectRatio="xMidYMid meet">
      <rect className="rev-ground" x="0" y="0" width={ROOF_VIEW.width} height={ROOF_VIEW.height} />
      <g className="rev-grid">
        {grid.map((x) => (
          <line key={`x${x}`} x1={x} x2={x} y1="0" y2={ROOF_VIEW.height} className={x % 100 === 0 ? 'rev-grid-major' : undefined} />
        ))}
        {grid
          .filter((x) => x <= ROOF_VIEW.height)
          .map((y) => (
            <line key={`y${y}`} x1="0" x2={ROOF_VIEW.width} y1={y} y2={y} className={y % 100 === 0 ? 'rev-grid-major' : undefined} />
          ))}
      </g>
      <polygon className="rev-swept" points={points([...arc.left, ...[...arc.right].reverse()])} />
      <polyline className="rev-swept-line" points={points(arc.centre)} />
      <rect className="rev-cab" x={cab.x} y={cab.y} width={cab.width} height={cab.height} rx="8" />
      <rect className="rev-box" x={trailer.x} y={trailer.y} width={trailer.width} height={trailer.height} rx="4" />
      {ROOF_AXLES.map((y) => (
        <g key={y}>
          <rect className="rev-wheel" x={cab.x - 6} y={y - 5} width="12" height="10" rx="3" />
          <rect className="rev-wheel" x={cab.x + cab.width - 6} y={y - 5} width="12" height="10" rx="3" />
          <rect className="rev-wheel" x={trailer.x - 6} y={y - 5} width="12" height="10" rx="3" />
          <rect className="rev-wheel" x={trailer.x + trailer.width - 6} y={y - 5} width="12" height="10" rx="3" />
        </g>
      ))}
      <circle className="rev-fifth" cx={middle} cy={trailer.y} r="9" />
      <line className="rev-centre" x1={middle} x2={middle} y1="0" y2={ROOF_VIEW.height} />
    </svg>
  )
}
