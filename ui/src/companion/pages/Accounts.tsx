import { useState } from 'react'
import type { Service, SignedIn } from '../accounts'
import type { Note, Words } from '../onboarding/words'
import { Button, Checking, Group, Panel, Row } from '../room/parts'
import { banner, useSignOut, useWords } from '../room/room'
import { GLOW, useScreenAt } from '../room/screen'
import type { AppId } from '../../cabin/state/apps'
import {
  type HostStatus,
  appleMusicSignIn,
  appleMusicSignOut,
  webSignIn,
  webSignOut,
} from '../useHostStatus'
import type { PageProps } from './page'

/** The sites' words, for a language that has no `webAccounts` of its own (English). */
const WEB_WORDS: { finishInWindow: string; signingIn: Note } = {
  finishInWindow: 'Finish signing in in the window',
  signingIn: { title: 'Signing in', text: 'Continue in the window' },
}

/** Each service: its name, its app on the screen, its sign-in and sign-out, and what its status says. */
const SERVICES: Record<
  Service,
  {
    name: string
    app: AppId
    glow: string
    signIn(): Promise<void>
    signOut(): Promise<void>
    signingIn(status: HostStatus | null): boolean
    /** Whether it can be asked whether it's signed in without being signed in to (`false`: a site, whose page
     * says in a window of its own). */
    checks: boolean
    /** Its words while signing in (the sites' are the accounts' own, or `webAccounts`'). */
    words(words: Words): { finishInWindow: string; signingIn: Note }
  }
> = {
  bilibili: {
    name: '哔哩哔哩',
    app: 'youtube',
    glow: GLOW.youtube,
    signIn: () => webSignIn('bilibili'),
    signOut: () => webSignOut('bilibili'),
    signingIn: (status) => status?.webLogins?.bilibili.signingIn ?? false,
    checks: false,
    words: (words) => words.webAccounts ?? WEB_WORDS,
  },
  netease: {
    name: '网易云音乐',
    app: 'spotify',
    glow: GLOW.spotify,
    signIn: () => webSignIn('netease'),
    signOut: () => webSignOut('netease'),
    signingIn: (status) => status?.webLogins?.netease.signingIn ?? false,
    checks: false,
    words: (words) => words.webAccounts ?? WEB_WORDS,
  },
  qqMusic: {
    name: 'QQ音乐',
    app: 'youtubeMusic',
    glow: GLOW.music,
    signIn: () => webSignIn('qqMusic'),
    signOut: () => webSignOut('qqMusic'),
    signingIn: (status) => status?.webLogins?.qqMusic.signingIn ?? false,
    checks: false,
    words: (words) => words.webAccounts ?? WEB_WORDS,
  },
  appleMusic: {
    name: 'Apple Music',
    app: 'music',
    glow: GLOW.music,
    signIn: appleMusicSignIn,
    signOut: appleMusicSignOut,
    signingIn: (status) => status?.appleMusicSigningIn ?? false,
    checks: true,
    words: (words) => words.appleMusic,
  },
}

const ORDER: Service[] = ['bilibili', 'netease', 'qqMusic', 'appleMusic']

/**
 * The services WestPlay plays from, each signed in (in its own window, on the desktop) or not. WestPlay only
 * ever knows whether it is. On the room's screen, the app of the service the pointer is on.
 */
export function Accounts({ status, cw, signedIn }: PageProps) {
  const words = useWords()
  const [shown, setShown] = useState<Service>('bilibili')
  const signingIn = ORDER.find((service) => SERVICES[service].signingIn(status)) ?? null
  const service = SERVICES[signingIn ?? shown]
  useScreenAt(service.app, service.glow, signingIn ? banner(service.words(words).signingIn, true) : null)
  return (
    <Panel place="page" title={cw.accounts.title} sub={cw.accounts.sub}>
      <Group place={4}>
        {ORDER.map((each) => (
          <Account key={each} service={each} status={status} signedIn={signedIn} hover={() => setShown(each)} />
        ))}
      </Group>
    </Panel>
  )
}

/** A service: signed in or not (as last known; found out as the companion opened if never known), and its
 * button. */
function Account({
  service,
  status,
  signedIn: all,
  hover,
}: {
  service: Service
  status: HostStatus | null
  signedIn: SignedIn
  hover(): void
}) {
  const words = useWords()
  const w = words.accounts
  const s = SERVICES[service]
  const known = all[service]
  const signedIn = known ?? false
  const signingIn = s.signingIn(status)
  // A site says when its window signs in: nothing to check, so nothing to wait for.
  const checking = known === null && s.checks
  const signOut = useSignOut(signedIn, s.signOut)
  return (
    <Row
      title={s.name}
      detail={checking ? undefined : signingIn ? s.words(words).finishInWindow : signedIn ? w.signedIn : w.notSignedIn}
      hover={hover}
      accessory={
        checking ? (
          <Checking />
        ) : signedIn ? (
          <Button glass small busy={signOut.signingOut} onClick={signOut.start}>
            {w.signOut}
          </Button>
        ) : (
          <Button glass small busy={signingIn} onClick={() => s.signIn()}>
            {w.signIn}
          </Button>
        )
      }
    />
  )
}
