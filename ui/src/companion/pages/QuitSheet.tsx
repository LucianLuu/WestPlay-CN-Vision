import { useEffect, useState } from 'react'
import { call } from '../bridge'
import { Button } from '../room/parts'
import type { CompanionWords } from './words'

/**
 * The window's close button, asked about first (FIXES §73): quitting WestPlay stops it and hands the truck's
 * screen back to the game, which a stray press shouldn't do mid-drive. The app holds the window's close
 * (`close-requested`) and `quit_app` lets it through, once this sheet says so.
 */
export function QuitSheet({ cw, close }: { cw: CompanionWords; close(): void }) {
  const w = cw.quit!
  const [leaving, setLeaving] = useState(false)

  // Told as it shows: the app closes the window on its own for a page that can't answer (WebView2 gone), which
  // is not this one.
  useEffect(() => {
    call('quit_shown').catch(() => {})
    return () => {
      call('quit_hidden').catch(() => {})
    }
  }, [])

  const quit = () => {
    setLeaving(true)
    // Comes back only if it couldn't: quitting takes the window with it.
    call('quit_app').catch(() => setLeaving(false))
  }

  return (
    <div className="cp-veil" onClick={close}>
      <section className="cp-sheet" role="dialog" aria-label={w.title} onClick={(event) => event.stopPropagation()}>
        <h2>{w.title}</h2>
        <p>{w.text}</p>
        <div className="cp-sheet-actions">
          <Button glass onClick={close} disabled={leaving}>
            {w.cancel}
          </Button>
          <Button danger busy={leaving} onClick={quit}>
            {w.confirm}
          </Button>
        </div>
      </section>
    </div>
  )
}
