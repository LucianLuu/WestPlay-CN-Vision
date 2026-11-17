import { describe, expect, it } from 'vitest'
import type { Wallpaper } from '../wallpapers'
import { photoView } from './photo'

const both: Wallpaper = { id: 'both', name: 'Both', variants: { light: 'l.jpg', dark: 'd.jpg' } }
const darkOnly: Wallpaper = { id: 'dark', name: 'Dark', variants: { dark: 'd2.jpg' } }
const plain: Wallpaper = { id: 'plain', name: 'Plain', variants: { light: 'p.jpg', dark: 'p.jpg' } }

describe('photoView', () => {
  it('is the wallpaper it names, in the look the screen is in, with its name', () => {
    expect(photoView('both', [both, plain], 'dark')).toEqual({ src: 'd.jpg', name: 'Both' })
    expect(photoView('both', [both, plain], 'light')).toEqual({ src: 'l.jpg', name: 'Both' })
  })

  it('follows the wallpaper when it has no picture for this look', () => {
    expect(photoView('dark', [darkOnly, plain], 'light')).toEqual({ src: 'd2.jpg', name: 'Dark' })
  })

  it('is the default wallpaper for an id the gallery no longer has', () => {
    expect(photoView('gone', [both, plain], 'light').name).toBe('Silk')
  })
})
