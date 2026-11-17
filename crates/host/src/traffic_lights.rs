//! The traffic lights ahead, read from the running game's memory: the semaphore instances of the prefabs
//! around the truck (the same structures ETS2LA's plugin documents), their state and how long it lasts.
//!
//! The game's SDK has no traffic light channel, and the map data only says where the lights are. The state
//! and countdown are runtime AI data, so they are read the way ETS2LA reads them: find the game's prefab
//! list (`base_ctrl`'s nearby K-DOP items) by its code pattern, walk each prefab's semaphore instances, and
//! read the `traffic_light` state and its remaining time. Read-only, from a thread of its own; the game is
//! never written to and a failed read only means no light this time.
//!
//! The structures are the ones documented for game 1.60 and match this install's 1.61 executable (the code
//! patterns and the live probe both do). A game update can move them: then no light is shown and the log
//! says the pattern wasn't found, rather than guessing at memory.

use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, MODULEENTRY32W, Module32FirstW, Module32NextW, PROCESSENTRY32W, Process32FirstW,
    Process32NextW, TH32CS_SNAPMODULE, TH32CS_SNAPMODULE32, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Memory::{
    MEM_COMMIT, MEMORY_BASIC_INFORMATION, PAGE_GUARD, PAGE_NOACCESS, VirtualQueryEx,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};

/// A traffic light's state, as the game's `traffic_light_t.state` says it (the bits ETS2LA documents).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LightState {
    Red,
    Amber,
    Green,
    /// Blinking amber (a sleeping light at a quiet crossing).
    Sleep,
}

/// One traffic light ahead: its state, how many seconds the state lasts, how far it is and where it is on
/// the game's ground (x east, z south, metres).
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Light {
    pub state: LightState,
    pub seconds: f32,
    pub distance: f32,
    pub x: f32,
    pub z: f32,
}

/// Where the truck is, as the game's telemetry says: metres (x east, z south) and heading (0..1, the game's
/// counter-clockwise from north).
#[derive(Clone, Copy)]
struct Pose {
    x: f32,
    z: f32,
    heading: f32,
}

/// The route the game's GPS has, as its nodes' places and the one ahead: a light counts only if it stands
/// by this road (its pole is a lane or two off the line the map draws).
#[derive(Clone, Default)]
struct RouteAhead {
    nodes: Vec<[f32; 2]>,
    next: usize,
}

/// Which way the route turns at the junction the truck is coming to: an American junction has a head of its own
/// for a left turn, with its own phases.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Turn {
    Left,
    Straight,
    Right,
}

/// How far ahead of the truck the route is looked at for its turn, metres.
const TURN_REACH: f32 = 90.0;

/// How far the route must swing from straight ahead to count as a turn, degrees.
const TURN_DEGREES: f32 = 28.0;

impl RouteAhead {
    /// The way the route turns where it goes next, from where the truck is: the heading it comes in on against
    /// the heading it leaves by, over the nodes within [`TURN_REACH`].
    fn turn(&self, pose: Pose) -> Option<Turn> {
        if self.nodes.len() < 2 {
            return None;
        }
        let from = self.next.min(self.nodes.len() - 1);
        let mut points: Vec<[f32; 2]> = vec![[pose.x, pose.z]];
        let mut travelled = 0.0;
        for pair in self.nodes[from..].windows(2) {
            points.push(pair[0]);
            travelled += (pair[1][0] - pair[0][0]).hypot(pair[1][1] - pair[0][1]);
            if travelled >= TURN_REACH {
                points.push(pair[1]);
                break;
            }
        }
        if points.len() < 3 {
            return None;
        }
        let heading = |a: [f32; 2], b: [f32; 2]| (b[0] - a[0]).atan2(-(b[1] - a[1]));
        let in_heading = heading(points[0], points[1]);
        let out_heading = heading(points[points.len() - 2], points[points.len() - 1]);
        let mut swing = (out_heading - in_heading).to_degrees();
        while swing > 180.0 {
            swing -= 360.0;
        }
        while swing < -180.0 {
            swing += 360.0;
        }
        // `heading` is `atan2(dx, -dz)`, the world's x east and z south: a turn to the left swings it negative
        // (measured: driving north, then west, swings -90 degrees).
        if swing.abs() < TURN_DEGREES {
            Some(Turn::Straight)
        } else if swing < 0.0 {
            Some(Turn::Left)
        } else {
            Some(Turn::Right)
        }
    }
}

/// The lights ahead, read in the background: the main loop says where the truck is, and takes what was last
/// read.
pub struct TrafficLights {
    pose: Arc<Mutex<Option<Pose>>>,
    route: Arc<Mutex<RouteAhead>>,
    latest: Arc<Mutex<Option<Light>>>,
    enabled: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
}

