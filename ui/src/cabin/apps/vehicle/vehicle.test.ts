import { describe, expect, it } from 'vitest'
import { ENGINE, type Telemetry, WEAR } from '../../../shared/host'
import {
  adblue,
  airPressure,
  bodyDamage,
  bodyWear,
  cargoWear,
  damaged,
  fuel,
  hitched,
  odometer,
  overallWear,
  percent,
  severity,
  shareOf,
  trailerDamage,
  trailerWear,
  truckWear,
  waterTemperature,
  worst,
} from './vehicle'

/** A truck the game gave both its tanks for. */
const TRUCK = {
  brandId: 'scania',
  brand: 'Scania',
  id: 'vehicle.scania.s',
  name: 'S',
  fuelCapacity: 700,
  adblueCapacity: 95,
}

/** Telemetry with the wear channels of a truck that has taken some damage, and a trailer behind it. */
function telemetry(over: Partial<Telemetry> = {}): Telemetry {
  return {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    engineRpm: 0,
    gear: 0,
    displayedGear: 0,
    steering: 0,
    cruiseControlSpeed: 0,
    fuel: 0,
    fuelRange: 0,
    navigationDistance: 0,
    navigationTime: 0,
    navigationSpeedLimit: 0,
    gameTime: 0,
    multiplayerTimeOffset: 0,
    localScale: 0,
    dashboardBacklight: 0,
    electricEnabled: true,
    engineEnabled: true,
    parkingBrake: false,
    lowBeam: false,
    highBeam: false,
    leftBlinker: false,
    rightBlinker: false,
    paused: false,
    wearEngine: 0.12,
    wearTransmission: 0,
    wearCab: 0,
    wearChassis: 0.34,
    wearWheels: 0.05,
    trailerConnected: true,
    trailerWearChassis: 0.2,
    trailerWearWheels: 0,
    cargoDamage: 0.07,
    wearKnown:
      WEAR.engine |
      WEAR.transmission |
      WEAR.cab |
      WEAR.chassis |
      WEAR.wheels |
      WEAR.trailerChassis |
      WEAR.trailerWheels |
      WEAR.cargo,
    ...over,
  }
}

describe('truckWear', () => {
  it('gives every part the game reported, in the app’s order', () => {
    expect(truckWear(telemetry())).toEqual([
      { part: 'engine', wear: 0.12 },
      { part: 'transmission', wear: 0 },
      { part: 'cab', wear: 0 },
      { part: 'chassis', wear: 0.34 },
      { part: 'wheels', wear: 0.05 },
    ])
  })

  it('a channel the game hasn’t is unknown, not undamaged', () => {
    const partial = telemetry({ wearKnown: WEAR.engine })
    expect(truckWear(partial).map((each) => each.wear)).toEqual([0.12, null, null, null, null])
  })

  it('nothing at all without telemetry or an older host', () => {
    expect(truckWear(null).every((each) => each.wear === null)).toBe(true)
    // A host from before the app: no wear fields and no bits.
    const old = telemetry({ wearKnown: undefined, wearEngine: undefined })
    expect(truckWear(old).every((each) => each.wear === null)).toBe(true)
  })
})

describe('trailerWear', () => {
  it('is the trailer’s chassis and wheels', () => {
    expect(trailerWear(telemetry())).toEqual([
      { part: 'chassis', wear: 0.2 },
      { part: 'wheels', wear: 0 },
    ])
  })

  it('is unknown where the game hasn’t the channels (games before trailer wear)', () => {
    const older = telemetry({ wearKnown: WEAR.chassis | WEAR.cargo })
    expect(trailerWear(older).map((each) => each.wear)).toEqual([null, null])
  })
})

describe('cargoWear', () => {
  it('is the cargo’s damage', () => {
    expect(cargoWear(telemetry())).toBe(0.07)
  })

  it('is unknown when the game doesn’t say', () => {
    expect(cargoWear(telemetry({ wearKnown: WEAR.engine }))).toBeNull()
    expect(cargoWear(null)).toBeNull()
  })
})

