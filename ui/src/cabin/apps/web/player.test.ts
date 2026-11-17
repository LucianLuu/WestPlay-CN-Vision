import { describe, expect, it, vi } from 'vitest'

interface PageState {
  media: { playing: boolean } | null
  volume: number
}

/** The web app's store, as tiny as the player uses it: its state and its subscribers. */
const mocks = vi.hoisted(() => {
  const state: PageState = { media: null, volume: 1 }
  const listeners = new Set<(state: PageState) => void>()
  return { state, listeners, command: vi.fn() }
})

vi.mock('./webapp', () => ({
  command: mocks.command,
  useWebApp: {
    getState: () => mocks.state,
    subscribe: (listener: (state: PageState) => void) => {
      mocks.listeners.add(listener)
      return () => mocks.listeners.delete(listener)
    },
  },
}))

const { webappPlayer } = await import('./player')

/** The page says what it plays now, as the host says it (`receiveWebAppMedia`). */
function playing(now: boolean) {
  mocks.state.media = { playing: now }
  for (const listener of mocks.listeners) listener(mocks.state)
}

describe('the web app as a player', () => {
  it('is playing when its page plays, and only then', () => {
    mocks.state.media = null
    expect(webappPlayer.playingHere()).toBe(false)
    playing(false)
    expect(webappPlayer.playingHere()).toBe(false)
    playing(true)
    expect(webappPlayer.playingHere()).toBe(true)
  })

  it('plays and pauses on the page’s own button', () => {
    mocks.command.mockClear()
    webappPlayer.pauseHere()
    webappPlayer.resumeHere()
    expect(mocks.command.mock.calls).toEqual([
      [{ action: 'playPause' }],
      [{ action: 'playPause' }],
    ])
  })

  it('sets the page’s sound’s volume, and reads it', () => {
    mocks.command.mockClear()
    mocks.state.volume = 0.4
    expect(webappPlayer.volume()).toBe(0.4)
    webappPlayer.setVolume(0.6)
    webappPlayer.sendVolume(0.3)
    expect(mocks.command.mock.calls).toEqual([
      [{ action: 'setVolume', volume: 0.6 }],
      [{ action: 'setVolume', volume: 0.3 }],
    ])
  })

  it('holds the page quiet for the cab, and lets go of it', () => {
    mocks.command.mockClear()
    webappPlayer.duck?.(0.15)
    webappPlayer.duck?.(null)
    expect(mocks.command.mock.calls).toEqual([
      [{ action: 'duckVolume', volume: 0.15 }],
      [{ action: 'duckVolume', volume: null }],
    ])
  })

  it('tells its follower whenever the page has a song, paused or playing', () => {
    // Paused is still a song here: the keybinds' play/pause is the site's own toggle, so a press has to reach a
    // site that's paused (owner 2026-11-01: with one paused, the keybinds went to the cab's music).
    mocks.state.media = null
    const heard: boolean[] = []
    const stop = webappPlayer.subscribe((started) => heard.push(started))
    playing(true)
    playing(true)
    playing(false)
    mocks.state.media = null
    for (const listener of mocks.listeners) listener(mocks.state)
    stop()
    playing(true)
    expect(heard).toEqual([true, false])
  })
})