impl TrafficLights {
    pub fn new() -> Self {
        let pose = Arc::new(Mutex::new(None));
        let route = Arc::new(Mutex::new(RouteAhead::default()));
        let latest = Arc::new(Mutex::new(None));
        let enabled = Arc::new(AtomicBool::new(true));
        let stop = Arc::new(AtomicBool::new(false));
        let worker = Worker {
            pose: pose.clone(),
            route: route.clone(),
            latest: latest.clone(),
            enabled: enabled.clone(),
            stop: stop.clone(),
        };
        std::thread::Builder::new()
            .name("traffic-lights".into())
            .spawn(move || worker.run())
            .ok();
        Self { pose, route, latest, enabled, stop }
    }

    /// Shown in Settings: off, the worker closes its handle on the game and stops reading it (no scanning,
    /// no walking the prefabs) until it is on again.
    pub fn set_enabled(&self, on: bool) {
        self.enabled.store(on, Ordering::Release);
        if !on {
            self.publish(None);
        }
    }

    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Acquire)
    }

    fn publish(&self, light: Option<Light>) {
        if let Ok(mut latest) = self.latest.lock() {
            *latest = light;
        }
    }

    /// The route's node places, as the game's GPS has them (a new route: its first node ahead).
    pub fn set_route(&self, nodes: Vec<[f32; 2]>) {
        if let Ok(mut route) = self.route.lock() {
            route.nodes = nodes;
            route.next = 0;
        }
    }

    /// The node the truck is heading for, as the game's route progress says.
    pub fn set_route_next(&self, next: usize) {
        if let Ok(mut route) = self.route.lock() {
            route.next = next;
        }
    }

    pub fn clear_route(&self) {
        if let Ok(mut route) = self.route.lock() {
            route.nodes.clear();
            route.next = 0;
        }
    }

    /// The truck's place and heading, as the telemetry has them.
    pub fn set_pose(&self, x: f32, z: f32, heading: f32) {
        if !self.enabled() {
            return;
        }
        if let Ok(mut pose) = self.pose.lock() {
            *pose = Some(Pose { x, z, heading });
        }
    }

    /// No truck (the game isn't driving): nothing to look ahead from.
    pub fn clear_pose(&self) {
        if let Ok(mut pose) = self.pose.lock() {
            *pose = None;
        }
    }

    /// What was last read ahead (`None`: none, the game isn't there, or the display is off).
    pub fn latest(&self) -> Option<Light> {
        if !self.enabled() {
            return None;
        }
        self.latest.lock().ok().and_then(|light| light.clone())
    }
}

impl Default for TrafficLights {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for TrafficLights {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
    }
}

struct Worker {
    pose: Arc<Mutex<Option<Pose>>>,
    route: Arc<Mutex<RouteAhead>>,
    latest: Arc<Mutex<Option<Light>>>,
    enabled: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
}

impl Worker {
    fn run(&self) {
        let mut game: Option<Game> = None;
        let mut last_failure = String::new();
        // The light shown a moment ago, if any: `choose` keeps it rather than jumping between heads.
        let mut previous: Option<(f32, f32)> = None;
        loop {
            if self.stop.load(Ordering::Acquire) {
                return;
            }
            if !self.enabled.load(Ordering::Acquire) {
                // Off: the game's handle is closed and nothing is read until it is on again.
                game = None;
                self.publish(None);
                std::thread::sleep(Duration::from_millis(250));
                continue;
            }
            let pose = self.pose.lock().ok().and_then(|pose| *pose);
            let Some(pose) = pose else {
                self.publish(None);
                std::thread::sleep(Duration::from_millis(250));
                continue;
            };
            if game.as_ref().is_some_and(|game| !game.alive()) {
                crate::log!("traffic lights: the game exited");
                game = None;
            }
            if game.is_none() {
                match Game::open() {
                    Ok(open) => {
                        crate::log!("traffic lights: reading the game's semaphores");
                        game = Some(open);
                    }
                    Err(error) => {
                        if error != last_failure {
                            crate::log!("traffic lights: {error}");
                            last_failure = error;
                        }
                        self.publish(None);
                        std::thread::sleep(Duration::from_secs(2));
                        continue;
                    }
                }
            }
            let light = game.as_ref().and_then(|game| {
                let route = self.route.lock().ok().map(|route| route.clone());
                game.light_ahead(pose, route.as_ref(), previous)
            });
            // The light shown next tick: a junction's heads are a few metres apart, and the one already chosen
            // stays chosen while it is still ahead (choose()).
            previous = light.as_ref().map(|light| (light.x, light.z));
            self.publish(light);
            std::thread::sleep(Duration::from_millis(150));
        }
    }

