/**
 * The app's sound: one `Audio` element, fed a song's address from the layer.
 *
 * The element is the truth of where the song is: its `timeupdate` tells the app, and the app's bar runs between
 * them by the clock (see `positionOf`). Everything here is guarded for a page without one (a test, a browser
 * that won't make one), so the app's state stays whole either way.
 */

import { setSource, wake } from './spatial'

/** What the sound tells the app. */
export interface SoundEvents {
  /** It plays on from here (a song started, or played on after a pause). */
  playing(): void
  /** It stopped (paused by the player, or held by a fade). */
  paused(): void
  /** Seconds into the song, as the element has it. */
  time(seconds: number): void
  /** It's over: the app goes on to the next. */
  ended(): void
  /** It can't play what it was given (the address wouldn't load). */
  failed(): void
  /** It's ready, with its length (seconds). */
  loaded(seconds: number): void
  /** Its own volume (0 to 1), where it has one to report: the element's, which a browser may reset, and which
   * must never be taken for the player's choice (volume.ts). */
  volume(level: number): void
}

/** The element, once made; `null` where the page can't make one. */
let element: HTMLAudioElement | null = null
/** The events set for the element in play now. */
let events: SoundEvents | null = null
/** The address it was given, so it's not given the same one again (which restarts it). */
let address: string | null = null

function elementIn(): HTMLAudioElement | null {
  if (element) return element
  if (typeof Audio === 'undefined') return null
  element = new Audio()
  element.preload = 'auto'
  // Its sound through the truck's own speakers (spatial.ts, the same graph the music pages use). Handed over
  // once it is actually playing: `createMediaElementSource` takes an element's own output away for good, and
  // an element taken in before it has a stream never came through the graph at all — it played, and nothing
  // was heard (owner 2026-11-20).
  // Handed to the cab's graph as it's made (`spatial.ts`); with the graph off it plays as it is.
  setSource(element)
  return element
}

/** The element, for its own controls (its volume, its current time), `null` where there's none. */
export function sound(): HTMLAudioElement | null {
  return element
}

/** Sets what the sound tells the app. */
/**
 * Stops telling the app about the sound where only the window was listening, and nothing more.
 *
 * The app's window comes and goes (its page is drawn as it's opened, closed when another app is); what the
 * sound does is the cab's player's business, not the window's. Telling it to stop with the window took the
 * song away with it — a switch to another app and back was silence (owner 2026-11-20).
 */
export function unlisten(): void {
  // `events` stays: the handlers that must keep working (a song ending, failing) still reach it. Only
  // the ones the window drew with are unhooked below.
  const audio = element
  if (!audio) return
  // Only what was there for the window to draw: its position, its level, its length. What plays on
  // — a song ending, failing, being played or paused, a stream arriving — stays wired, because a
  // window coming and going is not a song stopping. Unhooking `onended` was why a song playing
  // while another app was open stopped at its end instead of going on to the next (owner
  // 2026-11-21).
  audio.ontimeupdate = null
  audio.onseeked = null
  audio.onloadedmetadata = null
  audio.onvolumechange = null
}

export function listen(heard: SoundEvents): void {
  events = heard
  const audio = elementIn()
  if (!audio) return
  audio.onplay = () => events?.playing()
  audio.onpause = () => events?.paused()
  audio.ontimeupdate = () => events?.time(audio.currentTime)
  audio.onseeked = () => events?.time(audio.currentTime)
  audio.onended = () => events?.ended()
  audio.onloadedmetadata = () => {
    if (Number.isFinite(audio.duration)) events?.loaded(audio.duration)
  }
  // The stream is ready to play. A `play()` the browser refused before this (it wasn't loaded yet) is asked
  // again here: without it, a song that started while its stream was still coming stayed silent for ever.
  audio.oncanplay = () => {
    if (audio.paused && wantPlaying) play()
  }
  audio.onerror = () => events?.failed()
  // The element's own volume, wherever it changes, is echo and never the player's choice: `volume.ts` has the
  // rule, and this is where it's heard.
  audio.onvolumechange = () => events?.volume(audio.volume)
}

/** Plays the audio at `url`, from `at` seconds (0 for a song's start). A new address restarts the element; the
 * same one plays on from where it is, unless `at` says otherwise. */
export function load(url: string, at = 0): void {
  const audio = elementIn()
  if (!audio) return
  if (url !== address) {
    address = url
    // A song waiting to be tried again is that song's: the next one starts clean.
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    // A stale element can sit on a failed/ended stream and refuse to start again (which read as "no sound
    // after a song change"): a new song always gets a clean source, and its own error cleared.
    audio.onerror = null
    audio.src = url
    audio.load()
    wake()
  }
  if (Math.abs(audio.currentTime - at) > 0.5) audio.currentTime = at
}

/**
 * Plays on, taking the element's word for it.
 *
 * A browser refuses a play now and then — the element hadn't loaded yet, its last stream had errored, or the
 * page wasn't allowed to start one — and the promise fails with nothing to show for it. The song then sat
 * shown as playing over silence, which is the owner's "切歌后没声音". So a refused play is tried again once
 * the element says it's ready, and reported (`failed`) when it really won't play: the app may then move on
 * rather than sit on a silent song.
 */
export function play(): void {
  const audio = elementIn()
  if (!audio || !address) return
  wantPlaying = true
  const attempt = () => {
    if (!audio || !address) return
    // The graph is woken right before each try: a context made outside a gesture stays suspended, and a
    // suspended one plays silence while the element's clock runs (the app showed 0:00; owner 2026-11-20).
    wake()
    void audio.play().catch(() => {
      // Not loaded yet: the element's own `canplay` asks again (this one is replaced by it).
      if (audio.readyState < 2 && !audio.error) return
      if (audio.error) {
        events?.failed()
        return
      }
      // Refused while it was ready (an autoplay rule that has since lifted, or a stream that ended): one more
      // try a moment later, and said if it still won't.
      retryTimer = setTimeout(() => {
        retryTimer = null
        void audio.play().catch(() => events?.failed())
      }, RETRY_MS)
    })
  }
  attempt()
}

/** How long a refused play waits before its one more try, ms. */
const RETRY_MS = 400
/** A play waiting to be tried again (`play`), cleared when the song changes. */
let retryTimer: ReturnType<typeof setTimeout> | null = null
/** Whether the app wants sound now: a song started and not paused since (what `canplay` plays for). */
let wantPlaying = false

/** Pauses. */
export function pause(): void {
  wantPlaying = false
  element?.pause()
}

/** Goes to `seconds` in the song. */
export function seek(seconds: number): void {
  if (!element) return
  element.currentTime = Math.max(0, seconds)
}

/** How loud it plays, 0 to 1. */
export function setLevel(share: number): void {
  if (element) element.volume = Math.min(1, Math.max(0, share))
}

/** Forgets the song playing (nothing is left to play on). */
export function stop(): void {
  if (!element) return
  address = null
  wantPlaying = false
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  element.pause()
  element.removeAttribute('src')
  element.load()
}
