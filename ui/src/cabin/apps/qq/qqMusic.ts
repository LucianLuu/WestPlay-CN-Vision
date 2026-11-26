import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { createAsking } from '../asking'
import {
  type AppleMusicItem,
  type AppleMusicSection,
  type AppleMusicTrack,
  type QqMusicAnswers,
  type QqMusicCommand,
  type QqMusicPlayback,
  type QqMusicQuestion,
  type QqMusicRepeat,
  isInHost,
  postToHost,
} from '../../../shared/host'
import { positionOf } from '../music/time'
import { previewAnswer } from './preview'

export { positionOf }

/**
 * WestPlay's own QQ Music home (`ui/src/cabin/apps/qq`). A hidden WebView's script (`crates/host/src/
 * qq_music.js`) fetches the local QQ middle layer on the loopback and answers the app's questions; the login
 * credential stays in the layer's account pool, nothing of it passes through here. This store holds the
 * shell's state (tab, open pages, what plays) and talks to the host over the `qqMusic` / `qqMusicAnswer` /
 * `qqMusicPlayback` messages.
 *
 * Models are the same shape as Apple Music's, reused from the shared host types.
 */

export type Question = QqMusicQuestion
export type Answers = QqMusicAnswers
export type Repeat = QqMusicRepeat
export type Track = AppleMusicTrack
export type Item = AppleMusicItem

/** The four main capsule tabs; Search opens as its own layer from the search circle. */
export type Tab = 'recommend' | 'playlists' | 'channels' | 'mine' | 'search'
export const TABS: readonly Tab[] = ['recommend', 'playlists', 'channels', 'mine']

/** A page over a tab's own (the card pressed, to show at once while its page comes). */
export type View =
  | { id: number; kind: 'collection'; item: AppleMusicItem }
  | { id: number; kind: 'results'; query: string }
  /** A section's See All: all of it. */
  | { id: number; kind: 'section'; section: AppleMusicSection }

/** Where what plays plays from. */
export interface PlayContext {
  id: string
  name: string
  kind: AppleMusicItem['kind']
}

/** What plays: the song (`index` of `tracks`), those after it, where it plays from (`null`: a song on its
 * own, or not known), and how far. */
export interface Playback {
  context: PlayContext | null
  tracks: AppleMusicTrack[]
  index: number
  playing: boolean
  /** Playing as asked, its sound not come yet: its time held still (its bar breathes). */
  loading: boolean
  /** Seconds into the song at `at` (`performance.now()`), running on from there while it plays. */
  position: number
  at: number
  duration: number
  preview: boolean
  shuffle: boolean
  repeat: Repeat
  /** The player's volume, 0 to 1 (`null`: not known yet). */
  volume: number | null
  /** The way the last change of song went (Now Playing's cover slides that way). */
  direction: 1 | -1
}

interface QqState {
  tab: Tab
  /** Each tab's pages over its own, the one showing last (each tab is kept where it was left). */
  views: Record<Tab, View[]>
  /** Now Playing is open, over the app. */
  nowPlaying: boolean
  /** Now Playing shows Up Next in the cover's place. */
  queue: boolean
  /** Now Playing shows the song's words in the cover's place. */
  lyrics: boolean
  playback: Playback | null
  /** Favourites as changed in this session, by song. */
  favorites: Record<string, boolean>
  /** "Added"/"Favourited": the toast showing. */
  toast: { text: string; id: number } | null
  /** Signed in to the layer's account (reported by the hidden page); the account's avatar. */
  signedIn: boolean
  avatar: string | null
}

const NO_VIEWS: Record<Tab, View[]> = {
  recommend: [],
  playlists: [],
  channels: [],
  mine: [],
  search: [],
}

export const useQqMusic = create<QqState>()(() => ({
  tab: 'recommend',
  views: NO_VIEWS,
  nowPlaying: false,
  queue: false,
  lyrics: false,
  playback: null,
  favorites: {},
  toast: null,
  signedIn: false,
  avatar: null,
}))

