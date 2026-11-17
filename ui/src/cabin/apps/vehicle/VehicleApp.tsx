import type { Strings } from '../../state/strings'
import { useLive } from '../../state/store'
import { useText } from '../../state/text'
import {
  adblue,
  airPressure,
  cargoWear,
  damaged,
  fuel,
  hitched,
  odometer,
  overallWear,
  percent,
  severity,
  trailerWear,
  truckWear,
  waterTemperature,
} from './vehicle'
import { TruckDiagram } from './TruckDiagram'
import './vehicle.css'

/**
 * The Vehicle app: the truck's own condition from the game's telemetry, laid out as a car's trip computer —
 * the truck at the left, drawn from above with each part coloured by how worn the game says it is, over the
 * four readings (fuel, brake air, AdBlue, coolant); at the right its fuel tank and how far that goes, the rest
 * the game counts down to, and its condition as a whole.
 *
 * Everything goes through the game (`truck.wear.*`, `truck.fuel.*`, `truck.adblue`,
 * `truck.brake.air.pressure`, `truck.water.temperature`, `rest.stop`): nothing is modelled here, and a channel
 * the game hasn't reads "—" rather than a 0 the app made up.
 */
export function VehicleApp() {
  const text = useText()
  const labels = text.vehicleApp
  const telemetry = useLive((state) => state.telemetry)
  const truck = useLive((state) => state.truck)
  const trailer = useLive((state) => state.trailer)
  const job = useLive((state) => state.job)
  const fatigue = useLive((state) => state.fatigueSimulation)
  const mph = useLive((state) => state.mph)

  if (!telemetry || !truck) {
    return (
      <section className="app-panel vehicle-app" aria-label={text.apps.vehicle}>
        <p className="veh-waiting">{labels.unavailable}</p>
      </section>
    )
  }

  const attached = hitched(telemetry, trailer)
  const truckName = [truck.brand, truck.name].filter((part) => part !== '').join(' ') || truck.id
  const trailerName = [trailer?.brand, trailer?.name].filter((part) => part).join(' ') || trailer?.id || ''
  const fuelState = fuel(telemetry, truck)
  const adblueState = adblue(telemetry, truck)
  const air = airPressure(telemetry)
  const coolant = waterTemperature(telemetry)
  const driven = odometer(telemetry)
  const overall = overallWear(telemetry)
  const faults = damaged(telemetry).length
  // The game's own countdown, when its fatigue simulation is on and it has said how long there is
  // (RestTicker, dashboard): with the simulation off the game sends none, and there's nothing to count.
  const rest = fatigue && telemetry.restStopKnown ? (telemetry.restStopMinutes ?? 0) : null
  const cargo = job?.cargoLoaded ? cargoWear(telemetry) : null

  return (
    <section className="app-panel vehicle-app" aria-label={text.apps.vehicle}>
      <div className="veh-column veh-main">
        <div className="veh-card veh-status-card">
          <h2 className="veh-kicker">{labels.truck}</h2>
          <p className="veh-status-head">
            <span className={`veh-check ${faults === 0 ? 'good' : 'warn'}`} aria-hidden>
              {faults === 0 ? '✓' : '!'}
            </span>
            <span className={`veh-statusword ${faults === 0 ? 'good' : 'warn'}`}>
              {faults === 0 ? labels.allNormal : labels.faults(faults)}
            </span>
          </p>
          <TruckDiagram truck={truck} label={labels.truckDiagram} />
          <p className="veh-caption">
            <span className="veh-caption-brand">{truckName}</span>
            {attached && trailerName ? <span className="veh-caption-trailer">{trailerName}</span> : null}
          </p>
        </div>
        <ul className="veh-readings">
          <Reading
            name={labels.fuel}
            value={`${number(fuelState.value, text.decimal)} L`}
            hint={shareText(fuelState.share)}
          />
          <Reading name={labels.airPressure} value={air === null ? '—' : `${number(air, text.decimal, 0)} psi`} />
          <Reading
            name={labels.adblue}
            value={adblueState.value === null ? '—' : `${number(adblueState.value, text.decimal, 0)} L`}
            hint={shareText(adblueState.share)}
          />
          <Reading
            name={labels.temperature}
            value={coolant === null ? '—' : `${number(coolant, text.decimal, 0)} °C`}
          />
        </ul>
      </div>
      <div className="veh-column veh-side">
        <div className="veh-card veh-fuel-card">
          <Gauge share={fuelState.share} label={labels.fuel} />
          <div className="veh-fuel-figures">
            <p className="veh-fuel-amount">
              {number(fuelState.value, text.decimal)}
              <span className="veh-unit"> L</span>
            </p>
            <p className="veh-fuel-range">{labels.fuelRange(distance(telemetry.fuelRange, text, mph))}</p>
            {fuelState.share === null ? null : (
              <p className="veh-fuel-share">
                {`${percent(fuelState.share)}%`}
                {(truck.fuelCapacity ?? 0) > 0 ? (
                  <span className="veh-fuel-tank">{` · ${number(truck.fuelCapacity ?? 0, text.decimal, 0)} L`}</span>
                ) : null}
              </p>
            )}
          </div>
        </div>
        <div className="veh-card veh-rest-card">
          <h2 className="veh-kicker">{labels.rest}</h2>
          {rest === null ? (
            <p className="veh-rest-off">{labels.restOff}</p>
          ) : (
            <p className="veh-rest-figures">
              <span className="veh-rest-clock">{clockText(rest)}</span>
              <span className="veh-rest-word">{labels.restIn}</span>
            </p>
          )}
        </div>
        {cargo === null ? null : (
          <div className="veh-card veh-cargo-card">
            <h2 className="veh-kicker">{labels.cargo}</h2>
            <p className="veh-cargo-name">{job?.cargo}</p>
            <p className="veh-cargo-mass">{labels.damage(percent(cargo))}</p>
          </div>
        )}
        <div className="veh-card veh-overall-card">
          <h2 className="veh-kicker">{labels.overall}</h2>
          <p className={`veh-overall ${overall === null ? 'unknown' : severity(overall)}`}>
            {overall === null ? '—' : overall > 0 ? labels.damage(percent(overall)) : labels.likeNew}
          </p>
          {driven === null ? null : (
            <p className="veh-odometer">{`${labels.odometer} · ${number(driven, text.decimal, 0)} km`}</p>
          )}
        </div>
        <div className="veh-card veh-conditions-card">
          <h2 className="veh-kicker">{labels.condition}</h2>
          <ul className="veh-conditions">
            {truckWear(telemetry).map((wear) => (
              <Condition key={wear.part} label={labels[wear.part]} wear={wear.wear} text={text} />
            ))}
          </ul>
          {attached ? (
            <>
              <h3 className="veh-kicker veh-conditions-kicker">{labels.trailer}</h3>
              <ul className="veh-conditions">
                {trailerWear(telemetry).map((wear) => (
                  <Condition key={wear.part} label={labels[wear.part]} wear={wear.wear} text={text} />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/** One part's row in the condition card: its name, its damage, and a bar filled by how worn it is. */
function Condition({ label, wear, text }: { label: string; wear: number | null; text: Strings }) {
  const labels = text.vehicleApp
  return (
    <li className={`veh-condition ${wear === null ? 'unknown' : severity(wear)}`}>
      <span className="veh-condition-name">{label}</span>
      <span className="veh-condition-value">
        {wear === null ? '—' : wear > 0 ? labels.damage(percent(wear)) : labels.likeNew}
      </span>
      <span className="veh-condition-bar" aria-hidden>
        <span style={{ width: `${Math.max(wear === null ? 0 : 3, (wear ?? 0) * 100)}%` }} />
      </span>
    </li>
  )
}

/** One of the four readings under the truck: its name, its figure, and its share of the tank when it has one. */
function Reading({ name, value, hint }: { name: string; value: string; hint?: string | null }) {
  return (
    <li className="veh-reading">
      <span className="veh-reading-name">{name}</span>
      <span className="veh-reading-value">{value}</span>
      {hint ? <span className="veh-reading-hint">{hint}</span> : null}
    </li>
  )
}

/** The fuel tank as a half ring, as a car's own fuel gauge draws it: the share left filled, the rest a track. */
function Gauge({ share, label }: { share: number | null; label: string }) {
  const fill = share ?? 0
  // A half circle of radius 50 in a 120x70 box: from the left end (10, 60) round to the right (110, 60).
  const half = Math.PI * 50
  return (
    <svg className="veh-gauge" viewBox="0 0 120 74" role="img" aria-label={label}>
      <path className="veh-gauge-track" d="M10 60 A50 50 0 0 1 110 60" />
      <path
        className={`veh-gauge-fill ${share === null ? 'unknown' : severity(1 - fill)}`}
        d="M10 60 A50 50 0 0 1 110 60"
        strokeDasharray={`${half * fill} ${half}`}
      />
    </svg>
  )
}

/** A share of a tank as the readings write it: "82%", or nothing when the game gave no capacity. */
function shareText(share: number | null): string | null {
  return share === null ? null : `${percent(share)}%`
}

/** A number with the language's decimal separator, and `places` decimals (none when it has none to give). */
function number(value: number | null, decimal: string, places = 1): string {
  if (value === null) return '—'
  return value.toFixed(places).replace('.', decimal)
}

/** A distance in the player's units: kilometres, or miles where the profile is in miles. */
function distance(km: number, text: Strings, mph: boolean): string {
  if (!Number.isFinite(km) || km <= 0) return '—'
  return mph ? `${number(km / 1.609344, text.decimal, 0)} mi` : `${number(km, text.decimal, 0)} km`
}

/** Minutes until the forced rest, as a clock reads it: "8:59". */
function clockText(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
