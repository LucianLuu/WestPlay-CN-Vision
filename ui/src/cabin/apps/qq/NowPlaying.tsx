import type { CSSProperties, PointerEvent } from 'react'
import { useRef, useState } from 'react'
import type { AppleMusicTrack, Lyrics } from '../../../shared/host'
import {
  currentTrack,
  cycleRepeat,
  jumpTo,
  playOrPause,
  positionOf,
  seek,
  setVolume,
  skip,
  toggleFavorite,
  toggleShuffle,
  useAsked,
  useFavorite,
  useNow,
  useQqMusic,
  type Playback,
} from './qqMusic'
import { LyricsLines } from '../Lyrics'
import { Crossfade } from '../music/Crossfade'
import {
  ChevronDownGlyph,
  LyricsGlyph,
  NextGlyph,
  NoteGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  QueueGlyph,
  RepeatGlyph,
  RepeatOneGlyph,
  ShuffleGlyph,
  SpeakerGlyph,
  StarGlyph,
} from '../music/glyphs'
import { clock, trackCover } from '../music/look'
import { Cover, Explicit, Failed, Loading } from '../music/parts'

/**
 * The QQ app's mini player: a glass capsule at the foot while Now Playing is closed, then Now Playing over all.
 * Bound to the QQ store; the layout and CSS are the shared Music app's.
 */