    fn publish(&self, light: Option<Light>) {
        if let Ok(mut latest) = self.latest.lock() {
            *latest = light;
        }
    }
}

/// `{"type":"trafficLight","light":{…}}`: the next light ahead for the cabin's guidance (`null`: none).
pub fn message(light: Option<&Light>) -> String {
    serde_json::json!({ "type": "trafficLight", "light": light }).to_string()
}

/// The game's process and the addresses of the things read from it.
struct Game {
    process: HANDLE,
    pid: u32,
    /// Where the `base_ctrl` pointer itself is (the rip-relative operand's address).
    base_ctrl_ptr: usize,
    /// The offset of the nearby K-DOP items array in `base_ctrl`.
    kdop_offset: usize,
}

impl Game {
    fn open() -> Result<Self, String> {
        let (pid, name) = find_process().ok_or("the game isn't running")?;
        let (base, size) = module_of(pid, &name).ok_or("the game's module isn't found")?;
        // SAFETY: a read-only handle to the game's process; it is closed with `Drop`.
        let process = unsafe { OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid) }
            .map_err(|error| format!("the game's memory can't be opened: {error}"))?;
        let mut game = Self { process, pid, base_ctrl_ptr: 0, kdop_offset: 0 };
        // SAFETY: the module's committed pages are read (never written); the pattern searches are plain
        // byte comparisons.
        unsafe {
            let base_match = game.scan(BASE_CTRL).ok_or("the game's base_ctrl pattern isn't found")?;
            let kdop_match = game.scan(NEARBY_KDOP).ok_or("the game's nearby-items pattern isn't found")?;
            game.base_ctrl_ptr = game
                .rip_target(base_match, 3)
                .ok_or("the game's base_ctrl pointer isn't readable")?;
            game.kdop_offset = game.u32(kdop_match + 3).ok_or("the game's nearby-items offset isn't readable")? as usize;
        }
        if game.kdop_offset == 0 || game.kdop_offset > 0x10000 {
            return Err("the game's nearby-items offset doesn't look right".into());
        }
        crate::log!("traffic lights: game {} (pid {pid}), nearby items at +{:#x}", name, game.kdop_offset);
        let _ = (base, size);
        Ok(game)
    }

    fn alive(&self) -> bool {
        // A zero exit code with STILL_ACTIVE: the process is still running.
        let mut code = 0u32;
        // SAFETY: a plain query of the handle made in `open`.
        let ok = unsafe { windows::Win32::System::Threading::GetExitCodeProcess(self.process, &mut code) }.is_ok();
        ok && code == 259
    }

    /// The lights that passed the filters near `pose`, within a junction's reach and standing by the road the
    /// route runs on; `choose` picks one of them.
    fn light_ahead(&self, pose: Pose, route: Option<&RouteAhead>, previous: Option<(f32, f32)>) -> Option<Light> {
        // Which way the route turns at the junction being come to: a left turn has heads of its own.
        let turn = route.and_then(|route| route.turn(pose));
        let base_ctrl = self.u64(self.base_ctrl_ptr)? as usize;
        if base_ctrl == 0 {
            return None;
        }
        let array = base_ctrl + self.kdop_offset;
        let values = self.u64(array + 8)? as usize;
        let count = self.u64(array + 0x10)? as usize;
        if values == 0 || count == 0 || count > 20_000 {
            return None;
        }
        let mut pointers = vec![0u8; count * 8];
        if !self.read(values, &mut pointers) {
            return None;
        }
        let bearing = ((1.0 - pose.heading) * 360.0).to_radians();
        let (forward_x, forward_z) = (bearing.sin(), -bearing.cos());
        // Its right, as the road is driven on here (right-hand traffic): `right = (-forward_z, forward_x)`.
        let (right_x, right_z) = (-forward_z, forward_x);
        let mut candidates = Vec::new();
        for chunk in pointers.chunks_exact(8) {
            let item = u64::from_le_bytes(chunk.try_into().ok()?) as usize;
            if item == 0 {
                continue;
            }
            // The item's type and, for a prefab (4), its segment.
            let mut head = [0u8; 0x50];
            if !self.read(item, &mut head) {
                continue;
            }
            let offsets = OFFSETS;
            if head[offsets.item_kind] != 4 {
                continue;
            }
            let segment = u64::from_le_bytes(
                head[offsets.item_segment..offsets.item_segment + 8].try_into().ok()?,
            ) as usize;
            if segment == 0 {
                continue;
            }
            let mut segment_head = [0u8; 0x98];
            if !self.read(segment, &mut segment_head) {
                continue;
            }
            let instances = u64::from_le_bytes(
                segment_head[offsets.segment_instances..offsets.segment_instances + 8].try_into().ok()?,
            ) as usize;
            let instance_count = u64::from_le_bytes(
                segment_head[offsets.segment_count..offsets.segment_count + 8].try_into().ok()?,
            );
            if instances == 0 || instance_count == 0 || instance_count > 200 {
                continue;
            }
            let mut all = vec![0u8; instance_count as usize * offsets.instance_size];
            if !self.read(instances, &mut all) {
                continue;
            }
            for instance in all.chunks_exact(offsets.instance_size) {
                let actor_at = offsets.instance_actor;
                let actor = u64::from_le_bytes(instance[actor_at..actor_at + 8].try_into().ok()?) as usize;
                if actor == 0 {
                    continue;
                }
                let mut actor_head = [0u8; 0x108];
                if !self.read(actor, &mut actor_head) {
                    continue;
                }
                let light_at = offsets.actor_light;
                let light = u64::from_le_bytes(actor_head[light_at..light_at + 8].try_into().ok()?) as usize;
                if light == 0 {
                    continue;
                }
                let mut light_head = [0u8; 0xC0];
                if !self.read(light, &mut light_head) {
                    continue;
                }
                let state = u32::from_le_bytes(
                    light_head[offsets.light_state..offsets.light_state + 4].try_into().ok()?,
                );
                let seconds = f32::from_le_bytes(
                    light_head[offsets.light_seconds..offsets.light_seconds + 4].try_into().ok()?,
                );
                if !seconds.is_finite() || !(0.0..600.0).contains(&seconds) {
                    continue;
                }
                let x = f32::from_le_bytes(
                    actor_head[offsets.actor_x..offsets.actor_x + 4].try_into().ok()?,
                ) + f32::from(i16::from_le_bytes(
                    actor_head[offsets.actor_tile_x..offsets.actor_tile_x + 2].try_into().ok()?,
                )) * TILE_UNIT;
                let z = f32::from_le_bytes(
                    actor_head[offsets.actor_z..offsets.actor_z + 4].try_into().ok()?,
                ) + f32::from(i16::from_le_bytes(
                    actor_head[offsets.actor_tile_z..offsets.actor_tile_z + 2].try_into().ok()?,
                )) * TILE_UNIT;
                if !x.is_finite() || !z.is_finite() {
                    continue;
                }
                let (dx, dz) = (x - pose.x, z - pose.z);
                let distance = dx.hypot(dz);
                // The junction's stop line: near, ahead, and in this lane (not the cross street's). The next
                // signal can be a way off, so the reach is 200 m, within about 28° of straight ahead and 12 m
                // to either side of it (§72: tighter than the 35°/25 m the first version took, which let a
                // neighbouring road's light pass for ours).
                if distance < 2.0 || distance > 200.0 {
                    continue;
                }
                let ahead = dx * forward_x + dz * forward_z;
                let right = dx * right_x + dz * right_z;
                // Turning left, the head for that turn stands past the left of the lane being driven; turning
                // right, past its right. Straight on, the lane's own heads only.
                let (left_reach, right_reach) = match turn {
                    Some(Turn::Left) => (LATERAL * TURN_SPREAD, LATERAL),
                    Some(Turn::Right) => (LATERAL, LATERAL * TURN_SPREAD),
                    _ => (LATERAL, LATERAL),
                };
                // Straight on, the head must be ahead (within 28°). Turning, it stands beside the lane rather than
                // in front of it (measured: 15 m to the side, 7 m ahead), so a small share is enough.
                let cone = if turn.is_some_and(|turn| turn != Turn::Straight) { TURN_CONE } else { 0.88 };
                if ahead < distance * cone || right > right_reach || right < -left_reach {
                    continue;
                }
                // Along a route, only a light standing by the road it runs on: the cross street's own
                // lights (and the other side of a wide junction) are not the one being driven to.
                if let Some(route) = route
                    && !route.nodes.is_empty()
                {
                    let from = route.next.saturating_sub(2).min(route.nodes.len());
                    let to = (route.next + 10).min(route.nodes.len());
                    if from >= to {
                        continue;
                    }
                    let near = route.nodes[from..to]
                        .iter()
                        .any(|point| (x - point[0]).hypot(z - point[1]) <= 14.0)
                        || route.nodes[from..to].windows(2).any(|pair| {
                            distance_to_segment(x, z, pair[0], pair[1]) <= 14.0
                        });
                    if !near {
                        continue;
                    }
                }
                let Some(state) = state_of(state) else { continue };
                // The head's own facing against the truck's way of travel: a unit vector, so their dot product is
                // the cosine of the angle between them.
                let face_x = f32::from_le_bytes(
                    actor_head[offsets.actor_face_x..offsets.actor_face_x + 4].try_into().ok()?,
                );
                let face_z = f32::from_le_bytes(
                    actor_head[offsets.actor_face_z..offsets.actor_face_z + 4].try_into().ok()?,
                );
                // Signed: a head turned the other way serves the oncoming direction, and its green is not ours.
                let facing = face_x * forward_x + face_z * forward_z;
                candidates.push(Candidate { light: Light { state, seconds, distance, x, z }, ahead, right, facing });
            }
        }
        choose(candidates, previous, turn)
    }
}