export function qqMusic(command: QqMusicCommand): void {
  postToHost({ type: 'qqMusic', command })
}

// --- Questions ---------------------------------------------------------------------------------------------

const asking = createAsking<QqMusicQuestion, QqMusicAnswers>(
  (id, question) => qqMusic({ action: 'ask', id, question }),
  // No host in a plain browser (and the companion's own screen): an invented catalogue stands in,
  // so the preview shows what the app looks like instead of a page that couldn't load (preview.ts).
  previewAnswer,
  isInHost,
)

/** A question's answer: as known this session, or (`fresh`, or not known) asked of QQ Music. */
export const ask = asking.ask
/** A question's answer once it comes (`null` until then), whether it failed to answer, and asking again. */
export const useAsked = asking.useAsked
/** QQ Music's answer (`qqMusicAnswer`), for the question asked with its id. */
export const receiveAnswer = asking.receive

/** How many times a page has been shown again (a page kept under others, or a tab left, is shown again). */
export function useShownAgain(shown: boolean): number {
  const [times, setTimes] = useState(0)
  const [was, setWas] = useState(shown)
  if (shown !== was) {
    setWas(shown)
    if (shown) setTimes((times) => times + 1)
  }
  return times
}

/**
 * How many times the account has changed (signed in, signed out, or another account): a page whose
 * content is the account's own (the home feed's picks) asks again when it does, or it kept showing the
 * feed of the account the player just left (owner 2026-11-19).
 */
export function useSignInChanges(): number {
  const signedIn = useQqMusic((state) => state.signedIn)
  const [changes, setChanges] = useState(0)
  const [was, setWas] = useState(signedIn)
  if (signedIn !== was) {
    setWas(signedIn)
    setChanges((count) => count + 1)
  }
  return changes
}

// --- Going around ------------------------------------------------------------------------------------------

let nextId = 1

/** A tab: pressed again where it already is, back to its own page. */
export function openTab(tab: Tab): void {
  const { tab: was, views } = useQqMusic.getState()
  if (was === tab) useQqMusic.setState({ views: { ...views, [tab]: [] } })
  else useQqMusic.setState({ tab })
}

type Unidentified<T> = T extends unknown ? Omit<T, 'id'> : never

export function openView(view: Unidentified<View>): void {
  const { tab, views } = useQqMusic.getState()
  useQqMusic.setState({ views: { ...views, [tab]: [...views[tab], { ...view, id: nextId++ } as View] } })
}

/** A card pressed: its page; a song plays. */
export function openItem(item: AppleMusicItem): void {
  if (item.kind === 'song') play(item)
  else openView({ kind: 'collection', item })
}

export function goBack(): void {
  const { tab, views } = useQqMusic.getState()
  useQqMusic.setState({ views: { ...views, [tab]: views[tab].slice(0, -1) } })
}

// --- Playing -----------------------------------------------------------------------------------------------

export function currentTrack(playback: Playback | null): AppleMusicTrack | null {
  return playback ? (playback.tracks[playback.index] ?? null) : null
}

/** A change of what plays, shown at once (the host then says how it really is). */
function showPlayback(change: Partial<Playback>): void {
  const playback = useQqMusic.getState().playback
  if (playback) useQqMusic.setState({ playback: { ...playback, ...change } })
}

/** Plays an album's or playlist's songs (or a list of songs: `context` null), from `index` (`null`: from the
 * start, or anywhere on shuffle). */