describe('hitched', () => {
  const trailer = { id: 'trailer.scs.box', brandId: 'scs', brand: '', name: '', plate: '', chainType: '', bodyType: '' }

  it('follows the game’s channel', () => {
    expect(hitched(telemetry(), null)).toBe(true)
    expect(hitched(telemetry({ trailerConnected: false }), null)).toBe(false)
  })

  it('or the trailer the game named', () => {
    expect(hitched(telemetry({ trailerConnected: undefined }), trailer)).toBe(true)
    expect(hitched(telemetry({ trailerConnected: false }), trailer)).toBe(true)
  })

  it('is not with neither', () => {
    expect(hitched(null, null)).toBe(false)
    expect(hitched(telemetry({ trailerConnected: false }), { ...trailer, id: '' })).toBe(false)
  })
})

describe('percent', () => {
  it('writes whole percents, and below one but not none, <1', () => {
    expect(percent(0)).toBe('0')
    expect(percent(0.004)).toBe('<1')
    expect(percent(0.12)).toBe('12')
    // Half a percent is under one, not a whole one: the number never rounds up.
    expect(percent(0.005)).toBe('<1')
    expect(percent(1)).toBe('100')
    expect(percent(1.4)).toBe('100')
  })

  it('floors, so a part is never written as more damaged than it is', () => {
    expect(percent(0.045)).toBe('4')
    expect(percent(0.0499)).toBe('4')
    expect(percent(0.999)).toBe('99')
    // 0.29 * 100 is 28.999999999999996 in binary: still 29, not 28.
    expect(percent(0.29)).toBe('29')
  })
})

describe('severity', () => {
  it('is green to a tenth, amber to a third, red past', () => {
    expect(severity(0)).toBe('good')
    expect(severity(0.099)).toBe('good')
    expect(severity(0.1)).toBe('warn')
    expect(severity(0.299)).toBe('warn')
    expect(severity(0.3)).toBe('bad')
    expect(severity(1)).toBe('bad')
  })
})

describe('worst', () => {
  it('is the worst of the parts the game answered, none when it answered for none', () => {
    expect(worst(truckWear(telemetry()))).toBe(0.34)
    expect(worst(trailerWear(telemetry()))).toBe(0.2)
    expect(worst([{ part: 'chassis', wear: null }])).toBeNull()
  })
})

describe('bodyDamage', () => {
  it('is the worst of the body’s parts, the tyres left out', () => {
    expect(bodyDamage(telemetry())).toBe(0.34)
    // Tyres worn worse than any body part: they're not the body's damage.
    const wornTyres = telemetry({ wearWheels: 0.9 })
    expect(bodyDamage(wornTyres)).toBe(0.34)
    expect(bodyWear(wornTyres).map((each) => each.part)).toEqual(['engine', 'transmission', 'cab', 'chassis'])
  })

  it('is unknown when the game answered for none of the body’s parts', () => {
    expect(bodyDamage(telemetry({ wearKnown: WEAR.wheels }))).toBeNull()
    expect(bodyDamage(null)).toBeNull()
  })
})

describe('trailerDamage', () => {
  it('is the trailer’s chassis, its wheels left out', () => {
    expect(trailerDamage(telemetry())).toBe(0.2)
    expect(trailerDamage(telemetry({ trailerWearWheels: 0.8 }))).toBe(0.2)
  })

  it('is unknown without a trailer’s channels', () => {
    expect(trailerDamage(telemetry({ wearKnown: WEAR.engine }))).toBeNull()
    expect(trailerDamage(null)).toBeNull()
  })
})

describe('airPressure', () => {
  it('is the brake air tank’s pressure when the game answered', () => {
    expect(airPressure(telemetry({ brakeAirPressure: 8.9, engineKnown: ENGINE.air }))).toBe(8.9)
  })

  it('is unknown when the game has no such channel (an older game)', () => {
    expect(airPressure(telemetry({ brakeAirPressure: 8.9, engineKnown: 0 }))).toBeNull()
    expect(airPressure(telemetry({ engineKnown: undefined, brakeAirPressure: undefined }))).toBeNull()
    expect(airPressure(null)).toBeNull()
  })
})

