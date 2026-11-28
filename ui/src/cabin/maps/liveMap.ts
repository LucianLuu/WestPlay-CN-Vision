import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url'
import { displayClock, mapFrameDue } from './frameCap'
import { seaTilesProtocol } from './seaTiles'
import { create as createStore } from 'zustand'
import type { Telemetry } from '../../shared/host'
import type { Appearance } from '../state/appearance'
import { type LiveState, useCabin, useLive } from '../state/store'
import { textScale } from '../state/textSize'
import {
  AUTO_RECENTRE_MS,
  bearingOf,
  blendPose,
  type CameraPose,
  clampZoomOffset,
  damp,
  dampBearing,
  easeInOut,
  FOLLOW_DELAY_MS,
  followPitch,
  followZoom,
  GLIDE_MS,
  PITCH,
  samePose,
  type TruckSample,
  truckAt,
  zoomOffsetFor,
} from './camera'
import { buildingFilter, buildingsVisibility, type Canopy, canopiesOver } from './buildings'
import { labelLines, placeLabels } from './labels'
import { NO_ENTRY_ICON, drawNoEntry, drawPlaceIcon, parsePlaceIcon } from './placeIcons'
import { type BuildingMeshes, buildingMeshes } from './buildingMeshes'
import { type RaisedRoads, raisedRoads, routeArrowLayer } from './raisedRoads'
import { cameraBounds, type MapData } from './mapData'
import { loadView, type SavedView, saveView } from './mapView'
import { fromLngLat, labelRange, metresBetween, toLngLat } from './projection'
import {
  approachLine,
  coachStopOnSpan,
  cutRaised,
  headLine,
  heightOnSpan,
  type Heights,
  type Point,
  routeAhead,
  type Progress,
  progressOf,
  type RaisedLine,
  restLine,
  routeHeights,
  routeSpans,
  snapToRoute,
  splitRoute,
  splitRouteAt,
  type Spans,
} from './route'
import { nextRouteArrow, ROUTE_ARROW_MAX_OFFSET, routeArrowSpan } from './routeArrow'
import {
  BUILDING_FLAT_LAYER,
  BUILDING_LAYER,
  MAP_SOURCE,
  SURFACE_SOURCE,
  mapStyle,
  OFFERED_SOURCE,
  PLAYERS_SOURCE,
  paintFor,
  placeImagesFor,
  ROUTE_FUTURE_SOURCE,
  ROUTE_HEAD_SOURCE,
  ROUTE_SOURCE,
  TRAFFIC_SOURCE,
} from './style'
import { corridorOf, type TrafficStretch, trafficAlong } from './traffic'
import { setMapView, setRouteAhead, useTruckersMp } from './truckersmp'
import { type Area, type OtherPlayer, trackAt } from './truckersmpFeed'

/**
 * The one live map of the page. It's made once and moved between the screens that show it (the
 * Dashboard's map tile, the Maps app), so opening either is instant: no new WebGL context, no parsing
 * the map again, and the camera carries on where it was.
 *
 * It follows the truck. In the Maps app the player can also move it (holding the interaction key): drag
 * to pan, right-drag to turn, the wheel or the zoom buttons to zoom. Moving it leaves the truck behind
 * (browsing) until the recentre button, or a while without touching it, glides it back; zooming while
 * following only brings the following camera closer or further.
 */

// MapLibre's worker as its own file: the copy inlined in its main bundle never starts once Vite has
// pre-bundled it.
maplibregl.setWorkerUrl(workerUrl)
// The map's tiles of open sea are named by a scheme of WestPlay's own (`westplay-sea://`):
// registered here, before any map is made, and through the same module MapLibre's own `addProtocol`
// comes from. A call to a helper of another module was dropped by the bundler as having no effect
// (its result unused), so the scheme stayed unregistered and every source of such a map failed:
// no place icons, no road numbers (a player's report, 2026-11-15).
seaTilesProtocol(maplibregl)

/** The driving view's tilt, degrees. */
/** The truck sits this far down the map (share of its height above it), leaving the road ahead in view. */
const PUCK_FROM_TOP = 0.66
/** How quickly the map turns after the truck (ms): slow enough to feel calm, quick enough to keep up. */
const BEARING_TAU_MS = 450
const ZOOM_TAU_MS = 1500
const SAMPLES_KEPT = 8
/** Place names' type size (a second line smaller: labelLines; both times the player's text size,
 * `nameScale`), and halo (maps.css), and the space kept between two names, pixels. */
const LABEL_SIZE = 26
const LABEL_SECOND_SIZE = 20
const LABEL_HALO = 4
const LABEL_GAP = 16
/** How much the player's text size scales the map's names (state/textSize.ts). */
const nameScale = () => textScale(useCabin.getState().textSize)
/** How long the text size stays put before the map's names follow it, ms. */
const TEXT_SIZE_SETTLE_MS = 350
/** Stops the map following the text size (the map's own, let go of when this module is replaced in
 * development: the store outlives it). */
let stopTextSize: (() => void) | undefined
/** Zoom levels per wheel notch (120 units). */
const WHEEL_ZOOM = 0.5
const MIN_ZOOM = 9
const MAX_ZOOM = 19.5
/** How far the truck moves along the route before the route's head is drawn again from it, metres. */
const ROUTE_HEAD_STEP = 0.5

type Mode = 'follow' | 'browse' | 'return'

