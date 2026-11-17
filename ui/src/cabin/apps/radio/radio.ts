import { useMemo } from 'react'
import { create } from 'zustand'
import { isInHost, postToHost, type RadioCommand, type RadioPlayback, type RadioTrack } from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { cancelRadioRequests, queryRadio } from './api'

export interface RadioStation {
  id: number
  name: string
  coverSmall?: string
  coverLarge?: string
  programName?: string
  categoryId?: number
  categoryName?: string
  playUrl?: { aac24?: string; aac64?: string; ts24?: string; ts64?: string }
}

export interface RadioSchedule {
  programName: string
  startTime: string
  endTime: string
  programScheduleId?: number
  announcerList?: { announcerName: string }[]
}

export type ScheduleDay = 'yesterday' | 'today' | 'tomorrow'
export type Schedules = Record<'yesterdaySchedules' | 'todaySchedules' | 'tomorrowSchedules', RadioSchedule[]>

interface Location {
  id: number
  type: number
  name: string
}

interface Category {
  id: number
  name: string
}

export interface RadioState {
  stations: RadioStation[]
  total: number
  page: number
  loading: boolean
  error: string | null
  locations: Location[]
  categories: Category[]
  homeLoading: boolean
  homeError: string | null
  locationId: number
  locationTypeId: number
  categoryId: number
  tab: 'all' | 'favorites'
  favorites: RadioStation[]
  detail: RadioStation | null
  schedules: Schedules | null
  detailLoading: boolean
  detailError: string | null
  scheduleDay: ScheduleDay
  scheduleDate: string
  nowPlaying: boolean
  liveScheduleRadioId: number | null
  liveScheduleLoading: boolean
  liveSchedules: Schedules | null
  notice: string | null
  liveQueue: RadioTrack[]
  sessionRequestId: number | null
  pendingPlaybackTrack: RadioTrack | null
  playback: RadioPlayback | null
  playing: boolean
  volume: number
}

const KEY = 'westplay.radio.favorites'
export const secureCover = (url?: string) => url?.replace(/^http:\/\//, 'https://')

export function favoriteMetadata(items: unknown): RadioStation[] {
  if (!Array.isArray(items)) return []
  const unique = new Map<number, RadioStation>()
  for (const item of items) {
    if (!item || !Number.isInteger(item.id) || item.id <= 0 || typeof item.name !== 'string') continue
    unique.set(item.id, {
      id: item.id,
      name: item.name,
      coverSmall: secureCover(typeof item.coverSmall === 'string' ? item.coverSmall : undefined),
      coverLarge: secureCover(typeof item.coverLarge === 'string' ? item.coverLarge : undefined),
    })
  }
  return [...unique.values()]
}

function saved(): RadioStation[] {
  try {
    return favoriteMetadata(JSON.parse(localStorage.getItem(KEY) || '[]'))
  } catch {
    return []
  }
}

export const beijingDate = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10)

export function statusLabel(value: string, t: (zh: string, en: string) => string): string {
  if (value === 'playing') return t('直播中', 'LIVE')
  if (value === 'loading') return t('连接中…', 'Connecting…')
  if (value === 'failed') return t('连接失败 · 重试', 'Connection failed · Retry')
  return t('已暂停', 'Paused')
}

function scheduleBounds(item: RadioSchedule, day: ScheduleDay, date: string): { from: number; to: number } | null {
  const minutes = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value)
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN
  }
  const start = minutes(item.startTime)
  const end = minutes(item.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const base = Date.parse(date + 'T00:00:00+08:00') + (day === 'yesterday' ? -1 : day === 'tomorrow' ? 1 : 0) * 86400000
  const from = base + start * 60000
  const to = base + (end <= start ? end + 1440 : end) * 60000
  return to > from ? { from, to } : null
}

/** Whether a broadcast program is currently on air at `now` (Beijing UTC+8). */
export function scheduleIsLive(item: RadioSchedule, day: ScheduleDay, date: string, now = Date.now()): boolean {
  const bounds = scheduleBounds(item, day, date)
  return bounds !== null && now >= bounds.from && now < bounds.to
}

/** Fraction (`0..1`) elapsed for a currently airing broadcast, or `null` when not live. */
export function scheduleProgress(item: RadioSchedule, day: ScheduleDay, date: string, now = Date.now()): number | null {
  const bounds = scheduleBounds(item, day, date)
  if (!bounds || now < bounds.from || now >= bounds.to) return null
  return Math.min(1, Math.max(0, (now - bounds.from) / (bounds.to - bounds.from)))
}

export const useRadio = create<RadioState>(() => ({
  stations: [],
  total: 0,
  page: 1,
  loading: false,
  error: null,
  locations: [],
  categories: [],
  homeLoading: false,
  homeError: null,
  locationId: 0,
  locationTypeId: 0,
  categoryId: 0,
  tab: 'all',
  favorites: saved(),
  detail: null,
  schedules: null,
  detailLoading: false,
  detailError: null,
  scheduleDay: 'today',
  scheduleDate: beijingDate(),
  nowPlaying: false,
  liveScheduleRadioId: null,
  liveScheduleLoading: false,
  liveSchedules: null,
  notice: null,
  liveQueue: [],
  sessionRequestId: null,
  pendingPlaybackTrack: null,
  playback: null,
  playing: false,
  volume: 1,
}))

