import { create } from 'zustand'
import type { MediaSource } from '../../../shared/media'
import { followLayerPort, layerBase } from '../netease/layer'
import { parseLrc, type Words } from '../netease/lyrics'

/**
 * KuGou Music's app state: the pages, what plays, and the words.
 *
 * KuGou is asked the way NetEase is (`netease_layer/kugou.py`, the same process the cabin's NetEase app
 * uses): the page asks the layer over the loopback, the layer asks KuGou, and the sound is a plain
 * `Audio` element fed a song's address. Its audio comes through the layer's own stream route — KuGou's
 * CDN is plain `http`, and this page is a secure one.
 */

// --- what the layer answers ------------------------------------------------------------------

export interface Song {
  id: string
  name: string
  artists: string[]
  album: string
  albumId: string
  albumAudioId: string
  picture: string
  /** Seconds. */
  duration: number
  /** KuGou's own: 0 a free one, 8 one with a free 128k, 10 paid (VIP or with a price). */
  privilege: number
}

export interface Playlist {
  id: string
  kind: 'playlist'
  name: string
  picture: string
  description: string
  trackCount: number
  creator: string
  plays: number
  tag: string
}

export interface Rank {
  id: string
  name: string
  picture: string
  note: string
  issue: string
}

export interface Singer {
  id: string
  name: string
  picture: string
  songs: number
  fans: number
}

/** An audiobook on 听书's shelf (`longaudio/v1/album/list`). */
export interface Book {
  id: string
  name: string
  picture: string
  author: string
  intro: string
  chapters: number
  plays: number
  note: string
  date: string
}

/** One of 听书's tag trees (小说 and its children: 玄幻异界, 悬疑推理 …). */
export interface BookTag {
  id: string
  name: string
  icon: string
  children: { id: string; name: string; channel: number }[]
}


interface SongsAnswer {
  songs: Song[]
  total?: number
  more?: boolean
}

const TIMEOUT = 30000

class LayerError extends Error {}

async function ask<T>(route: string): Promise<T> {
  let answer: Response
  try {
    answer = await fetch(layerBase() + route, { signal: AbortSignal.timeout(TIMEOUT) })
  } catch {
    throw new LayerError('the layer didn’t answer')
  }
  if (!answer.ok) throw new LayerError(`${route}: ${answer.status}`)
  return (await answer.json()) as T
}

export const searchSongs = (words: string, page = 1) =>
  ask<SongsAnswer>(`/kugou/search?q=${encodeURIComponent(words)}&page=${page}&size=20`)
export const ranks = () => ask<{ ranks: Rank[] }>('/kugou/ranks')
export const rankSongs = (id: string, page = 1) => ask<SongsAnswer>(`/kugou/rank?id=${id}&page=${page}&size=30`)
export const playlists = (page = 1) => ask<{ playlists: Playlist[]; more: boolean }>(`/kugou/playlists?page=${page}&size=12`)
export const playlistSongs = (id: string, page = 1) =>
  ask<SongsAnswer & { name: string }>(`/kugou/playlist?id=${encodeURIComponent(id)}&page=${page}&size=30`)
export const singers = (page = 1) => ask<{ singers: Singer[]; more: boolean }>(`/kugou/singers?page=${page}&size=20`)
export const singerSongs = (id: string, page = 1) => ask<SongsAnswer>(`/kugou/singer?id=${id}&page=${page}&size=30`)

/** The account: no sign-in, or the one whose QR was scanned (kept by the layer across runs). */
export interface Account {
  signedIn: boolean
  nickname: string
  avatar: string
  userId: number
}

export const accountInfo = () => ask<{ ok: boolean; account: Account }>('/kugou/health')
/** A fresh login QR: KuGou's own key and the picture it drew (`data:` url). */
export const qrStart = () => ask<{ key: string; image: string }>('/kugou/qr')
/** 0 expired, 1 waiting, 2 scanned, 4 signed in (its answer then carries the account). */
export const qrCheck = (key: string) => ask<{ status: number; account: Account }>(`/kugou/qr/check?key=${encodeURIComponent(key)}`)
export const signOut = () => ask<{ ok: boolean }>('/kugou/signout')

