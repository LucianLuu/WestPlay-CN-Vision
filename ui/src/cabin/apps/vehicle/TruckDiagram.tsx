/**
 * The truck seen from above on the overview's status card: the player's own truck, drawn from the game's own
 * models - the cab, the tanks and the axles of the model the game says is being driven, from pictures kept in
 * `public/icons/vehicles/` (one per model, named for the game's id: `vehicle.volvo.fh_2021`).
 *
 * The pictures are shot nose-up, the way a truck stands in a workshop drawing; the card shows the truck on its
 * side, nose to the left, as a car's own diagram does, so the picture is turned a quarter turn here.
 *
 * A model WestPlay has no picture of gets a plain outline in the truck's own colour rather than another truck's
 * likeness: showing the wrong truck would be worse than showing the idea of one.
 */
import type { TruckInfo } from '../../../shared/host'

/** The pictures there are, by the game's own model id (crates/shared: `TruckInfo.id`). */
const PICTURES: Record<string, string> = {
  // Euro Truck Simulator 2.
  'vehicle.daf.2021': 'daf-ngd',
  'vehicle.daf.xd': 'daf-ngd',
  'vehicle.daf.xf_electric': 'daf-ngd',
  'vehicle.iveco.sway': 'iveco-s-way',
  'vehicle.renault.t': 'renault-t',
  'vehicle.scania.s_2016': 'scania-s',
  'vehicle.scania.s_2024e': 'scania-s',
  'vehicle.volvo.fh_2021': 'volvo-fh5',
  'vehicle.volvo.fh_2024': 'volvo-fh6',
  // American Truck Simulator.
  'vehicle.kenworth.t680': 'kenworth-t680',
  'vehicle.volvo.vnl2018': 'volvo-vnl2018',
  'vehicle.volvo.vnl2025': 'volvo-vnl2025',
  'vehicle.ford.bronco': 'ford-bronco',
  'vehicle.ford.f150': 'ford-f150',
}

/** The picture for a truck, or `null` for one WestPlay hasn't a picture of. */
export function truckPicture(truck: TruckInfo | null): string | null {
  const id = truck?.id.toLowerCase() ?? ''
  if (id === '') return null
  // The game's id, exactly; a model whose id carries a suffix (`vehicle.ford.f150_2023`) still finds its own.
  const key = Object.keys(PICTURES).find((each) => id === each || id.startsWith(each + '_') || id.startsWith(each + '.'))
  return key ? `/icons/vehicles/${PICTURES[key]}.png` : null
}

/**
 * The truck as the card shows it: the player's own picture, turned a quarter turn so the truck lies across the
 * card, nose to the left; or — for a truck WestPlay hasn't a picture of — its name, and no picture at all.
 */
export function TruckDiagram({ truck, label }: { truck: TruckInfo | null; label: string }) {
  const picture = truckPicture(truck)
  if (picture === null) {
    return <p className="veh-no-picture">{label}</p>
  }
  return (
    <div className="veh-truck">
      <div className="veh-truck-box">
        <img className="veh-truck-image" src={picture} alt="" />
      </div>
    </div>
  )
}
