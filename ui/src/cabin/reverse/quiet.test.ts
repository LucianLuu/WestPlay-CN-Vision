import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import { REVERSING_VOLUME, quietWhileReversing } from './quiet'

// The store asks at import whether the page runs in the host (the cabin page does): in a test there is no page,
// so the host module is stood in for (as the music-app tests do).
vi.mock('../../shared/host', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../shared/host')>()
  return { ...real, isInHost: () => true, postToHost: () => {} }
})

// A fringe timer runs the fades (`fade.ts`); the test drives them by hand.
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  stop?.()
  stop = undefined
  gear(0)
})

let stop: (() => void) | undefined

/** The gear the game shows the driver. */
function gear(displayed: number): void {
  useLive.setState({ telemetry: { displayedGear: displayed } as Telemetry })
}

/** A player of the cab's: the volume it plays at, and what WestPlay sent it. */
function player(name: string, start: number | null) {
  let volume = start
  const sent: number[] = []
  const ducks: (number | null)[] = []
  const one = {
    name,
    playingHere: () => true,
    pauseHere: () => {},
    resumeHere: () => {},
    volume: () => volume,
    sendVolume: (share: number) => {
      volume = share
      sent.push(share)
    },
    setVolume: (share: number) => {
      volume = share
    },
    duck: (share: number | null) => {
      ducks.push(share)
    },
    skip: () => {},
    subscribe: () => () => {},
  }
  return {
    one,
    sent,
    ducks,
    get volume() {
      return volume
    },
    /** The player turning its own volume while reversing. */
    set: (share: number) => {
      volume = share
    },
  }
}

/** Runs the fades to their end. */
function settle(): void {
  vi.advanceTimersByTime(500)
}

describe('quietWhileReversing', () => {
  it('holds the music at 15% in reverse and brings it back on the way out', () => {
    const music = player('music', 0.8)
    stop = quietWhileReversing([music.one])
    gear(1)
    expect(music.sent).toHaveLength(0)
    gear(-1)
    settle()
    expect(music.volume).toBeCloseTo(REVERSING_VOLUME, 6)
    gear(1)
    settle()
    expect(music.volume).toBeCloseTo(0.8, 6)
  })

  it('leaves a player already that quiet where it is', () => {
    const quiet = player('quiet', 0.1)
    stop = quietWhileReversing([quiet.one])
    gear(-1)
    settle()
    expect(quiet.sent).toHaveLength(0)
    gear(1)
    settle()
    expect(quiet.volume).toBeCloseTo(0.1, 6)
  })

  it('touches the players once per gear, whatever the telemetry says meanwhile', () => {
    const music = player('music', 0.6)
    stop = quietWhileReversing([music.one])
    gear(-1)
    settle()
    const sent = music.sent.length
    // Still reversing; the game says more about the truck.
    useLive.setState({
      telemetry: { displayedGear: -1, speed: -1.2, steering: 0.2 } as Telemetry,
    })
    settle()
    expect(music.sent).toHaveLength(sent)
  })

  it('returns a player to the volume it set while reversing', () => {
    const music = player('music', 0.9)
    stop = quietWhileReversing([music.one])
    gear(-1)
    settle()
    // The player turns it up itself, over the ducked volume.
    music.set(0.45)
    gear(1)
    settle()
    expect(music.volume).toBeCloseTo(0.45, 6)
  })

  it('holds a page that keeps its own volume quiet too, and gives it back on the way out', () => {
    // Bilibili's and Douyin's players keep their own volume (their sliders are the one that counts): the cab's
    // quiet is told to them apart, and it is the page itself that holds it (owner 2026-11-03).
    const page = player('webapp', 0.9)
    stop = quietWhileReversing([page.one])
    gear(-1)
    settle()
    expect(page.ducks).toEqual([REVERSING_VOLUME])
    gear(1)
    settle()
    expect(page.ducks).toEqual([REVERSING_VOLUME, null])
  })

  it('skips a player with no volume to set', () => {
    const nowhere = player('nowhere', null)
    stop = quietWhileReversing([nowhere.one])
    gear(-1)
    settle()
    expect(nowhere.sent).toHaveLength(0)
  })
})