/// A light that passed the filters, with what the choice needs of it: how far ahead of the truck's nose it is,
/// and how far to its right.
#[derive(Clone, Debug, PartialEq)]
struct Candidate {
    light: Light,
    ahead: f32,
    right: f32,
    /// How squarely the head faces the way the truck is going: 1 straight at it, 0 across, negative behind.
    facing: f32,
}

/// How close to the light shown a moment ago another stands for it to be that same light, metres: a junction's
/// heads are metres apart.
const SAME_LIGHT: f32 = 45.0;

/// How much closer another light must be before it takes over from the one shown, metres: a head of the same
/// junction a couple of metres nearer is not a change (it would flicker between heads).
const TAKEOVER: f32 = 35.0;

/// How far left of the road's middle a light may stand and still count as ours, metres: in right-hand traffic the
/// oncoming direction's heads stand on our left, and their green is not ours.
const ON_THE_RIGHT: f32 = -1.5;

/// How far to either side of straight ahead a light may stand, metres.
const LATERAL: f32 = 9.0;

/// How much further to the side the heads are looked for on the side the route turns to, times [`LATERAL`].
const TURN_SPREAD: f32 = 2.6;

/// How much of the distance to a head must be ahead of the truck for a turn's head to count (measured: a left
/// turn's head stood 15 m to the side, 7 m ahead). Straight on it is 0.88 (28°).
const TURN_CONE: f32 = 0.25;