interface LiveMap {
  data: MapData
  map: maplibregl.Map
  /** The map's own container, moved into whichever screen shows it. */
  element: HTMLDivElement
  puck: maplibregl.Marker
  /** The roads at their real heights, on a map with them, and how high over the map the puck is drawn, m. */
  raised: RaisedRoads | null
  showArrow(line: RaisedLine | null): void
  /** The buildings in their real shapes, on a map with them. */
  meshes: BuildingMeshes | null
  puckHeight: number
  /** The end of the route. */
  destination: maplibregl.Marker
  /** The remaining intermediate coach waypoints by their route node index. */
  waypoints: Map<number, { marker: maplibregl.Marker; point: Point }>
  /** The route drawn (`route`, as the store has it), as spans, with the span the rest of it is drawn after
   * and where its head was last drawn from (`null`: not drawn yet). */
  routeShown: {
    route: LiveState['route']
    spans: Spans
    active: Spans
    future: Spans
    restAfter: number | null
    headFrom: Point | null
    /** The first span eligible for the arrow, including crossing an arrow tip between game updates. */
    arrowSpan: number | null
    /** How high its points are drawn, as of which of `raised`'s tiles, and its stretches over the flat map. */
    heights: Heights
    heightsFor: number | null
    restRaised: RaisedLine[]
    headRaised: RaisedLine[]
    futureRaised: RaisedLine[]
  } | null
  /** Where the truck is along the route this frame (`null`: no route). */
  progress: Progress | null
  /** The next traffic light's marker, and what it last showed (the host's `trafficLight`). */
  trafficLight: { marker: maplibregl.Marker; element: HTMLDivElement; shown: string } | null
  /** Where the light snapped to on the drawn route, for the light and route it was worked out for. */
  trafficSnap: { key: string; route: Spans | null; point: Point } | null
  /** The canopies the truck is under, left out of the raised buildings (their ids, joined), and when they
   * were last looked for. */
  canopies: { hidden: string; at: number }
  /** The performance mode the buildings layer was last shown or put away for (Settings › Display &
   * Performance; `null`: not applied yet). */
  buildingsMode: boolean | null
  /** Place names, most important first, with their size on screen. */
  labels: { marker: maplibregl.Marker; at: [number, number]; width: number; height: number }[]
  /** The appearance the page wants, and the one the map is painted in (they differ until it's restyled). */
  wanted: Appearance
  painted: Appearance
  /** The owned garages' cities the place icons show as the player's (`null`: not applied yet). */
  garagesShown: string | null
  /** TruckersMP's other players: how many were last drawn, when, and when the part of the map shown was last
   * told the reader. */
  playersShown: number
  playersDrawn: number
  viewTold: number
  /** Under TruckersMP, driving a route: the route ahead (its traffic shown on it), when it was last worked
   * out, and the read of the trucks along it last shown (`null`: to show anew). */
  ahead: Point[] | null
  aheadTold: number
  aheadShown: readonly OtherPlayer[] | null
  /** The following camera's damped bearing and zoom. */
  camera: { bearing: number; zoom: number } | null
  mode: Mode
  /** Whether the screen showing it lets the player move it (the Maps app). */
  interactive: boolean
  /** A mouse button is held on the map: a drag may be starting, which moving the camera would cancel. */
  pressed: boolean
  /** When the player last moved the map, ms. */
  touched: number
  /** Showing the routes offered before Go (Directions): the map stays on them, not back on the truck. */
  overview: boolean
  /** Picks one of the routes offered, by its index, as its line on the map is tapped (`null`: none offered). */
  offeredPick: ((index: number) => void) | null
  /** How far the player zoomed the following camera from its speed zoom. */
  zoomOffset: number
  /** The zoom when browsing began: a different zoom when it ends is one the player chose, and kept. */
  browsedFrom: number
  /** The glide back onto the truck: where it set off from, and when. */
  glide: { from: CameraPose; fromTop: number; started: number } | null
  /** Following north up, from above (the compass tapped), rather than behind the truck; the arrow brings the
   * chase view back. */
  northUp: boolean
  /** Flat (the Maps app's 2D mode) rather than tilted behind the truck (3D): following it either way. */
  flat: boolean
  /** The view the place names were last placed for (`null`: place them again). */
  labelsPlacedFor: string | null
  /** The view as last kept (mapView.ts), and when it was last looked at. */
  kept: string
  keptAt: number
}

/** Whether the map is browsing (moved away from the truck): the Maps app shows its recentre button. */
export const useMapBrowsing = createStore<{ browsing: boolean }>()(() => ({ browsing: false }))

/** Whether the map is flat (2D) rather than tilted behind the truck (3D): the Maps app's 2D/3D control. */
export const useMapFlat = createStore<{ flat: boolean }>()(() => ({ flat: false }))

/** Those following the map's bearing (the compass), told each time it turns. */
const bearingListeners = new Set<(bearing: number) => void>()

function tellBearing(bearing: number) {
  for (const listener of bearingListeners) listener(bearing)
}

/** Follows the map's bearing (degrees clockwise from north): told it now, and each time the map turns.
 * Returns the function that stops it. */
export function followBearing(listener: (bearing: number) => void): () => void {
  bearingListeners.add(listener)
  listener(live?.map.getBearing() ?? 0)
  return () => bearingListeners.delete(listener)
}

let live: LiveMap | null = null

/** The truck's recent positions, kept from the first map onwards so the camera never starts cold. */
const samples: TruckSample[] = []
let collecting = false

function collectSamples() {
  if (collecting) return
  collecting = true
  const add = (telemetry: Telemetry) => {
    samples.push({
      time: performance.now(),
      x: telemetry.x,
      y: telemetry.y,
      z: telemetry.z,
      heading: telemetry.heading,
      speed: telemetry.speed,
    })
    if (samples.length > SAMPLES_KEPT) samples.shift()
  }
  // Where the truck is now: the host only sends telemetry when it changes, so a parked truck may send
  // nothing more for a long while.
  const current = useLive.getState().telemetry
  if (current) add(current)
  useLive.subscribe((state, previous) => {
    if (state.telemetry && state.telemetry !== previous.telemetry) add(state.telemetry)
  })
}

