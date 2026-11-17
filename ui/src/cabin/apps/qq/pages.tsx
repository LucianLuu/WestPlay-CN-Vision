import { type CSSProperties, type ReactNode } from 'react'
import type { AppleMusicItem, AppleMusicSection } from '../../../shared/host'
import { openView, playFrom, qqMusic, useAsked, useQqMusic, useShownAgain, type View } from './qqMusic'
import { Cover } from '../music/parts'
import { Failed, Loading } from '../music/parts'
import { PlayActions, QqSection, QqSongRow, QqTile } from './parts'

/** The QQ app's pages: Home (recommended wall + new songs), search results, a playlist/album page, and the
 * pages opened over a tab. */

function Scroll({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="am-scroll">
      {title && <h1 className="am-title">{title}</h1>}
      {children}
    </div>
  )
}

function Answered<T>({
  asked,
  title,
  children,
}: {
  asked: { answer: T | null; failed: boolean; retry(): void }
  title?: string
  children(answer: T): ReactNode
}) {
  if (asked.failed) {
    return (
      <Scroll title={title}>
        <Failed onRetry={asked.retry} />
      </Scroll>
    )
  }
  if (!asked.answer) {
    return (
      <Scroll title={title}>
        <Loading />
      </Scroll>
    )
  }
  return <>{children(asked.answer)}</>
}

function Sections({ sections }: { sections: AppleMusicSection[] }) {
  return (
    <>
      {sections.map((section, i) => (
        <QqSection key={`${section.title}:${i}`} section={section} />
      ))}
    </>
  )
}

/** Home: the recommended playlist wall and new songs from the local layer. */
export function Home({ shown }: { shown: boolean }) {
  const asked = useAsked({ ask: 'home' }, useShownAgain(shown))
  return (
    <Answered asked={asked} title="QQ 音乐">
      {(page) => (
        <Scroll title="QQ 音乐">
          {page.sections.length === 0 && <p className="am-empty">暂无内容</p>}
          <Sections sections={page.sections} />
        </Scroll>
      )}
    </Answered>
  )
}

/** Search results: songs first, then playlists and albums as cards. */
export function Results({ query }: { query: string }) {
  const asked = useAsked({ ask: 'search', query })
  return (
    <Answered asked={asked}>
      {(results) => {
        const none =
          results.songs.length + results.artists.length + results.albums.length + results.playlists.length === 0
        if (none) {
          return (
            <Scroll>
              <div className="am-none">
                <h2>没有结果</h2>
                <p>换个关键词试试</p>
              </div>
            </Scroll>
          )
        }
        const shelf = (title: string, items: AppleMusicItem[]) =>
          items.length > 0 && (
            <section className="am-section">
              <div className="am-section-head">
                <h2>{title}</h2>
              </div>
              <div className="am-shelf">
                {items.map((item) => (
                  <QqTile key={item.id} item={item} />
                ))}
              </div>
            </section>
          )
        return (
          <Scroll>
            {shelf('歌手', results.artists)}
            {shelf('专辑', results.albums)}
            {shelf('歌单', results.playlists)}
            {results.songs.length > 0 && (
              <QqSection section={{ title: '歌曲', style: 'songs', items: [], songs: results.songs }} />
            )}
          </Scroll>
        )
      }}
    </Answered>
  )
}

