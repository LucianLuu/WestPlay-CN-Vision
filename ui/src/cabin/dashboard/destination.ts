import { type ClockStyle, formatGameTime, formatTimeLeft, formatTripDistance, formatTripTime, HOURS_24 } from '../../shared/format'
import { cabClock, type JobInfo, type Telemetry } from '../../shared/host'
import type { MapLabel } from '../maps/mapData'
import { metresBetween, toLngLat } from '../maps/projection'
import type { Point } from '../maps/route'
import type { Strings } from '../state/strings'
import { cityName, companyName } from './placeNames'

/**
 * Where the truck is headed, for the Dashboard's destination widget: the job (its pickup, then its
 * delivery, as the game reports it: companies and cities in the game's language), or else where the game's
 * route ends (a point the player put on the map: named after the nearest city), or nothing.
 */
export interface DestinationView {
  /** What it is: "Delivery", "Pickup", "Destination". */
  kicker: string
  title: string
  /** The city under a company's name. */
  subtitle: string | null
  /** The deadline and distance, the cargo, or the arrival and distance. */
  detail: string
  /** Past the delivery deadline. */
  late: boolean
}

/** A day of the week (day 0 is a Monday) and the time (by the clock's `style`), or only the time if it's today. */
export function formatDeadline(
  deadline: number,
  now: number,
  days: readonly string[],
  style: ClockStyle = HOURS_24,
): string {
  const time = formatGameTime(deadline, style)
  return Math.floor(deadline / 1440) === Math.floor(now / 1440)
    ? time
    : `${days[Math.floor(deadline / 1440) % 7]} ${time}`
}

/** The city nearest `at` (game metres), named in the player's language as the map has it; `null` without any. */
export function nearestCity(at: Point, labels: readonly MapLabel[]): string | null {
  const target = toLngLat(at[0], at[1])
  let best: { label: MapLabel; distance: number } | null = null
  for (const label of labels) {
    if (label.kind !== 'city') continue
    const distance = metresBetween(target, label.at)
    if (!best || distance < best.distance) best = { label, distance }
  }
  // The map's own name is the place's (Paris, Kraków); `localized` is the player's (巴黎, 克拉科夫), which is
  // what the cabin, in the player's language, shows.
  return best ? best.label.localized || best.label.name : null
}

export function destinationView(
  job: JobInfo | null,
  routeEnd: Point | null,
  telemetry: Telemetry | null,
  labels: readonly MapLabel[],
  text: Strings,
  clockShift: number,
  clock: ClockStyle = HOURS_24,
  mph = false,
): DestinationView | null {
  // Late or not by the player's own time, as the job's; shown by the cab's clock (a Convoy session's, in
  // the time zone where the truck is: `cabClock`).
  const now = telemetry?.gameTime ?? 0
  const cab = telemetry ? cabClock(telemetry, clockShift) : 0
  const routeLeft = telemetry && telemetry.navigationDistance > 0 ? telemetry.navigationDistance : null
  if (job) {
    if (!job.cargoLoaded) {
      const tonnes = (job.cargoMass / 1000).toFixed(1).replace('.', text.decimal)
      const city = cityName(job.sourceCity, labels)
      return {
        kicker: text.pickup,
        title: companyName(job.sourceCompany) || city,
        subtitle: job.sourceCompany ? city : null,
        detail: job.cargo ? `${job.cargo} · ${tonnes} t` : `${tonnes} t`,
        late: false,
      }
    }
    const distance =
      routeLeft !== null
        ? formatTripDistance(routeLeft, text.decimal, mph)
        : mph
          ? `${Math.round((job.plannedDistanceKm * 1000) / 1609.344)} mi`
          : `${job.plannedDistanceKm} km`
    const late = job.deliveryTime > 0 && now > job.deliveryTime
    // The time left, not the hour it is due (owner 2026-11-02, FIXES §70): "剩余 27 小时 · 312 km". A duration,
    // so the cab clock's time zone plays no part in it — only the game's own time, as the job's is.
    const deadline =
      job.deliveryTime > 0
        ? late
          ? text.late
          : text.jobLeft(formatTimeLeft(job.deliveryTime - now, text))
        : null
    const city = cityName(job.destinationCity, labels)
    return {
      kicker: text.delivery,
      title: companyName(job.destinationCompany) || city,
      subtitle: job.destinationCompany ? city : null,
      detail: deadline ? `${deadline} · ${distance}` : distance,
      late,
    }
  }
  if (routeEnd && telemetry && routeLeft !== null) {
    const minutes = telemetry.navigationTime / 60
    return {
      kicker: text.destination,
      title: nearestCity(routeEnd, labels) ?? text.mapPoint,
      subtitle: null,
      detail: `${formatGameTime(Math.round(cab + minutes), clock)} ${text.arrival} · ${formatTripTime(minutes, text)}`,
      late: false,
    }
  }
  return null
}