export const bookTags = () => ask<{ tags: BookTag[] }>('/kugou/audiobook/tags')
export const audiobooks = (tag: string, page = 1) =>
  ask<{ books: Book[]; more: boolean }>(`/kugou/audiobooks?tag=${encodeURIComponent(tag)}&page=${page}&size=20`)
export const audiobook = (id: string) => ask<{ book: Book }>(`/kugou/audiobook?id=${encodeURIComponent(id)}`)
export const audiobookChapters = (book: { id: string; name: string; picture: string }, page = 1) =>
  ask<SongsAnswer & { total: number }>(
    `/kugou/audiobook/chapters?id=${encodeURIComponent(book.id)}&name=${encodeURIComponent(book.name)}&cover=${encodeURIComponent(book.picture)}&page=${page}&size=30`,
  )
export const favourites = (page = 1) =>
  ask<{ playlists: Playlist[]; more: boolean; note?: string }>(`/kugou/favorites?page=${page}&size=30`)

export const songUrl = (song: Song) =>
  ask<{ url: string; direct: string; bitrate: number; size: number; code: number; reason?: string }>(
    `/kugou/url?hash=${encodeURIComponent(song.id)}&album=${encodeURIComponent(song.albumId)}&name=${encodeURIComponent(song.name)}`,
  )
export const songLyric = (song: Song) =>
  ask<{ lrc: string; translation: string }>(
    `/kugou/lyric?hash=${encodeURIComponent(song.id)}&duration=${song.duration}&name=${encodeURIComponent(song.name)}&artist=${encodeURIComponent(song.artists[0] ?? '')}`,
  )

// --- the pages ---------------------------------------------------------------------------------

/** A page over the tab's own; 推荐 is the tab's own. */
export type View =
  | { kind: 'home' }
  | { kind: 'ranks' }
  | { kind: 'singers' }
  | { kind: 'recent' }
  | { kind: 'results'; query: string }
  | { kind: 'playlist'; id: string; name: string; picture: string; creator: string }
  | { kind: 'rank'; id: string; name: string; picture: string }
  | { kind: 'singer'; id: string; name: string; picture: string }
  /** 听书: the shelf, and one audiobook's chapters (played as songs, through the same player). */
  | { kind: 'audiobooks'; tag: string; name: string }
  | { kind: 'audiobook'; id: string; name: string; picture: string }
  /** 我的收藏: the signed-in account's playlists (what it keeps and what it made). */
  | { kind: 'favorites' }

/** A list of songs a page shows: what it is and where its next page comes from. */
export interface TrackList {
  songs: Song[]
  more: boolean
  page: number
  loading: boolean
  name: string
  picture: string
}

export type SoundState = 'idle' | 'loading' | 'playing' | 'blocked' | 'failed'

/** What plays: the songs, which of them, and how far. */
export interface Playback {
  tracks: Song[]
  index: number
  playing: boolean
  contextName: string
}

interface KuGouState {
  view: View
  /** The pages gone back from, the last one at the end. */
  back: View[]
  loading: boolean
  failed: string
  /** The playlist square's picks, and which page of them they are (the home page's own grid). */
  picks: Playlist[]
  picksPage: number
  picksMore: boolean
  /** The charts, once read. */
  charts: Rank[]
  /** The singers, once read. */
  artists: Singer[]
  /** The page's own songs: the chart, the playlist, the singer, or the search. */
  tracks: TrackList
  /** What played last (what 最近播放 lists). */
  recent: Song[]

  /** 听书: its tag tree, the shelf a tag at a time, and which tag is showing. */
  bookTags: BookTag[]
  books: Book[]
  booksTag: string
  booksPage: number
  booksMore: boolean
  /** 我的收藏: the account's playlists. */
  favorites: Playlist[]
  favoritesMore: boolean
  favoritesNote: string

  /** The account (empty until a QR is scanned), and the sign-in panel's own state. */
  account: Account
  login: { open: boolean; key: string; image: string; status: number; busy: boolean }

