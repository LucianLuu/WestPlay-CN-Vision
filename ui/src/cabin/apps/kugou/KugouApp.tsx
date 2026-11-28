import { type ReactNode, useEffect, useRef, useState } from 'react'
import { TextField } from '../../keyboard/TextField'
import { useKeyboard } from '../../keyboard/store'
import { useText } from '../../state/text'
import { LyricLines } from '../netease/NowPlaying'
import { SpeakerGlyph } from '../music/glyphs'
import {
  type Book,
  type Playlist,
  type Rank,
  type Song,
  followLayer,
  setVolume,
  useKuGou,
} from './kugou'
import logo from './logo.png'
import './kugou.css'

const FIELD = 'kugou-search'

/** What the app says, in its own words (the cab's own language, as the other apps do). */
const WORDS = {
  music: '音乐',
  ranks: '排行榜',
  singers: '歌手',
  recent: '最近播放',
  home: '推荐',
  picks: '今日专属推荐',
  other: '换一批',
  back: '返回',
  search: '搜索歌曲',
  searchHint: '搜索歌曲',
  loading: '正在加载…',
  failed: '音乐数据层没有响应',
  retry: '重试',
  empty: '这里还没有歌',
  playAll: '播放全部',
  songs: '首',
  chapters: '集',
  more: '加载更多',
  noLyrics: '这首歌没有歌词',
  lyricsFailed: '歌词没有取到',
  blocked: '这首歌需要酷狗会员，已跳过',
  blockedAll: '这里的歌都要酷狗会员，换一首吧',
  plays: '播放',
  // 听书, 我的收藏 and the QR sign-in: the client's own three, whose data KuGou does have.
  audiobooks: '听书',
  allBooks: '全部',
  favorites: '我的收藏',
  favoritesNote: '扫码登录后，这里会列出你收藏的歌单',
  favoritesEmpty: '收藏里还没有歌单',
  favoritesFailed: '收藏没有取到',
  signIn: '扫码登录',
  signInTitle: '扫码登录酷狗',
  signInHint: '用酷狗音乐 App 扫一下这个码',
  signInScanned: '扫到了，在手机上确认一下',
  signInExpired: '二维码过期了，换一张',
  signInRefresh: '换一张',
  signInDone: '登录成功',
  signOut: '退出登录',
}

// --- small glyphs -----------------------------------------------------------------------------

