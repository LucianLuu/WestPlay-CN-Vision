import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { pauseHere, resumeHere, sendVolume, setVolume, skip, useQqMusic } from './qqMusic'

/**
 * QQ Music as one of the cab's players (musicWithGame.ts, oneAtATime.ts, keybinds.ts): the volume
 * keys and the play/pause set its own volume and player, a reversal holds it quiet (`quiet.ts`), and
 * it stops with the electrics like the rest (owner 2026-11-17: it was in none of the lists, so the
 * keybinds and the cab's own pause left it alone).
 */
export const qqMusicPlayer: MusicPlayer = {
  name: 'qq music',
  playingHere: () => useQqMusic.getState().playback?.playing ?? false,
  pauseHere,
  resumeHere,
  volume: () => useQqMusic.getState().playback?.volume ?? null,
  // A fade's own (a reversal's quiet, the way out as the electrics go): the player's choice is
  // `setVolume`'s, which is the one the host keeps for the next start.
  sendVolume,
  setVolume: (share) => setVolume(share, true),
  skip,
  subscribe: (changed) =>
    useQqMusic.subscribe((music, before) => {
      changed(Boolean(music.playback?.playing && !before.playback?.playing))
    }),
}

/** QQ Music with the game (musicWithGame.ts). Returns the function that stops it. */
export function pauseQqMusicWithGame(): () => void {
  return pauseMusicWithGame(qqMusicPlayer)
}