  playback: Playback | null
  sound: SoundState
  position: number
  duration: number
  /** What the app plays at (0 to 1), as the player set it: theirs, kept between runs. */
  volume: number
  /** The level a fade holds the sound at (1: none), as the cab's players' `sendVolume` sets it. */
  fade: number
  /** A song the service wouldn't give (its words, said for a moment). */
  blocked: string
  /** The skipping stopped because the whole list was refused. */
  blockedAll: boolean
  /** The full player, over the app. */
  nowOpen: boolean
  /** The full player shows the words. */
  wordsOpen: boolean
  words: Words | null
  wordsFor: string
  wordsFailed: boolean

  open(view: View): void
  goBack(): void
  openHome(): void
  loadHome(fresh?: boolean): Promise<void>
  openRanks(): Promise<void>
  openSingers(): Promise<void>
  /** 听书: the shelf (its first tag, or a tag the page picked) and one audiobook's chapters. */
  openAudiobooks(tag?: string, name?: string, fresh?: boolean): Promise<void>
  openAudiobook(book: Book): Promise<void>
  /** 我的收藏 (the account's playlists; it asks for a sign-in first when there is none). */
  openFavorites(): Promise<void>
  /** The sign-in panel: a fresh QR, its state, and its own close. */
  startLogin(): Promise<void>
  checkLogin(): Promise<void>
  closeLogin(): void
  signOutAccount(): Promise<void>
  /** Who the layer says is signed in (the account is kept across runs). */
  loadAccount(): Promise<void>
  openPlaylist(pick: { id: string; name: string; picture: string; creator: string }): Promise<void>
  openRank(rank: Rank): Promise<void>
  openSinger(singer: Singer): Promise<void>
  search(words: string): Promise<void>
  nextPage(): Promise<void>
  /** Asks the page showing again (a retry after the layer didn't answer). */
  reload(): Promise<void>

  play(tracks: Song[], index: number, contextName: string): void
  toggle(): void
  nextSong(auto?: boolean): void
  previousSong(): void
  seek(seconds: number): void
  setNow(open: boolean): void
  setWords(open: boolean): void
  loadWords(song: Song): Promise<void>
}

const NO_TRACKS: TrackList = { songs: [], more: false, page: 1, loading: false, name: '', picture: '' }

const RECENT_KEY = 'westplay-kugou-recent'

function keptRecent(): Song[] {
  try {
    const kept = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(kept) ? (kept as Song[]).slice(0, 40) : []
  } catch {
    return []
  }
}

function noteRecent(song: Song): Song[] {
  const recent = [song, ...keptRecent().filter((each) => each.id !== song.id)].slice(0, 40)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch {
    // A full disk or a locked store: the list is a convenience, not the app.
  }
  return recent
}

// --- the sound -----------------------------------------------------------------------------------

/** The one element the app plays through. */
const audio = new Audio()
audio.preload = 'auto'

/** Where the player's volume is kept between runs; how loud it starts before they've set one. */
const VOLUME_KEY = 'westplay-kugou-volume'
const DEFAULT_VOLUME = 0.8

function keptVolume(): number {
  try {
    const stored = window.localStorage.getItem(VOLUME_KEY)
    if (stored === null || stored.trim() === '') return DEFAULT_VOLUME
    const level = Number(stored)
    return Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

/** The sound's own level: the player's volume, scaled by whatever the cab holds (a fade, the truck reversing). */
function soundLevel(): void {
  const { volume, fade } = useKuGou.getState()
  audio.volume = Math.min(1, Math.max(0, volume * fade))
}

/** The player's volume, as its slider is dragged: shown at once, kept for the next run, the sound set to it. */
export function setVolume(share: number): void {
  const volume = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0))
  useKuGou.setState({ volume })
  try {
    window.localStorage.setItem(VOLUME_KEY, String(volume))
  } catch {
    // Storage blocked: the volume holds for this run only.
  }
  soundLevel()
}

/** The volume the app plays at now (0 to 1). */
export function volumeNow(): number {
  return useKuGou.getState().volume
}