export function MiniPlayer({ aside }: { aside: boolean }) {
  const playback = useQqMusic((state) => state.playback)
  const open = useQqMusic((state) => state.nowPlaying)
  const now = useNow(playback?.playing ?? false)
  const track = currentTrack(playback)
  const away = open || aside
  if (!playback || !track) return null
  const share = playback.duration > 0 ? positionOf(playback, now) / playback.duration : 0
  return (
    <div
      className={`am-mini glass${away ? ' away' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="正在播放"
      onClick={() => useQqMusic.setState({ nowPlaying: true })}
    >
      <Cover key={track.id} item={trackCover(track)} className="am-mini-cover" />
      <span className="am-mini-text">
        <span className="am-mini-name">{track.name}</span>
        <span className="am-mini-by">{track.artist}</span>
      </span>
      <button
        type="button"
        className="am-mini-button"
        aria-label={playback.playing ? '暂停' : '播放'}
        onClick={(event) => {
          event.stopPropagation()
          playOrPause()
        }}
      >
        {playback.playing ? <PauseGlyph size={36} /> : <PlayGlyph size={36} />}
      </button>
      <button
        type="button"
        className="am-mini-button"
        aria-label="下一首"
        onClick={(event) => {
          event.stopPropagation()
          skip(1)
        }}
      >
        <NextGlyph size={38} />
      </button>
      <span className={playback.loading ? 'am-mini-time loading' : 'am-mini-time'} style={{ '--share': share } as CSSProperties} />
    </div>
  )
}

export function NowPlaying() {
  const open = useQqMusic((state) => state.nowPlaying)
  const showQueue = useQqMusic((state) => state.queue)
  const showLyrics = useQqMusic((state) => state.lyrics)
  const playback = useQqMusic((state) => state.playback)
  const track = currentTrack(playback)
  if (!playback || !track) return null
  const close = () => useQqMusic.setState({ nowPlaying: false })
  return (
    <div className={`am-now${open ? ' open' : ''}`} aria-hidden={!open} style={{ '--cover': track.color } as CSSProperties}>
      <Crossfade value={track.image} className="music-backdrop" render={(url) => url && <img src={url} alt="" />} />
      <section className="app-panel music-app am-now-panel" aria-label="正在播放">
        <div className="music-layout">
          <div className="music-header">
            <button type="button" className="music-corner glass" aria-label="关闭" onClick={close}>
              <ChevronDownGlyph size={34} />
            </button>
            <div className="am-corners">
              <button
                type="button"
                className={showLyrics ? 'music-corner glass am-on' : 'music-corner glass'}
                aria-label="歌词"
                aria-pressed={showLyrics}
                onClick={() => useQqMusic.setState({ lyrics: !showLyrics, queue: false })}
              >
                <LyricsGlyph size={32} />
              </button>
              <button
                type="button"
                className={showQueue ? 'music-corner glass am-on' : 'music-corner glass'}
                aria-label="待播清单"
                aria-pressed={showQueue}
                onClick={() => useQqMusic.setState({ queue: !showQueue, lyrics: false })}
              >
                <QueueGlyph size={32} />
              </button>
            </div>
          </div>

          <div className="music-info">
            <div key={track.id} className={playback.direction === 1 ? 'am-now-text from-right' : 'am-now-text from-left'}>
              <span className="music-title">
                {track.name}
                {track.explicit && <Explicit />}
              </span>
              <span className="music-artist">{track.artist}</span>
              {track.album && <span className="music-album">{track.album}</span>}
            </div>

            <div className="music-controls">
              <button type="button" className="music-button" aria-label="上一首" onClick={() => skip(-1)}>
                <PreviousGlyph size={54} />
              </button>
              <button
                type="button"
                className="music-button primary"
                aria-label={playback.playing ? '暂停' : '播放'}
                onClick={playOrPause}
              >
                {playback.playing ? <PauseGlyph size={72} /> : <PlayGlyph size={72} />}
              </button>
              <button type="button" className="music-button" aria-label="下一首" onClick={() => skip(1)}>
                <NextGlyph size={54} />
              </button>
            </div>
          </div>

          {showQueue ? (
            <UpNext playback={playback} />
          ) : showLyrics ? (
            <Words key={`words:${track.id}`} playback={playback} track={track} />
          ) : (
            <div className="music-art">
              {track.image ? (
                <img src={track.image} alt="" />
              ) : (
                <div className="music-art-placeholder am-art-drawn" aria-hidden>
                  <NoteGlyph size={72} />
                </div>
              )}
            </div>
          )}

          <Progress key={`progress:${track.id}`} playback={playback} />

          <div className="music-extras am-extras">
            <button
              type="button"
              className={playback.shuffle ? 'music-button small active' : 'music-button small'}
              aria-label="随机"
              aria-pressed={playback.shuffle}
              onClick={toggleShuffle}
            >
              <ShuffleGlyph size={36} />
            </button>
            <button
              type="button"
              className={playback.repeat !== 'off' ? 'music-button small active' : 'music-button small'}
              aria-label="循环"
              aria-pressed={playback.repeat !== 'off'}
              onClick={cycleRepeat}
            >
              {playback.repeat === 'one' ? <RepeatOneGlyph size={36} /> : <RepeatGlyph size={36} />}
            </button>
            <FavoriteButton track={track} />
            {playback.volume !== null && <Volume volume={playback.volume} />}
          </div>
        </div>
      </section>
    </div>
  )
}

function FavoriteButton({ track }: { track: AppleMusicTrack }) {
  const favorite = useFavorite(track)
  return (
    <button
      type="button"
      className={favorite ? 'music-button small active' : 'music-button small'}
      aria-label="收藏"
      aria-pressed={favorite}
      onClick={() => toggleFavorite(track, favorite, { on: '已收藏', off: '已取消收藏' })}
    >
      <StarGlyph size={36} on={favorite} />
    </button>
  )
}

function shareAt(bar: HTMLElement, event: PointerEvent): number {
  const box = bar.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
}

function Volume({ volume }: { volume: number }) {
  const bar = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const before = useRef(volume || 0.5)
  return (
    <div className="am-volume">
      <button
        type="button"
        className="music-button small"
        aria-label={volume === 0 ? '取消静音' : '静音'}
        onClick={() => {
          if (volume > 0) before.current = volume
          setVolume(volume > 0 ? 0 : before.current, true)
        }}
      >
        <SpeakerGlyph size={34} volume={volume} />
      </button>
      <div
        ref={bar}
        className={dragging ? 'am-slider dragging' : 'am-slider'}
        role="slider"
        aria-label="音量"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(volume * 100)}
        style={{ '--share': volume } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          setVolume(shareAt(bar.current!, event))
        }}
        onPointerMove={(event) => {
          if (dragging) setVolume(shareAt(bar.current!, event))
        }}
        onPointerUp={(event) => {
          if (!dragging) return
          setVolume(shareAt(bar.current!, event), true)
          setDragging(false)
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <span className="am-slider-fill" />
      </div>
    </div>
  )
}

function Progress({ playback }: { playback: Playback }) {
  const now = useNow(playback.playing)
  const bar = useRef<HTMLDivElement>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  const length = playback.duration
  const position = dragged ?? positionOf(playback, now)
  const share = length > 0 ? position / length : 0
  return (
    <div className="music-progress">
      <span className="music-time">{clock(position)}</span>
      <div
        ref={bar}
        className={`am-slider am-time${dragged === null ? '' : ' dragging'}${playback.loading ? ' loading' : ''}`}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(length)}
        aria-valuenow={Math.round(position)}
        style={{ '--share': share } as CSSProperties}
        onPointerDown={(event) => {
          if (length <= 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragged(shareAt(bar.current!, event) * length)
        }}
        onPointerMove={(event) => {
          if (dragged !== null) setDragged(shareAt(bar.current!, event) * length)
        }}
        onPointerUp={(event) => {
          if (dragged === null) return
          seek(shareAt(bar.current!, event) * length)
          setDragged(null)
        }}
        onPointerCancel={() => setDragged(null)}
      >
        <span className="am-slider-fill" />
      </div>
      <span className="music-time">-{clock(Math.max(0, length - position))}</span>
    </div>
  )
}

function Words({ playback, track }: { playback: Playback; track: AppleMusicTrack }) {
  const asked = useAsked({ ask: 'lyrics', id: track.id })
  const now = useNow(playback.playing)
  const lyrics: Lyrics | null = asked.answer
  if (asked.failed) {
    return (
      <div className="am-lyrics-box">
        <Failed onRetry={asked.retry} />
      </div>
    )
  }
  if (!lyrics) {
    return (
      <div className="am-lyrics-box">
        <Loading />
      </div>
    )
  }
  if (lyrics.lines.length === 0) {
    return (
      <div className="am-lyrics-box">
        <p className="am-lyrics-none">暂无歌词</p>
      </div>
    )
  }
  return (
    <LyricsLines
      className="am-lyrics"
      lyrics={lyrics}
      position={positionOf(playback, now)}
      onSeek={seek}
    />
  )
}

/** 待播清单: the songs to come (from where it plays). Pressed, one plays. */
function UpNext({ playback }: { playback: Playback }) {
  const next = playback.tracks.slice(playback.index + 1, playback.index + 30)
  const title = playback.context?.name ? `来自 ${playback.context.name}` : '待播清单'
  return (
    <div className="am-up-next">
      <h3>{title}</h3>
      {next.length === 0 && <p className="am-empty">暂无待播歌曲</p>}
      {next.map((song, i) => (
        <button key={`${song.id}:${i}`} type="button" className="am-song" onClick={() => jumpTo(i + 1)}>
          <span className="am-song-cover">
            <Cover item={trackCover(song)} />
          </span>
          <span className="am-song-text">
            <span className="am-song-name">{song.name}</span>
            <span className="am-song-by">{song.artist}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
