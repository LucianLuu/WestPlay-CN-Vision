import { ENGINE, type Telemetry, type TrailerInfo, type TruckInfo, WEAR } from '../../../shared/host'

/** The parts of the truck the game reports wear for (the SDK's `truck.wear.*`), in the app's order. */
export type Part = 'engine' | 'transmission' | 'cab' | 'chassis' | 'wheels'

export interface Wear {
  part: Part
  /** 0 (as new) to 1, or `null` when the game answered not (an older game, or no telemetry yet). */
  wear: number | null
}

/**
 * The truck's wear, part by part: the game's own damage numbers (`truck.wear.*`), which its service screen and
 * its job screen show. A part whose channel the game hasn't is `null` rather than 0: 0 would claim the part is
 * as new.
 */
export function truckWear(telemetry: Telemetry | null): Wear[] {
  const known = telemetry?.wearKnown ?? 0
  return [
    { part: 'engine', wear: known & WEAR.engine ? (telemetry?.wearEngine ?? 0) : null },
    { part: 'transmission', wear: known & WEAR.transmission ? (telemetry?.wearTransmission ?? 0) : null },
    { part: 'cab', wear: known & WEAR.cab ? (telemetry?.wearCab ?? 0) : null },
    { part: 'chassis', wear: known & WEAR.chassis ? (telemetry?.wearChassis ?? 0) : null },
    { part: 'wheels', wear: known & WEAR.wheels ? (telemetry?.wearWheels ?? 0) : null },
  ]
}

/**
 * The trailer's own wear: its chassis and its wheels (`trailer.wear.*`, in the games that have the channels;
 * `null` otherwise). What it carries is the cargo's, below.
 */
export function trailerWear(telemetry: Telemetry | null): Wear[] {
  const known = telemetry?.wearKnown ?? 0
  return [
    { part: 'chassis', wear: known & WEAR.trailerChassis ? (telemetry?.trailerWearChassis ?? 0) : null },
    { part: 'wheels', wear: known & WEAR.trailerWheels ? (telemetry?.trailerWearWheels ?? 0) : null },
  ]
}

/** How damaged the cargo is, 0 (whole) to 1; `null` when the game didn't say (`trailer.cargo.damage`). */
export function cargoWear(telemetry: Telemetry | null): number | null {
  const known = telemetry?.wearKnown ?? 0
  return known & WEAR.cargo ? (telemetry?.cargoDamage ?? 0) : null
}

/** Whether a trailer is hitched: the game's own channel says so, or it named one (a host that sends the
 * configuration but not the channel). */
export function hitched(telemetry: Telemetry | null, trailer: TrailerInfo | null): boolean {
  return telemetry?.trailerConnected === true || (trailer?.id ?? '') !== ''
}

/**
 * A wear as the app writes its damage: whole percents, **floored** — a number is never read as more damage than
 * the game reports (owner 2026-11-03: "损伤值也不用向上取整") — and below one but not none, `<1`.
 *
 * The `1e-9` is not rounding: `0.29 * 100` is 28.999999999999996 in binary, which a bare floor would call 28.
 */
export function percent(wear: number): string {
  const whole = Math.floor(Math.max(0, Math.min(1, wear)) * 100 + 1e-9)
  return whole === 0 && wear > 0 ? '<1' : String(whole)
}

/** How bad a wear reads: green up to a tenth, amber up to a third, red past it. */
export function severity(wear: number): 'good' | 'warn' | 'bad' {
  return wear < 0.1 ? 'good' : wear < 0.3 ? 'warn' : 'bad'
}

/**
 * The truck's body: its parts bar the wheels. Tyres are wear, not the body's damage — the Dashboard's Vehicle
 * status widget says the body's and nothing of the tyres (owner 2026-11-03).
 */
export function bodyWear(telemetry: Telemetry | null): Wear[] {
  return truckWear(telemetry).filter((wear) => wear.part !== 'wheels')
}