function create(data: MapData, appearance: Appearance): LiveMap {
  const element = document.createElement('div')
  element.className = 'road-map'
  const map = new maplibregl.Map({
    container: element,
    style: mapStyle(appearance, data),
    center: data.centre,
    zoom: 15,
    pitch: PITCH,
    maxPitch: 70,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    maxBounds: cameraBounds(data),
    // Gestures are switched on only where the map can be moved (setInteractive).
    interactive: false,
    // Turning (right-drag) keeps the tilt.
    pitchWithRotate: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { antialias: true },
  })

  // Added to the map when in range and clear of more important names (showLabels). Each says what
  // labelLines gives: the name in the player's language, under the place's own where that's in another
  // script.
  const measure = document.createElement('canvas').getContext('2d')
  const fontFamily = getComputedStyle(document.body).fontFamily
  const font = (size: number) => `600 ${size}px ${fontFamily}`
  const textWidth = (text: string, size: number) => {
    if (!measure) return text.length * size * 0.6
    measure.font = font(size)
    return measure.measureText(text).width
  }
  const lines = [...data.labels]
    .sort((a, b) => b.population - a.population)
    .map((label) => ({ label, ...labelLines(label.name, label.localized) }))
  const measured = ({ first, second }: { first: string; second: string | null }) => {
    const [size, secondSize] = [LABEL_SIZE * nameScale(), LABEL_SECOND_SIZE * nameScale()]
    return {
      width: Math.max(textWidth(first, size), second ? textWidth(second, secondSize) : 0) + LABEL_HALO * 2,
      height: (size + (second ? secondSize : 0)) * 1.2 + LABEL_HALO * 2,
    }
  }
  const labels = lines.map(({ label, first, second }) => {
    const element = document.createElement('div')
    element.className = `map-label map-label-${label.kind}`
    const line = (text: string, className: string) => {
      const span = document.createElement('span')
      span.className = className
      span.textContent = text
      element.append(span)
    }
    line(first, 'map-label-first')
    if (second) line(second, 'map-label-second')
    const marker = new maplibregl.Marker({ element, pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
    return { marker: marker.setLngLat(label.at), at: label.at, ...measured({ first, second }) }
  })
  // Measured again once the type for every name is in: the fonts for other scripts load only when a page
  // first needs them, and until then the sizes are a fallback font's.
  const allText = lines.map(({ first, second }) => `${first} ${second ?? ''}`).join(' ')
  Promise.all([document.fonts.load(font(LABEL_SIZE), allText), document.fonts.load(font(LABEL_SECOND_SIZE), allText)])
    .then(() => {
      lines.forEach((line, index) => Object.assign(labels[index], measured(line)))
      created.labelsPlacedFor = null
    })
    .catch(() => {})

  const puckElement = document.createElement('div')
  puckElement.className = 'map-puck'
  puckElement.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 18 19l-6-3.2L6 19Z" fill="currentColor"/></svg>'
  const puck = new maplibregl.Marker({ element: puckElement, pitchAlignment: 'viewport', rotationAlignment: 'map' })
  const destinationElement = document.createElement('div')
  destinationElement.className = 'map-destination'
  destinationElement.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 21V4.2c3.6-1.9 6.6 1.6 11 0v8.6c-4.4 1.6-7.4-1.9-11 0" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'

  const raised = data.raised ? raisedRoads(map, data.raised, () => created.painted) : null
  raised?.setShown(useCabin.getState().mapRoads)
  const showArrow = routeArrowLayer(map, () => created.painted)
  const meshes = data.meshes ? buildingMeshes(map, data.meshes, () => created.painted) : null
  meshes?.setShown(useCabin.getState().mapBuildings)
  const created: LiveMap = {
    data,
    map,
    element,
    raised,
    showArrow,
    meshes,
    puckHeight: 0,
    puck,
    destination: routeMarker(destinationElement),
    waypoints: new Map(),
    routeShown: null,
    progress: null,
    trafficLight: null,
    trafficSnap: null,
    canopies: { hidden: '', at: -Infinity },
    buildingsMode: null,
    labels,
    wanted: appearance,
    painted: appearance,
    garagesShown: null,
    playersShown: 0,
    playersDrawn: 0,
    viewTold: 0,
    ahead: null,
    aheadTold: 0,
    aheadShown: null,
    camera: null,
    mode: 'follow',
    interactive: false,
    pressed: false,
    touched: 0,
    overview: false,
    offeredPick: null,
    zoomOffset: 0,
    browsedFrom: 0,
    glide: null,
    northUp: false,
    flat: useMapFlat.getState().flat,
    labelsPlacedFor: null,
    kept: '',
    keptAt: 0,
  }
  // Place icons are drawn when the map first needs each (placeIcons.ts), and again once the type for their
  // names is in.
  map.on('styleimagemissing', ({ id }: { id: string }) => {
    const pixelRatio = window.devicePixelRatio || 1
    if (id === NO_ENTRY_ICON && !map.hasImage(id)) {
      map.addImage(id, drawNoEntry(pixelRatio), { pixelRatio })
      return
    }
    const icon = parsePlaceIcon(id)
    if (!icon || map.hasImage(id)) return
    map.addImage(id, drawPlaceIcon(icon.kind, icon.name, created.painted, pixelRatio, fontFamily, nameScale()), {
      pixelRatio,
    })
  })
  document.fonts.ready.then(() => redrawPlaceIcons(created)).catch(() => {})
  // The player's text size changed: once it has settled (a drag along the slider passes several), the names
  // measured again for where they fit, and the places' images let go of. Drawn anew at the new size only as the
  // tiles laid out again ask for them (styleimagemissing, above): the map keeps every place it has shown, and
  // drawing them all again (some 2 ms each) held the cab up for a second at each step.
  let resized: ReturnType<typeof setTimeout> | undefined
  stopTextSize?.()
  stopTextSize = useCabin.subscribe((state, before) => {
    if (state.mapBuildings !== before.mapBuildings) {
      showBuildings(map)
      meshes?.setShown(state.mapBuildings)
    }
    if (state.mapRoads !== before.mapRoads) raised?.setShown(state.mapRoads)
    if (state.textSize === before.textSize) return
    clearTimeout(resized)
    resized = setTimeout(() => {
      lines.forEach((line, index) => Object.assign(labels[index], measured(line)))
      created.labelsPlacedFor = null
      for (const id of map.listImages()) {
        if (parsePlaceIcon(id)?.name) map.removeImage(id)
      }
    }, TEXT_SIZE_SETTLE_MS)
  })
  map.once('style.load', () => showBuildings(map))
  listen(created)
  restoreView(created)
  return created
}

/** The map's buildings raised or flat, as the player has it (the companion's Map page). */
function showBuildings(map: maplibregl.Map) {
  if (!map.getLayer(BUILDING_LAYER) || !map.getLayer(BUILDING_FLAT_LAYER)) return
  const raised = useCabin.getState().mapBuildings
  map.setLayoutProperty(BUILDING_LAYER, 'visibility', raised ? 'visible' : 'none')
  map.setLayoutProperty(BUILDING_FLAT_LAYER, 'visibility', raised ? 'none' : 'visible')
}

/** How often the view is looked at to be kept, ms. */
const KEEP_EVERY_MS = 500

/** The view the player left the map in, kept from before (a hot reload, a reload, a restart): their
 * follow zoom, and where they'd browsed to (with the full while to look again before it glides back). */
function restoreView(target: LiveMap) {
  const saved = loadView()
  if (!saved) return
  target.zoomOffset = clampZoomOffset(saved.zoomOffset)
  if (saved.browse) {
    const { center, zoom, bearing, pitch, from } = saved.browse
    target.map.jumpTo({ center, zoom, bearing, pitch })
    browse(target)
    target.browsedFrom = from
  }
  target.kept = JSON.stringify(viewOf(target))
}

/** Keeps the view, now and then, when it has changed. */
function keepView(target: LiveMap, now: number) {
  if (now - target.keptAt < KEEP_EVERY_MS) return
  target.keptAt = now
  const view = JSON.stringify(viewOf(target))
  if (view === target.kept) return
  target.kept = view
  saveView(JSON.parse(view) as SavedView)
}

function viewOf({ map, mode, zoomOffset, browsedFrom }: LiveMap): SavedView {
  const browse =
    mode === 'browse'
      ? {
          center: map.getCenter().toArray() as [number, number],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
          from: browsedFrom,
        }
      : null
  return { zoomOffset, browse }
}

/** The player's hands on the map. */
function listen(target: LiveMap) {
  const { map } = target
  const canvas = map.getCanvasContainer()
  canvas.addEventListener('mousedown', () => {
    if (!target.interactive) return
    target.pressed = true
    target.touched = performance.now()
  })
  window.addEventListener('mouseup', () => {
    target.pressed = false
  })
  // Dragging or turning it leaves the truck behind.
  const leave = (event: { originalEvent?: unknown }) => {
    if (event.originalEvent && target.interactive) browse(target)
  }
  map.on('dragstart', leave)
  map.on('rotatestart', leave)
  // The compass (MapControls.tsx) turns with the map.
  map.on('rotate', () => tellBearing(map.getBearing()))
  // A route offered tapped (Directions): picked, as its row on the card is.
  map.on('click', (event) => {
    if (target.interactive && target.offeredPick) pickOffered(target, event.point, target.offeredPick)
  })
  map.on('move', (event) => {
    if (event.originalEvent) target.touched = performance.now()
  })
  // The wheel, while following: closer or further, still following. (Browsing, MapLibre zooms.)
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!target.interactive) return
      target.touched = performance.now()
      if (target.mode !== 'browse') {
        target.zoomOffset = clampZoomOffset(target.zoomOffset - (event.deltaY / 120) * WHEEL_ZOOM)
      }
    },
    { passive: true },
  )
}

function browse(target: LiveMap) {
  // Measured from here (a glide back cut short may have moved the zoom already: that's no choice).
  target.browsedFrom = target.map.getZoom()
  target.mode = 'browse'
  target.glide = null
  target.touched = performance.now()
  // Browsing, the wheel zooms around the cursor, like any desktop map.
  target.map.scrollZoom.enable()
  useMapBrowsing.setState({ browsing: true })
}

function follow(target: LiveMap) {
  target.mode = 'follow'
  target.glide = null
  target.map.scrollZoom.disable()
  // North up, the arrow stays: it brings the chase view back.
  useMapBrowsing.setState({ browsing: target.northUp })
}

