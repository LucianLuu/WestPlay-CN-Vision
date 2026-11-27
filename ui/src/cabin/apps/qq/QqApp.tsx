import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import {
  goBack,
  openTab,
  openView,
  signIn,
  signOut,
  useQqMusic,
  useWebPlayer,
  type Tab,
} from './qqMusic'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import { barLayout, framed, type BarSizes } from '../music/barLayout'
import {
  BackGlyph,
  CloseGlyph,
  GridGlyph,
  HomeGlyph,
  PersonGlyph,
  RadioGlyph,
  SearchGlyph,
} from '../music/glyphs'
import { Channels, Home, Mine, Page, Playlists, Results, SearchHome } from './pages'
import { MiniPlayer, NowPlaying } from './NowPlaying'
import '../music/music.css'
import '../music/appleMusic.css'
import './qq.css'

const FIELD = 'qq-search'

/** The four main capsule tabs, in order, with their word and glyph. */
const MAIN_TABS: { tab: Tab; label: string; glyph: (on: boolean) => ReactNode }[] = [
  { tab: 'recommend', label: '推荐', glyph: (on) => <HomeGlyph size={30} on={on} /> },
  { tab: 'playlists', label: '官方歌单', glyph: () => <GridGlyph size={30} /> },
  { tab: 'channels', label: '频道', glyph: () => <RadioGlyph size={30} /> },
  { tab: 'mine', label: '我的', glyph: () => <PersonGlyph size={30} /> },
]

/**
 * WestPlay's own QQ Music home: a floating glass capsule of four tabs (推荐, 官方歌单, 频道, 我的) with a
 * search circle beside it; each tab keeps its pages where they were left (Back goes through them); the glass
 * mini player floats at the foot, and Now Playing rises over all when pressed. The hidden page fetches the
 * local QQ middle layer.
 */
export function QqApp() {
  const tab = useQqMusic((state) => state.tab)
  const views = useQqMusic((state) => state.views)
  const signedIn = useQqMusic((state) => state.signedIn)
  const [query, setQuery] = useState('')
  const typing = useKeyboard((state) => state.field?.id === FIELD)
  useWebPlayer()

  const searching = tab === 'search'
  const pages = views[tab]

  // Typing in the field is being in Search.
  useEffect(() => {
    if (typing) useQqMusic.setState({ tab: 'search' })
  }, [typing])

  const barRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const bar = useBar({ bar: barRef, start: startRef, end: endRef, tabs: tabsRef }, searching)

  const stopTyping = () => {
    if (useKeyboard.getState().field?.id === FIELD) useKeyboard.getState().detach(FIELD)
  }

  const search = (wanted: string) => {
    const trimmed = wanted.trim()
    if (!trimmed) return
    setQuery(trimmed)
    stopTyping()
    openView({ kind: 'results', query: trimmed })
  }

  const closeSearch = () => {
    setQuery('')
    stopTyping()
    openTab('recommend')
  }

  return (
    <>
      <section className="app-panel am-app qq-app" aria-label="QQ 音乐">
        <div ref={barRef} className={bar.ready ? 'am-bar ready' : 'am-bar'}>
          <div ref={startRef} className="am-bar-side">
            {pages.length > 0 && (
              <button type="button" className="am-round glass" aria-label="返回" onClick={goBack}>
                <BackGlyph size={34} />
              </button>
            )}
          </div>
          <nav className={searching ? 'am-tabs searching' : 'am-tabs'}>
            <div className="am-tab-bar glass" style={bar.tabs}>
              <div ref={tabsRef} className="am-tab-list">
                {MAIN_TABS.map(({ tab: each, label, glyph }) => (
                  <TabButton
                    key={each}
                    on={tab === each}
                    label={label}
                    glyph={glyph(tab === each)}
                    onClick={() => openTab(each)}
                  />
                ))}
              </div>
              {searching && (
                <button
                  type="button"
                  className="am-close-search"
                  aria-label="关闭搜索"
                  onClick={closeSearch}
                >
                  <CloseGlyph size={30} />
                </button>
              )}
            </div>
            <div className={searching ? 'am-search glass open' : 'am-search glass'} style={bar.search}>
              {searching ? (
                <TextField
                  id={FIELD}
                  value={query}
                  onChange={setQuery}
                  onSubmit={() => search(query)}
                  returnKind="search"
                  hint="艺人、歌曲、专辑等"
                  label="搜索"
                  icon={<SearchGlyph size={30} />}
                />
              ) : (
                <button
                  type="button"
                  className="am-search-button"
                  aria-label="搜索"
                  onClick={() => openTab('search')}
                >
                  <SearchGlyph size={32} />
                </button>
              )}
            </div>
          </nav>
          <div ref={endRef} className="am-bar-side end">
            {/* As Apple Music's bar: Sign In at the right while signed out; the account's button, its
                menu holding Sign Out, while signed in. Until the page has said which (`null`), nothing —
                showing Sign In first put it there for a second after every open (owner 2026-11-28). */}
            {signedIn === false && (
              <button type="button" className="am-sign-in glass" onClick={signIn}>
                登录
              </button>
            )}
            {signedIn === true && <Account />}
          </div>
        </div>

        <div className="am-body">
          {MAIN_TABS.map(({ tab: each }) => (
            <TabLayers key={each} tab={each} shown={tab === each} />
          ))}
          <TabLayers tab="search" shown={tab === 'search'} />
        </div>

        <MiniPlayer aside={false} />
      </section>
      <NowPlaying />
    </>
  )
}

