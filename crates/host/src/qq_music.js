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

  const BASE = 'http://127.0.0.1:__WESTPLAY_QQ_LAYER_PORT__'

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
  const fetchAllSongs = async (path, key = 'songs') => {
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

  const cookieValue = (name) => {
    if (!savedCookie) return ''
    const match = savedCookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
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
    return headers
  }

  /**
   * A middle-layer request. `options.anon`: made without the account's credential, for the site's
   * own list for everyone (which a signed-in request no longer answers with: see `home`).
   */
  const get = async (path, options = {}) => {
    const response = await fetch(`${BASE}${path}`, {
      headers: { accept: 'application/json', ...(options.anon ? {} : credentialHeaders()) },
    })
    // Too many asked at once (the layer's own limit, 429): waited for, a few times, rather than
    // failing a page that would have answered a moment later.
    if (response.status === 429) {
      const attempt = options.attempt ?? 0
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
        return get(path, { ...options, attempt: attempt + 1 })
      }
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json()
    if (body && body.code !== undefined && body.code !== 0) throw new Error(`layer code ${body.code}`)
    return body?.data ?? {}
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
   * The radar's picks, a page at a time. The layer's own list for a signed-in account comes 5 at a
   * time (`has_more` saying there are more), so asking once showed the app five songs where the
   * site shows a scrolling list (owner 2026-11-16). Pages are asked for until one repeats or says
   * there are no more, up to `RADAR_PAGES`.
   */
  const RADAR_PAGES = 6
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

  /** One feed's shelves as the app's sections (its cards mapped by `feedCard`). */
  const feedSections = (feed) => {
    const sections = []
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
      sections.push({
        title: title || '为你推荐',
        style: listable ? 'songs' : 'shelf',
        items: listable ? [] : cards.filter((card) => card.kind !== 'song'),
        songs: listable
          ? songCards.map((card) => ({
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
            }))
          : [],
      })
    }
    return sections
  }

  let homeCache = null
  const home = async () => {
    if (homeCache) return homeCache
    // Signed out: its own answer is the anonymous one anyway, asking again before a sign-in
    // would keep it (`saveCredential` clears this when the credential arrives).
    const feed = await get('/recommend/get_home_feed')
    const sections = feedSections(feed)

    // The site's shelves for everyone as well, merged under the account's own: signed in it drops
    // the general ones (大家都在听, 排行榜, 为你精选的AI歌单 …) and keeps only its own picks, and the
    // app showed them before a sign-in (owner 2026-11-16). A shelf of the same title stays one (the
    // account's own standing where the general one was).
    try {
      const general = feedSections(await get('/recommend/get_home_feed', { anon: true }))
      const known = new Set(sections.map((section) => section.title))
      for (const section of general) {
        // The site's own daily slot (今日为你打造: 每日30首, 百万收藏, 歌手漫游, 新歌推荐) is asked for
        // without a credential, so its cards are everyone's — its '每日30首' opens a page built from
        // the account's radar instead, which isn't that list at all (owner 2026-11-16: taken out of
        // the anonymous part, the rest as they were).
        if (section.items.some((item) => item.id === 'qqdaily')) continue
        if (!known.has(section.title)) sections.push(section)
      }
    } catch {
      // The general list is a second helping: without it the account's own still shows.
    }

    if (sections.length > 0) {
      // The radar's picks under them: the one list that stays a list of songs to play, and it isn't
      // one of the feed's shelves (the app showed it before, and its players' lists would go with
      // it otherwise).
      const picks = (await fetchRadar()).map(track)
      if (picks.length > 0) {
        sections.push({ title: '雷达推荐', style: 'songs', items: [], songs: picks })
      }
      // Kept only for a signed-in account: a page that asked before the credential arrived gets
      // the anonymous list, and keeping it would hide the account's own for the whole run.
      const answer = { sections }
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
          songs: (news.songs ?? []).map(track),
        },
        {
          title: '雷达推荐',
          style: 'songs',
          items: [],
          songs: radar.map(track),
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
        playlists: (hot.vec_hotkey ?? []).map(hotkeyItem),
        stations: [],
      }
    }
    const found = await get(`/search/general_search?keyword=${encodeURIComponent(query)}&num=15`)
    return {
      top: [],
      songs: (found.song?.items ?? []).map(track),
      artists: (found.singer?.items ?? []).map(artistItem),
      albums: (found.album?.items ?? []).map(albumItem),
      playlists: (found.songlist?.items ?? []).map(playlistItem),
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
    const fav = await fetchAllSongs(`/user/${encodeURIComponent(euin)}/fav/songs`)
    const favSongs = fav.songs
    const base = home?.Info?.BaseInfo ?? home?.base_info ?? {}
    const out = EMPTY_COLLECTION()
    out.item = {
      id: String(euin),
      kind: 'curator',
      name: escapeHtml(base.Name || base.name || '我的音乐'),
      by: '我的收藏',
      note: '',
      image: base.Avatar ?? base.avatar ?? null,
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
      post({ answer: id, failed: true })
      return
    }
    for (const wait of [0, 600]) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      try {
        post({ answer: id, [question.ask]: await asked(question) })
        return
      } catch {
        // Once more, or failed.
      }
    }
    post({ answer: id, failed: true })
  }

  // --- Player: a hidden <audio> fed by the layer's stream URLs ------------------------------------------------

  const CDN = 'https://isure.stream.qqmusic.qq.com/'


  const player = {
    // How many songs in a row had no stream (a paying one): reset by anything the player itself
    // does, so a queue of them doesn't spin for ever.
    skipped: 0,
    audio: null,
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
      el.addEventListener('error', onError)
    }
    return player.audio
  }

  const currentMid = () => player.queue[player.index] ?? null

  /** Whether this song may be taken into the cab's graph: a cab there, not given up, and the head known. */
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
          'PROBE cab levels ' +
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
      post({ qqProbe: 'PROBE the cab plays nothing at all; playing as it is' })
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

  const streamOf = async (mid) => {
    const found = await get(`/song/${encodeURIComponent(mid)}/url`)
    const list = Array.isArray(found) ? found : found?.data
    const item = list?.[0]
    if (!item || item.result !== 0 || !item.purl) {
      // What the layer says of it: a song of an album or playlist that only a paying account may
      // play (or one pulled from the site) has no stream at all (`result` 104003 and its like).
      const why = item ? `result ${item.result}` : 'no entry'
      const pairs = credentialPairs()
      post({
        qqProbe:
          'PROBE no stream: ' +
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
    return CDN + item.purl
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
    const route =
      kind === 'top'
        ? `/top/${encodeURIComponent(text)}/detail?num=30`
        : numeric
          ? `/songlist/${encodeURIComponent(text)}/detail?num=30`
          : kind === 'artist'
            ? `/singer/${encodeURIComponent(text)}/songs?num=30`
            : `/album/${encodeURIComponent(text)}/songs?num=30`
    const found = await get(route)
    const songs = found.songs ?? found.song_list ?? []
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
    try {
      const [meta, url] = await Promise.all([metaOf(mid), streamOf(mid)])
      if (token !== player.token) return // superseded by a newer play/skip
      player.track = meta
      // The cab takes the song once the host has said where the driver's head is; until then it plays as
      // it is (and neither does one whose host refused the browser's permission).
      takeIntoCab()
      const el = audio()
      // Paused before the source changes: handing a new address to an element that's playing makes it
      // jump (a click in the sound) before the new one starts.
      if (!el.paused) el.pause()
      el.src = url
      el.volume = player.volume
      if (autoplay) {
        try {
          await el.play()
          checkAudible()
        } catch (error) {
          post({ qqProbe: 'PROBE audio.play() FAILED: ' + (error && (error.name + ': ' + error.message)) })
          player.loading = false
          tellPlayback()
        }
      }
    } catch (error) {
      if (token !== player.token) return
      player.loading = false
      post({ qqProbe: 'PROBE loadCurrent FAILED for ' + mid + ': ' + (error && (error.message || error)) })
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

  function step(dir) {
    if (player.queue.length === 0) return
    let next
    if (player.shuffle) {
      next =
        player.queue.length === 1
          ? player.index
          : (() => {
              let pick
              do {
                pick = Math.floor(Math.random() * player.queue.length)
              } while (pick === player.index)
              return pick
            })()
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
    pause: () => audio().pause(),
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

  window.chrome?.webview?.addEventListener('message', ({ data }) => {
    if (data?.action === 'credential') {
      savedCookie = typeof data.cookies === 'string' ? data.cookies : ''
      // A sign-in (or another account's): the feed kept is another's now.
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
        post({ qqProbe: 'PROBE ' + String(data?.action) + ' FAILED: ' + (error && (error.stack || error.message || error)) })
      })
  })

  // The page is ready: report the real login state. A restored cookie/credential from the persisted profile
  // means the session survived the restart, so report signed in; otherwise nothing plays yet.
    post({ ready: true })
  post({ signedIn: savedCred != null || savedCookie !== '', playing: false, avatar: null })
})()
