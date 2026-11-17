import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { pausePlayback, playOrPauseRadio, sendVolume, setVolume, skipRadio, useRadio } from './radio'

/**
 * Live radio as one of the cab's players (`musicWithGame.ts`, `oneAtATime.ts`, `keybinds.ts`, `quiet.ts`):
 * pauses on game away/power-off (including while connecting via `pendingHere`), resumes when returning or when
 * electrics come back on, ducks on reverse, and shares media exclusivity with the other players.
 */
export const radioPlayer: MusicPlayer = {
  name: 'radio',
  playingHere: () => useRadio.getState().playing,
  pendingHere: () => useRadio.getState().playback?.status === 'loading',
  pauseHere: pausePlayback,
  resumeHere: () => {
    if (!useRadio.getState().playing) playOrPauseRadio()
  },
  volume: () => useRadio.getState().volume,
  sendVolume,
  setVolume,
  skip: skipRadio,
  subscribe: (changed) =>
    useRadio.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseRadioWithGame(): () => void {
  return pauseMusicWithGame(radioPlayer)
}
