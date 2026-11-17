import maplibregl from 'maplibre-gl'
import { seaTile } from './seaTiles'

/** The scheme the map's open-sea tiles are named by (seaTiles.ts). */
export const SEA_PROTOCOL = 'westplay-sea'

/**
 * Registers [`SEA_PROTOCOL`] with the page's MapLibre, once. A map whose tiles are named by it (its
 * build lists them, `seaTiles`) loses its whole tile source while the scheme is unknown — the land,
 * the water, the roads, the signs and the places with it (no place icons, no road numbers: a player's
 * report, 2026-11-15).
 *
 * The registration is written out here rather than called from seaTiles' helper: a call to a helper
 * of another module was dropped by the bundler as dead code (its result unused), and the scheme
 * stayed unregistered. This module is the cabin page's own (main.tsx imports it), so its code is
 * always in that page's bundle.
 */
export function installSeaProtocol(): void {
  const library = maplibregl as unknown as {
    addProtocol: (name: string, handler: (params: { url: string }, abort: AbortController) => Promise<{ data: ArrayBuffer }>) => void
  }
  if (typeof library.addProtocol !== 'function') return
  library.addProtocol(SEA_PROTOCOL, async (params, abort) => ({
    data: await seaTile(params.url, abort.signal),
  }))
}