/** A playlist/album page: cover, name, who it's by, Play and Shuffle, its songs under. */
function CollectionPage({ item }: { item: AppleMusicItem }) {
  const asked = useAsked({
    ask: 'collection',
    id: item.id,
    kind: item.kind,
    name: item.name,
    by: item.by,
    image: item.image,
  })
  const page = asked.answer
  const shown = page?.item ?? item
  const tracks = page?.tracks ?? []
  return (
    <div className="am-scroll" style={{ '--cover': shown.color } as CSSProperties}>
      <header className="am-collection-head">
        <Cover item={shown} className="am-collection-cover" />
        <div className="am-collection-text">
          <h1>{shown.name}</h1>
          {shown.by && <p className="am-collection-by">{shown.by}</p>}
          <PlayActions context={shown} tracks={tracks} />
          {page?.description && <p className="am-collection-note">{plain(page.description)}</p>}
        </div>
      </header>
      {asked.failed && <Failed onRetry={asked.retry} />}
      {!page && !asked.failed && <Loading />}
      {page && (
        <div className="am-songs">
          {tracks.map((track, i) => (
            <QqSongRow
              key={`${track.id}:${i}`}
              track={track}
              contextId={shown.id}
              cover={shown.kind !== 'album'}
              number={shown.kind === 'album' ? (track.number ?? i + 1) : null}
              onPlay={() => playFrom(shown, tracks, i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '’')
}

/** A page over a tab's own (`shown`: on top, showing). */
export function Page({ view }: { view: View; shown: boolean }) {
  switch (view.kind) {
    case 'collection':
      return <CollectionPage item={view.item} />
    case 'results':
      return <Results query={view.query} />
    case 'section':
      return (
        <Scroll title={view.section.title}>
          {view.section.songs.length > 0 ? (
            <div className="am-songs">
              {view.section.songs.map((track, i) => (
                <QqSongRow
                  key={`${track.id}:${i}`}
                  track={track}
                  cover
                  onPlay={() => playFrom(null, view.section.songs, i)}
                />
              ))}
            </div>
          ) : (
            <div className="am-grid">
              {view.section.items.map((item) => (
                <QqTile key={item.id} item={item} />
              ))}
            </div>
          )}
        </Scroll>
      )
  }
}

/**
 * The official charts (官方歌单): the layer's own groups of lists (巅峰榜, 地区榜, 全球榜 and the
 * rest), each a row of cards. A card opens its list's songs, which play from its first one.
 */
export function Playlists() {
  const asked = useAsked({ ask: 'top' })
  return (
    <Answered asked={asked} title="官方歌单">
      {(page) => (
        <Scroll title="官方歌单">
          {page.sections.length === 0 && <p className="am-empty">暂无榜单</p>}
          <Sections sections={page.sections} />
        </Scroll>
      )}
    </Answered>
  )
}

/** 频道 tab: the song shelves from the home feed (new songs and radar recommendations). */
export function Channels({ shown }: { shown: boolean }) {
  const asked = useAsked({ ask: 'home' }, useShownAgain(shown))
  return (
    <Answered asked={asked} title="频道">
      {(page) => {
        const songs = page.sections.filter((section) => section.songs.length > 0)
        return (
          <Scroll title="频道">
            {songs.length === 0 && <p className="am-empty">暂无内容</p>}
            {songs.map((section) => (
              <QqSection key={section.title} section={section} />
            ))}
          </Scroll>
        )
      }}
    </Answered>
  )
}

/** 我的 tab: favourites and personal playlists follow login; no local library yet. */
/** "Mine": signed in shows the account's profile and favourited songs; otherwise a QR sign-in entry. */
export function Mine() {
  const signedIn = useQqMusic((state) => state.signedIn)
  return signedIn ? <MineList /> : <SignIn />
}

/** Signed-out: open the site's own sign-in window on the desktop; login state comes back through the store. */
function SignIn() {
  const start = () => {
    qqMusic({ action: 'signIn' })
  }

  return (
    <Scroll title="我的">
      <div className="am-mine-signin">
        <h2>登录 QQ 音乐</h2>
        <p>将在桌面打开 QQ 音乐官网登录窗口，登录成功后返回这里查看收藏</p>
        <button type="button" className="am-pill key" onClick={start}>
          打开登录窗口
        </button>
      </div>
    </Scroll>
  )
}

/** Signed-in: the account card, its saved playlists and its favourited songs. */
function MineList() {
  const asked = useAsked({ ask: 'collection', id: 'qqmine' })
  const page = asked.answer
  const tracks = page?.tracks ?? []
  const playlists = page?.playlists ?? []
  return (
    <Scroll title="我的">
      {page && (
        <header className="am-collection-head">
          <Cover item={page.item} className="am-collection-cover" />
          <div className="am-collection-text">
            <h1>{page.item.name}</h1>
            {page.item.by && <p className="am-collection-by">{page.item.by}</p>}
          </div>
        </header>
      )}
      {asked.failed && <Failed onRetry={asked.retry} />}
      {!page && !asked.failed && <Loading />}
      {page && playlists.length > 0 && (
        <section className="am-section">
          <div className="am-section-head">
            <h2>收藏歌单</h2>
          </div>
          <div className="am-grid">
            {playlists.map((item) => (
              <QqTile key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
      {page && tracks.length === 0 && playlists.length === 0 && <p className="am-empty">暂无收藏歌曲</p>}
      {page && tracks.length > 0 && (
        <div className="am-songs">
          {tracks.map((track, i) => (
            <QqSongRow
              key={`${track.id}:${i}`}
              track={track}
              cover
              onPlay={() => playFrom(null, tracks, i)}
            />
          ))}
        </div>
      )}
    </Scroll>
  )
}

/** Search's own page: hot search terms up top, then recommended songs; the field sits in the bar. */
export function SearchHome() {
  const asked = useAsked({ ask: 'search', query: '' })
  return (
    <Answered asked={asked} title="搜索">
      {(results) => (
        <Scroll title="搜索">
          {results.playlists.length > 0 && (
            <section className="am-section">
              <div className="am-section-head">
                <h2>热搜</h2>
              </div>
              <div className="am-hotkeys">
                {results.playlists.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="am-hotkey"
                    onClick={() => openView({ kind: 'results', query: item.note || item.name })}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </section>
          )}
          {results.songs.length > 0 && (
            <QqSection section={{ title: '热门歌曲', style: 'songs', items: [], songs: results.songs }} />
          )}
        </Scroll>
      )}
    </Answered>
  )
}