/** Switches the gestures for the screen showing the map: the Maps app moves it, the Dashboard doesn't. */
function setInteractive(target: LiveMap, interactive: boolean) {
  target.interactive = interactive
  const { map } = target
  for (const handler of [map.dragPan, map.dragRotate]) {
    if (interactive) handler.enable()
    else handler.disable()
  }
  if (!interactive) {
    target.pressed = false
    follow(target)
    // Straight onto the truck.
    target.camera = null
  }
}

/**
 * Restyles the map to the wanted appearance, if it isn't already. Called every frame: until the style
 * itself has loaded, MapLibre refuses paint changes, and the next frame tries again. (Its "is the style
 * loaded" check also waits for every tile, which never settles while driving: a switch made then was lost.)
 */
function syncAppearance(target: LiveMap) {
  if (target.painted === target.wanted) return
  try {
    for (const { layer, property, value } of paintFor(target.wanted, Boolean(target.map.getSource(SURFACE_SOURCE)))) {
      target.map.setPaintProperty(layer, property, value)
    }
    target.painted = target.wanted
    // Names' colours follow the appearance.
    redrawPlaceIcons(target)
  } catch {
    // The style is still loading.
  }
}

/**
 * Shows the map's raised buildings, or puts the layer away in the performance mode (Settings › Display &
 * Performance): it's the map's heaviest drawing — every building in view, redrawn each frame. Like the
 * appearance and the garages, retried each frame until the style has loaded.
 */
function syncBuildings(target: LiveMap) {
  const mode = useCabin.getState().performanceMode
  if (target.buildingsMode === mode) return
  try {
    target.map.setLayoutProperty(BUILDING_LAYER, 'visibility', buildingsVisibility(mode))
    target.buildingsMode = mode
  } catch {
    // The style is still loading.
  }
}

/** Shows the player's own garages as theirs (the host reads them from their save), once they change.
 * Like the appearance, retried each frame until the style has loaded. */
function syncGarages(target: LiveMap) {
  const owned = useLive.getState().ownedGarages
  const key = owned.join(',')
  if (target.garagesShown === key) return
  try {
    for (const { layer, value } of placeImagesFor(owned)) target.map.setLayoutProperty(layer, 'icon-image', value)
    target.garagesShown = key
  } catch {
    // The style is still loading.
  }
}

/** How often (ms) the part of the map shown is told TruckersMP's reader, and the other players drawn. */
const VIEW_TOLD_EVERY = 500
const PLAYERS_DRAWN_EVERY = 33
/** How far behind the feed's clock (s) the further trucks are drawn: between places it has given, never
 * guessing ahead (guessing ahead went back and forth: owner 2026-10-21). Read every 3 s (truckersmp.ts), each
 * truck's newest place is up to 3 s older than the read, and the feed lags a second or two: 5 s keeps one
 * place ahead to slide to. */
const PLAYERS_BEHIND = 5
/** How far (m) round its centre the part of the map shown reaches at most (tilted, it sees to the horizon). */
const VIEW_REACH = 20000

/** The part of the map shown (the game's x and z), at most [`VIEW_REACH`] round its centre. */
function viewArea(map: maplibregl.Map): Area {
  const bounds = map.getBounds()
  const [x0, z0] = fromLngLat(bounds.getWest(), bounds.getNorth())
  const [x1, z1] = fromLngLat(bounds.getEast(), bounds.getSouth())
  const [cx, cz] = fromLngLat(map.getCenter().lng, map.getCenter().lat)
  return [
    Math.max(Math.min(x0, x1), cx - VIEW_REACH),
    Math.max(Math.min(z0, z1), cz - VIEW_REACH),
    Math.min(Math.max(x0, x1), cx + VIEW_REACH),
    Math.min(Math.max(z0, z1), cz + VIEW_REACH),
  ]
}

/** Draws TruckersMP's other players smoothly (owner 2026-10-21): those around the player where TruckersMP's
 * SDK has them now (the plugin's, as the game draws them); the rest each where it was [`PLAYERS_BEHIND`]
 * seconds ago on the feed's clock, between the places the feed gave it (truckersmp.ts). Tells the reader the
 * part of the map shown (none: nothing is read for it). */
function syncPlayers(target: LiveMap, now: number) {
  if (now - target.viewTold >= VIEW_TOLD_EVERY) {
    target.viewTold = now
    setMapView(hosts.length > 0 ? viewArea(target.map) : null)
  }
  const { tracks, clock } = useTruckersMp.getState()
  const around = useLive.getState().nearby?.players ?? []
  if (hosts.length === 0 || now - target.playersDrawn < PLAYERS_DRAWN_EVERY) return
  // None to draw, and none drawn: nothing to do.
  if (tracks.size === 0 && around.length === 0 && target.playersShown === 0) return
  const source = target.map.getSource<GeoJSONSource>(PLAYERS_SOURCE)
  // The style still loading: next frame.
  if (!source) return
  target.playersDrawn = now
  const point = (x: number, z: number) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Point' as const, coordinates: toLngLat(x, z) },
  })
  // Around the player, as the SDK has them; the feed's own place for them left out.
  const close = new Set(around.map(([id]) => id))
  const t = now / 1000 + (clock ?? 0) - PLAYERS_BEHIND
  const features = [
    ...around.map(([, x, z]) => point(x, z)),
    ...[...tracks].filter(([id]) => !close.has(id)).map(([, samples]) => point(...trackAt(samples, t))),
  ]
  target.playersShown = features.length
  source.setData({ type: 'FeatureCollection', features })
}

/** How far ahead along the route driven (m, the world's own: about 20 minutes' drive) its traffic is shown. */
const TRAFFIC_AHEAD = 25000
/** How often (ms) the route ahead is worked out again, for its traffic. */
const AHEAD_EVERY = 2000
/** How far off a raised road's height the truck can be and still be on it, m: less than a road under it is. */
const TRUCK_ON_SURFACE = 3
/** How quickly the puck goes up to and down from a raised road, ms. */
const PUCK_RISE_MS = 200

/** Under TruckersMP, driving a route: the traffic on the route ahead, over its blue line (owner 2026-10-21),
 * from the trucks along it (truckersmp.ts reads its corridor). While routes are offered, theirs is shown
 * instead (Destinations.tsx). */
function syncRouteTraffic(target: LiveMap, now: number) {
  if (target.overview) return
  const shown = target.routeShown
  const progress = target.progress
  if (!useLive.getState().truckersmp || !shown?.route || !progress) {
    if (target.ahead) {
      target.ahead = null
      target.aheadShown = null
      setRouteAhead(null)
      showTraffic([])
    }
    return
  }
  if (!target.ahead || now - target.aheadTold >= AHEAD_EVERY) {
    target.aheadTold = now
    target.ahead = routeAhead(shown.active, progress.span, TRAFFIC_AHEAD)
    target.aheadShown = null
    setRouteAhead(corridorOf(target.ahead))
  }
  const { aheadAlong } = useTruckersMp.getState()
  if (aheadAlong !== target.aheadShown) {
    target.aheadShown = aheadAlong
    showTraffic(trafficAlong(target.ahead, aheadAlong))
  }
}

/** Shows the traffic on the route previewed (traffic.ts: TruckersMP's), over it; none to clear it. */
export function showTraffic(stretches: readonly TrafficStretch[]) {
  const source = live?.map.getSource<GeoJSONSource>(TRAFFIC_SOURCE)
  if (!source) return
  source.setData({
    type: 'FeatureCollection',
    features: stretches
      .filter(({ line }) => line.length > 1)
      .map(({ line, level }) => ({
        type: 'Feature',
        properties: { level },
        geometry: { type: 'LineString', coordinates: line.map(([x, z]) => toLngLat(x, z)) },
      })),
  })
}

