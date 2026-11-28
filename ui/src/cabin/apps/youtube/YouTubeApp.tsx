import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isInHost,
  type YouTubeAnswer,
  type YouTubeChannel,
  type YouTubeDynamic,
  type YouTubeMessage,
  type YouTubePlaylist,
  type YouTubeProfile,
  type YouTubeSection,
  type YouTubeUnread,
  type YouTubeVideo,
} from '../../../shared/host'
import { SearchGlyph } from '../../keyboard/glyphs'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import { googleLanguage, useText } from '../../state/text'
import {
  BackGlyph,
  CloseGlyph,
  FillGlyph,
  HistoryGlyph,
  PauseGlyph,
  PersonGlyph,
  PlayGlyph,
  QueueGlyph,
  RefreshGlyph,
} from './glyphs'
import {
  ask,
  clearSearches,
  clearWatched,
  command,
  currentSite,
  forgetSearch,
  goBack,
  type KnownPlaylist,
  openChannel,
  openPlaylist,
  openResults,
  openShelf,
  play,
  type Question,
  type SearchFilter,
  rememberSearch,
  reopenPlayer,
  setDark,
  setLanguage,
  setPage,
  setSection,
  signIn,
  signOut,
  stopVideo,
  useYouTube,
  type View,
  type Watched,
} from './youtube'
import { VideoHole } from './VideoHole'
import './youtube.css'
// Bilibili's own surfaces over YouTube's page (the same components): loaded after, so it wins.
import './bilibili.css'

const FIELD = 'youtube-search'

/**
 * The YouTube app (its player is the full-screen Player, over everything): YouTube's look, sized for the
 * cab. The search pill on top, and the player's picture (signed in) or Sign in beside it; under it Home
 * (signed in, YouTube's own Home and Subscriptions; otherwise what this PC has watched and searched),
 * YouTube's suggestions while typing, a search's results, or a channel's page (pages over Home, Back going
 * back through them). A video opens full screen.
 */
export function YouTubeApp() {
  const text = useText()
  const views = useYouTube((store) => store.views)
  const [query, setQuery] = useState('')
  const typing = useKeyboard((state) => state.field?.id === FIELD)
  const dark = useYouTube((store) => store.dark)
  const language = googleLanguage(useText().locale)
  useEffect(() => setLanguage(language), [language])
  // Left while watching: back to the video.
  useEffect(() => {
    if (useYouTube.getState().returnToPlayer) reopenPlayer(true)
  }, [])

  const search = (wanted: string) => {
    const trimmed = wanted.trim()
    if (!trimmed) return
    rememberSearch(trimmed)
    setQuery(trimmed)
    useKeyboard.getState().detach(FIELD)
    openResults(trimmed)
  }
  const back = () => {
    useKeyboard.getState().detach(FIELD)
    goBack()
  }
  // The field shows the search of the page showing (none on Home or a channel's page).
  const top = views.at(-1)
  const shownQuery = top?.kind === 'results' ? top.query : ''
  const [lastShown, setLastShown] = useState(shownQuery)
  if (shownQuery !== lastShown) {
    // Adjusting state during render: the field follows the page showing.
    setLastShown(shownQuery)
    setQuery(shownQuery)
  }

  return (
    <section
      className={
        currentSite() === 'bilibili'
          ? `app-panel youtube-app bilibili-app${dark ? ' bili-dark' : ''}`
          : 'app-panel youtube-app'
      }
      aria-label={text.apps.youtube}
    >
      <div className="yt-top">
        {views.length > 0 && !typing && (
          <button type="button" className="yt-round" aria-label={text.youtube.back} onClick={back}>
            <BackGlyph />
          </button>
        )}
        <TextField
          id={FIELD}
          value={query}
          onChange={setQuery}
          onSubmit={() => search(query)}
          returnKind="search"
          hint={text.youtube.search}
          label={text.youtube.search}
          icon={<SearchGlyph />}
        />
        {!typing && <Account />}
      </div>
      {!typing && <SigningIn />}
      {/* Bilibili's own rail down the left (YouTube has none): its pages, the one showing lit. */}
      {currentSite() === 'bilibili' && <BilibiliRail />}
      {/* Layers, each kept as it is under the one over it (closing the search, or going back, finds the
          page under as it was, its list and its scroll): Home, the pages over it, suggestions. */}
      <div className="yt-body">
        <div className={views.length === 0 && !typing ? 'yt-layer' : 'yt-layer away'}>
          <Home onSearch={search} />
        </div>
        {views.map((view, index) => (
          <div key={view.id} className={index === views.length - 1 && !typing ? 'yt-layer' : 'yt-layer away'}>
            <Page view={view} />
          </div>
        ))}
        {typing && (
          <div className="yt-layer">
            <Suggestions query={query} onSearch={search} onFill={setQuery} />
          </div>
        )}
      </div>
      {/* Bilibili's own page has no bar under it for the video playing: its player is the video's page, and
          leaving it closes the video (its rail is the way back). */}
      {!typing && currentSite() === 'youtube' && <NowPlaying />}
    </section>
  )
}

/**
 * Bilibili's own rail down the left of its page, as its own app's: 首页, 精选, 动态 and 我的, top to bottom,
 * the one showing lit in its pink; under them its messages and the page's own night. Each is a real page
 * (Bilibili's own interfaces answer them, `bilibili.js`). YouTube has no rail (its pages are chips across the
 * top).
 */
