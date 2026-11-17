import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PageMessage } from '../../../shared/host'

const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0).reverse()) stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function setup() {
  vi.useFakeTimers()
  const messages: PageMessage[] = []
  vi.stubGlobal('window', { chrome: { webview: { postMessage: (message: PageMessage) => messages.push(message) } } })
  const { useCabin, useLive } = await import('../../state/store')
  const radio = await import('./radio')
  const { radioPlayer, pauseRadioWithGame } = await import('./pauseWithGame')
  const { oneAtATime } = await import('../oneAtATime')
  const { safariPlayer } = await import('../safari/pauseWithGame')
  const { receivePlaying } = await import('../safari/safari')
  useLive.setState({ gameShown: true, telemetry: null, menuGone: false })
  useCabin.setState({ power: { ...useCabin.getState().power, observed: true, phase: 'on' } })
  radio.useRadio.setState(radio.useRadio.getInitialState())
  stops.push(pauseRadioWithGame(), oneAtATime([radioPlayer, safariPlayer]))
  const commands = () => messages.filter((message) => message.type === 'radio').map((message) => message.command)
  return { messages, commands, radio, useCabin, useLive, receivePlaying }
}

const station = (id: number) => ({
  id,
  name: 'Station ' + id,
  programName: 'Program ' + id,
})

describe('radio playback while the game is paused or powered off', () => {
  it('pauses a connecting station once when the game goes away, without recursive state updates', async () => {
    const p = await setup()
    p.radio.playRadio(station(1011))
    expect(p.radio.useRadio.getState().playback?.status).toBe('loading')
    p.messages.length = 0
    expect(() => {
      p.useLive.setState({ gameShown: false })
      vi.advanceTimersByTime(600)
    }).not.toThrow()
    expect(p.radio.useRadio.getState().playback?.status).toBe('paused')
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(1)
    p.messages.length = 0
    p.useLive.setState({ gameShown: true })
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(1)
  })

  it('cancels a connecting station once on power off and ignores its late playing report', async () => {
    const p = await setup()
    p.radio.playRadio(station(1011))
    const old = p.radio.useRadio.getState().sessionRequestId!
    p.messages.length = 0
    expect(() => p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'off' } })).not.toThrow()
    expect(p.radio.useRadio.getState().playback?.status).toBe('paused')
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(1)
    p.radio.receiveRadioPlayback({
      title: 'Program 1011',
      artist: 'Station 1011',
      radioId: 1011,
      status: 'playing',
      requestId: old,
    })
    expect(p.radio.useRadio.getState().playing).toBe(false)
    p.messages.length = 0
    p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'on' } })
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(0)
  })

  it('resumes an actively playing station when electrics return', async () => {
    const p = await setup()
    p.radio.playRadio(station(1011))
    const requestId = p.radio.useRadio.getState().sessionRequestId!
    p.radio.receiveRadioPlayback({
      title: 'Program 1011',
      artist: 'Station 1011',
      radioId: 1011,
      status: 'playing',
      requestId,
    })
    expect(p.radio.useRadio.getState().playing).toBe(true)
    p.messages.length = 0
    p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'off' } })
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(1)
    p.messages.length = 0
    p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'on' } })
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(1)
  })

  it('sends a card click to the host while the game is already paused and accepts actual playback', async () => {
    const p = await setup()
    p.useLive.setState({
      telemetry: { paused: true } as NonNullable<ReturnType<typeof p.useLive.getState>['telemetry']>,
    })
    p.radio.playRadio({ id: 1011, name: 'Music station' })
    const requestId = p.radio.useRadio.getState().sessionRequestId!
    expect(p.commands()).toContainEqual(
      expect.objectContaining({ action: 'play', requestId, track: expect.objectContaining({ radioId: 1011 }) }),
    )
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(0)
    p.radio.receiveRadioPlayback({
      title: 'Music station',
      artist: 'Music station',
      radioId: 1011,
      status: 'playing',
      requestId,
    })
    expect(p.radio.useRadio.getState()).toMatchObject({ playing: true, playback: { status: 'playing' } })
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(0)
  })

  it('withholds a new station selected with power off until an explicit retry after power returns', async () => {
    const p = await setup()
    p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'off' } })
    p.messages.length = 0
    expect(() => p.radio.playRadio({ id: 93, name: 'Traffic station' })).not.toThrow()
    expect(p.radio.useRadio.getState().playback?.status).toBe('paused')
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(0)
    p.useCabin.setState({ power: { ...p.useCabin.getState().power, phase: 'on' } })
    expect(p.commands().filter((command) => command.action === 'play')).toHaveLength(0)
    p.radio.pauseOrResumeRadio()
    expect(p.commands()).toContainEqual(
      expect.objectContaining({ action: 'play', track: expect.objectContaining({ radioId: 93 }) }),
    )
  })

  it('pauses a connecting radio station when Safari starts playing', async () => {
    const p = await setup()
    p.radio.playRadio(station(1011))
    expect(p.radio.useRadio.getState().playback?.status).toBe('loading')
    p.messages.length = 0
    p.receivePlaying(true)
    expect(p.commands().filter((command) => command.action === 'pause')).toHaveLength(1)
    expect(p.radio.useRadio.getState().playback?.status).toBe('paused')
  })
})
