import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppIcon, useLook } from '../state/hooks'
import { MapView } from '../dashboard/MapView'
import { type AppId, APPS } from '../state/apps'
import { useLaunchStyle, whenTransitionEnds } from '../state/launch'
import { CalendarApp } from './calendar/CalendarApp'
import { useLanguage, useText } from '../state/text'
import { isCopied, noteOpened, openedBefore, saveCopy, savedCopy } from './launchCopies'
import { MusicApp } from './music/MusicApp'
import { KugouApp } from './kugou/KugouApp'
import { NeteaseApp } from './netease/NeteaseApp'
import { QqApp } from './qq/QqApp'
import { PlayerApp } from './player/PlayerApp'
import { RadioApp } from './radio/RadioApp'
import { SafariApp } from './safari/SafariApp'
import { SettingsApp } from './settings/SettingsApp'
import { WebApp } from './web/WebAppScreen'
import { YouTubeApp } from './youtube/YouTubeApp'
import { setDark, setSite } from './youtube/youtube'
import { VehicleApp } from './vehicle/VehicleApp'
import { WeatherApp } from './weather/WeatherApp'
import './apps.css'

/**
 * An open app: its window, which grows out of the icon that opened it and shrinks back into its Home icon
 * (state/launch.ts). Like CarPlay's, app windows are opaque: the wallpaper belongs to Home and the
 * Dashboard. Each app replaces its placeholder as it is built (M4-M6).
 *
 * A heavy app the player opens for the first time since the page loaded (apps/launchCopies.ts) first shows
 * its saved launch copy, static: the window
 * grows out of the icon with that, nothing to build in the frame it starts. Once the window has opened, the
 * real app is built (in slices) and takes the copy's place; its first frame, as the player sees it (signed
 * in or not, their language and appearance), is saved as the copy for the next opening.
 */
export function AppScreen({ app }: { app: AppId }) {
  const launch = useLaunchStyle(app, { kind: 'window' })
  const language = useLanguage()
  // Its first opening since the page loaded: the cold one, through the copy.
  const [first] = useState(() => isCopied(app) && !openedBefore(app))
  const [copy] = useState(() => (first ? savedCopy(app, language) : null))
  const [live, setLive] = useState(copy === null)
  // The real app's first frame at a first opening (cold: its own loading looks, signed in or not), saved as
  // the next first opening's copy, before it's drawn: what's saved is what replaces the copy. (A copy built
  // apart showed the signed-out app; one saved at a later opening held its content: owner 2026-10-21.)
  const appWindow = useRef<HTMLDivElement>(null)
  const saved = useRef(false)
  useLayoutEffect(() => {
    if (!live || saved.current || !first) return
    saved.current = true
    noteOpened(app)
    const markup = appWindow.current?.innerHTML
    if (markup) saveCopy(app, language, markup)
  }, [live, first, app, language])
  useEffect(() => {
    if (live) return
    let gone = false
    whenTransitionEnds(() => {
      if (!gone) startTransition(() => setLive(true))
    })
    return () => {
      gone = true
    }
  }, [live])
  if (!live && copy !== null) {
    // The copy: markup this page saved from its own app, shown as it was (no script in it).
    return (
      <div ref={appWindow} className="screen app-window" style={launch} dangerouslySetInnerHTML={{ __html: copy }} />
    )
  }
  return (
    <div ref={appWindow} className="screen app-window" style={launch}>
      <AppContent app={app} />
    </div>
  )
}

function AppContent({ app }: { app: AppId }) {
  const text = useText()
  switch (app) {
    case 'maps':
      return (
        <section className="app-panel maps-app" aria-label={text.apps.maps}>
          <MapView interactive />
        </section>
      )
    // Apple Music's own player, as WestPlay shipped it (westplay_host::apple_music).
    case 'music':
      return <MusicApp />
    // The sites, whole, in the host's WebView under this page: NetEase Cloud Music, Bilibili, QQ Music,
    // Douyin and Kugou Music (apps/web, westplay_host::webapp). Each keeps the id of the app it
    // stands in for (the older app's slot, its icon and its name being the site's now).
    case 'spotify':
      // NetEase Cloud Music, drawn by the page itself (`apps/netease`): a self-drawn app over the
    // local layer the app starts, in the slot Spotify used to have (as the site had).
    return <NeteaseApp />
    case 'youtube':
      // Bilibili, drawn by YouTube's own app: its page, its search, its player controls. What
      // answers it is Bilibili (crates/host bilibili.rs), whose page is hidden behind this one, as
      // YouTube's is for YouTube.
      return <BilibiliApp />
    case 'youtubeMusic':
      // QQ Music's own player (crates/host qq_music.rs, ui/src/cabin/apps/qq): WestPlay's drawn shell
      // over a hidden page of the middle layer's own data.
      return <QqApp />
    case 'douyin':
      return <WebApp site="douyin" />
    case 'kugou':
      // KuGou Music, drawn by the page itself (`apps/kugou`): NetEase's own pattern — a self-drawn app over
      // the local layer (the same layer's kugou routes), its player this page's own `Audio`, its words NetEase's
      // words page. It stood as the site in the host's WebView before.
      return <KugouApp />
    // The truck's own condition, from the game's telemetry.
    case 'vehicle':
      return <VehicleApp />
    case 'settings':
      return <SettingsApp />
    case 'weather':
      return <WeatherApp />
    case 'calendar':
      return <CalendarApp />
    case 'player':
      return <PlayerApp />
    case 'radio':
      return <RadioApp />
    case 'safari':
      return <SafariApp />
    default:
      return <NotBuiltYet app={app} />
  }
}

/**
 * Bilibili, in YouTube's own app: the same page, the same shelves, the same player controls. Its
 * commands go to Bilibili's hidden page (crates/host `bilibili.rs`) while it's open, and back to
 * YouTube's when it goes: one YouTube app draws both, its two sites told apart by `setSite`.
 */
function BilibiliApp() {
  // The look on the screen (state/hooks.ts `useLook`): Bilibili has no switch of its own, it
  // follows the cab — dark with night falling, light in the day, in `auto` as in the settings.
  const { appearance } = useLook()
  // Set before the first render, so the page draws itself in Bilibili's look from the start (and
  // its commands go to Bilibili's page).
  const [ready] = useState(() => {
    setSite('bilibili')
    setDark(appearance === 'dark')
    return true
  })
  useEffect(() => setDark(appearance === 'dark'), [appearance])
  useEffect(() => () => setSite('youtube'), [])
  return ready ? <YouTubeApp /> : null
}

/**
 * An app not built yet (Phone, Messages: owner 2026-11-03, "this app is not ready yet"): its icon, its name and
 * that it isn't ready. Deliberately plain.
 */
function NotBuiltYet({ app }: { app: AppId }) {
  const text = useText()
  const icon = useAppIcon(APPS[app].icon)
  return (
    <section className="app-panel not-built" aria-label={text.apps[app]}>
      <img src={icon} alt="" />
      <div className="name">{text.apps[app]}</div>
      <div className="note">{text.notBuiltYet}</div>
    </section>
  )
}
