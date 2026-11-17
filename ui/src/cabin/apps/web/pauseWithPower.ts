import { useCabin } from '../../state/store'
import { type WebAppSite, logToHost } from '../../../shared/host'
import { poweredOff, poweredOn } from '../youtube/withGame'
import { command, useWebApp } from './webapp'

/**
 * What to do with the page's sound as the truck's electrics switch: the music stops the moment the electrics go
 * off, and nothing plays while they're off (the screen is dark; CarPlay is gone). Coming back, what WestPlay
 * stopped plays on again by itself — as the cab's players do (`apps/musicWithGame.ts`; the owner asked for it,
 * 2026-10-31).
 */
export function powerAction(wasOff: boolean, off: boolean, playing: boolean): 'pause' | null {
  return poweredOff(wasOff, off) && playing ? 'pause' : null
}

/** How long after telling a page to play its own word is looked at, before it's told again. */
const RESUME_CHECK = 1600

/**
 * Whether the page plays on by itself as the electrics come back: every site's does, Bilibili's doesn't — a
 * video starting again by itself isn't wanted there (the owner asked for every app **but** that one).
 */
export function playsOnWithPower(site: WebAppSite | null): boolean {
  return site !== 'bilibili'
}

/** Whether the truck's electrics are off (as seen: not before the first telemetry says so). */
function isOff(): boolean {
  const { power } = useCabin.getState()
  return power.observed && power.phase === 'off'
}

/** Whether the page plays now, as it last said (`webAppMedia`). */
function playing(): boolean {
  return useWebApp.getState().media?.playing === true
}

/** Pauses the page where it plays: `playPause` is the page's own button, a toggle. */
function pauseHere(): void {
  if (playing()) command({ action: 'playPause' })
}

/**
 * The web app with the truck, as the cab's own players are (apps/musicWithGame.ts): what its page plays stops
 * the moment the electrics go off, and nothing plays while they're off — a page that starts playing then is
 * paused as it starts. Coming back, what WestPlay stopped plays on again, except on Bilibili
 * (`playsOnWithPower`).
 *
 * Mounted for the cabin's whole life (CabinApp.tsx), not with the app's screen: the page keeps playing while
 * the player is elsewhere (the dashboard's Now Playing), so tracking the power there would miss it.
 */
export function pauseWebAppWithPower(): () => void {
  // WestPlay paused the page for the electrics (or for a page that started playing while they were off): it
  // plays that back on as they come back.
  let pausedByPower = false
  // The look that follows a page told to play (and its second telling), so a stop takes it away.
  let waiting: ReturnType<typeof setTimeout> | undefined
  const power = useCabin.subscribe((cabin, before) => {
    const off = cabin.power.phase === 'off'
    const wasOff = before.power.phase === 'off'
    if (powerAction(wasOff, off, playing()) === 'pause') {
      pausedByPower = true
      logToHost(`web app paused with the electrics: ${useWebApp.getState().site}`)
      pauseHere()
      return
    }
    // The electrics are back: play on where WestPlay stopped it — unless the page plays again already (the
    // player started it themselves in the dark: a `playPause` is a toggle, and would stop it instead), or the
    // site is the one left out of it.
    if (poweredOn(wasOff, off) && pausedByPower) {
      pausedByPower = false
      const site = useWebApp.getState().site
      if (!playsOnWithPower(site)) {
        logToHost(`web app with the electrics back: ${site} left as it is`)
        return
      }
      // Told to play, whatever the page says: a page can say nothing at all of what it plays (QQ Music's home
      // page names none of it — its card stays as it was, and asking it whether it played held the resume back:
      // owner 2026-11-02). What WestPlay stopped is WestPlay's to start again; a page the player started in the
      // dark is paused as it starts (the `dark` watch above), so there's nothing of theirs this undoes.
      logToHost(`web app with the electrics back: ${site} plays on`)
      command({ action: 'playPause' })
      // Told once more only where the page reports of itself and says it didn't come back: a press a player left
      // unanswered (its own player still loading), or a browser holding the sound back. A page that says nothing
      // of itself has no word to trust, and asking twice would stop what the first telling started.
      clearTimeout(waiting)
      waiting = setTimeout(() => {
        waiting = undefined
        const now = useWebApp.getState().media
        if (now === null || now.playing === true) return
        logToHost(`web app with the electrics back: ${site} hadn't come back: told again`)
        command({ action: 'playPause' })
      }, RESUME_CHECK)
    }
  })
  // Nothing plays while they're off: a page that starts playing then is paused as it starts.
  const dark = useWebApp.subscribe((now, before) => {
    if (!isOff() || now.media?.playing !== true || before.media?.playing === true) return
    pausedByPower = true
    logToHost(`web app paused as it started while the electrics are off: ${now.site}`)
    pauseHere()
  })
  return () => {
    clearTimeout(waiting)
    power()
    dark()
  }
}