export function playFrom(
  context: AppleMusicItem | null,
  tracks: AppleMusicTrack[],
  index: number | null,
  shuffle?: boolean,
): void {
  if (tracks.length === 0) return
  const was = useQqMusic.getState().playback
  const shuffled = shuffle ?? was?.shuffle ?? false
  const start = index ?? (shuffled ? Math.floor(Math.random() * tracks.length) : 0)
  if (isInHost()) {
    // The whole list, always — `songs` with the index into it — and the context's id too when
    // there is one (the page shows its name and picture).
    //
    // It used to send only `id` + `kind` for a playlist, and the layer looked the list up itself:
    // it answers the first 30 songs and stops, so a player's queue ended at the 30th and Next went
    // back to the first (owner 2026-11-26). The layer's own paging can't be fixed here — its
    // `/songlist/{id}/detail` never says how long a list is — but the app already has every song
    // it shows, so it hands them over instead.
    // `songs` alone, no `id`: the layer takes a list as given, but asked for a playlist by id it
    // reads the list itself — and stops at 30 (see above).
    qqMusic({
      action: 'play',
      songs: tracks.map((track) => track.id),
      index: start,
      shuffle: shuffled,
    })
  }
  useQqMusic.setState({
    playback: {
      context: context ? { id: context.id, name: context.name, kind: context.kind } : null,
      tracks,
      index: start,
      playing: true,
      loading: isInHost(),
      position: 0,
      at: performance.now(),
      duration: tracks[start].duration,
      preview: false,
      shuffle: shuffled,
      repeat: was?.repeat ?? 'off',
      volume: was?.volume ?? null,
      direction: 1,
    },
  })
}

/** A song on its own (a card): it plays. */
export function play(item: AppleMusicItem): void {
  if (isInHost()) qqMusic({ action: 'play', id: item.id })
  const was = useQqMusic.getState().playback
  const track: AppleMusicTrack = {
    id: item.id,
    name: item.name,
    artist: item.by,
    album: '',
    albumId: null,
    artistId: null,
    image: item.image,
    color: item.color,
    duration: 0,
    explicit: item.explicit,
    number: null,
  }
  useQqMusic.setState({
    playback: {
      context: null,
      tracks: [track],
      index: 0,
      playing: true,
      loading: isInHost(),
      position: 0,
      at: performance.now(),
      duration: 0,
      preview: false,
      shuffle: was?.shuffle ?? false,
      repeat: was?.repeat ?? 'off',
      volume: was?.volume ?? null,
      direction: 1,
    },
  })
}

/** Plays or pauses what's playing. */
export function playOrPause(): void {
  const playback = useQqMusic.getState().playback
  if (!playback) return
  const now = performance.now()
  if (isInHost()) qqMusic({ action: playback.playing ? 'pause' : 'play' })
  showPlayback({
    playing: !playback.playing,
    loading: isInHost() && !playback.playing,
    position: positionOf(playback, now),
    at: now,
  })
}

/** Pauses what plays here, as the cab's own pause does (the game away, the electrics off): no
 * toggle, so it can't start it by mistake. */
export function pauseHere(): void {
  const playback = useQqMusic.getState().playback
  if (!playback?.playing) return
  const now = performance.now()
  if (isInHost()) qqMusic({ action: 'pause' })
  showPlayback({ playing: false, position: positionOf(playback, now), at: now })
}

/** Plays what was paused here, as the cab's own resume does (no toggle). */
export function resumeHere(): void {
  const playback = useQqMusic.getState().playback
  if (!playback || playback.playing) return
  const now = performance.now()
  if (isInHost()) qqMusic({ action: 'play' })
  showPlayback({ playing: true, loading: isInHost(), position: positionOf(playback, now), at: now })
}

/**
 * Sets the volume it plays at (0 to 1) without making it the player's choice: the cab's own fades
 * (a reversal's quiet, the way out as the electrics go). The player's own volume is `setVolume`'s,
 * and it's the one kept for the next start.
 */
export function sendVolume(share: number): void {
  const volume = Math.min(1, Math.max(0, share))
  showPlayback({ volume })
  if (isInHost()) qqMusic({ action: 'volume', percent: Math.round(volume * 100), transient: true })
}