/** Draws the place icons the map has again, for its appearance (names' colours) and type. */
function redrawPlaceIcons({ map, painted }: LiveMap) {
  const pixelRatio = window.devicePixelRatio || 1
  const fontFamily = getComputedStyle(document.body).fontFamily
  for (const id of map.listImages()) {
    const icon = parsePlaceIcon(id)
    if (icon?.name) {
      map.updateImage(id, drawPlaceIcon(icon.kind, icon.name, painted, pixelRatio, fontFamily, nameScale()))
    }
  }
}

/** The screens showing the map, latest last: it's in the latest, and goes back when that one closes. */
const hosts: { element: HTMLElement; interactive: boolean }[] = []
let frame: number | null = null

/**
 * Shows the live map in `host` and follows the truck there (letting the player move it if `interactive`),
 * until the returned function is called (the map then stays alive, ready for the next screen).
 */
export function showLiveMap(
  host: HTMLElement,
  data: MapData,
  appearance: Appearance,
  interactive: boolean,
): () => void {
  collectSamples()
  if (live?.data !== data) {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    live?.map.remove()
    live = create(data, appearance)
    // Development: the map, for inspecting it from the browser's console.
    if (import.meta.env.DEV) Object.assign(window, { westplayMap: live.map, westplayRaised: live.raised, westplayMeshes: live.meshes })
  }
  live.wanted = appearance
  syncAppearance(live)
  const entry = { element: host, interactive }
  hosts.push(entry)
  place()
  return () => {
    hosts.splice(hosts.lastIndexOf(entry), 1)
    place()
  }
}

/** Puts the map in the latest screen showing it, following the truck while any does. */
function place() {
  if (!live) return
  const current = live
  const host = hosts.at(-1)
  if (!host) {
    current.element.remove()
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    return
  }
  if (current.element.parentElement !== host.element) {
    host.element.appendChild(current.element)
    current.map.resize()
    // Straight onto the truck, without easing in from wherever the camera was.
    current.camera = null
  }
  if (current.interactive !== host.interactive) setInteractive(current, host.interactive)
  if (frame === null) {
    let lastFrame = performance.now()
    const display = displayClock()
    frame = requestAnimationFrame(function step(now) {
      frame = requestAnimationFrame(step)
      // At most the screen's own refresh rate (frameCap.ts): the game is handed no more, and each
      // here redraws every 3D building in view (a player's log, 2026-10-27: the cab page's share up
      // in towns).
      const frameMs = display.tick(now)
      if (!mapFrameDue(now, lastFrame, frameMs)) return
      const dt = Math.min(now - lastFrame, 100)
      lastFrame = now
      syncAppearance(current)
      syncBuildings(current)
      syncGarages(current)
      syncPlayers(current, now)
      syncRouteTraffic(current, now)
      syncRoute(current, now)
      syncCanopies(current, now)
      syncTrafficLight(current)
      current.raised?.update(now)
      current.meshes?.update(now)
      updateCamera(current, now, dt)
      showLabels(current)
      keepView(current, now)
    })
  }
}

/** How near a tap (px) picks a route offered: a finger's width either side of its line. */
const OFFERED_TAP = 16
/** The layers the routes offered are drawn in (style.ts). */
const OFFERED_LAYERS = ['offered-picked', 'offered-picked-casing', 'offered', 'offered-casing']

/** Picks the route offered whose line is under `point`: where the one picked runs too (a road they share), it
 * stays picked. */
function pickOffered(target: LiveMap, point: { x: number; y: number }, pick: (index: number) => void) {
  const { map } = target
  const layers = OFFERED_LAYERS.filter((id) => map.getLayer(id))
  if (layers.length === 0) return
  const hits = map.queryRenderedFeatures(
    [
      [point.x - OFFERED_TAP, point.y - OFFERED_TAP],
      [point.x + OFFERED_TAP, point.y + OFFERED_TAP],
    ],
    { layers },
  )
  const indices = hits.map((hit) => hit.properties?.index).filter((index): index is number => typeof index === 'number')
  if (indices.length === 0 || hits.some((hit) => hit.properties?.picked === true)) return
  pick(indices[0])
}

/** How far the map's left edge is covered by the search panel (px, in the map's own units): the routes
 * offered are framed beside it. */
function panelCover(map: maplibregl.Map): number {
  const container = map.getContainer()
  const box = container.getBoundingClientRect()
  const panel = document.querySelector('.map-tile .map-search')?.getBoundingClientRect()
  if (!panel || box.width === 0) return 0
  // The screen may be scaled: the map's padding is in its own pixels.
  return Math.max(0, (panel.right - box.left) * (container.clientWidth / box.width))
}

/** Shows the routes offered before Go (`lines`, `[x, z]` metres each), `picked` in the route's blue over the
 * others, `onPick` called with a route's index as its line is tapped; none to clear them. */
export function showOfferedRoutes(lines: Point[][], picked: number | null, onPick?: (index: number) => void) {
  const source = live?.map.getSource<GeoJSONSource>(OFFERED_SOURCE)
  if (!live || !source) return
  live.offeredPick = lines.length > 0 ? (onPick ?? null) : null
  // Offered, the map shows them all, from above (as Apple Maps' Directions), in the part the search panel
  // leaves free; gone, it's back on the truck.
  if (lines.length > 0 && !live.overview) {
    browse(live)
    live.overview = true
    // (A loop: a long route has too many points to spread into Math.min.)
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const [x, z] of lines.flat()) {
      ;[x0, x1, z0, z1] = [Math.min(x0, x), Math.max(x1, x), Math.min(z0, z), Math.max(z1, z)]
    }
    if (x0 < x1 || z0 < z1) {
      const [lng0, lat0] = toLngLat(x0, z1)
      const [lng1, lat1] = toLngLat(x1, z0)
      live.map.fitBounds(
        [
          [lng0, lat0],
          [lng1, lat1],
        ],
        {
          padding: { top: 60, right: 60, bottom: 60, left: panelCover(live.map) + 40 },
          pitch: 0,
          bearing: 0,
          duration: 900,
        },
      )
    }
  } else if (lines.length === 0 && live.overview) {
    live.overview = false
    // Back on the truck at the zoom the player had before the routes were offered: zooming out to show them
    // all was the map's doing, not a zoom they chose (owner 2026-10-21).
    live.browsedFrom = live.map.getZoom()
    recentreLiveMap()
  }
  // The picked one last: drawn over the others where they share roads.
  const order = lines
    .map((line, index) => ({ line, index, picked: index === picked }))
    .sort((a, b) => +a.picked - +b.picked)
  source.setData({
    type: 'FeatureCollection',
    features: order
      .filter(({ line }) => line.length > 1)
      .map(({ line, index, picked }) => ({
        type: 'Feature',
        properties: { picked, index },
        geometry: { type: 'LineString', coordinates: line.map(([x, z]) => toLngLat(x, z)) },
      })),
  })
}

/** The route as the map draws it, and where the truck is along it this frame (`null`: no route, or the
 * truck not placed on it yet). */
export function liveRouteProgress(): { spans: Spans; progress: Progress } | null {
  const spans = live?.routeShown?.spans
  const progress = live?.progress
  return spans && spans.length > 0 && progress ? { spans, progress } : null
}

