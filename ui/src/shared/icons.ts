/**
 * App icons by role. The UI only ever asks for a role (and a look, light or dark), so replacing the icon set
 * means changing this file.
 *
 * WestPlay's own icons (public/icons/westplay), each in a light and a dark look: drawn in the logo's style, and
 * for the music services their companies' own marks, from their official files (on their own background in the
 * light look, on WestPlay's dark card in the dark look).
 */
export type AppIconRole =
  | 'maps'
  | 'music'
  | 'spotify'
  | 'podcasts'
  | 'messages'
  | 'phone'
  | 'calendar'
  | 'settings'
  | 'vehicle'
  | 'weather'
  | 'youtube'
  | 'youtubeMusic'
  | 'player'
  | 'douyin'
  | 'kugou'
  | 'safari'

/** Each role's files' name. */
const FILES: Record<AppIconRole, string> = {
  maps: 'maps',
  music: 'music',
  spotify: 'netease',
  // Qingting FM's own mark (red, on its own card): the podcast slot shows it now.
  podcasts: 'qingting',
  messages: 'messages',
  phone: 'phone',
  calendar: 'calendar',
  settings: 'settings',
  // The Vehicle app's own: a truck's face, drawn flat (public/icons/westplay/vehicle.light.svg).
  vehicle: 'vehicle',
  weather: 'weather',
  youtube: 'bilibili',
  youtubeMusic: 'qq-music',
  player: 'player',
  // The two slots of their own: a clip card for Douyin, a note on Kugou's blue for Kugou Music.
  douyin: 'douyin',
  kugou: 'kugou',
  safari: 'safari',
}

/**
 * The roles whose mark is the company's own picture rather than WestPlay's drawing: the music services' and
 * Bilibili's icons, shipped as the original PNGs (one file serves both looks). Every other role is an SVG.
 */
const PICTURES: ReadonlySet<AppIconRole> = new Set<AppIconRole>([
  // Empty: every role has its own light and dark SVG now (owner 2026-11-14: the Apple-style pack the
  // player made draws Bilibili's, NetEase's and QQ Music's marks for both looks, so the old PNGs (one
  // file for both) aren't asked for any more).
])

/** WestPlay's own icon for `role`, for a light or a dark screen. */
export function appIcon(role: AppIconRole, look: 'light' | 'dark' = 'light'): string {
  return PICTURES.has(role)
    ? `/icons/westplay/${FILES[role]}.png`
    : `/icons/westplay/${FILES[role]}.${look}.svg`
}
