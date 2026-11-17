import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PowerPhase } from '../../state/power'

/** What the page would be sent (the host's inbox, in the host: `command` posts there). */
const sent: unknown[] = []
const pause = { type: 'webApp', command: { action: 'playPause' } }

vi.mock('../../../shared/host', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../shared/host')>()
  return {
    ...real,
    isInHost: () => true,
    postToHost: (message: unknown) => {
      // The cabin's own lines for the host's log go there too (`logToHost`): what this tracks is what the page
      // itself is told.
      if ((message as { type?: string }).type === 'log') return
      sent.push(message)
    },
  }
})

import { useCabin } from '../../state/store'
import { pauseWebAppWithPower, playsOnWithPower, powerAction } from './pauseWithPower'
import { useWebApp } from './webapp'
import type { WebAppSite } from '../../../shared/host'

/** The truck's electrics, as the host last said (`telemetry` → `power`). */
function setPower(phase: PowerPhase, observed = true): void {
  useCabin.setState({ power: { phase, since: 0, observed } })
}

/** What the page plays, as it last said (`webAppMedia`): the song and whether it plays. */
function setPlaying(playing: boolean): void {
  useWebApp.setState({
    media: { title: 'A song', artist: 'An artist', artwork: null, playing, lyric: null },
  })
}

/** A page that says nothing of what it plays (QQ Music's home page names none of it). */
function setSayingNothing(): void {
  useWebApp.setState({ media: null })
}

/** The site running (`webApp` → `webAppMedia`): the one the page belongs to. */
function setSite(site: WebAppSite | null): void {
  useWebApp.setState({ site })
}

describe('powerAction', () => {
  it('pauses the page as the electrics go off, where it plays', () => {
    expect(powerAction(false, true, true)).toBe('pause')
    expect(powerAction(false, true, false)).toBeNull()
  })

  it('leaves it to the player otherwise (already off, or the electrics back on)', () => {
    expect(powerAction(true, true, true)).toBeNull()
    expect(powerAction(true, false, true)).toBeNull()
    expect(powerAction(false, false, true)).toBeNull()
  })
})

describe('playsOnWithPower', () => {
  it('is every site but Bilibili, whose video is left paused', () => {
    expect(playsOnWithPower('qqMusic')).toBe(true)
    expect(playsOnWithPower('netease')).toBe(true)
    expect(playsOnWithPower('qingting')).toBe(true)
    expect(playsOnWithPower('bilibili')).toBe(false)
    // No page at all: nothing to play back either way.
    expect(playsOnWithPower(null)).toBe(true)
  })
})

describe('pauseWebAppWithPower', () => {
  let stop: (() => void) | undefined

  afterEach(() => {
    stop?.()
    stop = undefined
    sent.length = 0
    setPower('on')
    setPlaying(false)
    setSite('qqMusic')
  })

  it('pauses a page playing as the electrics go off', () => {
    setPower('on')
    setPlaying(true)
    sent.length = 0
    stop = pauseWebAppWithPower()
    setPower('off')
    expect(sent).toEqual([pause])
  })

  it('leaves a page that is not playing as it is', () => {
    setPower('on')
    setPlaying(false)
    sent.length = 0
    stop = pauseWebAppWithPower()
    setPower('off')
    expect(sent).toEqual([])
  })

  it('pauses a page that starts playing while the electrics are off', () => {
    stop = pauseWebAppWithPower()
    setPower('off')
    sent.length = 0
    setPlaying(true)
    expect(sent).toEqual([pause])
  })

  it('plays the page on as the electrics come back, where WestPlay stopped it', () => {
    setSite('qqMusic')
    setPower('on')
    setPlaying(true)
    stop = pauseWebAppWithPower()
    setPower('off')
    expect(sent).toEqual([pause])
    // The page's own word: it stopped with the electrics.
    setPlaying(false)
    sent.length = 0
    setPower('splash')
    expect(sent).toEqual([pause])
    // An electrics edge is over and done with: nothing more comes of it.
    setPower('on')
    expect(sent).toEqual([pause])
  })

  it('plays Kugou Music on as the electrics come back (its own player, its own button)', () => {
    expect(playsOnWithPower('kugou')).toBe(true)
    expect(playsOnWithPower('douyin')).toBe(true)
  })

  it('leaves Bilibili paused as the electrics come back', () => {
    setSite('bilibili')
    setPower('on')
    setPlaying(true)
    stop = pauseWebAppWithPower()
    setPower('off')
    expect(sent).toEqual([pause])
    setPlaying(false)
    sent.length = 0
    setPower('on')
    expect(sent).toEqual([])
  })

  it('plays it on again even where the page still says it plays (a stale word is no word)', () => {
    setSite('netease')
    setPower('on')
    setPlaying(true)
    stop = pauseWebAppWithPower()
    setPower('off')
    // The page never said it stopped: its own word here is the one from before the press (QQ Music's home page
    // says nothing of itself at all, and its card stayed stale: owner 2026-11-02).
    sent.length = 0
    setPower('on')
    expect(sent).toEqual([pause])
  })

  it('does not ask a page that says nothing of itself twice', () => {
    vi.useFakeTimers()
    try {
      setSite('qqMusic')
      setPower('on')
      setPlaying(true)
      stop = pauseWebAppWithPower()
      setPower('off')
      // Nothing at all from the page: no word to judge the press by, so it isn't told again.
      setSayingNothing()
      sent.length = 0
      setPower('on')
      expect(sent).toEqual([pause])
      vi.advanceTimersByTime(1600)
      expect(sent).toEqual([pause])
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays a page that started playing in the dark back on as the electrics come back', () => {
    setSite('qingting')
    stop = pauseWebAppWithPower()
    setPower('off')
    sent.length = 0
    setPlaying(true)
    expect(sent).toEqual([pause])
    setPlaying(false)
    sent.length = 0
    setPower('on')
    expect(sent).toEqual([pause])
  })

  it('tells a page that left the press unanswered again, and one that came back not at all', () => {
    vi.useFakeTimers()
    try {
      setSite('qqMusic')
      setPower('on')
      setPlaying(true)
      stop = pauseWebAppWithPower()
      setPower('off')
      setPlaying(false)
      sent.length = 0
      setPower('on')
      expect(sent).toEqual([pause])
      // The page's own word, still saying it doesn't play: told once more.
      vi.advanceTimersByTime(1600)
      expect(sent).toEqual([pause, pause])
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves a page that came back on its own alone', () => {
    vi.useFakeTimers()
    try {
      setSite('netease')
      setPower('on')
      setPlaying(true)
      stop = pauseWebAppWithPower()
      setPower('off')
      setPlaying(false)
      sent.length = 0
      setPower('on')
      expect(sent).toEqual([pause])
      setPlaying(true)
      vi.advanceTimersByTime(1600)
      expect(sent).toEqual([pause])
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops tracking once stopped', () => {
    setPower('on')
    setPlaying(true)
    sent.length = 0
    const stopNow = pauseWebAppWithPower()
    stopNow()
    setPower('off')
    expect(sent).toEqual([])
  })
})
