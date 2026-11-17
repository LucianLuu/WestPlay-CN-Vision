import { useState } from 'react'
import { formatGear, roadSpeed } from '../../shared/format'
import { hitched } from '../apps/vehicle/vehicle'
import { useLive } from '../state/store'
import { type Strings, useText } from '../state/text'
import { type ReverseLayout, layoutShows, REVERSE_LAYOUTS, useReverseLayout } from './layout'

/**
 * The bar over the reversing camera's picture (FIXES §35, §91): the gear the truck is in, its speed, the view
 * shown, the trailer it pulls, and the gear that opens the layouts.
 *
 * A piece of its own rather than the camera's, because the camera is not always one thing: the drawings
 * (`ReverseCamera.tsx`) keep the bar in the page, and the game's own picture (`ReverseOver.tsx`) keeps it while
 * the page itself has stepped aside — a page out of sight takes its children with it, so the bar is drawn beside
 * it there. One bar, whether the picture behind is drawn or the game's.
 */
export function ReverseBar() {
  const text = useText()
  const live = useLive()
  const [menu, setMenu] = useState(false)
  const layout = useReverseLayout((state) => state.layout)
  const chooseLayout = useReverseLayout((state) => state.choose)
  const telemetry = live.telemetry
  const named = live.trailer?.name || live.trailer?.brand || ''
  const pulling = hitched(telemetry, live.trailer)
  const { main } = layoutShows(layout)
  // What it shows, or the game's own camera; `both` has no one view to name, so it says both.
  const name =
    layout === 'live'
      ? text.reverseCamera.live
      : layout === 'both'
        ? text.reverseCamera.both
        : main === 'roof'
          ? text.reverseCamera.roof
          : text.reverseCamera.rear
  return (
    <>
      <div className="rev-bar">
        <span className="rev-gear">{formatGear(telemetry?.displayedGear ?? 0)}</span>
        <span className="rev-speed">{roadSpeed(telemetry?.speed ?? 0)} km/h</span>
        <span className="rev-name">{name}</span>
        <span className="rev-trailer">
          {named || (pulling ? text.reverseCamera.trailer : text.reverseCamera.noTrailer)}
        </span>
        <button
          type="button"
          className="rev-settings"
          aria-label={text.reverseCamera.settings}
          aria-expanded={menu}
          onClick={() => setMenu((open) => !open)}
        >
          <GearGlyph />
        </button>
      </div>
      {menu && (
        <div className="rev-menu" role="group" aria-label={text.reverseCamera.settings}>
          {REVERSE_LAYOUTS.map((one) => (
            <button
              key={one}
              type="button"
              aria-pressed={one === layout}
              onClick={() => {
                chooseLayout(one)
                setMenu(false)
              }}
            >
              <span className="rev-menu-name">{menuName(one, text)}</span>
              {one === layout && <CheckGlyph />}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/** A layout's name in the menu (`text.reverseCamera.*`). */
function menuName(layout: ReverseLayout, text: Strings): string {
  switch (layout) {
    case 'live':
      return text.reverseCamera.live
    case 'both':
      return text.reverseCamera.both
    case 'rear':
      return text.reverseCamera.layoutRear
    case 'roof':
      return text.reverseCamera.layoutRoof
    case 'rearPip':
      return text.reverseCamera.layoutRearPip
    case 'roofPip':
      return text.reverseCamera.layoutRoofPip
  }
}

/** A cog, for the settings button. */
function GearGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.4 12.9c.06-.3.1-.6.1-.9s-.04-.6-.1-.9l2-1.5-2-3.4-2.3.9a7.3 7.3 0 0 0-1.6-.9L15.1 4h-4l-.4 2.2a7.3 7.3 0 0 0-1.6.9l-2.3-.9-2 3.4 2 1.5c-.06.3-.1.6-.1.9s.04.6.1.9l-2 1.5 2 3.4 2.3-.9c.5.4 1 .7 1.6.9l.4 2.2h4l.4-2.2c.6-.2 1.1-.5 1.6-.9l2.3.9 2-3.4Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

/** The tick beside the layout chosen. */
function CheckGlyph() {
  return (
    <svg className="rev-menu-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}