/** The next song, or the one before (within a song's first seconds; later, its start). */
export function skip(direction: 1 | -1): void {
  const playback = useQqMusic.getState().playback
  if (!playback) return
  const now = performance.now()
  if (isInHost()) {
    qqMusic({ action: direction === 1 ? 'next' : 'previous' })
    if (playback.playing) showPlayback({ loading: true, position: positionOf(playback, now), at: now })
    return
  }
  if (direction === -1 && positionOf(playback, now) > 3) {
    showPlayback({ position: 0, at: now })
    return
  }
  const count = playback.tracks.length
  let index = playback.index + direction
  if (playback.shuffle && direction === 1 && count > 1) {
    index = (playback.index + 1 + Math.floor(Math.random() * (count - 1))) % count
  }
  if (index >= count) {
    if (playback.repeat === 'off') {
      showPlayback({ index: 0, playing: false, position: 0, at: now })
      return
    }
    index = 0
  }
  const next = Math.max(0, index)
  showPlayback({ index: next, position: 0, at: now, direction, duration: playback.tracks[next].duration })
}

/** A song of Up Next pressed (`offset` songs on): it plays, from where it is. */
export function jumpTo(offset: number): void {
  const playback = useQqMusic.getState().playback
  const song = playback?.tracks[playback.index + offset]
  if (!playback || !song) return
  if (isInHost()) qqMusic({ action: 'jump', offset })
  showPlayback({
    loading: isInHost(),
    index: playback.index + offset,
    position: 0,
    at: performance.now(),
    direction: 1,
    duration: song.duration,
  })
}

let volumeSent = 0

/** The player's volume (0 to 1), as it's dragged: shown at once, sent a few times a second (and the last one
 * always). */
export function setVolume(share: number, done = false): void {
  const volume = Math.min(1, Math.max(0, share))
  showPlayback({ volume })
  if (!isInHost()) return
  const now = performance.now()
  if (!done && now - volumeSent < 120) return
  volumeSent = now
  qqMusic({ action: 'volume', percent: Math.round(volume * 100) })
}

export function seek(seconds: number): void {
  if (isInHost()) qqMusic({ action: 'seek', seconds: Math.max(0, seconds) })
  showPlayback({ position: Math.max(0, seconds), at: performance.now() })
}

export function toggleShuffle(): void {
  const playback = useQqMusic.getState().playback
  if (!playback) return
  if (isInHost()) qqMusic({ action: 'shuffle', on: !playback.shuffle })
  showPlayback({ shuffle: !playback.shuffle })
}

/** Off, all, the one song: the order. */
export function cycleRepeat(): void {
  const playback = useQqMusic.getState().playback
  if (!playback) return
  const repeat: Repeat = playback.repeat === 'off' ? 'all' : playback.repeat === 'all' ? 'one' : 'off'
  if (isInHost()) qqMusic({ action: 'repeat', mode: repeat })
  showPlayback({ repeat })
}

/** The hidden page's login state: signed in or not, and the account's avatar (`null` when unknown). */
export function receiveState(signedIn: boolean | null, avatar: string | null): void {
  if (signedIn == null) return
  const before = useQqMusic.getState().signedIn
  useQqMusic.setState({ signedIn, avatar: signedIn ? avatar : null })
  // The account changed: every answer kept for the old one is another's — its home feed's picks above
  // all, which was what the app went on showing after a sign-in (owner 2026-11-19). The page drops its
  // own copies too (`qq_music.js` clears `homeCache` as the credential arrives): both have to go, or the
  // app renders the anonymous feed from its own cache without asking again.
  if (before !== signedIn) asking.clear()
}