describe('adblue', () => {
  const truck = (adblueCapacity: number) => ({ ...TRUCK, adblueCapacity })

  it('is the litres left and their share of the tank', () => {
    expect(adblue(telemetry({ adblue: 76, engineKnown: ENGINE.adblue }), truck(95))).toEqual({
      value: 76,
      share: 0.8,
    })
  })

  it('is its amount without a share when the game gave no capacity', () => {
    expect(adblue(telemetry({ adblue: 76, engineKnown: ENGINE.adblue }), truck(0))).toEqual({
      value: 76,
      share: null,
    })
  })

  it('is unknown without the channel, and without telemetry', () => {
    expect(adblue(telemetry({ adblue: 76, engineKnown: 0 }), truck(95))).toEqual({ value: null, share: null })
    expect(adblue(null, truck(95))).toEqual({ value: null, share: null })
  })
})

describe('fuel', () => {
  it('is the litres left and their share of the tank', () => {
    expect(fuel(telemetry({ fuel: 350 }), { ...TRUCK, fuelCapacity: 700 })).toEqual({ value: 350, share: 0.5 })
  })

  it('is its amount without a share when the game gave no capacity', () => {
    expect(fuel(telemetry({ fuel: 350 }), { ...TRUCK, fuelCapacity: 0 })).toEqual({ value: 350, share: null })
    expect(fuel(telemetry({ fuel: 350 }), { brandId: 'x', brand: 'X', id: 'x', name: 'X' })).toEqual({
      value: 350,
      share: null,
    })
  })

  it('is unknown without telemetry', () => {
    expect(fuel(null, TRUCK)).toEqual({ value: null, share: null })
  })
})

describe('waterTemperature', () => {
  it('is the coolant’s temperature when the game answered', () => {
    expect(waterTemperature(telemetry({ waterTemperature: 27.4, engineKnown: ENGINE.water }))).toBe(27.4)
  })

  it('is unknown without the channel', () => {
    expect(waterTemperature(telemetry({ waterTemperature: 27.4, engineKnown: 0 }))).toBeNull()
    expect(waterTemperature(null)).toBeNull()
  })
})

describe('odometer', () => {
  it('is the distance driven when the game answered', () => {
    expect(odometer(telemetry({ odometer: 120345, engineKnown: ENGINE.odometer }))).toBe(120345)
  })

  it('is unknown without the channel', () => {
    expect(odometer(telemetry({ odometer: 120345, engineKnown: 0 }))).toBeNull()
    expect(odometer(null)).toBeNull()
  })
})

describe('shareOf', () => {
  it('is the value over the capacity, kept within the tank', () => {
    expect(shareOf(50, 100)).toBe(0.5)
    // A drop over the brim: a full tank, not more.
    expect(shareOf(101, 100)).toBe(1)
    expect(shareOf(-1, 100)).toBe(0)
  })

  it('is nothing without a capacity to read it against', () => {
    expect(shareOf(50, 0)).toBeNull()
    expect(shareOf(null, 100)).toBeNull()
  })
})

describe('overallWear', () => {
  it('is the worst part of the truck, the tyres included', () => {
    expect(overallWear(telemetry())).toBe(0.34)
    expect(overallWear(telemetry({ wearWheels: 0.9 }))).toBe(0.9)
  })

  it('is unknown when the game answered for no part', () => {
    expect(overallWear(telemetry({ wearKnown: 0 }))).toBeNull()
    expect(overallWear(null)).toBeNull()
  })
})

describe('damaged', () => {
  it('is the parts a tenth worn or more, in the app’s order', () => {
    expect(damaged(telemetry()).map((wear) => wear.part)).toEqual(['engine', 'chassis'])
  })

  it('leaves out the parts the game answered for as as-new, and the ones it didn’t answer for', () => {
    expect(damaged(telemetry({ wearKnown: WEAR.wheels }))).toEqual([])
    expect(damaged(null)).toEqual([])
  })
})