/// How squarely a head must face the truck's way of travel to count as facing it (cosine): 0.75 is about 41°.
const FACING_SQUARE: f32 = 0.75;

/// Where a left turn's own head stands, metres to the left of straight ahead.
const LEFT_AIM: f32 = 9.0;

/// Where a right turn's own head stands, metres to the right of straight ahead.
const RIGHT_AIM: f32 = 9.0;

/// One light out of the candidates: the one already shown while it is still there, else the nearest.
///
/// A junction's cross street and the oncoming direction both have heads within reach, and the nearest of them all
/// is not always ours (FIXES §72). So: the right-hand side first, then the light shown before (it is the one being
/// driven to), then the nearest.
fn choose(candidates: Vec<Candidate>, previous: Option<(f32, f32)>, turn: Option<Turn>) -> Option<Light> {
    let ahead_of_us: Vec<Candidate> = candidates.into_iter().filter(|one| one.ahead > 0.0).collect();
    // In right-hand traffic the oncoming direction's heads stand on our left. A left turn's own head stands
    // there too, though: turning left, it is the one being driven to.
    let ours: Vec<Candidate> = match turn {
        Some(Turn::Left) => ahead_of_us,
        _ => {
            if ahead_of_us.iter().any(|one| one.right >= ON_THE_RIGHT) {
                ahead_of_us.into_iter().filter(|one| one.right >= ON_THE_RIGHT).collect()
            } else {
                ahead_of_us
            }
        }
    };
    // A head turned away from this way of travel is the oncoming direction's: dropped when any other is left.
    let facing_us: Vec<Candidate> = ours.iter().filter(|one| one.facing > -0.2).cloned().collect();
    let pool = if facing_us.is_empty() { ours.clone() } else { facing_us };
    // First the heads that squarely face this way; among them (or the rest, when none does) the one where the
    // route goes: a left turn's head `LEFT_AIM` to the left, otherwise the lane's own; then the nearest.
    let square = pool.iter().any(|one| one.facing >= FACING_SQUARE);
    let aimed = |one: &Candidate| -> f32 {
        match turn {
            Some(Turn::Left) => (one.right - -LEFT_AIM).abs(),
            Some(Turn::Right) => (one.right - RIGHT_AIM).abs(),
            _ => one.right.abs(),
        }
    };
    let nearest = pool
        .iter()
        .filter(|one| !square || one.facing >= FACING_SQUARE)
        .min_by(|one, other| {
            aimed(one)
                .total_cmp(&aimed(other))
                .then_with(|| one.light.distance.total_cmp(&other.light.distance))
        })?
        .clone();
    if let Some((x, z)) = previous
        && let Some(same) = ours
            .iter()
            .map(|one| (one, (one.light.x - x).hypot(one.light.z - z)))
            .filter(|(_, spread)| *spread <= SAME_LIGHT)
            // The very light shown before: the one where it was, not merely one near the truck.
            .min_by(|(_, spread), (_, other)| spread.total_cmp(other))
            .map(|(one, _)| one)
        && same.light.distance <= nearest.light.distance + TAKEOVER
    {
        return Some(same.light.clone());
    }
    Some(nearest.light)
}