/** The level a fade holds the sound at (0 to 1): the cab's quiet with the game, its reverse, a pause's ramp. */
export function setFade(share: number): void {
  useKuGou.setState({ fade: Math.min(1, Math.max(0, Number.isFinite(share) ? share : 1)) })
  soundLevel()
}

/** How long the sound takes to go quiet as it pauses, and to come back as it plays, ms (as NetEase's page). */
const PAUSE_FADE_MS = 360
const PLAY_FADE_MS = 320

/** The ramp in flight (the app's own pause and play), to stop as another starts. */
let rampTimer: number | undefined

function stopRamp(): void {
  if (rampTimer === undefined) return
  window.clearInterval(rampTimer)
  rampTimer = undefined
}

/** Runs the sound's level from where it is to `to`, over `ms`, then `done` (not called if stopped). */
function rampTo(to: number, ms: number, done?: () => void): void {
  stopRamp()
  const from = useKuGou.getState().fade
  const started = performance.now()
  rampTimer = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - started) / ms)
    setFade(from + (to - from) * t)
    if (t >= 1) {
      stopRamp()
      done?.()
    }
  }, 30)
}

/** Pauses as the app's own button does: the sound fades out, then stops. */
export function pauseWithFade(): void {
  const playback = useKuGou.getState().playback
  if (!playback || !playback.playing) return
  useKuGou.setState({ playback: { ...playback, playing: false } })
  rampTo(0, PAUSE_FADE_MS, () => {
    audio.pause()
    // Back to the full level, unheard: the next song starts at the volume they chose.
    setFade(1)
  })
}

/** Plays as the app's own button does: the sound comes in from silence. */
export function playWithFade(): void {
  const playback = useKuGou.getState().playback
  if (!playback) return
  useKuGou.setState({ playback: { ...playback, playing: true } })
  setFade(0)
  void audio.play().catch(() => {
    // The stream didn't start: the page still says it plays, as the player asked.
  })
  rampTo(1, PLAY_FADE_MS)
}

let token = 0
/** Blocked songs in a row; three means the list really is all paid, and the skipping stops. */
let streak = 0

audio.addEventListener('timeupdate', () => {
  useKuGou.setState({ position: audio.currentTime })
})
audio.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audio.duration)) useKuGou.setState({ duration: audio.duration })
})
audio.addEventListener('ended', () => useKuGou.getState().nextSong(true))
audio.addEventListener('error', () => {
  const state = useKuGou.getState()
  if (state.sound === 'loading') useKuGou.setState({ sound: 'failed' })
})

/** Plays the song at `index`, asking the layer where its audio is. */
async function start(index: number): Promise<void> {
  const state = useKuGou.getState()
  const playback = state.playback
  if (!playback) return
  const song = playback.tracks[index]
  if (!song) return
  const mine = ++token
  useKuGou.setState({ position: 0, duration: song.duration, sound: 'loading' })
  try {
    const found = await songUrl(song)
    if (mine !== token) return
    if (!found.url || found.code < 0) {
      // The service keeps this one for its paid listeners: said, and the next one goes on. Once three in
      // a row are refused, the list plainly is all paid - skipping through it silently would be worse.
      streak += 1
      useKuGou.setState({ sound: 'blocked', blocked: song.name, blockedAll: streak >= 3 })
      if (streak < 3) {
        window.setTimeout(() => {
          if (token === mine) useKuGou.getState().nextSong(true)
        }, 2600)
      }
      return
    }
    audio.src = found.url
    audio.currentTime = 0
    soundLevel()
    // Each song comes in from silence (as the app's own pause and play do), not with a cut.
    setFade(0)
    await audio.play()
    if (mine !== token) return
    streak = 0
    useKuGou.setState({ sound: 'playing', blocked: '', blockedAll: false })
    rampTo(1, PLAY_FADE_MS)
  } catch {
    if (mine !== token) return
    useKuGou.setState({ sound: 'failed' })
  }
}