/** How damaged the truck's body is, 0 to 1: its worst part, or `null` when the game answered for none of them. */
export function bodyDamage(telemetry: Telemetry | null): number | null {
  return worst(bodyWear(telemetry))
}

/**
 * How damaged the trailer is, 0 to 1: its chassis (its body — its wheels are tyres too, as the truck's are), or
 * `null` when the game hasn't said.
 */
export function trailerDamage(telemetry: Telemetry | null): number | null {
  return worst(trailerWear(telemetry).filter((wear) => wear.part === 'chassis'))
}

/** The worst wear of some parts (the trailer's, say), or `null` when the game answered for none of them. */
export function worst(wears: readonly Wear[]): number | null {
  const known = wears.flatMap((each) => (each.wear === null ? [] : [each.wear]))
  return known.length === 0 ? null : Math.max(...known)
}

/**
 * A gauge's reading for the overview: the value, how full of its tank it is (0..1, `null` when the game gave no
 * capacity), and whether the game answered at all. `value` is `null` when it didn't, so the app writes "—"
 * rather than a 0 it made up.
 */
export interface Reading {
  value: number | null
  /** Of the tank's capacity, 0..1; `null` without a capacity to read it against. */
  share: number | null
}

/** A channel's reading: its value when `bit` is among the answered channels (`known`), else unknown. */
function reading(value: number | undefined, known: number, bit: number): number | null {
  return known & bit ? (value ?? 0) : null
}

/** The brake air tank's pressure in psi (`truck.brake.air.pressure`). */
export function airPressure(telemetry: Telemetry | null): number | null {
  return reading(telemetry?.brakeAirPressure, telemetry?.engineKnown ?? 0, ENGINE.air)
}

/** The AdBlue left, in litres and as a share of its tank (`truck.adblue`, `adblue.capacity`). */
export function adblue(telemetry: Telemetry | null, truck: TruckInfo | null): Reading {
  const value = reading(telemetry?.adblue, telemetry?.engineKnown ?? 0, ENGINE.adblue)
  const capacity = truck?.adblueCapacity ?? 0
  return { value, share: shareOf(value, capacity) }
}

/** The fuel left, in litres and as a share of its tank (`truck.fuel.amount`, `fuel.capacity`; the fuel channel
 * is the one every game has). */
export function fuel(telemetry: Telemetry | null, truck: TruckInfo | null): Reading {
  const value = telemetry ? (telemetry.fuel ?? 0) : null
  return { value, share: shareOf(value, truck?.fuelCapacity ?? 0) }
}

/** The engine's coolant, in degrees Celsius (`truck.water.temperature`). */
export function waterTemperature(telemetry: Telemetry | null): number | null {
  return reading(telemetry?.waterTemperature, telemetry?.engineKnown ?? 0, ENGINE.water)
}

/** The distance the truck has driven, in kilometres (`truck.odometer`). */
export function odometer(telemetry: Telemetry | null): number | null {
  return reading(telemetry?.odometer, telemetry?.engineKnown ?? 0, ENGINE.odometer)
}

/**
 * How much of a tank is left, 0..1: `value` of `capacity`, or `null` when there's no capacity to read it
 * against (an older game, a truck the game gave no tank for). Clamped: the game can read a drop over the brim.
 */
export function shareOf(value: number | null, capacity: number): number | null {
  if (value === null || !(capacity > 0)) return null
  return Math.max(0, Math.min(1, value / capacity))
}

/**
 * How worn the truck is as a whole, 0 (as new) to 1: its worst part, tyres included — the overview's own
 * figure, where the app's condition list has each part. `null` when the game answered for none of them.
 */
export function overallWear(telemetry: Telemetry | null): number | null {
  return worst(truckWear(telemetry))
}

/**
 * The parts the game says are worth a look: a tenth worn or more, the same line `severity` turns amber at. The
 * overview counts them; a part the game didn't answer for is never one of them.
 */
export function damaged(telemetry: Telemetry | null): Wear[] {
  return truckWear(telemetry).filter((wear) => wear.wear !== null && wear.wear >= 0.1)
}
