import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react'
import {
  DownGlyph,
  HeartGlyph,
  LyricsGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  QueueGlyph,
  RepeatGlyph,
  ShuffleGlyph,
  VolumeGlyph,
} from './glyphs'
import { Crossfade } from '../music/Crossfade'
import { songCover } from './look'
import { coverColour, hueOf, tintOf, washFrom } from './look'
import { useWordsOver } from '../music/contrast'
import { lineAt, type Words } from './lyrics'
import {
  currentTrack,
  cycleRepeat,
  jumpTo,
  openSongAlbum,
  openSongArtist,
  type Playback,
  playOrPause,
  positionOf,
  seek,
  setVolume,
  skip,
  type Song,
  toggleLiked,
  toggleShuffle,
  useNetease,
  useWords,
} from './netease'
import { Cover } from './parts'
import { clock } from './time'
import { WORDS } from './words'

/** The app's player: the bar at the foot of the app, and Now Playing over it. */

/**
 * The bar at the foot of the app: the cover, the song and its artists, Play or Pause, and a hairline of its time
 * along the bottom. Pressed, Now Playing rises over the app.
 */
export function MiniPlayer({ aside }: { aside: boolean }) {
  const playback = useNetease((state) => state.playback)
  const open = useNetease((state) => state.nowPlaying)
  useTicker(playback?.playing ?? false)
  const track = currentTrack(playback)
  if (!playback || !track) return null
  const share = playback.duration > 0 ? positionOf(playback) / playback.duration : 0
  return (
    <div
      className={open || aside ? 'ne-mini away' : 'ne-mini'}
      role="button"
      tabIndex={0}
      aria-label={WORDS.nowPlaying}
      onClick={() => useNetease.setState({ nowPlaying: true })}
    >
      <Cover item={songCover(track)} className="ne-mini-cover" />
      <span className="ne-mini-text">
        <span className="ne-mini-name">{track.name}</span>
        <span className="ne-mini-artists">{track.artists.join(' / ')}</span>
      </span>
      <button
        type="button"
        className="ne-mini-play"
        aria-label={playback.playing ? WORDS.pause : WORDS.play}
        onClick={(event) => {
          event.stopPropagation()
          playOrPause()
        }}
      >
        {playback.playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <span className="ne-mini-time" style={{ '--share': share } as CSSProperties} />
    </div>
  )
}

/**
 * Now Playing, over the app (it rises from the bar): washed in the song's colour, its cover large — or its words,
 * or the queue, in the cover's place — its names, the time, and NetEase's own controls, shuffle and repeat lit
 * while they're on.
 */
/** A song that isn't one: what the wash reads before anything plays (it draws nothing). */
const EMPTY_SONG: Song = {
  id: 0,
  name: '',
  artists: [],
  artistIds: [],
  album: '',
  albumId: 0,
  picture: '',
  duration: 0,
  fee: null,
}

/**
 * The wash Now Playing is drawn in: the song's cover's own colour, read once per picture (`coverColour`) and
 * kept for as long as that picture is what plays. The song's name gives the hue until the cover answers (and
 * where it can't be read at all), so the page is never a flash of the wrong colour.
 */
function useWash(track: Song): string {
  const [wash, setWash] = useState<string>(() => tintOf(track.name, track.id))
  useEffect(() => {
    const fallback = hueOf(track.name, track.id)
    setWash(`hsl(${fallback} 38% 30%)`)
    let current = true
    // A cover the layer didn't send (a song with no picture): the name's own colour stands.
    if (!track.picture) return () => {
      current = false
    }
    void coverColour(track.picture).then((colour) => {
      if (current) setWash(washFrom(colour, hueOf(track.name, track.id)))
    })
    return () => {
      current = false
    }
  }, [track.picture, track.name, track.id])
  return wash
}

/**
 * What the words sit on in this page (the shape `wordsOver` takes): the blurred cover, faint under the wash
 * the page paints over it. The cover's own share of the colour is small there, so a pale one still reads light
 * enough to want dark words.
 */
const BACKDROP = {
  light: { cover: 0.22, rest: [236, 232, 236] as [number, number, number] },
  dark: { cover: 0.22, rest: [232, 228, 232] as [number, number, number] },
}

export function NowPlaying() {
  const open = useNetease((state) => state.nowPlaying)
  const showLyrics = useNetease((state) => state.lyrics)
  const showQueue = useNetease((state) => state.queue)
  const playback = useNetease((state) => state.playback)
  const track = currentTrack(playback)
  useTicker(playback?.playing ?? false)
  // The cover's own colour, as the page's wash (reading the picture is a hook: it runs whether or not the
  // sheet is open, so it's already read the moment it is).
  const wash = useWash(track ?? EMPTY_SONG)
  // Whether the words should be dark here, read off the cover the way the cursor and Apple Music's glass do:
  // a pale cover takes dark words (owner 2026-11-20 — white ones were lost on it). The page shows its words
  // over the blurred cover under a dark wash, so that veil is what they sit on.
  const words = useWordsOver(track?.picture ?? null, 'light', BACKDROP)
  if (!playback || !track) return null
  const close = () => useNetease.setState({ nowPlaying: false })
  const toArtist = () => {
    close()
    openSongArtist(track)
  }
  return (
    <div
      className={open ? 'ne-now open' : 'ne-now'}
      style={{ '--song': wash } as CSSProperties}
      data-words={words}
      aria-hidden={!open}
    >
      {/* The cover itself, blown up and blurred under a dark wash: the page's colour comes from the song,
          which is what QQ Music's Now Playing does (`music-backdrop`). The flat gradient alone gave the
          words nothing to sit on and read as one colour filling the box. */}
      <Crossfade
        value={track.picture}
        className="music-backdrop ne-backdrop"
        render={(url) => url && <img src={url} alt="" />}
      />
      <div className="ne-now-head">
        <button type="button" className="ne-icon" aria-label={WORDS.close} onClick={close}>
          <DownGlyph />
        </button>
        <div className="ne-now-from">
          {playback.context && (
            <>
              <span>{WORDS.playingFrom}</span>
              <b>{playback.context.name}</b>
            </>
          )}
        </div>
        <div className="ne-now-tools">
          <LikeButton song={track} />
          <button
            type="button"
            className={showLyrics ? 'ne-icon on' : 'ne-icon'}
            aria-label={WORDS.lyrics}
            aria-pressed={showLyrics}
            onClick={() => useNetease.setState({ lyrics: !showLyrics, queue: false })}
          >
            <LyricsGlyph />
          </button>
          <button
            type="button"
            className={showQueue ? 'ne-icon on' : 'ne-icon'}
            aria-label={WORDS.queue}
            aria-pressed={showQueue}
            onClick={() => useNetease.setState({ queue: !showQueue, lyrics: false })}
          >
            <QueueGlyph />
          </button>
        </div>
      </div>

      <div className="ne-now-body">
        <div className="ne-now-side">
          <div className="ne-now-text">
            <span key={track.id} className="ne-now-name">
              {track.name}
            </span>
            <span className="ne-now-artists">
              {track.artists.map((artist, i) => (
                <span key={`${artist}:${i}`}>
                  {i > 0 && ' / '}
                  {i === 0 && track.artistIds.length > 0 ? (
                    <button type="button" onClick={toArtist}>
                      {artist}
                    </button>
                  ) : (
                    artist
                  )}
                </span>
              ))}
            </span>
            {track.album && (
              <button
                type="button"
                className="ne-now-album"
                onClick={() => {
                  close()
                  openSongAlbum(track)
                }}
              >
                {track.album}
              </button>
            )}
          </div>
        </div>

        {/* The square, as QQ Music has it: the cover, the words, or the queue — the same box either way,
            so switching between them doesn't move the page around. */}
        <div className="ne-now-art">
          {showQueue ? (
            <Queue playback={playback} />
          ) : showLyrics ? (
            <Words song={track} playback={playback} />
          ) : (
            <Cover key={track.id} item={songCover(track)} className="ne-now-cover" />
          )}
        </div>
      </div>

      <div className="ne-now-foot">
        {playback.sound === 'unplayable' ? <NoRight song={track} /> : <Progress playback={playback} />}
        <div className="ne-now-row">
          <div className="ne-controls">
            <button
              type="button"
              className={playback.shuffle ? 'ne-control on' : 'ne-control'}
              aria-label={WORDS.shuffle}
              aria-pressed={playback.shuffle}
              onClick={toggleShuffle}
            >
              <ShuffleGlyph />
            </button>
            <button type="button" className="ne-control big" aria-label={WORDS.previous} onClick={() => skip(-1)}>
              <PreviousGlyph />
            </button>
            <button
              type="button"
              className="ne-control ne-now-play"
              aria-label={playback.playing ? WORDS.pause : WORDS.play}
              onClick={() => playOrPause()}
            >
              {playback.playing ? <PauseGlyph /> : <PlayGlyph />}
            </button>
            <button type="button" className="ne-control big" aria-label={WORDS.next} onClick={() => skip(1)}>
              <NextGlyph />
            </button>
            <button
              type="button"
              className={playback.repeat !== 'off' ? 'ne-control on' : 'ne-control'}
              aria-label={WORDS.repeat}
              aria-pressed={playback.repeat !== 'off'}
              onClick={cycleRepeat}
            >
              <RepeatGlyph one={playback.repeat === 'one'} />
            </button>
          </div>
          {/* Beside the controls, at their right: short enough not to take the row (owner 2026-11-20). */}
          <Volume />
        </div>
      </div>
    </div>
  )
}

/**
 * 收藏: the heart on the song playing, filled once it's in 我喜欢的音乐 and lighting as it's pressed. Pressed
 * again, the song comes back out. Not signed in, it's there but inert (a guest has no 我喜欢的音乐 to put a
 * song in), and it says so rather than looking broken.
 */
function LikeButton({ song }: { song: Song }) {
  const signedIn = useNetease((state) => state.account?.signedIn === true)
  const liked = useNetease((state) => state.liked?.includes(song.id) === true)
  const working = useNetease((state) => state.liking.includes(song.id))
  return (
    <button
      type="button"
      className={`ne-icon ne-like${liked ? ' on' : ''}${working ? ' working' : ''}`}
      aria-label={liked ? WORDS.unlike : WORDS.like}
      aria-pressed={liked}
      title={signedIn ? (liked ? WORDS.unlike : WORDS.like) : WORDS.likeSignedOut}
      disabled={!signedIn || working}
      onClick={() => void toggleLiked(song.id)}
    >
      <HeartGlyph on={liked} />
    </button>
  )
}

/** A song the service won't give here: said in the time bar's place, plainly. */
function NoRight({ song }: { song: Song }) {
  return (
    <p className="ne-unsung" role="status">
      {WORDS.noRightFor(song.name)}
    </p>
  )
}

/** Re-renders while `running`, four times a second: the bar runs on between the sound's own ticks. */
function useTicker(running: boolean): void {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [running])
}

