import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  type Lyrics,
  postToHost,
  type WebAppCommand,
  type WebAppMedia,
  type WebAppSite,
  type WebAppState,
} from '../../../shared/host'
import type { Hole } from '../youtube/youtube'
import type { Typing } from '../../keyboard/store'
import type { AppId } from '../../state/apps'

/**
 * The web app's state: the site its page shows (westplay_host::webapp: Bilibili, QQ Music, NetEase Cloud
 * Music, Qingting FM, Douyin, Kugou Music, each its own whole site in a WebView of its own), that page's own
 * title, where the page shows through the cabin page (the WebApp app cuts itself open there, Shell.tsx), and
 * what it plays.
 */
interface WebAppStore {
  /** The site's page running (`null`: none). */
  site: WebAppSite | null
  /** The page's own `<title>` (empty until it has one). */
  title: string
  /** Whether the page can go back in its history. */
  canGoBack: boolean
  /** A video of the page's in full screen: the app then covers the whole CarPlay area, its bar gone
   * (WebAppScreen.tsx, `.webapp.full-screen`). */
  fullScreen: boolean
  /** Whether the page is on show in the app: it has laid out, and the cabin page cuts itself open for it
   * only then (before that the app window keeps its own background over the room: `useWebAppCover`). */
  shown: boolean
  /** Where the page shows, in the CarPlay area's pixels (`null`: it doesn't). */
  hole: Hole | null
  /** What the page plays (`null`: nothing), for the dashboard's Now Playing. */
  media: WebAppMedia | null
  /** Whether to show it playing, where the cabin pressed play/pause itself: that shows at once, and the page's
   * own word decides from its next report on (`null`: the page's word alone: `shownPlaying`). */
  shownPlaying: boolean | null
  /** The words the page has for what it plays, whole and with when each line is sung (`null`: none), for
   * the lyrics view (`LyricsPage.tsx`). */
  lyrics: Lyrics | null
  /** Where in the song it is (seconds), as the page says: the lyrics view follows it. */
  lyricAt: number
  /** The lyrics view is open (the dashboard's Now Playing, its lyrics button pressed). */
  lyricsOpen: boolean
  /** The page's own sound's volume (0 to 1), as the site's bar or the cabin's slider left it. */
  volume: number
  /** Whether the page's own field has the focus (the cabin's keyboard comes up for it). */
  typing: boolean
  /** That field's text, as the page last said it. */
  text: string
  /** Which selection it is: a number that changes each time a field takes the focus (0: none), so a field
   * clicked again brings the keyboard up again. */
  selection: number
}

/**
 * Sites whose page has drawn at least once in this run (it said its own title). Its page is still there when
 * the app opens again, so nothing flashes: no cover (`useWebAppCover`).
 */
const drawn = new Set<WebAppSite>()

/** Whether `site`'s page has drawn at least once in this run. */
export function pageDrawn(site: WebAppSite): boolean {
  return drawn.has(site)
}

export const useWebApp = create<WebAppStore>(() => ({
  site: null,
  title: '',
  canGoBack: false,
  fullScreen: false,
  shown: false,
  hole: null,
  media: null,
  shownPlaying: null,
  lyrics: null,
  lyricAt: 0,
  lyricsOpen: false,
  volume: 1,
  typing: false,
  text: '',
  selection: 0,
}))

/** The host's word on the page (`webApp` message). */
export function receiveWebApp(state: WebAppState | null): void {
  if (!state) {
    // None running (closed, or its browser failed): nothing shows through the page any more either.
    useWebApp.setState({
      site: null,
      title: '',
      canGoBack: false,
      fullScreen: false,
      shown: false,
      hole: null,
      media: null,
      shownPlaying: null,
      lyrics: null,
      lyricAt: 0,
      // The page itself is gone: nothing to draw its words over any more.
      lyricsOpen: false,
      volume: 1,
      typing: false,
      text: '',
      selection: 0,
    })
    return
  }
  if (state.title) drawn.add(state.site)
  // Another site's page has the window: the field the last one had focused (and the cabin's keyboard that came
  // up for it) belongs to a page that isn't there any more. Opening an app used to bring the keyboard up with
  // it, carried over from whatever app was open before (owner 2026-11-03).
  if (useWebApp.getState().site !== state.site) {
    useWebApp.setState({ typing: false, text: '', selection: 0 })
  }
  useWebApp.setState({
    site: state.site,
    title: state.title,
    canGoBack: state.canGoBack,
    fullScreen: state.fullScreen,
    // A host from before this said nothing of it: its page is on show by the time it's heard of.
    shown: state.shown ?? true,
  })
}

