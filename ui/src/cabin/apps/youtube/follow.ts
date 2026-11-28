/** How long a video asked for may take to be the one YouTube's player reports, ms (YouTube starting up,
 * a slow connection). */
export const LOAD_MS = 20_000

/** A video asked for (`play`), not yet reported by YouTube's player, and when it was asked for. */
export interface Loading {
  video: string
  at: number
  /**
   * The ids Bilibili's own page may report for this same video: a season's page (`ss47836`) plays one of
   * its episodes and reports that node (`ep830494`), and an episode's page reports its season instead
   * (`ss47836`) once it knows which one it plays (`ep830494` asked for). Without them the app took the two
   * for different videos, kept waiting for an id that never came, and left the screen on the page's black
   * stand-in (owner 2026-11-26: "番剧的视频无法加载").
   */
  also?: string[]
}

/**
 * Whether what the page reports is the video asked for.
 *
 * Bilibili's own page reports the node it is playing rather than the one the app listed: a season
 * (`ss…`) is played as one of its episodes (`ep…`), and an episode the app opened is reported as its
 * season on some pages. Either way the two are the same watch, and taking them for different videos
 * left the app waiting for an id that would never come, with the screen on Bilibili's black stand-in
 * (owner 2026-11-26: "番剧的视频无法加载"). Kept as a prefix rule so it holds whichever way round the
 * page answers, without the app having to know the season's episode list.
 */
export function sameVideo(asked: Loading, reported: string): boolean {
  if (reported === asked.video) return true
  if (asked.also?.includes(reported)) return true
  // A season's page and its episode's are one watch (`ss47836` played as `ep830494`).
  return isSeason(asked.video) && isEpisode(reported)
}

/** A season's own id (`ss47836`). */
export function isSeason(id: string): boolean {
  return /^ss\d+$/.test(id)
}

/** One of a season's episodes (`ep830494`). */
export function isEpisode(id: string): boolean {
  return /^ep\d+$/.test(id)
}

/**
 * What the app shows as playing, given what YouTube's player (in the host, which outlives the page) says it
 * plays: the host is right. `reported` is its video (`null`: YouTube isn't running). Keeps the video shown
 * while one asked for is on its way; otherwise the video shown follows the one reported (`restore`, after a
 * reload of the page, say), or goes when nothing plays (`clear`).
 */
export function follow(
  shown: string | null,
  reported: string | null,
  loading: Loading | null,
  now: number,
): { shown: 'keep' | 'restore' | 'clear'; loading: Loading | null } {
  const waiting = loading !== null && now - loading.at < LOAD_MS
  if (reported === null)
    return waiting ? { shown: 'keep', loading } : { shown: shown ? 'clear' : 'keep', loading: null }
  if (loading && sameVideo(loading, reported)) return { shown: 'keep', loading: null }
  if (waiting) return { shown: 'keep', loading }
  return { shown: reported === shown ? 'keep' : 'restore', loading: null }
}