function BilibiliRail() {
  const section = useYouTube((store) => store.section)
  const page = useYouTube((store) => store.page)
  const dark = useYouTube((store) => store.dark)
  const account = useYouTube((store) => store.account)
  const items = [
    {
      id: 'home' as const,
      label: '首页',
      glyph: <path d="M3 10.5 12 3l9 7.5V21H3z" strokeLinejoin="round" />,
    },
    {
      id: 'selected' as const,
      label: '精选',
      glyph: (
        <path
          d="M12 3.6 14.9 9l5.9.9-4.3 4.2 1 5.9L12 17.1 6.5 20l1-5.9L3.2 9.9 9.1 9z"
          strokeLinejoin="round"
        />
      ),
    },
  ]
  // A section is lit while it is what shows (no page over it).
  const lit = (id: 'home' | 'selected') => page === null && section === id
  return (
    <nav className="bili-rail" aria-label="Bilibili">
      <div className="bili-rail-top">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={lit(item.id) ? 'bili-rail-item on' : 'bili-rail-item'}
            aria-pressed={lit(item.id)}
            onClick={() => setSection(item.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
              {item.glyph}
            </svg>
            <span>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={page === 'dynamics' ? 'bili-rail-item on' : 'bili-rail-item'}
          aria-pressed={page === 'dynamics'}
          onClick={() => setPage(page === 'dynamics' ? null : 'dynamics')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
            <circle cx="12" cy="12" r="2.3" />
            <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" strokeLinecap="round" />
            <path d="M5.6 5.6a9.1 9.1 0 0 0 0 12.8M18.4 5.6a9.1 9.1 0 0 1 0 12.8" strokeLinecap="round" />
          </svg>
          <span>动态</span>
        </button>
        <button
          type="button"
          className={page === 'profile' ? 'bili-rail-item on' : 'bili-rail-item'}
          aria-pressed={page === 'profile'}
          onClick={() => setPage(page === 'profile' ? null : 'profile')}
        >
          {account?.avatar ? (
            <img referrerPolicy="no-referrer" className="bili-rail-face" src={account.avatar} alt="" />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="8.2" r="3.4" />
              <path d="M5 20a7 7 0 0 1 14 0" strokeLinejoin="round" />
            </svg>
          )}
          <span>我的</span>
        </button>
      </div>
      {/* Bilibili's own tools under the rail: the player's messages, the page's own night. */}
      <div className="bili-rail-bottom">
        <button
          type="button"
          className={page === 'messages' ? 'bili-rail-tool on' : 'bili-rail-tool'}
          aria-label="消息"
          aria-pressed={page === 'messages'}
          onClick={() => setPage(page === 'messages' ? null : 'messages')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
            <path d="m3.8 7 8.2 6 8.2-6" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="bili-rail-tool"
          aria-label={dark ? '浅色模式' : '深色模式'}
          aria-pressed={dark}
          onClick={() => setDark(!dark)}
        >
          {dark ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4z" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </nav>
  )
}

/** A page over Home. */
function Page({ view }: { view: View }) {
  switch (view.kind) {
    case 'results':
      return <Results query={view.query} filter={view.filter} />
    case 'channel':
      return <ChannelPage channel={view.channel} />
    case 'playlist':
      return <PlaylistPage playlist={view.playlist} />
    case 'shelf':
      return <ShelfPage view={view} />
  }
}

/** The video playing while its player is closed (it plays on, heard), its picture moving in small: pressed,
 * it opens full screen again. */
function NowPlaying() {
  const text = useText()
  const current = useYouTube((store) => store.current)
  const open = useYouTube((store) => store.open)
  const state = useYouTube((store) => store.state)
  if (!current || open) return null
  const playing = state?.video === current.video && state.state === 1
  // The video itself once YouTube's player has it (in WestPlay), its thumbnail until then.
  const live = isInHost() && state?.video === current.video
  return (
    <div className="yt-now">
      <button type="button" className="yt-now-open" aria-label={text.youtube.nowPlaying} onClick={() => reopenPlayer()}>
        {live ? <VideoHole className="yt-thumb yt-now-video" /> : <Thumbnail video={current} />}
        <span className="yt-now-text">
          <span className="yt-title">{current.title}</span>
          <span className="yt-sub">{current.channel}</span>
        </span>
      </button>
      <button
        type="button"
        className="yt-round"
        aria-label={playing ? text.pause : text.play}
        onClick={() => command({ action: playing ? 'pause' : 'play' })}
      >
        {playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <button type="button" className="yt-round" aria-label={text.close} onClick={stopVideo}>
        <CloseGlyph />
      </button>
    </div>
  )
}

/** The player's picture, its menu holding Sign out; or, not signed in, Sign in. */
function Account() {
  const text = useText()
  const account = useYouTube((store) => store.account)
  const [menu, setMenu] = useState(false)
  if (!account) return null
  if (!account.signedIn) {
    return (
      <button type="button" className="yt-sign-in" onClick={signIn}>
        <PersonGlyph />
        {text.youtube.signIn}
      </button>
    )
  }
  return (
    <div className="yt-account">
      {account.mid && <span className="bili-mid">UID {account.mid}</span>}
      <button type="button" className="yt-me" aria-label={text.youtube.signOut} onClick={() => setMenu(!menu)}>
        {account.avatar ? <img referrerPolicy="no-referrer" src={account.avatar} alt="" /> : <PersonGlyph />}
      </button>
      {menu && (
        <div className="yt-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              signOut()
            }}
          >
            {text.youtube.signOut}
          </button>
        </div>
      )}
    </div>
  )
}

/** While Google's sign-in is open on the PC: where to finish it. */
function SigningIn() {
  const text = useText()
  const signingIn = useYouTube((store) => store.signingIn)
  return signingIn ? (
    <p className="yt-signing-in" role="status">
      <PersonGlyph />
      {text.youtube.finishOnPc}
    </p>
  ) : null
}

/** Home: signed in, YouTube's own; otherwise this PC's. Bilibili's own front page is the same recency feed
 * signed in or not (its recommendations don't need an account), so it's always the signed-in Home there. */
function Home({ onSearch }: { onSearch(query: string): void }) {
  const signedIn = useYouTube((store) => store.account?.signedIn ?? false)
  if (currentSite() === 'bilibili') return <BilibiliHome />
  return signedIn ? <SignedInHome onSearch={onSearch} /> : <LocalHome onSearch={onSearch} />
}

/**
 * Bilibili's own page beside its rail: the player's own (their numbers and their lists), their messages, their
 * 动态, or the section's list (its front page, its selection, its ranking, its series).
 */
function BilibiliHome() {
  const page = useYouTube((store) => store.page)
  if (page === 'profile') return <BilibiliProfile />
  if (page === 'messages') return <BilibiliMessages />
  if (page === 'dynamics') return <BilibiliDynamics />
  return <BilibiliSection />
}

/** The player's own page, as Bilibili's own shows it: the banner (their picture, name, level, coins and
 * numbers), the tabs, and the tab's own videos (with when each was watched). */
function BilibiliProfile() {
  const account = useYouTube((store) => store.account)
  const [profile, setProfile] = useState<YouTubeProfile | null>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const [kind, setKind] = useState<'history' | 'favorites' | 'later'>('history')
  useEffect(() => {
    if (!account?.signedIn) {
      setProfile(null)
      setStatus('done')
      return
    }
    let current = true
    setStatus('loading')
    ask({ action: 'profile' }).then((answer) => {
      if (!current) return
      setProfile(answer.failed ? null : (answer.profile ?? null))
      setStatus(answer.failed ? 'failed' : 'done')
    })
    return () => {
      current = false
    }
  }, [account?.signedIn])

  if (!account?.signedIn) {
    return (
      <div className="yt-scroll">
        <p className="yt-start">登录 Bilibili 后，这里是你自己的主页。</p>
      </div>
    )
  }
  const tabs = [
    { id: 'history' as const, label: '历史记录' },
    { id: 'favorites' as const, label: '我的收藏' },
    { id: 'later' as const, label: '稍后再看' },
  ]
  const avatar = profile?.avatar ?? account.avatar ?? null
  return (
    <VideoList
      key={kind}
      layout="grid"
      header={
        <>
          <div className="bili-me">
            <div className="bili-me-banner">
              <span className="bili-me-art" aria-hidden="true" />
              {avatar ? (
                <img referrerPolicy="no-referrer" className="bili-me-face" src={avatar} alt="" />
              ) : (
                <span className="bili-me-face blank" />
              )}
              <span className="bili-me-text">
                <span className="bili-me-name-row">
                  <span className="bili-me-name">{profile?.name || account.name || '我的'}</span>
                  {profile && profile.level > 0 && <span className="bili-me-level">LV{profile.level}</span>}
                  {profile?.vip && <span className="bili-me-vip">大会员</span>}
                </span>
                <span className="bili-me-coins">
                  <span>B币 {profile?.bcoins || '0'}</span>
                  <span>硬币 {profile?.coins || '0'}</span>
                </span>
              </span>
              {profile && (
                <span className="bili-me-numbers">
                  <span>
                    <b>{profile.videos}</b> 投稿
                  </span>
                  <span>
                    <b>{profile.following}</b> 关注
                  </span>
                  <span>
                    <b>{profile.followers}</b> 粉丝
                  </span>
                </span>
              )}
              {profile && (
                <button
                  type="button"
                  className="bili-me-space"
                  onClick={() =>
                    openChannel({ channel: profile.mid, name: profile.name, avatar: profile.avatar })
                  }
                >
                  空间 ›
                </button>
              )}
            </div>
            {status === 'failed' && <p className="bili-me-error">Bilibili 没有说清楚你的主页，下面的列表仍是它的。</p>}
            <div className="bili-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={kind === tab.id ? 'bili-tab on' : 'bili-tab'}
                  aria-pressed={kind === tab.id}
                  onClick={() => setKind(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </>
      }
      question={(more) =>
        more ? { action: 'library', kind, more } : { action: 'library', kind }
      }
    />
  )
}

/** The player's messages: its own tabs (its chats, the replies, the @s, the likes), a row per message. */
function BilibiliMessages() {
  const account = useYouTube((store) => store.account)
  const [kind, setKind] = useState<'chat' | 'reply' | 'at' | 'like'>('chat')
  const [messages, setMessages] = useState<YouTubeMessage[]>([])
  const [unread, setUnread] = useState<YouTubeUnread | null>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!account?.signedIn) {
      setMessages([])
      setStatus('done')
      return
    }
    let current = true
    setStatus('loading')
    ask({ action: 'messages', kind }).then((answer) => {
      if (!current) return
      setMessages(answer.failed ? [] : (answer.messages ?? []))
      setUnread(answer.failed ? null : (answer.unread ?? null))
      setStatus(answer.failed ? 'failed' : 'done')
    })
    return () => {
      current = false
    }
  }, [kind, account?.signedIn, tries])

  if (!account?.signedIn) {
    return (
      <div className="yt-scroll">
        <p className="yt-start">登录 Bilibili 后，这里是你收到的消息。</p>
      </div>
    )
  }
  const tabs = [
    { id: 'chat' as const, label: '聊天列表', badge: 0 },
    { id: 'reply' as const, label: '回复我的', badge: unread?.reply ?? 0 },
    { id: 'at' as const, label: '@我的', badge: unread?.at ?? 0 },
    { id: 'like' as const, label: '收到的赞', badge: unread?.like ?? 0 },
  ]
  // A summary row opens its own tab (the chat list's rows are Bilibili's four kinds).
  const opens = (id: string) =>
    id === '1' ? 'reply' : id === '2' ? 'at' : id === '3' ? 'like' : 'chat'
  return (
    <div className="yt-scroll bili-msg">
      <div className="bili-msg-head">
        <span className="bili-msg-title">消息</span>
        <span className="bili-msg-gear" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 3.4v2M12 18.6v2M3.4 12h2M18.6 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      <div className="bili-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={kind === tab.id ? 'bili-tab on' : 'bili-tab'}
            aria-pressed={kind === tab.id}
            onClick={() => setKind(tab.id)}
          >
            {tab.label}
            {tab.badge > 0 && <span className="bili-dot">{tab.badge > 99 ? '99+' : tab.badge}</span>}
          </button>
        ))}
      </div>
      {status === 'loading' && <p className="yt-note">正在读取…</p>}
      {status === 'failed' && (
        <p className="yt-note">
          Bilibili 没有响应。{' '}
          <button type="button" className="yt-chip" onClick={() => setTries(tries + 1)}>
            重试
          </button>
        </p>
      )}
      {status === 'done' && messages.length === 0 && <p className="yt-note">这里还没有消息。</p>}
      {messages.map((message) => (
        <button
          key={message.id}
          type="button"
          className="bili-msg-row"
          onClick={() => {
            if (message.kind === 'notice') setKind(opens(message.id))
          }}
        >
          {message.avatar ? (
            <img referrerPolicy="no-referrer" className="bili-msg-face" src={message.avatar} alt="" />
          ) : (
            <span className="bili-msg-face blank" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                <path d="m3.8 7 8.2 6 8.2-6" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          <span className="bili-msg-body">
            <span className="bili-msg-name">{message.name}</span>
            <span className="bili-msg-text">{message.text}</span>
          </span>
          <span className="bili-msg-time">{message.time}</span>
          {message.unread && <span className="bili-msg-unread">未读</span>}
        </button>
      ))}
    </div>
  )
}

/** The player's 动态: the UP 主s they follow down the left, their cards in the flow (all of them, or the
 * videos only), a page more as the flow nears its end. */
function BilibiliDynamics() {
  const account = useYouTube((store) => store.account)
  const [video, setVideo] = useState(false)
  const [cards, setCards] = useState<YouTubeDynamic[]>([])
  const [more, setMore] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const asking = useRef(false)
  const load = useCallback(
    (next: string | null) => {
      if (asking.current) return
      asking.current = true
      if (!next) setStatus('loading')
      const question: Question = next
        ? { action: 'dynamics', video, more: next }
        : { action: 'dynamics', video }
      ask(question).then((answer) => {
        asking.current = false
        if (answer.failed) {
          setStatus('failed')
          return
        }
        setCards((before) => {
          const seen = new Set(before.map((card) => card.id))
          return [...before, ...(answer.dynamics ?? []).filter((card) => !seen.has(card.id))]
        })
        setMore(answer.more ?? null)
        setStatus('done')
      })
    },
    [video],
  )
  useEffect(() => {
    setCards([])
    setMore(null)
    load(null)
  }, [load])

  if (!account?.signedIn) {
    return (
      <div className="yt-scroll">
        <p className="yt-start">登录 Bilibili 后，这里是你关注的 UP 主的动态。</p>
      </div>
    )
  }
  // The UP 主s the cards are from, top to bottom: their own column down the left, each opening their page.
  const ups: { id: string; name: string; avatar: string | null }[] = []
  for (const card of cards) {
    if (!card.channelId || ups.some((up) => up.id === card.channelId)) continue
    ups.push({ id: card.channelId, name: card.author, avatar: card.avatar })
    if (ups.length >= 12) break
  }
  return (
    <div
      className="yt-scroll bili-dyn"
      onScroll={(event) => {
        const element = event.currentTarget
        if (more && status === 'done' && element.scrollTop + element.clientHeight > element.scrollHeight - element.clientHeight * 0.8) {
          load(more)
        }
      }}
    >
      <aside className="bili-dyn-ups">
        <button type="button" className="bili-dyn-up on">
          <span className="bili-dyn-up-all" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
            </svg>
          </span>
          <span className="bili-dyn-up-name">全部动态</span>
        </button>
        {ups.map((up) => (
          <button
            key={up.id}
            type="button"
            className="bili-dyn-up"
            onClick={() => openChannel({ channel: up.id, name: up.name, avatar: up.avatar })}
          >
            {up.avatar ? (
              <img referrerPolicy="no-referrer" className="bili-dyn-up-face" src={up.avatar} alt="" />
            ) : (
              <span className="bili-dyn-up-face blank" />
            )}
            <span className="bili-dyn-up-name">{up.name}</span>
          </button>
        ))}
      </aside>
      <div className="bili-dyn-flow">
        <div className="bili-tabs">
          <button type="button" className={!video ? 'bili-tab on' : 'bili-tab'} aria-pressed={!video} onClick={() => setVideo(false)}>
            综合
          </button>
          <button type="button" className={video ? 'bili-tab on' : 'bili-tab'} aria-pressed={video} onClick={() => setVideo(true)}>
            视频
          </button>
        </div>
        {cards.map((card) => (
          <BilibiliDynamicCard key={card.id} card={card} />
        ))}
        {status === 'loading' && <p className="yt-note">正在读取…</p>}
        {status === 'failed' && (
          <p className="yt-note">
            Bilibili 没有响应。{' '}
            <button type="button" className="yt-chip" onClick={() => load(null)}>
              重试
            </button>
          </p>
        )}
        {status === 'done' && cards.length === 0 && <p className="yt-note">关注的 UP 主还没有新动态。</p>}
      </div>
    </div>
  )
}

/** One of the player's 动态: who, when and what, its words, its video or pictures, and its numbers. */
function BilibiliDynamicCard({ card }: { card: YouTubeDynamic }) {
  const counts = [card.forwards, card.comments, card.likes].filter(Boolean)
  const labels = ['转发', '评论', '点赞']
  return (
    <article className="bili-dyn-card">
      <header className="bili-dyn-head">
        {card.avatar ? (
          <img referrerPolicy="no-referrer" className="bili-dyn-face" src={card.avatar} alt="" />
        ) : (
          <span className="bili-dyn-face blank" />
        )}
        <span className="bili-dyn-who">
          <span className="bili-dyn-name">{card.author}</span>
          <span className="bili-dyn-meta">{[card.time, card.action].filter(Boolean).join(' · ')}</span>
        </span>
      </header>
      {card.text && <p className="bili-dyn-text">{card.text}</p>}
      {card.video && (
        <button type="button" className="bili-dyn-video" onClick={() => play(card.video as YouTubeVideo)}>
          <Thumbnail video={card.video} />
          <span className="bili-dyn-video-text">
            <span className="bili-dyn-video-title">{card.video.title}</span>
            <span className="bili-dyn-video-sub">
              {[card.video.views, card.video.duration].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
      )}
      {card.pictures.length > 0 && (
        <div className="bili-dyn-pictures">
          {card.pictures.map((picture) => (
            <img key={picture} referrerPolicy="no-referrer" src={picture} alt="" loading="lazy" />
          ))}
        </div>
      )}
      <footer className="bili-dyn-actions">
        {counts.length === 0
          ? labels.map((label) => (
              <span key={label}>{label}</span>
            ))
          : counts.map((count, index) => (
              <span key={labels[index]}>
                {count} {labels[index]}
              </span>
            ))}
      </footer>
    </article>
  )
}

/** Bilibili's own section (its rail's): its front page's feed, its selection, its ranking, its bangumi or its
 * films, with the tabs of the ones beside it. */
function BilibiliSection() {
  const section = useYouTube((store) => store.section)
  // A press of 刷新 asks the section's own list again (a new list: its `key`).
  const [round, setRound] = useState(0)
  // The rail's own lists, Bilibili's titles for them. Live rooms were one of them: taken out (owner
  // 2026-11-26) — a room's picture is laid out by Bilibili for a desktop page with its chat rail, its
  // 点播台 and its clock, and those are mixed into the stream itself, so the screen could never show the
  // room alone. Nothing here offers one now, and no room id is ever asked for.
  const titles: Record<typeof section, string> = {
    home: '推荐',
    selected: '精选',
    ranking: '热门',
    bangumi: '追番',
    film: '影视',
  }
  const tabs = [
    { id: 'home' as const, label: '推荐' },
    { id: 'ranking' as const, label: '热门' },
    { id: 'bangumi' as const, label: '追番' },
    { id: 'film' as const, label: '影视' },
  ]
  return (
    <div className="bili-section">
      <div className="bili-head">
        <span className="bili-head-title">{titles[section]}</span>
        <div className="bili-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={section === tab.id ? 'bili-tab on' : 'bili-tab'}
              aria-pressed={section === tab.id}
              onClick={() => setSection(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {section === 'bangumi' || section === 'film' ? (
        /* Its 追番 and 影视 pages are rows, not one list: what was watched, then Bilibili's recommendations. */
        <BilibiliShelves key={`${section}:${round}`} which={section} />
      ) : (
        <VideoList
          key={`${section}:${round}`}
          layout="grid"
          question={(more) => (more ? { action: 'feed', which: section, more } : { action: 'feed', which: section })}
        />
      )}
      {/* Its own 刷新, in the corner of the list. */}
      <button
        type="button"
        className="bili-refresh"
        aria-label="刷新"
        title="刷新"
        onClick={() => setRound(round + 1)}
      >
        <RefreshGlyph />
      </button>
    </div>
  )
}

/** Bilibili's 追番 or 影视 page: its rows, not one list — what the player watched last (wide, its 我的追番
 * beside it), then Bilibili's recommendations (posters, each with its 查看更多). */
function BilibiliShelves({ which }: { which: 'bangumi' | 'film' }) {
  const [sections, setSections] = useState<YouTubeSection[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    setSections(null)
    setFailed(false)
    ask({ action: 'sections', which }).then((answer) => {
      if (!current) return
      if (answer.failed) {
        setFailed(true)
        return
      }
      setSections(answer.sections ?? [])
    })
    return () => {
      current = false
    }
  }, [which])
  const keeps = which === 'bangumi' ? '我的追番' : '我的追剧'
  return (
    <div className="yt-scroll bili-shelves">
      {failed && <p className="yt-note">Bilibili 没有响应。</p>}
      {sections === null && !failed && (
        <div className="bili-shelf">
          <div className="bili-shelf-head">
            <span className="bili-shelf-title">&nbsp;</span>
          </div>
          <div className="bili-shelf-row wide">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="bili-season wide yt-skeleton" role="progressbar">
                <span className="bili-season-cover" />
                <span className="yt-skeleton-line" />
                <span className="yt-skeleton-line short" />
              </div>
            ))}
          </div>
        </div>
      )}
      {(sections ?? []).map((section) => (
        <section key={section.title} className="bili-shelf">
          <div className="bili-shelf-head">
            <span className="bili-shelf-title">{section.title}</span>
            <button
              type="button"
              className="bili-more"
              onClick={() =>
                section.row === 'my'
                  ? openShelf(keeps, 'my', which === 'film')
                  : openShelf(section.title, section.row, which === 'film')
              }
            >
              {section.row === 'my' ? keeps : '查看更多'}
            </button>
          </div>
          <div className={section.wide ? 'bili-shelf-row wide' : 'bili-shelf-row'}>
            {section.items.map((video) => (
              <SeasonCard key={video.video} video={video} wide={Boolean(section.wide)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** A season's card on a series page: its cover (16:9 when it's a keep, 3:4 as a poster), its badge in the
 * corner, its title and Bilibili's own line under it. Pressed, its page opens and plays. */
function SeasonCard({ video, wide }: { video: YouTubeVideo; wide: boolean }) {
  return (
    <button type="button" className={wide ? 'bili-season wide' : 'bili-season'} onClick={() => play(video)}>
      <span className={wide ? 'bili-season-cover' : 'bili-season-cover poster'}>
        {video.thumbnail ? (
          <img referrerPolicy="no-referrer" src={video.thumbnail} alt="" loading="lazy" />
        ) : (
          <span className="yt-thumb-blank" />
        )}
        {video.badge && <span className="bili-season-badge">{video.badge}</span>}
      </span>
      <span className="yt-title">{video.title}</span>
      <span className="yt-sub">{[video.channel, video.age].filter(Boolean).join(' · ')}</span>
    </button>
  )
}

/** One row of a series page, all of it (its 查看更多), a page of seasons at a time. */
function ShelfPage({ view }: { view: { kind: 'shelf'; title: string; row: string; film: boolean; id: number } }) {
  const [items, setItems] = useState<YouTubeVideo[]>([])
  const [more, setMore] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const asking = useRef(false)
  const load = useCallback(
    (next: string | null) => {
      if (asking.current) return
      asking.current = true
      setStatus('loading')
      ask({ action: 'shelf', row: view.row, film: view.film, more: next ?? undefined }).then((answer) => {
        asking.current = false
        if (answer.failed) {
          setStatus('failed')
          return
        }
        setItems((before) => {
          const seen = new Set(before.map((video) => video.video))
          return [...before, ...(answer.videos ?? []).filter((video) => !seen.has(video.video))]
        })
        setMore(answer.more ?? null)
        setStatus('done')
      })
    },
    [view.row, view.film],
  )
  useEffect(() => load(null), [load])
  const wide = view.row === 'my'
  return (
    <div
      className="yt-scroll bili-shelves"
      onScroll={(event) => {
        const element = event.currentTarget
        const nearEnd = element.scrollTop + element.clientHeight > element.scrollHeight - element.clientHeight * 0.8
        if (more && status === 'done' && nearEnd) load(more)
      }}
    >
      <section className="bili-shelf">
        <div className="bili-shelf-head">
          <span className="bili-shelf-title">{view.title}</span>
        </div>
        <div className={wide ? 'bili-shelf-row wide' : 'bili-shelf-row'}>
          {items.map((video) => (
            <SeasonCard key={video.video} video={video} wide={wide} />
          ))}
          {status === 'loading' &&
            Array.from({ length: wide ? 5 : 7 }, (_, index) => (
              <div key={index} className={wide ? 'bili-season wide yt-skeleton' : 'bili-season yt-skeleton'} role="progressbar">
                <span className={wide ? 'bili-season-cover' : 'bili-season-cover poster'} />
                <span className="yt-skeleton-line" />
                <span className="yt-skeleton-line short" />
              </div>
            ))}
        </div>
      </section>
      {status === 'failed' && (
        <p className="yt-note">
          Bilibili 没有响应。{' '}
          <button type="button" className="yt-chip" onClick={() => load(items.length > 0 ? more : null)}>
            重试
          </button>
        </p>
      )}
    </div>
  )
}

/** A signed-in player's Home: YouTube's recommendations, or (a chip away) their Subscriptions, as cards two
 * across; the other chips search. */
function SignedInHome({ onSearch }: { onSearch(query: string): void }) {
  const text = useText()
  const [feed, setFeed] = useState<'home' | 'subscriptions'>('home')
  const bilibili = currentSite() === 'bilibili'
  return (
    <>
      <div className="yt-chips">
        {(bilibili ? (['home'] as const) : (['home', 'subscriptions'] as const)).map((which) => (
          <button
            key={which}
            type="button"
            className={feed === which ? 'yt-chip on' : 'yt-chip'}
            aria-pressed={feed === which}
            onClick={() => setFeed(which)}
          >
            {which === 'home' ? text.youtube.home : text.youtube.subscriptions}
          </button>
        ))}
        {text.youtube.chips.map((chip) => (
          <button key={chip.label} type="button" className="yt-chip" onClick={() => onSearch(chip.query)}>
            {chip.label}
          </button>
        ))}
      </div>
      <VideoList
        key={feed}
        layout="grid"
        question={(more) => (more ? { action: 'feed', which: feed, more } : { action: 'feed', which: feed })}
      />
    </>
  )
}

/** Home not signed in: the chips (each a search), the videos watched here and the searches made here. */
function LocalHome({ onSearch }: { onSearch(query: string): void }) {
  const text = useText()
  const watched = useYouTube((store) => store.watched)
  const searches = useYouTube((store) => store.searches)
  return (
    <div className="yt-scroll yt-home">
      <div className="yt-chips">
        {text.youtube.chips.map((chip) => (
          <button key={chip.label} type="button" className="yt-chip" onClick={() => onSearch(chip.query)}>
            {chip.label}
          </button>
        ))}
      </div>
      {watched.length === 0 && searches.length === 0 && <p className="yt-start">{text.youtube.start}</p>}
      {watched.length > 0 && (
        <section>
          <SectionTitle title={text.youtube.continueWatching} onClear={clearWatched} />
          <div className="yt-shelf">
            {watched.slice(0, 12).map((w) => (
              <ShelfCard key={w.video.video} watched={w} />
            ))}
          </div>
        </section>
      )}
      {searches.length > 0 && (
        <section>
          <SectionTitle title={text.youtube.recentSearches} onClear={clearSearches} />
          <div className="yt-chips wrap">
            {searches.map((s) => (
              <span key={s} className="yt-chip yt-recent">
                <button type="button" className="yt-chip-search" onClick={() => onSearch(s)}>
                  <HistoryGlyph />
                  {s}
                </button>
                <button
                  type="button"
                  className="yt-chip-forget"
                  aria-label={text.youtube.forget}
                  onClick={() => forgetSearch(s)}
                >
                  <CloseGlyph />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** A Home section's title, and its Clear (it forgets what's kept on this PC). */
function SectionTitle({ title, onClear }: { title: string; onClear(): void }) {
  const text = useText()
  return (
    <div className="yt-section-title">
      <h3 className="yt-section">{title}</h3>
      <button type="button" className="yt-clear" onClick={onClear}>
        {text.youtube.clear}
      </button>
    </div>
  )
}

/** A video watched before, on Home's shelf: how far it got under its thumbnail. */
function ShelfCard({ watched }: { watched: Watched }) {
  const { video, time, duration } = watched
  return (
    <button type="button" className="yt-card" onClick={() => play(video)}>
      <Thumbnail video={video} progress={duration > 0 ? time / duration : 0} />
      <span className="yt-title">{video.title}</span>
      <span className="yt-sub">{video.channel}</span>
    </button>
  )
}

/** YouTube's suggestions as the player types (theirs first: the searches made here that match). */
function Suggestions({
  query,
  onSearch,
  onFill,
}: {
  query: string
  onSearch(q: string): void
  onFill(q: string): void
}) {
  const text = useText()
  const searches = useYouTube((store) => store.searches)
  const [suggested, setSuggested] = useState<{ query: string; list: string[] }>({ query: '', list: [] })
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return
    let current = true
    // A pause in the typing before asking.
    const timer = setTimeout(() => {
      ask({ action: 'suggest', query }).then((answer) => {
        if (current) setSuggested({ query, list: answer.suggestions ?? [] })
      })
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  const typed = query.trim().toLocaleLowerCase()
  const past = (typed ? searches.filter((s) => s.toLocaleLowerCase().startsWith(typed)) : searches).slice(0, 4)
  const theirs = (typed && suggested.query.trim() ? suggested.list : []).filter(
    (s) => !past.some((p) => p.toLocaleLowerCase() === s.toLocaleLowerCase()),
  )
  const rows = [...past.map((s) => ({ s, past: true })), ...theirs.map((s) => ({ s, past: false }))].slice(0, 7)

  return (
    <div className="yt-scroll yt-suggestions">
      {/* Before anything's typed: the searches made here, and their Clear. */}
      {!typed && past.length > 0 && <SectionTitle title={text.youtube.recentSearches} onClear={clearSearches} />}
      {rows.map(({ s, past: isPast }) => (
        <div key={`${isPast}:${s}`} className="yt-suggestion">
          <button type="button" className="yt-suggestion-search" onClick={() => onSearch(s)}>
            {isPast ? <HistoryGlyph /> : <SearchGlyph />}
            <span>
              {/* What's typed plain, the rest bold, as YouTube shows them. */}
              {s.toLocaleLowerCase().startsWith(typed) ? (
                <>
                  {s.slice(0, typed.length)}
                  <b>{s.slice(typed.length)}</b>
                </>
              ) : (
                <b>{s}</b>
              )}
            </span>
          </button>
          <button
            type="button"
            className="yt-suggestion-fill"
            aria-label={text.youtube.fill}
            onClick={() => onFill(`${s} `)}
          >
            <FillGlyph />
          </button>
        </div>
      ))}
    </div>
  )
}

/** A search's results, a row per video or playlist (the channels found first), or (the chips) channels or
 * playlists only. */
function Results({ query, filter }: { query: string; filter: SearchFilter }) {
  const text = useText()
  const filters: { filter: SearchFilter; label: string }[] = [
    { filter: 'all', label: text.youtube.all },
    ...(currentSite() === 'bilibili'
      ? ([
          { filter: 'bangumi', label: '番剧' },
          { filter: 'film', label: '影视' },
        ] as const)
      : []),
    { filter: 'channels', label: text.youtube.channels },
    { filter: 'playlists', label: text.youtube.playlists },
  ]
  return (
    <>
      <div className="yt-chips">
        {filters.map((chip) => (
          <button
            key={chip.filter}
            type="button"
            className={filter === chip.filter ? 'yt-chip on' : 'yt-chip'}
            aria-pressed={filter === chip.filter}
            onClick={() => filter !== chip.filter && openResults(query, chip.filter)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <VideoList
        layout="rows"
        question={(more) => {
          const asked: Question = more ? { action: 'search', query, more } : { action: 'search', query }
          return filter === 'all' ? asked : { ...asked, filter }
        }}
      />
    </>
  )
}

/** A playlist's page: its cover, title, channel and YouTube's counts, and Play all; then its videos, in
 * order. A video pressed plays in it: the playlist goes on from there. */
function PlaylistPage({ playlist: known }: { playlist: KnownPlaylist }) {
  const text = useText()
  const [playlist, setPlaylist] = useState<KnownPlaylist>(known)
  // The playlist's videos as loaded so far, and the token for more: the queue a video plays in.
  const [loaded, setLoaded] = useState<{ videos: YouTubeVideo[]; more: string | null }>({ videos: [], more: null })
  const playFrom = (video: YouTubeVideo) =>
    play(video, true, { playlist: known.playlist, title: playlist.title, videos: loaded.videos, more: loaded.more })
  return (
    <VideoList
      layout="rows"
      header={
        <div className="yt-playlist-head">
          <PlaylistThumbnail playlist={playlist} />
          <div className="yt-playlist-text">
            <h2>{playlist.title}</h2>
            {playlist.channel && (
              <ChannelLink video={{ channel: playlist.channel, channelId: playlist.channelId }} className="yt-channel">
                {playlist.channel}
              </ChannelLink>
            )}
            <span className="yt-sub">{[playlist.count, playlist.views].filter(Boolean).join(' · ')}</span>
            <button
              type="button"
              className="yt-play-all"
              disabled={loaded.videos.length === 0}
              onClick={() => playFrom(loaded.videos[0])}
            >
              <PlayGlyph />
              {text.youtube.playAll}
            </button>
          </div>
        </div>
      }
      onAnswer={(answer) => {
        if (answer.playlist) setPlaylist(answer.playlist)
        setLoaded((before) => {
          const seen = new Set(before.videos.map((v) => v.video))
          const added = (answer.videos ?? []).filter((v) => !seen.has(v.video))
          return { videos: [...before.videos, ...added], more: answer.more ?? null }
        })
      }}
      onPlay={playFrom}
      question={(more) =>
        more ? { action: 'playlist', playlist: known.playlist, more } : { action: 'playlist', playlist: known.playlist }
      }
    />
  )
}

/** A playlist a search found: its cover (a stack), its title, channel and count; pressed, its page. */
function PlaylistRow({ playlist }: { playlist: YouTubePlaylist }) {
  const text = useText()
  return (
    <div role="button" tabIndex={0} className="yt-row" onClick={() => openPlaylist(playlist)}>
      <PlaylistThumbnail playlist={playlist} />
      <span className="yt-row-text">
        <span className="yt-title">{playlist.title}</span>
        <span className="yt-sub">{text.youtube.playlist}</span>
        {playlist.channel && (
          <ChannelLink video={playlist} className="yt-channel">
            {playlist.channel}
          </ChannelLink>
        )}
      </span>
    </div>
  )
}

/** A playlist's cover: its first video's thumbnail on a stack (YouTube's look for a playlist), its count on it. */
function PlaylistThumbnail({ playlist }: { playlist: KnownPlaylist }) {
  return (
    <span className="yt-stack">
      <span className="yt-thumb">
        {playlist.thumbnail ? (
          <img src={playlist.thumbnail} alt="" loading="lazy" />
        ) : (
          <span className="yt-thumb-blank" />
        )}
        {playlist.count && (
          <span className="yt-badge yt-count">
            <QueueGlyph />
            {playlist.count}
          </span>
        )}
      </span>
    </span>
  )
}

/** A channel's page: its banner, picture, name and YouTube's words for it, then its videos, two across. */
function ChannelPage({
  channel: known,
}: {
  channel: View & { kind: 'channel' } extends { channel: infer C } ? C : never
}) {
  const [channel, setChannel] = useState<Partial<YouTubeChannel> & { name: string }>(known)
  return (
    <VideoList
      layout="grid"
      header={
        <div className="yt-channel-head">
          {channel.banner && <img className="yt-banner" src={channel.banner} alt="" />}
          <div className="yt-channel-who">
            <ChannelAvatar channel={channel} large />
            <div className="yt-channel-text">
              <h2>{channel.name}</h2>
              <span className="yt-sub">
                {[channel.handle, channel.subscribers, channel.videos].filter(Boolean).join(' · ')}
              </span>
            </div>
            {typeof channel.subscribed === 'boolean' && (
              <SubscribeButton
                channel={known.channel}
                subscribed={channel.subscribed}
                onChange={(subscribed) => setChannel((before) => ({ ...before, subscribed }))}
              />
            )}
          </div>
        </div>
      }
      onAnswer={(answer) => {
        if (answer.channel) setChannel(answer.channel)
      }}
      question={(more) =>
        more ? { action: 'channel', channel: known.channel, more } : { action: 'channel', channel: known.channel }
      }
    />
  )
}

/** YouTube's Subscribe (white) / Subscribed (grey) pill, for the signed-in player: it changes as it's
 * pressed, and back if YouTube refuses. */
function SubscribeButton({
  channel,
  subscribed,
  onChange,
}: {
  channel: string
  subscribed: boolean
  onChange(subscribed: boolean): void
}) {
  const text = useText()
  const [asking, setAsking] = useState(false)
  return (
    <button
      type="button"
      className={subscribed ? 'yt-subscribe subscribed' : 'yt-subscribe'}
      aria-pressed={subscribed}
      disabled={asking}
      onClick={() => {
        const on = !subscribed
        onChange(on)
        setAsking(true)
        ask({ action: 'subscribe', channel, on }).then((answer) => {
          setAsking(false)
          if (answer.failed) onChange(!on)
        })
      }}
    >
      {subscribed ? text.youtube.subscribed : text.youtube.subscribe}
    </button>
  )
}

/**
 * Videos YouTube lists (a search's, a feed's, a channel's, a playlist's), more asked for as the list nears its
 * end: a row per video, or cards two across; a search's channels on top, its playlists among its videos
 * where YouTube put them. `question` asks for the first videos (`more` null) or the next ones; `header` sits
 * above, scrolling with them; `onAnswer` hears each answer; `onPlay` plays a video pressed (otherwise it
 * plays on its own).
 */
function VideoList({
  question,
  layout,
  header,
  onAnswer,
  onPlay = (video) => play(video),
}: {
  question(more: string | null): Question
  layout: 'rows' | 'grid'
  header?: React.ReactNode
  onAnswer?(answer: YouTubeAnswer): void
  onPlay?(video: YouTubeVideo): void
}) {
  const text = useText()
  // The videos, and the playlists each with where it goes: before the video at `at` (at the end past them).
  const [{ videos, playlists }, setList] = useState<{
    videos: YouTubeVideo[]
    playlists: (YouTubePlaylist & { at: number })[]
  }>({ videos: [], playlists: [] })
  const [channels, setChannels] = useState<YouTubeChannel[]>([])
  const [more, setMore] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  // The list asks with the question it started with (a new question is a new list: its `key`).
  const asked = useRef({ question, onAnswer })
  const asking = useRef(false)
  // A failed ask on Bilibili's own lists is asked again by itself, twice (its interfaces answer slowly now and
  // then, a first one a moment after opening the page failing): the player then sees it come up, not a retry
  // button. YouTube's own asks stay as they are (its failure is YouTube's to report).
  const tries = useRef(0)
  const load = useCallback((next: string | null) => {
    if (asking.current) return
    asking.current = true
    setStatus('loading')
    ask(asked.current.question(next)).then((answer: YouTubeAnswer) => {
      asking.current = false
      if (answer.failed) {
        if (currentSite() === 'bilibili' && tries.current < 2) {
          tries.current++
          setTimeout(() => load(next), 700)
          return
        }
        setStatus('failed')
        return
      }
      tries.current = 0
      asked.current.onAnswer?.(answer)
      setList((before) => {
        // YouTube can list a video twice across pages.
        const seen = new Set(before.videos.map((v) => v.video))
        const added = (answer.videos ?? []).filter((v) => !seen.has(v.video))
        // The answer's playlists after the videos already listed, where they sit among its own.
        const found = (answer.playlists ?? [])
          .filter((p) => !before.playlists.some((had) => had.playlist === p.playlist))
          .map((p) => ({ ...p, at: before.videos.length + Math.min(p.after, added.length) }))
        return { videos: [...before.videos, ...added], playlists: [...before.playlists, ...found] }
      })
      if (answer.channels?.length) setChannels((before) => [...before, ...(answer.channels ?? [])])
      setMore(answer.more ?? null)
      setStatus('done')
    })
  }, [])
  useEffect(() => load(null), [load])

  const nearEnd = (element: HTMLDivElement) =>
    element.scrollTop + element.clientHeight > element.scrollHeight - element.clientHeight * 0.8
  return (
    <div
      className={layout === 'grid' ? 'yt-scroll yt-grid' : 'yt-scroll yt-results'}
      onScroll={(event) => {
        if (more && status === 'done' && nearEnd(event.currentTarget)) load(more)
      }}
    >
      {header}
      {channels.map((channel) => (
        <button key={channel.channel} type="button" className="yt-channel-row" onClick={() => openChannel(channel)}>
          <span className="yt-channel-row-picture">
            <ChannelAvatar channel={channel} large />
          </span>
          <span className="yt-row-text">
            <span className="yt-title">{channel.name}</span>
            <span className="yt-sub">{[channel.handle, channel.subscribers].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      ))}
      {videos.map((video, index) => [
        ...playlists.filter((p) => p.at === index).map((p) => <PlaylistRow key={p.playlist} playlist={p} />),
        layout === 'grid' ? (
          <div
            key={video.video}
            role="button"
            tabIndex={0}
            className="yt-card yt-feed-card"
            onClick={() => onPlay(video)}
          >
            <Thumbnail video={video} />
            <span className="yt-meta">
              <ChannelLink video={video}>
                <Avatar video={video} />
              </ChannelLink>
              <span className="yt-meta-text">
                <span className="yt-title">{video.title}</span>
                <span className="yt-sub">{[video.channel, video.views, video.age].filter(Boolean).join(' · ')}</span>
              </span>
            </span>
          </div>
        ) : (
          <div key={video.video} role="button" tabIndex={0} className="yt-row" onClick={() => onPlay(video)}>
            <Thumbnail video={video} />
            <span className="yt-row-text">
              <span className="yt-title">{video.title}</span>
              <span className="yt-sub">{[video.views, video.age].filter(Boolean).join(' · ')}</span>
              <ChannelLink video={video} className="yt-channel">
                <Avatar video={video} />
                {video.channel}
              </ChannelLink>
            </span>
          </div>
        ),
      ])}
      {playlists
        .filter((p) => p.at >= videos.length)
        .map((p) => (
          <PlaylistRow key={p.playlist} playlist={p} />
        ))}
      {status === 'loading' && <Skeletons layout={layout} count={videos.length > 0 ? 2 : layout === 'grid' ? 6 : 5} />}
      {status === 'done' && videos.length === 0 && channels.length === 0 && playlists.length === 0 && (
        <p className="yt-note">{text.youtube.noResults}</p>
      )}
      {status === 'failed' && (
        <p className="yt-note">
          {currentSite() === 'bilibili' ? 'Bilibili 没有响应。' : text.youtube.failed}{' '}
          <button type="button" className="yt-chip" onClick={() => load(videos.length ? more : null)}>
            {text.youtube.tryAgain}
          </button>
        </p>
      )}
    </div>
  )
}

/** Videos still coming: grey shapes of the cards or rows they'll be, breathing (YouTube's own way to wait). */
function Skeletons({ layout, count }: { layout: 'rows' | 'grid'; count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) =>
        layout === 'grid' ? (
          <div key={index} className="yt-card yt-feed-card yt-skeleton" role="progressbar">
            <span className="yt-thumb" />
            <span className="yt-meta">
              <span className="yt-avatar" />
              <span className="yt-meta-text">
                <span className="yt-skeleton-line" />
                <span className="yt-skeleton-line short" />
              </span>
            </span>
          </div>
        ) : (
          <div key={index} className="yt-row yt-skeleton" role="progressbar">
            <span className="yt-thumb" />
            <span className="yt-row-text">
              <span className="yt-skeleton-line" />
              <span className="yt-skeleton-line short" />
              <span className="yt-channel">
                <span className="yt-avatar" />
                <span className="yt-skeleton-line shorter" />
              </span>
            </span>
          </div>
        ),
      )}
    </>
  )
}

/** A video's channel, pressed: the channel's page (the video's own press is not). Plain without its id. */
function ChannelLink({
  video,
  className,
  children,
}: {
  /** A video's or a playlist's channel: its name, and its id and picture when known. */
  video: { channel: string; channelId?: string; avatar?: string | null }
  className?: string
  children: React.ReactNode
}) {
  if (!video.channelId) return <span className={className}>{children}</span>
  const id = video.channelId
  return (
    <button
      type="button"
      className={className ? `yt-channel-link ${className}` : 'yt-channel-link'}
      onClick={(event) => {
        event.stopPropagation()
        openChannel({ channel: id, name: video.channel, avatar: video.avatar ?? null })
      }}
    >
      {children}
    </button>
  )
}

/** A channel's round picture (its initial without one). */
function ChannelAvatar({
  channel,
  large = false,
}: {
  channel: { name: string; avatar?: string | null }
  large?: boolean
}) {
  const className = large ? 'yt-avatar large' : 'yt-avatar'
  return channel.avatar ? (
    <img className={className} src={channel.avatar} alt="" loading="lazy" />
  ) : (
    <span className={`${className} blank`}>{channel.name.slice(0, 1).toLocaleUpperCase()}</span>
  )
}

/** A video's thumbnail, rounded, with its duration (or LIVE) and how much of it was watched. */
export function Thumbnail({ video, progress = 0 }: { video: YouTubeVideo; progress?: number }) {
  const text = useText()
  return (
    <span className="yt-thumb">
      {video.thumbnail ? <img referrerPolicy="no-referrer" src={video.thumbnail} alt="" loading="lazy" /> : <span className="yt-thumb-blank" />}
      {video.live ? (
        <span className="yt-badge live">{text.youtube.live}</span>
      ) : (
        video.duration && <span className="yt-badge">{video.duration}</span>
      )}
      {progress > 0 && <span className="yt-progress" style={{ width: `${Math.min(100, progress * 100)}%` }} />}
    </span>
  )
}

/** The channel's round picture (its initial without one). */
function Avatar({ video }: { video: YouTubeVideo }) {
  return video.avatar ? (
    <img className="yt-avatar" src={video.avatar} alt="" loading="lazy" />
  ) : (
    <span className="yt-avatar blank">{video.channel.slice(0, 1).toLocaleUpperCase()}</span>
  )
}
