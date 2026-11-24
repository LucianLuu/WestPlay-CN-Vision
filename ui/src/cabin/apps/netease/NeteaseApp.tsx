import { type ReactNode, useEffect, useState } from 'react'
import { useKeyboard } from '../../keyboard/store'
import { useText } from '../../state/text'
import { Mine } from './account'
import { BackGlyph, ChartsGlyph, MineGlyph, PlaylistGlyph, RecommendGlyph } from './glyphs'
import { followLayerPort } from './layer'
import { MiniPlayer, NowPlaying } from './NowPlaying'
import {
  closeSignIn,
  followSound,
  goBack,
  openTab,
  openView,
  refreshAccount,
  type Tab,
  TABS,
  useNetease,
  type View,
} from './netease'
import { Channels, FIELD, Page, Playlists, Recommend, SearchField, Typing } from './pages'
import { WORDS } from './words'
import './netease.css'

/** The tabs' own glyphs, over their words. */
function TabGlyph({ tab, on }: { tab: Tab; on: boolean }) {
  switch (tab) {
    case 'recommend':
      return <RecommendGlyph on={on} />
    case 'playlists':
      return <PlaylistGlyph on={on} />
    case 'channels':
      return <ChartsGlyph on={on} />
    case 'mine':
      return <MineGlyph on={on} />
  }
}

/**
 * NetEase Cloud Music, self-drawn: 推荐, 歌单, 电台·榜单 and 我的 in the top bar, 搜索 at its end, and the player at
 * the foot. Each tab keeps its pages where they were left (Back goes back through them); the search is a layer of
 * its own, so what's typed never lands on a tab's page, and a result picked opens as a page over the tab it was
 * typed from.
 *
 * The host runs the layer the app asks (crates/host netease_layer.rs) and says which port it answers on; the
 * account, the songs and their words all come from it, and the sound is this page's own `Audio` element.
 */
export function NeteaseApp() {
  const text = useText()
  const tab = useNetease((state) => state.tab)
  const views = useNetease((state) => state.views)
  const [query, setQuery] = useState('')
  const typing = useKeyboard((state) => state.field?.id === FIELD)
  // The layer's port (the host's answer): asked once, as the app opens.
  useEffect(() => followLayerPort(), [])
  // The element's own word on what it's doing: `timeupdate` is what moves the bar. Without this it was
  // never subscribed — a song played, and the app had no idea where in it (the bar sat at 0:00; owner
  // 2026-11-20), nor when one ended or couldn't play at all.
  useEffect(() => followSound(), [])
  // Who's signed in, asked as the app opens: the home tab's own playlists depend on it, and it must not wait
  // for the player to open 我的 (which is what left the home tab's side column empty on a first visit).
  useEffect(() => {
    void refreshAccount()
  }, [])
  // A QR sign-in's polling stops with the app's window (nothing keeps asking with no page to show it).
  useEffect(() => () => closeSignIn(), [])

  const stopTyping = () => useKeyboard.getState().detach(FIELD)
  const search = (wanted: string) => {
    const trimmed = wanted.trim()
    if (!trimmed) return
    setQuery(trimmed)
    stopTyping()
    openView({ kind: 'results', query: trimmed })
  }
  const go = (to: Tab) => {
    stopTyping()
    openTab(to)
  }
  const pages = views[tab]

  return (
    <section className="app-panel ne-app" aria-label={text.apps.spotify}>
      <div className="ne-top">
        {pages.length > 0 && !typing ? (
          <button type="button" className="ne-round" aria-label={WORDS.back} onClick={goBack}>
            <BackGlyph />
          </button>
        ) : (
          <span className="ne-brand" aria-hidden="true">
            {/* 官方标志的图片版（owner 2026-11-23）：glyph 画不出网易云那个红色的圆标。 */}
            <img src="/icons/westplay/netease-mark.png" alt="" draggable={false} />
          </span>
        )}
        <nav className={typing ? 'ne-tabs away' : 'ne-tabs'} aria-hidden={typing}>
          {TABS.map((each) => (
            <button
              key={each}
              type="button"
              className={each === tab && !typing ? 'ne-tab on' : 'ne-tab'}
              aria-pressed={each === tab}
              tabIndex={typing ? -1 : undefined}
              onClick={() => go(each)}
            >
              <TabGlyph tab={each} on={each === tab && !typing} />
              <span>{WORDS.tabs[each]}</span>
            </button>
          ))}
        </nav>
        <div className={typing ? 'ne-search typing' : 'ne-search'}>
          <SearchField value={query} onChange={setQuery} onSubmit={() => search(query)} />
        </div>
      </div>
      {/* Layers, each kept as it is under the one over it (a tab left, or a page gone back from, is found as it
          was, its scroll and all): each tab's own page, the pages over it, then what's typed. */}
      <div className="ne-body">
        {TABS.map((each) => (
          <TabLayers key={each} tab={each} shown={each === tab && !typing} />
        ))}
        {typing && (
          <Layer shown={true} opened={false}>
            <Typing query={query} onPicked={stopTyping} />
          </Layer>
        )}
      </div>
      {/* What floats at the foot steps aside for the keyboard. */}
      <MiniPlayer aside={typing} />
      <UnsungNote />
      <NowPlaying />
    </section>
  )
}

/**
 * A song the service won't give here (no address, or its code -110), said as it happens: the app has already gone
 * on to the next song, and this is the moment it was passed over — NetEase's own words, the song named.
 */
function UnsungNote() {
  const unsung = useNetease((state) => state.unsung)
  return unsung ? (
    <p key={unsung.n} className="ne-toast" role="status">
      {WORDS.noRightFor(unsung.name)}
    </p>
  ) : null
}

/** A tab's own page, then the pages over it: the top one showing while the tab is. */
function TabLayers({ tab, shown }: { tab: Tab; shown: boolean }) {
  const views = useNetease((state) => state.views[tab])
  return (
    <>
      <Layer shown={shown && views.length === 0} opened={false}>
        <TabPage tab={tab} />
      </Layer>
      {views.map((view, index) => (
        <Layer key={view.n} shown={shown && index === views.length - 1} opened={true}>
          <Page view={view as View} />
        </Layer>
      ))}
    </>
  )
}

function TabPage({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'recommend':
      return <Recommend />
    case 'playlists':
      return <Playlists />
    case 'channels':
      return <Channels />
    case 'mine':
      return <Mine />
  }
}

/** A layer: a page just opened comes in from the side; one shown again (Back, a tab chosen again) only fades up. */
function Layer({ shown, opened, children }: { shown: boolean; opened: boolean; children: ReactNode }) {
  const [fresh, setFresh] = useState(opened)
  const className = !shown ? 'ne-layer away' : fresh ? 'ne-layer fresh' : 'ne-layer'
  return (
    <div className={className} onAnimationEnd={(event) => event.target === event.currentTarget && setFresh(false)}>
      {children}
    </div>
  )
}
