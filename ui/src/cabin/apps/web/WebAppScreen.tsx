import { useEffect, useRef } from 'react'
import { isInHost, type WebAppSite } from '../../../shared/host'
import { keyboardLanguage } from '../../keyboard/layouts'
import { useKeyboard } from '../../keyboard/store'
import { whenTransitionEnds } from '../../state/launch'
import { useCabin, useLive } from '../../state/store'
import { useLanguage, useText } from '../../state/text'
import { reversing } from '../../reverse/reverse'
import { followArea } from '../youtube/youtube'
import { APP_OF_SITE, command, floatingTop, useWebApp, useWebAppCover, webAppField } from './webapp'
import './webapp.css'

/** How long the page stays on after the cabin stops showing it: the host takes a moment to take the WebView
 * off, and the hole the cabin cut has to outlast it (the game's own screen showed through otherwise). */
const HIDE_MS = 120

/** How long the cabin takes to shrink away once handed to the truck (shell.css `.carplay.handed-over`). */
const HANDOVER_MS = 500

/** Each site's name (brands: the same in every language). */
export const SITE_NAMES: Record<WebAppSite, string> = {
  bilibili: 'Bilibili',
  qqMusic: 'QQ Music',
  netease: 'NetEase Cloud Music',
  douyin: 'Douyin',
  kugou: 'Kugou Music',
}

/**
 * A streaming site, the site itself: its own page, whole, in a WebView of the host's under this one
 * (westplay_host::webapp), where this app cuts the cabin page open. The bar above is the cabin page's own: the
 * page's `<title>` (the song or video playing), its history back, its home page and a reload. Douyin has none of
 * it (`bare`): its own page is the whole app, as its site is a place of its own with a header, a search and a
 * sign-in of its own.
 *
 * The page isn't part of this page, so the host sends it the mouse where it points at it (crates/host/src/
 * pointer.rs), and the player's own keyboard types into its fields (webapp.js). In a plain browser there is no
 * host to show it: a note says where it opens.
 */
