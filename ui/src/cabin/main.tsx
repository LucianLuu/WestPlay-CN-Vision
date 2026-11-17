import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/inter'
// The YouTube app's type, as YouTube's own.
import '@fontsource-variable/roboto'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CabinApp } from './CabinApp'
import { installDemo } from './demo'
import { installSeaProtocol } from './maps/seaProtocol'
import { Recovery } from './shell/Recovery'
import { useCabin, useLive } from './state/store'
import './shell/shell.css'
import './shell/apple.css'

// Development builds expose the stores for console debugging and browser previews (`westplay.cabin`).
if (import.meta.env.DEV) {
  Object.assign(window, { westplay: { cabin: useCabin, live: useLive } })
}

// MapLibre must know the scheme the map's open-sea tiles are named by (`westplay-sea://`, see
// maps/seaTiles.ts) before any map asks for one: a map that lists them, with the scheme unregistered,
// loses its whole tile source — the land, the water, the roads, the signs and the places with it (no
// place icons and no road numbers, a player's report, 2026-11-15). Registered here, in this page's own
// bundle, so no bundling choice can leave it out.
installSeaProtocol()

installDemo()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recovery>
      <CabinApp />
    </Recovery>
  </StrictMode>,
)
