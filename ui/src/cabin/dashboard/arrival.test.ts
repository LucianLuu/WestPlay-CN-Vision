import { describe, expect, it } from 'vitest'
import type { Destination, DestinationKind } from '../maps/places'
import { METRES_PER_DEGREE } from '../maps/projection'
import { type ArrivalState, arrivalPick, arrivalSuggestion, distanceKm, hasDestination } from './arrival'

/** A place of `kind` `metres` east of the map's origin, named `name` (a map node of its own). */
function place(kind: DestinationKind, metres: number, name: string = kind): Destination {
  return { kind, name, at: [metres / METRES_PER_DEGREE, 0], node: `${kind}:${metres}` }
}

/** A truck with everything in order: a full tank, unworn, rested, on a job. */
function truck(rest: Partial<ArrivalState> = {}): ArrivalState {
  return { fuelRange: 900, wear: null, restStopKnown: false, restStopMinutes: 0, job: true, ...rest }
}

/** Where the truck is, as the places' lng/lat: the origin. */
const here: [number, number] = [0, 0]

describe('the arrival card’s recommendation', () => {
  it('offers by what stops the truck first: fuel, then a service, then a rest, then a company', () => {
    expect(arrivalPick(truck({ fuelRange: 240 }))).toEqual({ reason: 'fuel', kinds: ['fuel'] })
    // A low tank and a worn part both: the fuel is what stops the truck first.
    expect(arrivalPick(truck({ fuelRange: 240, wear: 0.6, job: false }))?.reason).toBe('fuel')
    expect(arrivalPick(truck({ wear: 0.4 }))).toEqual({ reason: 'service', kinds: ['service'] })
    expect(arrivalPick(truck({ restStopKnown: true, restStopMinutes: 120 }))).toEqual({
      reason: 'rest',
      kinds: ['parking', 'hotel'],
    })
    // With no job, everything else in order: a company, where the next job is.
    expect(arrivalPick(truck({ job: false }))).toEqual({ reason: 'company', kinds: ['company'] })
  })

  it('takes the state as it is: a fifth of a tank left, unworn, a night to rest, or on a job', () => {
    // 250 km is not low, 0.30 wear is not worn, 180 minutes is not short.
    expect(arrivalPick(truck({ fuelRange: 250, wear: 0.3, restStopKnown: true, restStopMinutes: 180 }))).toBeNull()
    // Just past each line, the next thing is offered.
    expect(arrivalPick(truck({ fuelRange: 249 }))?.reason).toBe('fuel')
    expect(arrivalPick(truck({ wear: 0.31 }))?.reason).toBe('service')
    expect(arrivalPick(truck({ restStopKnown: true, restStopMinutes: 179 }))?.reason).toBe('rest')
    // A truck whose wear the game didn't report is not a worn one.
    expect(arrivalPick(truck({ wear: null }))).toBeNull()
  })

  it('offers the nearest place of those kinds, and nothing of a kind it did not ask for', () => {
    const places = [place('fuel', 4_000), place('fuel', 1_200, 'near'), place('fuel', 40_000, 'far')]
    const found = arrivalSuggestion(places, here, truck({ fuelRange: 100 }), null, false)
    expect(found?.reason).toBe('fuel')
    expect(found?.rows.map((row) => row.place.name)).toEqual(['near'])
    expect(found?.rows[0].metres).toBeCloseTo(1_200, 3)
    // A parking is not what a low tank calls for.
    expect(arrivalSuggestion([place('parking', 100)], here, truck({ fuelRange: 100 }), null, false)).toBeNull()
  })

  it('offers nothing when the kind asked for is past 30 km', () => {
    expect(arrivalSuggestion([place('fuel', 40_000)], here, truck({ fuelRange: 100 }), null, false)).toBeNull()
    expect(
      arrivalSuggestion([place('company', 29_000, 'close')], here, truck({ job: false }), null, false),
    ).not.toBeNull()
    expect(arrivalSuggestion([place('company', 31_000)], here, truck({ job: false }), null, false)).toBeNull()
  })

  it('lists every place of those kinds around when the pick is the route’s own end', () => {
    const companies = [
      place('company', 500, 'at the end'),
      place('company', 3_000, 'next'),
      place('company', 20_000, 'far'),
    ]
    // Stopped at it (the game counts under 250 m): every company within 10 km, nearest first.
    const there = arrivalSuggestion(companies, here, truck({ job: false }), here, true)
    expect(there?.rows.map((row) => row.place.name)).toEqual(['at the end', 'next'])
    // Not quite there, but the place offered stands at the destination: the same list.
    const within = arrivalSuggestion([place('company', 200, 'at the end')], here, truck({ job: false }), here, false)
    expect(within?.rows.length).toBe(1)
    // The place away from the route's end (10 km east of it): it is the one offered, as usual.
    const away: [number, number] = [10_000 / METRES_PER_DEGREE, 0]
    const elsewhere = arrivalSuggestion(companies, here, truck({ job: false }), away, false)
    expect(elsewhere?.rows.map((row) => row.place.name)).toEqual(['at the end'])
  })

  it('says distances as the rows do: one decimal within ten, whole kilometres past it', () => {
    expect(distanceKm(3_400)).toBe('3.4 km')
    expect(distanceKm(950)).toBe('0.9 km')
    expect(distanceKm(9_500)).toBe('9.5 km')
    expect(distanceKm(12_000)).toBe('12 km')
    expect(distanceKm(3_400, ',')).toBe('3,4 km')
  })
})

describe('the map’s navigation point', () => {
  it('keeps the nearby card away while the game plans a route', () => {
    expect(hasDestination(null)).toBe(false)
    expect(hasDestination({ nodes: [] })).toBe(false)
    expect(hasDestination({ nodes: [{ position: [0, 0] }] })).toBe(true)
  })
})
