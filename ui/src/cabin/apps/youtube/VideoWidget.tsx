import { useEffect, useState } from 'react'
import { go } from '../../state/store'
import { useText } from '../../state/text'
import { FullScreenGlyph, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph } from './glyphs'
import { OverVideo, VideoHole } from './VideoHole'
import { sameVideo } from './follow'
import { comingUp, command, nextVideo, play, positionNow, previousVideo, useYouTube } from './youtube'

/** How long the controls stay after the last press, ms. */
const CONTROLS_MS = 3000

/**
 * The Dashboard's Now Playing while a video plays: only the video, filling the card. A press brings up its
 * controls over it (previous, play or pause, next, and full screen), gone again after a while.
 */
export function VideoWidget() {
  const text = useText()
  const current = useYouTube((store) => store.current)
  const videoSite = useYouTube((store) => store.videoSite)
  // What the player showing this video said — its own site's state, not whichever spoke last. The page  // may report a season's own episode where the app listed the season (`follow.ts` `sameVideo`).
  const playing = useYouTube((store) => {
    const state = store.states[store.videoSite].state
    if (!state || !store.current) return false
    return state.state === 1 && sameVideo({ video: store.current.video, at: 0 }, state.video ?? '')
  })
  const hasNext = useYouTube((store) => comingUp(store).length > 0)
  const [controls, setControls] = useState(false)
  const [touched, setTouched] = useState(0)
  const touch = () => {
    setControls(true)
    setTouched((n) => n + 1)
  }
  useEffect(() => {
    if (!controls || !playing) return
    const timer = setTimeout(() => setControls(false), CONTROLS_MS)
    return () => clearTimeout(timer)
  }, [controls, playing, touched])

  return (
    <article className="widget now-playing yt-widget" aria-label={current?.title}>
      <VideoHole className="yt-widget-video" crop />
      <OverVideo>
        <div
          className={controls ? 'yt-widget-over shown' : 'yt-widget-over'}
          onPointerDown={(event) => {
            // A press on the picture brings the controls up, or puts them away.
            if (event.target !== event.currentTarget) return
            if (controls) setControls(false)
            else touch()
          }}
        >
          {controls && current && (
            <>
              <span className="yt-widget-title">{current.title}</span>
              <div className="yt-widget-controls">
                <button
                  type="button"
                  aria-label={text.previous}
                  onClick={() => {
                    touch()
                    const before = previousVideo()
                    if (positionNow() > 5 || !before) command({ action: 'seek', seconds: 0 }, videoSite)
                    else play(before, false)
                  }}
                >
                  <PreviousGlyph />
                </button>
                <button
                  type="button"
                  className="main"
                  aria-label={playing ? text.pause : text.play}
                  onClick={() => {
                    touch()
                    command({ action: playing ? 'pause' : 'play' }, videoSite)
                  }}
                >
                  {playing ? <PauseGlyph /> : <PlayGlyph />}
                </button>
                <button
                  type="button"
                  aria-label={text.next}
                  disabled={!hasNext}
                  onClick={() => {
                    touch()
                    const next = nextVideo()
                    if (next) play(next, false)
                  }}
                >
                  <NextGlyph />
                </button>
              </div>
              <button
                type="button"
                className="yt-widget-full"
                aria-label={text.youtube.fullScreen}
                onClick={() => {
                  // The app playing it — always `youtube`, the slot both sites live in: `BilibiliApp`
                  // sets the site as it mounts. Nothing to switch here; `returnToPlayer` is what makes
                  // it open on this video rather than its front page.
                  useYouTube.setState({ returnToPlayer: true })
                  go({ type: 'openApp', app: 'youtube' })
                }}
              >
                <FullScreenGlyph />
              </button>
            </>
          )}
        </div>
      </OverVideo>
    </article>
  )
}