export function setLiveMapAppearance(appearance: Appearance) {
  if (!live) return
  live.wanted = appearance
  syncAppearance(live)
}

/** Glides the map back onto the truck, behind it (the arrow): from a map moved away, or from north up. */
export function recentreLiveMap() {
  if (!live || (live.mode !== 'browse' && !live.northUp)) return
  live.northUp = false
  glideToTruck(live)
  useMapBrowsing.setState({ browsing: false })
}

/** Turns the map north up and looks down from above, following the truck still (the compass tapped, as
 * CarPlay's Maps does); the arrow appears, and brings the chase view back (owner 2026-10-21). */
export function northUpLiveMap() {
  if (!live || live.northUp) return
  live.northUp = true
  glideToTruck(live)
  useMapBrowsing.setState({ browsing: true })
}

/**
 * Tilts the map flat (2D) or back behind the truck (3D): the Maps app's 2D/3D control, as Apple Maps has it at
 * its top right. The truck is followed either way; north up stays flat. A map moved away is tilted where it is.
 */
export function flatLiveMap(flat: boolean) {
  if (!live || live.flat === flat) return
  live.flat = flat
  useMapFlat.setState({ flat })
  if (live.mode === 'browse') {
    live.map.easeTo({ pitch: followPitch(live.northUp, flat), duration: GLIDE_MS })
  } else {
    glideToTruck(live)
  }
}

/** Glides from where the map is to the following camera ([`updateCamera`]): behind the truck, or north up. */
function glideToTruck(target: LiveMap) {
  const { map } = target
  // A zoom the player chose while browsing (the wheel, the buttons) stays: the camera follows at it.
  if (target.mode === 'browse' && Math.abs(map.getZoom() - target.browsedFrom) > 0.01) {
    const speed = truckAt(samples, performance.now() - FOLLOW_DELAY_MS)?.speed ?? 0
    target.zoomOffset = zoomOffsetFor(map.getZoom(), speed, useCabin.getState().zoomWithSpeed)
  }
  target.glide = {
    from: {
      center: map.getCenter().toArray() as [number, number],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    },
    fromTop: map.getPadding().top ?? 0,
    started: performance.now(),
  }
  target.mode = 'return'
  map.scrollZoom.disable()
}

/** Zooms in (1) or out (-1) a step: the following camera closer or further, or the browsed map. */
export function zoomLiveMap(direction: 1 | -1) {
  if (!live) return
  live.touched = performance.now()
  // Browsing, or with no truck to follow (none yet: the camera only follows one), the map itself zooms.
  const following = truckAt(samples, performance.now() - FOLLOW_DELAY_MS) !== null
  if (live.mode === 'browse' || !following) {
    live.map.easeTo({ zoom: live.map.getZoom() + direction, duration: 300 })
  } else {
    live.zoomOffset = clampZoomOffset(live.zoomOffset + direction)
  }
}

/**
 * Shows the place names that fit: only places near enough to matter at this zoom (the tilted view reaches
 * to the horizon, where everything far away would pile up, and the game's distances between cities are
 * short), and of those, none overlapping a more important one.
 */
function showLabels(target: LiveMap) {
  const { map, labels } = target
  const centre = map.getCenter().toArray() as [number, number]
  const { clientWidth: width, clientHeight: height } = map.getContainer()
  // Only when the view has changed: placing them projects every name.
  const view = `${centre} ${map.getZoom()} ${map.getBearing()} ${map.getPitch()} ${width}x${height}`
  if (view === target.labelsPlacedFor) return
  target.labelsPlacedFor = view
  const range = labelRange(map.getZoom(), width)
  const boxes = labels.map((label) => {
    if (metresBetween(centre, label.at) > range) return null
    const { x, y } = map.project(label.at)
    if (x < -label.width || x > width + label.width || y < -label.height || y > height + label.height) return null
    return { x, y, width: label.width, height: label.height }
  })
  const shown = placeLabels(boxes, LABEL_GAP)
  labels.forEach(({ marker }, index) => {
    const visible = marker.getElement().isConnected
    if (shown.has(index) && !visible) marker.addTo(map)
    else if (!shown.has(index) && visible) marker.remove()
  })
}

/** A unit direction on the ground (x east, z south) for a compass bearing (degrees). */
function along(bearing: number): Point {
  const radians = (bearing * Math.PI) / 180
  return [Math.sin(radians), -Math.cos(radians)]
}

/** A route source's data. */
type LineData = Parameters<GeoJSONSource['setData']>[0]

const NO_LINE: LineData = { type: 'FeatureCollection', features: [] }

/** The route line, in its stretches `lines`. */
function linesOf(lines: Point[][]): LineData {
  if (lines.length === 0) return NO_LINE
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiLineString', coordinates: lines.map((line) => line.map(([x, z]) => toLngLat(x, z))) },
  }
}

/** How often the canopies over the truck are looked for, ms. */
const CANOPIES_EVERY_MS = 400

/**
 * Leaves the canopies the truck is under out of the raised buildings, and every other one in (owner
 * 2026-10-22: a filling station's or a border crossing's roof would cover the truck). From the tiles loaded;
 * the layer's filter changed only when they change.
 */
/**
 * The next light's mark on the map: a lit dot and its countdown, while the host reads one from the game. No
 * light near, or the setting off: no mark (owner 2026-11-01).
 */
function syncTrafficLight(target: LiveMap) {
  const { routeNext, trafficLight: light } = useLive.getState()
  const wanted = useCabin.getState().trafficLights ? light : null
  if (!wanted) {
    target.trafficLight?.marker.remove()
    target.trafficLight = null
    target.trafficSnap = null
    return
  }
  // On the line the map draws, not at the light's pole beside it: the drawn spans follow the road's curves
  // and the junction ways, where the straight node-to-node line can cut a corner.
  const key = `${wanted.x.toFixed(1)}:${wanted.z.toFixed(1)}`
  const spans = target.routeShown?.spans ?? null
  if (!target.trafficSnap || target.trafficSnap.key !== key || target.trafficSnap.route !== spans) {
    const span = target.progress?.span ?? routeNext
    const onSpans = spans ? routePointOnSpans(spans, wanted.x, wanted.z, span) : null
    target.trafficSnap = { key, route: spans, point: onSpans ?? [wanted.x, wanted.z] }
  }
  const [x, z] = target.trafficSnap.point
  if (!target.trafficLight) {
    const element = document.createElement('div')
    element.className = 'map-traffic-light'
    // A light at the junction, its colour lit and the countdown beside it, as a map app draws it.
    const marker = new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -4] })
      .setLngLat(toLngLat(x, z))
      .addTo(target.map)
    target.trafficLight = { marker, element, shown: '' }
  }
  const mark = target.trafficLight
  mark.marker.setLngLat(toLngLat(x, z))
  const seconds = Math.max(0, Math.ceil(wanted.seconds))
  const shown = `${wanted.state}:${seconds}`
  if (shown === mark.shown) return
  mark.shown = shown
  mark.element.className = `map-traffic-light ${wanted.state}`
  mark.element.innerHTML =
    `<span class="mtl-badge">${seconds}</span>` +
    `<span class="mtl-housing">` +
    `<i class="mtl-lamp red"></i><i class="mtl-lamp amber"></i><i class="mtl-lamp green"></i>` +
    `</span>`
  mark.element.title = `${wanted.state} ${seconds}s`
}

