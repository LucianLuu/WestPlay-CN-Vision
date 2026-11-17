import { useEffect, useState } from 'react'
import { type HostStatus, appleMusicCheck } from './useHostStatus'

/**
 * Whether each service is signed in, as the companion last knew: the sites the apps show are the host's word (a
 * sign-in window says when one is done, and WestPlay keeps that while it runs), Apple Music's is its own player's.
 * Only whether, nothing else of the account, in the companion's own storage (gone with WestPlay when it's
 * uninstalled). Apple Music never known is asked once, as the companion opens: run hidden to say.
 */
export interface SignedIn {
  bilibili: boolean | null
  netease: boolean | null
  qqMusic: boolean | null
  appleMusic: boolean | null
}

export type Service = keyof SignedIn

const SERVICES: Service[] = ['bilibili', 'netease', 'qqMusic', 'appleMusic']

const KEY = 'westplay.companion.signedIn'

function kept(): SignedIn {
  let value: Partial<Record<Service, unknown>> | null = null
  try {
    value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Record<Service, unknown>> | null
  } catch {
    // Nothing kept: each is asked.
  }
  const known = (service: Service) => (typeof value?.[service] === 'boolean' ? (value[service] as boolean) : null)
  return {
    bilibili: known('bilibili'),
    netease: known('netease'),
    qqMusic: known('qqMusic'),
    appleMusic: known('appleMusic'),
  }
}

function keep(value: SignedIn) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Not kept: known again next time a service says.
  }
}

/** What's known now: the status's, else what was kept (saved again whenever a status says). */
export function useSignedIn(status: HostStatus | null): SignedIn {
  const [known] = useState(kept)
  const site = (service: 'bilibili' | 'netease' | 'qqMusic') => status?.webLogins?.[service]?.signedIn ?? null
  const now: SignedIn = {
    bilibili: site('bilibili'),
    netease: site('netease'),
    qqMusic: site('qqMusic'),
    appleMusic: status?.appleMusicSignedIn ?? null,
  }
  useEffect(() => {
    if (SERVICES.every((service) => now[service] === null)) return
    const before = kept()
    keep({
      bilibili: now.bilibili ?? before.bilibili,
      netease: now.netease ?? before.netease,
      qqMusic: now.qqMusic ?? before.qqMusic,
      appleMusic: now.appleMusic ?? before.appleMusic,
    })
    // Keyed by the four answers (`now` itself is new at every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.bilibili, now.netease, now.qqMusic, now.appleMusic])
  return {
    bilibili: now.bilibili ?? known.bilibili,
    netease: now.netease ?? known.netease,
    qqMusic: now.qqMusic ?? known.qqMusic,
    appleMusic: now.appleMusic ?? known.appleMusic,
  }
}

/** As the companion opens: Apple Music, never known yet, is run hidden to say. The sites' pages say when their
 * sign-in window signs in: nothing to ask of them. */
export function useAskOnce(): void {
  useEffect(() => {
    if (kept().appleMusic === null) appleMusicCheck().catch(() => {})
  }, [])
}
