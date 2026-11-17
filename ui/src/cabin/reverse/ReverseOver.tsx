import { useLive } from '../state/store'
import { useText } from '../state/text'
import { ReverseBar } from './ReverseBar'
import { useReverseLayout } from './layout'
import { parksOnTheGamesConsole, reversing } from './reverse'
import './reverse.css'

/**
 * The game's own reversing camera (owner 2026-11-04: 「挂r档时触发，开启时画面占据整个屏幕」, FIXES §91): the truck
 * in reverse, the page steps aside whole (`shell/Shell.tsx` takes the CarPlay area out of sight) and the game's
 * picture shows through — the engine draws it into the mod's element, over the screen it draws under the page
 * (`/material/environment/mirror/park_1x1_ui.mat`, crates/setup/src/game_mod.rs).
 *
 * Only the bar and the warning are drawn over it, so they live here rather than in `ReverseCamera.tsx`: a page
 * stepped aside takes its children with it, and these have to stay. Everything else in it is see-through to the
 * touch, so the game's screen keeps what is pressed anywhere but on the bar's own buttons.
 */
export function ReverseOver() {
  const text = useText()
  const layout = useReverseLayout((state) => state.layout)
  const reversingNow = useLive((state) => reversing(state))
  // A vehicle whose own console shows the reverse picture (`parksOnTheGamesConsole`) has no bar of WestPlay's over
  // it: the game's console is the whole screen there, the player's own controls and all.
  const onTheGamesConsole = useLive((state) => parksOnTheGamesConsole(state))
  if (!reversingNow || onTheGamesConsole || layout !== 'live') return null
  return (
    <div className="rev-over">
      <ReverseBar />
      <p className="rev-warning">{text.reverseCamera.warning}</p>
    </div>
  )
}