/**
 * The drawn route's point nearest a light (`null`: none within 25 m): the line's own spans, curves and
 * junction ways included, so the marker sits on the blue line through the junction. Only the spans just
 * ahead of the truck are looked at: a later part of a long route can pass the same place, and that isn't
 * this light's junction.
 */
function routePointOnSpans(spans: readonly Point[][], x: number, z: number, next: number): Point | null {
  let best: Point | null = null
  let bestDistance = 25
  const from = Math.max(0, next - 1)
  const to = Math.min(spans.length, next + 4)
  for (let spanIndex = from; spanIndex < to; spanIndex++) {
    const span = spans[spanIndex]
    for (let index = 0; index + 1 < span.length; index++) {
      const [ax, az] = span[index]
      const [bx, bz] = span[index + 1]
      const dx = bx - ax
      const dz = bz - az
      const length = dx * dx + dz * dz
      const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length))
      const px = ax + dx * along
      const pz = az + dz * along
      const distance = Math.hypot(px - x, pz - z)
      if (distance < bestDistance) {
        bestDistance = distance
        best = [px, pz]
      }
    }
  }
  return best
}

function syncCanopies(target: LiveMap, now: number) {
  const { canopies, map } = target
  if (now - canopies.at < CANOPIES_EVERY_MS || !map.getLayer(BUILDING_LAYER)) return
  canopies.at = now
  const truck = samples.at(-1)
  if (!truck) return
  const found = map.querySourceFeatures(MAP_SOURCE, {
    sourceLayer: 'building',
    filter: ['==', ['get', 'kind'], 'canopy'],
  })
  const shapes: Canopy[] = found.flatMap((feature) => {
    const id = feature.properties?.id
    const geometry = feature.geometry
    if (typeof id !== 'number') return []
    if (geometry.type === 'Polygon') return [{ id, rings: geometry.coordinates as [number, number][][] }]
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.map((rings: number[][][]) => ({ id, rings: rings as [number, number][][] }))
    }
    return []
  })
  const hidden = canopiesOver(shapes, toLngLat(truck.x, truck.z))
  const key = hidden.join(',')
  if (key === canopies.hidden) return
  canopies.hidden = key
  map.setFilter(BUILDING_LAYER, buildingFilter(hidden))
}

/**
 * Draws the game's GPS route (route.ts) as it changes, and the part ahead of the truck as it moves: the
 * rest of the route only when the truck reaches its next span, the head (to the end of the truck's span)
 * every half metre, so a parked truck leaves the map idle. Until the style has loaded, its sources aren't
 * there, and the next frame tries again.
 */
function syncRoute(target: LiveMap, now: number) {
  const { map } = target
  const rest = map.getSource<GeoJSONSource>(ROUTE_SOURCE)
  const head = map.getSource<GeoJSONSource>(ROUTE_HEAD_SOURCE)
  const future = map.getSource<GeoJSONSource>(ROUTE_FUTURE_SOURCE)
  target.progress = null
  if (!rest || !head || !future) return
  const { route, routeNext } = useLive.getState()
  const previous = target.routeShown
  const shown = prepareShownRoute(target, route)
  const newRoute = shown !== previous
  let redrawFuture = newRoute
  // The raised roads the route is on come and go with the tiles round the view.
  if (route && target.raised && shown.heightsFor !== target.raised.tilesChanged()) {
    shown.heightsFor = target.raised.tilesChanged()
    shown.heights = routeHeights(shown.spans, route.heights, target.raised.surfaceAt)
    shown.restAfter = null
    shown.headFrom = null
    redrawFuture = true
  }
  // The line after the next stop stays put while the driver is on the current leg.
  if (redrawFuture) {
    const { flat, raised } = cutRaised(restLine(shown.future, -1), (point) => shown.heights.get(point) ?? 0)
    future.setData(linesOf(flat))
    shown.futureRaised = raised
  }
  const truck = truckAt(samples, now - FOLLOW_DELAY_MS)
  // The way the truck faces, on the ground (x east, z south), from its compass bearing.
  const facing = truck && along(bearingOf(truck.heading))
  // A return span can lie on the same road. Project only onto spans of the current leg.
  const found = truck ? progressOf(shown.active, routeNext, [truck.x, truck.z], facing ?? undefined) : null
  const approach = found && truck && facing ? approachLine(shown.active, found, [truck.x, truck.z], facing) : null
  target.progress = found && truck && approach ? { ...found, at: [truck.x, truck.z], distance: 0 } : found
  const onRoute = found && found.distance <= ROUTE_ARROW_MAX_OFFSET ? found : null
  // A route may arrive before a reliable truck position. Draw from the game's next span then, so
  // its first arrow has the bright line under it from the start.
  const startSpan = Math.max(0, routeNext - 1)
  const start = shown.active[startSpan]?.[0]
  const progress = (approach ? target.progress : onRoute) ?? (start && { span: startSpan, index: 0, at: start, distance: 0 })
  if (!progress && newRoute) {
    rest.setData(NO_LINE)
    head.setData(NO_LINE)
  }
  const redrawActive = progress ? syncActiveRoute(shown, rest, head, progress, approach) : false
  if (redrawActive || redrawFuture) {
    target.raised?.showRoute([...shown.headRaised, ...shown.restRaised], shown.futureRaised)
  }
  const arrowSpan = routeArrowSpan(shown.active, routeNext, onRoute)
  if (target.overview || !route) {
    shown.arrowSpan = null
    target.showArrow(null)
  } else if (redrawActive || redrawFuture || shown.arrowSpan !== arrowSpan) {
    shown.arrowSpan = arrowSpan
    target.showArrow(nextRouteArrow(shown.active, route.maneuvers, routeNext, onRoute, shown.heights))
  }
}

type ShownRoute = NonNullable<LiveMap['routeShown']>

/** Builds the route spans and positions the markers when the route or junction paths change. */
function prepareShownRoute(target: LiveMap, route: LiveState['route']): ShownRoute {
  if (target.routeShown?.route === route) return target.routeShown
  const spans = route ? routeSpans(route.nodes, route.paths, route.shifts) : []
  const activeEnd = route?.activeEnd
  // Hosts that only send a split point can still show their next stop.
  const stops = route?.coachStops ?? (activeEnd == null ? [] : [activeEnd])
  const terminal = spans.length
  const parking = new Map<number, { position: Point; cut: Progress | null }>()
  for (const [node, { position, span }] of route?.coachAnchors ?? []) {
    if ((node !== terminal && !stops.includes(node)) || !position.every(Number.isFinite)) continue
    const cut = span === null ? null : coachStopOnSpan(spans, span, position)
    if (span === null || cut) parking.set(node, { position, cut })
  }
  const cut = parking.get(stops[0] ?? terminal)?.cut
  const sections = cut ? splitRouteAt(spans, cut) : { spans, ...splitRoute(spans, stops[0]) }
  const shown: ShownRoute = {
    route,
    ...sections,
    restAfter: null,
    headFrom: null,
    arrowSpan: null,
    heights: new Map(),
    heightsFor: null,
    restRaised: [],
    headRaised: [],
    futureRaised: [],
  }
  target.routeShown = shown
  placeRouteMarker(target.map, target.destination, parking.get(terminal)?.position ?? route?.nodes.at(-1)?.position)
  syncWaypointMarkers(target, spans, stops, parking)
  return shown
}