/** The account: its picture (a person, without one), its menu holding Sign Out — Apple Music's own
 * account button, on QQ Music's bar. */
function Account() {
  const avatar = useQqMusic((state) => state.avatar)
  const [menu, setMenu] = useState(false)
  return (
    <div className="am-account">
      <button
        type="button"
        className="am-me glass"
        aria-label="账号"
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        {avatar ? <img src={avatar} alt="" draggable={false} /> : <PersonGlyph size={34} />}
      </button>
      {menu && (
        <div className="am-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              signOut()
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}

function useBar(parts: Record<'bar' | 'start' | 'end' | 'tabs', RefObject<HTMLDivElement | null>>, searching: boolean) {
  const [sizes, setSizes] = useState<BarSizes | null>(null)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const { bar, start, end, tabs } = parts
    if (!bar.current || !start.current || !end.current || !tabs.current) return
    const measure = () =>
      setSizes({
        bar: bar.current?.clientWidth ?? 0,
        start: start.current?.offsetWidth ?? 0,
        end: end.current?.offsetWidth ?? 0,
        tabs: tabs.current?.offsetWidth ?? 0,
      })
    measure()
    const observer = new ResizeObserver(measure)
    for (const part of [bar.current, start.current, end.current, tabs.current]) observer.observe(part)
    const timer = setTimeout(() => setReady(true), 80)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!sizes) return { ready, tabs: undefined, search: undefined }
  const closed = barLayout(sizes, false)
  const open = barLayout(sizes, true)
  const now = searching ? open : closed
  return {
    ready,
    tabs: style(framed(closed.tabs, now.tabs)),
    search: style(framed(open.search, now.search)),
  }
}

function style(frame: ReturnType<typeof framed>): CSSProperties {
  return {
    left: frame.left,
    width: frame.width,
    transform: `translateX(${frame.shift}px)`,
    clipPath: `inset(0 ${frame.cut}px 0 0 round calc(var(--am-bar) / 2))`,
  }
}

function TabButton({
  on,
  label,
  glyph,
  onClick,
}: {
  on: boolean
  label: string
  glyph: ReactNode
  onClick(): void
}) {
  return (
    <button type="button" className={on ? 'am-tab on' : 'am-tab'} aria-pressed={on} onClick={onClick}>
      {glyph}
      <span>{label}</span>
    </button>
  )
}

/** A tab's own page and the pages over it: the top one showing while the tab is. */
function TabLayers({ tab, shown }: { tab: Tab; shown: boolean }) {
  const views = useQqMusic((state) => state.views[tab])
  return (
    <>
      <div className={shown && views.length === 0 ? 'am-layer' : 'am-layer away'}>
        <TabPage tab={tab} shown={shown && views.length === 0} />
      </div>
      {views.map((view, index) => (
        <div key={view.id} className={shown && index === views.length - 1 ? 'am-layer' : 'am-layer away'}>
          <Page view={view} shown={shown && index === views.length - 1} />
        </div>
      ))}
    </>
  )
}

function TabPage({ tab, shown }: { tab: Tab; shown: boolean }) {
  switch (tab) {
    case 'recommend':
      return <Home shown={shown} />
    case 'playlists':
      return <Playlists />
    case 'channels':
      return <Channels shown={shown} />
    case 'mine':
      return <Mine />
    case 'search':
      return <SearchTab />
  }
}

/** The Search tab: the field lives in the bar; under it, results once one is open, else the browse categories. */
function SearchTab() {
  const views = useQqMusic((state) => state.views.search)
  const top = views[views.length - 1]
  if (top?.kind === 'results') return <Results query={top.query} />
  return <SearchHome />
}
