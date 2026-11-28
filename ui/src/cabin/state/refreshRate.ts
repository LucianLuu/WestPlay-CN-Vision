/**
 * The screen's refresh rate: how often WestPlay hands the game a new frame, chosen in Settings › Display &
 * Performance (mirrors `westplay_host::settings::RefreshRate`). 60 Hz as the game's own screens are; 30 Hz to
 * lighten the load on a lesser machine; or the display's own rate, where every frame the page draws reaches the
 * game (3.0.0-beta.1's scheme, taken over 2026-11-28).
 *
 * It is what the host publishes at (`crates/host capture.rs`): 30 or 60 on its clock, and the display's rate
 * with no clock of its own, each frame as it arrives. The map keeps drawing at its own pace either way
 * (`maps/frameCap.ts`): at a lower rate the screen just shows fewer of its frames.
 */
export type RefreshRate = '60' | '30' | 'display'

/** What Settings › Display & Performance offers, the standard rate first. */
export const REFRESH_RATES: readonly RefreshRate[] = ['60', '30', 'display']

/** What WestPlay comes with, and what a settings file without one means. */
export const DEFAULT_REFRESH_RATE: RefreshRate = '60'

/** Whether a value from the host is one of the rates (older hosts send none) or the display's own. */
export function isRefreshRate(value: unknown): value is RefreshRate {
  return value === '60' || value === '30' || value === 'display'
}

/** The rate in Hertz: what the host's interval is counted in; 0, the display's own, means no interval. */
export function hertz(rate: RefreshRate): number {
  return rate === 'display' ? 0 : Number(rate)
}
