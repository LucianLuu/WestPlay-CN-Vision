import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { formatTimeLeft } from '../../shared/format'
import { reversing } from '../reverse/reverse'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import './map.css'

/** How long each line shows before the next slides in, ms (the pack's "about three seconds"). */
const STEP_MS = 3000

/**
 * The map's ticker (owner 2026-11-03, from the increment package): the line the rest pill showed, then the fuel
 * and what it will still drive — one at a time, each sliding up into the next every few seconds. The pill was
 * one countdown; a driver between rests wants the other numbers too, without a second strip of them over the
 * map. The speed against the limit, and the time left on the job, left it afterwards: the two lines the owner
 * wants there are the rest and the range (owner 2026-11-03, later that day).
 *
 * A line is left out when the game has no data for it (no fatigue simulation, no limit, no job), so a truck
 * with only a tank has a single line, which simply stays. Lines are whole sentences from `text` (the rounding
 * is theirs); the cab's words are never built here.
 *
 * Hidden while reversing: the camera covers the screen there (the pack hid it too, §45).
 */
export function RestTicker() {
  const text = useText()
  const reversingNow = useLive((state) => reversing(state))
  // The lines, in the order the pack showed them. `useShallow`: a new array of the same words is no change.
  const lines = useLive(
    useShallow((state) => {
      const telemetry = state.telemetry
      if (!telemetry) return []
      const shown: string[] = []
      // The game's own countdown to the forced rest (its `rest.stop` channel), only with its fatigue simulation
      // on: with it off nothing is forced and the game needn't say (§69).
      if (state.fatigueSimulation && telemetry.restStopKnown && typeof telemetry.restStopMinutes === 'number') {
        shown.push(text.restLeft(formatTimeLeft(telemetry.restStopMinutes, text)))
      }
      shown.push(text.ticker.fuel(telemetry.fuel, telemetry.fuelRange))
      return shown
    }),
  )
  const [step, setStep] = useState(0)
  useEffect(() => {
    // One line stays put: nothing to slide to.
    if (reversingNow || lines.length <= 1) return
    const timer = setInterval(() => setStep((shown) => shown + 1), STEP_MS)
    return () => clearInterval(timer)
  }, [reversingNow, lines.length])
  if (reversingNow || lines.length === 0) return null
  // The lines never all go away under a step (it keeps counting while one is added), so the index wraps.
  const index = step % lines.length
  // The line shown, and nothing else: the box is the pill's own size, so a line can never be clipped in half
  // by a fixed window (the first drawing did, through the pill's padding). Each step mounts the next line with
  // a key of its own, and the slide-in plays on that mount.
  return (
    <div className="rest-pill rest-ticker glass" aria-live="polite">
      <span key={index} className="rest-ticker-line">
        {lines[index]}
      </span>
    </div>
  )
}
