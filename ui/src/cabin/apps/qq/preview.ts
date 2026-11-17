import type {
  AppleMusicCollection,
  AppleMusicItem,
  AppleMusicPage,
  AppleMusicResults,
  AppleMusicSection,
  AppleMusicTrack,
  Lyrics,
  QqMusicQuestion,
} from '../../../shared/host'

/**
 * QQ Music's preview, outside WestPlay (a plain browser, and the companion's own screen): an invented
 * catalogue (made-up names, no pictures: the app draws their covers) answering every question the way
 * QQ Music would, after a moment — its home's shelves, a search, a playlist's page, the official
 * charts and a song's words. It's what the preview shows where the real pages need the middle layer
 * behind the host, which a browser has no way to reach (qqMusic.ts).
 */

const SINGERS = ['刘思远', '苏晚晴', '陈默言', '林雨桐', '江野', '许清和']
const SONGS = [
  '夜行列车',
  '高速公路',
  '纸地图',
  '黄金出口',
  '海岸线',
  '蓝色时刻',
  '柴油摇滚',
  '开阔的乡野',
  '油与火',
  '零公里',
  '末班渡轮',
  '车窗上的雨',
  '低速挡',
  '国境灯',
  '早咖啡',
  '归途',
]

/** A song of the preview's catalogue, in the app's own shape. */
function track(index: number): AppleMusicTrack {
  return {
    id: `preview${String(index).padStart(4, '0')}`,
    name: SONGS[index % SONGS.length],
    artist: SINGERS[index % SINGERS.length],
    album: ['长夜', '里程零', '归途', '服务区'][index % 4],
    albumId: null,
    artistId: null,
    image: null,
    color: '#2c2c2e',
    duration: 180 + ((index * 17) % 120),
    explicit: index % 7 === 3,
    number: (index % 12) + 1,
  }
}

const tracks = (from: number, count: number) => Array.from({ length: count }, (_, i) => track(from + i))

/** A card (a playlist of the preview's, one of its charts). */
function card(kind: AppleMusicItem['kind'], index: number, name?: string): AppleMusicItem {
  return {
    id: `preview-${kind}-${index}`,
    kind,
    name: name ?? ['长途歌单', '深夜电台', '开车必备', '公路电影', '夜班司机', '服务区小憩'][index % 6],
    by: kind === 'playlist' ? SINGERS[index % SINGERS.length] : '',
    note: '',
    image: null,
    wide: null,
    color: '#2c2c2e',
    explicit: false,
    live: false,
  }
}

function songSection(title: string, from: number, count: number): AppleMusicSection {
  return { title, style: 'songs', items: [], songs: tracks(from, count) }
}

function cardSection(
  title: string,
  kind: AppleMusicItem['kind'],
  from: number,
  count: number,
): AppleMusicSection {
  return {
    title,
    style: 'shelf',
    items: Array.from({ length: count }, (_, i) => card(kind, from + i)),
    songs: [],
  }
}

function home(): AppleMusicPage {
  return {
    sections: [
      songSection('推荐今日', 0, 8),
      cardSection('你的歌单宝藏库', 'playlist', 0, 6),
      cardSection('官方歌单', 'playlist', 6, 6),
      songSection('雷达推荐', 8, 6),
    ],
  }
}

function search(query: string): AppleMusicResults {
  const from = query.length
  return {
    top: [],
    songs: tracks(from, 10),
    artists: [card('artist', 0), card('artist', 1)],
    albums: [card('album', 0), card('album', 1)],
    playlists: [card('playlist', 0), card('playlist', 1)],
    stations: [],
  }
}

function collection(name: string | undefined): AppleMusicCollection {
  return {
    item: card('playlist', 0, name ?? '长途歌单'),
    description: '为长途驾驶准备的歌。',
    genre: '',
    year: null,
    tracks: tracks(0, 12),
    playlists: [],
  }
}

const LYRICS: Lyrics = {
  synced: true,
  lines: [
    { start: 0, end: 6, text: '夜行列车' },
    { start: 6, end: 12, text: '穿过没有灯的国道' },
    { start: 12, end: 18, text: '仪表盘的光落在手上' },
    { start: 18, end: 24, text: '还有三百公里' },
    { start: 24, end: 30, text: '服务区的咖啡还热' },
    { start: 30, end: 36, text: '我们把夜留在了身后' },
  ],
}

/** An answer to `question` the way QQ Music would give it, after a moment (a page that loads). */
export function previewAnswer(question: QqMusicQuestion): Promise<unknown> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      switch (question.ask) {
        case 'home':
          resolve(home())
          break
        case 'top':
          resolve({
            sections: [cardSection('巅峰榜', 'top', 0, 6), cardSection('地区榜', 'top', 6, 6)],
          })
          break
        case 'search':
          resolve(search(question.query))
          break
        case 'collection':
          resolve(collection(question.name))
          break
        case 'lyrics':
          resolve(LYRICS)
          break
        default:
          resolve({})
      }
    }, 320)
  })
}
