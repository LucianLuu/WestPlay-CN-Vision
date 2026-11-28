// WestPlay, in Bilibili's own page (bilibili.com), hidden: the engine behind the cabin page's YouTube app.
//
// The cabin page never sees bilibili.com: it has the app (search, results, its own player controls), built on
// YouTube's shapes so the same page draws both. This page answers what the app asks (search, suggestions, Up
// next, the signed-in player's feed), and plays the videos asked for: Bilibili's own player, told what to play,
// how far in, how loud; it reports how it plays, so the app's controls follow.
//
// Why the page and not the API from the host: Bilibili's own interfaces need the browser's device cookies
// (`buvid3` and its friends), which its page sets as it loads — a request from anywhere else is refused (412).
// Asked from inside the page they carry them, as Bilibili's own scripts' requests do. Nothing of the account
// leaves the page but the answers: WestPlay keeps no credential.
//
// The video's sound comes through `cab_sound.js` (the truck's speakers), as YouTube's does.
;(() => {
  if (window.__westplayBilibili) return
  window.__westplayBilibili = true

  const stringify = JSON.stringify
  /** What the host held back for this page (its player not up yet): carried out as soon as it is. */
  const waiting = []

  // --- Bilibili's interfaces -------------------------------------------------------------------------------

  /**
   * One of Bilibili's JSON interfaces, as its own page calls it.
   *
   * `credentials: include` carries the page's cookies: it's what makes search work at all (without them
   * Bilibili answers 412), and what lets a signed-in player's own feed answer with their subscriptions.
   *
   * Its answers carry what they have under `data` — except PGC's (series' and films' own pages:
   * `/pgc/view/web/season`), which put it under `result`. Both are answered, so a caller needn't know
   * which family of interface it asked (owner 2026-11-26: a series' details came back empty for this).
   */
  const api = async (path, params = {}) => {
    const url = new URL(path, 'https://api.bilibili.com')
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error(path + ': ' + response.status)
    const answer = await response.json()
    if (answer && answer.code !== 0) throw new Error(path + ': ' + answer.code + ' ' + (answer.message || ''))
    return answer.data !== undefined ? answer.data : answer.result
  }

  /**
   * Bilibili's `wbi` signature: its `/wbi/` interfaces (a space's card, its videos, the player's 动态) refuse a
   * request that doesn't carry one, however the page's cookies are. The keys are its own, from the page's nav
   * answer; the signature is its `wts` and the query (sorted, encoded) with `w_rid`, an MD5 of the query and the
   * keys mixed.
   */
  const MIXIN = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]

  /** MD5, as Bilibili's own page signs with it (its `w_rid` is a hex MD5). */
  const md5 = (() => {
    const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
    const table = []
    for (let index = 0; index < 64; index++) table.push(Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) | 0)
    const add = (a, b) => (a + b) | 0
    return (text) => {
      const bytes = []
      for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index)
        if (code < 0x80) bytes.push(code)
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63))
        else if (code >= 0xd800 && code <= 0xdbff) {
          // A pair: its own code point, in four bytes.
          const pair = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(++index) - 0xdc00)
          bytes.push(0xf0 | (pair >> 18), 0x80 | ((pair >> 12) & 63), 0x80 | ((pair >> 6) & 63), 0x80 | (pair & 63))
        } else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
      }
      const bits = bytes.length * 8
      bytes.push(0x80)
      while (bytes.length % 64 !== 56) bytes.push(0)
      for (let index = 0; index < 8; index++) bytes.push(index < 4 ? (bits >>> (8 * index)) & 255 : 0)
      let h0 = 0x67452301
      let h1 = 0xefcdab89 | 0
      let h2 = 0x98badcfe | 0
      let h3 = 0x10325476
      for (let offset = 0; offset < bytes.length; offset += 64) {
        const words = []
        for (let index = 0; index < 16; index++) {
          const at = offset + index * 4
          words.push(bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24))
        }
        let a = h0
        let b = h1
        let c = h2
        let d = h3
        for (let index = 0; index < 64; index++) {
          let f
          let g
          if (index < 16) {
            f = (b & c) | (~b & d)
            g = index
          } else if (index < 32) {
            f = (d & b) | (~d & c)
            g = (5 * index + 1) % 16
          } else if (index < 48) {
            f = b ^ c ^ d
            g = (3 * index + 5) % 16
          } else {
            f = c ^ (b | ~d)
            g = (7 * index) % 16
          }
          const sum = add(add(add(a, f), add(table[index], words[g])), 0)
          const turn = shifts[(index >> 4) * 4 + (index % 4)]
          const rotated = add((sum << turn) | (sum >>> (32 - turn)), 0)
          a = d
          d = c
          c = b
          b = add(b, rotated)
        }
        h0 = add(h0, a)
        h1 = add(h1, b)
        h2 = add(h2, c)
        h3 = add(h3, d)
      }
      const hex = (word) => {
        let out = ''
        for (let index = 0; index < 4; index++) out += ((word >>> (8 * index)) & 255).toString(16).padStart(2, '0')
        return out
      }
      return hex(h0) + hex(h1) + hex(h2) + hex(h3)
    }
  })()

  /** The mixed keys the signature is made with, from the page's own nav answer (kept once got). */
  let mixed = null
  const mixedKeys = async () => {
    if (mixed) return mixed
    const data = await api('/x/web-interface/nav')
    const leaf = (path) => String(path || '').split('/').pop().split('.')[0]
    const raw = leaf(data && data.wbi_img && data.wbi_img.img_url) + leaf(data && data.wbi_img && data.wbi_img.sub_url)
    if (raw.length < 64) throw new Error('wbi: no keys')
    mixed = MIXIN.map((index) => raw[index]).join('').slice(0, 32)
    return mixed
  }

  /** One of Bilibili's `/wbi/` interfaces, signed as its own page signs it. */
  const wbi = async (path, params = {}) => {
    const key = await mixedKeys()
    const all = Object.assign({}, params, { wts: Math.floor(Date.now() / 1000) })
    const query = Object.keys(all)
      .sort()
      .map((name) => {
        const value = String(all[name]).replace(/[!'()*]/g, '')
        return encodeURIComponent(name) + '=' + encodeURIComponent(value)
      })
      .join('&')
    return api(path + '?' + query + '&w_rid=' + md5(query + key))
  }

  // --- Only the video: Bilibili's page hidden round it --------------------------------------------------------
  //
  // The cabin page has its own player (the app's controls, its details beside the picture). Bilibili's page is
  // the engine behind it: everything of its own interface taken out, the picture over the whole page (the host
  // sizes the page to where the picture shows), letterboxed. Nothing of bilibili.com is ever seen.
  const style = document.createElement('style')
  style.textContent = `
    html, body { background: #000 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }
    /* Everything gone: Bilibili's header, its navigation, its video page's title and toolbars, its comments.
       Only the picture comes back (below), and its subtitles. */
    body * { visibility: hidden !important; }
    /* The picture, and only it: its element and the boxes it sits in.
       Not the boxes' children: the player's own layers inside the video area (its top and bottom masks, its
       progress-schedule and shadow-progress layers, its control rows) are full-size boxes with a black
       background and a z-index of 2^31-1, and they sit over the <video> in the page's own stacking. On a
       browser the video's compositor layer paints over them, so they're never seen; the host's capture misses
       that layer, so a blanket "the video area's children are visible" puts those black masks back over the
       picture — the whole picture area paints black (owner 2026-11-27: 只有声音没有画面，其实是黑色遮罩).
       Left hidden, the only thing over the black background is the <video> (which the capture misses) and
       WestPlay's own copy of the picture (.westplay-mirror, a canvas the capture does take). */
    .bpx-player-video-wrap,
    #bilibili-player video, #bilibili-player .bpx-player-video-area,
    video { visibility: visible !important; }
    /* Anything of Bilibili's own chrome is out for good, whatever the page does with it. */
    .bili-header, .bili-header *,
    .international-header, .international-header *,
    #biliMainHeader, #biliMainHeader *,
    .mini-header, .mini-header *,
    .bili-nav, .bili-nav *,
    .bpx-player-top-wrap, .bpx-player-top-wrap *,
    .bpx-player-control-wrap, .bpx-player-control-wrap *,
    .bpx-player-ctrl-wrap, .bpx-player-ctrl-wrap *,
    .bpx-player-dm-wrap, .bpx-player-dm-wrap *,
    .bpx-player-ending-wrap, .bpx-player-ending-wrap *,
    .video-toolbar-container, .video-toolbar-container *,
    .video-info-container, .video-info-container *,
    #comment, #comment *,
    .bili-comment, .bili-comment *,
    .nav-bar, .nav-bar *,
    .left-entry, .right-entry, .center-search-container,
    .bili-header__bar, .bili-header__channel,
    .ad-report, .ad-report *, .activity-m-v1, .activity-m-v1 *,
    /* Its picture over the whole page, wherever Bilibili put its own box. */
    #bilibili-player, #bilibili-player .bpx-player-container, #bilibili-player .bpx-player-video-area,
    #bilibili-player .bpx-player-video-wrap { position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important; z-index: 2147483647 !important;
      background: #000 !important; overflow: hidden !important; }
    /* Filling a box of another shape: cropped, no bars. */
    html.westplay-crop #bilibili-player video { object-fit: cover !important; }
    /* Its own captions, when they're on. */
    .bpx-player-subtitle-panel, .bpx-player-subtitle-panel * { visibility: visible !important; }
    /* WestPlay's own copy of the picture (see below): over the video, under Bilibili's captions. */
    .westplay-mirror { position: fixed !important; inset: 0 !important; width: 100vw !important;
      height: 100vh !important; pointer-events: none !important; visibility: visible !important;
      background: transparent !important; }
  `
  const addStyle = () => {
    const parent = document.head || document.documentElement
    if (parent) parent.appendChild(style)
    else requestAnimationFrame(addStyle)
  }
  addStyle()

  // --- The picture drawn again where the host can take it -----------------------------------------------------
  //
  // The host's capture of this page (Windows Graphics Capture of the browser's visual) takes everything of it
  // but the video: the player's <video> is handed to the compositor as a layer of its own (a hardware overlay or
  // a swapchain of its own), and the capture leaves that layer out — the details beside it, its controls and its
  // progress bar are all there, its picture black. The browser's own switches were tried and don't change it
  // (owner 2026-11-27, after `--disable-accelerated-video-decode` and then `--disable-gpu-compositing` both left
  // the picture black).
  //
  // So the page draws the picture itself: the <video>'s frames copied into a <canvas> over it, once per frame,
  // which the capture takes as it takes any other part of the page (a canvas is an ordinary layer). The canvas
  // follows the video's own box: its `object-fit` (`cover` as WestPlay's style makes it, or Bilibili's own
  // `contain`), its letterboxing, and its place on the page. Bilibili's captions sit above it still (the canvas
  // is put in the page right after the <video>, so whatever follows it paints over it).
  //
  // Nothing of the sound goes through it, and the video itself is left playing as it was: a player who sees this
  // page on a desktop sees exactly what Bilibili draws, and a truck's screen now sees it too.
  const mirror = (() => {
    let canvas = null
    let context = null
    let video = null
    let drawnAt = -1
    /** Puts the canvas in the page right after `element`, where whatever follows it (the captions) paints over it. */
    const place = (element) => {
      canvas.className = 'westplay-mirror'
      if (element.parentNode) element.parentNode.insertBefore(canvas, element.nextSibling)
    }

    /** The video's picture where its box and its `object-fit` put it: its part to draw, and where on the canvas. */
    const picture = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) return null
      const box = video.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return null
      const fit = getComputedStyle(video).objectFit
      // `fill` draws all of it in the box; `cover` all of the box out of it, cropping it; the rest fit it in, bars
      // round it (`contain`, and `none`, which no player here asks for).
      if (fit === 'fill') {
        return { from: [0, 0, width, height], into: [box.left, box.top, box.width, box.height] }
      }
      const scale =
        fit === 'cover'
          ? Math.max(box.width / width, box.height / height)
          : Math.min(box.width / width, box.height / height)
      const scaled = { width: width * scale, height: height * scale }
      const at = {
        left: box.left + (box.width - scaled.width) / 2,
        top: box.top + (box.height - scaled.height) / 2,
      }
      if (fit === 'cover') {
        // The part of the picture its box shows: its middle, as big as the box.
        const part = { width: box.width / scale, height: box.height / scale }
        return {
          from: [(width - part.width) / 2, (height - part.height) / 2, part.width, part.height],
          into: [box.left, box.top, box.width, box.height],
        }
      }
      return { from: [0, 0, width, height], into: [at.left, at.top, scaled.width, scaled.height] }
    }

    /** Draws the video's frame as it is now: its picture where the page shows it, black where it doesn't. */
    const draw = () => {
      if (!canvas || !context || !video || video.readyState < 2) return
      const shown = picture()
      if (!shown) return
      const across = Math.max(1, Math.round(window.innerWidth))
      const down = Math.max(1, Math.round(window.innerHeight))
      if (canvas.width !== across || canvas.height !== down) {
        canvas.width = across
        canvas.height = down
      }
      context.fillStyle = '#000'
      context.fillRect(0, 0, across, down)
      // A frame it can't copy (a protected one) is left black, as the capture had it: nothing thrown out of here.
      context.drawImage(video, ...shown.from, ...shown.into)
    }

    /** Puts the canvas over the video the page has now, if it isn't over it already. */
    const attach = () => {
      const found = document.querySelector('#bilibili-player video') || document.querySelector('video')
      if (!found) return
      if (found !== video || !canvas || !canvas.isConnected) {
        video = found
        drawnAt = -1
        if (!canvas) {
          canvas = document.createElement('canvas')
          context = canvas.getContext('2d')
          if (!context) {
            canvas = null
            return
          }
        }
        place(video)
      }
    }

    /** One turn: the canvas over the video the page has now, and its frame drawn if it moved on. */
    const tick = () => {
      try {
        attach()
        // The page's own frames come at its own rate: nothing drawn again while the video stands still (a seek
        // moves it without playing, and is drawn).
        if (video && video.readyState >= 2 && (!video.paused || drawnAt !== video.currentTime)) {
          drawnAt = video.currentTime
          draw()
        }
      } catch {
        // A frame missed is a frame missed; the next one is tried.
      }
    }
    const frame = () => {
      requestAnimationFrame(frame)
      tick()
    }
    requestAnimationFrame(frame)
    // The browser holds `requestAnimationFrame` back in a page it keeps offscreen, as this one is: drawn on a timer
    // too, 25 times a second, whichever comes first with the same frame (the same `currentTime` drawn once).
    setInterval(tick, 40)
    setInterval(attach, 1000)
  })()

  // Live rooms are gone from WestPlay (owner 2026-11-26). They were dropped because a room's picture is laid
  // out by Bilibili for a desktop page — its chat rail, its 点播台, the clock at its foot — and reading the
  // <video>'s own pixels at those very points shows them there: they are mixed into the stream the streamer
  // broadcasts, so the truck's screen could never show the room alone. Every rule and every branch that
  // served a room went with it; a room's id is refused rather than loaded.

  // --- What the app shows, from Bilibili's own answers -----------------------------------------------------

  /** Bilibili's count as the app writes it: 12345 -> "1.2\u4e07", 1234567 -> "123.5\u4e07", 1e8 -> "1.0\u4ebf". */
  const count = (value) => {
    const n = Number(value) || 0
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '\u4ebf'
    if (n >= 10000) return (n / 10000).toFixed(1) + '\u4e07'
    return String(n)
  }

  /** Seconds as the app writes a length: 3725 -> "1:02:05", 125 -> "2:05". */
  const length = (total) => {
    const s = Math.max(0, Math.round(Number(total) || 0))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const pad = (n) => String(n).padStart(2, '0')
    return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec)
  }

  /** A length as Bilibili may write it: "12:34" or a number of seconds. */
  const seconds = (duration) => {
    if (typeof duration === 'number') return duration
    if (typeof duration !== 'string' || !duration) return 0
    return duration.split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0)
  }

  /**
   * A length for the app's rows. Bilibili writes it one of two ways: a feed gives seconds (178), a search
   * gives a clock ("1:12") — so anything that isn't a plain number is read as a clock first.
   */
  const lengthOf = (duration) => {
    if (typeof duration === 'string' && duration.includes(':')) return duration
    return length(seconds(duration))
  }

  /** When it was put up, as the app writes an age: "3\u5929\u524d", "2\u5c0f\u65f6\u524d", "\u521a\u521a". */
  const age = (pubdate) => {
    const at = Number(pubdate) || 0
    if (!at) return ''
    const delta = Math.max(0, Date.now() / 1000 - at)
    if (delta < 3600) return Math.max(1, Math.floor(delta / 60)) + '\u5206\u949f\u524d'
    if (delta < 86400) return Math.floor(delta / 3600) + '\u5c0f\u65f6\u524d'
    if (delta < 86400 * 30) return Math.floor(delta / 86400) + '\u5929\u524d'
    if (delta < 86400 * 365) return Math.floor(delta / (86400 * 30)) + '\u4e2a\u6708\u524d'
    return Math.floor(delta / (86400 * 365)) + '\u5e74\u524d'
  }

  /** A moment of the player's own lists, as Bilibili writes it there: "今天 15:19", "昨天 09:02", "11-05". */
  const clock = (value) => {
    const at = Number(value) || 0
    if (!at) return ''
    const date = new Date(at * 1000)
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const time = pad(date.getHours()) + ':' + pad(date.getMinutes())
    const day = (one) => new Date(one.getFullYear(), one.getMonth(), one.getDate()).getTime()
    const days = Math.round((day(now) - day(date)) / 86400000)
    if (days <= 0) return '\u4eca\u5929 ' + time
    if (days === 1) return '\u6628\u5929 ' + time
    if (days < 365) return pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
  }

  /** A moment Bilibili gives some other way: its seconds (an age), its milliseconds, or its own written time. */
  const moment = (value) => {
    if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
      const at = Number(value)
      return age(at > 1e12 ? Math.floor(at / 1000) : at)
    }
    return typeof value === 'string' ? value.slice(0, 20) : ''
  }

  /** A picture's address as the app can load it (`//` and `http://` covers are Bilibili's own hosts). */
  const picture = (url) => {
    if (typeof url !== 'string' || !url) return null
    if (url.startsWith('//')) return 'https:' + url
    if (url.startsWith('http://')) return 'https://' + url.slice(7)
    return url
  }

  /**
   * A video's BV id, wherever Bilibili put it. Most answers give it at the top (`bvid`); the player's own
   * history doesn't — there it is in `history` (its `bvid`, or the `bvideo` beside it) or only in the item's
   * `uri` ("bilibili://video/..."). Read as the top-level one alone, every history row was dropped (owner
   * 2026-11-22: "历史记录无法显示").
   */
  const bvidOf = (item) => {
    if (!item) return ''
    if (typeof item.bvid === 'string' && item.bvid) return item.bvid
    const history = item.history || {}
    if (typeof history.bvid === 'string' && history.bvid) return history.bvid
    if (history.bvideo && typeof history.bvideo.bvid === 'string' && history.bvideo.bvid) return history.bvideo.bvid
    const found = /(BV[0-9A-Za-z]{8,14})/.exec((item.uri || '') + ' ' + (item.link || ''))
    return found ? found[1] : ''
  }

  /** A video's `aid` and `cid`: what its comments ask for by (`aid`) and what its danmaku do (`cid`), not the
   * BV id. Kept once asked — the page asks for them again and again. */
  const ids = new Map()
  const idsOf = async (bvid) => {
    if (!bvid || bvid.startsWith('lv')) return null
    if (ids.has(bvid)) return ids.get(bvid)
    try {
      const view = await api('/x/web-interface/view', { bvid })
      const found = {
        aid: Number(view && view.aid) || 0,
        cid: Number(view && view.cid) || 0,
        // A series: the `cid` of the part playing (`?p=`, from its own pages).
        part: 0,
        pages: (view && view.pages) || [],
      }
      if (found.aid) ids.set(bvid, found)
      return found
    } catch {
      return null
    }
  }
  const aidOf = async (bvid) => {
    const found = await idsOf(bvid)
    return found ? found.aid : 0
  }
  /** The `cid` the video is playing: its own, or (a series) the part's. */
  const cidOf = async (bvid, part) => {
    const found = await idsOf(bvid)
    if (!found) return 0
    if (part && part > 1) {
      const page = (found.pages || []).find((one) => one.page === part)
      if (page && page.cid) return Number(page.cid)
    }
    return found.cid
  }

  /**
   * A video's danmaku, as Bilibili writes them: an XML of lines, each `<d p="time,mode,size,colour,parked,...">`
   * around its words. Read as the lines the app draws: when each comes, what it says, and its colour.
   */
  const danmakuOf = (body) => {
    const lines = []
    if (typeof body !== 'string' || !body.includes('<d ')) return lines
    const pattern = /<d p="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g
    let found
    while ((found = pattern.exec(body)) && lines.length < 4000) {
      const fields = found[1].split(',')
      const at = Number(fields[0])
      if (!Number.isFinite(at) || at < 0) continue
      const text = found[2]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim()
      if (!text) continue
      const value = Number(fields[3])
      const color = Number.isFinite(value) && value >= 0 && value <= 0xffffff
        ? '#' + (value >>> 0).toString(16).padStart(6, '0').toUpperCase()
        : null
      lines.push({ at, text: text.slice(0, 100), color })
    }
    return lines
  }

  /** A title with Bilibili's own markup taken out (a search's answer highlights the words asked for). */
  const plain = (title) => {
    if (typeof title !== 'string') return ''
    return title
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .trim()
  }

  /** A person's face, at a size the app's rows can show. */
  const face = (url) => {
    const image = picture(url)
    if (!image) return null
    // Bilibili's faces come at whatever was asked for; the app's rows are small.
    return image.replace(/@[^/]*$/, '') + '@96w_96h_1c_1s.webp'
  }

  /** A video as the app lists it, from a search's or a feed's own item. */
  const fromItem = (item) => {
    const owner = item.owner || {}
    const stat = item.stat || {}
    // A feed gives the count (`stat.view`); a search gives it already written ("2.9\u4e07"), which is kept as
    // Bilibili wrote it (stripping its marks would read "2.9万" as 29).
    const views = stat.view
      ? count(stat.view) + '\u64ad\u653e'
      : typeof item.play === 'string' && item.play
        ? item.play + '\u64ad\u653e'
        : typeof item.play === 'number'
          ? count(item.play) + '\u64ad\u653e'
          : ''
    return {
      video: item.bvid || '',
      title: plain(item.title),
      channel: item.author || owner.name || '',
      avatar: face(owner.face || item.upic),
      thumbnail: picture(item.pic || item.cover),
      duration: lengthOf(item.duration !== undefined && item.duration !== null ? item.duration : item.length),
      views,
      age: age(item.pubdate || item.pub_time || item.ctime),
      live: item.goto === 'live' || Boolean(item.live_status === 1 && item.live_time),
      channelId: owner.mid ? String(owner.mid) : item.mid ? String(item.mid) : null,
    }
  }

  /** A season as a series page's cards show it: its own cover, its episodes' mark, its score. */
  const seasonCard = (item, followed) => {
    const score = (item.rating && item.rating.score) || item.score || ''
    return {
      // A season's own id, in its link's place: the page opens it there (`ss` and the id).
      video: 'ss' + item.season_id,
      title: plain(item.title),
      channel: plain((followed ? item.subtitle : item.subTitle) || item.season_type_name || ''),
      avatar: null,
      thumbnail: picture(item.cover),
      duration: '',
      views: '',
      age: score ? String(score) + '\u5206' : '',
      live: false,
      channelId: null,
      badge: plain((item.new_ep && item.new_ep.index_show) || item.index_show || ''),
    }
  }

  /** A channel (an UP \u4e3b) as the app shows it. */
  const fromUp = (up) => ({
    channel: String(up.mid || ''),
    name: up.uname || up.name || '',
    avatar: face(up.face || up.upic),
    banner: null,
    handle: '',
    subscribers: up.fans ? count(up.fans) + '\u7c89\u4e1d' : up.attentions ? count(up.attentions) + '\u7c89\u4e1d' : '',
    videos: up.videos ? count(up.videos) + '\u4e2a\u89c6\u9891' : '',
    subscribed: null,
  })

  /** A search's videos, and the page token for more of them. */
  const resultsIn = (data, page) => {
    const items = (data && data.result) || []
    return {
      videos: items.filter((item) => item.bvid).map(fromItem),
      // Bilibili pages its search by number, and says how many there are.
      more: items.length > 0 ? String(page + 1) : null,
    }
  }

  // --- Playing ---------------------------------------------------------------------------------------------

  /** The page's own video element (Bilibili's player makes one, and keeps it). */
  /**
   * The page's own video element — the one actually playing.
   *
   * No bare `video` fallback: the front page and the side bars carry their own (hover previews,
   * the ranking's autoplaying clips), and `querySelector` answers the first in document order.
   * Handing one of those to `cab_sound.js` takes it into the graph for good
   * (`createMediaElementSource` is once per element) while the player's own `<video>` stays
   * untouched — heard as the video having no sound at all (owner 2026-11-25: "完全没声").
   *
   * Among the player's own, the one playing wins: a page switching videos leaves the old element
   * in place for a moment, paused.
   */
  const player = () => {
    const found = Array.from(
      document.querySelectorAll(
        '#bilibili-player video, .bpx-player-video-wrap video, .bpx-player-container video',
      ),
    )
    return found.find((element) => !element.paused) ?? found[0] ?? null
  }

  // The truck's own speakers (cab_sound.js): the video's sound split as the truck's system
  // splits it, placed at each speaker around the driver's head, muffled through the cab's walls
  // when the camera is outside. Without this the video plays as flat stereo in front of the face,
  // while every other player in the cab comes from the speakers (owner 2026-11-25).
  //
  // `player` is a getter, not the element: Bilibili's page remakes its `<video>` on every video
  // (and on a part of a series), and a new one has to be taken into the graph — a source node
  // belongs to its own element for good.
  // The truck's own speakers (`cab_sound.js`, loaded before this script): the video's sound split
  // to the cab's speakers, each heard from where it sits.
  //
  // No gate on `head` being known first: measured on this page, taking the element in before the
  // head arrives left it silent for good (`createMediaElementSource` is once per element, and the
  // graph it lands in then has no listener). It plays through the tone and the cab's walls from
  // the start instead, and the speakers are wired in when the head comes (`cab_sound.js`'s own
  // `wire`), which is the same thing every other player in the cab does.
  // The page's player often plays through an element it never puts in the page, or one it takes
  // out again as the next video loads: what plays is followed as it plays, and only then looked
  // for in the page. Bilibili's own player does both (its router swaps the player's DOM between a
  // video and a series' part). The web app's page has had this from the start (`webapp.js`), and
  // it is why Bilibili had a cab sound there before it had a client of its own.
  const heard = new Set()
  const played = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (...args) {
    heard.add(this)
    return played.apply(this, args)
  }

  /** The page's own media elements, this document's and its frames' (Bilibili's player runs in
   * one), plus everything ever played, whether or not it is still in the page. */
  const media = () => {
    const found = []
    const walk = (doc, depth) => {
      if (depth >= 3 || !doc) return
      for (const one of doc.querySelectorAll('audio, video')) found.push(one)
      for (const frame of doc.querySelectorAll('iframe')) {
        let inner = null
        try {
          inner = frame.contentDocument
        } catch {}
        if (inner) walk(inner, depth + 1)
      }
    }
    walk(document, 0)
    for (const one of heard) if (!found.includes(one)) found.push(one)
    return found
  }

  /** Whether an element can be the video at all: something to play. */
  const sounding = (one) =>
    Boolean(one) &&
    !one.ended &&
    Boolean(one.srcObject || ((one.currentSrc || one.src) && one.readyState >= 1))

  /** The element the video plays through: the one playing, where the page has more than one (the
   * front page's hover previews, an advertisement's own). */
  const playingElement = () => {
    const playing = [...heard].find((one) => sounding(one) && !one.paused)
    if (playing) return playing
    const inPage = media()
    return (
      inPage.find((one) => sounding(one) && !one.paused) ??
      [...heard].filter(sounding).at(-1) ??
      inPage.find(sounding) ??
      null
    )
  }

  /**
   * The element the cab's graph may take, or `null` while it may not.
   *
   * An element is taken into a graph once and for good (`createMediaElementSource` throws the
   * second time), and a cross-origin stream taken in without CORS plays through the graph
   * silently while its own way back is gone. So the test is the web app's own (`webapp.js`'s
   * `speakable`, which is how Bilibili had a cab sound before it had a client of its own):
   *
   *  - no address, or not readable yet → `null`. Bilibili's player fills its `<video>`'s address
   *    a moment after it starts; taking it in before that spent its one chance on an element with
   *    nothing to play (`owner 2026-11-25`: "还是没声音").
   *  - a `blob:` address (the page feeding it itself, MSE — what Bilibili's `dash` plays through)
   *    → its own origin, fine to take.
   *  - an element given `crossOrigin` → its host agreed to CORS, fine.
   *  - same origin → fine.
   *  - anything else (another site's plain file) → `null`: it plays as the page plays it.
   */
  const speakable = (element) => {
    if (!element || element.mediaKeys) return null
    const src = element.currentSrc || element.src || ''
    if (!src || element.readyState < 2) return null
    if (src.startsWith('blob:') || element.crossOrigin) return element
    try {
      if (new URL(src, location.href).origin === location.origin) return element
    } catch {}
    return null
  }

  const cab = window.westplayCabSound
    ? window.westplayCabSound(
        () => speakable(playingElement()),
        (message) => window.chrome?.webview?.postMessage(message),
      )
    : null
  // What the commands below call: `cab_sound.js` hands back the object that takes them
  // (`outside`, `head`, `equalizer`, `speakers`, `spectrum`), and this page's dispatch looks for it
  // on `window.westplayCab`.
  if (cab) window.westplayCab = cab
  if (cab) window.setInterval(() => cab.tick?.(), 250)


  /**
   * Starts the page's video, or says it may not.
   *
   * Bilibili's own player doesn't autoplay a page it was opened on (a browser's policy), and WebView2 keeps
   * that policy: the page has to be told to. A refusal is swallowed (Bilibili's page then shows its own play
   * button, which the app's Play presses again).
   */
  const playIt = (element) => {
    try {
      element.play && element.play().catch(() => {})
    } catch {}
  }

  /** The video this page is on (its id in the address: `/video/BV.../`). */
  /**
   * What this page is playing: a video's BV number, or a season's own id (`ss` and its number) on a bangumi
   * or film page. `null`: a page with nothing playing (the front page).
   *
   * Live rooms are gone from WestPlay (owner 2026-11-26): a room's picture is laid out by Bilibili for a
   * desktop page, its chat rail and 点播台 and clock mixed into the stream itself, so the truck's screen could
   * never show the room alone. Nothing asks for one, and a room's page reports nothing any more.
   */
  const current = () => {
    const video = location.pathname.match(/\/video\/(BV[\w]+)/)
    if (video) return video[1]
    // A series: its own play page (`/bangumi/play/ss47836`), or an episode's (`/bangumi/play/ep123456`). An
    // episode belongs to a season the page carries, which is what the app lists it as.
    const season = location.pathname.match(/\/bangumi\/play\/(ss\d+|ep\d+)/)
    if (!season) return null
    const leaf = season[1]
    if (leaf.startsWith('ss')) {
      // A season's own page plays one of its episodes and says which in its canonical address
      // (`<link rel=canonical>` / `og:url`: `/bangumi/play/ep830494`). It reports that episode, not the
      // season: the app asked for `ss47836` and was told about `ep830494`, took the two for different
      // videos, and never showed the picture it had asked for (owner 2026-11-26: "番剧的视频无法加载").
      // Its own episode is answered instead, which is the video playing and what the app can follow.
      const episode = canonicalEpisode()
      if (episode) return episode
      return leaf
    }
    const state = window.__INITIAL_STATE__
    const seasonId = state?.epInfo?.season_id ?? state?.epList?.[0]?.season_id
    return seasonId ? 'ss' + seasonId : leaf
  }

  /** The part this page is playing (its `?p=`), 1 when it has none. */
  const playingPart = () => Number(new URLSearchParams(location.search).get('p')) || 1

  /**
   * Whether `asked` is another episode than the one playing (`here`): a series' 选集 picking one asks for
   * its own `ep…`, and two different episodes are two watches even though they belong to one season.
   */
  const differentEpisode = (here, asked) => {
    const isEpisode = (id) => /^ep\d+$/.test(id || '')
    if (isEpisode(here) && isEpisode(asked)) return here !== asked
    // A season's id is not an episode: it means "the one this page plays", which is what's here.
    return false
  }

  /**
   * Whether what this page plays (`here`) is the video the app asked for (`asked`), where the two may be
   * written differently: a season's own page plays one of its episodes (`ss47836` → `ep830494`) and
   * reports that node. Same watch either way, so nothing is loaded again and nothing reloads the page.
   */
  const sameWatch = (here, asked) => {
    if (!here || !asked) return false
    if (here === asked) return true
    const isEpisode = (id) => /^ep\d+$/.test(id)
    const isSeason = (id) => /^ss\d+$/.test(id)
    return (isSeason(asked) && isEpisode(here)) || (isEpisode(asked) && isSeason(here))
  }

  /**
   * The episode a season's own page is playing: its canonical address names it (`/bangumi/play/ep830494`),
   * and its own initial data the episode playing (`__INITIAL_STATE__.epInfo.ep_id`, on the pages that still
   * carry it). `null` where neither says (a season's page with nothing playable): the address's own then.
   */
  const canonicalEpisode = () => {
    const canonical = document.querySelector('link[rel=canonical]')?.href || ''
    const fromCanonical = canonical.match(/\/bangumi\/play\/(ep\d+)/)
    if (fromCanonical) return fromCanonical[1]
    const state = window.__INITIAL_STATE__
    const playing = state?.epInfo?.ep_id
    if (playing) return 'ep' + playing
    // The page's own Next.js data (the player these pages ship): its episode is the one playing.
    const next = window.__NEXT_DATA__ && window.__NEXT_DATA__.props
    const episode = next && next.pageProps && (next.pageProps.epInfo || {}).ep_id
    if (episode) return 'ep' + episode
    return null
  }

  /** Loads a video in the page's own player: its watch page, which is what makes it play at all. `part`: a
   * series' own part (its `?p=`), the app's 选集. */
  const watch = (video, start, part) => {
    // A season (`ss` and its id), or one of its episodes (`ep` and its id): a series Bilibili plays in its own
    // bangumi page, not a video's watch page.
    if (video.startsWith('ss') || video.startsWith('ep')) {
      // On that very watch already (its own page may be the season's, or one of its episodes'): its player
      // is told to play, and the page is left where it is. Navigating anyway reloaded it every time the
      // app asked again (owner 2026-11-26: 番剧一直加载不出来).
      //
      // Another episode of that season is another watch: its own address, which the page plays (the app's
      // 选集), and this is where a series' episodes are picked.
      if (sameWatch(current(), video) && !differentEpisode(current(), video)) {
        const element = player()
        if (element) playIt(element)
        return
      }
      location.href = '/bangumi/play/' + video
      return
    }
    // A live room's id (`lv…`) is no longer loaded: rooms are gone from WestPlay (see `current`), and a
    // room's id can only come from a list that no longer offers one.
    if (video.startsWith('lv')) return
    const query = []
    if (part && part > 1) query.push('p=' + part)
    if (start) query.push('t=' + Math.floor(start))
    const at = query.length ? '?' + query.join('&') : ''
    const url = '/video/' + video + '/' + at
    const here = location.pathname
    if (here === '/video/' + video + '/' || here === '/video/' + video) {
      // Already there: another moment of the same video, or another of its parts.
      const element = player()
      if (part && part !== playingPart()) {
        location.href = url
        return
      }
      if (element) {
        if (start) element.currentTime = start
        playIt(element)
      }
      return
    }
    location.href = url
  }

  /**
   * Takes the page over once it's on a video: its own player plays from the moment this page loads, since the
   * app asked for it before the page navigated here (and this script runs again on that new page).
   */
  const settleVideo = () => {
    const video = current()
    if (!video) return
    const element = player()
    if (!element) return
    // Started once per page: a later Play is the app's own.
    if (element.dataset.westplayStarted) return
    element.dataset.westplayStarted = '1'
    playIt(element)
  }

  // --- What the app asks ------------------------------------------------------------------------------------

  /**
   * A series' or a film's own page (`ss…`, or one of its `ep…`), worked out from PGC's season answer: what
   * the app shows beside the picture, and its 选集 — every episode, each with the id the page plays it by.
   *
   * `null` for a video (`BV…`), whose page is `/x/web-interface/view`'s.
   */
  const pgcDetail = async (video) => {
    const isSeason = /^ss\d+$/.test(video || '')
    const isEpisode = /^ep\d+$/.test(video || '')
    if (!isSeason && !isEpisode) return null
    try {
      // A season by its id; an episode's season is the one it belongs to (PGC names it).
      const seasonId = isSeason ? video.slice(2) : await seasonOfEpisode(video.slice(2))
      if (!seasonId) return null
      const data = await api('/pgc/view/web/season', { season_id: seasonId })
      if (!data) return null
      const episodes = data.episodes || []
      // The season's own sections besides the episodes (PV, trailers: "PV＆其他"), a flat list after them.
      const extra = []
      for (const section of data.section || []) {
        for (const episode of section.episodes || []) extra.push(episode)
      }
      const all = episodes.concat(extra)
      const playing = isEpisode ? video : canonicalEpisode() || ''
      // Its parts: every episode the season has, the one playing marked by its own id. `page` is the
      // number the list shows (`选集 · 1/25`, `第1话`), `episode` the id the app loads it by.
      const parts = all
        .filter((episode) => episode && episode.ep_id)
        .map((episode, index) => ({
          page: index + 1,
          cid: Number(episode.cid) || 0,
          title: plain(String(episode.title || '')) || String(index + 1),
          // A film's own name is its only episode's title; a series' episodes carry theirs ("1", "2").
          subtitle: plain(String(episode.long_title || '')).slice(0, 80),
          duration: episode.duration ? length(Math.round(Number(episode.duration) / 1000)) : '',
          // `会员`: only a paying account plays it (its own badge, shown as Bilibili shows it).
          badge: episode.badge || '',
          episode: 'ep' + episode.ep_id,
          playing: 'ep' + episode.ep_id === playing,
        }))
      const first = all[0] || {}
      return {
        video: isSeason ? video : video,
        title: plain(String(data.title || '')),
        desc: plain(String(data.summary || '')).slice(0, 400),
        channel: plain(String((data.up_info && data.up_info.uname) || '')),
        channelId: data.up_info && data.up_info.mid ? String(data.up_info.mid) : null,
        avatar: face(data.up_info && data.up_info.face),
        pubdate: data.publish && data.publish.pub_time ? plain(String(data.publish.pub_time)).slice(0, 20) : '',
        views: data.stat && data.stat.views ? count(data.stat.views) + '\u64ad\u653e' : '',
        likes: data.stat && data.stat.likes ? count(data.stat.likes) : '',
        coins: data.stat && data.stat.coins ? count(data.stat.coins) : '',
        favorites: data.stat && data.stat.favorites ? count(data.stat.favorites) : '',
        danmaku: data.stat && data.stat.danmakus ? count(data.stat.danmakus) : '',
        // The season itself: its score and whether the player follows it, as its own page shows them.
        score: data.rating && data.rating.score ? String(data.rating.score) : '',
        season: isSeason ? video : first.season_id ? 'ss' + first.season_id : null,
        parts,
      }
    } catch {
      return null
    }
  }

  /** The season (`ss…` without its prefix) an episode (`ep…` without its prefix) belongs to. */
  const seasonOfEpisode = async (epId) => {
    const known = episodeSeasons.get(epId)
    if (known) return known
    try {
      const data = await api('/pgc/view/web/season', { ep_id: epId })
      const found = data && (data.season_id || (data.episodes && data.episodes[0] && data.episodes[0].season_id))
      if (found) episodeSeasons.set(epId, String(found))
      return found ? String(found) : null
    } catch {
      return null
    }
  }
  /** An episode's season, once asked (the page asks for the same episode's details again and again). */
  const episodeSeasons = new Map()


  /**
   * Answers one of the app's questions: search, suggestions, Up next, the player's feed, an UP's page.
   *
   * The shapes are YouTube's (`Answer` in bilibili.rs), which is what the app draws: the same video, channel
   * and playlist fields, filled from Bilibili's own answers.
   */
  const answer = async (command) => {
    const reply = (fields) => window.chrome.webview.postMessage(Object.assign({ answer: command.id }, fields))
    try {
      if (command.action === 'search') {
        // Bilibili's search, the videos' tab (or the UP \u4e3bs'); `more` is the page after it.
        const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
        const data = await api('/x/web-interface/search/type', {
          search_type:
            command.filter === 'channels'
              ? 'bili_user'
              : command.filter === 'bangumi'
                ? 'media_bangumi'
                : command.filter === 'film'
                  ? 'media_ft'
                  : 'video',
          keyword: command.query,
          page,
          page_size: 30,
        })
        if (command.filter === 'channels') {
          const ups = ((data && data.result) || []).filter((up) => up.mid).map(fromUp)
          reply({ channels: ups, videos: [], more: ups.length > 0 ? String(page + 1) : null })
          return
        }
        if (command.filter === 'bangumi' || command.filter === 'film') {
          // Bilibili's own 番剧 and 影视 tabs of a search: seasons, not videos.
          const found = ((data && data.result) || []).filter((item) => item.season_id)
          reply({
            videos: found.map((item) => seasonCard(item, false)),
            channels: [],
            more: found.length > 0 ? String(page + 1) : null,
          })
          return
        }
        const found = resultsIn(data, page)
        reply({ videos: found.videos, channels: [], more: found.more })
        return
      }
      if (command.action === 'suggest') {
        // Bilibili's own search suggestions, as its search box asks for them (its suggestion host, not the
        // API's: `/x/web-interface/search/suggest` is a 404).
        const url = new URL('https://s.search.bilibili.com/main/suggest')
        url.searchParams.set('term', command.query)
        url.searchParams.set('main_ver', 'v1')
        const response = await fetch(url, { credentials: 'include' })
        const data = response.ok ? (await response.json()).result : null
        const tags = ((data && data.tag) || []).map((tag) => plain(tag.value || tag.term || '')).filter(Boolean)
        reply({ suggestions: tags.slice(0, 15) })
        return
      }
      if (command.action === 'feed') {
        // Bilibili's own sections: the front page's recency feed, its ranking of the day, and its two
        // catalogues of series (bangumi and films, whose entries are seasons, not videos).
        if (command.which === 'ranking') {
          // Bilibili's own ranking of everything (its hot page).
          const data = await api('/x/web-interface/ranking/v2', { rid: 0, type: 'all' })
          const items = ((data && data.list) || []).filter((item) => item.bvid)
          reply({ videos: items.map(fromItem), more: null })
          return
        }
        if (command.which === 'bangumi' || command.which === 'film') {
          // A season's catalogue entry: a series' own cover, its episode count, its score and its badge.
          const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
          const data = await api('/pgc/season/index/result', {
            season_type: command.which === 'bangumi' ? 1 : 2,
            page,
            pagesize: 20,
            order: 3,
            st: 1,
            sort: 0,
            type: 1,
            area: -1,
            year: -1,
          })
          const items = (data && data.list) || []
          const videos = items
            .filter((item) => item.season_id)
            .map((item) => ({
              // A season's own id, in its link's place: the page opens it there (`ss` and the id).
              video: 'ss' + item.season_id,
              title: plain(item.title),
              channel: item.index_show || '',
              avatar: null,
              thumbnail: picture(item.cover),
              duration: '',
              views: item.order || '',
              age: item.score ? item.score + '\u5206' : '',
              live: false,
              channelId: null,
              // Whether it's a series Bilibili plays in its own page (`Player.tsx` opens it there).
              catalog: 'ss' + item.season_id,
            }))
          reply({ videos, more: data && data.has_next ? String(page + 1) : null })
          return
        }
        if (command.which === 'selected') {
          // Bilibili's own 精选: what it puts first of everything (its front page's own second feed), or its
          // ranking of the day when that feed doesn't answer.
          const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
          let data = null
          try {
            data = await api('/x/web-interface/index/top/feed/rcmd', {
              ps: 20,
              fresh_type: 4,
              fresh_idx: page,
              fresh_idx_1h: 1,
              feed_version: 'V8',
              brush: page > 1 ? page - 1 : 0,
              homepage_ver: 1,
            })
          } catch {
            data = await api('/x/web-interface/ranking/v2', { rid: 0, type: 'all' })
          }
          const items = ((data && (data.item || data.list)) || []).filter((item) => item.bvid)
          reply({ videos: items.map(fromItem), more: items.length > 0 ? String(page + 1) : null })
          return
        }
        if (command.which === 'subscriptions') {
          // The videos of the UP \u4e3bs the player follows: Bilibili's own feed of them.
          const data = await api('/x/web-interface/feed/rcmd', { ps: 20, fresh_type: 3 })
          const items = ((data && data.item) || []).filter((item) => item.bvid)
          reply({ videos: items.map(fromItem), more: null })
          return
        }
        const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
        const data = await api('/x/web-interface/index/top/feed/rcmd', { ps: 20, fresh_idx: page })
        const items = ((data && data.item) || []).filter((item) => item.bvid)
        reply({ videos: items.map(fromItem), more: items.length > 0 ? String(page + 1) : null })
        return
      }
      if (command.action === 'sections') {
        // A series page's rows (its 追番 or 影视 tab): what the player watched last (wide), then Bilibili's
        // recommendations. A row Bilibili doesn't answer is left out, not failed.
        const bangumi = command.which !== 'film'
        const rows = bangumi
          ? [
              { title: '番剧推荐', row: 'bangumi', season_type: 1 },
              { title: '国创推荐', row: 'guochuang', season_type: 4 },
            ]
          : [
              { title: '正在热播', row: 'hot', season_type: 5 },
              { title: '电影热播', row: 'movie', season_type: 2 },
            ]
        const sections = []
        try {
          // What the player watched of them (Bilibili's own "看过" list, which carries where they got to:
          // "看到第14话 8:19"), the seasons it last took up first.
          const nav = await api('/x/web-interface/nav')
          if (nav && nav.isLogin && nav.mid) {
            const data = await api('/x/space/bangumi/follow/list', {
              vmid: String(nav.mid),
              type: bangumi ? 1 : 2,
              follow_status: 2,
              pn: 1,
              ps: 12,
              platform: 'web',
            })
            const items = ((data && data.list) || []).filter((item) => item.season_id)
            if (items.length > 0) {
              sections.push({
                title: '历史观看',
                row: 'my',
                wide: true,
                items: items.slice(0, 10).map((item) => ({
                  video: 'ss' + item.season_id,
                  title: plain(item.title),
                  channel: plain(item.progress || item.subtitle || ''),
                  avatar: null,
                  thumbnail: picture(item.cover),
                  duration: '',
                  views: '',
                  age: '',
                  live: false,
                  channelId: null,
                  badge: plain((item.new_ep && item.new_ep.index_show) || item.index_show || ''),
                })),
              })
            }
          }
        } catch {}
        for (const row of rows) {
          try {
            const data = await api('/pgc/season/index/result', {
              season_type: row.season_type,
              page: 1,
              pagesize: 20,
              order: 3,
              st: 1,
              sort: 0,
              type: 1,
              area: -1,
              year: -1,
            })
            const items = ((data && data.list) || []).filter((item) => item.season_id)
            if (items.length > 0) {
              sections.push({
                title: row.title,
                row: row.row,
                wide: false,
                items: items.map((item) => seasonCard(item, false)),
              })
            }
          } catch {}
        }
        if (sections.length === 0) {
          reply({ failed: true })
          return
        }
        reply({ sections })
        return
      }
      if (command.action === 'shelf') {
        // One row of a series page, all of it (its 查看更多): the player's keeps, or one of Bilibili's own
        // catalogues, a page at a time.
        const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
        const rows = {
          bangumi: 1,
          guochuang: 4,
          hot: 5,
          movie: 2,
        }
        if (command.row === 'my') {
          const nav = await api('/x/web-interface/nav')
          if (!nav || !nav.isLogin || !nav.mid) {
            reply({ videos: [], more: null })
            return
          }
          const data = await api('/x/space/bangumi/follow/list', {
            vmid: String(nav.mid),
            type: command.film ? 2 : 1,
            follow_status: 0,
            pn: page,
            ps: 30,
            platform: 'web',
          })
          const items = ((data && data.list) || []).filter((item) => item.season_id)
          const total = Number((data && data.total) || 0)
          const hasNext = Boolean(data && data.has_next) || total > page * 30
          reply({
            videos: items.map((item) => seasonCard(item, true)),
            more: hasNext && items.length > 0 ? String(page + 1) : null,
          })
          return
        }
        const seasonType = rows[command.row]
        if (!seasonType) {
          reply({ failed: true })
          return
        }
        const data = await api('/pgc/season/index/result', {
          season_type: seasonType,
          page,
          pagesize: 30,
          order: 3,
          st: 1,
          sort: 0,
          type: 1,
          area: -1,
          year: -1,
        })
        const items = ((data && data.list) || []).filter((item) => item.season_id)
        reply({
          videos: items.map((item) => seasonCard(item, false)),
          more: data && data.has_next && items.length > 0 ? String(page + 1) : null,
        })
        return
      }
      if (command.action === 'danmaku') {
        // A video's danmaku: Bilibili's own list for its `cid`, an XML of lines (`<d p="time,mode,size,colour,
        // ...">text</d>`). Every line, with when it comes: the app draws the ones near the moment playing.
        const cid = await cidOf(command.video, command.part)
        if (!cid) {
          reply({ danmaku: [] })
          return
        }
        const answer = await fetch('https://api.bilibili.com/x/v1/dm/list.so?oid=' + cid, { credentials: 'include' })
        const body = answer.ok ? await answer.text() : ''
        reply({ danmaku: danmakuOf(body) })
        return
      }
      if (command.action === 'sendDanmaku') {
        // A line the player wrote, sent to the video playing (Bilibili's own box needs its `csrf`, the page's
        // own `bili_jct` cookie).
        const cid = await cidOf(command.video, command.part)
        const found = document.cookie.match(/bili_jct=([^;]+)/)
        const csrf = found ? found[1] : ''
        if (!cid || !csrf) {
          reply({ failed: true })
          return
        }
        const response = await fetch('https://api.bilibili.com/x/v2/dm/post', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            type: '1',
            oid: String(cid),
            msg: command.text,
            progress: String(Math.max(0, Math.round((Number(command.at) || 0) * 1000))),
            color: '16777215',
            fontsize: '25',
            pool: '0',
            mode: '1',
            plat: '2',
            csrf,
          }),
        })
        const answer = response.ok ? await response.json().catch(() => null) : null
        reply(answer && answer.code === 0 ? { sent: true } : { failed: true })
        return
      }
      if (command.action === 'detail') {
        // A video's own page: its player's data, its uploader, its numbers, and its parts (a multi-part video
        // is several of them, each played on its own).
        //
        // A series or a film (`ss…`, `ep…`) is not a video: its page is PGC's, and `/x/web-interface/view`
        // has nothing for it — the app's 选集 (the parts list) came back empty, so a series could only
        // ever play the one episode it opened on (owner 2026-11-26: "选集还是有问题"). Its own season
        // carries every episode, each with the `ep` id and the `cid` that plays it.
        const season = await pgcDetail(command.video)
        if (season) {
          reply({ detail: season })
          return
        }
        const data = await api('/x/web-interface/view', { bvid: command.video })
        if (!data) {
          reply({ failed: true })
          return
        }
        const owner = data.owner || {}
        const stat = data.stat || {}
        reply({
          detail: {
            video: data.bvid || command.video,
            title: plain(data.title),
            desc: plain(data.desc || '').slice(0, 400),
            channel: owner.name || '',
            channelId: owner.mid ? String(owner.mid) : null,
            avatar: face(owner.face),
            pubdate: data.pubdate ? age(data.pubdate) : '',
            views: stat.view ? count(stat.view) + '\u64ad\u653e' : '',
            likes: stat.like ? count(stat.like) : '',
            coins: stat.coin ? count(stat.coin) : '',
            favorites: stat.favorite ? count(stat.favorite) : '',
            danmaku: stat.danmaku ? count(stat.danmaku) : '',
            // Its parts: a one-part video has the one, a series has each (its own `cid` and title).
            parts: (data.pages || []).map((page) => ({
              page: page.page,
              cid: page.cid,
              title: plain(page.part || ''),
              duration: page.duration ? length(page.duration) : '',
            })),
          },
        })
        return
      }
  if (command.action === 'related') {
        // Up next on a video's page: Bilibili's own related videos.
        const data = await api('/x/web-interface/archive/related', { bvid: command.video })
        const items = (Array.isArray(data) ? data : []).filter((item) => item.bvid)
        reply({ videos: items.map(fromItem) })
        return
      }
      if (command.action === 'channel') {
        // An UP \u4e3b's page: who they are, and their videos.
        const mid = command.channel
        const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
        const list = await wbi('/x/space/wbi/arc/search', { mid, ps: 30, pn: page }).catch(() =>
          api('/x/space/wbi/arc/search', { mid, ps: 30, pn: page }),
        )
        const videos = (((list && list.list) || {}).vlist || []).map((video) => ({
          video: video.bvid,
          title: plain(video.title),
          channel: (list && list.list && list.list.vlist && list.list.vlist[0] && list.list.vlist[0].author) || '',
          avatar: null,
          thumbnail: picture(video.pic),
          duration: lengthOf(video.length),
          views: video.play ? count(video.play) + '\u64ad\u653e' : '',
          age: age(video.created),
          live: false,
          channelId: mid,
        }))
        if (command.more) {
          reply({ videos, more: videos.length > 0 ? String(page + 1) : null })
          return
        }
        const card = await api('/x/web-interface/card', { mid })
        const up = (card && card.card) || {}
        reply({
          channel: Object.assign(fromUp({ mid: up.mid, name: up.name, face: up.face, fans: up.fans }), { videos: videos.length + '\u4e2a\u89c6\u9891' }),
          videos,
          more: videos.length > 0 ? '2' : null,
        })
        return
      }
      if (command.action === 'playlist') {
        // A collection (a \u5408\u96c6 or a \u6536\u85cf\u5939): its own videos.
        const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
        let data = null
        try {
          data = await api('/x/v3/fav/resource/list', { media_id: command.playlist, ps: 30, pn: page })
        } catch {
          data = await api('/x/space/fav/season/list', { season_id: command.playlist, ps: 30, pn: page })
        }
        const items = (data && (data.medias || data.list)) || []
        const videos = items
          .filter((item) => item.bvid)
          .map((item) => ({
            video: item.bvid,
            title: plain(item.title),
            channel: (item.upper && item.upper.name) || '',
            avatar: face(item.upper && item.upper.face),
            thumbnail: picture(item.cover),
            duration: lengthOf(item.duration),
            views: '',
            age: age(item.pubtime || item.ctime),
            live: false,
            channelId: item.upper && item.upper.mid ? String(item.upper.mid) : null,
          }))
        reply({ videos, more: videos.length > 0 ? String(page + 1) : null })
        return
      }
      if (command.action === 'profile') {
        // The player's own page: Bilibili's own card for them (its nav answer), their numbers, their level, their
        // coins, and how many 动态 they have and videos they put up.
        const nav = await api('/x/web-interface/nav')
        if (!nav || !nav.isLogin || !nav.mid) {
          reply({ failed: true })
          return
        }
        const mid = String(nav.mid)
        const wallet = nav.wallet || {}
        const stat = await api('/x/relation/stat', { vmid: mid }).catch(() => null)
        let videos = 0
        try {
          const list = await wbi('/x/space/wbi/arc/search', { mid, ps: 1, pn: 1 })
          videos = Number((list && list.page && list.page.count) || 0)
        } catch {}
        reply({
          profile: {
            mid,
            name: nav.uname || '',
            avatar: face(nav.face),
            level: Number((nav.level_info && nav.level_info.current_level) || 0),
            vip: nav.vipStatus === 1 || Boolean(nav.vip && nav.vip.status === 1),
            coins: nav.money === undefined ? '' : String(nav.money),
            bcoins: wallet.bcoin_balance === undefined ? '' : String(wallet.bcoin_balance),
            sign: nav.sign || '',
            videos,
            following: Number((stat && stat.following) || 0),
            followers: Number((stat && stat.follower) || 0),
          },
        })
        return
      }
      if (command.action === 'dynamics') {
        // The player's 动态: Bilibili's own feed of the UP \u4e3bs they follow (all of it, or its videos only),
        // card by card, its next page from the offset this answer gives.
        const offset = command.more || ''
        let data = null
        try {
          data = await wbi('/x/polymer/web-dynamic/v1/feed/all', {
            type: command.video ? 'video' : 'all',
            page: 1,
            offset,
            timezone_offset: -480,
            features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote',
          })
        } catch {
          data = await wbi('/x/polymer/web-dynamic/v1/feed/all', { type: command.video ? 'video' : 'all', page: 1, offset })
        }
        const items = (data && data.items) || []
        const dynamics = items.map((item) => {
          const modules = item.modules || {}
          const author = modules.module_author || {}
          const dynamic = modules.module_dynamic || {}
          const major = dynamic.major || {}
          const archive = major.archive || {}
          const draw = major.draw || {}
          const stat = modules.module_stat || {}
          const counts = (one) => (one && one.count ? count(one.count) : '')
          const pictures = (draw.items || []).map((one) => picture(one.src)).filter(Boolean)
          let video = null
          if (archive.bvid) {
            video = {
              video: archive.bvid,
              title: plain(archive.title),
              channel: author.name || '',
              avatar: face(author.face),
              thumbnail: picture(archive.cover),
              duration: lengthOf(archive.duration_text || archive.duration),
              views: archive.stat && archive.stat.play ? count(archive.stat.play) + '\u64ad\u653e' : '',
              age: age(author.pub_ts),
              live: false,
              channelId: author.mid ? String(author.mid) : null,
            }
          }
          const opus = dynamic.opus || {}
          const words = plain(
            (dynamic.desc && dynamic.desc.text) || (opus && opus.summary && opus.summary.text) || '',
          ).slice(0, 400)
          const action =
            major.type === 'MAJOR_TYPE_ARCHIVE'
              ? '\u6295\u7a3f\u4e86\u89c6\u9891'
              : item.type === 'DYNAMIC_TYPE_FORWARD'
                ? '\u8f6c\u53d1\u4e86\u52a8\u6001'
                : '\u53d1\u5e03\u4e86\u52a8\u6001'
          return {
            id: String(item.id_str || ''),
            author: author.name || '',
            avatar: face(author.face),
            channelId: author.mid ? String(author.mid) : null,
            time: age(author.pub_ts),
            action,
            text: words,
            video,
            pictures,
            forwards: counts(stat.forward),
            comments: counts(stat.comment),
            likes: counts(stat.like),
          }
        })
        const next = data && data.offset ? String(data.offset) : ''
        reply({ dynamics, more: data && data.has_more && next ? next : null })
        return
      }
      if (command.action === 'messages') {
        // The player's messages: how many are unread of each kind, and the rows of the tab asked for. Its chat
        // list is its own summary of what's new (a row per kind); the others are the people's own words.
        const unread = await api('/x/msgfeed/unread').catch(() => null)
        const of = (...names) => {
          for (const name of names) {
            const value = unread && unread[name]
            if (value !== undefined && value !== null) return Number(value) || 0
          }
          return 0
        }
        const numbers = { reply: of('reply'), at: of('at'), like: of('like'), notice: of('sys_msg', 'up', 'recv_like') }
        const tell = () => reply({ messages, unread: numbers })
        let messages = []
        if (command.kind === 'chat') {
          // Its chat list: Bilibili's own rows for what's new (its replies, its @s, its likes, its notices).
          messages = [
            { id: '1', kind: 'notice', name: '\u56de\u590d\u6211\u7684', avatar: null, time: '', text: numbers.reply ? numbers.reply + ' \u6761\u672a\u8bfb' : '\u6ca1\u6709\u65b0\u7684\u56de\u590d', unread: numbers.reply > 0 },
            { id: '2', kind: 'notice', name: '@\u6211\u7684', avatar: null, time: '', text: numbers.at ? numbers.at + ' \u6761\u672a\u8bfb' : '\u6ca1\u6709\u65b0\u7684 @', unread: numbers.at > 0 },
            { id: '3', kind: 'notice', name: '\u6536\u5230\u7684\u8d5e', avatar: null, time: '', text: numbers.like ? numbers.like + ' \u6761\u672a\u8bfb' : '\u6ca1\u6709\u65b0\u7684\u8d5e', unread: numbers.like > 0 },
            { id: '4', kind: 'notice', name: '\u7cfb\u7edf\u901a\u77e5', avatar: null, time: '', text: numbers.notice ? numbers.notice + ' \u6761\u672a\u8bfb' : '\u6ca1\u6709\u65b0\u7684\u901a\u77e5', unread: numbers.notice > 0 },
          ]
          tell()
          return
        }
        if (command.kind === 'reply' || command.kind === 'at') {
          const data = await api(command.kind === 'reply' ? '/x/msgfeed/reply' : '/x/msgfeed/at', { platform: 'web' })
          const items = (data && data.items) || []
          messages = items.slice(0, 30).map((item) => {
            const user = item.user || {}
            const said = item.item || {}
            const reply = item.reply || {}
            const words = plain(
              (reply.content && reply.content.message) || said.source || said.title || '',
            ).slice(0, 200)
            return {
              id: String(item.id || said.business_id || ''),
              kind: command.kind,
              name: user.nickname || '',
              avatar: face(user.avatar),
              time: moment(item.reply_time || item.at_time),
              text: words,
              unread: false,
            }
          })
          tell()
          return
        }
        const data = await api('/x/msgfeed/like', { platform: 'web' })
        const items = (data && data.items) || []
        messages = items.slice(0, 30).map((item) => {
          const users = item.users || []
          const user = users[0] || {}
          const said = item.item || {}
          const name = users.length > 1 ? (user.nickname || '') + ' \u7b49 ' + users.length + ' \u4eba' : user.nickname || ''
          return {
            id: String(item.id || said.business_id || ''),
            kind: 'like',
            name,
            avatar: face(user.avatar),
            time: moment(item.like_time),
            text: plain(said.title || '').slice(0, 200),
            unread: false,
          }
        })
        tell()
        return
      }
      if (command.action === 'comments') {
        // The video's 评论区: its own list, the hottest first (or the newest), a page at a time. Bilibili wants
        // its `aid` there, which the page's own view answer has.
        const aid = await aidOf(String(command.video || ''))
        if (!aid) {
          reply({ failed: true })
          return
        }
        const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
        let data
        try {
          data = await api('/x/v2/reply', {
            type: 1,
            oid: aid,
            sort: command.sort === 'new' ? 0 : 2,
            ps: 20,
            pn: page,
            nohot: 0,
          })
        } catch {
          reply({ failed: true })
          return
        }
        const items = (data && (data.replies || data.reply)) || []
        const comments = items
          .filter((item) => item.rpid)
          .map((item) => {
            const member = item.member || {}
            const content = item.content || {}
            return {
              id: String(item.rpid),
              name: plain(member.uname || ''),
              avatar: face(member.avatar),
              time: moment(item.ctime),
              text: plain(content.message || '').slice(0, 500),
              likes: count(item.like),
              replies: Number(item.rcount) || 0,
            }
          })
        const total = (data && data.page && data.page.count) || 0
        reply({ comments, more: total > page * 20 ? String(page + 1) : null })
        return
      }
      if (command.action === 'library') {
        // The player's own videos: what they watched, what they kept for later, what they favourited (its own
        // default folder), a page at a time.
        const nav = await api('/x/web-interface/nav')
        if (!nav || !nav.isLogin || !nav.mid) {
          reply({ failed: true })
          return
        }
        const mid = String(nav.mid)
        const page = command.more ? Math.max(1, Number(command.more) || 1) : 1
        if (command.kind === 'history') {
          // Its own cursor: the last answer's `max` asks for what comes before it.
          const at = command.more && command.more.includes('=') ? command.more.split('=') : ['0', '0']
          const data = await api('/x/web-interface/history/cursor', { max: at[0], view_at: at[1], ps: 30 })
          const items = (data && data.list) || []
          const videos = items
            .filter((item) => bvidOf(item))
            .map((item) => ({
              video: bvidOf(item),
              title: plain(item.title || item.long_title || ''),
              channel: item.author_name || (item.author && item.author.name) || '',
              avatar: null,
              thumbnail: picture(item.cover),
              duration: lengthOf(item.duration),
              views: '',
              age: '',
              live: false,
              channelId: item.author_mid ? String(item.author_mid) : null,
              at: clock(item.view_at),
            }))
          const cursor = (data && data.cursor) || {}
          reply({ videos, more: cursor.max ? String(cursor.max) + '=' + String(cursor.view_at || 0) : null })
          return
        }
        if (command.kind === 'later') {
          const data = await api('/x/v2/history/toview', { ps: 30, pn: page })
          const items = (data && data.list) || []
          const videos = items.filter((item) => bvidOf(item)).map((item) => ({
            video: bvidOf(item),
            title: plain(item.title),
            channel: (item.owner && item.owner.name) || (item.author && item.author.name) || '',
            avatar: null,
            thumbnail: picture(item.cover),
            duration: lengthOf(item.duration),
            views: '',
            age: '',
            live: false,
            channelId: (item.owner && item.owner.mid) || (item.author && item.author.mid) ? String((item.owner && item.owner.mid) || item.author.mid) : null,
            at: clock(item.add_at),
          }))
          reply({ videos, more: videos.length >= 20 ? String(page + 1) : null })
          return
        }
        // Its favourites: the player's own folders, the first one's videos (Bilibili's own default folder).
        const folders = await api('/x/v3/fav/folder/created/list-all', { up_mid: mid })
        const folder = ((folders && folders.list) || [])[0]
        if (!folder) {
          reply({ videos: [], more: null })
          return
        }
        const data = await api('/x/v3/fav/resource/list', { media_id: folder.id, ps: 20, pn: page, platform: 'web' })
        const items = (data && data.medias) || []
        const videos = items
          .filter((item) => item.bvid)
          .map((item) => ({
            video: item.bvid,
            title: plain(item.title),
            channel: (item.upper && item.upper.name) || '',
            avatar: face(item.upper && item.upper.face),
            thumbnail: picture(item.cover),
            duration: lengthOf(item.duration),
            views: '',
            age: '',
            live: false,
            channelId: item.upper && item.upper.mid ? String(item.upper.mid) : null,
            at: clock(item.fav_time),
          }))
        reply({ videos, more: data && data.has_more ? String(page + 1) : null })
        return
      }
      if (command.action === 'subscribe') {
        // Following an UP \u4e3b, as Bilibili's own button does (it needs the page's own `csrf`).
        const found = document.cookie.match(/bili_jct=([^;]+)/)
        const csrf = found ? found[1] : ''
        await fetch('https://api.bilibili.com/x/relation/modify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ fid: String(command.channel), act: command.on ? '1' : '2', csrf }),
        })
        reply({})
        return
      }
      reply({ failed: true })
    } catch {
      reply({ failed: true })
    }
  }

  // --- Commands ----------------------------------------------------------------------------------------------

  /** What the app asks for in one go (search, feeds): told apart from the player's own commands. */
  const DATA = new Set([
    'search',
    'suggest',
    'related',
    'detail',
    'feed',
    'sections',
    'shelf',
    'channel',
    'subscribe',
    'playlist',
    'profile',
    'dynamics',
    'messages',
    'library',
    'comments',
    'danmaku',
    'sendDanmaku',
  ])

  /** Carries out one of the host's commands. */
  const run = (command) => {
    if (!command || typeof command !== 'object') return
    if (command.action === 'show' || command.action === 'hide' || command.action === 'close') return
    if (command.action === 'crop') {
      document.documentElement.classList.toggle('westplay-crop', Boolean(command.on))
      return
    }
    if (command.action === 'signOut') {
      location.href = 'https://www.bilibili.com/'
      return
    }
    // The truck's own sound (`cab_sound.js`): each command carries its own shape, and the graph
    // takes the values, not the message. `speakers` is the array itself — handing the graph the
    // whole `{action, speakers}` object left it with no speakers to place the sound at, so the
    // video played plainly with nothing wrong in the log (owner 2026-11-25). YouTube's page has
    // always split them this way (`youtube.js`); this one passed the message whole.
    const cab = window.westplayCab
    if (cab) {
      if (command.action === 'speakers') {
        cab.speakers(command.speakers)
        return
      }
      if (command.action === 'outside') {
        cab.outside(command.on, command.distance)
        return
      }
      if (command.action === 'head') {
        cab.head(command)
        return
      }
      if (command.action === 'equalizer') {
        cab.equalizer(command)
        return
      }
      if (command.action === 'spectrum') {
        cab.spectrum(command.on)
        return
      }
    }
    if (DATA.has(command.action)) {
      answer(command)
      return
    }
    const element = player()
    if (command.action === 'load') {
      const part = Number(command.part) || 0
      // The video this page plays may be the season's own episode where the app listed the season
      // (`ss47836` plays as `ep830494`): taking them for different videos reloaded the same page every
      // time the app asked again, so a series never got as far as its picture (owner 2026-11-26:
      // 番剧无法加载). One watch, nothing to load.
      //
      // A **different episode** of that same season is not the same watch, though: `load` with another
      // `ep` is the app's 选集 picking one, and the page has to go there (owner 2026-11-26: "选集还是
      // 有问题" — this test answered "same" for every episode of the season, so picking one did nothing).
      const here = current()
      const same = here === command.video || (sameWatch(here, command.video) && !differentEpisode(here, command.video))
      if (element && same && (!part || part === playingPart())) {
        if (command.start) element.currentTime = command.start
        playIt(element)
      } else {
        watch(command.video, command.start, part)
      }
      return
    }
    if (!element) {
      waiting.push(command)
      return
    }
    if (command.action === 'play') playIt(element)
    else if (command.action === 'pause') element.pause()
    else if (command.action === 'seek') element.currentTime = Number(command.seconds) || 0
    else if (command.action === 'volume') {
      element.volume = Math.min(1, Math.max(0, (Number(command.percent) || 0) / 100))
      element.muted = false
    } else if (command.action === 'rate') element.playbackRate = Math.min(2, Math.max(0.25, Number(command.rate) || 1))
    else if (command.action === 'quality') {
      const qn = QUALITY_NAMES[command.quality]
      if (qn) setQuality(qn)
    }
  }

  window.chrome.webview?.addEventListener?.('message', (event) => run(event.data))
  // 宿主也能直接调：`PostWebMessageAsJson` 在这页未必到得了（SPA 换文档时监听器随之没了），
  // 宿主改用 `ExecuteScript` 调这一个同名入口，两条路走的是同一个 `run`。
  window.westplayRun = (json) => {
    try {
      run(typeof json === 'string' ? JSON.parse(json) : json)
    } catch (error) {
    }
  }
  window.chrome.webview.postMessage({ ready: true })

  // --- How it plays, reported to the host -------------------------------------------------------------------

  // --- The picture's quality ---------------------------------------------------------------------------------

  // Bilibili's own ladder, as its player numbers it (qn): the app's names for the rungs, and its own labels.
  const QUALITY_NAMES = {
    tiny: 16,
    small: 32,
    medium: 64,
    large: 74,
    hd720: 80,
    hd1080: 112,
    hd1440: 116,
    hd2160: 120,
    hd2880: 125,
    highres: 127,
  }
  const QUALITY_LABELS = {
    6: '240P',
    16: '360P',
    32: '480P',
    64: '720P',
    74: '720P60',
    80: '1080P',
    112: '1080P+',
    116: '1080P60',
    120: '4K',
    125: 'HDR',
    126: '\u675c\u6bd4\u89c6\u754c',
    127: '8K',
  }
  const qualityName = (qn) => Object.keys(QUALITY_NAMES).find((name) => QUALITY_NAMES[name] === qn) || ''

  /** The rungs this video offers: the page's own play information, or its usual three when it doesn't say. */
  const qualityOffered = () => {
    const qns = []
    try {
      const info = window.__playinfo__
      const levels = (info && info.data && info.data.dash && info.data.dash.video) || []
      for (const level of levels) if (level && level.id && !qns.includes(Number(level.id))) qns.push(Number(level.id))
    } catch {}
    if (!qns.length) qns.push(80, 64, 32)
    // Only the rungs the app has a name for (its own ladder), highest first.
    return qns.filter((qn) => QUALITY_LABELS[qn] && qualityName(qn)).sort((one, other) => other - one)
  }

  // The rung the app asked for (Bilibili's player keeps its own otherwise).
  let chosenQuality = 0
  const qualityPlaying = () => {
    try {
      const player = window.player
      if (player && typeof player.getQuality === 'function') {
        const qn = Number(player.getQuality())
        if (qn) return qn
      }
    } catch {}
    return chosenQuality || 80
  }

  /** Chosen: the page's own player takes the rung (its player's `setQuality`), and the app hears it next report. */
  const setQuality = (qn) => {
    chosenQuality = qn
    try {
      const player = window.player
      if (player && typeof player.setQuality === 'function') player.setQuality(qn)
    } catch {}
  }

  let last = ''
  let lastAt = 0

  setInterval(() => {
    for (const command of waiting.splice(0)) run(command)
    // On a video's page, its own player is started (the app asked for it before the page went there).
    settleVideo()
    const element = player()
    if (!element) return
    const video = current()
    if (!video) return
    // 0 ended, 1 playing, 2 paused, 3 buffering, -1 unstarted.
    const state = element.ended ? 0 : element.paused ? 2 : element.readyState < 3 ? 3 : 1
    const up = document.querySelector('.up-name, .bpx-player-ctrl-upinfo-name, .username')
    const report = {
      video,
      title: document.title.replace(/_\u54d4\u54e9\u54d4\u54e9_bilibili$/, '').trim(),
      author: up ? up.textContent.trim() : '',
      live: location.hostname.startsWith('live.'),
      state,
      time: Math.round((element.currentTime || 0) * 10) / 10,
      duration: Number.isFinite(element.duration) ? Math.round(element.duration) : 0,
      volume: element.muted ? 0 : Math.round((element.volume === undefined ? 1 : element.volume) * 100),
      ad: false,
      captions: [],
      caption: null,
      qualities: qualityOffered().map((qn) => ({ quality: qualityName(qn), label: QUALITY_LABELS[qn] })),
      quality: qualityName(qualityPlaying()),
      qualityLabel: QUALITY_LABELS[qualityPlaying()] || '',
      rates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      rate: element.playbackRate || 1,
      audioTracks: [],
      audioTrack: null,
      stableVolume: null,
      voiceBoost: null,
      cabLevel: null,
      diag: null,
      picture: null,
    }
    const text = stringify(Object.assign({}, report, { time: undefined }))
    const now = Date.now()
    if (text !== last || (state === 1 && now - lastAt >= 1000)) {
      last = text
      lastAt = now
      window.chrome.webview.postMessage(report)
    }
  }, 250)

  // --- Signed in, and the picture for it --------------------------------------------------------------------

  let accountTold = false
  const tellAccount = async () => {
    accountTold = true
    try {
      const data = await api('/x/web-interface/nav')
      const signedIn = Boolean(data && data.isLogin)
      const avatar = signedIn ? picture(data.face) : null
      // The player's own names (their page's header), and their `mid` (their videos' page).
      const name = signedIn ? data.uname || '' : ''
      const mid = signedIn && data.mid ? String(data.mid) : null
      window.chrome.webview.postMessage({ account: { signedIn, avatar, name, mid } })
    } catch {
      // Not signed in, or Bilibili didn't answer: told so, and the app shows its sign-in.
      window.chrome.webview.postMessage({ account: { signedIn: false, avatar: null, name: '', mid: null } })
    }
  }

  // Once the page is up: who's signed in (Bilibili's own nav answer).
  const settle = () => {
    if (document.readyState === 'loading') return
    if (!accountTold) tellAccount()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', settle, { once: true })
  else settle()
  setInterval(settle, 2000)
})()
