/** The image hosts an account's picture is on: Google's (YouTube) and Bilibili's own (it answers both). */
const PICTURE_HOSTS = [
  'https://yt3.ggpht.com/',
  'https://yt3.googleusercontent.com/',
  'https://lh3.googleusercontent.com/',
]

/**
 * Whether `url` is a picture from an account's own hosts (Bilibili's `hdslb.com` and `biliimg.com` CDNs at any
 * subdomain, and Google's): the only ones a page may load.
 */
function isAccountPicture(url: string): boolean {
  if (PICTURE_HOSTS.some((host) => url.startsWith(host))) return true
  const rest = url.startsWith('https://') ? url.slice(8) : url.startsWith('http://') ? url.slice(7) : null
  if (!rest) return false
  const host = rest.split('/')[0]
  return host.endsWith('.hdslb.com') || host === 'hdslb.com' || host.endsWith('.biliimg.com') || host === 'biliimg.com'
}

/** An account as the cab shows it: signed in or not, its picture, and (Bilibili's) its name and `mid`. */
export interface Account {
  signedIn: boolean
  avatar: string | null
  /** Bilibili's own: the player's name, for their page's header (`''` until its page says). */
  name?: string
  /** Bilibili's own: their `mid`, whose videos are their own page's. */
  mid?: string | null
}

/**
 * The account as it was kept (shown at once as WestPlay starts, replaced as the page says it): signed in or out, and a picture only from an account's own hosts; anything else, nothing.
 */
export function keptAccount(kept: unknown): Account | null {
  if (!kept || typeof kept !== 'object') return null
  const { signedIn, avatar, name, mid } = kept as {
    signedIn?: unknown
    avatar?: unknown
    name?: unknown
    mid?: unknown
  }
  if (typeof signedIn !== 'boolean') return null
  const picture = signedIn && typeof avatar === 'string' && isAccountPicture(avatar) ? avatar : null
  const account: Account = { signedIn, avatar: picture }
  if (typeof name === 'string') account.name = name.slice(0, 40)
  if (typeof mid === 'string' && /^\d{1,20}$/.test(mid)) account.mid = mid
  return account
}