let listSequence = 0,
  detailSequence = 0,
  liveScheduleSequence = 0,
  homeSequence = 0,
  playbackSequence = 0

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

function send(command: RadioCommand): void {
  if (isInHost()) postToHost({ type: 'radio', command })
}

export function receiveRadioPlayback(playback: RadioPlayback | null): void {
  const state = useRadio.getState()
  if (playback?.requestId != null && state.sessionRequestId != null && playback.requestId !== state.sessionRequestId)
    return
  useRadio.setState({
    playback,
    playing: playback ? playback.status === 'playing' : false,
    ...(playback ? {} : { nowPlaying: false }),
  })
}

export async function loadRadioHome(): Promise<void> {
  const token = ++homeSequence
  useRadio.setState({ homeLoading: true, homeError: null })
  try {
    const data = (await queryRadio({ ask: 'radioHome' })) as {
      modules?: { type?: string; moduleType?: string; locations?: Location[]; categories?: Category[] }[]
    }
    if (token !== homeSequence) return
    const search = data.modules?.find((m) => m.locations && m.categories)
    if (!search) throw new Error('Missing radio filters')
    useRadio.setState({ locations: search.locations, categories: search.categories, homeLoading: false })
  } catch (error) {
    if (token === homeSequence) useRadio.setState({ homeLoading: false, homeError: message(error) })
  }
}

export async function loadRadioList(page = 1): Promise<void> {
  const token = ++listSequence,
    s = useRadio.getState()
  useRadio.setState({ loading: true, error: null, page })
  try {
    const data = (await queryRadio({
      ask: 'radioList',
      locationId: s.locationId,
      locationTypeId: s.locationTypeId,
      categoryId: s.categoryId,
      pageNum: page,
    })) as { radios?: RadioStation[]; total?: number }
    if (token !== listSequence) return
    if (!Array.isArray(data.radios)) throw new Error('Invalid radio directory')
    useRadio.setState({
      stations: data.radios.map((s) => ({
        ...s,
        coverSmall: secureCover(s.coverSmall),
        coverLarge: secureCover(s.coverLarge),
      })),
      total: data.total || 0,
      loading: false,
    })
  } catch (error) {
    if (token === listSequence) useRadio.setState({ loading: false, error: message(error) })
  }
}

export function setRadioFilter(locationId: number, locationTypeId: number, categoryId: number): void {
  useRadio.setState({ locationId, locationTypeId, categoryId })
  void loadRadioList(1)
}

export function setRadioTab(tab: RadioState['tab']): void {
  closeRadioDetail()
  useRadio.setState({ tab })
}

export function setScheduleDay(scheduleDay: ScheduleDay): void {
  useRadio.setState({ scheduleDay })
}

export function toggleRadioFavorite(station: RadioStation): void {
  const current = useRadio.getState().favorites
  const next = current.some((s) => s.id === station.id)
    ? current.filter((s) => s.id !== station.id)
    : favoriteMetadata([station, ...current])
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    useRadio.setState({ favorites: next, notice: null })
  } catch {
    useRadio.setState({ notice: 'storage' })
  }
}

export function radioTrack(station: RadioStation): RadioTrack {
  return {
    id: 'radio-' + station.id,
    radioId: station.id,
    title: station.programName || station.name,
    artist: station.name,
    artwork: secureCover(station.coverLarge || station.coverSmall),
  }
}

export function playTrack(track?: RadioTrack, queue?: RadioTrack[]): void {
  const state = useRadio.getState()
  if (!track && state.pendingPlaybackTrack) {
    playTrack(state.pendingPlaybackTrack, state.liveQueue)
    return
  }
  const requestId = ++playbackSequence
  if (!track) {
    if (!state.playback) return
    useRadio.setState({
      sessionRequestId: requestId,
      playback: { ...state.playback, status: 'loading', requestId, error: undefined },
      playing: false,
    })
    if (useRadio.getState().sessionRequestId !== requestId) return
    send({ action: 'play', requestId })
    return
  }
  const newQueue = queue?.length ? queue.slice() : state.liveQueue.length ? state.liveQueue : [track]
  useRadio.setState({
    sessionRequestId: requestId,
    pendingPlaybackTrack: track,
    playback: {
      title: track.title,
      artist: track.artist,
      artwork: track.artwork,
      status: 'loading',
      radioId: track.radioId,
      requestId,
    },
    playing: false,
    liveQueue: newQueue,
  })
  if (useRadio.getState().sessionRequestId !== requestId) return
  send({ action: 'volume', percent: Math.round(state.volume * 100) })
  send({ action: 'play', track, requestId })
  if (useRadio.getState().sessionRequestId === requestId) useRadio.setState({ pendingPlaybackTrack: null })
}