export function WebApp({ site }: { site: WebAppSite }) {
  const text = useText()
  const title = useWebApp((state) => state.title)
  const running = useWebApp((state) => state.site)
  const canGoBack = useWebApp((state) => state.canGoBack)
  // The screen handed to the truck: the CarPlay area goes, and the page with it.
  const handedOver = useCabin((state) => state.truckScreen)
  // A video of the page's gone full screen (the host passes on what the page said): the app covers the whole
  // CarPlay area, its bar out of the way, and the page is placed there (`place` follows the size).
  const fullScreen = useWebApp((state) => state.fullScreen)
  const page = useRef<HTMLDivElement>(null)
  // A solid background over the site while its page loads the first time (webapp.ts).
  const covering = useWebAppCover(site)
  const shown = isInHost()
  // Douyin's own page is the app: no bar of the cabin's over it (its own header, search and sign-in are the
  // page's), and the page fills the app's area the way the cabin's own players do (owner 2026-11-28).
  const bare = site === 'douyin'

  // Its page, opened as the app opens (the host says whether it's a site it already has running).
  useEffect(() => {
    command({ action: 'open', site })
    return () => {
      // The page goes first, its hole a moment after: the host takes a moment to take the WebView off, and
      // with the hole gone before it, the game's own screen showed through where the page had been (owner
      // 2026-11-12: it flashed as a site was closed or the cabin was handed back to the truck).
      command({ action: 'hide' })
      setTimeout(() => useWebApp.setState({ hole: null }), HIDE_MS)
    }
  }, [site])

  // A field of the page's takes the focus: the cabin's keyboard comes up for it, and its keys go to the host,
  // which types them into the page (the field there is the site's own: its caret, its own suggestions).
  const typing = useWebApp((state) => state.typing)
  const selection = useWebApp((state) => state.selection)
  const language = keyboardLanguage(useLanguage())
  useEffect(() => {
    if (!typing || selection === 0) return
    useKeyboard.getState().attach(webAppField, language)
    return () => useKeyboard.getState().detach(webAppField.id)
  }, [typing, selection, language])

  // Where the page shows through this one: the space under the bar, kept placed as the window moves (it grows
  // in from its icon) and the screen changes.
  useEffect(() => {
    const element = page.current
    if (!element || !shown) return
    if (handedOver) {
      // Handed to the truck: the cabin shrinks away from where the page showed, over this long (shell.css
      // `.carplay.handed-over`: the opacity's 200ms delay and its 280ms run). The hole stays until it has,
      // or the game's own screen showed through it as WestPlay shrank (owner 2026-11-12).
      command({ action: 'hide' })
      const cleared = setTimeout(() => useWebApp.setState({ hole: null }), HANDOVER_MS)
      return () => clearTimeout(cleared)
    }
    // The screen it's on, while it comes or goes (CabinApp.tsx's `Screens`): placed once it's still.
    const slot = element.closest('.screen-slot')
    const moving = () => !!slot && (slot.classList.contains('entering') || slot.classList.contains('leaving'))
    let following: (() => void) | null = null
    let settling: ReturnType<typeof setTimeout>[] = []
    let gone = false
    const place = () => {
      if (gone) return
      // The truck in reverse: the cab screen is the camera's (reverse/ReverseCamera.tsx), and this site's page
      // isn't part of this page — the host paints it over the cabin, where it is placed — so it would sit over
      // the camera whole (owner 2026-11-28: Douyin covered the reversing picture). No page while it is, and the
      // hole stays as it is (nothing of this page is there to be seen through it; in the `live` layout it is the
      // game's own picture that shows through it). The page runs on meanwhile, its sound too.
      if (reversing(useLive.getState())) {
        command({ action: 'hide' })
        return
      }
      const area = document.querySelector('.carplay')?.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      if (!area || box.width === 0 || element.offsetWidth === 0) return
      // The cabin's keyboard rises over the app — and with it whatever hangs above its own box: the input method's
      // bar and the status chip (both absolutely positioned children of it, Keyboard.tsx/keyboard.css). The page
      // stops above the highest of them: everything inside the hole is cut away by the shell's mask, so a bar
      // left inside it isn't drawn at all (the owner: no candidates over any web app, 2026-10-31).
      const floats = ['.keyboard.shown', '.keyboard-ime', '.keyboard-chip']
        .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => rect !== undefined)
      const top = floatingTop(floats)
      const lift = top === null ? 0 : Math.max(0, Math.min(box.height, box.bottom - top))
      const height = box.height - lift
      // Its rounding in screen pixels (the CarPlay area's content is zoomed to the screen's scale).
      const zoom = box.width / element.offsetWidth
      const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) * zoom
      useWebApp.setState({
        hole: { x: box.left - area.left, y: box.top - area.top, width: box.width, height, radius },
      })
      const scale = window.devicePixelRatio
      command({
        action: 'show',
        x: Math.round(box.left * scale),
        y: Math.round(box.top * scale),
        width: Math.round(box.width * scale),
        height: Math.round(height * scale),
      })
    }
    // The truck going into reverse, or leaving it: the page goes (or comes back) as the camera takes (or gives
    // back) the screen.
    const stopReverse = useLive.subscribe((live, before) => {
      if (reversing(live) !== reversing(before)) place()
    })
    // The window grows in from its icon (a transform, which no size change tells of): placed again as it
    // settles, and once the screen change is over.
    const follow = () => {
      if (gone || following || moving()) return
      following = followArea(place, element)
      settling = [120, 350, 700].map((ms) => setTimeout(place, ms))
    }
    const stopped = slot ? new MutationObserver(follow) : null
    if (slot) stopped?.observe(slot, { attributes: true, attributeFilter: ['class'] })
    whenTransitionEnds(follow)
    // The keyboard rising or falling over the page: placed again as it settles into place.
    const stopKeys = useKeyboard.subscribe(() => {
      place()
      settling = [80, 200, 340, 520].map((ms) => setTimeout(place, ms))
    })
    return () => {
      gone = true
      stopped?.disconnect()
      stopKeys()
      stopReverse()
      settling.forEach(clearTimeout)
      following?.()
      // The page goes first, its hole a moment after: the host takes a moment to take the WebView off, and
      // with the hole gone before it, the game's own screen showed through where the page had been (owner
      // 2026-11-12: it flashed as a site closed).
      command({ action: 'hide' })
      const cleared = setTimeout(() => useWebApp.setState({ hole: null }), HIDE_MS)
      settling.push(cleared)
    }
  }, [handedOver, shown, fullScreen])

  return (
    <section
      className={`app-panel webapp${bare ? ' bare' : ''}${fullScreen ? ' full-screen' : ''}`}
      aria-label={text.apps[APP_OF_SITE[site]]}
    >
      {!bare && (
        <header className="webapp-bar">
          <button
            type="button"
            className="webapp-button"
            onClick={() => command({ action: 'back' })}
            disabled={!canGoBack}
            aria-label={text.webApp.back}
          >
            <BackGlyph />
          </button>
          <div className="webapp-now">
            <div className="webapp-site">{SITE_NAMES[site]}</div>
            <div className="webapp-title" title={title}>
              {title || (shown && (running === site ? text.webApp.loading : text.webApp.opening))}
            </div>
          </div>
          <button
            type="button"
            className="webapp-button"
            onClick={() => command({ action: 'home' })}
            aria-label={text.webApp.home}
          >
            <HomeGlyph />
          </button>
          <button
            type="button"
            className="webapp-button"
            onClick={() => command({ action: 'reload' })}
            aria-label={text.webApp.reload}
          >
            <ReloadGlyph />
          </button>
        </header>
      )}
      {/* The page shows through here (the host's WebView, under this one): nothing of this page is in it,
          but the cover while its page loads (`useWebAppCover`). */}
      <div ref={page} className="webapp-page" aria-hidden>
        <div className={covering ? 'webapp-cover shown' : 'webapp-cover'} />
      </div>
      {!shown && (
        <div className="webapp-preview">
          <div className="webapp-preview-name">{SITE_NAMES[site]}</div>
          <p>{text.webApp.preview}</p>
        </div>
      )}
    </section>
  )
}

/** A chevron pointing left (history back), in the bar's buttons' size. */
function BackGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M14.5 5.5 8 12l6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HomeGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 10.7 12 4l8 6.7V19a1.3 1.3 0 0 1-1.3 1.3h-3.9v-5.6H9.2v5.6H5.3A1.3 1.3 0 0 1 4 19z"
        fill="currentColor"
      />
    </svg>
  )
}

function ReloadGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M19.6 3.9v4.4h-4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
