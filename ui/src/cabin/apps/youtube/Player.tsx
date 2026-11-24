import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { YouTubeComment, YouTubeDetail, YouTubeVideo } from '../../../shared/host'
import { formatClock } from './time'
import { useCabin } from '../../state/store'
import { useText } from '../../state/text'
import {
  BackGlyph,
  CaptionsGlyph,
  CheckGlyph,
  ForwardGlyph,
  FullScreenGlyph,
  HomeGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  QueueGlyph,
  ReplayGlyph,
  SettingsGlyph,
  VolumeGlyph,
} from './glyphs'
import { Thumbnail } from './YouTubeApp'
import {
  ask,
  closePlayer,
  comingUp,
  command,
  followArea,
  leavePlayer,
  currentSite,
  nextVideo,
  openChannel,
  play,
  playPart,
  previousVideo,
  QUALITIES,
  seekBy,
  setAudioTrack,
  setCaptions,
  setQuality,
  setRate,
  setStableVolume,
  setVoiceBoost,
  setVolume,
  stopVideo,
  toggleMute,
  useYouTube,
} from './youtube'

/** How long the controls stay after the last touch, ms. */
const CONTROLS_MS = 3000
/** Two taps this close are a double tap, ms. */
const DOUBLE_TAP_MS = 300
/** How long the "10 seconds" stays after the last tap, during which each tap adds 10 more, ms. */
const SKIP_MS = 800
const SKIP_SECONDS = 10
/** How long the volume stays on the picture after the wheel or an arrow key last changed it, ms. */
const VOLUME_HINT_MS = 1400
/** How much one turn of the wheel, or one arrow key, changes the volume. */
const VOLUME_STEP = 5

type Side = 'back' | 'forward'

/**
 * YouTube's player, full screen over the whole CarPlay area (only the truck's own strip beside it), as on
 * YouTube's TV app. The video itself is YouTube's, in its own WebView under this page (the host places it
 * where the CarPlay area is: `show`); this draws only what's over it: a cover with the video's thumbnail
 * until it plays, and YouTube's new controls, each in its own translucent shape, on a touch.
 */
export function Player() {
  const open = useYouTube((store) => store.open)
  const app = useCabin((state) => state.navigation.route)
  const handedOver = useCabin((state) => state.truckScreen)
  // Going elsewhere (a shortcut, the Dashboard's widget) or handing the screen to the truck leaves the player;
  // the video plays on, and YouTube opens on it again.
  useEffect(() => {
    if (open && (handedOver || app.kind !== 'app' || app.app !== 'youtube')) leavePlayer()
  }, [open, app, handedOver])
  return open ? <OpenPlayer /> : null
}