/** The player's volume: its speaker (pressed, it silences, or comes back), and its bar. */
function Volume() {
  const volume = useNetease((state) => state.volume.level)
  const bar = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const before = useRef(volume || 0.8)
  const at = (event: PointerEvent) => {
    const box = bar.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
  }
  return (
    <div className="ne-volume">
      <button
        type="button"
        className="ne-icon"
        aria-label={volume === 0 ? WORDS.unmute : WORDS.mute}
        onClick={() => {
          if (volume > 0) {
            before.current = volume
            setVolume(0)
          } else {
            setVolume(before.current)
          }
        }}
      >
        <VolumeGlyph volume={volume} />
      </button>
      <div
        ref={bar}
        className={dragging ? 'ne-bar dragging' : 'ne-bar'}
        role="slider"
        aria-label={WORDS.volume}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(volume * 100)}
        style={{ '--share': volume } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          setVolume(at(event))
        }}
        onPointerMove={(event) => {
          if (dragging) setVolume(at(event))
        }}
        onPointerUp={(event) => {
          if (dragging) setVolume(at(event))
          setDragging(false)
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <span className="ne-bar-fill" />
        <span className="ne-bar-knob" />
      </div>
    </div>
  )
}

/** The song's time: its bar (dragged, it seeks) and the two times under it. */
function Progress({ playback }: { playback: Playback }) {
  const bar = useRef<HTMLDivElement>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  const position = dragged ?? positionOf(playback)
  const share = playback.duration > 0 ? position / playback.duration : 0
  const at = (event: PointerEvent) => {
    const box = bar.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * playback.duration
  }
  return (
    <div className="ne-progress">
      <div
        ref={bar}
        className={dragged === null ? 'ne-bar' : 'ne-bar dragging'}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(playback.duration)}
        aria-valuenow={Math.round(position)}
        style={{ '--share': share } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragged(at(event))
        }}
        onPointerMove={(event) => {
          if (dragged !== null) setDragged(at(event))
        }}
        onPointerUp={(event) => {
          if (dragged === null) return
          seek(at(event))
          setDragged(null)
        }}
        onPointerCancel={() => setDragged(null)}
      >
        <span className="ne-bar-fill" />
        <span className="ne-bar-knob" />
      </div>
      <div className="ne-times">
        <span>{clock(position)}</span>
        <span>{clock(playback.duration)}</span>
      </div>
    </div>
  )
}