function Glyph({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none">
      <path d={d} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const PlayGlyph = () => <Glyph d="M8 5.5v13l11-6.5z" />
const PauseGlyph = () => <Glyph d="M9 6v12M15 6v12" />
const NextGlyph = () => <Glyph d="M15 6v12l-7-6zM6 6v12" size={20} />
const PrevGlyph = () => <Glyph d="M9 6v12l7-6zM18 6v12" size={20} />
const LyricsGlyph = () => <Glyph d="M5 7h14M5 12h9M5 17h11" />
const SearchGlyph = () => <Glyph d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16.5 16.5 21 21" size={20} />
const BackGlyph = () => <Glyph d="m14 5-7 7 7 7" size={22} />
const CloseGlyph = () => <Glyph d="m6 6 12 12M18 6 6 18" size={22} />
const UpGlyph = () => <Glyph d="m6 14 6-6 6 6" size={22} />
const RecentGlyph = () => <Glyph d="M12 4a8 8 0 1 0 8 8M12 8v4l3 2" />
const ChartGlyph = () => <Glyph d="M5 19v-5M10 19v-9M15 19v-13M20 19v-3" />
const MicGlyph = () => <Glyph d="M12 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3ZM6 11a6 6 0 0 0 12 0M12 17v3" />
// 听书's own (a book), 我的收藏 (a heart), and the QR sign-in's four corners.
const BookGlyph = () => <Glyph d="M5 5h6v14H5zM13 5h6v14h-6zM11 5v14" />
const HeartGlyph = () => <Glyph d="M12 19s-7-4.3-7-9a3.8 3.8 0 0 1 7-1.6A3.8 3.8 0 0 1 19 10c0 4.7-7 9-7 9z" />
const QrGlyph = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" fill="none">
    <path
      d="M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h2v2h-2zM19 15h1M15 19h5"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// --- the app -----------------------------------------------------------------------------------

/**
 * KuGou Music, self-drawn: 音乐 (its 推荐), 排行榜, 歌单 and 歌手 in the rail and over the page's own tabs, 最近播放 under
 * them, and the player at the foot. The songs come from the shared layer (`netease_layer/kugou.py`, the same
 * process NetEase's app asks), and its Now Playing is NetEase's own words page (NowPlaying.tsx `LyricLines`).
 */
export function KugouApp() {
  return <KugouScreen />
}

function KugouScreen() {
  const text = useText()
  const view = useKuGou((state) => state.view)
  const back = useKuGou((state) => state.back)
  const [query, setQuery] = useState('')
  const typing = useKeyboard((state) => state.field?.id === FIELD)
  const stopTyping = () => useKeyboard.getState().detach(FIELD)

  // The layer is the host's (shared with NetEase's app): its port is asked once, as the app opens.
  useEffect(() => followLayer(), [])
  useEffect(() => {
    void useKuGou.getState().loadHome()
    void useKuGou.getState().loadAccount()
  }, [])

  const go = (to: 'home' | 'ranks' | 'singers' | 'recent' | 'audiobooks' | 'favorites') => {
    stopTyping()
    const state = useKuGou.getState()
    switch (to) {
      case 'home':
        state.openHome()
        break
      case 'ranks':
        void state.openRanks()
        break
      case 'singers':
        void state.openSingers()
        break
      case 'audiobooks':
        void state.openAudiobooks()
        break
      case 'favorites':
        void state.openFavorites()
        break
      case 'recent':
        state.open({ kind: 'recent' })
        break
    }
  }
  const search = (wanted: string) => {
    const trimmed = wanted.trim()
    if (!trimmed) return
    setQuery(trimmed)
    stopTyping()
    void useKuGou.getState().search(trimmed)
  }

  return (
    <section className="app-panel kg-app" aria-label={text.apps.kugou}>
      <Rail view={view} onGo={go} />
      <div className="kg-main">
        <div className="kg-top">
          {back.length > 0 ? (
            <button
              type="button"
              className="kg-round"
              aria-label={WORDS.back}
              onClick={() => {
                stopTyping()
                useKuGou.getState().goBack()
              }}
            >
              <BackGlyph />
            </button>
          ) : (
            <span className="kg-brand-inline" aria-hidden="true">
              <img src={logo} alt="" draggable={false} />
            </span>
          )}
          <nav className="kg-tabs" aria-hidden={typing}>
            {TABS.map((each) => (
              <button
                key={each.to}
                type="button"
                className={tabOn(view, each.to) && !typing ? 'kg-tab on' : 'kg-tab'}
                aria-pressed={tabOn(view, each.to)}
                tabIndex={typing ? -1 : undefined}
                onClick={() => go(each.to)}
              >
                {each.label}
              </button>
            ))}
          </nav>
          <div className="kg-search">
            <TextField
              id={FIELD}
              value={query}
              onChange={setQuery}
              onSubmit={() => search(query)}
              returnKind="search"
              hint={WORDS.searchHint}
              label={WORDS.search}
              icon={<SearchGlyph />}
            />
          </div>
          <AccountButton />
        </div>
        <div className="kg-body">
          <Page view={view} />
        </div>
        <PlayerBar aside={typing} />
        <BlockedNote />
      </div>
      <LoginPanel />
      <NowPlayingView />
    </section>
  )
}

/** The client's four tabs, in its own order (歌单广场 is gone: its songs are 今日专属推荐's own pages). */
const TABS: { label: string; to: 'home' | 'ranks' | 'singers' | 'recent' }[] = [
  { label: WORDS.home, to: 'home' },
  { label: WORDS.ranks, to: 'ranks' },
  { label: WORDS.singers, to: 'singers' },
  { label: WORDS.recent, to: 'recent' },
]

function tabOn(view: ReturnType<typeof useKuGou.getState>['view'], to: 'home' | 'ranks' | 'singers' | 'recent'): boolean {
  switch (to) {
    case 'home':
      return view.kind === 'home'
    case 'ranks':
      return view.kind === 'ranks' || view.kind === 'rank'
    case 'singers':
      return view.kind === 'singers' || view.kind === 'singer'
    case 'recent':
      return view.kind === 'recent'
  }
}

/** The top right's own: 扫码登录 when nobody is, and who it is when someone is. */
function AccountButton() {
  const account = useKuGou((state) => state.account)
  const login = useKuGou((state) => state.login)
  if (account.signedIn) {
    return (
      <button type="button" className="kg-account on" onClick={() => void useKuGou.getState().openFavorites()}>
        <span className="kg-account-face">
          {account.avatar ? <img src={account.avatar} alt="" draggable={false} /> : <span>{account.nickname.slice(0, 1) || '我'}</span>}
        </span>
        <span className="kg-account-name">{account.nickname || '已登录'}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      className={login.open ? 'kg-account qr on' : 'kg-account qr'}
      onClick={() => void useKuGou.getState().startLogin()}
    >
      <QrGlyph />
      <span className="kg-account-name">{WORDS.signIn}</span>
    </button>
  )
}

/**
 * The sign-in panel: KuGou's own QR (the picture the layer asked for), polled while it is open — 1 waiting,
 * 2 scanned, 4 signed in, 0 expired. A signed-in account is kept by the layer, so it survives a restart.
 */
function LoginPanel() {
  const login = useKuGou((state) => state.login)
  const account = useKuGou((state) => state.account)

  useEffect(() => {
    if (!login.open || login.status === 0 || login.status === 4) return
    const timer = window.setInterval(() => void useKuGou.getState().checkLogin(), 2000)
    return () => window.clearInterval(timer)
  }, [login.open, login.status, login.key])

  if (!login.open) return null
  const note =
    login.status === 4
      ? WORDS.signInDone
      : login.status === 2
        ? WORDS.signInScanned
        : login.status === 0
          ? WORDS.signInExpired
          : WORDS.signInHint
  return (
    <div className="kg-login" role="dialog" aria-label={WORDS.signInTitle} onClick={() => useKuGou.getState().closeLogin()}>
      <div className="kg-login-card" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="kg-login-close" aria-label="关闭" onClick={() => useKuGou.getState().closeLogin()}>
          <CloseGlyph />
        </button>
        <h2 className="kg-login-title">{WORDS.signInTitle}</h2>
        {login.image && login.status !== 4 ? (
          <span className="kg-login-qr">
            <img src={login.image} alt="" draggable={false} />
          </span>
        ) : (
          <span className="kg-login-qr blank">{login.busy ? <span className="kg-spin" /> : <QrGlyph />}</span>
        )}
        <p className={login.status === 0 ? 'kg-login-note warn' : 'kg-login-note'}>{account.signedIn ? `${WORDS.signInDone}：${account.nickname || account.userId}` : note}</p>
        {(login.status === 0 || account.signedIn) && (
          <button type="button" className="kg-more wide" onClick={() => void useKuGou.getState().startLogin()}>
            {WORDS.signInRefresh}
          </button>
        )}
        {account.signedIn && (
          <button type="button" className="kg-login-out" onClick={() => void useKuGou.getState().signOutAccount()}>
            {WORDS.signOut}
          </button>
        )}
      </div>
    </div>
  )
}

// --- the rail ----------------------------------------------------------------------------------

function Rail({
  view,
  onGo,
}: {
  view: ReturnType<typeof useKuGou.getState>['view']
  onGo(to: 'home' | 'ranks' | 'singers' | 'recent' | 'audiobooks' | 'favorites'): void
}) {
  const account = useKuGou((state) => state.account)
  return (
    <aside className="kg-rail">
      <div className="kg-brand">
        <span className="kg-brand-mark">
          <img src={logo} alt="" draggable={false} />
        </span>
        <div className="kg-brand-text">
          <strong>酷狗音乐</strong>
          <small>就是歌多</small>
        </div>
      </div>
      <nav className="kg-rail-items">
        <RailItem label={WORDS.music} on={view.kind === 'home'} glyph={<MicGlyph />} onClick={() => onGo('home')} />
        <RailItem label={WORDS.ranks} on={view.kind === 'ranks' || view.kind === 'rank'} glyph={<ChartGlyph />} onClick={() => onGo('ranks')} />
        <RailItem label={WORDS.singers} on={view.kind === 'singers' || view.kind === 'singer'} glyph={<MicGlyph />} onClick={() => onGo('singers')} />
        <RailItem
          label={WORDS.audiobooks}
          on={view.kind === 'audiobooks' || view.kind === 'audiobook'}
          glyph={<BookGlyph />}
          onClick={() => onGo('audiobooks')}
        />
      </nav>
      <div className="kg-rail-rule" />
      <nav className="kg-rail-items">
        <RailItem
          label={WORDS.favorites}
          on={view.kind === 'favorites'}
          glyph={<HeartGlyph />}
          onClick={() => onGo('favorites')}
        />
        <RailItem label={WORDS.recent} on={view.kind === 'recent'} glyph={<RecentGlyph />} onClick={() => onGo('recent')} />
      </nav>
      <p className="kg-rail-note">{account.signedIn ? account.nickname || '已登录' : WORDS.favoritesNote}</p>
    </aside>
  )
}

function RailItem({ label, on, glyph, onClick }: { label: string; on: boolean; glyph: ReactNode; onClick(): void }) {
  return (
    <button type="button" className={on ? 'kg-rail-item on' : 'kg-rail-item'} aria-pressed={on} onClick={onClick}>
      <span className="kg-rail-glyph">{glyph}</span>
      <span>{label}</span>
    </button>
  )
}

// --- the pages ---------------------------------------------------------------------------------

function Page({ view }: { view: ReturnType<typeof useKuGou.getState>['view'] }) {
  switch (view.kind) {
    case 'home':
      return <HomePage />
    case 'ranks':
      return <RanksPage />
    case 'singers':
      return <SingersPage />
    case 'recent':
      return <RecentPage />
    case 'results':
      return <TrackPage kind="results" name={`“${view.query}”`} />
    case 'playlist':
      return <TrackPage kind="playlist" name={view.name} picture={view.picture} note={view.creator} />
    case 'rank':
      return <TrackPage kind="rank" name={view.name} picture={view.picture} />
    case 'singer':
      return <TrackPage kind="singer" name={view.name} picture={view.picture} />
    case 'audiobooks':
      return <BooksPage tag={view.tag} />
    case 'audiobook':
      return <TrackPage kind="audiobook" name={view.name} picture={view.picture} />
    case 'favorites':
      return <FavoritesPage />
    default:
      return null
  }
}

/** 听书: the app's own shelf, a tag at a time (KuGou's free audiobook list, its chapters play like songs). */
function BooksPage({ tag }: { tag: string }) {
  const books = useKuGou((state) => state.books)
  const tags = useKuGou((state) => state.bookTags)
  const more = useKuGou((state) => state.booksMore)
  const loading = useKuGou((state) => state.loading)
  const failed = useKuGou((state) => state.failed)
  const top = tags[0]
  const chips: { id: string; name: string }[] = [
    { id: '906', name: WORDS.allBooks },
    ...((top?.children ?? []).map((each) => ({ id: each.id, name: each.name }))),
  ]
  return (
    <div className="kg-page">
      <h1 className="kg-title">{WORDS.audiobooks}</h1>
      {chips.length > 1 && (
        <div className="kg-chips">
          {chips.map((each) => (
            <button
              key={each.id}
              type="button"
              className={tag === each.id ? 'kg-chip on' : 'kg-chip'}
              onClick={() => void useKuGou.getState().openAudiobooks(each.id, each.name)}
            >
              {each.name}
            </button>
          ))}
        </div>
      )}
      {books.length === 0 ? (
        <Loading failed={failed} onRetry={() => void useKuGou.getState().openAudiobooks(tag)} />
      ) : (
        <div className="kg-book-grid">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
      {books.length > 0 && more && (
        <div className="kg-page-foot">
          <button type="button" className="kg-more wide" onClick={() => void useKuGou.getState().openAudiobooks(tag, '', true)}>
            {loading ? WORDS.loading : WORDS.more}
          </button>
        </div>
      )}
    </div>
  )
}

function BookCard({ book }: { book: Book }) {
  // KuGou writes a book's tags into its name ("九域凡仙|凡人修仙|爽文"): the page shows the title alone.
  const title = book.name.split('|')[0].trim() || book.name
  return (
    <button type="button" className="kg-book" onClick={() => void useKuGou.getState().openAudiobook(book)}>
      <span className="kg-book-cover">
        {book.picture ? <img src={book.picture} alt="" loading="lazy" draggable={false} /> : <span className="kg-blank" />}
      </span>
      <span className="kg-book-text">
        <strong className="kg-book-name">{title}</strong>
        <small className="kg-book-note">
          {book.chapters > 0 ? `${book.chapters} ${WORDS.chapters}` : book.note}
          {book.plays > 0 ? ` · ${playsOf(book.plays)} ${WORDS.plays}` : ''}
        </small>
      </span>
    </button>
  )
}

/** 我的收藏: the account's playlists; a guest is asked to scan the QR rather than shown an empty shelf. */
function FavoritesPage() {
  const favorites = useKuGou((state) => state.favorites)
  const note = useKuGou((state) => state.favoritesNote)
  const loading = useKuGou((state) => state.loading)
  const account = useKuGou((state) => state.account)
  if (!account.signedIn || note === 'signin') {
    return (
      <div className="kg-page">
        <h1 className="kg-title">{WORDS.favorites}</h1>
        <div className="kg-gate">
          <span className="kg-gate-mark">
            <QrGlyph />
          </span>
          <p>{WORDS.favoritesNote}</p>
          <button type="button" className="kg-play-all" onClick={() => void useKuGou.getState().startLogin()}>
            {WORDS.signIn}
          </button>
        </div>
      </div>
    )
  }
  if (loading && favorites.length === 0) {
    return (
      <div className="kg-page">
        <h1 className="kg-title">{WORDS.favorites}</h1>
        <Loading failed="" onRetry={() => void useKuGou.getState().openFavorites()} />
      </div>
    )
  }
  if (favorites.length === 0) {
    return (
      <div className="kg-page">
        <h1 className="kg-title">{WORDS.favorites}</h1>
        <p className="kg-note">{note === 'layer' ? WORDS.favoritesFailed : WORDS.favoritesEmpty}</p>
      </div>
    )
  }
  return (
    <div className="kg-page">
      <h1 className="kg-title">{WORDS.favorites}</h1>
      <div className="kg-grid">
        {favorites.map((pick) => (
          <PlaylistCard key={pick.id} pick={pick} />
        ))}
      </div>
    </div>
  )
}

function Loading({ failed, onRetry }: { failed: string; onRetry(): void }) {
  if (!failed) return <p className="kg-note">{WORDS.loading}</p>
  return (
    <div className="kg-failed">
      <p>{WORDS.failed}</p>
      <button type="button" onClick={onRetry}>
        {WORDS.retry}
      </button>
    </div>
  )
}

function EntryCard({ title, note, glyph, tone, onClick }: { title: string; note: string; glyph: ReactNode; tone: string; onClick(): void }) {
  return (
    <button type="button" className={`kg-entry ${tone}`} onClick={onClick}>
      <span className="kg-entry-icon">{glyph}</span>
      <span className="kg-entry-text">
        <strong>{title}</strong>
        <small>{note}</small>
      </span>
    </button>
  )
}

function HomePage() {
  const picks = useKuGou((state) => state.picks)
  const loading = useKuGou((state) => state.loading)
  const failed = useKuGou((state) => state.failed)
  return (
    <div className="kg-page">
      <div className="kg-entries">
        <EntryCard title={WORDS.ranks} note='TOP500 等榜单' glyph={<ChartGlyph />} tone="tone-red" onClick={() => void useKuGou.getState().openRanks()} />
        <EntryCard title={WORDS.singers} note='热门歌手' glyph={<MicGlyph />} tone="tone-blue" onClick={() => void useKuGou.getState().openSingers()} />
        <EntryCard title={WORDS.recent} note='听过的歌' glyph={<RecentGlyph />} tone="tone-green" onClick={() => useKuGou.getState().open({ kind: 'recent' })} />
      </div>
      <div className="kg-section">
        <div className="kg-section-head">
          <h2>{WORDS.picks}</h2>
          <button type="button" className="kg-more" onClick={() => void useKuGou.getState().loadHome(true)}>
            {WORDS.other}
            <UpGlyph />
          </button>
        </div>
        {picks.length === 0 ? (
          <Loading failed={failed} onRetry={() => void useKuGou.getState().reload()} />
        ) : (
          <div className="kg-grid">
            {picks.map((pick) => (
              <PlaylistCard key={pick.id} pick={pick} />
            ))}
          </div>
        )}
        {loading && picks.length > 0 && <p className="kg-note">{WORDS.loading}</p>}
      </div>
    </div>
  )
}

function playsOf(count: number): string {
  if (!count) return ''
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}亿`
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  return String(count)
}

/** A tag's own tint, as KuGou's client colours them: the same tag is always the same colour. */
const TAG_TONES: Record<string, string> = {
  流行: '#ff5f6d',
  轻音乐: '#38b6ff',
  游戏: '#a06bff',
  韩语: '#ff7fb0',
  英语: '#37c98b',
  伤感: '#7d8cff',
  网络: '#ffa53d',
  DJ热碟: '#ff7a4d',
  古风: '#c9a15a',
  摇滚: '#ff4d6d',
  民谣: '#5ec9a8',
  儿歌: '#ffd166',
}

function tagTone(tag: string): string {
  const named = TAG_TONES[tag]
  if (named) return named
  let hash = 0
  for (const letter of tag) hash = (hash * 31 + letter.charCodeAt(0)) % 360
  return `hsl(${hash} 68% 56%)`
}

function PlaylistCard({ pick }: { pick: Playlist }) {
  return (
    <button
      type="button"
      className="kg-card"
      onClick={() =>
        void useKuGou.getState().openPlaylist({ id: pick.id, name: pick.name, picture: pick.picture, creator: pick.creator })
      }
    >
      <div className="kg-card-cover kg-card-cover-square">
        {pick.picture ? (
          <img src={pick.picture} alt="" loading="lazy" draggable={false} />
        ) : (
          <span className="kg-blank kg-blank-letter">{pick.name.slice(0, 1)}</span>
        )}
        {pick.tag && (
          <span className="kg-card-tag" style={{ background: tagTone(pick.tag) }}>
            {pick.tag}
          </span>
        )}
        {pick.plays > 0 && (
          <span className="kg-card-plays">
            <PlayGlyph />
            {playsOf(pick.plays)}
          </span>
        )}
      </div>
      <p className="kg-card-name">{pick.name}</p>
    </button>
  )
}

function RanksPage() {
  const charts = useKuGou((state) => state.charts)
  const loading = useKuGou((state) => state.loading)
  const failed = useKuGou((state) => state.failed)
  return (
    <div className="kg-page">
      <h1 className="kg-title">{WORDS.ranks}</h1>
      {charts.length === 0 ? (
        <Loading failed={failed} onRetry={() => void useKuGou.getState().reload()} />
      ) : (
        <div className="kg-rank-grid">
          {charts.map((chart) => (
            <RankCard key={chart.id} chart={chart} />
          ))}
        </div>
      )}
      {loading && charts.length === 0 && <p className="kg-note">{WORDS.loading}</p>}
      {failed && charts.length > 0 && <p className="kg-note">{WORDS.failed}</p>}
    </div>
  )
}

function RankCard({ chart }: { chart: Rank }) {
  return (
    <button type="button" className="kg-rank-card" onClick={() => void useKuGou.getState().openRank(chart)}>
      <div className="kg-rank-cover">
        {chart.picture ? <img src={chart.picture} alt="" loading="lazy" draggable={false} /> : <span className="kg-blank" />}
      </div>
      <div className="kg-rank-text">
        <strong>{chart.name}</strong>
        <small>{chart.issue ? `第 ${chart.issue} 期` : chart.note}</small>
      </div>
    </button>
  )
}

function SingersPage() {
  const artists = useKuGou((state) => state.artists)
  const loading = useKuGou((state) => state.loading)
  const failed = useKuGou((state) => state.failed)
  return (
    <div className="kg-page">
      <h1 className="kg-title">{WORDS.singers}</h1>
      {artists.length === 0 ? (
        <Loading failed={failed} onRetry={() => void useKuGou.getState().reload()} />
      ) : (
        <div className="kg-singer-grid">
          {artists.map((artist) => (
            <button
              key={artist.id}
              type="button"
              className="kg-singer"
              onClick={() => void useKuGou.getState().openSinger(artist)}
            >
              <span className="kg-singer-face">
                {artist.picture ? <img src={artist.picture} alt="" loading="lazy" draggable={false} /> : <span className="kg-blank" />}
              </span>
              <strong>{artist.name}</strong>
              {artist.songs > 0 && <small>{artist.songs} {WORDS.songs}</small>}
            </button>
          ))}
        </div>
      )}
      {loading && artists.length === 0 && <p className="kg-note">{WORDS.loading}</p>}
    </div>
  )
}

function RecentPage() {
  const recent = useKuGou((state) => state.recent)
  const playback = useKuGou((state) => state.playback)
  if (recent.length === 0) {
    return (
      <div className="kg-page">
        <h1 className="kg-title">{WORDS.recent}</h1>
        <p className="kg-note">{WORDS.empty}</p>
      </div>
    )
  }
  const now = playback?.tracks[playback.index]
  return (
    <div className="kg-page">
      <h1 className="kg-title">{WORDS.recent}</h1>
      <div className="kg-rows">
        {recent.map((song, index) => (
          <TrackRow
            key={`${song.id}:${index}`}
            song={song}
            now={Boolean(now && now.id === song.id)}
            onPlay={() => useKuGou.getState().play(recent, index, WORDS.recent)}
          />
        ))}
      </div>
    </div>
  )
}

/** A page of songs: the chart's, the playlist's, the singer's, what was searched, or an audiobook's chapters. */
function TrackPage({
  kind,
  name,
  picture = '',
  note = '',
}: {
  kind: 'results' | 'playlist' | 'rank' | 'singer' | 'audiobook'
  name: string
  picture?: string
  note?: string
}) {
  const tracks = useKuGou((state) => state.tracks)
  const loading = useKuGou((state) => state.loading)
  const failed = useKuGou((state) => state.failed)
  const playback = useKuGou((state) => state.playback)
  const now = playback?.tracks[playback.index]
  const songs = tracks.songs
  // An audiobook's own name carries its tags ("九域凡仙|凡人修仙|爽文"): the head shows the title alone.
  const title = kind === 'audiobook' ? name.split('|')[0].trim() || name : name
  return (
    <div className="kg-page">
      <div className={kind === 'results' ? 'kg-head plain' : 'kg-head'}>
        {kind !== 'results' && (
          <span className="kg-head-cover">
            {picture ? <img src={picture} alt="" draggable={false} /> : <span className="kg-blank" />}
          </span>
        )}
        <div className="kg-head-text">
          <h1 className="kg-title">{title}</h1>
          <p className="kg-sub">
            {songs.length > 0 ? `${songs.length} ${kind === 'audiobook' ? WORDS.chapters : WORDS.songs}${note ? ` · ${note}` : ''}` : note}
          </p>
        </div>
        {songs.length > 0 && (
          <button
            type="button"
            className="kg-play-all"
            onClick={() => useKuGou.getState().play(songs, 0, title)}
          >
            <PlayGlyph />
            {WORDS.playAll}
          </button>
        )}
      </div>
      {songs.length === 0 ? (
        <Loading failed={failed} onRetry={() => void useKuGou.getState().reload()} />
      ) : (
        <div className="kg-rows">
          {songs.map((song, index) => (
            <TrackRow
              key={`${song.id}:${index}`}
              song={song}
              index={index}
              now={Boolean(now && now.id === song.id)}
              room={kind !== 'audiobook'}
              onPlay={() => useKuGou.getState().play(songs, index, title)}
            />
          ))}
        </div>
      )}
      {loading && <p className="kg-note">{WORDS.loading}</p>}
      {songs.length > 0 && tracks.more && !loading && (
        <div className="kg-page-foot">
          <button type="button" className="kg-more wide" onClick={() => void useKuGou.getState().nextPage()}>
            {WORDS.more}
          </button>
        </div>
      )}
    </div>
  )
}

function TrackRow({ song, index, now, room = true, onPlay }: { song: Song; index?: number; now: boolean; room?: boolean; onPlay(): void }) {
  const playback = useKuGou((state) => state.playback)
  const playing = useKuGou((state) => state.sound === 'playing')
  const isNow = now && Boolean(playback)
  return (
    <div className={isNow ? 'kg-row now' : 'kg-row'}>
      <button type="button" className="kg-row-main" onClick={onPlay}>
        {index !== undefined && <span className="kg-row-num">{isNow && playing ? <EqGlyph /> : index + 1}</span>}
        <span className="kg-row-cover">
          {song.picture ? (
            <img src={song.picture} alt="" loading="lazy" draggable={false} />
          ) : (
            <span className="kg-blank kg-blank-letter">{song.name.slice(0, 1)}</span>
          )}
        </span>
        <span className="kg-row-text">
          <span className="kg-row-name">
            {song.name}
            {song.privilege >= 10 && <em className="kg-vip">VIP</em>}
          </span>
          <span className="kg-row-artist">{song.artists.join(' / ') || song.album}</span>
        </span>
        {room && <span className="kg-row-album">{song.album}</span>}
        <span className="kg-row-time">{clock(song.duration)}</span>
      </button>
    </div>
  )
}

/** Three bars that dance while it plays (the row's own mark for what's playing). */
function EqGlyph() {
  return (
    <span className="kg-eq" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

// --- the foot's player ---------------------------------------------------------------------------

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const rest = whole % 60
  return `${Math.floor(whole / 60)}:${rest < 10 ? '0' : ''}${rest}`
}

function PlayerBar({ aside }: { aside: boolean }) {
  const playback = useKuGou((state) => state.playback)
  const sound = useKuGou((state) => state.sound)
  const position = useKuGou((state) => state.position)
  const duration = useKuGou((state) => state.duration)
  const song = playback ? playback.tracks[playback.index] : undefined
  if (!playback || !song) {
    return (
      <div className={aside ? 'kg-foot away' : 'kg-foot empty'}>
        <p>酷狗音乐 · 推荐、排行榜、歌手与听书</p>
      </div>
    )
  }
  const share = duration > 0 ? Math.min(1, position / duration) : 0
  return (
    <div className={aside ? 'kg-foot away' : 'kg-foot'}>
      <button type="button" className="kg-foot-song" onClick={() => useKuGou.getState().setNow(true)}>
        <span className="kg-foot-cover">
          {song.picture ? (
            <img src={song.picture} alt="" draggable={false} />
          ) : (
            <span className="kg-blank kg-blank-letter">{song.name.slice(0, 1)}</span>
          )}
        </span>
        <span className="kg-foot-text">
          <strong>{song.name}</strong>
          <small>{song.artists.join(' / ')}</small>
        </span>
      </button>
      <div className="kg-foot-controls">
        <button type="button" className="kg-foot-button" aria-label="上一首" onClick={() => useKuGou.getState().previousSong()}>
          <PrevGlyph />
        </button>
        <button type="button" className="kg-foot-play" aria-label={playback.playing ? '暂停' : '播放'} onClick={() => useKuGou.getState().toggle()}>
          {sound === 'loading' ? <span className="kg-spin" /> : playback.playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <button type="button" className="kg-foot-button" aria-label="下一首" onClick={() => useKuGou.getState().nextSong()}>
          <NextGlyph />
        </button>
      </div>
      <Bar position={position} duration={duration} share={share} />
      <button type="button" className="kg-foot-lyric" aria-label="歌词" onClick={() => useKuGou.getState().setNow(true)}>
        <LyricsGlyph />
      </button>
    </div>
  )
}

/** The song's own bar: pressed, it plays from there. */
function Bar({ position, duration, share }: { position: number; duration: number; share: number }) {
  const box = useRef<HTMLDivElement>(null)
  const seekAt = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    useKuGou.getState().seek(ratio * duration)
  }
  return (
    <div className="kg-bar">
      <span className="kg-bar-time">{clock(position)}</span>
      <div
        ref={box}
        className="kg-bar-track"
        role="slider"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        tabIndex={-1}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          seekAt(event.clientX)
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) seekAt(event.clientX)
        }}
      >
        <span className="kg-bar-fill" style={{ width: `${share * 100}%` }} />
        <span className="kg-bar-knob" style={{ left: `${share * 100}%` }} />
      </div>
      <span className="kg-bar-time">{clock(duration)}</span>
    </div>
  )
}

/** A song the service kept for its paid listeners, said as the app passes over it. */
function BlockedNote() {
  const blocked = useKuGou((state) => state.blocked)
  const blockedAll = useKuGou((state) => state.blockedAll)
  return blocked ? (
    <p className="kg-toast" role="status">
      {blockedAll ? WORDS.blockedAll : `${WORDS.blocked} · ${blocked}`}
    </p>
  ) : null
}

// --- the full player, over the app ---------------------------------------------------------------

/**
 * Now Playing: the cover and the song's own bar on the left, the words on the right — NetEase's words page
 * (`LyricLines`), the shared one, fed KuGou's own LRC.
 */
function NowPlayingView() {
  const open = useKuGou((state) => state.nowOpen)
  const playback = useKuGou((state) => state.playback)
  const sound = useKuGou((state) => state.sound)
  const position = useKuGou((state) => state.position)
  const duration = useKuGou((state) => state.duration)
  const words = useKuGou((state) => state.words)
  const wordsFor = useKuGou((state) => state.wordsFor)
  const wordsFailed = useKuGou((state) => state.wordsFailed)
  const volume = useKuGou((state) => state.volume)
  const song = playback ? playback.tracks[playback.index] : undefined

  if (!open || !playback || !song) return null
  const mine = wordsFor === song.id ? words : null
  return (
    <div className="kg-now">
      <div
        className="kg-now-backdrop"
        style={song.picture ? { backgroundImage: `url(${song.picture})` } : undefined}
        aria-hidden="true"
      />
      <div className="kg-now-wash" aria-hidden="true" />
      <button type="button" className="kg-now-close" aria-label="关闭" onClick={() => useKuGou.getState().setNow(false)}>
        <CloseGlyph />
      </button>
      <div className="kg-now-left">
        <div className="kg-now-cover">
          {song.picture ? <img src={song.picture} alt="" draggable={false} /> : <span className="kg-blank" />}
        </div>
        <h1 className="kg-now-name">{song.name}</h1>
        <p className="kg-now-artist">{song.artists.join(' / ')}</p>
        <p className="kg-now-album">{song.album}</p>
        <div className="kg-now-bar">
          <Bar position={position} duration={duration} share={duration > 0 ? Math.min(1, position / duration) : 0} />
        </div>
        <div className="kg-now-controls">
          <button type="button" className="kg-now-button" aria-label="上一首" onClick={() => useKuGou.getState().previousSong()}>
            <PrevGlyph />
          </button>
          <button
            type="button"
            className="kg-now-play"
            aria-label={playback.playing ? '暂停' : '播放'}
            onClick={() => useKuGou.getState().toggle()}
          >
            {sound === 'loading' ? <span className="kg-spin" /> : playback.playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button type="button" className="kg-now-button" aria-label="下一首" onClick={() => useKuGou.getState().nextSong()}>
            <NextGlyph />
          </button>
        </div>
        {/* What it plays at, under the transport: KuGou's own volume, kept between runs (keybinds step it too). */}
        <div className="kg-now-volume">
          <button
            type="button"
            className="kg-now-speaker"
            aria-label={volume > 0 ? '静音' : '取消静音'}
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
          >
            <SpeakerGlyph size={26} volume={volume} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="音量"
            onChange={(event) => setVolume(Number(event.target.value))}
          />
          <span className="kg-now-volume-num">{Math.round(volume * 100)}</span>
        </div>
      </div>
      <div className="kg-now-words">
        {/* The words are NetEase's own page (`.ne-app`'s scope, netease.css), fed KuGou's LRC. */}
        <div className="ne-app kg-lyrics-shell">
          {mine ? (
            <LyricLines
              key={song.id}
              words={mine}
              position={position}
              onSeek={(seconds) => useKuGou.getState().seek(seconds)}
            />
          ) : (
            <div className="ne-lyrics-card note">
              <p>{wordsFailed ? WORDS.lyricsFailed : WORDS.noLyrics}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
