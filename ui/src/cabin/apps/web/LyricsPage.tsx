import { useCabin } from '../../state/store'
import { useText } from '../../state/text'
import { useEffect } from 'react'
import {
  ChevronDownGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  SpeakerGlyph,
} from '../music/glyphs'
import { LyricsLines } from '../Lyrics'
import { SITE_NAMES } from './WebAppScreen'
import { command, shownPlaying, useWebApp } from './webapp'

/**
 * The web app's words, whole, over the screen: the dashboard's Now Playing, its lyrics button pressed, opens
 * them. The site's name and the song above, the line sung lit and kept a third of the way down, the rest dimmed
 * (the same `LyricsLines` Apple Music's and Spotify's Now Playing use); the cover, blurred, behind them. The
 * words and the song's place come from the page itself (westplay_host::webapp, its own lyrics): WestPlay draws
 * them as it draws its own players', and presses no line to seek (the page's own is its business).
 */
export function WebAppLyrics() {
  const open = useWebApp((state) => state.lyricsOpen)
  const lyrics = useWebApp((state) => state.lyrics)
  const at = useWebApp((state) => state.lyricAt)
  const media = useWebApp((state) => state.media)
  const site = useWebApp((state) => state.site)
  const volume = useWebApp((state) => state.volume)
  const albumArt = useCabin((state) => state.albumArt)
  const text = useText()
  const words = text.appleMusic
  const cover = albumArt ? (media?.artwork ?? null) : null
  const playing = useWebApp(shownPlaying)
  // Leaving the page (another app, the dashboard) closes it: it opens again by the dashboard's button
  // alone, never by itself.
  useEffect(() => () => useWebApp.setState({ lyricsOpen: false }), [])
  if (!open) return null
  return (
    <section className="wal" aria-label={words.lyrics}>
      {cover && <img className="wal-cover" src={cover} alt="" aria-hidden referrerPolicy="no-referrer" />}
      <div className="wal-panel">
        <header className="wal-head">
          <button
            type="button"
            className="wal-close"
            aria-label={words.close}
            onClick={() => useWebApp.setState({ lyricsOpen: false })}
          >
            <ChevronDownGlyph size={34} />
          </button>
          <div className="wal-song">
            {site && <div className="wal-site">{SITE_NAMES[site]}</div>}
            {media && <div className="wal-title">{media.title}</div>}
            {media && <div className="wal-by">{media.artist}</div>}
          </div>
        </header>
        <div className="wal-body">
          <div className="wal-words">
            {lyrics && lyrics.lines.length > 0 ? (
              <LyricsLines lyrics={lyrics} position={at} onSeek={() => {}} className="wal-lyrics" />
            ) : (
              <p className="wal-none">{words.noLyrics}</p>
            )}
          </div>
          <div className="wal-art">
            {/* Keyed by the picture itself: another song's cover is another element, so no old one stays
                under a new address that hasn't loaded. */}
            {cover && <img key={cover} src={cover} alt="" referrerPolicy="no-referrer" />}
            {/* The page's own player, from here: the site's keys (its play button, its queue's next). */}
            <div className="wal-transport">
              <button type="button" aria-label={text.previous} onClick={() => command({ action: 'previous' })}>
                <PreviousGlyph size={28} />
              </button>
              <button
                type="button"
                aria-label={playing ? text.pause : text.play}
                onClick={() => command({ action: 'playPause' })}
              >
                {playing ? <PauseGlyph size={32} /> : <PlayGlyph size={32} />}
              </button>
              <button type="button" aria-label={text.next} onClick={() => command({ action: 'next' })}>
                <NextGlyph size={28} />
              </button>
            </div>
            {/* The page's own sound, under the keys: a short bar (it read as the song's own progress along the
                page's foot: owner 2026-10-30). */}
            <div className="wal-volume">
              {/* A speaker before it: a bar with no words beside it reads as the song's progress. */}
              <span className="wal-speaker" aria-hidden>
                <SpeakerGlyph size={22} volume={volume} />
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                aria-label={words.volume}
                onChange={(event) => {
                  // The slider is its own master: the page's word only comes back where it can (a site whose
                  // sound is in a frame of its own has no element here to read it from).
                  const level = Number(event.target.value)
                  useWebApp.setState({ volume: level })
                  command({ action: 'setVolume', volume: level })
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}