// WestPlay: quiet the site's own page (`qq_music.rs` loads y.qq.com rather than a blank document,
// so the page has an origin and its cookie — see `qq_music.js`).
//
// The whole site runs in there: carousels that slide, videos that autoplay, a music player of its
// own, lottie banners. None of it is looked at — the page is never shown — but it still costs a
// GPU pass of its own, and the game's cab screen is drawn from the same card. On the machine this
// was written on (owner 2026-11-26: "显示一秒原版导航显示一秒 westplay 车机一直循环" — the cab's
// screen swapping between the game's own GPS and WestPlay once a second) five WebView2 GPU
// processes were up at once.
//
// So: nothing animates, nothing plays, nothing loads a picture. What the script in `qq_music.js`
// needs is the site's origin and its cookie, and both stay.

;(() => {
  /** Freezes an element's motion, before or after the page has started it. */
  const still = (element) => {
    try {
      element.style?.setProperty('animation', 'none', 'important')
      element.style?.setProperty('transition', 'none', 'important')
    } catch (error) {
      // Not an element this can style (a text node, a document): nothing to freeze.
    }
  }

  /** A `<style>` of our own, ahead of anything the page adds. */
  const quiet = document.createElement('style')
  quiet.textContent = `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      /* A carousel that slides by transform still paints each step; held still, it paints once. */
      will-change: auto !important;
    }
    video, audio { display: none !important; }
    /* The page's own wallpaper and banners are the largest things it paints, and none of them is
       looked at: their pictures are not fetched at all. */
    img { visibility: hidden !important; }
  `

  const install = () => {
    const head = document.head ?? document.documentElement
    if (head && quiet.parentNode !== head) head.prepend(quiet)
  }
  install()
  document.addEventListener('DOMContentLoaded', install, { once: true })

  // Anything that starts playing anyway is stopped, and anything that starts animating is frozen.
  document.addEventListener(
    'play',
    (event) => {
      try {
        event.target.pause()
      } catch (error) {
        // A media element the page took apart: nothing to pause.
      }
    },
    true,
  )
  document.addEventListener(
    'animationstart',
    (event) => still(event.target),
    true,
  )
  document.addEventListener(
    'transitionrun',
    (event) => still(event.target),
    true,
  )

  /**
   * Nothing asks for a frame.
   *
   * With every animation frozen the page looked still, and it still asked the compositor for 167
   * frames a second (measured 2026-11-26): the site's own scripts drive their timers and their
   * player off `requestAnimationFrame`, and each call is a pass the compositor runs — over a window
   * nobody sees, on the card the game's cab screen is drawn from.
   *
   * A frame every ten seconds keeps anything that waits on one moving (there is little: the page
   * is not looked at), and the compositor idle between.
   */
  const raf = window.requestAnimationFrame
  let next = 0
  window.requestAnimationFrame = (callback) =>
    window.setTimeout(() => {
      try {
        callback(next += 16)
      } catch (error) {
        // A callback the page's own code broke: it would have thrown anyway.
      }
    }, 10000)
  // A page that cancels a frame it asked for: its id is a timer's now.
  window.cancelAnimationFrame = (id) => window.clearTimeout(id)

  /**
   * The page's own player leaves WestPlay's sound alone.
   *
   * y.qq.com runs its own player (a mini bar, a bottom bar, a playlist that plays by itself), and
   * it pauses any `<audio>` it finds playing: WestPlay's songs were stopped within a second of
   * starting, with `AbortError: The play() request was interrupted by a call to pause()` (traced
   * 2026-11-27 — the caller was the site's own document script, not ours).
   *
   * The element WestPlay plays through is marked (`data-westplay`), and `pause` is refused for it
   * from anywhere but WestPlay's own code (`pauseOwn` below). The rest of the page keeps its own
   * player; only that element is left out.
   */
  const OURS = 'data-westplay-audio'
  window.__westplayAllowPause = false
  const originalPause = HTMLMediaElement.prototype.pause
  HTMLMediaElement.prototype.pause = function (...args) {
    if (this.hasAttribute?.(OURS) && !window.__westplayAllowPause) return
    return originalPause.apply(this, args)
  }

  /** Pauses one of WestPlay's elements, as WestPlay's own code can. */
  window.westplayPauseOwn = (element) => {
    window.__westplayAllowPause = true
    try {
      return originalPause.call(element)
    } finally {
      window.__westplayAllowPause = false
    }
  }

  /** Marks a new element as WestPlay's (its script makes it after this runs). */
  window.westplayOwnAudio = (element) => {
    try {
      element.setAttribute(OURS, '')
    } catch (error) {
      // Not an element: nothing to mark.
    }
    return element
  }

  // The site's own scripts make elements as they scroll and after every answer; a pass over the
  // document now and then catches what appeared since.
  const settle = () => {
    for (const element of document.querySelectorAll('video, audio')) {
      try {
        element.pause()
        element.removeAttribute('autoplay')
      } catch (error) {
        // As above.
      }
    }
  }
  window.setInterval(settle, 2000)
})()