function routeMarker(element: HTMLDivElement): maplibregl.Marker {
  return new maplibregl.Marker({ element, pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
}

function coachWaypointMarker(): maplibregl.Marker {
  const element = document.createElement('div')
  element.className = 'map-waypoint'
  element.setAttribute('aria-hidden', 'true')
  return routeMarker(element)
}

function syncWaypointMarkers(
  target: LiveMap,
  spans: Spans,
  stops: readonly number[],
  parking: ReadonlyMap<number, { position: Point }>,
) {
  const markers: LiveMap['waypoints'] = new Map()
  for (const stop of new Set(stops)) {
    if (!Number.isInteger(stop) || stop < 0 || stop >= spans.length) continue
    // At a turnaround, use the arrival lane. A pending stop can also be at the first route node.
    const point = parking.get(stop)?.position ?? spans[stop - 1]?.at(-1) ?? spans[stop][0]
    if (!point) continue
    const marker = target.waypoints.get(stop)?.marker ?? coachWaypointMarker()
    placeRouteMarker(target.map, marker, point)
    markers.set(stop, { marker, point })
  }
  for (const [stop, { marker }] of target.waypoints) {
    if (!markers.has(stop)) marker.remove()
  }
  target.waypoints = markers
}

function placeRouteMarker(map: maplibregl.Map, marker: maplibregl.Marker, point: Point | undefined) {
  if (!point) {
    marker.remove()
    return
  }
  marker.setLngLat(toLngLat(...point))
  if (!marker.getElement().isConnected) marker.addTo(map)
}

/** Updates the bright route through the next stop, returning whether its raised lines changed. */
function syncActiveRoute(
  shown: ShownRoute,
  rest: GeoJSONSource,
  head: GeoJSONSource,
  progress: Progress,
  approach: Point[] | null,
): boolean {
  const { active, heights } = shown
  if (progress.span !== shown.restAfter) {
    const { flat, raised } = cutRaised(restLine(active, progress.span), (point) => heights.get(point) ?? 0)
    rest.setData(linesOf(flat))
    shown.restRaised = raised
    shown.restAfter = progress.span
    shown.headFrom = null
  }
  const moved = shown.headFrom
    ? Math.hypot(progress.at[0] - shown.headFrom[0], progress.at[1] - shown.headFrom[1])
    : Infinity
  if (moved < ROUTE_HEAD_STEP) return false
  const line = approach ? [...approach, ...active[0].slice(1)] : headLine(active, progress)
  const atHeight = heightOnSpan(active[progress.span], progress, heights)
  const { flat, raised } = cutRaised(line, (point) => (point === progress.at ? atHeight : (heights.get(point) ?? 0)))
  head.setData(linesOf(flat))
  shown.headRaised = raised
  shown.headFrom = progress.at
  return true
}

function updateCamera(target: LiveMap, now: number, dt: number) {
  const truck = truckAt(samples, now - FOLLOW_DELAY_MS)
  const { map, puck } = target
  if (!truck) return

  // The puck goes with the truck whatever the camera does: on the route, in the middle of its road.
  const shown: Point = target.progress ? snapToRoute(target.progress, [truck.x, truck.z]) : [truck.x, truck.z]
  const position = toLngLat(...shown)
  const bearing = bearingOf(truck.heading)
  puck.setLngLat(position).setRotation(bearing)
  if (target.raised) {
    // On a raised road, up there with it. Eased: a point off a road's edge isn't a drop.
    const surface = target.raised.surfaceAt(shown[0], shown[1], truck.y, TRUCK_ON_SURFACE)
    target.puckHeight += ((surface?.drawn ?? 0) - target.puckHeight) * Math.min(dt / PUCK_RISE_MS, 1)
    puck.setOffset(target.raised.screenLift(shown[0], shown[1], target.puckHeight))
    // Route markers sit at the height of the road at each stop.
    const route = target.routeShown
    const end = route?.spans.at(-1)?.at(-1)
    if (end) target.destination.setOffset(target.raised.screenLift(...end, route?.heights.get(end) ?? 0))
    for (const { marker, point } of target.waypoints.values()) {
      const [x, y] = target.raised.screenLift(...point, route?.heights.get(point) ?? 0)
      const offset = marker.getOffset()
      if (offset.x !== x || offset.y !== y) marker.setOffset([x, y])
    }
  }
  if (!puck.getElement().isConnected) puck.addTo(map)

  if (target.mode === 'browse') {
    if (!target.pressed && !target.overview && now - target.touched > AUTO_RECENTRE_MS) recentreLiveMap()
    return
  }

  // Close in town and further out on the motorway, so the road ahead keeps the same time — or one view for every
  // speed, where the player turned that off (Settings › Maps): either way, the player's own zoom on top of it.
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, followZoom(truck.speed, target.zoomOffset, useCabin.getState().zoomWithSpeed)),
  )
  const height = map.getContainer().clientHeight
  // Behind the truck: facing its way, tilted, the truck low on the screen. North up: from above, the truck in
  // the middle.
  const pitch = followPitch(target.northUp, target.flat)
  const wanted = target.northUp
    ? { bearing: 0, pitch, top: 0 }
    : { bearing, pitch, top: height * (PUCK_FROM_TOP - 0.5) * 2 }
  const padding = { top: wanted.top, bottom: 0, left: 0, right: 0 }

  if (target.mode === 'return' && target.glide) {
    // Towards where the following camera is now (the truck moves on while it glides).
    const t = (now - target.glide.started) / GLIDE_MS
    const eased = easeInOut(t)
    const towards = { center: position, zoom, bearing: wanted.bearing, pitch: wanted.pitch }
    const top = target.glide.fromTop + (wanted.top - target.glide.fromTop) * eased
    moveCamera(map, blendPose(target.glide.from, towards, eased), { ...padding, top })
    if (t >= 1) {
      follow(target)
      target.camera = { bearing: wanted.bearing, zoom }
    }
    return
  }

  target.camera = target.camera
    ? {
        bearing: dampBearing(target.camera.bearing, wanted.bearing, dt, BEARING_TAU_MS),
        zoom: damp(target.camera.zoom, zoom, dt, ZOOM_TAU_MS),
      }
    : { bearing: wanted.bearing, zoom }
  // Held still while a button is down, so a drag can start (moving the camera cancels it).
  if (target.pressed) return
  const pose = { center: position, bearing: target.camera.bearing, zoom: target.camera.zoom, pitch: wanted.pitch }
  moveCamera(map, pose, padding)
}

/**
 * Moves the map to `pose`, unless it's there already: every move draws the whole map again, so a parked
 * truck (and a camera that has settled) leaves the map, and the GPU the game shares, idle.
 */
function moveCamera(
  map: maplibregl.Map,
  pose: CameraPose,
  padding: { top: number; bottom: number; left: number; right: number },
) {
  const current = {
    center: map.getCenter().toArray() as [number, number],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }
  if (samePose(current, pose) && Math.abs((map.getPadding().top ?? 0) - padding.top) < 0.01) return
  map.jumpTo({ ...pose, padding })
}

// Development: when this module is replaced (Vite hot reload), the old map goes with it, so a new one
// doesn't land on top.
import.meta.hot?.dispose(() => {
  if (frame !== null) cancelAnimationFrame(frame)
  stopTextSize?.()
  live?.element.remove()
  live?.map.remove()
})
