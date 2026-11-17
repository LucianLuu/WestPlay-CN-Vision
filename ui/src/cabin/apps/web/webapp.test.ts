import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cabinVolumeFor,
  command,
  floatingTop,
  receiveWebApp,
  receiveWebAppMedia,
  receiveWebAppTyping,
  shownPlaying,
  useWebApp,
  wordsAreSongs,
} from './webapp'

describe('receiveWebApp', () => {
  it('keeps the site the page shows, its own title, whether it can go back and whether a video is full screen', () => {
    receiveWebApp({
      site: 'bilibili',
      title: '【4K】A video_哔哩哔哩_bilibili',
      canGoBack: true,
      fullScreen: true,
      shown: true,
    })
    expect(useWebApp.getState()).toMatchObject({
      site: 'bilibili',
      title: '【4K】A video_哔哩哔哩_bilibili',
      canGoBack: true,
      fullScreen: true,
      shown: true,
    })
  })

  it('knows a page that is not on show yet, so the room keeps the app’s own background', () => {
    receiveWebApp({ site: 'qqMusic', title: 'QQ音乐', canGoBack: false, fullScreen: false, shown: false })
    expect(useWebApp.getState().shown).toBe(false)
    receiveWebApp({ site: 'qqMusic', title: 'QQ音乐', canGoBack: false, fullScreen: false, shown: true })
    expect(useWebApp.getState().shown).toBe(true)
  })

  it('takes a host that says nothing of it as one already on show', () => {
    receiveWebApp({ site: 'netease', title: '网易云音乐', canGoBack: false, fullScreen: false } as never)
    expect(useWebApp.getState().shown).toBe(true)
  })

  it('forgets it as the host says no page runs', () => {
    receiveWebApp({ site: 'qqMusic', title: 'A song - An artist - QQ音乐', canGoBack: false, fullScreen: true, shown: true })
    useWebApp.setState({ hole: { x: 170, y: 96, width: 1000, height: 600, radius: 18 } })
    receiveWebApp(null)
    expect(useWebApp.getState()).toMatchObject({
      site: null,
      title: '',
      canGoBack: false,
      fullScreen: false,
      shown: false,
      hole: null,
    })
  })
})

describe('the cabin’s own press on the page', () => {
  const playing = (on: boolean) => ({ title: 'A song', artist: 'An artist', artwork: null, playing: on, lyric: null })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    useWebApp.setState({ media: null, shownPlaying: null })
  })

  // A press is what the cabin shows first and the host is told second: a plain page here, one with no host to
  // tell (`isInHost` asks after `window`, which node has none of).
  const press = (action: 'playPause') => {
    vi.stubGlobal('window', {})
    command({ action })
  }

  it('shows at once, and lasts a few seconds where the page never says anything about it', () => {
    vi.useFakeTimers()
    // The page says it's paused, and its own page never speaks of a press again (QQ Music's home page): the press
    // can't go on being shown for ever, or the card would say the opposite of what the page does (owner 2026-11-02).
    receiveWebAppMedia(playing(false))
    press('playPause')
    expect(shownPlaying(useWebApp.getState())).toBe(true)
    vi.advanceTimersByTime(2500)
    expect(shownPlaying(useWebApp.getState())).toBe(false)
  })

  it('is the page’s own word’s again as soon as the page speaks', () => {
    vi.useFakeTimers()
    receiveWebAppMedia(playing(false))
    press('playPause')
    receiveWebAppMedia(playing(true))
    expect(shownPlaying(useWebApp.getState())).toBe(true)
    receiveWebAppMedia(playing(false))
    expect(shownPlaying(useWebApp.getState())).toBe(false)
  })
})

describe('the cabin’s own volume slider', () => {
  it('is left out where the player has a volume control of its own', () => {
    expect(cabinVolumeFor('bilibili')).toBe(false)
    // Douyin's player slider comes first (owner 2026-11-03): nothing of the cabin's to override it with.
    expect(cabinVolumeFor('douyin')).toBe(false)
    // The music sites, and the podcast one, keep it (and no page at all: nothing to show it for).
    expect(cabinVolumeFor('qqMusic')).toBe(true)
    expect(cabinVolumeFor('netease')).toBe(true)
    expect(cabinVolumeFor('kugou')).toBe(true)
    expect(cabinVolumeFor('qingting')).toBe(true)
    expect(cabinVolumeFor(null)).toBe(true)
  })
})

describe('what floats over the page', () => {
  it('is as high as the highest thing up there, the input method’s bar included', () => {
    // The keyboard's own box, and the bar and the chip hanging over it (children outside its parent's box: the
    // hole's mask would cut them away, which is what "no candidates over any web app" was).
    const keyboard = { top: 500, height: 200 }
    const bar = { top: 430, height: 54 }
    const chip = { top: 380, height: 44 }
    expect(floatingTop([keyboard])).toBe(500)
    expect(floatingTop([keyboard, bar])).toBe(430)
    expect(floatingTop([keyboard, bar, chip])).toBe(380)
    // Nothing up: nothing to stop above.
    expect(floatingTop([])).toBeNull()
    // A piece that isn't drawn (no height) doesn't count for anything.
    expect(floatingTop([{ top: 100, height: 0 }])).toBeNull()
  })
})

describe('the field a page has focused', () => {
  it("is the page's own: another site's page takes the cabin's keyboard with it", () => {
    receiveWebApp({ site: 'netease', title: '网易云音乐', canGoBack: false, fullScreen: false, shown: true })
    receiveWebAppTyping(true, 'nihao', 4)
    expect(useWebApp.getState()).toMatchObject({ typing: true, text: 'nihao', selection: 4 })
    // Opening another app: the field (and the keyboard) was the page that's gone, not this one.
    receiveWebApp({ site: 'kugou', title: '酷狗音乐', canGoBack: false, fullScreen: false, shown: true })
    expect(useWebApp.getState()).toMatchObject({ typing: false, text: '', selection: 0 })
    // The same site's page again (a new title, a reload) keeps what the keyboard is typing into it.
    receiveWebAppTyping(true, 'nihao', 5)
    receiveWebApp({ site: 'kugou', title: '寻诀', canGoBack: true, fullScreen: false, shown: true })
    expect(useWebApp.getState()).toMatchObject({ typing: true, text: 'nihao', selection: 5 })
  })
})

describe('wordsAreSongs', () => {
  it('takes the three music sites’ words, Kugou Music’s too, and no video’s or podcast’s', () => {
    expect(wordsAreSongs('kugou')).toBe(true)
    // Not QQ Music's: its page has no words to hand over (owner 2026-11-10).
    expect(wordsAreSongs('qqMusic')).toBe(false)
    expect(wordsAreSongs('netease')).toBe(true)
    expect(wordsAreSongs('bilibili')).toBe(false)
    expect(wordsAreSongs('qingting')).toBe(false)
    expect(wordsAreSongs('douyin')).toBe(false)
    expect(wordsAreSongs(null)).toBe(false)
  })
})
