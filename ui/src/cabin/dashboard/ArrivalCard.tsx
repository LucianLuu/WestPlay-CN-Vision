import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { truckWear, worst } from '../apps/vehicle/vehicle'
import { PlaceBadge } from '../maps/PlaceBadge'
import { nameOf, usePlaces } from '../maps/places'
import { toLngLat } from '../maps/projection'
import { changeRoute } from '../maps/routeChange'
import { useLive } from '../state/store'
import { type Strings, useText } from '../state/text'
import { type ArrivalReason, arrivalSuggestion, distanceKm, hasDestination, SAME_PLACE } from './arrival'
import './map.css'

/** How fast the truck has to be going to count as driving again, m/s (the package's own figure). */
const DRIVING = 30

/** How close to the end of the game's route counts as arriving there, metres: its last kilometre. */
const ARRIVED = 1000

/**
 * The arrival card (owner 2026-11-03, from the increment package): in the map's bottom-right corner, the one
 * nearby place the player's state calls for once the truck stops at the end of a route or finishes a delivery —
 * fuel for a low tank, a service for a worn truck, a parking for a day that is nearly over, a company with no
 * job to head for. Tapping a row sends that place to the game's own GPS and puts the card away.
 *
 * Only with no navigation point on the map (owner 2026-11-03: 让地图有导航点时不显示附近推荐): while the game's GPS
 * plans a route the truck is heading somewhere, so the card keeps away — it comes back once the route is gone.
 *
 * It is mounted in MapView, so it lives on the map alone (that is the map page); the choice of what to offer is
 * `arrival.ts`'s, and here is only when it shows and how it looks.
 */
export function ArrivalCard() {
  const text = useText()
  const places = usePlaces()
  // Arrived (a latch: the truck stays put at its destination) and put away (a place taken, so the card stays
  // gone until the truck drives off or a new job starts).
  const [arrived, setArrived] = useState(false)
  const [closed, setClosed] = useState(false)
  const [folded, setFolded] = useState(false)
  /*
   * The same "put away" for the store's listener below, which is set up once and so would otherwise see the value
   * `closed` had when it was: what the player chose is a thing the listener has to know before it offers the card
   * again on the next telemetry tick.
   */
  const putAway = useRef(false)

  // The latch follows the truck's state as the store reports it, one update at a time (a subscription rather than
  // an effect, so the 20 telemetry updates a second don't re-render the map for their own sake).
  useEffect(
    () =>
      useLive.subscribe((state, was) => {
        const job = state.job?.active === true
        const wasJob = was.job?.active === true
        const speed = Math.abs(state.telemetry?.speed ?? 0)
        const distance = state.telemetry?.navigationDistance ?? 0
        if (wasJob && was.job?.cargoLoaded === true && !job) {
          // The cargo was handed over: the game drops the job at once, and the truck is at its delivery.
          putAway.current = false
          setClosed(false)
          setArrived(true)
        } else if (job && !wasJob) {
          // A new job: the last delivery's card is done with.
          putAway.current = false
          setClosed(false)
          setArrived(false)
        } else if (speed > DRIVING) {
          // Driving off: the moment has passed, and the next arrival starts afresh.
          putAway.current = false
          setClosed(false)
          setArrived(false)
        } else if (!putAway.current && distance > 0 && distance < ARRIVED) {
          // The route's last kilometre, at a crawl: arrived at the end of it.
          setArrived(true)
        }
      }),
    [],
  )

  // A navigation point on the map: the game's GPS plans a route. The card keeps away then (arrival.ts).
  const navigating = useLive((state) => hasDestination(state.route))

  // What the card itself is drawn from: a job is on (its offer differs without one), and how far the route has
  // left.
  const status = useLive(
    useShallow((state) => ({
      job: state.job?.active === true,
      distance: state.telemetry?.navigationDistance ?? 0,
    })),
  )

  // Where the truck is (lng/lat, as the places are), and where the game's route ends, for the choice's own
  // "is the place I'd offer the one I'm standing at" question.
  const at = useLive(
    useShallow((state) => {
      const telemetry = state.telemetry
      return telemetry ? ([telemetry.x, telemetry.z] as const) : null
    }),
  )
  const end = useLive(useShallow((state) => state.route?.nodes.at(-1)?.position ?? null))
  const wear = useLive((state) => {
    const telemetry = state.telemetry
    return telemetry ? worst(truckWear(telemetry)) : null
  })
  const rest = useLive(
    useShallow((state) => {
      const telemetry = state.telemetry
      return {
        known: telemetry?.restStopKnown === true,
        minutes: telemetry?.restStopMinutes ?? 0,
        fuelRange: telemetry?.fuelRange ?? 0,
      }
    }),
  )

  const from = at ? toLngLat(at[0], at[1]) : null
  const suggestion =
    places && arrived && !closed && !navigating
      ? arrivalSuggestion(
          places,
          from,
          {
            fuelRange: rest.fuelRange,
            wear,
            restStopKnown: rest.known,
            restStopMinutes: rest.minutes,
            job: status.job,
          },
          end ? toLngLat(end[0], end[1]) : null,
          status.distance > 0 && status.distance < SAME_PLACE,
        )
      : null
  if (!suggestion) return null

  const choose = (node: string) => {
    // The game's own GPS takes the place, as the search's place card sends it (routeChange.ts).
    void changeRoute('go', node)
    putAway.current = true
    setArrived(false)
    setClosed(true)
  }
  return (
    <div className="arrival-card">
      <div className="arrival-head">
        <div className="arrival-text">
          <div className="arrival-title">{text.nearby.title}</div>
          {!folded && <div className="arrival-reason">{reasonText(suggestion.reason, text)}</div>}
        </div>
        <button
          type="button"
          className="arrival-fold"
          aria-expanded={!folded}
          aria-label={folded ? text.nearby.expand : text.nearby.collapse}
          onClick={() => setFolded((away) => !away)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={folded ? 'M6 9.5 12 15.5 18 9.5' : 'M6 14.5 12 8.5 18 14.5'} />
          </svg>
        </button>
      </div>
      {!folded && (
        <div className="arrival-list">
          {suggestion.rows.map(({ place, metres }, index) => {
            const kind = text.destinations.kinds[place.kind]
            const name = nameOf(place, kind)
            return (
              <button
                key={index}
                type="button"
                className="arrival-row"
                aria-label={[name, kind, distanceKm(metres, text.decimal), text.nearby.go].join(' · ')}
                onClick={() => choose(place.node)}
              >
                <PlaceBadge kind={place.kind} />
                <span className="arrival-row-text">
                  <span className="arrival-row-name">{name}</span>
                  <span className="arrival-row-detail">{`${kind} · ${distanceKm(metres, text.decimal)}`}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Why the card offers what it does, in the player's language (`text.nearby.reason.*`). */
function reasonText(reason: ArrivalReason, text: Strings): string {
  switch (reason) {
    case 'fuel':
      return text.nearby.reason.fuel
    case 'service':
      return text.nearby.reason.service
    case 'rest':
      return text.nearby.reason.rest
    case 'company':
      return text.nearby.reason.company
  }
}