/** The page's own field taking or losing the focus (`webAppTyping` message): the cabin's keyboard comes up for
 * it, and types into it through the host. */
export function receiveWebAppTyping(on: boolean, text: string, selection: number): void {
  useWebApp.setState({ typing: on, text, selection })
}

/**
 * The page's field, as the cabin's keyboard writes into it: what it holds, and the host's word for changing it.
 * The page's own field is a real one (its caret, its autocomplete), so the text goes over whole rather than key
 * by key.
 */
export const webAppField: Typing = {
  id: 'webapp',
  returnKind: 'search',
  // The page's own field takes the player's own keys (the host sends them there), so they don't come through
  // here: only the cabin's keyboard's keys do.
  playerTypes: false,
  read: () => useWebApp.getState().text,
  write: (text) => {
    useWebApp.setState({ text })
    command({ action: 'setText', text })
  },
  // What the cabin's own input method picks goes in at the page's own caret, through the browser itself: a
  // site's field our whole-text write can't reach still takes it (Bilibili's own components, 2026-10-31). The
  // page reports its field's text back as it changes (`typing`), so the state above catches up on its own.
  insert: (text) => command({ action: 'insertText', text }),
  submit: () => command({ action: 'enter' }),
}

/** The host's word on what the page plays (`webAppMedia` message). */
export function receiveWebAppMedia(media: WebAppMedia | null): void {
  useWebApp.setState({ media, shownPlaying: null })
}

/** Whether to show the page playing: what the cabin last pressed, until the page itself says (media.playing). */
export function shownPlaying(state: { media: { playing: boolean } | null; shownPlaying: boolean | null }): boolean {
  return state.shownPlaying ?? state.media?.playing === true
}

/** The host's word on the page's words for what it plays (`webAppLyrics` message): the lyrics view's. Its
 * words gone (another song, or none), the view has nothing to draw and closes. */
export function receiveWebAppLyrics(lyrics: Lyrics | null): void {
  // Its words gone for a moment (the next song's not in yet): the page stays open, its words to come
  // (it's the dashboard's button that closes it, or the page itself going).
  useWebApp.setState(lyrics ? { lyrics } : { lyrics: null, lyricAt: 0 })
}

/** Where in the song the page is (`webAppLyricAt` message): the lyrics view follows it. */
export function receiveWebAppLyricAt(at: number): void {
  useWebApp.setState({ lyricAt: at })
}

/** The page's own sound's volume (`webAppVolume` message), for the lyrics view's slider. */
export function receiveWebAppVolume(volume: number): void {
  useWebApp.setState({ volume })
}

/** The app each site stands in for (apps keep their old ids: navigation's keys). Its label is that app's name
 * in the cabin's language (state/strings.ts); Now Playing opens it, and the bar above the page names it. */
export const APP_OF_SITE: Record<WebAppSite, AppId> = {
  bilibili: 'youtube',
  qqMusic: 'youtubeMusic',
  netease: 'spotify',
  qingting: 'podcasts',
  douyin: 'douyin',
  kugou: 'kugou',
}

/** What the app asks of its site's page. */
/** How long the cabin's own press shows before the page's word (or its silence) has it again. */
const SHOWN_FOR = 2500

/** The look a press leaves: cleared by the page's next report (`receiveWebAppMedia`), or when it says nothing. */
let shownFor: ReturnType<typeof setTimeout> | undefined

export function command(command: WebAppCommand): void {
  // Play/pause: the card and the dashboard's Now Playing show the press at once — QQ Music's own page says so
  // seconds later, and until it does the card would show the pause that just happened as still playing (owner
  // 2026-11-01). The page's own word (`receiveWebAppMedia`) is the last one: this is only until it comes — and a
  // page that never says anything would keep the press for ever, its card the wrong way round for good (owner
  // 2026-11-02: QQ Music's state the opposite of its own control). So it lasts a few seconds at most.
  if (command.action === 'playPause') {
    useWebApp.setState((state) => ({ shownPlaying: !shownPlaying(state) }))
    clearTimeout(shownFor)
    shownFor = setTimeout(() => useWebApp.setState({ shownPlaying: null }), SHOWN_FOR)
  }
  // Another page is about to take the window: what the last one had focused (and the keyboard that came up for
  // it) isn't this one's, so an app doesn't open with the keyboard already up (owner 2026-11-03).
  if (command.action === 'open') useWebApp.setState({ typing: false, text: '', selection: 0 })
  if (!isInHost()) return
  postToHost({ type: 'webApp', command })
}

