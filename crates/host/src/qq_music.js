// WestPlay's own QQ Music home: a hidden page that answers the cabin app's questions from the local QQ
// middle layer (L-1124/QQMusicApi on the loopback). The login credential stays in the layer's account pool;
// this page only asks for what the app shows (names, covers, songs, words). Playing resolves a stream URL
// through the pool credential and plays it in a hidden <audio> element here, reporting what plays back.
//
// Messages in (from the host, as `qqMusic`): {action:'ask', id, question} and the player's controls.
// Messages out: {ready:true}, {signedIn, playing, avatar}, {answer:id, <ask>:…} / {answer:id, failed:true},
// {playback:…|null}.

(function () {
  const post = (message) => window.chrome?.webview?.postMessage(message)

  // --- Small helpers ----------------------------------------------------------------------------------------

  const escapeHtml = (text) =>
    String(text ?? '')
      .replace(/<em>/gi, '')
      .replace(/<\/em>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()

  const singers = (song) =>
    (song?.singer ?? [])
      .map((each) => each?.name ?? '')
      .filter(Boolean)
      .join(' / ')

  // QQ's album cover CDN, keyed by the album mid (verified 200 image/jpeg, 2026-11-14).
  const coverOf = (albumMid) =>
    albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg` : null

  const track = (song) => {
    const album = song?.album ?? {}
    const albumMid = album.mid || null
    // QQ sometimes sends a negative placeholder (e.g. -31073) for the album index; treat that as "no number".
    const rawIndex = Number(song?.index_album)
    const number = Number.isFinite(rawIndex) && rawIndex >= 0 ? song?.index_album : null
    return {
      id: song?.mid ?? '',
      name: escapeHtml(song?.name || song?.title),
      artist: singers(song),
      album: escapeHtml(album.name),
      albumId: albumMid,
      artistId: song?.singer?.[0]?.mid || null,
      image: coverOf(albumMid),
      color: '#2c2c2e',
      duration: Number(song?.interval) || 0,
      explicit: false,
      number,
    }
  }

  // One bad row must not sink a whole list: fall back to a bare placeholder instead of throwing.
  const safeTrack = (song) => {
    try {
      return track(song)
    } catch {
      return {
        id: song?.mid ?? '',
        name: '',
        artist: '',
        album: '',
        albumId: null,
        artistId: null,
        image: null,
        color: '#2c2c2e',
        duration: 0,
        explicit: false,
        number: null,
      }
    }
  }

  // Page through a song-list endpoint until it reports no more (or a safety cap). Returns every song plus
  // the first page's header metadata (`info`). `key`: the song array's field name (`songs` for playlists,
  // `song_list` for artists/albums); those also cap at `total_num`.
  /**
   * Every song a list answers, a page at a time, up to `MAX_PAGES`. A page that fails ends the walk
   * with what came before it: these lists don't say how long they are (`total_num` and `hasmore` come
   * back empty), so the walk goes on until one comes back empty — and the layer answers some of the
   * later pages for a chart with 500 (past the songs it has), which used to take the whole answer
   * down with it and showed the app a list it couldn't load (owner 2026-11-16).
   */
  const MAX_PAGES = 10
  /**
   * A list that comes whole in one answer.
   *
   * The site's own playlist endpoint (`/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg`) answers every
   * song at once and reads no `num` or `page` — 559 of them on one tried. Walking pages against it
   * asked for the same 559 thirteen times over (fast, but the app was handed a list thirteen times
   * the size it has, and the answer took long enough that the page gave up on it first: 2026-11-27).
   */
  const wholeList = (path, key = 'songs') => {
    // These answer their whole list at once, and read no `num` or `page`: walking pages against
    // them repeats the same list until the cap.
    if (path.startsWith('/songlist/')) return path
    if (path.startsWith('/top/')) return path
    if (path.includes('/fav/songs')) return path
    return null
  }

  const fetchAllSongs = async (path, key = 'songs') => {
    // A list the site answers whole: asked once, nothing paged.
    const whole = wholeList(path)
    if (whole) {
      const found = await get(whole)
      // A playlist answers its songs inside `cdlist[0]`; the account's own lists (a route of
      // `mine`'s) hand the songs and their header back already.
      const listed = (found.cdlist ?? [])[0]
      if (listed) {
        return {
          songs: listed.songlist ?? [],
          info: {
            // The id the app asked with, not the answer's `dissid`: that comes back as a number,
            // and a ten-digit one loses its end (`4945887682` → `4945887`), so the page could not
            // open the list it had just been handed (2026-11-27).
            id: new URLSearchParams(whole.split('?')[1] ?? '').get('disstid') ?? listed.dissid ?? listed.disstid,
            title: listed.dissname,
            desc: listed.desc,
            picurl: listed.logo,
            creator_nick: listed.nickname ?? listed.creator?.nick,
          },
        }
      }
      // A chart answers its songs as `songlist`, with its own header in `topinfo`.
      return {
        songs: found[key] ?? found.songs ?? found.songlist ?? [],
        info: found.info ?? found.topinfo ?? {},
      }
    }

    const all = []
    let info = {}
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      let f
      try {
        f = await get(`${path}${path.includes('?') ? '&' : '?'}num=100&page=${page}`)
      } catch (error) {
        // A page past the list's end (the layer's own 500) or a dropped connection: what came
        // before it is the answer.
        if (page === 1) throw error
        break
      }
      info = f.info ?? info
      const songs = f[key] ?? []
      all.push(...songs)
      const total = f.total_num
      if (songs.length === 0) break
      if (f.hasmore === false) break
      if (total != null && all.length >= total) break
    }
    return { songs: all, info }
  }

  const playlistItem = (list) => ({
    id: String(list?.id ?? ''),
    kind: 'playlist',
    name: escapeHtml(list?.title),
    by: escapeHtml(list?.creator_nick ?? list?.creator?.nick ?? list?.nickname ?? ''),
    note: escapeHtml(list?.desc ?? ''),
    image: list?.picurl ?? null,
    wide: null,
    color: '#2c2c2e',
    explicit: false,
    live: false,
  })

  /** A chart of the official lists (`top`): played by its number (`top/{id}/detail`). */
  const chartItem = (chart) => ({
    id: String(chart?.id ?? ''),
    kind: 'top',
    name: escapeHtml(chart?.name || chart?.title_detail),
    by: escapeHtml(chart?.title_sub ?? ''),
    note: escapeHtml(chart?.intro ?? '').replace(/<[^>]+>/g, ' ').slice(0, 120),
    image: chart?.front_pic_url || chart?.head_pic_url || null,
    wide: null,
    color: '#2c2c2e',
    explicit: false,
    live: false,
  })

  const artistItem = (singer) => ({
    id: singer?.mid ?? String(singer?.id ?? ''),
    kind: 'artist',
    name: escapeHtml(singer?.name || singer?.title),
    by: escapeHtml(singer?.subtitle ?? ''),
    note: '',
    image: singer?.pic ?? null,
    wide: null,
    color: '#2c2c2e',
    explicit: false,
    live: false,
  })

  const albumItem = (album) => ({
    id: album?.mid ?? String(album?.id ?? ''),
    kind: 'album',
    name: escapeHtml(album?.name || album?.title),
    by: escapeHtml(album?.singer_list?.[0]?.name ?? album?.singer ?? ''),
    note: escapeHtml(album?.description ?? ''),
    image: album?.pic ?? null,
    wide: null,
    color: '#2c2c2e',
    explicit: false,
    live: false,
  })

  // --- The local middle layer -------------------------------------------------------------------------------

  // The session credential captured after a successful QR scan, kept only in this hidden page's memory. The
  // layer prefers a request's own cookie credential over its shared pool, so we re-send it as a Cookie header.
  let savedCred = null
  // The raw cookie string captured by the desktop sign-in window (y.qq.com), kept in this page's memory.
  let savedCookie = ''

  // The session credential is persisted to this hidden page's WebView2 profile so a WestPlay restart (or a
  // page reload) keeps the signed-in session without a fresh QR scan. It lives only on this machine's profile.
  const CRED_KEY = 'westplay-qq-cred'
  const saveCredential = () => {
    try {
      localStorage.setItem(CRED_KEY, JSON.stringify({ cookie: savedCookie, cred: savedCred }))
    } catch {
      // Storage unavailable (private mode etc.): keep the in-memory copy only.
    }
  }
  const restoreCredential = () => {
    try {
      const raw = localStorage.getItem(CRED_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      savedCookie = typeof data.cookie === 'string' ? data.cookie : ''
      savedCred = data.cred ?? null
    } catch {
      // Stale or unreadable: start signed out.
    }
  }
  restoreCredential()

  /**
   * The page's own cookies, plus the names only the saved copy has.
   *
   * On the site's own origin (`qq_music.rs` loads y.qq.com now) the browser keeps the account's
   * cookies itself, and the host puts the kept session's ones in that jar as it hands them over
   * (`apply_cookies`), so `credentials: 'include'` sends them. What `document.cookie` shows is still
   * short of them: `uin`, `qm_keyst` and `euin` are `HttpOnly` on the site, so the page's own
   * string has every cookie but those, and the saved copy (the sign-in window's) is where they are
   * read. Both are therefore read — the page's own value wherever it has one, the saved copy's for
   * the rest. Before, the page's own string shadowed the saved one as soon as it was non-empty
   * (which on `y.qq.com` is always), `uin` came back empty and `qqmine` asked the site with
   * `uin: '0'` — answered `80030`, which took the whole "我的" page down (2026-11-27).
   */
  const siteCookie = () => {
    const own = document.cookie || ''
    const saved = savedCookie || ''
    if (!saved) return own
    if (!own) return saved
    const named = new Set()
    for (const pair of own.split(';')) {
      const name = pair.split('=')[0].trim()
      if (name) named.add(name)
    }
    const extra = saved
      .split(';')
      .map((pair) => pair.trim())
      .filter((pair) => pair && !named.has(pair.split('=')[0].trim()))
    return extra.length > 0 ? `${own}; ${extra.join('; ')}` : own
  }

  const cookieValue = (name) => {
    const from = siteCookie()
    if (!from) return ''
    const match = from.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    if (!match) return ''
    // A cookie value isn't always URL-encoded, and `%` in one (a key can have it) makes
    // `decodeURIComponent` throw — which took the whole credential with it, leaving every request
    // anonymous (owner 2026-11-16: a signed-in player's songs answered "no stream", the VIP ones as
    // 104003; the log's `cred: NONE | cookie keys: 25` is exactly that).
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }

  /**
   * The account's own number, from whichever cookie carries it (`''` when the page has none).
   *
   * Never `'0'`: the site reads zero as "there is no such account" and answers `80030` instead of
   * the account's lists (checked 2026-11-27), where an empty `uin` is what makes it fall back to
   * the cookie it was sent and answer them properly.
   */
  const accountUin = () => cookieValue('uin') || cookieValue('musicid') || ''

  // The sign-in window returns y.qq.com's own cookie names (uin / qm_keyst / euin / psrf_qqopenid, ...).
  // The local layer's credential parser only reads its own names (musicid / musickey / str_musicid / ...),
  // so map the web cookie onto those credential fields.
  const credentialPairs = () => {
    try {
      return credentialPairsOf()
    } catch {
      // A value that doesn't read leaves the account signed out rather than the page broken.
      return []
    }
  }

  const credentialPairsOf = () => {
    if (savedCookie) {
      const musicid = cookieValue('uin') || cookieValue('musicid')
      const musickey = cookieValue('qm_keyst') || cookieValue('qqmusic_key')
      if (!musicid || !musickey) return []
      return [
        ['musicid', musicid],
        ['musickey', musickey],
        ['str_musicid', cookieValue('euin') || cookieValue('str_musicid')],
        ['openid', cookieValue('psrf_qqopenid') || cookieValue('openid')],
        ['refresh_token', cookieValue('psrf_qqrefresh_token') || cookieValue('refresh_token')],
        ['access_token', cookieValue('psrf_qqaccess_token') || cookieValue('access_token')],
        ['expired_at', cookieValue('psrf_access_token_expiresAt') || cookieValue('expired_at')],
        ['unionid', cookieValue('psrf_qqunionid') || cookieValue('unionid')],
      ].filter(([, value]) => value)
    }
    if (savedCred) {
      return [
        ['musicid', savedCred.musicid],
        ['musickey', savedCred.musickey],
        ['openid', savedCred.openid],
        ['refresh_token', savedCred.refresh_token],
        ['access_token', savedCred.access_token],
        ['expired_at', savedCred.expired_at],
        ['unionid', savedCred.unionid],
        ['str_musicid', savedCred.str_musicid],
        ['refresh_key', savedCred.refresh_key],
      ].filter(([, value]) => value != null && value !== '')
    }
    return []
  }

  // A browser fetch silently drops a manually-set `Cookie` header (forbidden header name), so the
  // credential primarily travels in `X-Qq-*` custom headers; the Cookie string is kept as a fallback only.
  const credentialHeaders = () => {
    const headers = {}
    const pairs = credentialPairs()
    for (const [name, value] of pairs) {
      headers[`X-Qq-${name.replace(/_/g, '-')}`] = String(value)
    }
    const cookie = pairs.map(([name, value]) => `${name}=${value}`).join('; ')
    if (cookie) headers.Cookie = cookie
    // The site's own cookie, as the sign-in window returned it (`uin`, `qqmusic_key`, `qm_keyst`,
    // …): `run_westplay.py`'s /westplay/song_url asks the site with *these* names, since the
    // layer's mapped pair above means nothing to y.qq.com (owner 2026-11-20).
    if (savedCookie) headers['X-Westplay-Site-Cookie'] = savedCookie
    return headers
  }

  /**
   * A middle-layer request. `options.anon`: made without the account's credential, for the site's
   * own list for everyone (which a signed-in request no longer answers with: see `home`).
   */
  /**
   * One of the site's own answers, asked of the site itself.
   *
   * This used to ask a middle layer (`qq-music-layer`, a Python process answering a made-up API on
   * the loopback) with the same paths below. Two of that layer's answers could not be fixed from
   * here — a playlist's songs came back thirty at a time (`num=30` written in its own query) and a
   * song's stream was asked without the file's name (the site reads that as an account with no
   * rights, `result` 104003) — because the layer is compiled and its sources aren't ours.
   *
   * The paths stay: the app asks for the same shapes either way, so everything that parses what
   * comes back is untouched. What changed is who answers.
   */
  const get = async (path, options = {}) => {
    const [route, search = ''] = path.split('?')
    const params = new URLSearchParams(search)
    const asking = ROUTES[route] ?? ROUTES_BY_ID(route)
    if (!asking) throw new Error(`no route for ${route.split('/').slice(0, 2).join('/')}`)
    // The site's own names for a feed's parts, as the readers here expect them (`named`).
    return named(await asking(route, params, options))
  }

  // --- The site's own endpoints -----------------------------------------------------------------
  //
  // y.qq.com answers from three places, and each question goes to the one that has it:
  //
  //   c.y.qq.com   the older `fcg`-style endpoints (search, a playlist's songs, lyrics, the charts):
  //                JSON, asked with the page's own referer
  //   u.y.qq.com   `cgi-bin/musicu.fcg`, one endpoint for every different part of the site — the
  //                account, a song's stream, the home feed — each question naming its `module` and
  //                `method`
  //
  // Checked 2026-11-26 against a signed-in account: a playlist's 559 songs come back in a single
  // answer, where the layer stopped at thirty.

  /** A `GET` answered as JSON, with the account's own headers (`anon`: without them). */
  const site = async (address, asked = {}) => {
    // `include`: the page is on the site's own origin now (`qq_music.rs` loads y.qq.com rather
    // than a blank document), so the browser sends the account's cookie by itself — the way
    // Bilibili's page does it (`bilibili.js`). The `X-Qq-*` headers stay for the layer's paths
    // that still read them.
    // No `X-Qq-*` headers any more: they were the middle layer's way of being told who asked, and
    // the site refuses a cross-origin request that carries them (its CORS answer allows only the
    // simple ones, so the preflight is denied and the request never leaves — `Failed to fetch`,
    // checked 2026-11-27). On the site's own origin the cookie says who asked.
    const answer = await fetch(address, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    })
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`)
    return answer.json()
  }

  /**
   * One `musicu.fcg` question: `module` and `method` name the part of the site, `param` its own
   * arguments. The answer comes back under `req`, with its `data` inside.
   */
  const musicu = async (module, method, param = {}, asked = {}) => {
    const answer = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      credentials: 'include',
      // `content-type: application/json` is itself a preflighted header, but the site allows that
      // one; the `X-Qq-*` pair is what it doesn't (see `site`).
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        comm: { ct: '19', cv: '1859', uin: cookieValue('uin') || '0' },
        req: { module, method, param },
      }),
    })
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`)
    const body = await answer.json()
    const req = body.req ?? {}
    if (req.code !== undefined && req.code !== 0) throw new Error(`site code ${req.code}`)
    return req.data ?? {}
  }

  /** `c.y.qq.com` with the page's own referer (the site answers nothing without one). */
  const cgi = async (route, params, asked = {}) => {
    const query = params.toString()
    const body = await site(`https://c.y.qq.com${route}${query ? `?${query}` : ''}`, asked)
    // The `fcg` endpoints wrap their own answer in `data`, which is what the middle layer passed on
    // unwrapped; the readers here were written against that.
    return body?.data ?? body
  }

  /**
   * A song's stream: the address its sound plays from.
   *
   * Answered in the shape the player reads (`[{ result, purl, filename }]`, the middle layer's own:
   * a song the account may not play has `result` 104003 and no `purl`, and that is what tells a
   * pay-walled song from a broken one).
   */
  const streamAnswer = async (mid) => {
    const found = await musicu('vkey.GetVkeyServer', 'CgiGetVkey', {
      guid: '10000',
      songmid: [mid],
      songtype: [0],
      // The file's own name: without it the site reads the request as an account with no rights
      // (`result` 104003, what VIP songs answered to the layer's way of asking).
      filename: [`M500${mid}${mid}.mp3`],
      uin: cookieValue('uin') || '0',
      loginflag: 1,
      platform: '20',
    })
    const info = (found.midurlinfo ?? [])[0] ?? {}
    // The site names its CDNs with `http://` only, and this page is `https://` — a stream asked
    // over `http://` from an `https://` document is refused as mixed content before a byte of it is
    // read (owner 2026-11-27: "放不了"). The same hosts answer `https://`; that is what is used.
    const host = String((found.sip ?? [])[0] ?? '').replace(/^http:\/\//, 'https://')
    return [
      {
        result: info.result ?? 0,
        purl: info.purl ?? '',
        filename: info.filename ?? '',
        // The CDN the site names, so the page needn't guess one.
        sip: host,
      },
    ]
  }

  /**
   * The site's own names for what a feed holds, as the names the parsing below reads.
   *
   * The middle layer answered with these renamed (`v_shelf` → `shelves`, `v_niche` → `niches`,
   * `v_card` → `cards`), and everything that draws a feed was written against that: reading the
   * site's answer directly left every shelf empty and the app's home blank (found 2026-11-27).
   * Rather than teach every reader the site's names, the one place that asks renames them back.
   */
  /**
   * One song, with the names the readers here use.
   *
   * The site names a song's own fields with its kind in them (`songmid`, `songname`, `albummid`,
   * `albumname`, `singer`), and its album as `album`, an object with `mid` and `name`; the middle
   * layer renamed them (`mid`, `name`, `album.mid`), and every reader was written against that.
   */
  const songNamed = (song) => {
    if (!song || typeof song !== 'object') return song
    if (song.mid === undefined && song.songmid !== undefined) song.mid = song.songmid
    if (song.name === undefined && song.songname !== undefined) song.name = song.songname
    if (song.title === undefined && song.songname !== undefined) song.title = song.songname
    if (song.album === undefined || typeof song.album !== 'object') {
      song.album = {
        mid: song.albummid ?? song.album?.mid ?? null,
        name: song.albumname ?? song.album?.name ?? '',
      }
    }
    return song
  }

  /** Every song of a list, as `songNamed` gives them. */
  const songsNamed = (list) => (Array.isArray(list) ? list.map(songNamed) : list)

  const named = (data) => {
    if (!data || typeof data !== 'object') return data
    // A list of songs, whatever part of the site answered it.
    for (const key of ['songs', 'song_list', 'songlist', 'songlists']) {
      if (Array.isArray(data[key])) data[key] = songsNamed(data[key])
    }
    // A chart (`fcg_v8_toplist_cp`) names its songs `songlist`; the readers here ask for `songs`
    // (that is what `fetchAllSongs` is handed as its key).
    if (!Array.isArray(data.songs) && Array.isArray(data.songlist)) {
      data.songs = data.songlist
    }
    // A playlist's songs come inside `cdlist[0].songlist`.
    if (Array.isArray(data.cdlist)) {
      for (const one of data.cdlist) {
        if (one && Array.isArray(one.songlist)) one.songlist = songsNamed(one.songlist)
      }
    }
    if (Array.isArray(data.v_shelf)) {
      data.shelves = data.v_shelf.map((shelf) => {
        if (shelf && Array.isArray(shelf.v_niche)) {
          shelf.niches = shelf.v_niche.map((niche) => {
            if (niche && Array.isArray(niche.v_card)) niche.cards = niche.v_card
            return niche
          })
        }
        return shelf
      })
    }
    return data
  }

  /**
   * The paths the app asks for, each as the site's own question.
   *
   * A path with an id in it (`song/list/{mid}/detail`) is matched on its first two segments and the
   * id read off the third: one entry answers every song, whatever its mid.
   */
  /**
   * The chart the app's `猜你喜欢` plays from.
   *
   * The site's radar isn't one of the `fcg` endpoints, and its own answer is a page of shelves
   * rather than a list of songs. The 飙升 chart is the closest of the site's own: the hundred songs
   * it has picked lately, as one list — which is what the app's card does with it.
   */
  const RADAR_TOP_ID = 62
  /** 巅峰榜·热歌 (the site's own chart number, from its charts list): the songs `热歌` shows. */
  const HOT_TOP_ID = 26
  /** 巅峰榜·新歌: what 新歌 shows, the chart that answers the card of the same name on the site. */
  const NEW_TOP_ID = 27

  /** How many of a chart's songs one page of `fetchRadar` brings. */
  const RADAR_PAGE_SIZE = 20

  /** A recommended-playlists answer's lists, whichever shape the site used. */
  const playedLists = (found) =>
    found.songlist ?? found.v_playlist ?? found.data?.songlist ?? found.data?.list ?? []

  const ROUTES = {
    '/recommend/get_home_feed': (_route, _params, asked) =>
      musicu('music.recommend.RecommendFeed', 'get_recommend_feed', { direction: 0, page: 0 }, asked),
    // The radar's picks (`猜你喜欢`): a chart of its own, by its number, the way the site's page
    // asks for it.
    '/recommend/get_radar_recommend': async (_route, params) => {
      const page = Number(params.get('page') ?? 1)
      const found = await cgi(
        '/v8/fcg-bin/fcg_v8_toplist_cp.fcg',
        new URLSearchParams({ format: 'json', topid: String(RADAR_TOP_ID) }),
      )
      // A chart's songs come wrapped: each entry is the song's rank (`cur_count`, `in_count`) with
      // the song itself under `data`. `named` gives that one its fields.
      const all = (found.songlist ?? []).map((one) => one?.data ?? one)
      // One chart, cut into pages here: the chart endpoint answers the whole list at once, and the
      // reader walks pages until one brings nothing new (`fetchRadar`).
      const from = (page - 1) * RADAR_PAGE_SIZE
      const slice = all.slice(from, from + RADAR_PAGE_SIZE)
      return { songs: slice, has_more: slice.length === RADAR_PAGE_SIZE }
    },
    // The playlist wall (`推荐歌单`): the site's own lists of the 歌单广场, a page of them at a time.
    '/recommend/get_recommend_songlist': async (_route, params) => {
      // The endpoint this used to read (`fcg_v8_splcomm_rec.fcg`) answers 404 now (checked
      // 2026-11-28); the wall is the one its own 歌单广场 page asks for, which needs the site's
      // referer — sent by the browser, the page being on y.qq.com.
      const found = await cgi(
        '/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg',
        new URLSearchParams({
          format: 'json',
          categoryId: params.get('categoryId') ?? '10000000',
          sortId: params.get('sortId') ?? '5',
          sin: params.get('sin') ?? '0',
          ein: params.get('num') ?? '10',
        }),
      )
      // Its own names (`dissid`, `dissname`, `imgurl`, `listennum`), as `playlistItem` reads them.
      const lists = playedLists(found).map((one) => ({
        id: String(one.dissid ?? one.id ?? ''),
        title: one.dissname ?? one.name ?? '',
        creator_nick: one.creator?.name ?? one.nickname ?? '',
        desc: one.introduction ?? one.desc ?? '',
        picurl: String(one.imgurl ?? one.picurl ?? '').replace(/^http:\/\//, 'https://'),
        listen_num: one.listennum ?? 0,
      }))
      return { songlists: lists }
    },
    '/recommend/get_recommend_newsong': (_route, _params, asked) =>
      musicu('music.recommend.RecommendFeed', 'get_recommend_feed', { direction: 0, page: 0 }, asked),
    '/recommend/get_guess_recommend': (_route, _params, asked) =>
      musicu('music.recommend.RecommendFeed', 'get_recommend_feed', { direction: 0, page: 0 }, asked),
    // The charts: the site's own list of them, as `{ group: [{ name, toplist }] }` — one group,
    // which is how the middle layer answered too (`fcg_myqq_toplist.fcg` names its own list
    // `topList`, and every entry is a chart of songs).
    '/top/get_category': async () => {
      const found = await cgi(
        '/v8/fcg-bin/fcg_myqq_toplist.fcg',
        new URLSearchParams({ format: 'json' }),
      )
      // The site answers under `data` here (the `fcg` endpoints wrap their own answer).
      const lists = found.topList ?? []
      return {
        group: [
          {
            name: '排行榜',
            // `chartItem` reads `id`, `name` and the picture by those names; the chart endpoint
            // calls them `id`, `topTitle` and `picUrl` (an `http://` address, which an `https://`
            // page can't load — asked over `https://` instead).
            toplist: lists.map((one) => ({
              ...one,
              id: String(one.topId ?? one.id ?? ''),
              name: one.topTitle ?? one.title ?? '',
              title_sub: one.topTitle ?? one.title ?? '',
              intro: one.intro ?? '',
              front_pic_url: String(one.frontPicUrl ?? one.picUrl ?? one.headPicUrl ?? '').replace(
                /^http:\/\//,
                'https://',
              ),
            })),
          },
        ],
      }
    },
    '/search/get_hotkey': () =>
      cgi('/splcloud/fcgi-bin/gethotkey.fcg', new URLSearchParams({ format: 'json' })),
    '/search/general_search': (_route, params, asked) =>
      cgi(
        '/soso/fcgi-bin/client_search_cp',
        new URLSearchParams({
          format: 'json',
          n: params.get('num') ?? '15',
          p: '1',
          w: params.get('keyword') ?? '',
        }),
        asked,
      ),


  }

  /** The paths with an id in them, matched on their first two segments. */
  const ROUTES_BY_ID = (route) => {
    const parts = route.split('/').filter(Boolean)
    // The last segment names the question (`detail`, `songs`, `lyric`, `url`), and the one before
    // it is the id: `/songlist/{id}/detail`, `/song/{mid}/lyric`. (`head` was the first two
    // segments — `/songlist/{id}` — which matched nothing, so a playlist, an album and a singer
    // each fell through to "no route" and the page gave up on a question it could answer:
    // 2026-11-27.)
    const kind = parts[0] ?? ''
    const last = parts[parts.length - 1] ?? ''
    const id = parts.length >= 3 ? parts[1] : ''

    // `/user/{euin}/homepage`, `/user/{euin}/fav/songlists`, `/user/{uin}/created_songlists`: the
    // account the page is signed in as, whichever of its own ids the app asked with.
    if (parts[0] === 'user') {
      if (parts[2] === 'homepage') {
        return () => musicu('music.UserInfo.userInfoServer', 'GetLoginUserInfo', {})
      }
      if (parts[2] === 'fav' && parts[3] === 'songlists') {
        return async () => {
          // `GetPlaylistFavInfo`, not `CgiGetPlaylistFavInfo`: the `Cgi` one answers `80050` with a
          // single junk row whatever the account has (checked 2026-11-27).
          const found = await musicu('music.musicasset.PlaylistFavRead', 'GetPlaylistFavInfo', {
            uin: accountUin(),
          })
          // The site's own favourite lists, in the app's card shape (`playlistItem`'s names).
          return {
            playlists: (found.v_list ?? []).map((one) => ({
              id: String(one.tid ?? one.dissid ?? ''),
              title: one.name ?? one.dirName ?? one.dissname ?? one.title ?? '',
              picurl: String(one.logo ?? one.picUrl ?? '').replace(/^http:\/\//, 'https://') || null,
              desc: '',
              creator_nick: one.nickname ?? '',
            })),
          }
        }
      }
      if (parts[2] === 'created_songlists') {
        return async () => {
          const found = await musicu('music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', {
            uin: accountUin(),
          })
          const ours = (found.v_playlist ?? []).filter(
            (one) => one.dirShow !== 0 && one.tid !== undefined,
          )
          // The names `playlistItem` reads (`id`, `title`, `picurl`, `creator_nick`): the app's
          // own card shape, which the middle layer answered in.
          return {
            playlists: ours.map((one) => ({
              id: String(one.tid),
              title: one.dirName,
              picurl: String(one.picUrl ?? one.bigpicUrl ?? '').replace(/^http:\/\//, 'https://') || null,
              desc: '',
              creator_nick: '',
            })),
          }
        }
      }
      if (parts[2] === 'fav' && parts[3] === 'songs') {
        return async () => {
          // The song list of 我喜欢: a folder of the account's whose tid is its own.
          const found = await musicu('music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', {
            uin: accountUin(),
          })
          const loved = (found.v_playlist ?? []).find((one) => one.dirId === 201)
          if (!loved) return { songs: [], info: { owner: {} } }
          const list = await get(`/songlist/${loved.tid}/detail`)
          const listed = (list.cdlist ?? [])[0] ?? {}
          return {
            songs: listed.songlist ?? list.songlist ?? [],
            // The list's own owner (`nickname`, `headurl`) is the account's name and picture, which
            // `music.UserInfo.userInfoServer` `GetLoginUserInfo` — what `homepage` asks — answers
            // `1000` for (a login the site no longer honours, while this list answers anyone). It
            // rides in `info`, the one field `fetchAllSongs` carries back (2026-11-27).
            info: { owner: { nickname: listed.nickname ?? '', headurl: listed.headurl ?? '' } },
          }
        }
      }
    }
    if (kind === 'song' && last === 'detail') {
      return async () => {
        const found = await musicu('music.pf_song_detail_svr', 'get_song_detail', { song_mid: id })
        // The site answers a song under `track_info` (`mid`, `name`, `singer`, `album`,
        // `interval`); the readers here ask for it as `track`, and `named` gives its own fields
        // their names (see `songNamed`).
        const track = found.track_info ?? found.track ?? found
        return { track: songNamed(track) }
      }
    }
    if (kind === 'song' && last === 'lyric') {
      return () =>
        cgi(
          '/lyric/fcgi-bin/fcg_query_lyric_new.fcg',
          new URLSearchParams({ songmid: id, format: 'json', nobase64: '1', g_tk: '5381' }),
        )
    }
    if (kind === 'song' && last === 'url') return () => streamAnswer(id)
    if (kind === 'songlist' && last === 'detail') {
      // A playlist, every song of it in one answer — the site's own `/qzone` endpoint, which takes
      // no `num`: this is where the layer stopped at thirty.
      return () =>
        cgi(
          '/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg',
          new URLSearchParams({
            type: '1',
            json: '1',
            utf8: '1',
            onlysong: '0',
            disstid: id,
            format: 'json',
          }),
        )
    }
    if (kind === 'album' && last === 'songs') {
      return () => musicu('music.musichallAlbum.AlbumInfoServer', 'GetAlbumDetail', { album_mid: id })
    }
    if (kind === 'top' && last === 'detail') {
      // A chart by its number: the songs are `songlist`, each a rank with the song under `data`.
      return async () => {
        const found = await cgi(
          '/v8/fcg-bin/fcg_v8_toplist_cp.fcg',
          new URLSearchParams({ format: 'json', topid: id }),
        )
        return {
          ...found,
          songs: (found.songlist ?? []).map((one) => one?.data ?? one),
        }
      }
    }
    if (kind === 'singer' && last === 'songs') {
      return () =>
        musicu('music.musichallSinger.SingerInfoInter', 'GetSingerDetail', { singer_mid: id })
    }
    return null
  }

  // --- The app's questions ----------------------------------------------------------------------------------

  /**
   * A card of the account's own home feed (`/recommend/get_home_feed`, the shelves the site builds
   * for whoever is signed in: 今日为你打造, 终于等到你, 你的歌单补给站 and the rest), as one of the app's
   * own cards. Its `type` says what it is: 200 a song (by its `subid`, a mid), 500 a playlist, 1000 a
   * chart, 400 a podcast; anything else has no page of the app's to open and is left out.
   */
  /** A card of a shelf the site builds itself (`id` 0): its own name and cover, its page shared. */
  const card0 = (name, by, image) => ({
    id: 'qqdaily',
    name,
    by,
    note: '',
    image,
    wide: null,
    color: '#2c2c2e',
    explicit: false,
    live: false,
  })

  const feedCard = (card) => {
    const type = Number(card?.type)
    const cover = card?.cover ?? null
    const title = escapeHtml(card?.title ?? '')
    const by = escapeHtml(card?.subtitle ?? '')
    // The site's own links (a web address) have no page of the app's: left out.
    const realId = String(card?.id ?? '')
    if (!/^\d+$/.test(realId)) return null
    // A slot with no list of its own (`id` 0: 每日30首, 百万收藏, 歌手漫游 and the like — the site
    // builds what's inside them itself, so there's no number to ask the layer for). The app opens
    // them all on the same page, the layer's own recommendations for the account (they are the
    // account's own picks either way), but each keeps its own name and cover: its card is what the
    // player tapped, and the page says the same (`kind: 'daily'`, `collection`).
    if (realId === '0') {
      return type === 500 ? { ...card0(title, by, cover), kind: 'playlist' } : null
    }
    if (type === 200 && card?.subid) {
      // The song by its own number, not the card's `subid`: that one is the site's short form of a
      // mid (`h0024…`, 11 characters), and the layer's routes know nothing of it — `/song/h0024…/url`
      // says `101404` (no such song) where the same song by its long mid (`001Z7M2S3GZVB0`) plays.
      // The number is what the layer's `/song/{id}/detail` looks a song up by, and `resolveMid` turns
      // one into the other when it plays (owner 2026-11-16: the home feed's songs wouldn't play at
      // all, their mid being the short one).
      return {
        id: card?.id != null ? String(card.id) : String(card.subid),
        kind: 'song',
        name: title,
        by,
        note: '',
        image: cover,
        wide: null,
        color: '#2c2c2e',
        explicit: false,
        live: false,
      }
    }
    if (type === 500 && card?.id) {
      return {
        id: String(card.id),
        kind: 'playlist',
        name: title,
        by,
        note: '',
        image: cover,
        wide: null,
        color: '#2c2c2e',
        explicit: false,
        live: false,
      }
    }
    if (type === 1000 && card?.id) {
      return {
        id: String(card.id),
        kind: 'top',
        name: title,
        by,
        note: '',
        image: cover,
        wide: null,
        color: '#2c2c2e',
        explicit: false,
        live: false,
      }
    }
    return null
  }

  /**
   * Home: the account's own shelves from the site (its personalised feed), and of its songs the ones
   * the app can play straight away. Signed out, the site answers the same shelves to everyone: those
   * are what the app showed before, and still what it shows then.
   */
  /**
   * The feed once a session (`homeCache`): its shelves are the site's own picks for the account, and
   * asking again for them hands back another draw of them — a page that reopens would show a
   * different list each time (owner 2026-11-16: 你的歌单宝藏库 kept refreshing). Kept for as long as
   * WestPlay runs; a sign-in clears it (`saveCredential`).
   */
  /**
   * The radar's picks, a page at a time. Pages are asked for until one repeats or says there are no
   * more, up to `RADAR_PAGES`.
   *
   * One page since 2026-11-27: the chart it reads from (`topid` 62) is answered whole, 88 KB fetched
   * in about three seconds, and six pages of it were six such fetches before `Home` — the app's own
   * timeout came first and the cab said "载入失败". One page is 20 songs, which is what the app's own
   * list shows anyway.
   */
  const RADAR_PAGES = 1
  /**
   * A chart's own songs, its first `limit` of them.
   *
   * Each entry is the song's rank with the song under `data`, and the song comes in the site's own
   * names (`songmid`, `songname`, `albummid`, …): unwrapped but not renamed, a row showed the artist
   * where the song's name belongs and no cover at all (owner 2026-11-28). `songNamed` gives it the
   * names every reader here was written against, as `named` does for a list asked through `get`.
   */
  const fetchChart = async (topid, limit) => {
    const found = await cgi(
      '/v8/fcg-bin/fcg_v8_toplist_cp.fcg',
      new URLSearchParams({ format: 'json', topid: String(topid) }),
    )
    return (found.songlist ?? []).slice(0, limit).map((one) => songNamed(one?.data ?? one))
  }
  const fetchRadar = async () => {
    const seen = new Set()
    const songs = []
    for (let page = 1; page <= RADAR_PAGES; page += 1) {
      let found
      try {
        found = await get(`/recommend/get_radar_recommend?page=${page}`)
      } catch {
        break
      }
      const page_ = found?.songs ?? []
      let fresh = 0
      for (const song of page_) {
        const id = song?.mid
        if (!id || seen.has(id)) continue
        seen.add(id)
        songs.push(song)
        fresh += 1
      }
      // Nothing new on this page (the site hands the same five again), or no more behind it.
      if (fresh === 0 || found?.has_more === false) break
    }
    return songs
  }

  /**
   * One feed's shelves as the app's sections (its cards mapped by `feedCard`).
   *
   * The site's feed is many shelves of one or two cards each (its own page draws them as tiles of
   * different widths, side by side); the app draws a section as one row of cards, so a shelf of one
   * card was a row of one card and the home page was a column of near-empty rows (owner 2026-11-27:
   * "每个歌单一行，看着太空旷了"). Every card is one shelf now, 为你推荐, in the site's own order;
   * a shelf that is all songs stays a shelf of its own, played as a list.
   */
  const feedSections = (feed) => {
    const sections = []
    const shelfCards = []
    // One shelf holds what several did: a card the site lists twice (the same 百万收藏 in two
    // shelves) stays one card, where the page asked for it by its own position in a row before.
    const seen = new Set()
    const once = (card) => {
      const key = `${card.kind}:${card.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }
    for (const shelf of Array.isArray(feed?.shelves) ? feed.shelves : []) {
      const title = escapeHtml(shelf?.title_content || shelf?.title_template || '').trim()
      const cards = []
      for (const niche of shelf?.niches ?? []) {
        for (const card of niche?.cards ?? []) {
          const made = feedCard(card)
          if (made) cards.push(made)
        }
      }
      if (cards.length === 0) continue
      // Songs in a shelf of their own play as a list (a `track`, the app's own shape); anything else
      // at all shows as cards.
      const songCards = cards.filter((card) => card.kind === 'song')
      const listable = songCards.length === cards.length
      if (!listable) {
        shelfCards.push(...cards.filter((card) => card.kind !== 'song' && once(card)))
        continue
      }
      sections.push({
        title: title || '为你推荐',
        style: 'songs',
        items: [],
        songs: songCards.map((card) => ({
          id: card.id,
          name: card.name,
          artist: card.by,
          album: '',
          albumId: null,
          artistId: null,
          image: card.image,
          color: card.color,
          number: null,
          explicit: false,
          duration: 0,
        })),
      })
    }
    if (shelfCards.length > 0) {
      // Two rows of cards, not one: the site's own first two picks stay 为你推荐, everything after
      // them is a shelf of its own, 你的宝藏歌单 (owner 2026-11-28: "第一行保留前两个歌单，后面的歌单
      // 另起一行，书架名称就叫你的宝藏歌单").
      const rows = [{ title: '为你推荐', style: 'shelf', items: shelfCards.slice(0, 2), songs: [] }]
      const rest = shelfCards.slice(2)
      if (rest.length > 0) rows.push({ title: '你的宝藏歌单', style: 'shelf', items: rest, songs: [] })
      sections.unshift(...rows)
    }
    return sections
  }

  let homeCache = null
  const home = async () => {
    if (homeCache) return homeCache
    // The site's own shelves, in its own order — which is what its home page shows: 今日为你打造
    // (每日30首, 百万收藏, 歌手漫游, 新歌推荐 …), 大家都在听, 你的私荐歌单, 热门节目, 为你精选的AI歌单,
    // 排行榜. The account's own lists have their entries in that first shelf's cards; they aren't
    // shelves of their own there, and putting them in front made a home the site never shows
    // (owner 2026-11-20: taken from the site's page).
    const sections = feedSections(await get('/recommend/get_home_feed'))

    // The site's shelves for everyone as well, merged under the account's own: signed in it drops
    // the general ones and keeps only its own picks, and the app showed them before a sign-in. A
    // shelf of the same title stays one (the account's own standing where the general one was).
    try {
      const general = feedSections(await get('/recommend/get_home_feed', { anon: true }))
      const known = new Set(sections.map((section) => section.title))
      for (const section of general) {
        const kept = { ...section, items: section.items.filter((item) => item.id !== 'qqdaily') }
        if (kept.items.length === 0 && kept.songs.length === 0) continue
        if (!known.has(kept.title)) sections.push(kept)
      }
    } catch {
      // The general list is a second helping: without it the account's own still shows.
    }

    if (sections.length > 0) {
      // More of the site's own, for the home page and its 频道 (owner 2026-11-28: "内容还有点少"):
      // its charts as a row, its playlist wall as a row, and the songs of its 热歌 and 新歌 charts as
      // the lists to play. Asked together with 猜你喜欢's radar, so the page waits for the slowest of
      // them and not for each in turn; a part that fails only leaves its own row out.
      const [picks, charts, wall, hot, fresh] = await Promise.all([
        fetchRadar().catch(() => []),
        get('/top/get_category').catch(() => null),
        get('/recommend/get_recommend_songlist?num=19').catch(() => null),
        fetchChart(HOT_TOP_ID, 20).catch(() => []),
        fetchChart(NEW_TOP_ID, 20).catch(() => []),
      ])
      const rows = []
      const chartCards = (charts?.group ?? []).flatMap((group) => group?.toplist ?? []).map(chartItem)
      if (chartCards.length > 0) {
        rows.push({ title: '排行榜', style: 'shelf', items: chartCards, songs: [] })
      }
      if (wall?.songlists?.length > 0) {
        rows.push({ title: '推荐歌单', style: 'shelf', items: wall.songlists.map(playlistItem), songs: [] })
      }
      const lists = []
      if (hot.length > 0) {
        lists.push({ title: '热歌', style: 'songs', items: [], songs: hot.map(safeTrack) })
      }
      if (fresh.length > 0) {
        lists.push({ title: '新歌', style: 'songs', items: [], songs: fresh.map(safeTrack) })
      }
      if (picks.length > 0) {
        // The radar's own names, as the app's track reads them: a raw site song went into the
        // answer once and the whole home failed to read (`color` missing, 2026-11-28).
        lists.push({ title: '猜你喜欢', style: 'songs', items: [], songs: picks.map(safeTrack) })
      }
      // The site's own order kept: the cards first (为你推荐, 你的宝藏歌单), then its charts and its
      // wall, then the lists to play.
      const answer = {
        sections: [
          ...sections.filter((section) => section.style !== 'songs'),
          ...rows,
          ...sections.filter((section) => section.style === 'songs'),
          ...lists,
        ],
      }
      // Kept only for a signed-in account: a page that asked before the credential arrived gets the
      // anonymous list, and keeping it would hide the account's own for the whole run.
      if (savedCookie || savedCred) homeCache = answer
      return answer
    }

    // Nothing of the feed at all: the site's recommendations for everyone, as before.
    const [lists, news, radar] = await Promise.all([
      get('/recommend/get_recommend_songlist?num=10'),
      get('/recommend/get_recommend_newsong'),
      fetchRadar(),
    ])
    return {
      sections: [
        {
          title: '推荐歌单',
          style: 'shelf',
          items: (lists.songlists ?? []).map(playlistItem),
          songs: [],
        },
        {
          title: '新歌首发',
          style: 'songs',
          items: [],
          songs: (news.songs ?? []).map(safeTrack),
        },
        {
          title: '猜你喜欢',
          style: 'songs',
          items: [],
          songs: radar.map(safeTrack),
        },
      ],
    }
  }

  const hotkeyItem = (hotkey) => ({
    id: String(hotkey?.direct_id ?? hotkey?.query ?? ''),
    kind: 'curator',
    name: escapeHtml(hotkey?.title || hotkey?.query),
    by: escapeHtml(hotkey?.description ?? ''),
    note: escapeHtml(hotkey?.query ?? ''),
    image: hotkey?.cover_pic_url ?? null,
    wide: null,
    color: '#2c2c2e',
    explicit: false,
    live: false,
  })

  /**
   * The official charts (官方歌单): each group of lists the layer names (巅峰榜, 地区榜 and the rest),
   * a list played by its own `top/{id}/detail` (its songs).
   */
  const top = async () => {
    const found = await get('/top/get_category')
    // Only the lists of songs: some of the layer's are albums', music videos' or audiobooks' (their
    // `total_num` is 0 there is nothing of the app's to show), and a card with no songs behind it
    // would open a page that can only say it couldn't load.
    return {
      sections: (found.group ?? []).map((group) => ({
        title: escapeHtml(group?.name),
        style: 'shelf',
        items: (group?.toplist ?? []).map(chartItem),
        songs: [],
      })),
    }
  }

  const search = async ({ query }) => {
    if (!query || !query.trim()) {
      // Search's own empty state: hot search terms plus a handful of recommended songs.
      const [hot, guess] = await Promise.all([
        get('/search/get_hotkey'),
        get('/recommend/get_guess_recommend'),
      ])
      return {
        top: [],
        songs: (guess.songs ?? []).map(track),
        artists: [],
        albums: [],
        playlists: (hot.vec_hotkey ?? hot.hotkey ?? []).map(hotkeyItem),
        stations: [],
      }
    }
    const found = await get(`/search/general_search?keyword=${encodeURIComponent(query)}&num=15`)
    return {
      top: [],
      // The search endpoint names its own groups' entries `list` (`song.list`, `singer.list`…),
      // where the middle layer called them `items`.
      songs: (found.song?.list ?? found.song?.items ?? []).map(track),
      artists: (found.singer?.list ?? found.singer?.items ?? []).map(artistItem),
      albums: (found.album?.list ?? found.album?.items ?? []).map(albumItem),
      playlists: (found.songlist?.list ?? found.songlist?.items ?? []).map(playlistItem),
      stations: [],
    }
  }

  // --- Login (QR scan, reusing the `collection` question by prefixed ids) ----------------------------------

  // The QR identifier is a 128-char hex; the collection id is capped at 64 chars, so a short sequence number
  // stands in for it here, mapped back to the real identifier inside this page.
  const qrMap = new Map()
  let qrSeq = 0

  const EMPTY_COLLECTION = () => ({
    item: { id: '', kind: 'curator', name: '', by: '', note: '', image: null, wide: null, color: '#2c2c2e', explicit: false, live: false },
    description: '',
    genre: '',
    year: null,
    tracks: [],
    playlists: [],
  })

  // `qqqr`: fetch the QR code; its image is the item's cover, a short status id rides the item's note.
  const loginQr = async () => {
    const qr = await get('/login/qrcode/qq')
    const seq = String(++qrSeq)
    qrMap.set(seq, String(qr.identifier ?? ''))
    const out = EMPTY_COLLECTION()
    out.item = {
      id: String(qr.identifier ?? ''),
      kind: 'curator',
      name: 'QQ 音乐登录',
      by: '使用手机 QQ 扫码并确认',
      note: `qqqrstatus-${seq}`,
      image: qr.img ?? null,
      wide: null,
      color: '#2c2c2e',
      explicit: false,
      live: false,
    }
    return out
  }

  // `qqqrstatus-<seq>`: poll the scan state; on done keep the credential in memory and report signed in.
  const loginStatus = async (statusId) => {
    const seq = statusId.slice('qqqrstatus-'.length)
    const identifier = qrMap.get(seq)
    if (!identifier) throw new Error('qr not found')
    const st = await get(`/login/qrcode/qq/status?identifier=${encodeURIComponent(identifier)}`)
    if (st.done && st.credential) {
      savedCred = st.credential
      saveCredential()
    }
    if (st.done) post({ signedIn: true, playing: false, avatar: null })
    const out = EMPTY_COLLECTION()
    out.item = {
      id: identifier,
      kind: 'curator',
      name: st.done ? '登录成功' : '等待扫码',
      by: '',
      note: String(st.event ?? ''),
      image: null,
      wide: null,
      color: '#2c2c2e',
      explicit: false,
      live: false,
    }
    out.description = String(st.event ?? '')
    return out
  }

  // `qqmine`: the signed-in account's profile card, its favourited songs, its own playlists and saved playlists.
  const mine = async () => {
    if (!savedCred && !savedCookie) throw new Error('not signed in')
    const euin =
      savedCred?.encryptUin || savedCred?.encrypt_uin || cookieValue('euin') || savedCred?.str_musicid ||
      savedCred?.musicid || cookieValue('str_musicid') || cookieValue('musicid') ||
      cookieValue('uin') || cookieValue('openid') || ''
    const uin =
      savedCred?.musicid || cookieValue('uin') || cookieValue('musicid') || savedCred?.str_musicid || ''
    const [home, favLists, created] = await Promise.all([
      get(`/user/${encodeURIComponent(euin)}/homepage`).catch(() => ({})),
      get(`/user/${encodeURIComponent(euin)}/fav/songlists?num=100`).catch(() => ({ playlists: [] })),
      uin
        ? get(`/user/${encodeURIComponent(uin)}/created_songlists`).catch(() => ({ playlists: [] }))
        : Promise.resolve({ playlists: [] }),
    ])
    // The loved songs come as one list too (the playlist route answers whole), so `fetchAllSongs`
    // asks once — the path it starts with is what tells it (`wholeList`). A list the site won't
    // hand over (a dropped answer, an account the `uin` didn't name) leaves the page with what it
    // has — the header and the playlists — rather than failing whole, which the app showed as a
    // "我的" tab that couldn't load at all (2026-11-27).
    let favSongs = []
    let owner = {}
    try {
      const fav = await fetchAllSongs(`/user/${encodeURIComponent(euin)}/fav/songs`)
      favSongs = fav.songs
      // The list's own owner (its name and picture): what the header falls back to when the
      // login-only profile API has nothing (`GetLoginUserInfo` answers `1000`).
      owner = fav.info?.owner ?? {}
    } catch {}
    // The account's own header: the site answers it under `info` (`nick`, `logo`), and the middle
    // layer's shape (`Info.BaseInfo`) is the other name it has had.
    const base = home?.info ?? home?.Info?.BaseInfo ?? home?.base_info ?? {}
    const out = EMPTY_COLLECTION()
    out.item = {
      // Its own slot again, not the account's number: the page this item opens is the same one
      // (`collection` with `qqmine`), and a number here was looked up as a playlist's id, which
      // has nothing of the account's own list (2026-11-27: "我的" couldn't open).
      id: 'qqmine',
      kind: 'playlist',
      name: escapeHtml(base.Name || base.name || owner.nickname || '我的音乐'),
      by: '我的收藏',
      note: '',
      image:
        String(base.logo ?? base.Avatar ?? base.avatar ?? owner.headurl ?? '').replace(
          /^http:\/\//,
          'https://',
        ) || null,
      wide: null,
      color: '#2c2c2e',
      explicit: false,
      live: false,
    }
    out.tracks = favSongs.map(safeTrack)
    // Owned playlists first, then playlists favourited from others.
    out.playlists = [
      ...(created.playlists ?? []).map(playlistItem),
      ...(favLists.playlists ?? []).map(playlistItem),
    ]
    return out
  }

  const collection = async ({ id, kind, name, by, image }) => {
    if (id === 'qqqr') return loginQr()
    if (id.startsWith('qqqrstatus-')) return loginStatus(id.slice('qqqrstatus-'.length))
    if (id === 'qqmine') return mine()
    // The feed's own slot with no list behind it (`id` 0: 每日30首 and the like): the layer's
    // recommendations for the account, which is what that slot is on the site too.
    if (id === 'qqdaily') {
      const songs = await fetchRadar()
      return {
        item: {
          id,
          kind: 'playlist',
          // The card's own name and cover, as it was tapped (several slots share this page).
          name: escapeHtml(name ?? '每日推荐'),
          by: '',
          note: '',
          image: image ?? null,
          wide: null,
          color: '#2c2c2e',
          explicit: false,
          live: false,
        },
        description: songs.length > 0 ? '' : '暂时没有可以播放的推荐歌曲。',
        genre: '',
        year: null,
        tracks: songs.map(safeTrack),
      }
    }

    // Artists and albums have their own middle-layer endpoints; a playlist id sent to the songlist route
    // returns 422, so pick the route (and the song array's field name) by the card's kind.
    if (kind === 'artist' || kind === 'album') {
      const path =
        kind === 'artist'
          ? `/singer/${encodeURIComponent(id)}/songs`
          : `/album/${encodeURIComponent(id)}/songs`
      const { songs } = await fetchAllSongs(path, 'song_list')
      return {
        item: {
          id,
          kind,
          name: escapeHtml(name ?? ''),
          by: escapeHtml(by ?? ''),
          note: '',
          image: image ?? null,
          wide: null,
          color: '#2c2c2e',
          explicit: false,
          live: false,
        },
        description: '',
        genre: '',
        year: null,
        tracks: songs.map(safeTrack),
      }
    }

    // A chart of the official lists: its own endpoint, its songs in `song_list` (a chart's number is
    // not a playlist's, so the songlist route would answer another list or refuse it).
    if (kind === 'top') {
      // The chart's own field is `songs` (its `info` names it too). Some of the layer's lists are
      // albums', music videos' or audiobooks': they answer no songs at all, and the page says so
      // rather than failing (which it showed as a load that couldn't happen).
      const { songs, info } = await fetchAllSongs(`/top/${encodeURIComponent(id)}/detail`, 'songs')
      const chartInfo = info ?? {}
      return {
        item: {
          id,
          kind: 'top',
          name: escapeHtml(name ?? ''),
          by: escapeHtml(by ?? ''),
          note: '',
          image: image ?? null,
          wide: null,
          color: '#2c2c2e',
          explicit: false,
          live: false,
        },
        description:
          songs.length > 0
            ? escapeHtml(chartInfo?.intro ?? '').replace(/<[^>]+>/g, ' ').slice(0, 300)
            : '这个榜单里没有可以播放的歌曲（专辑榜、MV 榜或有声榜）。',
        genre: '',
        year: null,
        tracks: songs.map(safeTrack),
      }
    }

    const { songs, info } = await fetchAllSongs(`/songlist/${encodeURIComponent(id)}/detail`)
    const infoMeta = info ?? {}
    const item = playlistItem({
      id: infoMeta.id ?? id,
      title: infoMeta.title,
      desc: infoMeta.desc,
      picurl: infoMeta.picurl,
      creator_nick: infoMeta.creator_nick ?? infoMeta.creator?.nick,
    })
    return {
      item,
      description: escapeHtml(infoMeta.desc ?? ''),
      genre: '',
      year: null,
      tracks: songs.map(safeTrack),
    }
  }

  // Parse an LRC text into the app's lines. Timestamps [mm:ss.xx]; metadata tags ([ti:], [ar:]…) are dropped.
  const parseLrc = (text) => {
    const lines = []
    let synced = true
    const tag = /^\[(ti|ar|al|by|offset|length|re|ve|tool|signer|hash|total):/i
    const stamp = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g
    const strip = /\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\]/g
    for (const raw of String(text ?? '').split(/\r?\n/)) {
      if (tag.test(raw)) continue
      const stamps = [...raw.matchAll(stamp)]
      const textLine = escapeHtml(raw.replace(strip, '').trim())
      if (!textLine) continue
      if (stamps.length === 0) {
        synced = false
        lines.push({ start: 0, end: 0, text: textLine })
        continue
      }
      for (const m of stamps) {
        const minutes = Number(m[1])
        const seconds = Number(m[2])
        const frac = m[3] ? Number(`0.${m[3]}`) : 0
        lines.push({ start: minutes * 60 + seconds + frac, end: 0, text: textLine })
      }
    }
    lines.sort((a, b) => a.start - b.start)
    return { synced, lines, provider: 'QQ音乐' }
  }

  const lyrics = async ({ id }) => {
    const found = await get(`/song/${encodeURIComponent(id)}/lyric`)
    return parseLrc(found.lyric ?? '')
  }

  const QUESTIONS = { home, top, search, collection, lyrics }

  // An answer, asked of the layer again once should it fail (a dropped connection); failed only then.
  const answer = async (id, question) => {
    const asked = QUESTIONS[question?.ask]
    if (!asked) {
      post({ answer: id, failed: true, why: 'no question for ' + String(question?.ask) })
      return
    }
    let why = ''
    for (const wait of [0, 600]) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      try {
        const found = await asked(question)
        post({ answer: id, [question.ask]: found })
        return
      } catch (error) {
        // Once more, or failed — and why, said so a failed question isn't only "nothing came back".
        why = String((error && (error.stack || error.message || error)) || '').slice(0, 300)
      }
    }
    post({ answer: id, failed: true, why })
  }

  // --- Player: a hidden <audio> fed by the layer's stream URLs ------------------------------------------------

  const CDN = 'https://isure.stream.qqmusic.qq.com/'

  /**
   * What the layer said of each stream asked for, by its address: a failed play is told with the song it
   * was really given (`el.src`), not with whichever song was asked for last — a skip while the first was
   * still looking its mid up overwrote that, and the log named two different songs (owner 2026-11-18).
   */
  const streams = new Map()

  /** Songs whose address was asked for again after a failed play (once each: no loop). */
  const refreshed = new Set()


  const player = {
    // How many songs in a row had no stream (a paying one): reset by anything the player itself
    // does, so a queue of them doesn't spin for ever.
    skipped: 0,
    audio: null,
    // The song being loaded now (its mid), for a failed play to ask the layer for its address again.
    mid: null,
    // Mids in queue order, where it plays from, what list it came from, the options.
    queue: [],
    index: 0,
    context: null,
    shuffle: false,
    repeat: 'off', // 'off' | 'all' | 'one'
    // What plays now (a fade may lower it), and the player's own choice of it (only a volume the
    // player set, never a fade): the latter is what the host keeps for the next start.
    volume: 1,
    chosen: 1,
    track: null,
    loading: false,
    // Invalidates an async load superseded by a newer play/skip.
    token: 0,
  }

  // The truck's own speakers (`cab_sound.js`, loaded before this script): its sound split to the cab's
  // speakers, each heard from where it sits. Where there's no cab to play it (a page loaded without the
  // script), the songs play as they are.
  let throughCab = false
  let headReady = false
  let cabGaveUp = false
  const sound = window.westplayCabSound?.(() => (throughCab && headReady ? player?.audio : null), post)
  if (sound) window.setInterval(() => sound.tick?.(), 250)

  const audio = () => {
    if (!player.audio) {
      const el = document.createElement('audio')
      // Marked as WestPlay's: the site's own player pauses whatever `<audio>` it finds playing, and
      // this one is not the site's (`qq_quiet.js` refuses `pause` for it).
      window.westplayOwnAudio?.(el)
      el.preload = 'auto'
      el.volume = player.volume
      // Taken into the browser's own graph for the cab (`cab_sound.js`): a cross-origin element without
      // this plays silently there. QQ's media hosts send `Access-Control-Allow-Origin: *` (checked), so
      // they allow it; a song whose host doesn't is given up for the cab alone (`checkAudible`).
      if (sound && !cabGaveUp) el.crossOrigin = 'anonymous'
      document.body.appendChild(el)
      player.audio = el
      el.addEventListener('loadedmetadata', tellPlayback)
      el.addEventListener('canplay', () => {
        player.loading = false
        tellPlayback()
      })
      el.addEventListener('play', () => {
        player.loading = false
        tellPlayback()
      })
      el.addEventListener('pause', tellPlayback)
      el.addEventListener('timeupdate', tellPlayback)
      el.addEventListener('ended', onEnded)
      el.addEventListener('error', (event) => {
        // The element's own error, before or after play() answered: the code is what tells a format the
        // browser can't take from a host that refused it.
        const media = event?.target
        const address = String(media?.src || '')
        const said = streams.get(address)
        if (media?.error) {
          post({
            qqProbe:
              'audio error event: code ' +
              media.error.code +
              ' "' +
              (media.error.message || '') +
              '" | file ' +
              (said ? said.filename : 'unknown') +
              ' | crossOrigin ' +
              (media.crossOrigin || 'none') +
              ' | src ' +
              address.slice(0, 160),
          })
          // What the host really answered for it: a 403 or a page of HTML is a different fault from a
          // file the browser can't decode, and only the status says which.
          probeStream(address)
        }
        // Taken into the cab and refused there: given up, and this song played plainly instead.
        if (throughCab && !cabGaveUp) {
          cabGaveUp = true
          throughCab = false
          post({ qqProbe: 'the cab refused the song; giving it up and playing plainly' })
          const at = media?.currentTime || 0
          try {
            media?.pause()
          } catch {}
          player.audio = null
          try {
            media?.remove()
          } catch {}
          if (address) {
            const fresh = audio()
            fresh.addEventListener(
              'loadedmetadata',
              () => {
                try {
                  fresh.currentTime = Math.max(0, at)
                } catch {}
                fresh.play().catch(() => {})
              },
              { once: true },
            )
            fresh.src = address
          }
          return
        }
        onError()
      })
    }
    return player.audio
  }

  const currentMid = () => player.queue[player.index] ?? null

  /** Whether this song may be taken into the cab's graph: a cab there, not given up, and the head known. */
  /**
   * Whether the songs' host lets the browser take them into a graph (`crossOrigin`): asked before a song
   * is played through the cab, by asking for its first bytes the way the browser would. A host that
   * answers wrongly makes the browser refuse the song outright (`MEDIA_ELEMENT_ERROR: Format error`,
   * code 4) — so the cab is only taken where this says yes, and the song plays plainly where it doesn't
   * (owner 2026-11-18: two players' QQ Music would not play at all).
   *
   * Kept by host (the vkey changes every song, the host's behaviour doesn't).
   */
  /** What the host answers for `url`: its status, type and first bytes, said once per address. */
  const probed = new Set()
  const probeStream = async (url) => {
    if (!url || probed.has(url)) return
    probed.add(url)
    try {
      const answer = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        headers: { Range: 'bytes=0-1023' },
      })
      const head = new Uint8Array(await answer.arrayBuffer().catch(() => new ArrayBuffer(0)))
      const first = Array.from(head.slice(0, 8))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ')
      post({
        qqProbe:
          'stream fetch: HTTP ' +
          answer.status +
          ' CT=' +
          (answer.headers.get('content-type') || 'none') +
          ' ACAO=' +
          (answer.headers.get('access-control-allow-origin') || 'none') +
          ' bytes=' +
          head.length +
          ' first=' +
          (first || 'none'),
      })
    } catch (error) {
      post({
        qqProbe:
          'stream fetch FAILED: ' + (error && error.name + ': ' + error.message) + ' | ' + url.slice(0, 140),
      })
    }
  }

  /** Whether this song may be taken into the cab's graph: a cab there, not given up, the head known, and
   * its host letting the browser have it. */

  const takeIntoCab = () => {
    throughCab = Boolean(sound) && !cabGaveUp && headReady
  }

  /** How loud the cab's speakers play now in each ear (none: nothing was taken into it). */
  const cabIsQuiet = () => {
    const levels = sound?.level?.()
    if (levels === undefined || levels === null) return true
    return Array.isArray(levels) ? levels.every((value) => !value) : false
  }

  /**
   * A song a couple of seconds in: one taken into the cab but with nothing coming out of it (a host that
   * refuses the browser's permission, a graph that couldn't be made) is given up for that song alone —
   * plainly heard beats not heard — and it plays as it is instead. `cab_sound.js` says how loud each ear
   * is (`level()`): silence twice, with the song really running, is the sign.
   */
  const checkAudible = () => {
    const element = player.audio
    if (!sound || !throughCab || !headReady || !element || element.paused || element.error) return
    const first = { at: element.currentTime, quiet: cabIsQuiet() }
    window.setTimeout(() => {
      if (player.audio !== element || element.paused || element.error) return
      const second = { at: element.currentTime, quiet: cabIsQuiet() }
      post({
        qqProbe:
          'cab levels ' +
          String(sound?.level?.()) +
          ' at ' +
          first.at.toFixed(1) +
          's, then ' +
          String(sound?.level?.()) +
          ' at ' +
          second.at.toFixed(1) +
          's',
      })
      // Time moving and silence both times: not a quiet passage, and not a stall.
      if (!first.quiet || !second.quiet || second.at - first.at < 0.4) return
      post({ qqProbe: 'the cab plays nothing at all; playing as it is' })
      cabGaveUp = true
      throughCab = false
      const at = second.at
      const src = element.currentSrc || element.src
      try {
        element.pause()
      } catch {}
      player.audio = null
      try {
        element.remove()
      } catch {}
      if (!src) return
      const el = audio()
      el.addEventListener(
        'loadedmetadata',
        () => {
          try {
            el.currentTime = Math.max(0, at)
          } catch {}
          el.play().catch(() => {})
        },
        { once: true },
      )
      el.src = src
    }, 1100)
  }

  const tellPlayback = () => {
    const el = player.audio
    if (!el) {
      post({ playback: null })
      return
    }
    post({
      playback: {
        track: player.track,
        context: player.context,
        playing: !el.paused && !el.ended,
        loading: player.loading,
        position: Number(el.currentTime) || 0,
        duration: Number(el.duration) || player.track?.duration || 0,
        preview: false,
        shuffle: player.shuffle,
        repeat: player.repeat,
        volume: player.volume,
        chosen: player.chosen,
        next: [],
      },
    })
  }

  // The layer's URL response: `data` may be the list itself, or `{ expiration, data: [...] }`; the first
  // item carries purl/vkey/result.
  /**
   * A song's long mid from whatever the app has of it: the feed's songs carry their number (`id`), and
   * some of its own older lists a short form of the mid (`h0024…`) that the layer's routes know
   * nothing of. `/song/{id}/detail` names the long one for either. Answered as itself when it already
   * looks like one (14 characters), so a song that plays costs no extra request.
   */
  const resolveMid = async (id) => {
    const text = String(id ?? '')
    if (!text) return text
    if (/^[0-9A-Za-z]{14}$/.test(text)) return text
    try {
      const found = await get(`/song/${encodeURIComponent(text)}/detail`)
      const long = found?.track?.mid
      if (long) return String(long)
    } catch {
      // Left as it is: the play that follows says why nothing came of it.
    }
    return text
  }

  const streamOf = async (mid, fresh = false) => {
    // Our own route first: it asks the site's CgiGetVkey *with the file's name*, which is what a
    // VIP song needs. The layer asks without it, and the site reads that as an account with no
    // rights — `result` 104003 on songs the account actually pays for (owner 2026-11-20).
    //
    // The credential goes as the site names it (`uin`, `qqmusic_key`, `qm_keyst` …): the layer's
    // `qq_musicid` / `musickey` pair means nothing to y.qq.com, so both sets are sent and
    // `run_westplay.py` picks the site's own names.
    const found = await get(`/song/${encodeURIComponent(mid)}/url`, { fresh })
    const list = Array.isArray(found) ? found : (found?.midurlinfo ?? found?.data)
    const item = list?.[0]
    if (!item || item.result !== 0 || !item.purl) {
      // What the layer says of it: a song of an album or playlist that only a paying account may
      // play (or one pulled from the site) has no stream at all (`result` 104003 and its like).
      const why = item ? `result ${item.result}` : 'no entry'
      const pairs = credentialPairs()
      post({
        qqProbe:
          'no stream: ' +
          why +
          ' | cred: ' +
          (pairs.length ? pairs.map(([k, v]) => k + '=' + String(v).length).join(',') : 'NONE') +
          ' | cookie keys: ' +
          (savedCookie ? savedCookie.split(';').length : 0) +
          ' | headers: ' +
          Object.keys(credentialHeaders()).join(','),
      })
      const error = new Error(`no stream (${why})`)
      error.noStream = true
      throw error
    }
    // Kept for what a failed play says: the layer's own name for the file (its prefix is the quality,
    // its extension the format) tells a song WebView2 can't decode from a host that refused the request.
    const base = String(item.sip && String(item.sip).startsWith('http') ? item.sip : CDN).replace(
      /^http:\/\//,
      'https://',
    )
    const address = base + item.purl
    streams.set(address, {
      mid,
      filename: String(item.filename ?? ''),
      result: item.result,
      purl: String(item.purl),
    })
    return address
  }

  // A song's own detail, normalised like a list row; on failure a bare placeholder (the app keeps its own).
  const metaOf = async (mid) => {
    try {
      const found = await get(`/song/${encodeURIComponent(mid)}/detail`)
      const song = found.track ?? found
      if (song?.mid) return track(song)
    } catch {
      // fall through to placeholder
    }
    return {
      id: mid,
      name: '',
      artist: '',
      album: '',
      albumId: null,
      artistId: null,
      image: null,
      color: '#2c2c2e',
      duration: 0,
      explicit: false,
      number: null,
    }
  }

  /** A playlist's, an album's or a singer's songs, by the kind of id the card that was clicked has:
   * a playlist's is a number (the layer's `disstid`), an album's and a singer's a base62 mid. Each
   * route takes its own (the layer's `/songlist/{id}/detail` only a number: a mid there is refused
   * as not one). */
  const songsOfList = async (id, kind) => {
    const text = String(id ?? '')
    if (!text) return []
    // The app's own slot (`qqdaily`): the radar's picks, not a list of the site's to ask for by id
    // (asking made the id go on as a song's mid, which the layer answers 101404 for).
    if (text === 'qqdaily') return (await fetchRadar()).map((song) => song?.mid).filter(Boolean)
    const numeric = /^\d+$/.test(text)
    // The whole list, not its first page: `num=30` was written in here, so playing a playlist by
    // id gave the layer a queue of 30 songs and Next went back to the first one (owner 2026-11-26).
    // `fetchAllSongs` walks the pages, which is what the app's own lists already use.
    const path =
      kind === 'top'
        ? `/top/${encodeURIComponent(text)}/detail`
        : numeric
          ? `/songlist/${encodeURIComponent(text)}/detail`
          : kind === 'artist'
            ? `/singer/${encodeURIComponent(text)}/songs`
            : `/album/${encodeURIComponent(text)}/songs`
    const { songs } = await fetchAllSongs(path, numeric || kind === 'top' ? 'songs' : 'song_list')
    return songs.map((song) => song?.mid).filter(Boolean)
  }

  async function loadCurrent(autoplay) {
    const weakMid = currentMid()
    if (!weakMid) {
      post({ playback: null })
      return
    }
    // Its number taken first: a skip that comes while this one is still looking its mid up must win,
    // not lose to it when the lookup finishes (which made going next, back, next over a list play
    // the wrong song for a moment, then the right one).
    const token = ++player.token
    // Anything still loading is this one now: the other's answer is dropped below.
    player.loading = true
    tellPlayback()
    const mid = await resolveMid(weakMid)
    if (token !== player.token) return
    player.mid = mid
    try {
      const [meta, url] = await Promise.all([metaOf(mid), streamOf(mid, refreshed.has(mid))])
      if (token !== player.token) return // superseded by a newer play/skip
      player.track = meta
      // The cab takes the song only where its host lets the browser have it (asked here, once per host):
      // taken and refused, the browser wouldn't play it at all. Anything else plays as it is.
      takeIntoCab()
      const el = audio()
      // `pause()` on an element that is loading (a `play()` still waiting on its source)
      // aborts that play with `AbortError`, which read as a refused stream and was retried —
      // the retry pausing the next, so a song never got past its first second (2026-11-27).
      if (!el.paused && el.readyState > 2) window.westplayPauseOwn?.(el) ?? el.pause()
      el.src = url
      el.volume = player.volume
      if (autoplay) {
        try {
          await el.play()
          refreshed.delete(mid)
          checkAudible()
        } catch (error) {
          // What the element itself says of it: code 4 is a source the browser can't use (a format
          // it doesn't decode, or a host that answered with something that isn't audio); 2 is the
          // network (a 403, a timeout). The two are different faults and are fixed differently.
          const el_error = el.error
          post({
            qqProbe:
              'audio.play() FAILED: ' +
              (error && error.name + ': ' + error.message) +
              ' | element ' +
              (el_error ? 'code ' + el_error.code + ' "' + (el_error.message || '') + '"' : 'no error') +
              ' | file ' +
              (() => {
                const said = streams.get(String(el.src || ''))
                return said ? said.filename + ' (result ' + said.result + ')' : 'unknown'
              })() +
              ' | crossOrigin ' +
              (el.crossOrigin || 'none') +
              ' | src ' +
              String(el.src || '').slice(0, 160) +
              ' | took ' +
              (throughCab ? 'cab' : 'plain'),
          })
          player.loading = false
          // The CDN refused the stream (a vkey that ran out: 403, which the browser reports as a source
          // it can't play): its address is asked for again, and the song played from that — the layer
          // hands out a new vkey every time (checked). Once per song.
          if (!refreshed.has(mid) && streams.has(String(el.src || ''))) {
            refreshed.add(mid)
            post({ qqProbe: 'the CDN refused the stream; asking the layer for a new one' })
            setTimeout(() => loadCurrent(autoplay), 0)
            return
          }
          // Taken into the cab and refused there (a host that answered wrongly, a graph that
          // couldn't be made): given up for good, and this song played plainly instead. Without this
          // the element stayed on the refused path and the song never played at all.
          if (throughCab && !cabGaveUp) {
            cabGaveUp = true
            throughCab = false
            post({ qqProbe: 'the cab refused the song; giving it up and playing plainly' })
            const fresh = audio()
            if (!fresh.paused) fresh.pause()
            try {
              if (player.audio !== fresh) {
                player.audio?.remove?.()
              }
            } catch {}
            player.audio = null
            setTimeout(() => loadCurrent(autoplay), 0)
            return
          }
          tellPlayback()
        }
      }
    } catch (error) {
      if (token !== player.token) return
      player.loading = false
      post({ qqProbe: 'loadCurrent FAILED for ' + mid + ': ' + (error && (error.message || error)) })
      // A song the account may not play: on to the next one of the queue (a playlist's own songs are
      // partly paying ones: stopping there would leave the list unplayable past its first such song).
      if (error && error.noStream && player.queue.length > 1 && player.skipped < player.queue.length - 1) {
        player.skipped = (player.skipped ?? 0) + 1
        step(1)
        return
      }
      player.skipped = 0
      post({ playback: null })
    }
  }

  function onEnded() {
    if (player.repeat === 'one') {
      const el = audio()
      el.currentTime = 0
      el.play().catch(() => {})
      return
    }
    step(1)
  }

  function onError() {
    player.loading = false
    // A failed track: skip on repeat/all, otherwise stop here.
    if (player.repeat !== 'off') step(1)
    else tellPlayback()
  }

  // A shuffled round: the songs' numbers in the order it deals them, where in it the player is, the
  // ones it has played (by mid: a queue changed under it is still known), and the queue that order
  // was dealt for (a song added or taken out deals it again).
  let order = []
  let orderAt = 0
  let played = new Set()
  let orderOf = ''

  const dealt = (list) => {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  // Dealt again: what this round hasn't played first, what it played last at its end, so a song
  // just heard doesn't come round again at once.
  const deal = () => {
    const rest = []
    const past = []
    for (let i = 0; i < player.queue.length; i++) {
      if (i === player.index) continue
      ;(played.has(player.queue[i]) ? past : rest).push(i)
    }
    order = [...dealt(rest), ...dealt(past)]
    orderAt = 0
    orderOf = player.queue.join('|')
  }

  function step(dir) {
    if (player.queue.length === 0) return
    let next
    if (player.shuffle) {
      if (player.queue.length === 1) {
        next = player.index
      } else {
        if (orderOf !== player.queue.join('|')) deal()
        while (orderAt < order.length && order[orderAt] === player.index) orderAt++
        if (orderAt >= order.length) {
          played = new Set(order.slice(-8).map((i) => player.queue[i]))
          deal()
        }
        next = order[orderAt++]
        played.add(player.queue[next])
      }
    } else {
      next = player.index + dir
      if (next >= player.queue.length) next = player.repeat === 'all' ? 0 : -1
      // Past the first song: nowhere of its own to go (and asking again for the first one reloads
      // it, which is the hiccup a player hears going back at the start of a list).
      if (next < 0) next = 0
    }
    if (next === player.index && dir < 0) {
      // At the list's start already: restart what plays rather than load it over again.
      const el = audio()
      if (el) {
        el.currentTime = 0
        el.play().catch(() => {})
      }
      return
    }
    player.index = next
    loadCurrent(true)
  }

  const CONTROLS = {
    async play(msg) {
      const ids = (msg.songs ?? []).filter(Boolean)
      if (ids.length > 0) {
        player.queue = ids
        player.index = Math.min(msg.index ?? 0, ids.length - 1)
        player.context = null
      } else if (msg.id) {
        // A playlist/album by id: resolve its songs first; if that fails, treat the id as a song mid.
        let list = []
        try {
          list = await songsOfList(msg.id, msg.kind)
        } catch {
          // fall through
        }
        if (list.length > 0) {
          player.queue = list
          player.index = Math.min(msg.index ?? 0, list.length - 1)
          player.context = { id: msg.id, name: '', kind: 'playlist' }
        } else {
          player.queue = [msg.id]
          player.index = 0
          player.context = null
        }
      } else {
        audio().play().catch(() => {})
        return
      }
      player.shuffle = msg.shuffle ?? player.shuffle
      loadCurrent(true)
    },
    pause: () => window.westplayPauseOwn?.(audio()) ?? audio().pause(),
    next: () => step(1),
    previous: () => step(-1),
    seek: (msg) => {
      const el = audio()
      if (Number.isFinite(msg.seconds)) el.currentTime = Math.max(0, msg.seconds)
    },
    volume: (msg) => {
      player.volume = Math.min(1, Math.max(0, (msg.percent ?? 100) / 100))
      // A fade (the cab quietening it while reversing, or as the electrics go) isn't the player's
      // choice: `chosen` is, and it's the one the host keeps (qq_music.rs's VOLUME_FILE).
      if (!msg.transient) player.chosen = player.volume
      if (player.audio) player.audio.volume = player.volume
      tellPlayback()
    },
    shuffle: (msg) => {
      player.shuffle = !!msg.on
    },
    repeat: (msg) => {
      player.repeat = ['off', 'all', 'one'].includes(msg.mode) ? msg.mode : player.repeat
    },
    jump: (msg) => {
      const target = player.index + (msg.offset ?? 0)
      if (target >= 0 && target < player.queue.length) {
        player.index = target
        loadCurrent(true)
      }
    },
    favorite: () => {},
    add: () => {},
  }

  /** The cab's words (`cab_sound.js`): the speakers, the head, the camera and the tone. */
  const CAB = {
    speakers: (data) => sound?.speakers(data.speakers),
    head: (data) => {
      headReady = true
      sound?.head(data)
    },
    outside: (data) => sound?.outside(data.on, data.distance),
    equalizer: (data) => sound?.equalizer(data),
    spectrum: (data) => sound?.spectrum(data.on),
  }

  /**
   * One of the host's messages, as a command.
   *
   * Two ways in, both to this one place: `chrome.webview`'s own message event, and
   * `window.westplayRun` — which the host calls through `ExecuteScript` instead
   * (`qq_music.rs`'s `post_script`). A page that is a whole site of the site's own (`y.qq.com`)
   * can bring its own `chrome.webview` handlers and lose a posted one; Bilibili's page is reached
   * the same way, for the same reason (`bilibili.rs`'s `pass_script`).
   */
  const run = (data) => {
    if (data?.action === 'credential') {
      const cookies = typeof data.cookies === 'string' ? data.cookies : ''
      savedCookie = cookies
      // 退出登录（宿主发来的 cookies 是空的）：扫码留下的那份凭据也一起丢掉。不然它被写回 localStorage，
      // 下一页又读回来，报告“已登录”——账号就这么回来了（2026-11-28：点退出登录，账号没退）。
      if (!cookies) savedCred = null
      homeCache = null
      saveCredential()
      post({ signedIn: savedCred != null || savedCookie !== '', playing: false, avatar: null })
      return
    }
    // The cab's own first: its words aren't the app's commands.
    if (CAB[data?.action]) CAB[data.action](data)
    else if (data?.action === 'ask') answer(data.id, data.question)
    else
      Promise.resolve(CONTROLS[data?.action]?.(data)).catch((error) => {
        // Said, so a control that fails isn't just nothing happening (the app showed the same
        // screen either way).
        post({ qqProbe: '' + String(data?.action) + ' FAILED: ' + (error && (error.stack || error.message || "")) })
      })
  }

  window.westplayRun = (json) => {
    try {
      run(typeof json === 'string' ? JSON.parse(json) : json)
    } catch (error) {
      // A command of neither shape: nothing to do with it.
    }
  }

  window.chrome?.webview?.addEventListener('message', ({ data }) => run(data))

  // The page is ready: report the real login state. A restored cookie/credential from the persisted profile
  // means the session survived the restart, so report signed in; otherwise nothing plays yet.
    post({ ready: true })
  post({ signedIn: savedCred != null || savedCookie !== '', playing: false, avatar: null })
})()