/**
 * The song's words, in the cover's place: the line sung lit and kept in the middle, the ones sung dimmer, the ones
 * to come paler; a line pressed plays the song from it. The translation sits under its own line where the service
 * has one. A song with no words (or words the layer couldn't give) says so.
 */
function Words({ song, playback }: { song: Song; playback: Playback }) {
  const asked = useWords(song.id)
  if (asked.failed) {
    return (
      <div className="ne-lyrics-card note">
        <p>{WORDS.lyricsFailed}</p>
      </div>
    )
  }
  if (!asked.words) {
    return (
      <div className="ne-lyrics-card note">
        <p>{WORDS.noLyrics}</p>
      </div>
    )
  }
  return (
    <LyricLines key={song.id} words={asked.words} position={positionOf(playback)} onSeek={seek} />
  )
}

/** How long the reader's own scrolling holds the words where they put them before the song leads them again. */
const HELD = 4000

/**
 * The words themselves: the line sung kept in the card's middle; pressed, the song plays from it.
 *
 * The sung line is centred by its own place in the column, not by the scroller's: its `offsetTop` is measured
 * against the scroller's own content, and half the scroller's seen height taken off it, so it lands in the
 * middle whatever the card's size (a coach's short screen, a wide one). The column's blank first and last
 * stretches (`::before`/`::after`) give the first and last lines the same room, so even they can reach it.
 *
 * Exported for KuGou's app (`apps/kugou`): it is the one words page both music apps show, so the words read
 * the same whichever service the song came from.
 */
