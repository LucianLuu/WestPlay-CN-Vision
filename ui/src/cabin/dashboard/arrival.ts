import { type Destination, type DestinationKind, distanceTo } from '../maps/places'

/**
 * What the map offers a truck that has just arrived (owner 2026-11-03, from the increment package): the one
 * nearby place the player's state calls for — fuel for a low tank, a service for a worn truck, a rest for a long
 * day, a company when there is no job to head for — or, standing at the route's own end, every place of those
 * kinds around, so the driver picks where to stop.
 *
 * Kept apart from the card that draws it (ArrivalCard.tsx), as the choice is what is worth testing: the card
 * only asks this what to show, and sends the chosen place to the game's GPS.
 */

/** How far a recommendation looks: 30 km, about half an hour of detour for a truck. */
export const RECOMMEND_RANGE = 30_000

/** Standing at the destination: how wide the list offered there reaches, 10 km. */
export const NEAR_RANGE = 10_000

/** How close a place has to be to the route's end to be taken for it, metres. */
export const SAME_PLACE = 250

/** A tank that may not reach the next town (the package's figure): below this many km, the card offers fuel. */
export const LOW_RANGE_KM = 250

/** Wear past this (0..1, a third of the way worn) is worth a service. */
export const WORN = 0.3

/** Less than this (in-game minutes) to the forced rest is worth finding a parking for. */
export const SHORT_REST_MINUTES = 180

/** Why the card offers what it does: a line of its own (`text.nearby.reason.*`). */
export type ArrivalReason = 'fuel' | 'service' | 'rest' | 'company'

/** The player's state the choice follows, as the card reads it from the live store. */
export interface ArrivalState {
  /** How far the tank reaches, km. */
  fuelRange: number
  /** The worst wear the game reported, 0 (as new) to 1; `null` when it answered for no channel. */
  wear: number | null
  /** Whether the game said how long until the forced rest, and how long that is, in-game minutes. */
  restStopKnown: boolean
  restStopMinutes: number
  /** Whether a job is on: with none, the truck is free to take one up, and a company is where they are. */
  job: boolean
}

/** What the player's state calls for: the kinds of place to look for, and why. */
export interface ArrivalPick {
  reason: ArrivalReason
  /** In the order preferred (`rest` is a parking first, a hotel when there is none). */
  kinds: readonly DestinationKind[]
}

/**
 * The first thing the player's state calls for, in the card's order: fuel before a service, a service before a
 * rest, and a company only when there is no job to head for (the package's table). Fuel, wear and rest are what
 * stops the truck; a company is what it does next. `null` when nothing is worth suggesting.
 */
export function arrivalPick(state: ArrivalState): ArrivalPick | null {
  if (state.fuelRange < LOW_RANGE_KM) return { reason: 'fuel', kinds: ['fuel'] }
  if (state.wear !== null && state.wear > WORN) return { reason: 'service', kinds: ['service'] }
  if (state.restStopKnown && state.restStopMinutes < SHORT_REST_MINUTES) {
    return { reason: 'rest', kinds: ['parking', 'hotel'] }
  }
  if (!state.job) return { reason: 'company', kinds: ['company'] }
  return null
}

/** A place offered, and how far away it is, metres. */
export interface ArrivalRow {
  place: Destination
  metres: number
}

/** The nearest place of `kinds` within `max` metres of `from`, with its distance; `null` when none is that close. */
export function nearestOfKinds(
  places: readonly Destination[],
  kinds: readonly DestinationKind[],
  from: [number, number],
  max: number,
): ArrivalRow | null {
  let best: ArrivalRow | null = null
  for (const place of places) {
    if (!kinds.includes(place.kind)) continue
    const metres = distanceTo(place, from)
    if (metres > max) continue
    if (!best || metres < best.metres) best = { place, metres }
  }
  return best
}

/** Every place of `kinds` within `max` metres of `from`, nearest first. */
export function placesOfKinds(
  places: readonly Destination[],
  kinds: readonly DestinationKind[],
  from: [number, number],
  max: number,
): ArrivalRow[] {
  return places
    .filter((place) => kinds.includes(place.kind))
    .map((place) => ({ place, metres: distanceTo(place, from) }))
    .filter((row) => row.metres <= max)
    .sort((a, b) => a.metres - b.metres)
}

/** What the card shows: why, and the places it offers, nearest first. */
export interface ArrivalSuggestion {
  reason: ArrivalReason
  rows: ArrivalRow[]
}

/**
 * What the arrival card shows: the nearest place of the kinds the player's state calls for, within 30 km, as one
 * row. If that place is the route's own end — the truck is already there (`atDestination`: the game's
 * `navigationDistance` under 250 m), or the place itself stands within 250 m of `destination` — then the place is
 * where the truck is, and the card offers every place of those kinds within 10 km instead, nearest first.
 *
 * `from` and `destination` are lng/lat, as the map's places are (projection.ts). `null` when there is nothing to
 * offer: no data, or nothing of that kind close enough.
 */
export function arrivalSuggestion(
  places: readonly Destination[],
  from: [number, number] | null,
  state: ArrivalState,
  destination: [number, number] | null,
  atDestination: boolean,
): ArrivalSuggestion | null {
  const pick = arrivalPick(state)
  if (!pick || !from) return null
  const nearest = nearestOfKinds(places, pick.kinds, from, RECOMMEND_RANGE)
  if (!nearest) return null
  const atEnd = atDestination || (destination !== null && distanceTo(nearest.place, destination) <= SAME_PLACE)
  return { reason: pick.reason, rows: atEnd ? placesOfKinds(places, pick.kinds, from, NEAR_RANGE) : [nearest] }
}

/**
 * Whether the game's GPS has a navigation point planned — a route with a destination in it. The card keeps away
 * while there is one (owner 2026-11-03: “让地图有导航点时不显示附近推荐”): a truck that is heading somewhere
 * needs no suggestion, and the map's corner is the route's own to show. With no destination — a delivery handed
 * over, a route ended — the truck is free to pick a place, and the card is there for it.
 */
export function hasDestination(route: { nodes: readonly unknown[] } | null): boolean {
  return route !== null && route.nodes.length > 0
}

/** A distance as the card's rows say it: "3.4 km" within ten, whole kilometres past it (the decimal separator
 * as the language writes it). */
export function distanceKm(metres: number, decimal = '.'): string {
  const km = metres / 1000
  return `${(km < 10 ? km.toFixed(1) : String(Math.round(km))).replace('.', decimal)} km`
}
