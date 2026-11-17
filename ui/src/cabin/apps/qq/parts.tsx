import type { ReactNode } from 'react'
import type { AppleMusicItem, AppleMusicSection, AppleMusicTrack } from '../../../shared/host'
import { openItem, openView, playFrom, currentTrack, useQqMusic } from './qqMusic'
import { PlayGlyph, ShuffleGlyph } from '../music/glyphs'
import { trackCover } from '../music/look'
import { Bars, Cover, Explicit, SectionHead } from '../music/parts'

/**
 * The QQ app's own cards, shelves and song rows, bound to the QQ store. The pure display pieces (cover,
 * bars, section head, failed/loading) are shared with the Music app; only the actions and the playing-state
 * lookup go through the QQ store.
 */

/** A card on a shelf: its cover, name and who it's by. */
export function QqTile({ item }: { item: AppleMusicItem }) {
  return (
    <button
      type="button"
      className={item.kind === 'artist' ? 'am-tile artist' : 'am-tile'}
      onClick={() => openItem(item)}
    >
      <Cover item={item} />
      <span className="am-tile-name">
        {item.name}
        {item.explicit && <Explicit />}
      </span>
      {item.kind !== 'artist' && item.by && <span className="am-tile-by">{item.by}</span>}
    </button>
  )
}

/** Whether a song is the one playing (from its context, or anywhere). */
function usePlayingSong(track: AppleMusicTrack, contextId: string | null): 'playing' | 'paused' | null {
  return useQqMusic((state) => {
    const playback = state.playback
    if (!playback || (contextId && playback.context?.id !== contextId)) return null
    if (currentTrack(playback)?.id !== track.id) return null
    return playback.playing ? 'playing' : 'paused'
  })
}

/** A song in a list: cover or number, name and artist; bars while it plays. Pressed, it plays from there. */
export function QqSongRow({
  track,
  onPlay,
  cover = false,
  number = null,
  contextId = null,
  end,
}: {
  track: AppleMusicTrack
  onPlay(): void
  cover?: boolean
  number?: number | null
  contextId?: string | null
  end?: ReactNode
}) {
  const state = usePlayingSong(track, contextId)
  return (
    <button type="button" className={state ? 'am-song am-current' : 'am-song'} onClick={onPlay}>
      {cover ? (
        <span className="am-song-cover">
          <Cover item={trackCover(track)} />
          {state && <Bars playing={state === 'playing'} />}
        </span>
      ) : (
        <span className="am-song-number">{state ? <Bars playing={state === 'playing'} /> : number}</span>
      )}
      <span className="am-song-text">
        <span className="am-song-name">
          {track.name}
          {track.explicit && <Explicit />}
        </span>
        {(cover || !number) && <span className="am-song-by">{track.artist}</span>}
      </span>
      {end}
    </button>
  )
}

const SHELF_MOST = 12

/** A section of a page: a shelf of cards, or songs in columns. */
export function QqSection({ section, title }: { section: AppleMusicSection; title?: string }) {
  const name = title ?? section.title
  const more = section.items.length > SHELF_MOST || section.songs.length > 12
  const onAll = more ? () => openView({ kind: 'section', section: { ...section, title: name } }) : undefined
  if (section.style === 'songs') {
    return (
      <section className="am-section">
        <SectionHead title={name} onAll={onAll} />
        <div className="am-shelf am-song-columns">
          {section.songs.slice(0, 12).map((track, i) => (
            <QqSongRow
              key={`${track.id}:${i}`}
              track={track}
              onPlay={() => playFrom(null, section.songs, i)}
              cover
            />
          ))}
        </div>
      </section>
    )
  }
  return (
    <section className="am-section">
      <SectionHead title={name} onAll={onAll} />
      <div className={section.style === 'recent' ? 'am-shelf am-recent' : 'am-shelf'}>
        {section.items.slice(0, SHELF_MOST).map((item, i) => (
          <QqTile key={`${item.id}:${i}`} item={item} />
        ))}
      </div>
    </section>
  )
}

/** Play and shuffle pills over a list of songs. */
export function PlayActions({ context, tracks }: { context: AppleMusicItem | null; tracks: AppleMusicTrack[] }) {
  return (
    <div className="am-actions">
      <button
        type="button"
        className="am-pill key"
        disabled={tracks.length === 0}
        onClick={() => playFrom(context, tracks, null, false)}
      >
        <PlayGlyph size={26} />
        播放
      </button>
      <button
        type="button"
        className="am-pill key"
        disabled={tracks.length === 0}
        onClick={() => playFrom(context, tracks, null, true)}
      >
        <ShuffleGlyph size={26} />
        随机
      </button>
    </div>
  )
}