export const useKuGou = create<KuGouState>((set, get) => ({
  view: { kind: 'home' },
  back: [],
  loading: false,
  failed: '',
  picks: [],
  picksPage: 1,
  picksMore: true,
  charts: [],
  artists: [],
  tracks: NO_TRACKS,
  recent: keptRecent(),

  bookTags: [],
  books: [],
  booksTag: '906',
  booksPage: 1,
  booksMore: true,
  favorites: [],
  favoritesMore: false,
  favoritesNote: '',

  account: { signedIn: false, nickname: '', avatar: '', userId: 0 },
  login: { open: false, key: '', image: '', status: 0, busy: false },

  playback: null,
  sound: 'idle',
  position: 0,
  duration: 0,
  volume: keptVolume(),
  fade: 1,
  blocked: '',
  blockedAll: false,
  nowOpen: false,
  wordsOpen: false,
  words: null,
  wordsFor: '',
  wordsFailed: false,

  open(view) {
    set((state) => {
      // The page already showing (a retry, a reload) isn't a page to go back through.
      const same = state.view.kind === view.kind && ('id' in state.view ? state.view.id : '') === ('id' in view ? view.id : '')
      return {
        view,
        back: same ? state.back : [...state.back, state.view],
        failed: '',
        tracks: same ? state.tracks : NO_TRACKS,
      }
    })
  },
  goBack() {
    set((state) => {
      const back = state.back.slice(0, -1)
      const view = state.back[state.back.length - 1] ?? { kind: 'home' as const }
      return { back, view, tracks: NO_TRACKS, failed: '' }
    })
  },
  openHome() {
    set({ view: { kind: 'home' }, back: [], tracks: NO_TRACKS, failed: '' })
    void get().loadHome()
  },

  async openAudiobooks(tag, name, fresh = false) {
    const asked = tag ?? get().booksTag
    if (tag) get().open({ kind: 'audiobooks', tag, name: name ?? '' })
    else get().open({ kind: 'audiobooks', tag: asked, name: name ?? '' })
    const page = fresh ? get().booksPage + 1 : 1
    set({ booksTag: asked, loading: true, failed: '' })
    try {
      const [shelf, tags] = await Promise.all([
        audiobooks(asked, page),
        get().bookTags.length > 0 ? Promise.resolve({ tags: get().bookTags }) : bookTags(),
      ])
      set((state) => ({
        bookTags: tags.tags,
        books: page === 1 ? shelf.books : [...state.books, ...shelf.books],
        booksPage: page,
        booksMore: shelf.more,
        loading: false,
      }))
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  async openAudiobook(book) {
    get().open({ kind: 'audiobook', id: book.id, name: book.name, picture: book.picture })
    set({ loading: true, tracks: { ...NO_TRACKS, name: book.name, picture: book.picture } })
    try {
      const answer = await audiobookChapters(book, 1)
      set({
        loading: false,
        tracks: {
          songs: answer.songs,
          more: Boolean(answer.more),
          page: 1,
          loading: false,
          name: book.name,
          picture: book.picture,
        },
      })
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  async openFavorites() {
    get().open({ kind: 'favorites' })
    set({ favoritesNote: '', loading: true })
    try {
      const answer = await favourites(1)
      set({
        favorites: answer.playlists,
        favoritesMore: answer.more,
        loading: false,
        favoritesNote: answer.note === 'signin' || !answer.playlists.length ? (answer.note === 'signin' ? 'signin' : '') : '',
      })
    } catch (error) {
      const said = error instanceof Error ? error.message : ''
      set({
        favorites: [],
        favoritesMore: false,
        loading: false,
        // 20010 is the service saying nobody is signed in: the page asks for the QR itself.
        favoritesNote: /20010/.test(said) ? 'signin' : 'layer',
      })
    }
  },

  async startLogin() {
    set({ login: { ...get().login, open: true, busy: true, status: 1 } })
    try {
      const answer = await qrStart()
      set({ login: { open: true, key: answer.key, image: answer.image, status: 1, busy: false } })
    } catch {
      set({ login: { open: false, key: '', image: '', status: 0, busy: false } })
    }
  },

  async checkLogin() {
    const login = get().login
    if (!login.key) return
    try {
      const answer = await qrCheck(login.key)
      set({ account: answer.account, login: { ...login, status: answer.status } })
      if (answer.status === 4) {
        set({ login: { ...get().login, open: false } })
        if (get().view.kind === 'favorites') void get().openFavorites()
      }
    } catch {
      // A poll that didn't answer is not a dead QR: the next one will tell.
    }
  },

  closeLogin() {
    set({ login: { open: false, key: '', image: '', status: 0, busy: false } })
  },

  async signOutAccount() {
    try {
      await signOut()
    } catch {
      // The layer may already have forgotten it; the page forgets it either way.
    }
    set({ account: { signedIn: false, nickname: '', avatar: '', userId: 0 }, favorites: [], favoritesNote: '' })
  },

  async loadAccount() {
    try {
      const answer = await accountInfo()
      set({ account: answer.account })
    } catch {
      // No layer, no account card: the app still plays as a guest.
    }
  },

  async loadHome(fresh = false) {
    const page = fresh ? get().picksPage + 1 : 1
    set({ loading: get().picks.length === 0 })
    try {
      const answer = await playlists(page)
      set((state) => ({
        picks: page === 1 ? answer.playlists : [...state.picks, ...answer.playlists],
        picksPage: page,
        picksMore: answer.more,
        loading: false,
        failed: '',
      }))
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  async openRanks() {
    get().open({ kind: 'ranks' })
    if (get().charts.length > 0) return
    set({ loading: true })
    try {
      const answer = await ranks()
      set({ charts: answer.ranks, loading: false })
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  async openSingers() {
    get().open({ kind: 'singers' })
    if (get().artists.length > 0) return
    set({ loading: true })
    try {
      const answer = await singers()
      set({ artists: answer.singers, loading: false })
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  async openPlaylist(pick) {
    get().open({ kind: 'playlist', ...pick })
    set({ loading: true, tracks: { ...NO_TRACKS, name: pick.name, picture: pick.picture } })
    try {
      const answer = await playlistSongs(pick.id, 1)
      set({
        loading: false,
        tracks: {
          songs: answer.songs,
          more: Boolean(answer.more),
          page: 1,
          loading: false,
          name: answer.name || pick.name,
          picture: pick.picture,
        },
      })
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  async openRank(rank) {
    get().open({ kind: 'rank', id: rank.id, name: rank.name, picture: rank.picture })
    set({ loading: true, tracks: { ...NO_TRACKS, name: rank.name, picture: rank.picture } })
    try {
      const answer = await rankSongs(rank.id, 1)
      set({
        loading: false,
        tracks: {
          songs: answer.songs,
          more: answer.songs.length >= 30,
          page: 1,
          loading: false,
          name: rank.name,
          picture: rank.picture,
        },
      })
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  async openSinger(singer) {
    get().open({ kind: 'singer', id: singer.id, name: singer.name, picture: singer.picture })
    set({ loading: true, tracks: { ...NO_TRACKS, name: singer.name, picture: singer.picture } })
    try {
      const answer = await singerSongs(singer.id, 1)
      set({
        loading: false,
        tracks: {
          songs: answer.songs,
          more: answer.songs.length >= 30,
          page: 1,
          loading: false,
          name: singer.name,
          picture: singer.picture,
        },
      })
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  async search(words) {
    const trimmed = words.trim()
    if (!trimmed) return
    get().open({ kind: 'results', query: trimmed })
    set({ loading: true, tracks: { ...NO_TRACKS, name: trimmed } })
    try {
      const answer = await searchSongs(trimmed, 1)
      set({
        loading: false,
        tracks: { songs: answer.songs, more: answer.songs.length >= 20, page: 1, loading: false, name: trimmed, picture: '' },
      })
    } catch {
      set({ loading: false, failed: 'layer' })
    }
  },

  /** The page's own next page (a playlist's, a chart's, a search's). */
  async nextPage() {
    const state = get()
    const view = state.view
    const tracks = state.tracks
    if (tracks.loading || !tracks.more) return
    const page = tracks.page + 1
    set({ tracks: { ...tracks, loading: true } })
    try {
      let answer: SongsAnswer
      if (view.kind === 'playlist') answer = await playlistSongs(view.id, page)
      else if (view.kind === 'rank') answer = await rankSongs(view.id, page)
      else if (view.kind === 'singer') answer = await singerSongs(view.id, page)
      else if (view.kind === 'audiobook') answer = await audiobookChapters({ id: view.id, name: view.name, picture: view.picture }, page)
      else if (view.kind === 'results') answer = await searchSongs(view.query, page)
      else return
      const added = answer.songs
      set((now) => ({
        tracks: {
          ...now.tracks,
          songs: [...now.tracks.songs, ...added],
          page,
          loading: false,
          // A short page is the last one (only a search says it has more for certain).
          more: added.length > 0 && (now.view.kind === 'results' ? added.length >= 20 : added.length >= 30),
        },
      }))
    } catch {
      set((now) => ({ tracks: { ...now.tracks, loading: false } }))
    }
  },

  /** Asks the page showing again (a retry after the layer didn't answer). */
  async reload() {
    const state = get()
    const view = state.view
    set({ failed: '' })
    switch (view.kind) {
      case 'home':
        await state.loadHome(state.picks.length > 0)
        break
      case 'ranks':
        if (state.charts.length === 0) await state.openRanks()
        break
      case 'singers':
        if (state.artists.length === 0) await state.openSingers()
        break
      case 'audiobooks':
        await state.openAudiobooks(view.tag, view.name, false)
        break
      case 'audiobook':
        await state.openAudiobook({ id: view.id, name: view.name, picture: view.picture, author: '', intro: '', chapters: 0, plays: 0, note: '', date: '' })
        break
      case 'favorites':
        await state.openFavorites()
        break
      case 'playlist':
        await state.openPlaylist({ id: view.id, name: view.name, picture: view.picture, creator: view.creator })
        break
      case 'rank':
        await state.openRank({ id: view.id, name: view.name, picture: view.picture, note: '', issue: '' })
        break
      case 'singer':
        await state.openSinger({ id: view.id, name: view.name, picture: view.picture, songs: 0, fans: 0 })
        break
      case 'results':
        await state.search(view.query)
        break
    }
  },

  play(tracks, index, contextName) {
    streak = 0
    set({ playback: { tracks, index, playing: true, contextName } })
    const song = tracks[index]
    if (song) set({ recent: noteRecent(song) })
    void start(index)
    // The words page open: the song it was showing is gone, and the new one's words are asked for here —
    // switching songs never went through `setWords`, so the page kept the old `wordsFor` and read as a song
    // without words (owner 2026-11-28: 切歌后歌词加载不出来).
    if (song && get().wordsOpen) void get().loadWords(song)
  },
  toggle() {
    const playback = get().playback
    if (!playback) return
    if (get().sound === 'blocked' || get().sound === 'failed') {
      void start(playback.index)
      return
    }
    if (audio.paused) playWithFade()
    else pauseWithFade()
  },
  nextSong(auto = false) {
    const state = get()
    const playback = state.playback
    if (!playback) return
    const next = playback.index + 1
    if (next >= playback.tracks.length) {
      audio.pause()
      set({ playback: { ...playback, playing: false }, sound: auto ? 'idle' : state.sound })
      return
    }
    const song = playback.tracks[next]
    set({ playback: { ...playback, index: next, playing: true } })
    if (song) set({ recent: noteRecent(song) })
    void start(next)
    // The words page open: its words are the next song's (see `play`).
    if (song && get().wordsOpen) void get().loadWords(song)
  },
  previousSong() {
    const playback = get().playback
    if (!playback) return
    if (audio.currentTime > 4) {
      audio.currentTime = 0
      return
    }
    const before = Math.max(0, playback.index - 1)
    set({ playback: { ...playback, index: before, playing: true } })
    void start(before)
    // The words page open: its words are the one before this (see `play`).
    const song = playback.tracks[before]
    if (song && get().wordsOpen) void get().loadWords(song)
  },
  seek(seconds) {
    if (!Number.isFinite(audio.duration)) return
    audio.currentTime = Math.min(Math.max(0, seconds), audio.duration)
    set({ position: audio.currentTime })
  },
  setNow(open) {
    set({ nowOpen: open, wordsOpen: open ? get().wordsOpen : false })
    if (open) {
      const playback = get().playback
      const song = playback?.tracks[playback.index]
      if (song) void get().loadWords(song)
    }
  },
  setWords(open) {
    set({ wordsOpen: open })
    if (open) {
      const playback = get().playback
      const song = playback?.tracks[playback.index]
      if (song) void get().loadWords(song)
    }
  },
  async loadWords(song) {
    if (get().wordsFor === song.id && get().words !== null) return
    set({ wordsFor: song.id, words: null, wordsFailed: false })
    try {
      const answer = await songLyric(song)
      if (get().wordsFor !== song.id) return
      const words = parseLrc(answer.lrc || '', answer.translation || '')
      set({ words: words.lines.length > 0 ? words : null, wordsFailed: false })
    } catch {
      set({ words: null, wordsFailed: true })
    }
  },
}))

/** Asks the host where the shared layer is, once, as the app opens (its port is NetEase's too). */
export function followLayer(): () => void {
  return followLayerPort()
}

// --- as one of the cab's players (musicWithGame.ts, keybinds, the Dashboard's Now Playing) ----------

/** Whether KuGou plays here now: the song it shows is the one sounding. */
export function playingHere(): boolean {
  const playback = useKuGou.getState().playback
  return playback !== null && playback.playing && useKuGou.getState().sound === 'playing'
}

/** A song still on its way from the layer (it's about to play: a fade pauses it as it starts). */
export function pendingHere(): boolean {
  return useKuGou.getState().sound === 'loading'
}

/** Stops the sound where it is (the page shows it paused at once). */
export function pauseHere(): void {
  const playback = useKuGou.getState().playback
  if (!playback) return
  // The cab's pauses are immediate (the truck's electrics, the game away): no fade, and no ramp left hanging.
  stopRamp()
  audio.pause()
  setFade(1)
  useKuGou.setState({ playback: { ...playback, playing: false } })
}

/** Plays on from where it stopped. */
export function resumeHere(): void {
  const playback = useKuGou.getState().playback
  if (!playback) return
  stopRamp()
  soundLevel()
  void audio.play().catch(() => {
    // The sound didn't start (the stream gone): the page still says it plays, as the player asked.
  })
  useKuGou.setState({ playback: { ...playback, playing: true } })
}

/** The next song (1) or the one before (-1), as the app's own buttons. */
export function skipTrack(direction: 1 | -1): void {
  if (direction === 1) useKuGou.getState().nextSong()
  else useKuGou.getState().previousSong()
}

/** Called as the app's playing changes: `started` when it just began. */
export function subscribePlaying(changed: (started: boolean) => void): () => void {
  return useKuGou.subscribe((now, before) => {
    const plays = now.playback?.playing === true
    const played = before.playback?.playing === true
    if (plays && !played) changed(true)
    else if (!plays && played) changed(false)
  })
}

/**
 * What KuGou plays, as the Dashboard's Now Playing takes music, and its cover; `null` while nothing does.
 * The cover is the song's own picture, and the controls are the app's own (play/pause, next, the one before).
 */
export function useKuGouSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useKuGou((state) => state.playback)
  const sound = useKuGou((state) => state.sound)
  const position = useKuGou((state) => state.position)
  const duration = useKuGou((state) => state.duration)
  const track = playback ? playback.tracks[playback.index] : undefined
  if (!playback || !track) return null
  const playing = playback.playing && sound === 'playing'
  return {
    source: {
      id: 'westplay-kugou',
      service: 'kugou',
      title: track.name,
      artist: track.artists.join(' / '),
      album: track.album,
      artwork: track.picture || null,
      status: playing ? 'playing' : 'paused',
      // The bar's own numbers: the clock runs on from the moment they were read.
      positionMs: Math.round(position * 1000),
      positionAt: Date.now(),
      durationMs: Math.round(duration * 1000),
      controls: { playPause: true, next: true, previous: true, shuffle: false, repeat: false },
      shuffle: null,
      repeat: null,
    },
    artwork: track.picture || null,
  }
}