/**
 * Whether a site's words are a **song's**, which the cabin draws itself, whole, in its lyrics view
 * (`LyricsPage.tsx`; the dashboard's Now Playing, its lyrics button pressed). A video's words or a podcast's
 * aren't: those sites keep their own view of them (owner 2026-10-30). Kugou Music's are a song's too — its own
 * player keeps the whole LRC and hands it over (`webapp.js`, its reader) — which is what the owner asked for
 * when its words weren't on the dashboard's card (2026-11-03).
 * QQ Music's are not — not since the playlist extension's own player became the one playing there
 * (owner 2026-11-10): its page has no words to hand over, and the site's lyrics API answers only its
 * own origin (a request from that page came back `retcode -1310` every time), so the card offers no
 * lyrics button there rather than one that opens an empty page.
 */
export function wordsAreSongs(site: WebAppSite | null): boolean {
  return site === 'netease' || site === 'kugou'
}

/**
 * Whether the cabin's own volume slider is offered for `site`'s page, on Now Playing's card.
 *
 * Bilibili's and Douyin's players have volume controls of their own, and the cabin's slider is applied to the
 * page's own media element: the two would fight, and the cabin's wins whenever it is touched. The owner asked
 * for it to be left out on Bilibili (2026-10-31), and on Douyin the page's own slider is the one that counts —
 * so the card carries none there either (2026-11-03). Every other site keeps it.
 */
export function cabinVolumeFor(site: WebAppSite | null): boolean {
  return site !== 'bilibili' && site !== 'douyin'
}

/**
 * The top of what floats over the page, in screen pixels, from the pieces of it that are up: `null` when none
 * is.
 *
 * The cabin's keyboard rises over the app, and two things hang **above the keyboard's own box** (absolutely
 * positioned: the input method's bar, and the chip that says whether the player's own keyboard types). The hole
 * the page shows in has to stop above the **highest** of them: everything inside the hole is cut away by the
 * shell's mask (`Shell.tsx` `holeMask`), so a bar left inside it is simply not drawn — which is what "no
 * candidates over any web app" was (the owner, 2026-10-31: the bar is a child of the keyboard, hanging outside
 * its parent's box, so measuring the keyboard alone missed it).
 */
export function floatingTop(rects: readonly { top: number; height: number }[]): number | null {
  const up = rects.filter((rect) => rect.height > 0)
  return up.length > 0 ? Math.min(...up.map((rect) => rect.top)) : null
}

/** The shortest a cover stays up, even for a page that draws at once: the window opens on the theme's own
 *  background rather than a flash of the site's white. */
const COVER_FLOOR_MS = 1200
/** How long it stays after the page is on show, so its first paint isn't seen as a flash. */
const COVER_TAIL_MS = 250
/** But never longer than this, whatever the page does (a site that never says it's on show). */
const COVER_CAP_MS = 30000

/**
 * Whether the cover over a site's page shows while it loads (`WebAppScreen` `.webapp-cover`): a solid
 * background of the theme's, over the hole the page cuts, so the site's own unfinished page doesn't show
 * through for the first couple of seconds. A site whose page has drawn in this run flashes nothing, so it
 * gets none.
 */
export function useWebAppCover(site: WebAppSite): boolean {
  const shown = useWebApp((state) => state.shown)
  const [covering, setCovering] = useState(() => !pageDrawn(site))
  const openedAt = useRef(Date.now())

  // Down: a moment after the page is on show, and never sooner than the floor.
  useEffect(() => {
    if (!shown) return
    const left = Math.max(COVER_TAIL_MS, openedAt.current + COVER_FLOOR_MS - Date.now())
    const timer = setTimeout(() => setCovering(false), left)
    return () => clearTimeout(timer)
  }, [shown])

  // Its longest, whatever happens: a site that never says it's on show has the cover taken off too.
  useEffect(() => {
    const timer = setTimeout(() => setCovering(false), COVER_CAP_MS)
    return () => clearTimeout(timer)
  }, [])

  // Up again: the page went (a reload, another page of the site), and the room is the game's own until
  // it's on show again.
  useEffect(() => {
    if (shown || pageDrawn(site)) return
    setCovering(true)
  }, [site, shown])

  return covering
}