export function LyricLines({ words, position, onSeek }: { words: Words; position: number; onSeek(seconds: number): void }) {
  const box = useRef<HTMLDivElement>(null)
  const held = useRef(0)
  const first = useRef(true)
  const current = words.synced ? lineAt(words.lines, position) : -1
  useEffect(() => {
    const scroller = box.current
    if (!scroller || !words.synced || performance.now() < held.current) return
    const line = scroller.querySelectorAll<HTMLElement>('.ne-lyric')[Math.max(0, current)]
    if (!line) return
    // The line sung in the middle of the card.
    const top = line.offsetTop - scroller.clientHeight / 2 + line.offsetHeight / 2
    scroller.scrollTo({ top: Math.max(0, top), behavior: first.current ? 'auto' : 'smooth' })
    first.current = false
  }, [current, words])
  const hold = () => {
    held.current = performance.now() + HELD
  }
  return (
    <div ref={box} className="ne-lyrics" onWheel={hold} onPointerDown={hold}>
      {!words.synced && <p className="ne-lyrics-note">{WORDS.lyricsPlain}</p>}
      {words.lines.map((line, index) => {
        const state = !words.synced ? '' : index === current ? ' now' : index < current ? ' sung' : ''
        const body = (
          <>
            <span className="ne-lyric-text">{line.text || '\u00a0'}</span>
            {line.translation && <span className="ne-lyric-translation">{line.translation}</span>}
          </>
        )
        return words.synced ? (
          <button
            key={index}
            type="button"
            className={`ne-lyric${state}`}
            onClick={() => {
              held.current = 0
              onSeek(line.start)
            }}
          >
            {body}
          </button>
        ) : (
          <p key={index} className={`ne-lyric${state}`}>
            {body}
          </p>
        )
      })}
    </div>
  )
}

/** The queue: the song now, then the songs to come from where it plays. Pressed, one plays. */
function Queue({ playback }: { playback: Playback }) {
  const track = currentTrack(playback)!
  const next = playback.tracks.slice(playback.index + 1, playback.index + 14)
  return (
    <div className="ne-queue">
      <h3>{WORDS.nowPlaying}</h3>
      <QueueRow song={track} current />
      {next.length > 0 && <h3>{WORDS.upNext}</h3>}
      {next.map((song, i) => (
        <QueueRow key={`${song.id}:${i}`} song={song} onPlay={() => jumpTo(i + 1)} />
      ))}
    </div>
  )
}

function QueueRow({ song, current = false, onPlay }: { song: Song; current?: boolean; onPlay?(): void }) {
  return (
    <button
      type="button"
      className={current ? 'ne-queue-row current' : 'ne-queue-row'}
      onClick={onPlay}
      disabled={current}
    >
      <Cover item={songCover(song)} />
      <span className="ne-queue-text">
        <span className="ne-queue-name">{song.name}</span>
        <span className="ne-queue-artists">{song.artists.join(' / ')}</span>
      </span>
    </button>
  )
}
