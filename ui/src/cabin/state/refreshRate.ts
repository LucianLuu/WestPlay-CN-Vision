/**
 * The screen's refresh rate: how often WestPlay hands the game a new frame, chosen in Settings › Appearance
 * (mirrors `westplay_host::settings::RefreshRate`).
 *
 * 60 Hz as the game's own screens are, or 30 Hz to lighten the load on a lesser machine. The host publishes
 * WestPlay's frames at it (`crates/host capture.rs`), and the cabin page draws its map at the same rate
 * (`maps/frameCap.ts`): a screen handed 30 frames a second gains nothing from drawing 60.
 */
export type RefreshRate = '60' | '30'

/** What Settings › Appearance offers, the standard rate first. */
export const REFRESH_RATES: readonly RefreshRate[] = ['60', '30']

/** What WestPlay comes with, and what a settings file without one means. */
export const DEFAULT_REFRESH_RATE: RefreshRate = '60'

/** Whether a value from the host is one of the rates (older hosts send none). */
export function isRefreshRate(value: unknown): value is RefreshRate {
  return value === '60' || value === '30'
}

/** The rate in Hertz: what the page's map cap and the host's interval are counted in. */
export function hertz(rate: RefreshRate): number {
  return Number(rate)
}