function OpenPlayer() {
  const text = useText()
  const current = useYouTube((store) => store.current)
  const state = useYouTube((store) => store.state)
  const upNext = useYouTube((store) => store.upNext)
  const playlist = useYouTube((store) => store.queue)
  const coming = comingUp({ queue: playlist, upNext, current })
  const [controls, setControls] = useState(true)
  const [queue, setQueue] = useState(false)
  // The captions' or the quality's choices, open over the controls.
  const [menu, setMenu] = useState<Menu | null>(null)
  const touched = useRef(0)
  // Taps on the picture: the last one (its side, and the single tap's action waiting for a second), and the
  // seconds skipped by double taps, shown on their side.
  const lastTap = useRef<{ at: number; side: Side | null; single?: ReturnType<typeof setTimeout> }>({
    at: -Infinity,
    side: null,
  })
  const [skip, setSkip] = useState<{ side: Side; seconds: number; at: number } | null>(null)
  useEffect(() => {
    if (!skip) return
    const timer = setTimeout(() => setSkip(null), SKIP_MS)
    return () => clearTimeout(timer)
  }, [skip])
  useEffect(() => () => clearTimeout(lastTap.current.single), [])

  // Bilibili's own page: its picture full where the window is (`full`: the details beside it put away), and its
  // controls only while the pointer is on the picture (owner 2026-11-22).
  const [full, setFull] = useState(false)
  const [hover, setHover] = useState(false)
  // Bilibili's page: its video on the left, its details (and Up next) beside it, its parts under them.
  const bilibili = currentSite() === 'bilibili'
  // Its player page is always dark (its client's own, and the owner's ask: "播放页默认深色"), even when the
  // app's page around it is light.
  const dark = useYouTube((store) => store.dark) || bilibili

  // Full screen (Bilibili's own): Esc gives the details back.
  useEffect(() => {
    if (!full) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [full])

  // The part of its series playing (its own `?p=`): what 选集 asks for.
  const part = useYouTube((store) => store.part)

  // The volume, shown on the picture while it's changed by the wheel or the arrow keys (as its player shows it).
  const [volumeHint, setVolumeHint] = useState<number | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const nudgeVolume = (delta: number) => {
    const now = useYouTube.getState()
    const level = Math.round(Math.min(100, Math.max(0, (now.muted ? 0 : now.volume) + delta)))
    setVolume(level)
    setHover(true)
    touch()
    setVolumeHint(level)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setVolumeHint(null), VOLUME_HINT_MS)
  }
  useEffect(() => () => clearTimeout(hintTimer.current), [])

  // The arrow keys turn it down or up, as the player's own do; the wheel over the picture too.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      // A field of the page's own takes the keys (the page's search).
      const field = event.target as HTMLElement | null
      if (field && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA' || field.isContentEditable)) return
      event.preventDefault()
      nudgeVolume(event.key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // The video where the CarPlay area is, in the frame's pixels; again if the frame changes. Bilibili's own
  // player is one pane of its page (the details beside it), so the picture takes the left of the area there.
  // Laid out first (`useLayoutEffect`): the pane has its size by then, and the first show isn't a zero box.
  useLayoutEffect(() => {
    const place = () => {
      const area = document.querySelector(bilibili ? '.yt-stage' : '.carplay')?.getBoundingClientRect()
      // Not laid out yet (or nothing to place): asked again next frame.
      if (!area || area.width < 2 || area.height < 2) {
        const again = requestAnimationFrame(place)
        return () => cancelAnimationFrame(again)
      }
      const scale = window.devicePixelRatio
      command({
        action: 'show',
        x: Math.round(area.left * scale),
        y: Math.round(area.top * scale),
        width: Math.round(area.width * scale),
        height: Math.round(area.height * scale),
      })
    }
    // Once now, and once more after the first paint (a font, a row of details, changes the pane's size).
    const first = requestAnimationFrame(place)
    const second = setTimeout(place, 120)
    // Bilibili's pane is its own element (the details beside it change its width), so it's watched too.
    const stop = followArea(place, document.querySelector('.yt-stage') ?? undefined)
    return () => {
      cancelAnimationFrame(first)
      clearTimeout(second)
      stop()
    }
  }, [bilibili, current?.video, dark, full])

  const mine = state !== null && state.video === current?.video
  // Started: it has played once (the cover goes for good).
  const [started, setStarted] = useState<string | null>(null)
  if (mine && state.state === 1 && started !== current?.video) setStarted(current?.video ?? null)
  const playing = mine && state.state === 1
  const ended = mine && state.state === 0
  const buffering = mine && started === current?.video && state.state === 3

  // The controls go after a while, unless paused, ended, or showing Up next or a menu.
  const touch = () => {
    touched.current = performance.now()
    setControls(true)
  }
  useEffect(() => {
    if (!controls || !playing || queue || menu) return
    const timer = setTimeout(() => setControls(false), CONTROLS_MS)
    return () => clearTimeout(timer)
  }, [controls, playing, queue, menu])

  // One ends: the next plays, as YouTube's autoplay.
  useEffect(() => {
    if (!ended || current?.live) return
    const next = nextVideo()
    if (next) play(next)
  }, [ended, current])

  if (!current) return null
  const cover = started !== current.video
  if (bilibili) {
    const previous = previousVideo()
    const quality = mine && state?.qualityLabel ? biliQuality(state.qualityLabel) : '自动'
    return (
      // `yt-player` is the class the shell knows (`.carplay.watching` keeps it and the sidebar, hiding the
      // rest): without it the page would be hidden and Bilibili's own would show through.
      <div className={`yt-player yt-bili-player${dark ? ' bili-dark' : ''}${full ? ' full' : ''}`}>
        {/* Bilibili's own window: its bar across the top (back to the app, and the videos either side), the
            picture under it (the host draws the video at `.yt-stage`), the details beside it (put away full). */}
        <div className="yt-bili-main">
          <div className="bili-topbar">
            <button type="button" className="bili-home" onClick={stopVideo}>
              <HomeGlyph />
              <span>回到主界面</span>
            </button>
            <div className="bili-nav">
              <button
                type="button"
                aria-label={text.previous}
                disabled={!previous}
                onClick={() => previous && play(previous)}
              >
                <BackGlyph />
              </button>
              <button
                type="button"
                aria-label={text.next}
                disabled={!coming.length}
                onClick={() => {
                  const next = nextVideo()
                  if (next) play(next)
                }}
              >
                <ForwardGlyph />
              </button>
            </div>
          </div>
          {/* The picture's own box, and its controls over it — only while the pointer is on the picture
              (Bilibili's own player), none of them drawn otherwise. */}
          <div
            className={hover || menu ? 'yt-stage shown' : 'yt-stage'}
            onPointerMove={() => setHover(true)}
            onPointerLeave={() => {
              if (!menu) setHover(false)
            }}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return
              setHover(true)
              if (menu) {
                setMenu(null)
                return
              }
              // A tap on the picture plays or pauses it, as Bilibili's own.
              if (ended) command({ action: 'seek', seconds: 0 })
              command({ action: playing ? 'pause' : 'play' })
            }}
            onWheel={(event) => {
              // The wheel over the picture turns the sound, up or down, as its player's own does.
              if (event.deltaY === 0) return
              event.stopPropagation()
              nudgeVolume(event.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP)
            }}
          >
            {cover && (
              <div className="yt-cover">
                {current.thumbnail && <img referrerPolicy="no-referrer" src={current.thumbnail} alt="" />}
                <div className="yt-spinner large" role="progressbar" />
              </div>
            )}
            {buffering && <div className="yt-spinner large floating" role="progressbar" />}
            {/* The volume, while the wheel or the arrow keys change it. */}
            {volumeHint !== null && (
              <div key={volumeHint} className="bili-volume-hint" aria-live="polite">
                <VolumeGlyph muted={volumeHint === 0} />
                <span>{volumeHint}%</span>
              </div>
            )}
            {skip && (
              <div key={skip.at} className={`yt-skip ${skip.side}`} aria-live="polite">
                <span className="yt-skip-arrows" aria-hidden="true">
                  {skip.side === 'back' ? '◀◀' : '▶▶'}
                </span>
                {text.youtube.seconds(skip.seconds)}
              </div>
            )}
            {/* Its controls, as its client's: the progress across the top (pink played), then play, the time, the
                danmaku, and the picture's own choices on the right. */}
            <div className="bili-overlay" onPointerDown={(event) => event.stopPropagation()}>
              <div className="bili-progress">
                <Progress />
              </div>
              <div className="bili-row">
                <button
                  type="button"
                  className="bili-icon play"
                  aria-label={playing ? text.pause : text.play}
                  onClick={() => {
                    setHover(true)
                    if (ended) command({ action: 'seek', seconds: 0 })
                    command({ action: playing ? 'pause' : 'play' })
                  }}
                >
                  {ended ? <ReplayGlyph /> : playing ? <PauseGlyph /> : <PlayGlyph />}
                </button>
                <span className="bili-time">
                  {current.live || state?.live ? (
                    <span className="yt-badge live">{text.youtube.live}</span>
                  ) : (
                    <Time />
                  )}
                </span>
                <span className="bili-grow" />
                <button
                  type="button"
                  className="bili-label"
                  disabled={!mine || state.qualities.length === 0}
                  onClick={() => setMenu(menu === 'quality' ? null : 'quality')}
                >
                  {quality}
                </button>
                <button
                  type="button"
                  className="bili-label"
                  disabled={!mine || state.rates.length <= 1}
                  onClick={() => setMenu(menu === 'speed' ? null : 'speed')}
                >
                  {mine && state.rate !== 1 ? `${state.rate}×` : '倍速'}
                </button>
                <button
                  type="button"
                  className="bili-icon"
                  aria-label={text.youtube.settings}
                  disabled={!mine}
                  onClick={() => setMenu(menu === 'settings' ? null : 'settings')}
                >
                  <SettingsGlyph />
                </button>
                <Volume onTouch={() => setHover(true)} />
                <button
                  type="button"
                  className="bili-icon"
                  aria-label={full ? '退出全屏' : '全屏'}
                  aria-pressed={full}
                  onClick={() => {
                    setFull(!full)
                    setHover(true)
                  }}
                >
                  <FullScreenGlyph />
                </button>
              </div>
              {menu === 'settings' && <SettingsMenu onChosen={() => setMenu(null)} />}
              {menu === 'quality' && <SettingsMenu onChosen={() => setMenu(null)} start="quality" />}
              {menu === 'speed' && <SettingsMenu onChosen={() => setMenu(null)} start="speed" />}
            </div>
          </div>
        </div>
        <BilibiliDetails
          video={current}
          part={part}
          upNext={coming}
          onPlay={play}
          onPart={(page) => playPart(current, page)}
        />
      </div>
    )
  }
  return (
    <div
      className={`yt-player${controls ? ' controls' : ''}`}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        // A tap off an open menu only closes it.
        if (menu) {
          setMenu(null)
          touch()
          return
        }
        // A tap on the picture shows the controls, or hides them; a double tap on its left or right third
        // goes 10 seconds back or on (each tap after it 10 more), as YouTube's. A tap on a side waits a
        // moment for a second one.
        const toggle = () => {
          if (controls && playing && performance.now() - touched.current > 300) setControls(false)
          else touch()
        }
        const box = event.currentTarget.getBoundingClientRect()
        const across = (event.clientX - box.left) / box.width
        // Sides skip only in a video that has somewhere to skip to (YouTube has it, and it isn't live).
        const skippable = mine && !state.live && !current.live
        const side: Side | null = !skippable ? null : across < 1 / 3 ? 'back' : across > 2 / 3 ? 'forward' : null
        const now = performance.now()
        const last = lastTap.current
        const skipping = side !== null && skip?.side === side && now - skip.at < SKIP_MS
        if (side && (skipping || (last.side === side && now - last.at < DOUBLE_TAP_MS))) {
          clearTimeout(last.single)
          lastTap.current = { at: -Infinity, side: null }
          seekBy(side === 'back' ? -SKIP_SECONDS : SKIP_SECONDS)
          setSkip({ side, seconds: (skipping ? skip.seconds : 0) + SKIP_SECONDS, at: now })
          return
        }
        clearTimeout(last.single)
        lastTap.current = { at: now, side, single: side ? setTimeout(toggle, DOUBLE_TAP_MS) : undefined }
        if (!side) toggle()
      }}
      onPointerMove={() => controls && touch()}
      onWheel={(event) => {
        // The wheel over the picture turns the sound, up or down, as the player's own does.
        if (event.deltaY === 0) return
        event.stopPropagation()
        nudgeVolume(event.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP)
      }}
    >
      {cover && (
        <div className="yt-cover">
          {current.thumbnail && <img referrerPolicy="no-referrer" src={current.thumbnail} alt="" />}
          <div className="yt-spinner large" role="progressbar" />
        </div>
      )}
      {buffering && <div className="yt-spinner large floating" role="progressbar" />}
      {skip && (
        <div key={skip.at} className={`yt-skip ${skip.side}`} aria-live="polite">
          <span className="yt-skip-arrows" aria-hidden="true">
            {skip.side === 'back' ? '◀◀' : '▶▶'}
          </span>
          {text.youtube.seconds(skip.seconds)}
        </div>
      )}

      <div className="yt-player-top">
        <button
          type="button"
          className="glass clear no-lens yt-round big"
          aria-label={text.youtube.back}
          onClick={closePlayer}
        >
          <BackGlyph />
        </button>
        <div className="yt-player-title">
          {current.title}
          {current.channelId ? (
            <button
              type="button"
              className="yt-player-channel"
              onClick={() => {
                const { channelId, channel, avatar } = current
                closePlayer()
                if (channelId) openChannel({ channel: channelId, name: channel, avatar })
              }}
            >
              {current.channel}
            </button>
          ) : (
            <span>{current.channel}</span>
          )}
        </div>
      </div>

      {queue ? (
        <div className="yt-upnext">
          <Progress />
          <h4>{playlist ? playlist.title : text.youtube.upNext}</h4>
          <div className="yt-upnext-cards">
            {[current, ...coming.slice(0, 3)].map((video, index) => (
              <button
                key={video.video}
                type="button"
                className={index === 0 ? 'yt-card now' : 'yt-card'}
                onClick={() => {
                  setQueue(false)
                  if (index > 0) play(video)
                }}
              >
                <Thumbnail video={video} />
                <span className="yt-title">{video.title}</span>
                <span className="yt-sub">{index === 0 ? text.youtube.nowPlaying : video.channel}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="yt-player-bottom">
          <Progress />
          <div className="yt-controls">
            <button
              type="button"
              className="glass clear no-lens yt-pill"
              aria-label={text.previous}
              onClick={() => {
                touch()
                // Back to its start, or (at its start) the video before.
                const before = previousVideo()
                if ((state?.time ?? 0) > 5 || !before) command({ action: 'seek', seconds: 0 })
                else play(before)
              }}
            >
              <PreviousGlyph />
            </button>
            <button
              type="button"
              className="glass clear no-lens yt-round big play"
              aria-label={playing ? text.pause : text.play}
              onClick={() => {
                touch()
                if (ended) command({ action: 'seek', seconds: 0 })
                command({ action: playing ? 'pause' : 'play' })
              }}
            >
              {ended ? <ReplayGlyph /> : playing ? <PauseGlyph /> : <PlayGlyph />}
            </button>
            <button
              type="button"
              className="glass clear no-lens yt-pill"
              aria-label={text.next}
              disabled={!coming.length}
              onClick={() => {
                const next = nextVideo()
                if (next) play(next)
              }}
            >
              <NextGlyph />
            </button>
            <Volume onTouch={touch} />
            <div className="glass clear no-lens yt-pill yt-time">
              {current.live || state?.live ? <span className="yt-badge live">{text.youtube.live}</span> : <Time />}
            </div>
            <span className="yt-spacer" />
            <button
              type="button"
              className={`glass clear no-lens yt-pill yt-cc${mine && state.caption ? ' on' : ''}`}
              aria-label={text.youtube.captions}
              aria-pressed={menu === 'captions'}
              disabled={!mine || state.captions.length === 0}
              onClick={() => {
                touch()
                setMenu(menu === 'captions' ? null : 'captions')
              }}
            >
              <CaptionsGlyph />
            </button>
            <button
              type="button"
              className="glass clear no-lens yt-pill yt-gear"
              aria-label={text.youtube.settings}
              aria-pressed={menu === 'settings'}
              disabled={!mine || state.qualities.length === 0}
              onClick={() => {
                touch()
                setMenu(menu === 'settings' ? null : 'settings')
              }}
            >
              <SettingsGlyph />
              {mine && sharpness(state.qualityLabel) && <span className="yt-hd">{sharpness(state.qualityLabel)}</span>}
            </button>
            <button
              type="button"
              className="glass clear no-lens yt-pill"
              aria-label={text.youtube.upNext}
              disabled={!coming.length}
              onClick={() => {
                touch()
                setMenu(null)
                setQueue(true)
              }}
            >
              <QueueGlyph />
            </button>
          </div>
          {menu === 'captions' && <CaptionsMenu onChosen={() => setMenu(null)} />}
          {menu === 'settings' && <SettingsMenu onChosen={() => setMenu(null)} />}
        </div>
      )}
      {queue && (
        <button type="button" className="yt-upnext-dismiss" aria-label={text.close} onClick={() => setQueue(false)} />
      )}
    </div>
  )
}

/**
 * Bilibili's own details beside its video: who uploaded it and their numbers, the video's own numbers, its
 * description, its parts (a series' episodes: each plays on its own), and what comes next under them.
 */
function BilibiliDetails({
  video,
  part,
  upNext,
  onPlay,
  onPart,
}: {
  video: YouTubeVideo
  part: number
  upNext: YouTubeVideo[]
  onPlay(video: YouTubeVideo): void
  onPart(page: number): void
}) {
  const [detail, setDetail] = useState<YouTubeDetail | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setDetail(null)
    setFailed(false)
    ask({ action: 'detail', video: video.video })
      .then((answer) => {
        if (live) setDetail(answer.detail ?? null)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [video.video])
  // What's beside the video: its own description (简介) or its comments (评论), as its page's two tabs.
  const [tab, setTab] = useState<'intro' | 'comments'>('intro')
  const [sort, setSort] = useState<'hot' | 'new'>('hot')
  const [comments, setComments] = useState<YouTubeComment[]>([])
  const [more, setMore] = useState<string | null>(null)
  const [commentsState, setCommentsState] = useState<'loading' | 'done' | 'failed'>('loading')
  useEffect(() => {
    if (tab !== 'comments') return
    let live = true
    setComments([])
    setMore(null)
    setCommentsState('loading')
    ask({ action: 'comments', video: video.video, sort })
      .then((answer) => {
        if (!live) return
        setComments(answer.failed ? [] : (answer.comments ?? []))
        setMore(answer.failed ? null : (answer.more ?? null))
        setCommentsState(answer.failed ? 'failed' : 'done')
      })
      .catch(() => live && setCommentsState('failed'))
    return () => {
      live = false
    }
  }, [tab, sort, video.video])
  const more_comments = () => {
    if (!more) return
    setCommentsState('loading')
    ask({ action: 'comments', video: video.video, sort, more }).then((answer) => {
      setComments((now) => [...now, ...(answer.comments ?? [])])
      setMore(answer.failed ? null : (answer.more ?? null))
      setCommentsState(answer.failed ? 'failed' : 'done')
    })
  }
  const parts = detail?.parts ?? []
  return (
    <aside className="yt-bili-side">
      {/* Its two tabs, as its page has them over the details: the video's own, or its comments. */}
      <div className="bili-detail-tabs">
        <button
          type="button"
          className={tab === 'intro' ? 'bili-detail-tab on' : 'bili-detail-tab'}
          aria-pressed={tab === 'intro'}
          onClick={() => setTab('intro')}
        >
          简介
        </button>
        <button
          type="button"
          className={tab === 'comments' ? 'bili-detail-tab on' : 'bili-detail-tab'}
          aria-pressed={tab === 'comments'}
          onClick={() => setTab('comments')}
        >
          评论
        </button>
      </div>
      <div className="yt-bili-scroll">
        {tab === 'comments' ? (
          <>
            <div className="bili-sorts">
              <button
                type="button"
                className={sort === 'hot' ? 'bili-sort on' : 'bili-sort'}
                aria-pressed={sort === 'hot'}
                onClick={() => setSort('hot')}
              >
                最热
              </button>
              <button
                type="button"
                className={sort === 'new' ? 'bili-sort on' : 'bili-sort'}
                aria-pressed={sort === 'new'}
                onClick={() => setSort('new')}
              >
                最新
              </button>
            </div>
            {comments.map((comment) => (
              <article key={comment.id} className="bili-comment">
                <div className="bili-comment-who">
                  {comment.avatar ? (
                    <img referrerPolicy="no-referrer" className="bili-comment-face" src={comment.avatar} alt="" />
                  ) : (
                    <span className="bili-comment-face blank" />
                  )}
                  <span className="bili-comment-name">{comment.name}</span>
                </div>
                <p className="bili-comment-text">{comment.text}</p>
                <div className="bili-comment-foot">
                  {comment.time && <span>{comment.time}</span>}
                  {comment.likes && <span>{comment.likes} 赞</span>}
                  {comment.replies > 0 && <span>共 {comment.replies} 条回复</span>}
                </div>
              </article>
            ))}
            {commentsState === 'loading' && <div className="yt-spinner" role="progressbar" />}
            {commentsState === 'failed' && comments.length === 0 && (
              <p className="bili-desc">Bilibili 没有给出评论。</p>
            )}
            {commentsState === 'done' && comments.length === 0 && <p className="bili-desc">还没有评论。</p>}
            {more && commentsState !== 'loading' && (
              <button type="button" className="bili-comments-more" onClick={more_comments}>
                查看更多评论
              </button>
            )}
          </>
        ) : (
          <>
            {/* Who uploaded it, and their numbers. */}
            <div className="bili-up">
              {detail?.avatar ? (
                <img referrerPolicy="no-referrer" className="bili-up-face" src={detail.avatar} alt="" />
              ) : (
                <span className="bili-up-face blank" />
              )}
              <div className="bili-up-text">
                <span className="bili-up-name">{detail?.channel || video.channel}</span>
                <span className="bili-up-note">
                  {failed ? '详情未能加载' : detail ? `${detail.views} · ${detail.pubdate}` : '正在加载…'}
                </span>
              </div>
              <button type="button" className="bili-follow">
                关注
              </button>
            </div>
            {/* The video's own numbers, as Bilibili's row of them. */}
            {detail && (
              <div className="bili-stats">
                <span>
                  <b>{detail.likes}</b>点赞
                </span>
                <span>
                  <b>{detail.coins}</b>投币
                </span>
                <span>
                  <b>{detail.favorites}</b>收藏
                </span>
                <span>
                  <b>{detail.danmaku}</b>弹幕
                </span>
              </div>
            )}
            <h2 className="bili-video-title">{video.title}</h2>
            {detail?.desc && <p className="bili-desc">{detail.desc}</p>}
            {/* A series' episodes: each its own part, the one playing lit. */}
            {parts.length > 1 && (
              <div className="bili-parts">
                <span className="bili-parts-title">{`选集 · ${parts.length}`}</span>
                <div className="bili-parts-grid">
                  {parts.map((one) => (
                    <button
                      key={one.cid}
                      type="button"
                      className={one.page === part ? 'bili-part on' : 'bili-part'}
                      title={`${one.page}. ${one.title}`}
                      aria-pressed={one.page === part}
                      onClick={() => onPart(one.page)}
                    >
                      {one.page}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* What comes next, Bilibili's own list under the details. */}
            {upNext.length > 0 && (
              <div className="bili-next">
                <span className="bili-next-title">接下来播放</span>
                {upNext.map((next) => (
                  <button key={next.video} type="button" className="bili-next-row" onClick={() => onPlay(next)}>
                    <span className="bili-next-thumb">
                      {next.thumbnail ? <img referrerPolicy="no-referrer" src={next.thumbnail} alt="" loading="lazy" /> : null}
                      {next.duration && <span className="bili-next-length">{next.duration}</span>}
                    </span>
                    <span className="bili-next-text">
                      <span className="bili-next-name">{next.title}</span>
                      <span className="bili-next-sub">{next.channel}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

/** Where the video is, between YouTube's reports: run on by the clock while it plays. */
function usePosition(): { time: number; duration: number } {
  const state = useYouTube((store) => store.state)
  const at = useYouTube((store) => store.stateAt)
  const [now, setNow] = useState(() => performance.now())
  const playing = state?.state === 1
  useEffect(() => {
    if (!playing) return
    let frame = requestAnimationFrame(function tick() {
      setNow(performance.now())
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])
  if (!state) return { time: 0, duration: 0 }
  const run = playing ? Math.max(0, (now - at) / 1000) : 0
  return { time: Math.min(state.time + run, state.duration || Infinity), duration: state.duration }
}

/** The red bar: what's played, with its dot; a press seeks there. */
function Progress() {
  const { time, duration } = usePosition()
  const live = useYouTube((store) => store.state?.live ?? false)
  const played = duration > 0 && !live ? (time / duration) * 100 : live ? 100 : 0
  return (
    <div
      className="yt-bar"
      onPointerDown={(event) => {
        if (live || duration <= 0) return
        const bar = event.currentTarget.getBoundingClientRect()
        const at = Math.min(1, Math.max(0, (event.clientX - bar.left) / bar.width))
        command({ action: 'seek', seconds: at * duration })
      }}
    >
      <span className="yt-bar-played" style={{ width: `${played}%` }} />
      <span className="yt-bar-dot" style={{ left: `${played}%` }} />
    </div>
  )
}

function Time() {
  const { time, duration } = usePosition()
  return (
    <span>
      {formatClock(time)} / {formatClock(duration)}
    </span>
  )
}

/** The sound, the player's own for every video: muted or not, and how loud (the slider is pressed or dragged
 * to a level). */
function Volume({ onTouch }: { onTouch(): void }) {
  const text = useText()
  const volume = useYouTube((store) => store.volume)
  const muted = useYouTube((store) => store.muted)
  const shown = muted ? 0 : volume
  // Where the pointer is along the slider, as a volume.
  const at = (slider: HTMLElement, x: number) => {
    const box = slider.getBoundingClientRect()
    return Math.min(1, Math.max(0, (x - box.left) / box.width)) * 100
  }
  return (
    <div className="glass clear no-lens yt-pill yt-volume">
      <button
        type="button"
        aria-label={text.youtube.volume}
        onClick={() => {
          onTouch()
          toggleMute()
        }}
      >
        <VolumeGlyph muted={shown === 0} />
      </button>
      <span
        className="yt-volume-slider"
        role="slider"
        aria-label={text.youtube.volume}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        onPointerDown={(event) => {
          // Grabbed: it follows the pointer, anywhere on the page, until let go.
          const slider = event.currentTarget
          onTouch()
          setVolume(at(slider, event.clientX))
          const drag = (move: PointerEvent) => {
            const next = Math.round(at(slider, move.clientX))
            if (next !== useYouTube.getState().volume || useYouTube.getState().muted) setVolume(next)
            onTouch()
          }
          const release = () => {
            window.removeEventListener('pointermove', drag)
            window.removeEventListener('pointerup', release)
            window.removeEventListener('pointercancel', release)
          }
          window.addEventListener('pointermove', drag)
          window.addEventListener('pointerup', release)
          window.addEventListener('pointercancel', release)
        }}
      >
        <span className="yt-volume-level" style={{ width: `${shown}%` }} />
      </span>
    </div>
  )
}

type Menu = 'captions' | 'settings' | 'quality' | 'speed'

/** Bilibili's word for a picture's sharpness ("1080p60": "1080P 高清"; a 4K one: "4K 超清"). */
function biliQuality(label: string): string {
  const lines = /^(\d{3,4})/.exec(label)?.[1] ?? ''
  if (!lines) return label || '自动'
  return Number(lines) >= 2160 ? '4K 超清' : `${lines}P 高清`
}

/** YouTube's word over its gear for a sharp picture ("720p60": HD; 2160p and over: 4K), or none. */
function sharpness(label: string): string | null {
  const lines = parseInt(label, 10)
  return lines >= 2160 ? '4K' : lines >= 720 ? 'HD' : null
}

/** A quality's label from YouTube's name for it, when YouTube gave none (`hd1080`: "1080p"). */
const LINES: Record<string, string> = {
  tiny: '144p',
  small: '240p',
  medium: '360p',
  large: '480p',
  hd720: '720p',
  hd1080: '1080p',
  hd1440: '1440p',
  hd2160: '2160p',
  hd2880: '2880p',
  highres: '4320p',
}

/** A list of choices, the one chosen ticked. */
function Choices<T extends string | number | null>({
  options,
  chosen,
  onChoose,
}: {
  options: { value: T; label: string }[]
  chosen: T
  onChoose(value: T): void
}) {
  return (
    <div className="yt-sheet-options">
      {options.map((option) => (
        <button
          key={String(option.value ?? 'off')}
          type="button"
          role="menuitemradio"
          aria-checked={option.value === chosen}
          onClick={() => onChoose(option.value)}
        >
          <span className="yt-sheet-tick">{option.value === chosen && <CheckGlyph />}</span>
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** The captions' choices (the CC button's): off, or one of the video's tracks. */
function CaptionsMenu({ onChosen }: { onChosen(): void }) {
  const text = useText()
  const state = useYouTube((store) => store.state)
  if (!state) return null
  return (
    <div className="yt-sheet" role="menu" aria-label={text.youtube.captions}>
      <h4>{text.youtube.captions}</h4>
      <Choices
        options={[
          { value: null, label: text.youtube.off },
          ...state.captions.map((t) => ({ value: t.track, label: t.name })),
        ]}
        chosen={state.caption}
        onChoose={(track: string | null) => {
          setCaptions(track)
          onChosen()
        }}
      />
    </div>
  )
}

/** How a speed reads ("Normal", "1.5×"). */
function speedName(rate: number, normal: string): string {
  return rate === 1 ? normal : `${rate}×`
}

/**
 * The gear's settings, as YouTube's app has them: a row each, with what it is now; a row pressed opens its
 * choices (back to the rows with the arrow), a switch turns over where it is. Quality (YouTube's own, with
 * the one playing, or one the video has: chosen, it's the most for every video after, the best each has at
 * or under it); playback speed (on the videos after too); the audio track (a video with dubbed ones);
 * Stable volume and Voice boost (a video that offers them).
 */
function SettingsMenu({ onChosen, start }: { onChosen(): void; start?: 'quality' | 'speed' }) {
  const text = useText()
  const state = useYouTube((store) => store.state)
  const quality = useYouTube((store) => store.quality)
  const [page, setPage] = useState<'quality' | 'speed' | 'audio' | null>(start ?? null)
  if (!state) return null
  const qualities = [
    {
      value: 'auto',
      label: `${text.youtube.auto}${quality === 'auto' && state.qualityLabel ? ` (${state.qualityLabel})` : ''}`,
    },
    ...state.qualities.map((q) => ({ value: q.quality, label: q.label || LINES[q.quality] || q.quality })),
  ]
  // The one chosen, or (chosen above what this video has) the one it plays at.
  const most = QUALITIES.indexOf(quality)
  const chosenQuality =
    quality === 'auto'
      ? 'auto'
      : (state.qualities.find((q) => QUALITIES.indexOf(q.quality) <= most)?.quality ??
        state.qualities.at(-1)?.quality ??
        'auto')
  const speeds = state.rates.map((rate) => ({ value: rate, label: speedName(rate, text.youtube.normal) }))
  const tracks = state.audioTracks.map((track) => ({ value: track.id, label: track.name }))
  const pages = {
    quality: {
      title: text.youtube.quality,
      list: (
        <Choices options={qualities} chosen={chosenQuality} onChoose={(q: string) => (setQuality(q), onChosen())} />
      ),
    },
    speed: {
      title: text.youtube.playbackSpeed,
      list: <Choices options={speeds} chosen={state.rate} onChoose={(rate: number) => (setRate(rate), onChosen())} />,
    },
    audio: {
      title: text.youtube.audioTrack,
      list: (
        <Choices
          options={tracks}
          chosen={state.audioTrack ?? ''}
          onChoose={(id: string) => (setAudioTrack(id), onChosen())}
        />
      ),
    },
  }
  if (page) {
    return (
      <div className="yt-sheet" role="menu" aria-label={pages[page].title}>
        <button type="button" className="yt-sheet-back" onClick={() => setPage(null)}>
          <BackGlyph />
          {pages[page].title}
        </button>
        {pages[page].list}
      </div>
    )
  }
  const row = (key: 'quality' | 'speed' | 'audio', label: string, value: string) => (
    <button key={key} type="button" className="yt-sheet-row" onClick={() => setPage(key)}>
      <span>{label}</span>
      <span className="yt-sheet-value">{value}</span>
      <span className="yt-sheet-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  )
  const toggle = (key: string, label: string, on: boolean, turn: (on: boolean) => void) => (
    <button key={key} type="button" role="switch" aria-checked={on} className="yt-sheet-row" onClick={() => turn(!on)}>
      <span>{label}</span>
      <span className={on ? 'yt-switch on' : 'yt-switch'} aria-hidden="true" />
    </button>
  )
  const playing = state.audioTracks.find((track) => track.id === state.audioTrack)
  return (
    <div className="yt-sheet" role="menu" aria-label={text.youtube.settings}>
      <div className="yt-sheet-options">
        {state.qualities.length > 0 &&
          row('quality', text.youtube.quality, qualities.find((q) => q.value === chosenQuality)?.label ?? '')}
        {state.rates.length > 1 && row('speed', text.youtube.playbackSpeed, speedName(state.rate, text.youtube.normal))}
        {state.audioTracks.length > 1 && row('audio', text.youtube.audioTrack, playing?.name ?? '')}
        {state.stableVolume !== null &&
          toggle('stable', text.youtube.stableVolume, state.stableVolume, setStableVolume)}
        {state.voiceBoost !== null && toggle('voice', text.youtube.voiceBoost, state.voiceBoost, setVoiceBoost)}
      </div>
    </div>
  )
}
