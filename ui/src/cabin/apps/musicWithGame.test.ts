import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Telemetry } from '../../shared/host'
import type { PowerPhase } from '../state/power'
import { useCabin, useLive } from '../state/store'
import { type MusicPlayer, pauseMusicWithGame } from './musicWithGame'

// The stores are made at import time and ask whether the page runs in the host (the cabin page does): in a
// test there is no page, so the host module is stood in for (as the web app's power test does).
vi.mock('../../shared/host', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../shared/host')>()
  return { ...real, isInHost: () => true, postToHost: () => {} }
})

/** One of the cab's players (musicWithGame.ts's `MusicPlayer`): what WestPlay asked of it, and whether it
 * plays. */
function player() {
  let playing = false
  const told: string[] = []
  const one: MusicPlayer = {
    name: 'test',
    playingHere: () => playing,
    pauseHere: () => {
      playing = false
      told.push('pause')
    },
    resumeHere: () => {
      playing = true
      told.push('play')
    },
    volume: () => 1,
    sendVolume: () => {},
    setVolume: () => {},
    skip: () => {},
    subscribe: () => () => {},
  }
  return { one, told, setPlaying: (now: boolean) => (playing = now) }
}

/** The truck's electrics, as the host last said (`telemetry` → `power`). */
function setPower(phase: PowerPhase): void {
  useCabin.setState({ power: { phase, since: 0, observed: true } })
}

/** The game running with its window showing and no menu up: the player is not away, so nothing pauses for
 * that. */
function atTheWheel(): void {
  useLive.setState({ gameShown: true, menuGone: true, telemetry: { paused: false } as Telemetry })
}

describe('pauseMusicWithGame', () => {
  let stop: (() => void) | undefined

  afterEach(() => {
    stop?.()
    stop = undefined
    setPower('on')
    atTheWheel()
  })

  it('stops the player at once as the electrics go off', () => {
    atTheWheel()
    setPower('on')
    const { one, told, setPlaying } = player()
    setPlaying(true)
    stop = pauseMusicWithGame(one)
    setPower('off')
    expect(told).toEqual(['pause'])
  })

  it('plays it on again as the electrics come back: what WestPlay stopped for them', () => {
    atTheWheel()
    setPower('on')
    const { one, told, setPlaying } = player()
    setPlaying(true)
    stop = pauseMusicWithGame(one)
    setPower('off')
    expect(told).toEqual(['pause'])
    // The player's own word: the electrics stopped it (nothing plays while they're off).
    setPlaying(false)
    setPower('splash')
    expect(told).toEqual(['pause', 'play'])
    // And once an electrics edge is over, nothing more comes of it.
    setPower('on')
    expect(told).toEqual(['pause', 'play'])
  })

  it('leaves a player the player themselves started again alone', () => {
    atTheWheel()
    setPower('on')
    const { one, told, setPlaying } = player()
    setPlaying(true)
    stop = pauseMusicWithGame(one)
    setPower('off')
    // They pressed play in the dark: playing it again would stop it instead (a play/pause is a toggle).
    setPlaying(true)
    setPower('on')
    expect(told).toEqual(['pause'])
  })

  it('has nothing to play back where it never played', () => {
    atTheWheel()
    setPower('on')
    const { one, told, setPlaying } = player()
    setPlaying(false)
    stop = pauseMusicWithGame(one)
    setPower('off')
    setPower('on')
    expect(told).toEqual([])
  })

  it('leaves the music paused where the player is away from the game (a menu up) as the electrics come back', () => {
    atTheWheel()
    setPower('on')
    const { one, told, setPlaying } = player()
    setPlaying(true)
    stop = pauseMusicWithGame(one)
    setPower('off')
    setPlaying(false)
    // The game paused with its menu up as they came back: nothing plays then, whatever the electrics do.
    useLive.setState({ telemetry: { paused: true } as Telemetry, menuGone: false })
    setPower('on')
    expect(told).toEqual(['pause'])
  })

  it('stops tracking once stopped', () => {
    atTheWheel()
    setPower('on')
    const { one, told, setPlaying } = player()
    setPlaying(true)
    const stopNow = pauseMusicWithGame(one)
    stopNow()
    setPower('off')
    setPower('on')
    expect(told).toEqual([])
  })
})
