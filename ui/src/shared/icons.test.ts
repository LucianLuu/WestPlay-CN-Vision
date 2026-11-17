import { describe, expect, it } from 'vitest'
import { type AppIconRole, appIcon } from './icons'

// The icon files there are (public/icons/westplay), as Vite sees them.
const FILES = Object.keys(import.meta.glob('../../public/icons/westplay/*.{svg,png}')).map((path) =>
  path.replace('../../public', ''),
)

const ROLES: AppIconRole[] = [
  'maps',
  'music',
  'spotify',
  'podcasts',
  'messages',
  'phone',
  'calendar',
  'settings',
  'weather',
  'youtube',
  'youtubeMusic',
  'player',
  'safari',
  'vehicle',
  'douyin',
  'kugou',
]

describe('appIcon', () => {
  it('gives every role WestPlay’s icon in the look asked for, and each file is there', () => {
    for (const role of ROLES) {
      for (const look of ['light', 'dark'] as const) {
        expect(FILES).toContain(appIcon(role, look))
      }
    }
      // The music services' and Bilibili's own marks are one PNG each (icons.ts, PICTURES): the same
      // file in both looks. Every other role is WestPlay's own drawing, light and dark.
      expect(appIcon('youtubeMusic', 'dark')).toBe(appIcon('youtubeMusic', 'light'))
      expect(appIcon('youtubeMusic', 'light')).toMatch(/\.png$/)
      expect(appIcon('safari', 'dark')).not.toBe(appIcon('safari', 'light'))
  })
})