/** What QQ Music plays (`qqMusicPlayback`): the app follows it. */
export function receivePlayback(playback: QqMusicPlayback | null): void {
  const track = playback?.track
  if (!track) {
    // The host reports playback once before the next track's meta resolves (`track` still null). That
    // mid-load null must not wipe the locally known queue; only clear when nothing was playing locally.
    const wasNull = useQqMusic.getState().playback
    if (wasNull) useQqMusic.setState({ playback: { ...wasNull, loading: true, playing: false } })
    else useQqMusic.setState({ playback: null, nowPlaying: false })
    return
  }
  const was = useQqMusic.getState().playback
  const before = currentTrack(was)
  const now = performance.now()
  const direction: 1 | -1 = before?.id === track.id ? (was?.direction ?? 1) : 1
  const { favorites } = useQqMusic.getState()
  const favorite = track.favorite

  // The QQ layer reports only the current track (its `next` is empty). Keep the locally known queue from
  // `playFrom` so Up Next still lists what follows; replace just the current row with the host's fresher meta.
  let tracks: AppleMusicTrack[]
  let index: number
  if (playback.next && playback.next.length > 0) {
    tracks = [track, ...playback.next]
    index = 0
  } else if (was && was.tracks.length > 0) {
    const at = was.tracks.findIndex((song) => song.id === track.id)
    index = at >= 0 ? at : was.index
    tracks = was.tracks.map((song, i) => (i === index ? track : song))
  } else {
    tracks = [track]
    index = 0
  }

  useQqMusic.setState({
    playback: {
      context: playback.context ?? was?.context ?? null,
      tracks,
      index,
      playing: playback.playing,
      loading: playback.loading ?? false,
      position: playback.position,
      at: now,
      duration: playback.duration || track.duration,
      preview: playback.preview,
      shuffle: playback.shuffle,
      repeat: playback.repeat,
      volume: playback.volume,
      direction,
    },
    favorites: favorite == null ? favorites : { ...favorites, [track.id]: favorite },
  })
}

let toastId = 0
let toastTimer: ReturnType<typeof setTimeout> | undefined

export function showToast(text: string): void {
  clearTimeout(toastTimer)
  useQqMusic.setState({ toast: { text, id: ++toastId } })
  toastTimer = setTimeout(() => useQqMusic.setState({ toast: null }), 2600)
}

/** Whether a song is a favourite: as changed here, else as said. */
export function useFavorite(track: AppleMusicTrack): boolean {
  return useQqMusic((state) => state.favorites[track.id] ?? track.favorite ?? false)
}

/** Favourites a song (or not), saying so. */
export function toggleFavorite(track: AppleMusicTrack, favorite: boolean, words: { on: string; off: string }): void {
  if (isInHost()) qqMusic({ action: 'favorite', id: track.id, on: !favorite })
  useQqMusic.setState({ favorites: { ...useQqMusic.getState().favorites, [track.id]: !favorite } })
  showToast(favorite ? words.off : words.on)
}

/** The time (`performance.now()`), again every quarter second while `running`: for a song's time. */
export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [running])
  return now
}

/** While the app is open: the hidden page runs and answers the app's questions. */
export function useWebPlayer(): void {
  useEffect(() => {
    if (isInHost()) qqMusic({ action: 'start' })
  }, [])
}

/** What QQ Music plays, as the Dashboard's Now Playing takes music, and its cover; `null` while nothing
 * does. */
export function useQqMusicSource(): { source: import('../../../shared/media').MediaSource; artwork: string | null } | null {
  const playback = useQqMusic((state) => state.playback)
  return useMemo(() => {
    const track = currentTrack(playback)
    if (!playback || !track) return null
    return {
      source: {
        id: 'westplay-qq-music',
        service: 'qqMusic',
        title: track.name,
        artist: track.artist,
        album: track.album,
        artwork: null,
        status: playback.playing ? 'playing' : 'paused',
        positionMs: playback.position * 1000,
        positionAt: Math.round(performance.timeOrigin + playback.at),
        durationMs: playback.duration * 1000,
        controls: { playPause: true, next: true, previous: true, shuffle: true, repeat: true },
        shuffle: playback.shuffle,
        repeat: playback.repeat === 'one' ? 'track' : playback.repeat === 'all' ? 'list' : 'off',
      },
      artwork: track.image,
    }
  }, [playback])
}