export function playRadio(station: RadioStation, list = useRadio.getState().stations): void {
  if (!isInHost()) {
    useRadio.setState({ notice: 'host' })
    return
  }
  const snapshot = list.some((s) => s.id === station.id) ? list : [station]
  playTrack(radioTrack(station), snapshot.map(radioTrack))
}

export function pausePlayback(): void {
  const { playback } = useRadio.getState()
  const requestId = ++playbackSequence
  useRadio.setState({
    sessionRequestId: requestId,
    playing: false,
    playback: playback ? { ...playback, requestId, status: 'paused' } : null,
  })
  send(playback ? { action: 'pause', requestId } : { action: 'pause' })
}

export function playOrPauseRadio(): void {
  const { playing, playback } = useRadio.getState()
  if (playing || playback?.status === 'loading') pausePlayback()
  else playTrack()
}

export function pauseOrResumeRadio(): void {
  playOrPauseRadio()
}

export function skipRadio(direction: 1 | -1): void {
  const state = useRadio.getState()
  const queue = state.liveQueue
  if (!queue.length) return
  const index = queue.findIndex((t) => t.radioId === state.playback?.radioId)
  const from = index >= 0 ? index : 0
  playTrack(queue[(from + direction + queue.length) % queue.length], queue)
}

/** Sets the volume it plays at (0 to 1) without making it the player's choice: a fade's step. */
export function sendVolume(share: number): void {
  const bounded = Math.max(0, Math.min(1, share))
  send({ action: 'volume', percent: Math.round(bounded * 100) })
}

/** Sets the volume it plays at (0 to 1) as the player's choice (the slider or a keybind). */
export function setVolume(share: number): void {
  const bounded = Math.max(0, Math.min(1, share))
  useRadio.setState({ volume: bounded })
  sendVolume(bounded)
}

export async function loadRadioDetail(station: RadioStation, refresh = false): Promise<void> {
  const token = ++detailSequence
  const date = beijingDate()
  useRadio.setState({
    detail: station,
    detailLoading: true,
    detailError: null,
    ...(refresh ? {} : { schedules: null, scheduleDay: 'today' as const }),
  })
  const results = await Promise.allSettled([
    queryRadio({ ask: 'radioDetail', radioId: station.id }),
    queryRadio({ ask: 'radioSchedule', radioId: station.id }),
  ])
  if (token !== detailSequence) return
  const [detail, schedule] = results
  const errors = results.filter((r) => r.status === 'rejected').map((r) => message((r as PromiseRejectedResult).reason))
  useRadio.setState({
    detailLoading: false,
    detailError: errors.join(' · ') || null,
    ...(detail.status === 'fulfilled' ? { detail: { ...station, ...(detail.value as RadioStation) } } : {}),
    ...(schedule.status === 'fulfilled' ? { schedules: schedule.value as Schedules, scheduleDate: date } : {}),
  })
}

export function setRadioNowPlaying(nowPlaying: boolean): void {
  useRadio.setState({ nowPlaying })
}

export async function loadLiveSchedule(radioId: number, refresh = false): Promise<void> {
  const s = useRadio.getState()
  if (!refresh && s.liveScheduleRadioId === radioId && s.liveSchedules) return
  const token = ++liveScheduleSequence
  const date = beijingDate()
  useRadio.setState({
    liveScheduleRadioId: radioId,
    liveScheduleLoading: true,
    ...(refresh || s.liveScheduleRadioId !== radioId ? { liveSchedules: null } : {}),
  })
  try {
    const data = (await queryRadio({ ask: 'radioSchedule', radioId })) as Schedules
    if (token !== liveScheduleSequence) return
    useRadio.setState({
      liveScheduleRadioId: radioId,
      liveScheduleLoading: false,
      liveSchedules: data,
      scheduleDate: date,
    })
  } catch {
    if (token === liveScheduleSequence) useRadio.setState({ liveScheduleLoading: false })
  }
}

export function closeRadioDetail(): void {
  ++detailSequence
  useRadio.setState({ detail: null, schedules: null, detailError: null, detailLoading: false })
}

export function resetRadioSession(): void {
  cancelRadioRequests()
  ++detailSequence
  ++liveScheduleSequence
  ++listSequence
  ++homeSequence
  useRadio.setState({
    loading: false,
    homeLoading: false,
    detailLoading: false,
    liveScheduleLoading: false,
    nowPlaying: false,
    stations: [],
    locations: [],
    categories: [],
    detail: null,
    schedules: null,
    liveScheduleRadioId: null,
    liveSchedules: null,
  })
}

export function useRadioSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useRadio((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-radio',
        service: 'radio',
        title: playback.title,
        artist: playback.artist,
        album: '',
        artwork: playback.artwork ?? null,
        status: playback.status === 'playing' ? 'playing' : 'paused',
        positionMs: 0,
        positionAt: 0,
        durationMs: 0,
        controls: { playPause: true, next: true, previous: true, shuffle: false, repeat: false },
        shuffle: false,
        repeat: null,
      },
    }
  }, [playback])
}
