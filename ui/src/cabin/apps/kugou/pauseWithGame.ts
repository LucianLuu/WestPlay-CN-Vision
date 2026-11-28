import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import {
  pauseHere,
  pendingHere,
  playingHere,
  resumeHere,
  setFade,
  setVolume,
  skipTrack,
  subscribePlaying,
  useKuGou,
  volumeNow,
} from './kugou'

/**
 * KuGou Music as one of the cab's players (musicWithGame.ts, oneAtATime.ts, keybinds, the Dashboard's Now
 * Playing).
 *
 * The sound is this page's own `Audio` element, so its level is set here rather than asked of a site's page: a
 * fade scales what the sound gets, never the volume the player chose (`kugou.ts`'s `volume` stays theirs).
 */
export const kugouPlayer: MusicPlayer = {
  name: 'kugou',
  playingHere,
  pendingHere,
  pauseHere,
  resumeHere,
  volume: volumeNow,
  // The fade's own level, as a share of the player's volume (its slider is left where they put it).
  sendVolume: (share) => {
    const chosen = volumeNow()
    setFade(chosen > 0 ? Math.min(1, share / chosen) : 1)
  },
  // A keybind's volume is the player's own choice.
  setVolume,
  skip: skipTrack,
  subscribe: subscribePlaying,
}

/** The truck's electrics are off: what KuGou plays stops, and plays on again as they come back (musicWithGame.ts). */
export function pauseKuGouWithGame(): () => void {
  return pauseMusicWithGame(kugouPlayer)
}

/** KuGou's own pause and play, as its bar does (the Dashboard's card presses it). */
export function playOrPause(): void {
  useKuGou.getState().toggle()
}
