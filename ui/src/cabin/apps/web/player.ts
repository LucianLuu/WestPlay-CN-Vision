import type { MusicPlayer } from '../musicWithGame'
import { command, useWebApp } from './webapp'

/**
 * The web app's page as one of the cab's players (musicWithGame.ts), so the player's keybinds (the companion's
 * Controls: play/pause, and the volume a step up or down) reach it as they reach the cab's music apps.
 *
 * It's the site's own playback, not a copy of it: the page's own button (`Command::PlayPause`) and the page's own
 * sound's volume (`Command::SetVolume`), which the host runs in the site's WebView (the host's webapp.rs and
 * `webapp.js`). Every site goes through it: Bilibili, NetEase Cloud Music, QQ Music and Qingting FM.
 */
export const webappPlayer: MusicPlayer = {
  // No fade of its own (fade.ts): the page's sound is the site's, and it rises and falls with the site's own
  // controls.
  name: 'webapp',
  playingHere: () => useWebApp.getState().media?.playing === true,
  // The page's own button is a toggle, whichever way it was playing (as the dashboard's play/pause is).
  pauseHere: () => command({ action: 'playPause' }),
  resumeHere: () => command({ action: 'playPause' }),
  volume: () => useWebApp.getState().volume,
  // A keybind's volume is the player's choice: the page's sound, as the site's own bar leaves it.
  sendVolume: (share) => command({ action: 'setVolume', volume: share }),
  setVolume: (share) => command({ action: 'setVolume', volume: share }),
  // The cab's own quiet (reversing): a page that keeps its own volume takes this one, held by the page for as
  // long as the cab says so (`null` lets go, its own volume back).
  duck: (share) => command({ action: 'duckVolume', volume: share }),
  // The site's own Next (1) or Back (-1), as its player's buttons do.
  skip: (direction) => command({ action: direction === 1 ? 'next' : 'previous' }),
  // What the site has counts, playing or paused: the keybinds' play/pause is the site's own toggle, so a site
  // whose song is paused is still the one a press should start again — told apart from "nothing here" only by
  // whether it has a song at all (owner 2026-11-01: paused, the keybinds went to the cab's music instead).
  //
  // A start is what the "one at a time" rule hears (`oneAtATime`), so it's told of the playing going on too —
  // not only of a song appearing: Douyin's page has one song after another (a song there all along), and by
  // presence alone its playing never told the other players to pause, which played on under its video
  // (owner 2026-11-28).
  subscribe: (changed) => {
    let playing = useWebApp.getState().media?.playing === true
    return useWebApp.subscribe((state) => {
      const now = state.media?.playing === true
      if (now === playing) return
      playing = now
      changed(now)
    })
  },
}