impl Drop for Game {
    fn drop(&mut self) {
        // SAFETY: the handle was opened here and is closed once.
        let _ = unsafe { CloseHandle(self.process) };
    }
}

fn state_of(state: u32) -> Option<LightState> {
    match state {
        1 | 4 => Some(LightState::Amber),
        2 => Some(LightState::Red),
        8 => Some(LightState::Green),
        32 => Some(LightState::Sleep),
        0 => None,
        _ => None,
    }
}

/// How far a point is from the line between two route nodes (metres): a light's pole is beside the road, not
/// at a node, and route nodes can be a long way apart on a straight road.
fn distance_to_segment(x: f32, z: f32, a: [f32; 2], b: [f32; 2]) -> f32 {
    let (dx, dz) = (b[0] - a[0], b[1] - a[1]);
    let length = dx * dx + dz * dz;
    if length == 0.0 {
        return (x - a[0]).hypot(z - a[1]);
    }
    let along = (((x - a[0]) * dx + (z - a[1]) * dz) / length).clamp(0.0, 1.0);
    (x - (a[0] + dx * along)).hypot(z - (a[1] + dz * along))
}

/// Where the semaphores sit in the engine's prefab and light objects: byte offsets into the structures walked
/// in [`Game::light_ahead`]. The two games share the engine, so they share these too — ETS2 1.61 and ATS 1.62
/// were both measured to hold the same numbers (ATS 1.62 moves the *navigator*'s fields from `+0x118` up by
/// `0x10`, but everything read here is below that).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Offsets {
    item_kind: usize,
    item_segment: usize,
    segment_instances: usize,
    segment_count: usize,
    instance_actor: usize,
    instance_size: usize,
    actor_light: usize,
    actor_x: usize,
    actor_z: usize,
    actor_tile_x: usize,
    actor_tile_z: usize,
    /// The head's facing, a unit vector's `x` and `z`: which way of travel this head serves (measured: 75
    /// heads, every vector exactly 1.0000 long).
    actor_face_x: usize,
    actor_face_z: usize,
    light_state: usize,
    light_seconds: usize,
}

/// The offsets the two games' engine has (ETS2 1.61, ATS 1.62: measured alike).
const OFFSETS: Offsets = Offsets {
    item_kind: 0x0A,
    item_segment: 0x48,
    segment_instances: 0x88,
    segment_count: 0x90,
    instance_actor: 8,
    instance_size: 0x10,
    actor_light: 0x100,
    actor_x: 0x28,
    actor_z: 0x30,
    actor_tile_x: 0x34,
    actor_tile_z: 0x36,
    actor_face_x: 0x38,
    actor_face_z: 0x40,
    light_state: 0x70,
    light_seconds: 0xB8,
};

/// A position's tile unit: the `i16` offsets beside the float coordinates count in these, metres.
const TILE_UNIT: f32 = 512.0;

const BASE_CTRL: &str = "48 8b ? ? ? ? ? 48 8b ? 48 8b ? 48 8b 80";
const NEARBY_KDOP: &str = "4c 8d 81 ? ? ? ? 0f 29 ? ? 48 8d 91";

impl Game {
    /// A byte pattern's first match in the game's module (`?` is any byte).
    unsafe fn scan(&self, pattern: &str) -> Option<usize> {
        let pattern = Pattern::parse(pattern)?;
        let (base, size) = module_of(self.pid, &find_process()?.1)?;
        let end = base.checked_add(size)?;
        let mut address = base;
        while address < end {
            let mut info = MEMORY_BASIC_INFORMATION::default();
            // SAFETY: the query only fills `info` and reads the process's address space description.
            let written = unsafe {
                VirtualQueryEx(
                    self.process,
                    Some(address as *const c_void),
                    &mut info,
                    size_of::<MEMORY_BASIC_INFORMATION>(),
                )
            };
            if written == 0 {
                address += 0x1000;
                continue;
            }
            let region = (info.RegionSize as usize).max(0x1000);
            let readable = info.State.0 & MEM_COMMIT.0 != 0
                && info.Protect.0 & PAGE_GUARD.0 == 0
                && info.Protect.0 & PAGE_NOACCESS.0 == 0;
            if readable {
                // A region is read in pieces, with the pattern's length kept across the joins.
                let overlap = pattern.bytes.len();
                let mut at = 0;
                while at < region {
                    let length = (4 * 1024 * 1024 + overlap).min(region - at);
                    let mut data = vec![0u8; length];
                    // SAFETY: the buffer is this function's own, and `ReadProcessMemory` only writes it.
                    if unsafe { self.read_raw(address + at, &mut data) } {
                        if let Some(found) = pattern.find(&data) {
                            return Some(address + at + found);
                        }
                    }
                    at += 4 * 1024 * 1024;
                }
            }
            address += region;
        }
        None
    }

