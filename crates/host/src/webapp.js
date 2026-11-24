// A streaming site's page (Bilibili, QQ Music, NetEase Cloud Music), as WestPlay's host needs it: the page
// itself, whole and untouched, but for a text field's focus (so the player's keyboard types into it) and the
// keys the host sends for that field (the cabin's own fields take the same messages: westplay_host::webapp).
//
// Its title is WebView2's own (DocumentTitleChanged): nothing here for it.
;(() => {
  // A frame of the page's own: its sound may play there (QQ Music's does), out of the top document's reach,
  // so the cabin's volume comes to it by message and goes on its elements as they play. Nothing else here is
  // the frame's business (the top document's script does it all).
  if (window.top !== window) {
    let level = null
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...args) {
      if (level !== null) {
        this.volume = level
        this.muted = level === 0
      }
      return play.apply(this, args)
    }
    window.addEventListener('message', (event) => {
      const said = event.data
      if (!said || said.westplay !== 'volume') return
      level = Math.min(1, Math.max(0, Number(said.volume) || 0))
      for (const one of document.querySelectorAll('audio, video')) {
        one.volume = level
        one.muted = level === 0
      }
    })
    return
  }
  /**
   * Whether this document is one of the sites this script is for, as opposed to a page of an extension the player
   * installed (the one that lists QQ Music's whole playlist draws a player of its own at `player.html`, a tab in
   * the same WebView), a site's sign-in page, or an error page. A document that isn't still **reads** what it
   * plays — that player is where the music is, and the cabin's card must hear it — but it must not **press** the
   * site's own controls: the cabin sends a press to every document at once (`westplay` posts to the WebView, all
   * its tabs), so a second document answering it skipped two songs per press (owner 2026-11-10).
   */
  const SITES = /(^|\.)(bilibili\.com|qq\.com|music\.163\.com|douyin\.com|kugou\.com)$/i
  const siteDocument = SITES.test(location.hostname)
  const webview = window.chrome?.webview
  if (!webview) return
  const post = (message) => webview.postMessage(message)

  // The page's scrollbars, at its right and its bottom: thin, rounded and clear of the glass, as the cab's own
  // lists have them, and the page scrolls where it has more to show than the room it has. A site lays itself out
  // for a whole window and often keeps `overflow: hidden` (NetEase's player does): zoomed in, its right side
  // stays out of sight with nothing to drag it in with. `auto` scrolls only where there's something to scroll,
  // so a page that fits is untouched. A site laid out wider than the room (a fixed-width app shell) is panned
  // rather than clipped. (owner 2026-11-01)
  const bars = `
  * { scrollbar-width: thin !important; }
  ::-webkit-scrollbar { width: 16px !important; height: 16px !important; background: transparent !important; }
  ::-webkit-scrollbar-track { background: transparent !important; }
  ::-webkit-scrollbar-thumb {
    background: rgb(255 255 255 / 0.34) !important;
    border: 4px solid transparent !important;
    border-radius: 999px !important;
    background-clip: content-box !important;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgb(255 255 255 / 0.52) !important;
    border: 4px solid transparent !important;
    border-radius: 999px !important;
    background-clip: content-box !important;
  }
  ::-webkit-scrollbar-corner { background: transparent !important; }
  `
  /**
   * The page's own scroller, opened where a site locked it: only on the sites, whose pages lay themselves out for
   * a whole window and often keep \`overflow: hidden\` (NetEase's player does), so a zoomed-in page's right side has
   * nothing to drag it in with. A page that isn't one of the sites' — an extension's player — keeps the layout it
   * drew, its own bar pinned by a \`flex\` column whose \`body\` must not scroll: opening that scroller pushed the
   * extension's transport down to the end of its list instead of leaving it over the page (owner 2026-11-10).
   */
  const siteScroll = siteDocument
    ? `html, body { overflow: auto !important; }
  body { min-width: min-content !important; min-height: min-content !important; }`
    : ``
  // A script added to a page's start runs before the page has an <html>: there was nothing to append a <style>
  // to, and the failure took the rest of this script with it — the sites' bars never came, and neither did the
  // page's sound and fields (the owner's report, 2026-11-01). So: now if there is a document, and again as soon
  // as the page has one.
  const showBars = () => {
    const root = document.head ?? document.documentElement
    if (!root || document.getElementById('westplay-bars')) return
    const style = document.createElement('style')
    style.id = 'westplay-bars'
    style.textContent = `${siteScroll}${bars}`
    root.append(style)
  }
  showBars()
  document.addEventListener('DOMContentLoaded', showBars, { once: true })

  /** A field text goes into: an `input`, a `textarea`, or a part of the page being edited. Asked by name, not
   * by `instanceof`: a field can belong to another frame of the page (another realm, another
   * `HTMLInputElement` constructor), and the hosts of Bilibili's own components report themselves rather than
   * the field inside them. */
  const field = (element) => {
    const tag = element?.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || element?.isContentEditable === true
  }

  /** The field the page itself has focused. A part of a page inside a shadow root is reported by its host
   * (`document.activeElement` is the host, and the element that really took the focus is inside), so the
   * shadow roots are walked into. Bilibili's header search is one of those. */
  const focused = () => {
    let element = document.activeElement
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement
    return element
  }

  /** The same, for the page's own visible fields: what one of Bilibili's components holds is only reachable
   * through its shadow root. Depth-bounded: a page of nested components isn't walked to the bottom. */
  const shadowFields = (root, depth = 0, found = []) => {
    for (const one of root.querySelectorAll('input, textarea')) found.push(one)
    if (depth < 3)
      for (const host of root.querySelectorAll('*'))
        if (host.shadowRoot) shadowFields(host.shadowRoot, depth + 1, found)
    return found
  }

  // The field the player's keyboard types into. The host has the game's own keys sent while one has the
  // focus (the game's typing, as the cabin's fields ask for it).
  let typing = false
  // The field last typed into: a site that re-draws its field on every change lets the focus go, and the field
  // it re-drew is the one the cabin's keys belong in.
  let lastField = null

  /** The field the cabin's keys belong in: the focused one, else the one last focused (if the site hasn't
   * thrown it away), else the page's own visible field — a site that re-draws its field leaves the keys
   * nowhere to go otherwise. */
  const writeTarget = () => {
    const active = focused()
    if (field(active)) return active
    if (lastField && lastField.isConnected) return lastField
    const shown = shadowFields(document).filter(
      (one) =>
        one.isConnected && !one.disabled && !one.readOnly && one.type !== 'hidden' && one.getClientRects().length > 0,
    )
    return shown.at(-1) ?? null
  }
  // When the player last pressed something in the page, and what. A site that puts the focus in its own search
  // box as its page opens (Kugou Music's does) made the cabin's keyboard come up on every app's opening: a
  // focus nobody asked for is taken back out of the field, and a press that didn't land in a field asks for
  // nothing (owner 2026-11-03, twice).
  let pressedAt = 0
  let pressedField = false
  /** How long after a press a field taking the focus is taken as the player's doing, ms. */
  const PRESS_MS = 1200
  let typeProbes = 0
  /** What the focused field holds (the cabin's keyboard starts from it, and types on top of it). */
  const typedText = (element) => {
    if (!element) return ''
    if (element.isContentEditable) return (element.textContent ?? '').trim()
    return typeof element.value === 'string' ? element.value : ''
  }
  const report = (on, again = false) => {
    if (on === typing && !again) return
    typing = on
    post({ typing: on, text: on ? typedText(focused()) : '' })
  }
  document.addEventListener(
    'focusin',
    (event) => {
      if (field(event.target)) lastField = event.target
      // What the page says it focused: a field inside one of its own components is reported by the host element,
      // so the shadow roots are walked into here too (Bilibili's header search is one of those). A field the
      // player just pressed on is theirs and the cabin's keyboard comes up for it; one the page put the focus in
      // by itself (its search box as its page opens, or as its own script feels like it) has the focus taken back
      // out, so neither the cabin's keyboard nor the site's own suggestion bar stays up for nobody (owner
      // 2026-11-03).
      const active = focused()
      if (!field(active)) return
      const mine = typing || (pressedField && Date.now() - pressedAt < PRESS_MS)
      if (mine) {
        report(true)
        return
      }
      try {
        active.blur()
      } catch {}
    },
    true,
  )
  // What the field says now: the cabin's keyboard holds the same text, so its keys build on what's there.
  document.addEventListener(
    'input',
    () => {
      if (typing) post({ typing: true, text: typedText(focused()) })
    },
    true,
  )
  // The field the player clicks again (it kept the focus: no `focusin`): a new selection to the host, which
  // types again after the truck moved once and stopped.
  document.addEventListener(
    'pointerdown',
    (event) => {
      // A press in a field (or in a box holding one: a site's own search component) is the player picking it;
      // a press anywhere else says nothing of the keyboard, whatever field still has the focus (a site's search
      // box left focused by its own page had the keyboard come up on the first press in the page).
      const at = event.target
      pressedField =
        field(at) || !!(at?.closest?.('label, [class*="search" i], [class*="input" i], [class*="field" i]'))
      pressedAt = Date.now()
      if (!pressedField) return
      setTimeout(() => {
        if (field(focused())) report(true, true)
      }, 0)
    },
    true,
  )
  // A field a page puts the focus in before the player has touched anything is taken back out as well: the
  // keyboard is the player's, not the page's (Kugou Music's home focuses its search box as it loads).
  window.addEventListener('load', () => {
    setTimeout(() => {
      const active = focused()
      if (field(active) && !typing && Date.now() - pressedAt > PRESS_MS) {
        try {
          active.blur()
        } catch {}
      }
    }, 600)
  })
  document.addEventListener(
    'focusout',
    (event) => {
      if (!field(event.target)) return
      // A site re-drawing its field lets the focus go for an instant: only a focus that's still gone a moment
      // later is the player's (the keyboard goes with it).
      setTimeout(() => report(field(document.activeElement)), 300)
    },
    true,
  )

  // Nothing in these pages is dragged anywhere: a drag the page starts itself (a slider, a song's row) is the
  // browser's to run, and in a WebView of the host's that runs OLE's modal loop on the host's thread, pumping
  // messages until the drag ends — the frames stop until it does (PL 2026-10-27: QQ Music's volume slider, the
  // truck's screen blank). Refused before it starts; the page's own sliders still follow the pointer.
  for (const type of ['dragstart', 'drag', 'dragend', 'drop']) {
    document.addEventListener(type, (event) => event.preventDefault(), true)
  }

  // A link the page leaves to the browser (Bilibili's videos, QQ Music's "my music"): nothing comes of it
  // here, whether it asked for a window of its own or this one — the cabin has no second window, and this
  // WebView takes no navigation from a click of its own. So the host's word on the link: this page, at that
  // address. A click the site's own script kept (a router that pushes its own address change) is left to it.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button > 0) return
    const link = event.target?.closest?.('a[href]')
    if (!link) return
    const asked = link.getAttribute('href')
    // A place in this page (an anchor), not another document: the browser's own.
    if (!asked || asked.startsWith('#')) return
    if (link.hasAttribute('download')) return
    const href = link.href
    if (typeof href !== 'string' || !/^https?:/i.test(href)) return
    event.preventDefault()
    location.assign(href)
  })

  /** The field's text as a browser would have changed it: React's own fields see it too (the native setter
   * first, then an `input` event, which is what React listens for). */
  const setValue = (element, text) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
    if (setter) setter.call(element, text)
    else element.value = text
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }

  /** `text` into `element` whole, as the site's own field would have taken it: React's fields listen for the
   * `input` event (a plain `.value` write is not seen by them), and a part of the page being edited takes the
   * browser's own edit command, caret and history included. The cabin's input method writes this way, so a
   * site whose field is one of those still gets its Chinese (Bilibili's own components, 2026-10-31). */
  const writeText = (element, text) => {
    if (!element) return
    if (element.isContentEditable) {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      if (!document.execCommand('insertText', false, text)) element.textContent = text
      element.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    setValue(element, text)
    // Fields of some types (a number's) have no selection to set: the text is in all the same.
    try {
      element.setSelectionRange(element.value.length, element.value.length)
    } catch {}
  }

  /** `text` into the focused field, at its cursor (or over what's selected there). */
  const insert = (text) => {
    const element = focused()
    if (!field(element)) return
    if (element.isContentEditable) {
      document.execCommand('insertText', false, text)
      return
    }
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start
    setValue(element, element.value.slice(0, start) + text + element.value.slice(end))
    // Fields of some types (a number's) have no selection to set: the text is in all the same.
    try {
      element.setSelectionRange(start + text.length, start + text.length)
    } catch {}
  }

  /** A backspace: the selection, the character before the cursor, or the word before it. */
  const erase = (word) => {
    const element = focused()
    if (!field(element)) return
    if (element.isContentEditable) {
      document.execCommand('delete')
      return
    }
    let start = element.selectionStart ?? 0
    let end = element.selectionEnd ?? start
    if (start === end) {
      if (word) {
        const before = element.value.slice(0, start)
        const kept = before.replace(/\s*\S+$/, '')
        start = kept.length
      } else {
        // A character, not half of one (the game types code points).
        start = Array.from(element.value.slice(0, start)).slice(0, -1).join('').length
      }
    }
    setValue(element, element.value.slice(0, start) + element.value.slice(end))
    try {
      element.setSelectionRange(start, start)
    } catch {}
  }

  /** A key with no text of its own (a search's Enter, a page's Escape), as the page's own would be — with the
   * old `keyCode`/`which` numbers too: the sites' own search boxes still ask for those, not the key's name. */
  const OLD_CODES = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8 }
  const stroke = (type, key) => {
    const event = new KeyboardEvent(type, {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
    })
    const code = OLD_CODES[key]
    if (code !== undefined) {
      const said = [
        ['keyCode', code],
        ['which', code],
        ['charCode', type === 'keypress' ? code : 0],
      ]
      for (const [name, value] of said) {
        try {
          Object.defineProperty(event, name, { get: () => value })
        } catch {}
      }
    }
    return event
  }
  const press = (key) => {
    const element = document.activeElement ?? document.body
    element.dispatchEvent(stroke('keydown', key))
    if (key === 'Enter') element.dispatchEvent(stroke('keypress', key))
    element.dispatchEvent(stroke('keyup', key))
    // The game's Enter in a field: the search submits (the page's own key handler may have done it already,
    // and a form asks its submitter, so a page with neither isn't submitted twice).
    if (key === 'Enter' && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      const form = element.form
      if (form && !form.querySelector('[type="submit"]')) form.requestSubmit()
    }
  }

  /** The page's search, run: its own Enter, and where the page pays that no mind, its own search button. */
  const submit = () => {
    const started = location.href
    const fieldNow = writeTarget()
    // The field the keys belong in, focused (a site that re-drew it left the Enter nowhere to go).
    if (fieldNow && fieldNow !== document.activeElement) {
      try {
        fieldNow.focus()
      } catch {}
    }
    press('Enter')
    setTimeout(() => {
      // A page that took the Enter: it goes (its results are another address).
      if (location.href !== started) return
      const around = fieldNow?.closest('form') ?? fieldNow?.parentElement?.parentElement ?? null
      const named = [...(around ?? document).querySelectorAll('button, a, [role="button"], [title]')].find((one) =>
        /^(搜索|搜一下|搜索一下|search)$/i.test(`${one.getAttribute('title') ?? ''} ${one.textContent ?? ''}`.trim()),
      )
      post({
        submitProbe: `${location.pathname}: enter took nothing, button ${named ? `${named.tagName}.${String(named.className).slice(0, 24)}` : 'none'}`,
      })
      if (named) tap(named)
    }, 800)
  }

  webview.addEventListener('message', (event) => {
    const message = event.data
    if (!message) return
    // The cabin's own input method's pick: at the field's own caret, the page doing it
    // itself (`insert` above) so it lands even in a field the browser never focused
    // (Bilibili's own search box, under DevTools' Input.insertText, took nothing).
    if (message.type === 'webAppInsert') {
      const text = String(message.text ?? '')
      let element = focused()
      if (!element || !field(element)) element = writeTarget()
      if (element) {
        if (element !== focused()) {
          try {
            element.focus()
          } catch {}
        }
        if (element.isContentEditable || field(element)) insert(text)
        else writeText(element, String(element.value ?? '') + text)
      }
      return
    }
    // The cabin's own keyboard typing into the field (its keys are the page's field's text, whole).
    if (message.type === 'webAppText') {
      const text = String(message.text ?? '')
      const target = writeTarget()
      if (target) {
        if (target !== focused()) {
          try {
            target.focus()
          } catch {}
        }
        writeText(target, text)
      }
      // The first few only: what the page's field was, and what became of the text (webapp.rs logs it).
      if (typeProbes < 8) {
        typeProbes += 1
        const named = target === null ? 'none' : `${target.tagName}.${String(target.className).slice(0, 20)}`
        post({
          textProbe: `"${text.slice(0, 12)}" active=${focused()?.tagName ?? '-'}${focused()?.isContentEditable ? ' ce' : ''} last=${lastField?.isConnected ? 'live' : 'none'} target=${named} value="${String(target?.value ?? '').slice(0, 20)}"`,
        })
      }
      return
    }
    // A key with no text of its own (its return key).
    if (message.type === 'webAppKey' && typeof message.key === 'string') {
      if (message.key === 'Enter') submit()
      else press(message.key)
      return
    }
    if (message.type !== 'typed' || !Array.isArray(message.events)) return
    for (const typed of message.events) {
      if (typeof typed.text === 'string') insert(typed.text)
      else if (typed.key === 'backspace') erase(false)
      else if (typed.key === 'wordBackspace') erase(true)
      else if (typed.key === 'enter') submit()
      else if (typed.key === 'escape') press('Escape')
    }
  })

  // What the site plays, as the site tells the system: its Media Session says the song, who it's by and its
  // cover, and the element playing it says where in the song we are. Both players set one when a song plays
  // (it's what puts them in Windows' own media controls); a page that doesn't, or isn't playing, says nothing
  // and the dashboard keeps showing the last thing that did.
  const cover = (artwork) => {
    if (!Array.isArray(artwork) || artwork.length === 0) return null
    const area = (one) => {
      const [width, height] = String(one?.sizes ?? '')
        .split('x')
        .map(Number)
      return Number.isFinite(width) && Number.isFinite(height) ? width * height : 0
    }
    const best = artwork.reduce((chosen, one) => (area(one) > area(chosen) ? one : chosen), artwork[0])
    return typeof best?.src === 'string' && best.src ? best.src : null
  }

  // A page's player often plays through an element it never puts in the page (a `new Audio()` of its own): so
  // what plays is followed as it plays, and only then looked for in the page.
  const heard = new Set()
  // The volume the cabin last set, put on an element **as it starts**, not a second later: a site makes a
  // new element for the next song and starts it at full volume (NetEase Cloud Music's does, its sound never
  // being in the page at all), and the once-a-second pass put the cabin's volume back only then — the song
  // came in loud for a moment on every press of play or next (owner 2026-11-12). `null` until the volume
  // section below has run; a page that keeps its own volume (`ownVolume`) leaves it null.
  let earlyVolume = null
  const played = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (...args) {
    heard.add(this)
    if (earlyVolume !== null) {
      this.volume = earlyVolume
      this.muted = earlyVolume === 0
    }
    return played.apply(this, args)
  }

  // The page's own word for 上一首/下一首: a site that answers Windows' media keys has the action in its own code
  // (NetEase Cloud Music's new player registers `nexttrack` and `previoustrack`: its own bundle says so), and the
  // browser calls those only from a hardware key. The handler is kept as the page registers it, so WestPlay can
  // make the same call — the site's own queue moves, whatever shape its buttons have and wherever they're drawn
  // (owner 2026-11-02: 切歌 had nowhere to press on the new player).
  const sessionActs = new Map()
  {
    const proto = navigator.mediaSession ? Object.getPrototypeOf(navigator.mediaSession) : null
    const real = proto?.setActionHandler
    if (typeof real === 'function') {
      proto.setActionHandler = function (action, handler) {
        try {
          if (handler) sessionActs.set(action, handler)
          else sessionActs.delete(action)
        } catch {}
        return real.call(this, action, handler)
      }
    }
  }
  /** The page's own handler for `action` (`nexttrack`, `pause`…), called where it registered one; whether it did. */
  const sessionAct = (action) => {
    const handler = sessionActs.get(action)
    if (typeof handler !== 'function') return false
    try {
      handler({ action })
      return true
    } catch {
      return false
    }
  }

  /** Whether an element can be the song at all: something to play. A page keeps media elements of its own with no
   * address and no data, and one whose `play()` was called is never paused again (QQ Music's player page keeps
   * exactly one: `mediaProbe … media=1 rs=0 speakable=false`). Taken as the song it says "playing" for ever, so the
   * card said the opposite of the page from the moment the song stopped (owner 2026-11-02, again: paused, the card
   * playing). */
  const sounding = (one) =>
    Boolean(one) &&
    !one.ended &&
    Boolean(one.srcObject || ((one.currentSrc || one.src) && one.readyState >= 1))

  /** The element the song plays through (`<audio>` in a music site, `<video>` on a video one): the one that
   * plays, where a page has more than one (a preloader, an advertisement's own). */
  const player = () => {
    const playing = [...heard].find((one) => sounding(one) && !one.paused)
    if (playing) return playing
    const inPage = elements()
    return (
      inPage.find((one) => sounding(one) && !one.paused) ??
      [...heard].filter(sounding).at(-1) ??
      inPage.find(sounding) ??
      null
    )
  }

  // The truck's own speakers (cab_sound.js, loaded before this: the host tells the page the speakers, the
  // driver's head, the camera outside and the cab's tone, and the sound plays through them). A site's page
  // plays its sound its own way, and the browser takes into its own audio graph only a stream of the page's
  // own (one it feeds itself, a `blob:`: MSE) or one it asked for with CORS: another site's plain file comes
  // through silent there, so it's left as the page plays it, and the log says which was which (`mediaProbe`).
  const speakable = (element) => {
    if (!element || element.mediaKeys) return null

    const src = element.currentSrc || element.src || ''
    // A page that fills its element's address as it starts (Bilibili's a moment after): an element with none is
    // never taken — given a plain address from another site after, it would play through the browser's graph
    // silent, and an element is taken in once only, ever.
    if (!src || element.readyState < 2) return null
    if (src.startsWith('blob:') || element.crossOrigin) return element
    try {
      if (new URL(src, location.href).origin === location.origin) return element
    } catch {}
    return null
  }
  const cab = window.westplayCabSound?.(() => speakable(player()), post) ?? null
  // The page's own script is new with every page (and a site's own router may bring another): the cab as the
  // host last told it (webapp.rs, `Told`).
  post({ ready: true })
  webview.addEventListener('message', (event) => {
    const command = event.data
    if (!cab || !command?.action) return
    if (command.action === 'speakers') cab.speakers(command.speakers)
    else if (command.action === 'head') cab.head(command)
    else if (command.action === 'outside') cab.outside(command.on, command.distance)
    else if (command.action === 'equalizer') cab.equalizer(command)
    else if (command.action === 'spectrum') cab.spectrum(command.on)
  })
  /** The page's own documents: this one, and the frames of its own (a site's player may run in one of them;
   *  NetEase Cloud Music's does). Another site's frame is off limits: the browser's to refuse. */
  const frames = () => {
    const found = [document]
    const walk = (doc, depth) => {
      if (depth >= 3) return
      for (const frame of doc.querySelectorAll('iframe')) {
        let inner = null
        try {
          inner = frame.contentDocument
        } catch {}
        if (!inner) continue
        found.push(inner)
        walk(inner, depth + 1)
      }
    }
    walk(document, 0)
    return found
  }

  // A site's player can make its sound and never put it in the page: NetEase Cloud Music's new player does (the
  // page's own elements are none, its sound is a media element of its own, made and left out of the document),
  // so the cabin's volume reached nothing there and the page said it played nothing (owner 2026-11-01: the
  // keybinds' volume did nothing on it). Every media element the page makes is kept as it's made, whether it
  // ends up in the page or not; the oldest are dropped, so a player that makes one a second can't grow this.
  const madeMedia = new Set()
  const MOST_MADE_MEDIA = 32
  const watched = (element) => {
    if (element instanceof HTMLMediaElement) {
      madeMedia.add(element)
      if (madeMedia.size > MOST_MADE_MEDIA) madeMedia.delete(madeMedia.values().next().value)
    }
    return element
  }
  {
    const Sound = window.Audio
    window.Audio = class extends Sound {
      constructor(...args) {
        super(...args)
        watched(this)
      }
    }
    const createElement = Document.prototype.createElement
    Document.prototype.createElement = function (name, options) {
      return watched(createElement.call(this, name, options))
    }
  }

  /** Every media element the page and its own frames have, and every one they make but keep out of the document. */
  const elements = () => {
    const found = frames().flatMap((doc) => [...doc.querySelectorAll('audio, video')])
    for (const one of madeMedia) if (!found.includes(one)) found.push(one)
    return found
  }

  // What the speakers got, once a page: a site whose sound can't go through them says `speakable false`, and
  // where its sound comes from (a frame of its own? an address the browser lets out only with CORS?).
  let cabSaid = false
  const sayCab = (element) => {
    if (cabSaid) return
    cabSaid = true
    const src = element.currentSrc || element.src || ''
    const all = elements()
    post({
      mediaProbe:
        `${location.host} src=${src.slice(0, 60)} xo=${element.crossOrigin || 'none'} ` +
        `so=${element.srcObject ? element.srcObject.constructor.name : 'none'} rs=${element.readyState} ` +
        `keys=${Boolean(element.mediaKeys)} inFrame=${element.ownerDocument !== document} ` +
        `frames=${frames().length - 1} media=${all.length} ` +
        `speakable=${Boolean(speakable(element))}`,
    })
    // Whether that address would come through the browser's graph at all: a request of it with CORS.
    if (/^https?:/i.test(src)) {
      fetch(src, {
        method: 'GET',
        headers: { Range: 'bytes=0-1' },
        mode: 'cors',
      })
        .then((answer) =>
          post({
            mediaProbe: `${location.host} cors=${answer.ok || answer.status === 206 ? 'ok' : answer.status} ${src.slice(0, 60)}`,
          }),
        )
        .catch(() =>
          post({
            mediaProbe: `${location.host} cors=failed ${src.slice(0, 60)}`,
          }),
        )
    }
  }

  // The site's own buttons: its titles say what they do, and where it has none, its own words do (QQ Music's
  // player page writes 上一首 inside the link, not in a title) — so they're found by what they say rather than
  // by a class the site's next release renames.
  const NAMED = {
    previous: [/^上一首|^上一个|^前一首|^previous|^prev$|^prv$/i, /上一首|上一个|前一首/i],
    playPause: [/^暂停|^pause$/i, /^播放\s*\/\s*暂停|^播放$|^play$/i, /暂停|播放|play|pause/i],
    next: [/^下一首|^下一个|^后一首|^next$|^nxt$/i, /下一首|下一个|后一首/i],
  }

  /** What is about the player but isn't its transport: a "随机播放" is not a "播放", a "展开播放条" neither, and
   * "播放全部" starts the list rather than pausing what plays (NetEase Cloud Music's new player has one at hand,
   * and pressing it for play/pause started the list again instead: owner 2026-11-01). */
  const NOR =
    /模式|随机|顺序|单曲|循环|音量|音质|列表|收藏|下载|歌词|评论|分享|更多|全部|条|器|客户端|展开|like|download|mode|shuffle|repeat|volume|list/i

  /** Where a site keeps its player's buttons (its player bar, else the whole page). */
  const playerArea = () =>
    document.querySelector('.player__ft, .m-playbar, .g-btmbar, .player_music, .btns, .player-wrapper, .player') ??
    document.body

  /** 蜻蜓FM's player bar keeps its transport in icons that say nothing of themselves: `div.prev`,
   * `div.play-pause`, `div.next` (webapp.js below, `button`). */

  /** Kugou Music's player bar draws its transport as three links with no words at all (`a#prev`, `a#toggle`,
   * `a#next`, their icons' own class the only mark): its ids are the site's own, and they've not changed in
   * years, so they're pressed as they are. */
  const KG_BUTTONS = {
    previous: '#prev',
    playPause: '#toggle',
    next: '#next',
  }

  /** What an element calls itself: its title, else its own words (where they're short enough to be a name). */
  const label = (element) => {
    const told = [element.getAttribute('title'), element.getAttribute('aria-label')]
      .map((one) => (one ?? '').trim())
      .filter((one) => one !== '')
    if (told.length > 0) return told.join(' ')
    const words = (element.textContent ?? '').trim().replace(/\s+/g, ' ')
    return words !== '' && words.length <= 10 ? words : ''
  }

  /** How an element is named, for the log. */
  const describe = (element) => `${element.tagName}.${String(element.className).split(' ')[0]}="${label(element)}"`

  /** Whether `element` sits in a button that is about the player but isn't its transport ("播放全部" holds an
   * icon that says only "play"): the button's own name decides, not the icon's. */
  const insideNo = (element) => {
    const pressable = element.closest('a, button, [role="button"]')
    return pressable !== null && pressable !== element && NOR.test(label(pressable))
  }

  /** A control whose class says what it does, for players that name theirs nowhere else (QQ Music's home page
   * bar is a sprite with a class and no words at all: owner 2026-11-02, nothing to press for the electrics). */
  const NOR_CLASS = /(^|[^a-z])(all|list|bottom|sprite|mode|random|shuffle|repeat|volume|download|like)([^a-z]|$)/i

  const CLASS_NAMED = {
    playPause: [/(^|[^a-z])(?:btn[_-]?)?(pause|play)([^a-z]|$)/i],
    previous: [/(^|[^a-z])(prev|previous|back)([^a-z]|$)/i],
    next: [/(^|[^a-z])(next|forward)([^a-z]|$)/i],
  }

  /** The button that does `action`: a site's own known control where it names none (蜻蜓FM's bar), else the
   * shortest name that says it, among the things that can be pressed, else the control whose class says it. */
  const button = (action) => {
    if (/(^|\.)kugou\.com$/.test(location.hostname)) {
      const known = document.querySelector(KG_BUTTONS[action])
      if (known) return known
    }
    const named = [...playerArea().querySelectorAll('a, button, [role="button"], [title], [aria-label]')]
      .map((one) => ({ one, said: label(one) }))
      .filter(({ one, said }) => said !== '' && !NOR.test(said) && !insideNo(one))
      .sort((one, other) => one.said.length - other.said.length)
    for (const pattern of NAMED[action] ?? []) {
      const found = named.find(({ said }) => pattern.test(said))
      if (found) return found.one
    }
    // A player whose controls are icons that say their own name as words (NetEase Cloud Music's new player: a
    // `div.cmd-icon` holding "prev", "play", "next", and no title anywhere): the smallest thing in the area that
    // says it, its own words read (owner 2026-11-02: 切歌 did nothing there).
    const saying = [...playerArea().querySelectorAll('a, button, [role="button"], div, span, i, svg, use')]
      .map((one) => ({ one, said: label(one) }))
      .filter(({ one, said }) => said !== '' && said.length <= 12 && !NOR.test(said) && !insideNo(one))
      .filter(({ one }) => one.querySelectorAll('*').length <= 2)
      .sort((one, other) => one.said.length - other.said.length)
    for (const pattern of NAMED[action] ?? []) {
      const found = saying.find(({ said }) => pattern.test(said))
      if (found) return found.one
    }
    // Nothing is named that way: a class that says it does, the smallest such element first (a bar's own button
    // rather than the box around it).
    const classed = [...playerArea().querySelectorAll('a, button, [role="button"], div, span')]
      .map((one) => ({ one, cls: String(one.className) }))
      .filter(
        ({ one, cls }) =>
          cls !== '' && !NOR.test(cls) && !NOR_CLASS.test(cls) && one.querySelectorAll('*').length <= 2,
      )
      .sort((one, other) => one.one.querySelectorAll('*').length - other.one.querySelectorAll('*').length)
    for (const pattern of CLASS_NAMED[action] ?? []) {
      const found = classed.find(({ cls }) => pattern.test(cls))
      if (found) return found.one
    }
    return null
  }

  /** A press, as a browser makes one: some players listen for the press, not the click. */
  const tap = (element) => {
    const where = { bubbles: true, cancelable: true, view: window }
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const event =
        type.startsWith('pointer') && typeof PointerEvent === 'function'
          ? new PointerEvent(type, { ...where, pointerId: 1, isPrimary: true })
          : new MouseEvent(type, where)
      element.dispatchEvent(event)
    }
  }

  /** What the player area has, for the log (a site's own names, read rather than guessed at). */
  const areaNames = () =>
    [...playerArea().querySelectorAll('[title], [aria-label], button, a, [class*=cmd-], [class*=icon], [class*=btn]')]
      .slice(0, 18)
      .map(
        (one) =>
          `${one.tagName}.${String(one.className).split(' ')[0]}="${(one.getAttribute('title') ?? one.getAttribute('aria-label') ?? one.textContent ?? '').trim().slice(0, 12)}"`,
      )
      .join(' | ')

  // ---- The volume ---------------------------------------------------------------------------
  // The page's own sound element's, as the cabin's slider sets it. A site makes a new element for another
  // song (or a new page) and starts it at full volume: the volume the cabin last set goes back on it
  // (`restored` below), which is what "QQ Music comes back at full volume" was.
  const VOLUME_KEY = 'westplay.volume'
  /**
   * Whether the page's own player keeps its volume: Bilibili's and Douyin's do. The cabin's slider is left out
   * of the card for them (`cabinVolumeFor`, apps/web/webapp.ts), and nothing here may put a volume on their
   * pages either — each player has a volume control of its own, and ours (which writes the element's `volume`,
   * or a gain node on its audio graph) would override it for good (`restored`/the watchdog below re-apply it
   * every second). The owner asked for Bilibili's own volume control to be left alone (2026-10-31), and later
   * for Douyin's to come **first**: its player's slider wins over anything the cabin says (2026-11-03,
   * "让抖音自带的音量条优先级最高"). The player's volume keybinds still reach both (`hotkeyVolume`).
   */
  const ownVolume = /(^|\.)(bilibili|douyin)\.com$/i.test(location.hostname)
  /**
   * Whether the player's volume keybinds (the companion's Controls) still reach this page's sound, although its
   * player keeps its own volume: Douyin's and Bilibili's do (owner 2026-11-03, "让抖音适配快捷键音量控制", then
   * "现在让哔哩哔哩适配快捷键"). Bilibili's used to be its player's alone (§26.3): a press now steps from the volume
   * its own slider reports, exactly as Douyin's does — the card's slider stays off, and nothing is kept or watched.
   *
   * Such a press sets the volume on what the page plays **once**: nothing is kept for next time, `restored`/
   * the watchdog below put nothing back, and the frames are never told — the site's own slider stays the one
   * that counts between presses (§82), and it moves while ours doesn't. The cabin already hears where the
   * player's slider stands (the `volume` report in `say()` below isn't gated by `ownVolume`), so each keybind
   * steps from the page's real volume rather than a stale one.
   */
  const hotkeyVolume = /(^|\.)(bilibili|douyin)\.com$/i.test(location.hostname)
  /** How long a keybind's volume is held against the player's own redrawing, in ms (heard, then let go). */
  const HOLD_MS = 1200
  let wantedVolume = null
  const sounds = () => [...new Set([...heard, ...elements()])]
  /** The volume the cabin last set for this site (this run's, else the last run's), `null`: never set. */
  const recallVolume = () => {
    if (wantedVolume !== null) return wantedVolume
    try {
      const said = localStorage.getItem(VOLUME_KEY)
      // Nothing kept is not a volume of nought (`Number(null)` is 0): the site's own stands then.
      if (said === null) return null
      const kept = Number(said)
      return Number.isFinite(kept) && kept >= 0 && kept <= 1 ? kept : null
    } catch {
      return null
    }
  }

  // The page's sound starts at the volume it was left at, the first song of a reload included: the
  // `play` hook above puts this on each element as it starts (a site keeps its own volume's, Bilibili's
  // and Douyin's, so nothing is kept for them).
  if (!ownVolume) earlyVolume = recallVolume()
  /** The page's sound at `level` (0: silent): every element of it, muted where it's nought. */
  const putVolume = (clean) => {
    // Kept for the next element the page makes (`play` above): the site's new song starts at the cabin's
    // volume rather than its own full one. A page that keeps its own volume never puts anything here.
    if (!ownVolume) earlyVolume = clean
    for (const one of sounds()) {
      one.volume = clean
      one.muted = clean === 0
    }
  }
  /**
   * `putVolume` again and again for `ms` (a press the player's own redrawing would undo: a site's player sets
   * its element's volume back from its own state a moment later, measured on Douyin's video player). Held just
   * long enough to be heard, then the page's own volume has it: nothing is kept, and a drag on the site's own
   * bar during those moments wins as soon as they're over.
   */
  const holdVolume = (clean, ms) => {
    const until = Date.now() + ms
    const again = () => {
      if (Date.now() > until) return
      putVolume(clean)
      setTimeout(again, 100)
    }
    again()
  }
  /**
   * The cab's own quiet over this page's sound while the truck reverses: `level` while the cab holds it, and what
   */
  let ducked = null

  const duckVolume = (level) => {
    if (level === null) {
      // Let go: the page's own volume back, exactly as it was, and nothing kept of the cab's.
      if (ducked !== null) putVolume(ducked.before)
      ducked = null
      return
    }
    const clean = Math.min(1, Math.max(0, Number(level) || 0))
    if (ducked === null) {
      const one = sounds().find((sound) => !sound.paused) ?? sounds()[0]
      ducked = { level: clean, before: one ? (one.muted ? 0 : one.volume) : 1 }
    } else {
      ducked.level = clean
    }
    // Only ever quieter: a page already under the cab's level (the player turned it down to 5% or 10%)
    // stays where it is. Holding it *at* 15% instead turned a quiet song up as the truck reversed, and
    // back down on the way out (owner 2026-11-18: "倒车时音量忽大忽小").
    const held = Math.min(clean, ducked.before)
    holdVolume(held, HOLD_MS)
    post({ volume: held })
  }
  /** The page's sound at `level` (0: silent), kept for the next page too where the cabin asked for it. A page
   * whose player keeps its own volume (Bilibili's, Douyin's) is left alone, whatever the cabin asks — except
   * its player's volume keybinds, where `hotkeyVolume` says they still reach it (set once, kept by nothing). */
  const applyVolume = (level, keep) => {
    const clean = Math.min(1, Math.max(0, Number(level) || 0))
    if (ownVolume) {
      // The volume the player's keybinds set on purpose (`keep`): once, onto what the page plays, and
      // nothing after it — no memory of it, no watchdog, no frames. Everything else is the player's own.
      if (!(hotkeyVolume && keep)) return
      putVolume(clean)
      // Held a moment: the player's own redraw puts its volume back within a fraction of a second, and a
      // press the player never hears is no press at all. After that it's the page's own again.
      holdVolume(clean, HOLD_MS)
      post({ volume: clean })
      return
    }
    putVolume(clean)
    // A page whose sound is a graph's (no element of it anywhere): the node ours sits in carries the volume.
    for (const gain of graphGains) gain.gain.value = clean
    if (!keep) return
    wantedVolume = clean
    try {
      localStorage.setItem(VOLUME_KEY, String(clean))
    } catch {}
    broadcastVolume(clean)
    // The cabin's own slider is where the volume is now, whatever the page's element says.
    post({ volume: clean })
    setTimeout(() => say(true), 120)
  }

  // A page that plays through the Web Audio API (QQ Music's does: no element of it is ever played, and its page
  // has no frame at all) has no element to set. Its graph's own destination is where the
  // cabin's volume goes in: every connection to it passes through a gain node of ours that carries the volume.
  const graphGainOf = new WeakMap()
  const graphGains = new Set()
  const level = () => recallVolume() ?? 1
  const isDestination = (target) => /AudioDestinationNode/.test(target?.constructor?.name ?? '')
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (target, ...rest) {
    if (ownVolume || !isDestination(target)) return connect.call(this, target, ...rest)
    const context = this.context
    let gain = graphGainOf.get(context)
    if (!gain) {
      gain = context.createGain()
      gain.gain.value = level()
      connect.call(gain, target)
      graphGainOf.set(context, gain)
      graphGains.add(gain)
    }
    return connect.call(this, gain, ...rest)
  }
  /** The volume to every frame of the page's (cross-origin ones too: a message is the way in). */
  const broadcastVolume = (level) => {
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        frame.contentWindow?.postMessage({ westplay: 'volume', volume: level }, '*')
      } catch {}
    }
  }

  // Said once a page, the first time the cabin's volume found nothing in it to set (`volumeProbe`).
  let saidNoSound = false

  // The dashboard's play/pause, previous and next: the page's own buttons, so its own player does it (and its
  // own screen says so).
  const tried = new Set()
  webview.addEventListener('message', (event) => {
    const message = event.data
    // The wheel over the page, where WebView2's own went nowhere (Bilibili's page never turned with it: owner
    // 2026-11-02): the box under the cursor scrolls by hand, once the turn is over and only if the page's own
    // wheel moved nothing all the way through it (§64).
    if (message && message.type === 'webAppWheel') {
      turnWithWheel(Number(message.dy))
      return
    }
    if (!message || message.type !== 'webAppMedia' || !message.action) return
    // The cab's own quiet (the truck reversing), on every page, its player's own volume or not — an extension's
    // player has its sound there too, and must be quieted with the rest.
    if (message.action === 'duckVolume') {
      duckVolume(message.volume ?? null)
      return
    }
    // A playlist extension's player (`extensionSong`): its own transport buttons take the cabin's presses, by their
    // own ids. It is the only page answering there — the site's own tab isn't playing anything the cabin shows —
    // so a press lands once, on the player the music is in (owner 2026-11-10: the card read the song but its
    // buttons did nothing).
    if (!siteDocument) {
      // Its sound answers the cabin's own slider too (`applyVolume`: the element's `volume`, kept for the next
      // song as on the sites), and its transport the cabin's presses.
      if (message.action === 'setVolume') applyVolume(message.volume, true)
      else pressExtension(message.action)
      return
    }
    // The cabin's own volume slider: straight onto the page's sound, and remembered for next time.
    if (message.action === 'setVolume') {
      applyVolume(message.volume, true)
      // Nothing to put it on: the page's sound isn't a media element (or is somewhere WestPlay can't reach), and
      // the cabin's volume slider moved over a page that can't hear it.
      if (elements().length === 0 && !saidNoSound) {
        saidNoSound = true
        post({ volumeProbe: `${location.host} volume ${message.volume} but no media in the page` })
      }
      return
    }
    const before = said
    const song = player()
    // Whether the page's own sound pauses, before the press: a player's button may say one thing for seconds after
    // it acted (QQ Music's says 暂停 long after the music stopped, owner 2026-11-01), while the element itself
    // stops at once — so the element is what says the press did something.
    const wasPaused = song ? song.paused : null
    const flipped = () => song !== null && wasPaused !== null && song.paused !== wasPaused
    // 上一首/下一首: NetEase Cloud Music's new player draws its transport as icons WestPlay can't name (its own
    // bundle registers `nexttrack`/`previoustrack` for Windows' media keys instead), so there the page's own action
    // is taken first; every other site keeps pressing its own button, as before.
    const skip = message.action === 'previous' ? 'previoustrack' : message.action === 'next' ? 'nexttrack' : null
    if (skip !== null && /(^|\.)music\.163\.com$/.test(location.hostname)) {
      if (sessionAct(skip)) {
        if (!tried.has(`${message.action}-keys`)) {
          tried.add(`${message.action}-keys`)
          post({ pressProbe: `${location.pathname} ${message.action} -> media session ${skip}` })
        }
        // Its own action, called right here: the new song is read at once, not at the next tick (the page is hidden
        // while the dashboard shows, and a hidden page's timers run late).
        say(true)
        setTimeout(() => say(true), 350)
        // And whether it moved anything goes to the log: a card whose button "does nothing" then says where it
        // stopped (§62).
        setTimeout(() => {
          if (said !== before) return
          post({ pressProbe: `${location.pathname} ${message.action}: media session ${skip} moved nothing` })
        }, 3000)
        return
      }
    }
    const chosen = button(message.action)
    // Play/pause: the press is the last word on what the page does, until its own button says so too (a site
    // whose sound isn't a media element of the page has nothing else to tell it by).
    const wasPlaying = playingOwn()
    if (message.action === 'playPause' && (chosen || song)) {
      intent = !wasPlaying
      intentAt = Date.now()
    }
    if (chosen) {
      const was = label(chosen)
      chosen.click()
      // What was pressed, once for each: the site's own buttons change shape between its releases.
      if (!tried.has(message.action)) {
        tried.add(message.action)
        post({
          pressProbe: `${location.pathname} ${message.action} -> ${describe(chosen)}`,
        })
      }
      // What it did shows on the page's own screen: read it again soon, rather than at the next tick.
      setTimeout(() => say(true), 350)
      // Whether it did anything is the page's own word: its button says 暂停 or 播放, its bar shows another song.
      // (What plays is too slow a measure — a pause is only certain once its clock has stopped for a while, and
      // pressing again in the meantime would start it up again.)
      const acted = () => said !== before || label(chosen) !== was || flipped()
      // Nothing came of the click: a player that listens for the press rather than for the click.
      setTimeout(() => {
        if (acted()) return
        tap(chosen)
        setTimeout(() => say(true), 400)
        // Still nothing: the page's own element (where there is one) gets the last word, and the player area's
        // names go to the log.
        setTimeout(() => {
          if (acted()) return
          post({
            buttonProbe: `${location.pathname} ${message.action} no change || ${areaNames()}`.slice(0, 800),
          })
          if (message.action === 'playPause' && song) {
            if (song.paused) song.play().catch(() => {})
            else song.pause()
          }
        }, 1600)
      }, 1200)
      return
    }
    // Nothing titled that way: the page's own action for the media keys (the state it names for Windows is the one
    // to ask for the opposite of), else its own element.
    if (message.action === 'playPause') {
      const named = navigator.mediaSession?.playbackState
      const playing = named === 'playing' || (named !== 'paused' && wasPlaying)
      const kind = playing ? 'pause' : 'play'
      if (sessionAct(kind)) {
        if (!tried.has('playPause-keys')) {
          tried.add('playPause-keys')
          post({ pressProbe: `${location.pathname} playPause -> media session ${kind}` })
        }
        setTimeout(() => say(true), 350)
        return
      }
    }
    // Its own element (where there is one) or what the area has.
    if (message.action === 'playPause' && song) {
      if (song.paused) song.play().catch(() => {})
      else song.pause()
      return
    }
    // Its own action for the media keys, where it registered one and no button said it (`sessionActs`): the site's
    // own queue moves, and the log says which way it went.
    if (skip !== null && sessionAct(skip)) {
      if (!tried.has(`${message.action}-keys`)) {
        tried.add(`${message.action}-keys`)
        post({ pressProbe: `${location.pathname} ${message.action} -> media session ${skip}` })
      }
      setTimeout(() => say(true), 350)
      return
    }
    // No button of the page says it at all (its controls are drawn somewhere WestPlay can't reach): the player's
    // own keys, as its bar itself advertises them (NetEase Cloud Music's own titles: "上一首(ctrl+←)", "下一首
    // (ctrl+→)"), pressed on the page — and the log says so, so the next report names what it was.
    // Its own bar's icons, where its media-key actions aren't registered (a page that hasn't started a song in
    // this document yet): the site's own queue still moves, and the log names the word that was pressed (§62).
    if (skip !== null && /(^|\.)music\.163\.com$/.test(location.hostname)) {
      const pressed = neteaseSkip(message.action)
      if (pressed !== null) {
        post({ pressProbe: `${location.pathname} ${message.action} -> its own bar's "${pressed}"` })
        say(true)
        setTimeout(() => say(true), 350)
        return
      }
    }
    if (message.action === 'previous' || message.action === 'next') {
      const left = message.action === 'previous'
      const key = left ? 'ArrowLeft' : 'ArrowRight'
      const code = left ? 37 : 39
      for (const target of [document, window]) {
        for (const type of ['keydown', 'keyup']) {
          target.dispatchEvent(
            new KeyboardEvent(type, { key, code: key, keyCode: code, which: code, ctrlKey: true, bubbles: true, cancelable: true }),
          )
        }
      }
      post({ pressProbe: `${location.pathname} ${message.action} -> keys ctrl+${key}` })
      setTimeout(() => say(true), 500)
      return
    }
    post({
      buttonProbe: `${location.pathname} ${message.action} none || ${areaNames()}`.slice(0, 800),
    })
  })

  // ---- The words -------------------------------------------------------------------------
  // The line the song is at, from the page's own lyrics: neither site puts the whole song's words in the page
  // unless its lyrics view is open, so what the page itself asked the site for (hooked below) is what's used.
  // The page's LRC, once it has one: `[{ at, words }]`, by the song's time in seconds.
  const lrc = (text) => {
    const lines = []
    for (const row of String(text).split(/\r?\n/)) {
      const stamps = [...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
      if (stamps.length === 0) continue
      const words = row.replace(/\[[^\]]*\]/g, '').trim()
      if (!words) continue
      for (const stamp of stamps) {
        const fraction = stamp[3] ? Number(stamp[3].padEnd(3, '0')) / 1000 : 0
        lines.push({
          at: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction,
          words,
        })
      }
    }
    return lines.sort((one, other) => one.at - other.at)
  }

  /** Some sites answer base64 when their caller wasn't asking for text. */
  const decode = (text) => {
    if (!text.includes('[') && /^[A-Za-z0-9+/=\s]+$/.test(text.slice(0, 400))) {
      try {
        const bytes = Uint8Array.from(atob(text.replace(/\s+/g, '')), (character) => character.charCodeAt(0))
        const words = new TextDecoder().decode(bytes)
        if (words.includes('[')) return words
      } catch {}
    }
    return text
  }

  /** The LRC in a lyrics response, whatever shape the site wrapped it in: the longest such string in it. */
  const readLrc = (body) => {
    let found = null
    const walk = (value, depth) => {
      if (value === null || value === undefined || depth > 8) return
      if (typeof value === 'string') {
        if (/\[\d{1,2}:\d{2}/.test(value) && (found === null || value.length > found.length)) found = value
        return
      }
      if (typeof value !== 'object') return
      for (const each of Array.isArray(value) ? value : Object.values(value)) walk(each, depth + 1)
    }
    try {
      walk(JSON.parse(body), 0)
    } catch {
      if (/\[\d{1,2}:\d{2}/.test(String(body))) found = String(body)
    }
    if (found === null) return null
    const lines = lrc(decode(found))
    return lines.length > 0 ? lines : null
  }

  let lyrics = []
  // The words sent to the cabin's own lyrics view (whole, once a song's are known), and when the song's
  // place was last sent (the view follows it).
  let lyricSent = null
  let lyricAtSent = 0
  /** Takes a song's words, and says so in the log (which site's answer they came from, and how many lines). */
  const setWords = (lines, from) => {
    lyrics = lines
    post({ lyricProbe: `${from}: ${lines.length} lines, at ${Math.round(lines[0]?.at ?? -1)}s` })
    say(true)
  }
  const tookLyrics = (body) => {
    const lines = readLrc(typeof body === 'string' ? body : '')
    if (lines === null) return
    setWords(lines, 'lyrics answer')
  }


  // The page's own requests, watched as they go out: its lyrics (the page fetches them itself when a song
  // starts), and — on QQ Music, which says nothing the system's way — its own word on the song it plays.
  const looksLikeLyrics = (url) => /lyric|lrc/i.test(String(url ?? ''))
  const looksLikeSong = (url) =>
    /musicu\.fcg|songinfo|song_info|getsonginfo|songdetail|play\/getdata/i.test(String(url ?? ''))

  // QQ Music's own word on the song (its player asks for it when a song starts): kept, since its page's
  // markup is the site's to change, and this isn't.
  let fromApi = null
  let apiProbed = false
  const tookSong = (body) => {
    // Kugou Music answers its player with the song's own LRC among the rest ("lyrics", plain, timestamps and
    // all): words found there are the song's, whoever asked.
    const words = readLrc(String(body))
    if (words !== null) setWords(words, 'song answer')
    let json = null
    try {
      json = JSON.parse(body)
    } catch {
      return
    }
    // The song's own object, wherever the site wrapped it: a name and the singers it's by.
    const find = (value, depth) => {
      if (!value || typeof value !== 'object' || depth > 8) return null
      const name = value.name ?? value.songname
      const singers = value.singer ?? value.singers
      if (typeof name === 'string' && name !== '' && Array.isArray(singers)) return value
      for (const each of Object.values(value)) {
        const found = find(each, depth + 1)
        if (found) return found
      }
      return null
    }
    const track = find(json, 0)
    if (!track) return
    const artist = (track.singer ?? track.singers ?? [])
      .map((one) => one?.name)
      .filter(Boolean)
      .join(' / ')
    const album = track.album ?? {}
    const mid = track.mid ?? track.songmid ?? null
    fromApi = {
      title: String(track.name ?? track.songname),
      artist,
      // QQ Music's covers are made from the album's id.
      artwork: album.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${album.mid}.jpg` : null,
      mid,
      at: Date.now(),
    }
    if (!apiProbed) {
      apiProbed = true
      post({ apiProbe: JSON.stringify(track).slice(0, 500) })
    }
  }

  const asked = window.fetch
  if (typeof asked === 'function') {
    window.fetch = function (...args) {
      const answer = asked.apply(this, args)
      const where = typeof args[0] === 'string' ? args[0] : args[0]?.url
      if (looksLikeLyrics(where)) {
        answer
          .then((response) => response.clone().text())
          .then(tookLyrics)
          .catch(() => {})
      } else if (looksLikeSong(where)) {
        answer
          .then((response) => response.clone().text())
          .then(tookSong)
          .catch(() => {})
      }
      return answer
    }
  }

  const open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (looksLikeLyrics(url)) {
      this.addEventListener('load', () => {
        try {
          tookLyrics(this.responseText)
        } catch {}
      })
    } else if (looksLikeSong(url)) {
      this.addEventListener('load', () => {
        try {
          tookSong(this.responseText)
        } catch {}
      })
    }
    return open.call(this, method, url, ...rest)
  }

  /** The line of those words the song is at, `at` seconds in. */
  const line = (at) => {
    if (lyrics.length === 0) return null
    let found = null
    for (const each of lyrics) {
      if (each.at > at) break
      found = each
    }
    return found?.words ?? null
  }

  /** A page showing its own lyrics (its lyrics view open) has the line it's at marked: what it marks. */
  const marked = () => {
    const shown = document.querySelector(
      '[class*="lyric" i] [class*="active" i], [class*="lyric" i] [class*="current" i], [class*="lrc" i] [class*="active" i]',
    )
    const words = shown?.textContent?.trim()
    return words && words.length <= 80 ? words : null
  }

  // ---- The wheel -----------------------------------------------------------------------------
  // The page is handed the wheel (WebView2 passes it on) and told of it (the host's `webAppWheel`), and it keeps
  // what it does with it: a page that scrolls with a notch scrolls, and this adds nothing to it. §64 taught this
  // by the owner's own hand: one notch moved the page twice, which he felt as a lurch.
  // Bilibili then taught the rest (§70: "改成无极的"): the browser scrolls its page a fixed 120 px a notch, and
  // those steps show. On that site the notch is taken here instead, the browser's own scroll is told to stand
  // down, and the page glides to where the wheel asked it to be over the next frames — one motion, no steps.
  // Everywhere else the page scrolls itself, and this only steps in where a whole turn moved nothing at all.
  let wheelAt = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  /** Whether this page's wheel is turned here, smoothly, instead of by the browser a step at a time. */
  const GLIDES = location.hostname.endsWith('bilibili.com')
  /** When the page's own wheel was last handed to it here: the host's word for that very notch follows it. */
  let pageWheelAt = 0
  /** How lately that must have been for the host's word to be the same notch, and not one of its own. */
  const SAME_NOTCH_MS = 400
  /** When this last scrolled anything by itself (`pageScrolledAt` isn't the page's then: it's ours). */
  let wheelScrolledAt = 0
  /** When the page last scrolled anything of its own (any element, any means). */
  let pageScrolledAt = 0
  /** How lately the page must have scrolled for a turn to be the page's own, and not ours to add to. */
  const PAGE_OWN_MS = 250
  /** How much of what is left to glide is taken in a frame: a little under a third is a smooth ~120 ms. */
  const GLIDE = 0.3
  /** How far a notch turns a gliding page, as a share of what the browser would: a notch of 60 px, not 120 (§72). */
  const NOTCH = 0.5
  /** Said once: this page's wheel is turned here, or a page took no wheel at all — the log says which. */
  let saidTurn = false
  /** The box being glided, where the wheel has asked it to be, and the frame that takes it there. */
  let glideBox = null
  let glideTarget = 0
  let glideFrame = 0
  /** The wheel turned by hand and not applied yet, and the frame that applies it (a page that doesn't glide). */
  let wheelWanted = 0
  let wheelFrame = 0
  document.addEventListener(
    'mousemove',
    (event) => {
      wheelAt = { x: event.clientX, y: event.clientY }
    },
    { capture: true, passive: true },
  )
  // Scrolling, from anywhere: the page's own wheel before this hears of it, its scripts, its animations. A page
  // that scrolls keeps its wheel, whichever box it scrolls.
  document.addEventListener(
    'scroll',
    () => {
      // Our own scrolling isn't the page's: a scroll event follows the box being moved by a frame or so.
      if (Date.now() - wheelScrolledAt > 50) pageScrolledAt = Date.now()
    },
    { capture: true, passive: true },
  )
  /** What the wheel is over that can still go that way (`dy` positive is up), the page itself last. */
  const scrollerFor = (x, y, dy) => {
    for (let one = document.elementFromPoint(x, y); one !== null; one = one.parentElement) {
      if (one.scrollHeight <= one.clientHeight + 1) continue
      if (!/auto|scroll|overlay/.test(getComputedStyle(one).overflowY)) continue
      const most = one.scrollHeight - one.clientHeight
      // One that can't go that way any further: the page beyond it takes the rest of the notch.
      if (dy < 0 ? one.scrollTop < most : one.scrollTop > 0) return one
      break
    }
    return document.scrollingElement ?? document.documentElement
  }
  /** Where the box may be glided to: inside what it has to show. */
  const glideLimit = (box) => Math.max(box.scrollHeight - box.clientHeight, 0)
  const glideStep = () => {
    glideFrame = 0
    if (glideBox === null) return
    const left = glideTarget - glideBox.scrollTop
    wheelScrolledAt = Date.now()
    if (Math.abs(left) < 0.5) {
      glideBox.scrollTop = glideTarget
      glideBox = null
      return
    }
    glideBox.scrollTop += left * GLIDE
    glideFrame = requestAnimationFrame(glideStep)
  }
  /** Turn the box by `dy` (positive is up) over the frames to come, and say so once. */
  const glideBy = (box, dy) => {
    if (glideBox !== box) {
      glideBox = box
      glideTarget = box.scrollTop
    }
    glideTarget = Math.max(0, Math.min(glideLimit(box), glideTarget - dy))
    if (glideFrame === 0) glideFrame = requestAnimationFrame(glideStep)
    if (!saidTurn) {
      saidTurn = true
      post({ stateProbe: `the wheel turns this page smoothly here, a notch at a time (${location.pathname})` })
    }
  }
  // The page's own wheel, taken over on a gliding site: said to the browser to stand down, and glided instead.
  document.addEventListener(
    'wheel',
    (event) => {
      if (!GLIDES) return
      // Whatever this notch is for, the page had it: the host's word for it must not add to it (a control's own
      // wheel — a video's volume, a slider — is that control's, and the page's own zoom is not a scroll).
      pageWheelAt = Date.now()
      if (event.ctrlKey) return
      const target = event.target
      if (target instanceof Element && target.closest('video, .bpx-player-container, .bilibili-player, [role="slider"]')) {
        return
      }
      const dy = -event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1) * NOTCH
      if (!dy) return
      event.preventDefault()
      glideBy(scrollerFor(event.clientX, event.clientY, dy), dy)
    },
    { capture: true, passive: false },
  )
  /** A page that scrolls itself: this only turns it where a whole turn moved nothing (the host's word). */
  const applyWheel = () => {
    wheelFrame = 0
    const dy = wheelWanted
    wheelWanted = 0
    // The page has scrolled itself a moment ago: the wheel it was handed is its to scroll with, and this turn is
    // not ours to add to. (A page that takes no wheel from WebView2 never says so, and this is its turn.)
    if (Date.now() - pageScrolledAt < PAGE_OWN_MS) return
    const box = scrollerFor(wheelAt.x, wheelAt.y, dy)
    const next = Math.max(0, Math.min(glideLimit(box), box.scrollTop - dy))
    if (next === box.scrollTop) return
    wheelScrolledAt = Date.now()
    box.scrollTop = next
    if (!saidTurn) {
      saidTurn = true
      post({ stateProbe: `the wheel moved nothing here, turning the page by hand (${location.pathname} ${dy})` })
    }
  }
  const turnWithWheel = (dy) => {
    if (!Number.isFinite(dy) || dy === 0) return
    // The page was handed that very notch a moment ago (and glided with it, or left it to a control of its own):
    // the host says the same one again.
    if (Date.now() - pageWheelAt < SAME_NOTCH_MS) return
    if (GLIDES) {
      glideBy(scrollerFor(wheelAt.x, wheelAt.y, dy * NOTCH), dy * NOTCH)
      return
    }
    wheelWanted += dy
    if (wheelFrame === 0) wheelFrame = requestAnimationFrame(applyWheel)
  }

  // ---- QQ Music's own markup ---------------------------------------------------------------
  // Its page says nothing the system's way (no Media Session), and it plays through an element outside this
  // document entirely — but its player page draws everything it plays: the song (`song_info__name`), who it's
  // by, its cover, its words, and where it is in the song (`player_music__time`, "00:39 / 03:43").
  const written = (selector) => document.querySelector(selector)?.textContent?.trim() ?? ''

  /** `mm:ss` (or `h:mm:ss`) in seconds (`null`: not a time). */
  const seconds = (text) => {
    const clean = String(text ?? '').trim()
    if (!clean.includes(':')) return null
    const parts = clean.split(':').map(Number)
    return parts.length > 0 && parts.every(Number.isFinite) ? parts.reduce((sum, one) => sum * 60 + one, 0) : null
  }

  /** The player's word on where it is: `{ at, of }`, or `null` while it says none. */
  const playerClock = () => {
    // QQ Music's own: "00:39 / 03:43".
    const [now, all] = written('.player_music__time').split('/')
    const at = seconds(now)
    if (at !== null) return { at, of: seconds(all) ?? 0 }
    // NetEase's playbar: its times are drawn as text ("00:39", "/", "03:43"). Its sound it plays through an
    // element it keeps out of the page, fed a stream: that element's own clock stands still (the log's
    // `at=0.5`), so the page's own word is the one that moves.
    const bar = document.querySelector('.m-playbar')
    if (!bar) return null
    const played = seconds(drawnTimes(bar)[0])
    return played === null ? null : { at: played, of: seconds(drawnTimes(bar)[1] ?? '') ?? 0 }
  }

  /** The times a player bar draws as text ("00:39", "03:43"): its song's, in order. */
  const drawnTimes = (where) =>
    [...where.querySelectorAll('*')]
      .filter((one) => one.children.length === 0)
      .map((one) =>
        String(one.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((text) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(text))

  const qqMusic = () => {
    const name = written('.song_info__name')
    if (!name) return null
    const title = name.replace(/^歌曲名[：:]\s*/, '')
    if (!title) return null
    const song = [...document.querySelectorAll('a[href*="/songDetail/"]')].at(-1)
    return {
      title,
      artist: written('.song_info__singer').replace(/^歌手[：:]\s*/, ''),
      artwork: document.querySelector('.song_info__pic')?.getAttribute('src') ?? null,
      mid: (song?.getAttribute('href') ?? '').match(/songDetail\/([A-Za-z0-9]+)/)?.[1] ?? null,
    }
  }

  // ---- NetEase Cloud Music's own bars ------------------------------------------------------
  // The old player kept the bar the old site had: the song's name and who it's by in `.words` (the name's own
  // `title` has all of it, however long), its cover in `.head`, and the song's own link (`/song?id=…`) around the
  // name.
  const neteaseOld = () => {
    const bar = document.querySelector('.m-playbar')
    if (!bar) return null
    const name = bar.querySelector('.words .name') ?? bar.querySelector('.words a[href*="/song"]')
    const by = bar.querySelector('.words .by')
    const title = (name?.getAttribute('title') ?? name?.textContent ?? '').trim()
    if (!title) return null
    const head = bar.querySelector('.head img')
    const src = head?.getAttribute('src') || head?.currentSrc || null
    let artwork = null
    if (src) {
      try {
        artwork = new URL(src, location.href).href
      } catch {}
    }
    return { title, artist: (by?.getAttribute('title') ?? by?.textContent ?? '').trim(), artwork, mid: null }
  }

  // The new player (music.163.com/st/webplayer, which the app opens now) has no `.m-playbar` at all: a bar of its
  // own draws the song — `span.title-container` holds `.title` (the name, then "-", then `.author`, whose first
  // link is who it's by), a 40 px `img` is its cover and two drawn times are where it is — beside a
  // `span.cmd-icon` whose `aria-label` says "pause" while it plays and "play" while it doesn't. Its class names
  // carry a hash per build (`DefaultBarWrapper_d1fdcdsp`), so the bar is found by that shape and never by its
  // names: the smallest box around the song's words that also holds a play/pause icon and two times.
  const neteaseBar = () => {
    const shaped = (one) =>
      one.querySelector('span.cmd-icon[aria-label="play"], span.cmd-icon[aria-label="pause"]') !== null &&
      drawnTimes(one).length >= 2
    const words = document.querySelector('.title .author, .author')
    if (words === null) return null
    let bar = words
    while (bar !== null && bar !== document.body && !shaped(bar)) bar = bar.parentElement
    return bar === null || bar === document.body ? null : bar
  }

  const neteaseNew = () => {
    const bar = neteaseBar()
    if (bar === null) return null
    const box = bar.querySelector('.title') ?? bar
    const name = [...box.querySelectorAll('span')].find(
      (one) =>
        one.closest('.author') === null &&
        one.children.length === 0 &&
        (one.textContent ?? '').trim() !== '' &&
        (one.textContent ?? '').trim() !== '-',
    )
    const title = (name?.textContent ?? '').trim()
    if (!title) return null
    const cover = bar.querySelector('img[src*="music.126.net"]') ?? bar.querySelector('img')
    const src = cover?.getAttribute('src') || cover?.currentSrc || null
    let artwork = null
    if (src) {
      // Its own thumbnail is 40 px: the same picture, big enough for the card.
      try {
        artwork = new URL(src.replace(/([?&]thumbnail=)\d+y\d+/, '$1300y300'), location.href).href
      } catch {}
    }
    // Its bar draws its own name's length too ("8:48", the album): the song's two times are the last two, which
    // the bar's shape (`neteaseBar`) has already drawn.
    const icon = bar.querySelector('span.cmd-icon[aria-label="pause"], span.cmd-icon[aria-label="play"]')
    const iconSays = icon?.getAttribute('aria-label') ?? ''
    return {
      title,
      artist: (bar.querySelector('.author a')?.textContent ?? '').trim(),
      artwork,
      mid: null,
      playing: /pause/i.test(iconSays) ? true : /play/i.test(iconSays) ? false : null,
    }
  }

  // Read where its Media Session says nothing (a page not signed in, and the moment before a song starts).
  const netease = () => {
    if (!/(^|\.)music\.163\.com$/.test(location.hostname)) return null
    const own = neteaseOld() ?? neteaseNew()
    if (own !== null) return own
    // Neither bar says anything: the page's own title is what plays ("song - artist - 网易云音乐" while it does,
    // the site's name alone when it doesn't), so the card has something to say from the first moment (owner
    // 2026-11-02: no card at all on the new page).
    const said = document.title.replace(/\s*[-|]\s*网易云音乐.*$/, '').trim()
    const [first, ...rest] = said.split(/\s+-\s+/)
    if (!first || first === '网易云音乐') return null
    return { title: first.trim(), artist: rest.join(' - ').trim(), artwork: null, mid: null }
  }

  // NetEase's own 上一首/下一首, pressed in its bar where its media-key actions aren't there to call: the new
  // player draws them as icon-font words, named by their aria labels whatever its compiled classes are ("return"
  // and "next3" in this release). §62.
  const neteaseSkip = (action) => {
    const bar = neteaseBar()
    if (bar === null) return null
    const wanted = action === 'previous' ? /^(prev|previous|return|last|back)/i : /^(next|skip|forward)/i
    const icon = [...bar.querySelectorAll('span.cmd-icon[aria-label]')].find((one) =>
      wanted.test(one.getAttribute('aria-label') ?? ''),
    )
    if (icon === undefined) return null
    // The button it sits in takes the press (the icon itself is the word it's drawn as).
    ;(icon.closest('button') ?? icon).click()
    return icon.getAttribute('aria-label')
  }

  // ---- Douyin's own page ---------------------------------------------------------------------
  // Its player is the page's own element (`video`), so what plays is read there and whether it plays too. The
  // feed's page says the site's own name in its title and nothing of the clip, while a clip's own page says the
  // clip's words ("… - 抖音"): where the title names nothing, the words the player draws beside the video are
  // read, and the picture the video is showing when the page has no poster (owner 2026-11-03: no cover and no
  // title on the cabin's Home).
  /** A picture of the video's own frame, drawn once for each clip (a cover for a page that names none). */
  const frameCovers = new Map()
  const frameCover = (video) => {
    if (!video || !video.videoWidth) return null
    const key = video.currentSrc || video.src || ''
    if (frameCovers.has(key)) return frameCovers.get(key)
    let picture = null
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 320 / Math.max(1, video.videoWidth))
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
      picture = canvas.toDataURL('image/jpeg', 0.72)
    } catch {}
    // A page making a new element for every clip would keep every frame: the last few are enough.
    if (frameCovers.size > 8) frameCovers.clear()
    frameCovers.set(key, picture)
    return picture
  }
  const douyin = () => {
    if (!/(^|\.)douyin\.com$/.test(location.hostname)) return null
    const video =
      [...document.querySelectorAll('video')].find((one) => !one.paused) ??
      [...document.querySelectorAll('video')].find((one) => one.readyState > 0) ??
      document.querySelector('video')
    const said = document.title.replace(/\s*[-–]\s*抖音.*$/, '').trim()
    // The site's own name in the title (the feed's page, or its home): nothing of the clip is there.
    const named = said !== '' && !/^抖音/.test(said) ? said : ''
    const drawn =
      ['[data-e2e="video-desc"]', '[data-e2e="feed-video-desc"]', '.video-info-detail h1', 'h1']
        .map((selector) => document.querySelector(selector)?.textContent?.trim() ?? '')
        .find((words) => words.length > 0 && words.length <= 120) ?? ''
    const title = named || drawn
    if (title === '' && video === null) return null
    const up =
      ['[data-e2e="video-author"] a', '[data-e2e="video-author"]', 'a[href*="/user/"]']
        .map((selector) => document.querySelector(selector)?.textContent?.trim() ?? '')
        .find((words) => words.length > 0 && words.length <= 24) ?? ''
    const poster =
      video?.getAttribute('poster') ||
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      null
    let artwork = null
    if (poster) {
      try {
        artwork = new URL(poster, location.href).href
      } catch {}
    }
    artwork = artwork ?? frameCover(video)
    return {
      title,
      artist: up,
      artwork,
      mid: null,
      playing: video ? !video.paused && !video.ended : null,
    }
  }

  // ---- Kugou Music's own bar ----------------------------------------------------------------
  // Its page plays through one element (`<audio id="myAudio">`, which the generic paths above start and stop),
  // and draws what it plays across its own bar: the song (`#songName`), who it's by (`.singerName`, with
  // "歌手：" before the names), its cover in `.bar-albumImg`, and whether it plays in `#toggle`'s own class
  // (`icon-playbar-pause` while it does, `icon-playbar-play` while it doesn't). A song's own page says the song
  // and its singers in its title too ("寻诀_铁痕电台…_高音质在线试听_酷狗音乐"), read where the bar is still
  // empty. (owner 2026-11-03: no card, no lyrics, no skip for Kugou)
  const kugou = () => {
    if (!/(^|\.)kugou\.com$/.test(location.hostname)) return null
    const audio = document.querySelector('audio#myAudio, audio.music, audio')
    // A song's own page keeps its record in the page's own script (`dataFromSmarty`: the song's name, its
    // singers, its hash), which says the two apart — its bar writes them in one string ("铁痕电台… - 寻诀").
    const record = Array.isArray(window.dataFromSmarty) ? window.dataFromSmarty[0] : null
    const bar = (document.querySelector('#songName')?.textContent ?? '').trim()
    // Its bar says its own name before anything plays ("酷狗音乐", its placeholder): nothing there yet.
    const told = bar !== '' && bar !== '酷狗音乐' && !bar.startsWith('酷狗音乐') ? bar : ''
    // Its home and its search page say the site's own name in their titles: only a song's own page names the
    // song there.
    const songPage = /^\/(mixsong|song)\//.test(location.pathname)
    const said = document.title.replace(/\s*[-–]\s*酷狗音乐.*$/, '').trim()
    const [first, second] = said.split(/\s*_\s*/)
    const fromTitle = songPage && first && first !== '酷狗音乐' ? first : ''
    const title = (record?.song_name ?? '').trim() || told || fromTitle
    if (title === '') return null
    const singer = (document.querySelector('.singerName')?.textContent ?? '').replace(/^\s*歌手[:：]\s*/, '').trim()
    const artist =
      (record?.author_name ?? '').trim() ||
      singer ||
      (songPage ? (second ?? '').replace(/高音质.*$/, '').trim() : '')
    const cover = document.querySelector('.bar-albumImg img, .albumImg img')
    const src = cover?.getAttribute('src') || cover?.currentSrc || null
    let artwork = null
    if (src) {
      try {
        artwork = new URL(src, location.href).href
      } catch {}
    }
    const toggle = String(document.querySelector('#toggle')?.className ?? '')
    return {
      title,
      artist,
      artwork,
      mid: null,
      playing: audio ? !audio.paused && !audio.ended : /playbar-pause/.test(toggle),
    }
  }

  // The words its song page has for the song, where its player has drawn them: each line a <p> in its lyrics
  // panel, and when each is sung in the player's own list (`wordArr`, in milliseconds: the panel's lines start at
  // its second entry). Nothing where it hasn't drawn them, or where the two don't line up.
  // Its words, read once for each song: the page hands them over whole, and reading them again on every pass
  // would send a song's whole lines to the cabin three times a second.
  let kugouKept = { key: null, lines: null }
  const kugouWords = () => {
    if (!/(^|\.)kugou\.com$/.test(location.hostname)) return null
    const key = [
      document.querySelector('#songName')?.textContent ?? '',
      window.dataFromSmarty?.[0]?.song_name ?? '',
      document.querySelector('audio#myAudio')?.getAttribute('src') ?? '',
    ].join('|')
    if (kugouKept.key === key) return kugouKept.lines
    const found = kugouRead()
    // Only words that were there are kept: the page fills its own in a moment after a song starts, so a pass
    // that found none is asked again (the song's key is the cache's own).
    if (found !== null) {
      kugouKept = { key, lines: found }
      setWords(found, 'kugou')
    }
    return found
  }
  const kugouRead = () => {
    if (!/(^|\.)kugou\.com$/.test(location.hostname)) return null
    // Its player keeps the whole LRC it was handed (`play.globalParam.word`), timestamps and all: the panel it
    // draws is made from that text, and the panel's own `<p>`s have their times thrown away. That text is the
    // one thing to read, when it's there.
    const whole = window.play?.globalParam?.word
    const fromPlayer = typeof whole === 'string' ? readLrc(whole) : null
    if (fromPlayer !== null) return fromPlayer
    const items = [...document.querySelectorAll('.songWordContent p')]
    const times = window.play?.globalParam?.wordArr
    if (items.length < 2 || !Array.isArray(times) || times.length < items.length + 1) return null
    const lines = items.map((one, at) => ({
      at: Number(times[at + 1]) / 1000,
      words: (one.textContent ?? '').trim(),
    }))
    const ascending = lines.every((one, at) => at === 0 || one.at >= lines[at - 1].at)
    return ascending && lines.filter((one) => one.words !== '').length > 1 ? lines : null
  }

  // ---- Bilibili's own video page ------------------------------------------------------------
  // Bilibili's player sets no Media Session here, and its page is a router: going to another video changes the
  // address, the title and the player's element without loading a document. So what plays is read from what the
  // page draws, afresh on every pass: the video's element, the page's own title (the player's, else the tab's)
  // and the uploader's name.
  const bilibili = () => {
    if (!/(^|\.)bilibili\.com$/.test(location.hostname)) return null
    const video =
      [...document.querySelectorAll('video')].find((one) => one.readyState > 0) ?? document.querySelector('video')
    // No video of its own and not a video's page (its home, a search): nothing plays, so nothing is said.
    if (video === null && !/\/(video|bangumi)\//.test(location.pathname)) return null
    const heading = document.querySelector('.video-title, .video-info-container h1, .video-info-title h1, h1[title]')
    const page = document.title
      .replace(/_哔哩哔哩_bilibili$/, '')
      .replace(/ - 哔哩哔哩$/, '')
      .trim()
    const title = String(heading?.getAttribute('title') ?? heading?.textContent ?? page).trim() || page
    if (!title) return null
    const up =
      document
        .querySelector('.up-name, .up-info-container .up-name, .up-info-container a.username')
        ?.textContent?.trim() ||
      document.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
      ''
    const poster =
      document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      document
        .querySelector('.bpx-player-video-poster')
        ?.getAttribute('style')
        ?.match(/url\("?(.*?)"?\)/)?.[1] ||
      ''
    let artwork = null
    if (poster) {
      try {
        artwork = new URL(poster, location.href).href
      } catch {}
    }
    return {
      title,
      artist: up,
      artwork,
      mid: null,
      // Its video element says it (`say` prefers it over this hint when there is one).
      playing: video ? !video.paused && !video.ended : null,
    }
  }

  // ---- The words, asked for ----------------------------------------------------------------
  // Neither site leaves the whole song's words in the page (NetEase answers them encrypted, QQ Music answers
  // only when its own lyrics view is open). Both have an address that answers them plainly for a song's id:
  // QQ Music in JSONP, NetEase on its own site (so the page's origin is the same and the request is allowed).
  const unescape = (text) =>
    text
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')

  const jsonp = (address, done) => {
    const name = `westplay${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const give = (data) => {
      delete window[name]
      script.remove()
      done(data)
    }
    window[name] = give
    // The site's own address may not be reachable from the page's policy: the log says which way it went.
    script.onerror = () => give(null)
    script.src = address.replace('CALLBACK', name)
    document.head.append(script)
  }

  const learn = (where, words) => {
    const lines = words ? lrc(words) : []
    if (lines.length > 0) lyrics = lines
    const said = lines.length > 0 ? '' : ` of ${JSON.stringify(String(words ?? '').slice(0, 40))}`
    post({ lyricProbe: `${where}: ${lines.length} lines${said}` })
  }

  const qqWords = (mid) => {
    // Asked for as JSON and read as text, not loaded as a script: the site answers its own JSONP with
    // `Content-Type: text/html`, and a browser refuses to run a script of that type — the callback never came and
    // the words were always empty, which is what a player saw as the card's lyrics button missing on the extension's
    // player (owner 2026-11-10). The body is the JSON asked for, read where it arrives.
    const address =
      'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?format=json&g_tk=5381&nobase64=1' +
      `&songmid=${encodeURIComponent(mid)}`
    fetch(address, { credentials: 'include', referrer: 'https://y.qq.com/' })
      .then((response) => response.text())
      .then((body) => {
        let said = null
        try {
          said = JSON.parse(body)
        } catch {
          // Wrapped in a callback anyway: the object between its parentheses.
          const at = body.indexOf('(')
          const close = body.lastIndexOf(')')
          if (at < 0 || close <= at) return learn('qq', '')
          try {
            said = JSON.parse(body.slice(at + 1, close))
          } catch {
            return learn('qq', '')
          }
        }
        learn('qq', unescape(String(said?.lyric ?? '')))
      })
      .catch(() => {
        // The page refused the fetch (`no-cors`, a policy): its own way of asking was never anything but a script,
        // and the site answers one with a page's own type — worth a try where nothing else came of it.
        jsonp(address.replace('format=json', 'format=jsonp&callback=CALLBACK'), (data) =>
          learn('qq', unescape(String(data?.lyric ?? ''))),
        )
      })
  }

  /** The song the page itself is on, where it names it (`music.163.com/#/song?id=…`): its own words are these,
   * not a search's first match (which can be a cover's, or a live version's, timed to another recording). */
  const pageSongId = () => {
    const hash = location.hash.match(/#\/song\?id=(\d+)/)
    if (hash) return hash[1]
    if (/^\/(m\/)?song\/?$/.test(location.pathname)) return new URLSearchParams(location.search).get('id')
    // Its new player's pages name the song in the address too (`/st/…?id=…`, the song's own link).
    const named = new URLSearchParams(location.search).get('id')
    return named !== null && /song/i.test(location.pathname) ? named : null
  }

  const neteaseWords = async (title, artist) => {
    try {
      const known = pageSongId()
      if (known) {
        const said = await fetch(`/api/song/lyric?id=${known}&lv=-1&kv=-1&tv=-1`).then((one) => one.json())
        return learn('netease', String(said?.lrc?.lyric ?? ''))
      }
      const query = [title, artist].filter(Boolean).join(' ')
      for (const address of [
        `/api/search/get/web?s=${encodeURIComponent(query)}&type=1&limit=1`,
        `/api/search/get?s=${encodeURIComponent(query)}&type=1&limit=1`,
      ]) {
        const found = await fetch(address).then((one) => one.json())
        const id = found?.result?.songs?.[0]?.id
        if (!id) continue
        const said = await fetch(`/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1`).then((one) => one.json())
        return learn('netease', String(said?.lrc?.lyric ?? ''))
      }
      learn('netease', '')
    } catch (error) {
      post({ lyricProbe: `netease failed: ${error?.message ?? error}` })
    }
  }

  // A page that plays without saying what: what its own markup has, once, for the log (its classes are the
  // site's to change, so the next shape is read from here rather than guessed).
  let probes = 0
  let probeAt = 0
  const probeDom = () => {
    if (probes >= 3 || Date.now() - probeAt < 10000) return
    probes += 1
    probeAt = Date.now()
    const picked = [...document.querySelectorAll('[class*="song" i], [class*="player" i], [class*="singer" i]')]
      .slice(-24)
      .map(
        (one) =>
          `${one.tagName}.${String(one.className).split(' ')[0]}="${(one.textContent ?? '').trim().slice(0, 24)}"`,
      )
    const inPage = [...document.querySelectorAll('audio, video')].map(
      (one) => `${one.tagName}:${one.paused ? 'paused' : 'playing'}:${Math.round(one.currentTime)}`,
    )
    const links = [...document.querySelectorAll('a[href*="/songDetail/"]')]
    const song = links.at(-1)
    const playing = [...heard]
      .map((one) => `${one.paused ? 'paused' : 'playing'}:${Math.round(one.currentTime)}`)
      .join(',')
    const said =
      `#${probes} ${location.pathname} heard ${heard.size} (${playing}) page ${inPage.length} ${inPage.join(' ')}` +
      ` || songDetail ${links.length}="${(song?.textContent ?? '').trim().slice(0, 30)}"@${(song?.getAttribute('href') ?? '').slice(0, 40)}` +
      ` || ${picked.join(' | ')}`
    post({ domProbe: said.slice(0, 900) })
  }

  let said = 'null'
  // A document loaded anew has said nothing yet, and a page with nothing to play has to say so — once, having had
  // its moment to find its player. Without that word the cabin keeps the last document's song, drawn as playing,
  // though the sound went with the page: QQ Music's home page (a whole new document, its player page's song still
  // on the card, the card's own button then doing nothing) was that (owner 2026-11-02).
  const SILENT_MS = 2000
  // A page that still looks like a player getting itself ready (its own bar drawn, the song a moment away) gets
  // longer: saying "nothing" there would clear the card for a second only to draw the same song again, and the
  // owner asked for the music to go on like the cabin's own players do (2026-11-02).
  const SETTLE_MS = 8000
  const startedAt = Date.now()
  let toldNothing = false
  // What this page's own tab played last, in `sessionStorage`: it survives the site throwing the document away (QQ
  // Music's home page is a new document with nothing in it to play, while the song it left behind is still in the
  // site's own storage), and it goes with the tab — an app opened again starts on its own word, not on this one.
  // Set by every report of what plays, so a pause the owner pressed (on the card or in the page) is the last word
  // (`§62`).
  const PLAYED_KEY = 'westplay.played'
  const BACK_KEY = 'westplay.back'
  let playedBefore = false
  try {
    playedBefore = sessionStorage.getItem(PLAYED_KEY) === '1'
  } catch {}
  const markPlayed = (playing) => {
    if (typeof playing !== 'boolean') return
    try {
      sessionStorage.setItem(PLAYED_KEY, playing ? '1' : '0')
    } catch {}
  }
  // The site's own way back to what it played: QQ Music's home page carries a link to its player page (its
  // `btn_bottom_player`, the one it draws as "播放器"), and that page picks the same song up from the site's own
  // storage, near where it was. Clicked once per document, and not again for a while (a site that doesn't take it
  // must not be clicked at forever): `§62`.
  const backToPlaying = () => {
    if (!playedBefore) return false
    let last = 0
    try {
      last = Number(sessionStorage.getItem(BACK_KEY) || 0)
    } catch {}
    if (Date.now() - last < 15000) return false
    const link = document.querySelector('a.btn_bottom_player, .btn_bottom_player')
    if (link === null) return false
    try {
      sessionStorage.setItem(BACK_KEY, String(Date.now()))
    } catch {}
    post({ pressProbe: `${location.pathname} nothing to play, and it played before -> back to its player (${link.tagName})` })
    link.click()
    return true
  }
  // A page that is a player still building itself: its bar, its clock or an element of its own is there, nothing
  // plays of it yet. (Its own "播放器" link is not that — that is how a page with nothing to play offers the way
  // back, below.)
  const warming = () => document.querySelector('.player_music__time, .m-playbar, audio, video') !== null
  // The page this one came from sent itself back here to play (`backToPlaying`): its player takes a moment to pick
  // the song up, and that moment must not be drawn as "nothing" on the card.
  const cameBack = () => {
    try {
      return Date.now() - Number(sessionStorage.getItem(BACK_KEY) || 0) < 20000
    } catch {
      return false
    }
  }
  // Bilibili's page, said to the log the first few times what it plays changes: its markup's next shape is read
  // from there rather than guessed, as QQ Music's is (`domProbe`). Five lines at most, ever.
  let biliSaid = ''
  let biliProbes = 0
  let wordsFor = null
  // QQ Music plays outside this document, so its own drawn clock says whether it plays: a new second, it plays.
  // (Whichever clock last moved is read where the page's clock decides: `drawnClock`/`elementClock`, not the
  // interpolated `at`, which moves every pass whether the song does or not.)
  // What the cabin's own press of play/pause did: a site's button says what it did seconds late (QQ Music's
  // does: owner 2026-11-01, the icon the wrong way round and the electrics' pause not played back), and the
  // page's own `playing` would say the opposite of what is heard until it catches up.
  let intent = null
  // How long the cabin's own press decides what a page plays: a site's button can take seconds to say what it
  // did, and a page that never says anything would keep the press's word long after the player changed it
  // themselves (owner 2026-11-02: QQ Music stopped, the card went on saying it played).
  const INTENT_MS = 6000
  let intentAt = 0
  // Where nothing of the page can say what it plays (no clock drawn, no element of its own, nothing for
  // Windows' media control, no named button) the card's state rests on WestPlay's own press: what each of them
  // says goes to the log, a few times, so the next report names the one that lied.
  let stateProbes = 0
  let stateProbeAt = 0
  const probeState = (answer) => {
    if (stateProbes >= 6 || Date.now() - stateProbeAt < 8000) return
    stateProbes += 1
    stateProbeAt = Date.now()
    const play = button('playPause')
    const own = [...new Set([...heard, ...elements()])]
    post({
      stateProbe: `${location.pathname} clock=${lastAt > 0 ? lastAt : 'none'} element=${own.length} session=${
        navigator.mediaSession?.playbackState ?? 'none'
      } button=${play === null ? 'none' : label(play)} intent=${intent} -> ${answer}`.slice(0, 500),
    })
  }
  // What QQ Music's home page player bar has, for the log (its markup is its own, read rather than guessed: a
  // song playing through an element while the page says nothing of it, owner 2026-11-02).
  let barProbes = 0
  const probePlayerBar = () => {
    if (barProbes >= 3) return
    barProbes += 1
    const parts = [...document.querySelectorAll('[class*=player], [class*=bottom]')]
      .flatMap((one) => [one, ...one.querySelectorAll('[class*=btn], [class*=pause], [class*=play], [class*=progress], [class*=time], [class*=song]')])
      .slice(0, 26)
      .map((one) => `${one.tagName}.${String(one.className).trim().replace(/\s+/g, '.')}="${(one.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14)}"`)
    post({ domProbe: `qq home ${location.pathname}: ${parts.join(' | ')}`.slice(0, 900) })
  }
  let lastAt = null
  // Which elements have had the cabin's volume put back on them, and the volume last reported.
  const restored = new WeakSet()
  let lastVolume = -1
  let volumePut = 0
  let volumeSent = 0
  // The page's two clocks: its sound element's own, and the one its player draws. Whichever moved last is
  // where the song is (NetEase plays a stream through an element kept out of the page, whose clock stands
  // still; QQ Music's player is outside the page and draws its own).
  let elementClock = { at: -1, moved: 0 }
  let drawnClock = { at: -1, moved: 0 }
  // The drawn clock's last mark, and when it was drawn: between marks, where the song is (never more than
  // the second past it).
  let drawnMarkAt = -1
  let drawnMarkWall = 0
  // The line last said in the log (a change of words is what's read there).
  /** Whether it plays, as the page's own clock says where it draws one (a clock moves only while the song
   * does), else as Windows' own media control says (a page that names its state for the system), else as the
   * cabin's own press left it, else as the page's play button says. */
  const playingOwn = () => {
    const play = button('playPause')
    const said = play === null ? '' : label(play)
    const told = /暂停|pause/i.test(said) ? true : /播放|play/i.test(said) ? false : null
    // A clock that moved (a new second drawn, or a new position on the element) within this long says it plays.
    const moved = Date.now() - Math.max(drawnClock.moved, elementClock.moved) < 1800
    // A page that draws its own clock is the one thing it can't say wrong: the song plays exactly while that
    // clock runs. QQ Music's button says what it did seconds late and can go on saying "暂停" long after the
    // pause the electrics made (owner, 2026-11-02: the song never came back with them), so where a clock is
    // drawn it is what's read.
    if (lastAt !== null && lastAt > 0) return moved
    // The page's own sound, where it has an element: it plays or it doesn't, and no word of a site's or of
    // WestPlay's own outranks it.
    const own = [...new Set([...heard, ...elements()])].filter(sounding)
    if (own.length > 0) return own.some((one) => !one.paused)
    // What the page tells Windows' media control (QQ Music's home page names nothing in its own markup, but its
    // state for the system is there): a word better than any button's.
    const state = navigator.mediaSession?.playbackState
    const toldState = state === 'playing' ? true : state === 'paused' ? false : null
    // The press's own answer stands until the page's own button agrees with it (a page with no clock and a
    // button that says what it did seconds late has nothing else), and only for a few seconds: a page that says
    // nothing of itself has no word to correct it with, and its card would then go on saying what was pressed
    // long after the player stopped the song themselves.
    if (intent !== null) {
      if (told !== null && told === intent) intent = null
      else if (Date.now() - intentAt > INTENT_MS) intent = null
      else return intent
    }
    if (toldState !== null) return toldState
    if (told !== null) return told
    return moved
  }
  /**
   * The song a playlist extension's own player plays, read from its page (`ID`s of its markup, `player.html`):
   * that page sets no Media Session, so nothing else here could say what it plays, and the cabin's card stayed
   * on 未播放 while the music was in that tab (owner 2026-11-10). `null` on any other page, and on that one
   * while it plays nothing.
   */
  const extensionSong = () => {
    if (siteDocument) return null
    const name = document.getElementById('np-name')?.textContent?.trim()
    if (!name || name === '未在播放') return null
    const singer = document.getElementById('np-singer')?.textContent?.trim() || ''
    const cover = document.getElementById('np-cover')
    const src = cover && !cover.hidden ? cover.getAttribute('src') || cover.currentSrc : null
    let artwork = null
    if (src) {
      try {
        artwork = new URL(src, location.href).href
      } catch {}
    }
    return { title: name, artist: singer, artwork, mid: null, playing: true, lyric: null }
  }

  /**
   * Presses a playlist extension player's own transport for `action` (`data-*`-less buttons by id, `player.html`):
   * play/pause, the two skips. Its page keeps its own state and redraws its own bar, so a click is all it takes —
   * the same press a player's own finger makes there.
   */
  const pressExtension = (action) => {
    if (siteDocument) return
    const id = action === 'playPause' ? 'play' : action === 'next' ? 'next' : action === 'previous' ? 'prev' : null
    if (id === null) return
    const button = document.getElementById(id)
    if (button === null) return
    button.click()
  }

  const say = (again = false) => {
    // PROBE: whether the pass runs at all, and what it works out (the cabin's card showed nothing).
    try {
      if (!window.__westplaySayProbe_at || Date.now() - window.__westplaySayProbe_at > 5000) {
        window.__westplaySayProbe_at = Date.now()
        const bili = typeof bilibili === 'function' ? bilibili() : null
        post({
          sayProbe: `${location.host} say ran bili=${bili === null ? 'null' : 'yes'} title=${bili?.title?.slice(0, 40) ?? ''}`,
        })
      }
    } catch (problem) {
      try { post({ sayProbe: `say threw: ${problem?.message ?? problem}` }) } catch {}
    }

    const metadata = navigator.mediaSession?.metadata
    const drawn = playerClock()
    // NetEase starts the next song on an element of its own while the last one keeps playing (silently): more
    // than one element says it plays, and the first of them was the last song's. The page's own bar says which
    // song it is now, so the element whose clock is the bar's is the one to read.
    const playing = [...new Set([...heard, ...elements()])].filter((one) => sounding(one) && !one.paused)
    const song =
      playing.length > 1 && drawn !== null
        ? playing.reduce((best, one) =>
            Math.abs(one.currentTime - drawn.at) < Math.abs(best.currentTime - drawn.at) ? one : best,
          )
        : player()
    // An element new to this page (another song's, or the page's own after a reload) starts at full volume: what
    // the cabin last set goes back on it, so a site's page never comes back loud. Not where the player's own
    // volume is kept (Bilibili's): there the element's own is the player's.
    // The cab's quiet while it holds one: put back each pass (a page's player redraws its own volume away).
    if (ducked !== null) {
    // Guarded: a media element that refuses a volume (a page's own, readonly) mustn't stop the rest of
    // this pass — the song's word among it (owner 2026-11-13: no site's card showed anything).
    try {
            for (const one of playing.length > 0 ? playing : sounds()) {
              one.volume = ducked.level
              one.muted = ducked.level === 0
            }
    } catch {}
    }
    for (const one of ownVolume ? [] : playing.length > 0 ? playing : sounds()) {
      const kept = recallVolume()
      if (kept === null) continue
      const first = !restored.has(one)
      if (first) restored.add(one)
      // A site's player sets its new element to full volume, and QQ Music does it again for every song: the
      // volume the cabin set is put back whenever it's been changed away from it (once a second at most, so the
      // page's own drag still reads as a whole).
      const away = Math.abs(one.volume - kept) > 0.03 || (one.muted && kept > 0)
      if (away && (first || Date.now() - volumePut > 1000)) {
        volumePut = Date.now()
        one.volume = kept
        one.muted = kept === 0
      }
    }
    // Bilibili's page is the truth there: its player sets no Media Session, and its router changes the video
    // without a document of its own, so the page's own title and element are read every pass.
    const bili = bilibili()
    let media = null
    const elementAt = song === null ? null : song.currentTime
    if (elementAt !== null && elementAt !== elementClock.at) {
      elementClock = { at: elementAt, moved: Date.now() }
    }
    if (drawn !== null && drawn.at !== drawnClock.at) {
      drawnClock = { at: drawn.at, moved: Date.now() }
      drawnMarkAt = drawn.at
      drawnMarkWall = Date.now()
    }
    const drawnAt = drawnMarkAt < 0 ? null : drawnMarkAt + Math.min(1, Math.max(0, (Date.now() - drawnMarkWall) / 1000))
    // Where the sound is. A page that plays a stream through its element hands its sound to the browser
    // buffered (NetEase does): that element's clock runs about a second ahead of the speakers, while its own
    // drawn bar is about a second behind them (both measured, both by ear). So the element's clock, less that
    // lead, and the bar only where the element's has stopped.
    const STREAM_LEAD = 0.5
    const sounded = elementAt === null ? null : Math.max(0, elementAt - (song?.srcObject ? STREAM_LEAD : 0))
    // An element that isn't the song playing any more (the last one's, left going) reads far from the bar: the
    // bar's own word is used then, and it starts at 0 with the new song.
    const consistent = drawn === null || (sounded !== null && Math.abs(sounded - drawn.at) <= 3)
    const elementLive = sounded !== null && consistent && Date.now() - elementClock.moved < 1500
    const at = elementLive ? sounded : (drawnAt ?? sounded ?? 0)
    if (at !== lastAt) lastAt = at
    // A playlist extension's own player (`extensionSong`): its page has no Media Session and none of the sites'
    // markup, so it is read before any of those, and only where it has a song to name.
    const fromExtension = extensionSong()
    if (fromExtension !== null) {
      media = { ...fromExtension, playing: song ? !song.paused && !song.ended : true }
    } else if (bili === null && metadata && (metadata.title || metadata.artist)) {
      media = {
        title: String(metadata.title ?? ''),
        artist: String(metadata.artist ?? ''),
        artwork: cover(metadata.artwork),
        playing: song ? !song.paused && !song.ended : playingOwn(),
        mid: null,
      }
    } else {
      // A page that says nothing that way (QQ Music's, 蜻蜓FM's): its player's own word on the song, or failing
      // that the page it draws, and the clock it draws for whether it plays.
      // Kugou Music's page plays through the Media Session and a single <audio>, which the generic paths here read.
      const own =
        bili ??
        qqMusic() ??
            kugou() ??
        douyin() ??
        netease() ??
        (fromApi !== null && Date.now() - fromApi.at < 120000 ? fromApi : null)
      if (own !== null) {
        const { at: _at, of: _of, playing: told, ...music } = own
        const plays = song ? !song.paused && !song.ended : (told ?? playingOwn())
        media = { ...music, playing: plays }
      }
    }
    // A song playing through the page's own element while the page says nothing of it (QQ Music's home page: its
    // bar is markup of its own, none of it known): nothing goes to the cabin from here, so what the bar has goes
    // to the log, a few times (read, not guessed at).
    // Nothing of the page says what it plays, and yet something is said (the card's state rests on the press).
    if (
      media !== null &&
      !(lastAt > 0) &&
      [...new Set([...heard, ...elements()])].length === 0 &&
      (navigator.mediaSession?.playbackState ?? 'none') === 'none'
    ) {
      probeState(media.playing)
    }
    if (
      media === null &&
      song !== null &&
      !song.paused &&
      !song.ended &&
      /(^|\.)y\.qq\.com$/.test(location.hostname) &&
      !/\/n\/ryqq_v2\/player/.test(location.pathname)
    ) {
      probePlayerBar()
    }
    // The volume the cabin's slider shows: the song's own element's (a muted one reads as nought).
    if (song) {
      const level = song.muted ? 0 : Math.round(song.volume * 100) / 100
      if (level !== lastVolume) {
        lastVolume = level
        post({ volume: level })
      }
    }
    // The frames told again now and then: one loaded after the slider moved gets it too (never on a page whose
    // own player keeps its volume: Bilibili's frames are its own player's too).
    const keptVolume = ownVolume ? null : recallVolume()
    if (keptVolume !== null && Date.now() - volumeSent > 4000) {
      volumeSent = Date.now()
      broadcastVolume(keptVolume)
    }
    if (media) {
      const key = `${media.title}|${media.artist}|${media.mid ?? ''}`
      if (key !== wordsFor) {
        wordsFor = key
        lyrics = []
        // Only the site whose own words these are asks for them: a video or a radio program shares its title
        // with songs that aren't it, and asking NetEase for those found someone else's words (the log's
        // "netease failed" lines, one for every Bilibili video).
        if (media.mid) qqWords(media.mid)
        else if (/(^|\.)music\.163\.com$/.test(location.hostname)) neteaseWords(media.title, media.artist)
      }
      // Kugou Music's words are the page's own, filled in a moment after the song changes (its player is handed
      // them whole): read on every pass, not only as the song changes — the reader keeps what it found for the
      // song it belongs to, and nothing at all where the page has none yet.
      if (!media.mid && /(^|\.)kugou\.com$/.test(location.hostname)) {
        const words = kugouWords()
        if (words !== null) lyrics = words
        else if (lyrics.length > 0) lyrics = []
      }
      media.lyric = line(at) ?? marked()
      if (lyricSent !== lyrics) {
        lyricSent = lyrics
        post({
          lyricLines: lyrics.map((each) => ({
            at: Math.round(each.at * 100) / 100,
            words: each.words,
          })),
        })
      }
      if (lyrics.length > 0 && Date.now() - lyricAtSent > 500) {
        lyricAtSent = Date.now()
        post({ lyricAt: Math.max(0, Number(at) || 0) })
      }
    }
    // What this page's tab played last, for the page that comes after it: a site that throws this document away
    // and comes back with nothing to play is sent back to its own player (`backToPlaying`).
    if (media) markPlayed(media.playing)
    // A page with nothing to play says so, once it has had its moment to find its player: until then the cabin
    // goes on drawing the page it came from (that document's last word is the last word said), which is how QQ
    // Music's home page showed its player page's song as playing, its card's button doing nothing at all (§59).
    // It gets longer where the song is a moment away: this page came back to play (§62), or the player is still
    // building itself.
    const silent = cameBack() || warming() ? SETTLE_MS : SILENT_MS
    if (media === null && !toldNothing && Date.now() - startedAt >= silent) {
      toldNothing = true
      // The site's way back to what it played: taken instead of saying "nothing", and the card keeps the song.
      if (!backToPlaying()) {
        said = 'null'
        post({ media: null })
      }
    }
    const now = JSON.stringify(media)
    if (!again && now === said) return
    said = now
    post({ media })
    // Bilibili's own page, for the log: what it said it plays, and what its element is doing (five lines at most).
    if (bili !== null && biliProbes < 5) {
      const changed = `${bili.title}|${bili.artist}`
      if (changed !== biliSaid) {
        biliSaid = changed
        biliProbes += 1
        const video = song === null ? 'none' : `${song.paused ? 'paused' : 'playing'}:${Math.round(song.currentTime)}`
        post({
          biliProbe:
            `#${biliProbes} title=${JSON.stringify(bili.title).slice(0, 60)}` +
            ` up=${JSON.stringify(bili.artist).slice(0, 30)} cover=${bili.artwork ? 'yes' : 'no'} video=${video}`,
        })
      }
    }
  }

  // QQ Music, a page that says nothing of what it plays: its markup goes to the log, a few times over the
  // first minute, so the next shape is read from the page rather than guessed (each site's markup is its own).
  setInterval(() => {
    if (/y\.qq\.com$/.test(location.hostname) && said === 'null') probeDom()
  }, 10000)

  setInterval(() => {
    say()
    cab?.tick()
    const playing = player()
    if (!playing || playing.paused) return
    sayCab(playing)
  }, 350)
  for (const event of ['play', 'pause', 'playing', 'loadedmetadata', 'ended']) {
    document.addEventListener(event, () => say(true), true)
  }

  // The page's own background, where it has none: the browser's is transparent, and the hole the cabin cuts for
  // this page is see-through — the game's own screen showed through Kugou Music's home, which paints its body but
  // leaves the root bare (owner 2026-11-03). The page is given its body's colour (else white) on the root, and
  // again whenever that goes away (a site's own router drawing the page anew).
  const paintBackdrop = () => {
    const root = document.documentElement
    if (!root) return
    if (getComputedStyle(root).backgroundColor !== 'rgba(0, 0, 0, 0)') return
    const body = document.body === null ? null : getComputedStyle(document.body).backgroundColor
    root.style.backgroundColor = body && body !== 'rgba(0, 0, 0, 0)' ? body : '#fff'
  }
  paintBackdrop()
  document.addEventListener('DOMContentLoaded', paintBackdrop)
  setInterval(paintBackdrop, 2000)

  // The room this page has against the width it lays out in, to the host: a page written for a desktop screen is
  // wider than the cabin's, and its pixels go smaller until all of it shows, rather than the page being cut off
  // at the right with nothing in it to drag it across (webapp.rs, `fit_width`). Said again as it changes: the fit
  // settles over a couple of rounds, the page laying itself out anew each time.
  let room = ''
  // The width the page lays out in is more than its scroll width where a site clips its own content (a fixed
  // width shell inside a box that hides the rest): the widest of the boxes it draws, a couple of levels down,
  // says it then. A banner sliding off the side isn't the page's width (its track is far wider than the page
  // it shows), so a box wider than the screen by an implausible share is left out.
  const laidOutWidth = () => {
    const seen = Math.round(window.innerWidth)
    let widest = 0
    let looked = 0
    const walk = [...(document.body?.children ?? [])].map((one) => ({ one, depth: 0 }))
    while (walk.length > 0 && looked < 240) {
      const { one, depth } = walk.shift()
      looked += 1
      const box = one.getBoundingClientRect()
      if (box.width > 0 && box.height > 0 && box.right + window.scrollX <= Math.max(seen, 1) * 4) {
        widest = Math.max(widest, box.right + window.scrollX)
      }
      if (depth < 2) walk.push(...[...one.children].map((child) => ({ one: child, depth: depth + 1 })))
    }
    return widest
  }
  const reportRoom = () => {
    const needed = Math.round(
      Math.max(
        document.documentElement?.scrollWidth ?? 0,
        document.body?.scrollWidth ?? 0,
        document.body?.getBoundingClientRect().width ?? 0,
        laidOutWidth(),
      ),
    )
    const seen = Math.round(window.innerWidth)
    const now = `${seen} ${needed}`
    if (!needed || now === room) return
    room = now
    post({ room: { seen, needed } })
  }
  // Said as the room changes (the view placed where the app cuts the page open) and as the page lays itself out:
  // the fit is then in place before the page is seen, rather than a moment after it appeared.
  window.addEventListener('resize', reportRoom)
  document.addEventListener('DOMContentLoaded', reportRoom)
  window.addEventListener('load', () => {
    reportRoom()
    for (const ms of [200, 600, 1200]) setTimeout(reportRoom, ms)
  })
  setInterval(reportRoom, 2500)
  reportRoom()

  // A video gone full screen in the page (Bilibili's own player): the host gives it the whole area WestPlay draws
  // in, and takes it back when the video leaves (webapp.rs `State::full_screen`, WebAppScreen.tsx).
  let fullScreen = null



  const tellFullScreen = () => {
    const on = !!document.fullscreenElement
    if (on === fullScreen) return
    fullScreen = on
    post({ fullScreen: on })
  }
  document.addEventListener('fullscreenchange', tellFullScreen)
  tellFullScreen()

  // A page that just loaded has no field focused: said, so a field the page before it had focused (and the
  // cabin's keyboard that came up for it) doesn't carry over to this one (owner 2026-11-03).
  report(false, true)
  post({ ready: true })

  // PROBE: what the page's own script fails at (the owner's Bilibili page came up blank: its title, no
  // content). Reported to the host's log, once each.
  if (!window.__westplayErrorProbe) {
    window.__westplayErrorProbe = true
    const told = new Set()
    const tell = (kind, detail) => {
      if (told.has(kind) || told.size > 20) return
      told.add(kind)
      try {
        post({ pageError: `${location.host} ${kind}: ${String(detail).slice(0, 300)}` })
      } catch {}
    }
    window.addEventListener('error', (event) => {
      tell('error', `${event.message} @ ${event.filename || ''}:${event.lineno || 0}`)
    }, true)
    window.addEventListener('unhandledrejection', (event) => {
      tell('rejection', event.reason?.message || event.reason)
    })
    // Whether the document's own scripts ran at all: the page's own ready-made HTML (a blank page
    // whose scripts failed) shows this.
    setTimeout(() => {
      const html = document.body ? document.body.innerText.trim().length : -1
      tell('state', `ready=${document.readyState} bodyText=${html} scripts=${document.scripts.length}`)
    }, 6000)
  }

})()
