import { describe, expect, it } from 'vitest'
import { isReleasedApp, RELEASED_APP_IDS } from './apps'

describe('the apps this release has', () => {
  it('leaves Phone and Messages for a later release, keeping Home’s order', () => {
    expect(RELEASED_APP_IDS).toEqual([
      'maps',
      'music',
      'spotify',
      'youtube',
      'youtubeMusic',
      'player',
      'safari',
      'podcasts',
      'radio',
      'calendar',
      'vehicle',
      'weather',
      'douyin',
      'kugou',
      'settings',
    ])
  })

  it('opens none of the later ones from a saved screen or recent', () => {
    expect(isReleasedApp('phone')).toBe(false)
    expect(isReleasedApp('messages')).toBe(false)
    expect(isReleasedApp('podcasts')).toBe(true)
    expect(isReleasedApp('calendar')).toBe(true)
    expect(isReleasedApp('nonsense')).toBe(false)
  })
})