    fn rip_target(&self, at: usize, displacement: usize) -> Option<usize> {
        let offset = self.i32(at + displacement)? as isize;
        Some((at + displacement + 4).wrapping_add(offset as usize))
    }

    fn read(&self, address: usize, buffer: &mut [u8]) -> bool {
        // SAFETY: the buffer is the caller's; a failed read leaves it untouched.
        unsafe { self.read_raw(address, buffer) }
    }

    unsafe fn read_raw(&self, address: usize, buffer: &mut [u8]) -> bool {
        let mut read = 0usize;
        // SAFETY: a read-only copy into this process's own buffer.
        unsafe {
            ReadProcessMemory(
                self.process,
                address as *const c_void,
                buffer.as_mut_ptr() as *mut c_void,
                buffer.len(),
                Some(&mut read),
            )
            .is_ok()
                && read == buffer.len()
        }
    }

    fn u64(&self, address: usize) -> Option<u64> {
        let mut bytes = [0u8; 8];
        self.read(address, &mut bytes).then(|| u64::from_le_bytes(bytes))
    }

    fn u32(&self, address: usize) -> Option<u32> {
        let mut bytes = [0u8; 4];
        self.read(address, &mut bytes).then(|| u32::from_le_bytes(bytes))
    }

    fn i32(&self, address: usize) -> Option<i32> {
        let mut bytes = [0u8; 4];
        self.read(address, &mut bytes).then(|| i32::from_le_bytes(bytes))
    }
}

/// A byte pattern: its bytes and which of them are exact (`false`: any byte).
struct Pattern {
    bytes: Vec<u8>,
    exact: Vec<bool>,
    /// The first exact byte, for the quick reject.
    first: usize,
}

impl Pattern {
    fn parse(text: &str) -> Option<Self> {
        let mut bytes = Vec::new();
        let mut exact = Vec::new();
        for part in text.split_whitespace() {
            if part == "?" {
                bytes.push(0);
                exact.push(false);
            } else {
                bytes.push(u8::from_str_radix(part, 16).ok()?);
                exact.push(true);
            }
        }
        let first = exact.iter().position(|exact| *exact)?;
        Some(Self { bytes, exact, first })
    }

    fn find(&self, data: &[u8]) -> Option<usize> {
        if data.len() < self.bytes.len() {
            return None;
        }
        let first = self.first;
        for at in 0..=data.len() - self.bytes.len() {
            if data[at + first] != self.bytes[first] {
                continue;
            }
            if self
                .exact
                .iter()
                .zip(&self.bytes)
                .enumerate()
                .all(|(index, (exact, byte))| !*exact || data[at + index] == *byte)
            {
                return Some(at);
            }
        }
        None
    }
}

/// The game's process, by its executable's name (`eurotrucks2.exe`, or ATS's).
fn find_process() -> Option<(u32, String)> {
    // SAFETY: a snapshot of the process list, walked with an entry sized as the calls require, then closed.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut more = Process32FirstW(snapshot, &mut entry).is_ok();
        let mut found = None;
        while more {
            let name = String::from_utf16_lossy(
                &entry.szExeFile[..entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len())],
            );
            let lower = name.to_ascii_lowercase();
            if lower == "eurotrucks2.exe" || lower == "amtrucks.exe" {
                found = Some((entry.th32ProcessID, name));
                break;
            }
            more = Process32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
        found
    }
}

/// The base and size of `name`'s module in `pid`.
fn module_of(pid: u32, name: &str) -> Option<(usize, usize)> {
    // SAFETY: a module snapshot of the game's process, walked with an entry sized as the calls require, then
    // closed.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid).ok()?;
        let mut entry = MODULEENTRY32W {
            dwSize: size_of::<MODULEENTRY32W>() as u32,
            ..Default::default()
        };
        let mut more = Module32FirstW(snapshot, &mut entry).is_ok();
        let mut found = None;
        while more {
            let module = String::from_utf16_lossy(
                &entry.szModule[..entry.szModule.iter().position(|&c| c == 0).unwrap_or(entry.szModule.len())],
            );
            if module.eq_ignore_ascii_case(name) {
                found = Some((entry.modBaseAddr as usize, entry.modBaseSize as usize));
                break;
            }
            more = Module32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
        found
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_patterns_with_wildcards() {
        let pattern = Pattern::parse("48 8b ? ff").unwrap();
        assert_eq!(pattern.bytes, vec![0x48, 0x8b, 0, 0xff]);
        assert_eq!(pattern.exact, vec![true, true, false, true]);
        assert_eq!(pattern.find(&[0, 0x48, 0x8b, 0x12, 0xff, 0]), Some(1));
        assert_eq!(pattern.find(&[0x48, 0x8b, 0x12, 0]), None);
    }

    #[test]
    fn off_reads_nothing() {
        let lights = TrafficLights::new();
        lights.set_enabled(false);
        assert!(!lights.enabled());
        lights.set_pose(1.0, 2.0, 0.5);
        assert!(lights.pose.lock().unwrap().is_none());
        lights.publish(Some(Light { state: LightState::Red, seconds: 5.0, distance: 20.0, x: 1.0, z: 2.0 }));
        assert_eq!(lights.latest(), None);
    }

    #[test]
    fn prefers_a_light_on_the_right_of_the_road() {
        // Ours, 40 m ahead on the right; the oncoming direction's, nearer but on the left.
        let ours = Candidate {
            light: Light { state: LightState::Red, seconds: 12.0, distance: 40.0, x: 4.0, z: 40.0 },
            ahead: 40.0,
            right: 4.0,
            facing: 1.0,
        };
        let theirs = Candidate {
            light: Light { state: LightState::Green, seconds: 20.0, distance: 38.0, x: -4.0, z: 38.0 },
            ahead: 38.0,
            right: -4.0,
            facing: 1.0,
        };
        let chosen = choose(vec![ours, theirs.clone()], None, None).unwrap();
        assert_eq!(chosen.state, LightState::Red);
        // Nothing on the right at all: the left-hand head is better than no light.
        assert_eq!(choose(vec![theirs], None, None).unwrap().state, LightState::Green);
    }

    #[test]
    fn keeps_the_light_it_showed_while_it_is_still_there() {
        let shown = Candidate {
            light: Light { state: LightState::Red, seconds: 9.0, distance: 30.0, x: 4.0, z: 30.0 },
            ahead: 30.0,
            right: 4.0,
            facing: 1.0,
        };
        // A head of the same junction, a few metres on, nearer: still that junction's light.
        let next_head = Candidate {
            light: Light { state: LightState::Amber, seconds: 3.0, distance: 27.0, x: 5.0, z: 27.0 },
            ahead: 27.0,
            right: 5.0,
            facing: 1.0,
        };
        let kept = choose(vec![shown.clone(), next_head.clone()], Some((4.0, 30.0)), None).unwrap();
        assert_eq!(kept.state, LightState::Red);
        // A head across the same junction, well over 8 m off (ATS junctions are wide: 21 m measured): still that
        // junction's light, or the show would jump between its heads as they step through the phases.
        let far_head = Candidate {
            light: Light { state: LightState::Green, seconds: 8.0, distance: 14.0, x: 4.0, z: 14.0 },
            ahead: 14.0,
            right: 4.0,
            facing: 1.0,
        };
        assert_eq!(
            choose(vec![shown.clone(), far_head], Some((4.0, 30.0)), None).unwrap().state,
            LightState::Red
        );
        // Another junction's light, far nearer than that, does take over.
        let shown_far = Candidate {
            light: Light { state: LightState::Red, seconds: 9.0, distance: 70.0, x: 4.0, z: 70.0 },
            ahead: 70.0,
            right: 4.0,
            facing: 1.0,
        };
        let other = Candidate {
            light: Light { state: LightState::Green, seconds: 8.0, distance: 5.0, x: 4.0, z: 5.0 },
            ahead: 5.0,
            right: 4.0,
            facing: 1.0,
        };
        assert_eq!(
            choose(vec![shown_far, other], Some((4.0, 70.0)), None).unwrap().state,
            LightState::Green
        );
    }

    #[test]
    fn ignores_a_light_behind_the_truck() {
        let behind = Candidate {
            light: Light { state: LightState::Red, seconds: 5.0, distance: 10.0, x: 0.0, z: 10.0 },
            ahead: -10.0,
            right: 0.0,
            facing: 1.0,
        };
        assert_eq!(choose(vec![behind], None, None), None);
    }

    #[test]
    fn reads_the_states_the_game_writes() {
        assert_eq!(state_of(2), Some(LightState::Red));
        assert_eq!(state_of(8), Some(LightState::Green));
        assert_eq!(state_of(1), Some(LightState::Amber));
        assert_eq!(state_of(4), Some(LightState::Amber));
        assert_eq!(state_of(32), Some(LightState::Sleep));
        assert_eq!(state_of(0), None);
        assert_eq!(state_of(16), None);
    }
}
