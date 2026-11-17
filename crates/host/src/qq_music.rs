//! QQ Music: WestPlay's own QQ Music home (`ui/src/cabin/apps/qq`), backed by a hidden WebView whose
//! script (`qq_music.js`) fetches the local QQ middle layer (L-1124/QQMusicApi on 127.0.0.1:8080) and answers
//! the app's questions. The login credential lives in the middle layer's account pool: nothing of the account
//! passes through WestPlay or this page; what comes out is only what the app shows (names, covers, what plays).
//!
//! This is the read-only slice first: home (recommend playlists + new songs), search, a playlist's page and
//! lyrics. Playing (stream URLs through the pool credential, an `<audio>` element here) lands in a later slice.

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::webview::{self, OffscreenWebView, Stage};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment;

/// The session's file, beside the page's profile (`data_dir/webview2-qq-music/session`): the cookie
/// string the sign-in window gave, kept across starts.
const SESSION_FILE: &str = "session";

/// The player's volume kept last run (`data_dir/webview2-qq-music/volume`): a share of full
/// loudness, 0 to 1. The page's own storage can't keep it (its document has no origin), and a
/// player who set the volume once doesn't mean to set it at every start (owner 2026-11-16).
const VOLUME_FILE: &str = "volume";

/// The volume kept last run (`None`: none, or unreadable).
fn read_volume(user_data: &Path) -> Option<f64> {
    let text = std::fs::read_to_string(user_data.join(VOLUME_FILE)).ok()?;
    let share = text.trim().parse::<f64>().ok()?;
    (0.0..=1.0).contains(&share).then_some(share)
}

/// Keeps `share` for the next start.
fn write_volume(user_data: &Path, share: f64) {
    if !(0.0..=1.0).contains(&share) {
        return;
    }
    let path = user_data.join(VOLUME_FILE);
    if let Some(folder) = path.parent() {
        let _ = std::fs::create_dir_all(folder);
    }
    if let Err(error) = std::fs::write(&path, format!("{share}")) {
        crate::log!("[qq music] couldn't keep the volume: {error}");
    }
}

/// The cookie string kept last run (`None`: none, or unreadable).
fn read_session(user_data: &Path) -> Option<String> {
    let text = std::fs::read_to_string(user_data.join(SESSION_FILE)).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// Keeps `cookies` for the next start.
fn write_session(user_data: &Path, cookies: &str) {
    let path = user_data.join(SESSION_FILE);
    if let Some(folder) = path.parent() {
        let _ = std::fs::create_dir_all(folder);
    }
    if let Err(error) = std::fs::write(&path, cookies) {
        crate::log!("[qq music] couldn't keep the session: {error}");
    }
}

/// The hidden page's empty shell (an opaque `about:blank`-like document; it fetches the local loopback layer).
const SHELL: &str = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>";

/// What the cabin page asks of QQ Music (`qqMusic` in ui/src/shared/host.ts).
#[derive(Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Command {
    /// Run (hidden).
    Start,
    /// A question for QQ Music, answered with the same `id`.
    Ask {
        id: u32,
        question: Question,
    },
    /// Play an album/playlist/song (`id`), or a list of songs (`songs`), from the song at `index`.
    Play {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        songs: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        index: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        shuffle: Option<bool>,
        /// What `id` names: a playlist (its number), an album or a singer (a base62 mid). The page's
        /// own route for each (`songsOfList` in qq_music.js).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        kind: Option<String>,
    },
    Pause,
    Next,
    Previous,
    Seek {
        seconds: f64,
    },
    /// The player's volume, 0 to 100. `transient`: a fade's (the cab's own quiet), not the player's
    /// choice of it — the host keeps only the latter for the next start.
    Volume {
        percent: f64,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        transient: bool,
    },
    Shuffle {
        on: bool,
    },
    Repeat {
        mode: Repeat,
    },
    /// A song of the queue, `offset` songs after the one playing.
    Jump {
        offset: u32,
    },
    /// A song favourited (`on`), or not.
    Favorite {
        id: String,
        on: bool,
    },
    /// A playlist or song added to the library.
    Add {
        id: String,
    },
    /// Open the site's own sign-in window on the desktop (handled by the host, not the hidden page).
    SignIn,
}

impl Command {
    /// For the page (all but the host's own: running and opening the sign-in window).
    fn for_page(&self) -> bool {
        !matches!(self, Command::Start | Command::SignIn)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Repeat {
    Off,
    All,
    One,
}

/// What the Music app asks QQ Music.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(tag = "ask", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Question {
    /// Home: recommend playlist wall and new songs.
    Home,
    /// The official charts (官方歌单): each group's own lists, named and pictured.
    Top,
    Search {
        query: String,
    },
    /// A playlist's, artist's or album's page (`collection`).
    Collection {
        id: String,
        #[serde(default)]
        kind: Option<String>,
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        by: Option<String>,
        #[serde(default)]
        image: Option<String>,
    },
    /// A song's words (its `mid`).
    Lyrics {
        id: String,
    },
}

impl Question {
    /// Keep only what may reach a middle-layer address: a search's free text (newlines stripped), a playlist
    /// id or a song `mid` (letters, digits, `-`, `.`); anything else is left out.
    fn checked(self) -> Self {
        match self {
            Question::Search { query } => Question::Search {
                query: query
                    .chars()
                    .filter(|c| !matches!(c, '\n' | '\r' | '\t'))
                    .take(80)
                    .collect(),
            },
            Question::Collection { id, kind, name, by, image } => Question::Collection {
                id: id.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.')).take(64).collect(),
                kind,
                name,
                by,
                image,
            },
            Question::Lyrics { id } => Question::Lyrics {
                id: id.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.')).take(40).collect(),
            },
            other => other,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Album,
    Playlist,
    Artist,
    Station,
    Song,
    Curator,
    Folder,
    /// A chart of the official lists (the app's 官方歌单: qq_music.js's `chartItem`).
    Top,
}

/// A card or row: what it is, its name, who it's by, its note, its cover and the cover's colour.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Item {
    pub id: String,
    pub kind: Kind,
    pub name: String,
    #[serde(default)]
    pub by: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub wide: Option<String>,
    pub color: String,
    #[serde(default)]
    pub explicit: bool,
    #[serde(default)]
    pub live: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,
}

/// A song: its name, artist, album (and their pages), cover, length (seconds), number on its album.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub album_id: Option<String>,
    #[serde(default)]
    pub artist_id: Option<String>,
    #[serde(default)]
    pub image: Option<String>,
    pub color: String,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub explicit: bool,
    #[serde(default)]
    pub number: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Style {
    Hero,
    Shelf,
    Recent,
    Songs,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Section {
    #[serde(default)]
    pub title: String,
    pub style: Style,
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub songs: Vec<Track>,
}

/// Home or a category: its sections, in order.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Page {
    #[serde(default)]
    pub sections: Vec<Section>,
}

/// A playlist's page.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Collection {
    pub item: Item,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub genre: String,
    #[serde(default)]
    pub year: Option<i32>,
    #[serde(default)]
    pub tracks: Vec<Track>,
    /// Favoured playlists (the "Mine" page's saved playlists).
    #[serde(default)]
    pub playlists: Vec<Item>,
}

/// A search's results.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Results {
    #[serde(default)]
    pub top: Vec<Item>,
    #[serde(default)]
    pub songs: Vec<Track>,
    #[serde(default)]
    pub artists: Vec<Item>,
    #[serde(default)]
    pub albums: Vec<Item>,
    #[serde(default)]
    pub playlists: Vec<Item>,
    #[serde(default)]
    pub stations: Vec<Item>,
}

/// QQ Music's answer to the app's question `answer` (its id), under the question's name; `failed` when the
/// middle layer didn't answer.
#[derive(Debug, Default, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Answer {
    #[serde(rename(serialize = "id"))]
    pub answer: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home: Option<Page>,
    /// The official charts (a `Top` question's answer).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top: Option<Page>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search: Option<Results>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collection: Option<Collection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<crate::lyrics::Lyrics>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub failed: bool,
}

/// Where a song plays from (as the app asked for it).
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Context {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub kind: Kind,
}

/// What QQ Music plays: the song, where from, how far (seconds), the options, the volume and the songs to come.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Playback {
    #[serde(default)]
    pub track: Option<Track>,
    #[serde(default)]
    pub context: Option<Context>,
    pub playing: bool,
    #[serde(default)]
    pub loading: bool,
    #[serde(default)]
    pub position: f64,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub preview: bool,
    #[serde(default)]
    pub shuffle: bool,
    pub repeat: Repeat,
    #[serde(default)]
    pub volume: Option<f64>,
    /// The player's own choice of the volume (a fade lowering `volume` isn't one): what the host
    /// keeps for the next start (VOLUME_FILE).
    #[serde(default)]
    pub chosen: Option<f64>,
    #[serde(default)]
    pub next: Vec<Track>,
}

/// Whether the page is signed in (the pool credential, reported by the page) and playing.
#[derive(Clone, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub signed_in: bool,
    pub playing: bool,
    #[serde(default)]
    pub avatar: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum Report {
    State(State),
    Answer(Box<Answer>),
    /// What plays (`None`: nothing).
    Playback(Option<Box<Playback>>),
}

pub struct QqMusic {
    view: OffscreenWebView,
    pending: RefCell<Vec<Report>>,
    /// The app's questions not answered yet: asked again as the page is ready anew.
    unanswered: RefCell<Unanswered>,
    /// Persisted session cookie waiting for the hidden page to finish loading, then handed to it.
    restore_cookie: RefCell<Option<String>>,
    /// Where the page's profile lives (the session's file is there too).
    user_data: PathBuf,
    /// The volume last written (a fade sends many, and the page reports one every tick: only a new
    /// one reaches the file).
    last_volume: RefCell<Option<f64>>,
}

/// Questions asked of the page, by id, until answered (the latest `MOST`: the app gives up on older ones).
#[derive(Debug, Default)]
struct Unanswered(BTreeMap<u32, String>);

impl Unanswered {
    const MOST: usize = 32;

    fn asked(&mut self, id: u32, sent: String) {
        self.0.insert(id, sent);
        while self.0.len() > Self::MOST {
            self.0.pop_first();
        }
    }

    fn answered(&mut self, id: u32) {
        self.0.remove(&id);
    }

    /// What to ask again, oldest first.
    fn all(&self) -> Vec<String> {
        self.0.values().cloned().collect()
    }
}

impl QqMusic {
    /// Opens the QQ Music hidden page in a WebView of `stage`'s frame (`width` x `height`).
    pub fn start(stage: &Stage, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as("qq music")?;
        view.show(false)?;
        stage.add(&view, false)?;
        view.add_startup_script(include_str!("qq_music.js"))?;
        view.navigate_to_string(SHELL)?;
        Ok(Self {
            view,
            pending: RefCell::new(Vec::new()),
            unanswered: RefCell::default(),
            user_data: user_data.to_owned(),
            last_volume: RefCell::new(read_volume(user_data)),
            // The session the sign-in window gave last run, kept in a file beside the page's own
            // profile: the hidden page's document has no origin (`NavigateToString`), so its own
            // localStorage refuses every write, and the credential would be lost at every start
            // (owner 2026-11-16: signed in again each time).
            restore_cookie: RefCell::new(read_session(user_data)),
        })
    }

    /// Its WebView2 environment, shared with the sign-in window on the same profile folder.
    pub fn environment(&self) -> &ICoreWebView2Environment {
        self.view.environment()
    }

    pub fn command(&self, command: &Command) -> windows::core::Result<()> {
        match command {
            Command::Ask { id, question } => {
                let checked = Command::Ask { id: *id, question: question.clone().checked() };
                let sent = serde_json::to_string(&checked).unwrap_or_default();
                self.unanswered.borrow_mut().asked(*id, sent.clone());
                self.view.post_json(&sent)
            }
            _ if command.for_page() => {
                let posted = self.view.post_json(&serde_json::to_string(command).unwrap_or_default());
                crate::log!("[qq music] posted {command:?} -> {posted:?}");
                posted
            }
            _ => Ok(()),
        }
    }

    /// Hand the sign-in window's captured cookie string to the hidden page; it re-sends it to the layer as a Cookie header.
    pub fn apply_cookies(&self, cookies: &str) -> windows::core::Result<()> {
        // Kept for the next start (the page's own localStorage can't: its document has no origin).
        // The pending copy is cleared by whoever took it (`take_reports`'s Ready branch, which is
        // holding the borrow): clearing it here again would be a second mutable borrow of the same
        // `RefCell`, which panics (the start that crashed as soon as a session was kept).
        write_session(&self.user_data, cookies);
        let message = serde_json::json!({ "action": "credential", "cookies": cookies }).to_string();
        self.view.post_json(&message)
    }

    /// Stage a persisted cookie to be handed to the hidden page once it reports ready (a message sent
    /// before the startup script binds its listener would otherwise be dropped).
    pub fn restore_session(&self, cookies: String) {
        *self.restore_cookie.borrow_mut() = Some(cookies);
    }

    /// What the page said since the last call.
    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = std::mem::take(&mut *self.pending.borrow_mut());
        for message in self.view.take_page_messages() {
            match read_message(&message) {
                Some(Message::Ready) => {
                    // Re-inject the persisted session now the listener is bound, and report signed in.
                    // Taken out first, its borrow ended before anything else is touched: holding it
                    // through `apply_cookies` would be a second mutable borrow of `restore_cookie`
                    // (and `pending`'s own would be a third) — which panicked, taking the host with it
                    // the moment a kept session was restored.
                    let pending_cookie = self.restore_cookie.borrow_mut().take();
                    crate::log!(
                        "[qq music] ready: kept session {}",
                        pending_cookie.as_deref().map_or("none".to_owned(), |c| format!("{} chars", c.len()))
                    );
                    if let Some(cookie) = pending_cookie {
                        let _ = self.apply_cookies(&cookie);
                        self.pending.borrow_mut().push(Report::State(State {
                            signed_in: true,
                            playing: false,
                            avatar: None,
                        }));
                    }
                    // The volume kept last run, before anything plays: the page starts at full
                    // loudness otherwise (its own storage can't keep it: VOLUME_FILE).
                    if let Some(share) = read_volume(&self.user_data) {
                        let _ = self.view.post_json(
                            &serde_json::json!({ "action": "volume", "percent": share * 100.0 })
                                .to_string(),
                        );
                    }
                    // The questions asked again now the session is in place: a page loading anew
                    // asks for the account's own lists, and the credential has to be there before
                    // it does (a list asked for without it comes back as everyone's, and the app
                    // keeps it — `homeCache` in qq_music.js).
                    for sent in self.unanswered.borrow().all() {
                        let _ = self.view.post_json(&sent);
                    }
                }
                Some(Message::Probe(text)) => crate::log!("[qq music] {text}"),
                Some(Message::State(state)) => reports.push(Report::State(state)),
                Some(Message::Answer(answer)) => {
                    self.unanswered.borrow_mut().answered(answer.answer);
                    reports.push(Report::Answer(answer));
                }
                Some(Message::Playback(playback)) => {
                    // The player's own volume, kept as it changes for the next start — only when it
                    // changed (a fade's steps and the page's own reports would write the file many
                    // times a second), and only a volume the player chose (`chosen`), never a fade's.
                    if let Some(share) = playback.as_ref().and_then(|playback| playback.chosen)
                        && self.last_volume.borrow().is_none_or(|kept| (kept - share).abs() > 0.001)
                    {
                        write_volume(&self.user_data, share);
                        *self.last_volume.borrow_mut() = Some(share);
                    }
                    reports.push(Report::Playback(playback));
                }
                None => {}
            }
        }
        reports
    }

    /// Whether the WebView failed since the last call (it's then closed and started again when needed).
    pub fn failed(&self) -> bool {
        self.view.take_failure().is_some()
    }

    /// Takes the WebView off the frame; it closes as it's dropped.
    pub fn close(self, stage: &Stage) {
        let _ = stage.remove(&self.view);
    }
}

/// A message of QQ Music's page (`qq_music.js`).
#[derive(Debug, PartialEq)]
enum Message {
    /// A line for the log.
    Probe(String),
    /// The page is ready (loaded anew).
    Ready,
    State(State),
    Answer(Box<Answer>),
    Playback(Option<Box<Playback>>),
}

fn read_message(message: &str) -> Option<Message> {
    let value: serde_json::Value = serde_json::from_str(message).ok()?;
    if let Some(probe) = value.get("qqProbe").and_then(serde_json::Value::as_str) {
        return Some(Message::Probe(probe.to_owned()));
    }
    if value.get("ready").and_then(serde_json::Value::as_bool) == Some(true) {
        return Some(Message::Ready);
    }
    if value.get("answer").is_some() {
        return match serde_json::from_value::<Answer>(value.clone()) {
            Ok(mut answer) => {
                answer.lyrics = answer.lyrics.map(crate::lyrics::Lyrics::checked);
                Some(Message::Answer(Box::new(answer)))
            }
            // An answer that doesn't read: failed, so the app isn't left waiting.
            Err(_) => {
                let id = value.get("answer").and_then(serde_json::Value::as_u64)?;
                Some(Message::Answer(Box::new(Answer {
                    answer: u32::try_from(id).ok()?,
                    failed: true,
                    ..Default::default()
                })))
            }
        };
    }
    if let Some(playback) = value.get("playback") {
        if playback.is_null() {
            return Some(Message::Playback(None));
        }
        return serde_json::from_value::<Playback>(playback.clone())
            .ok()
            .map(|p| Message::Playback(Some(Box::new(p))));
    }
    serde_json::from_value::<State>(value).ok().map(Message::State)
}

/// `{"type":"qqMusic","signedIn":…,"playing":…,"avatar":…}` for the cabin page (`null` when QQ Music isn't running).
pub fn state_message(state: Option<&State>) -> String {
    serde_json::json!({
        "type": "qqMusic",
        "signedIn": state.map(|s| s.signed_in),
        "playing": state.map(|s| s.playing),
        "avatar": state.and_then(|s| s.avatar.as_deref()),
    })
    .to_string()
}

/// `{"type":"qqMusicAnswer","id":…,"home":{…}}`: QQ Music's answer to the app's question.
pub fn answer_message(answer: &Answer) -> String {
    let mut message = serde_json::to_value(answer).unwrap_or_default();
    message["type"] = "qqMusicAnswer".into();
    message.to_string()
}

/// `{"type":"qqMusicPlayback","playback":{…}}` (`null`: nothing plays).
pub fn playback_message(playback: Option<&Playback>) -> String {
    serde_json::json!({ "type": "qqMusicPlayback", "playback": playback }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_cabin_pages_commands() {
        let ask: Command =
            serde_json::from_str(r#"{"action":"ask","id":3,"question":{"ask":"search","query":"晴天"}}"#).unwrap();
        assert_eq!(
            ask,
            Command::Ask {
                id: 3,
                question: Question::Search { query: "晴天".into() }
            }
        );
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"ask","id":4,"question":{"ask":"home"}}"#).unwrap(),
            Command::Ask { id: 4, question: Question::Home }
        );
        let play: Command = serde_json::from_str(r#"{"action":"play","id":"8584177317","index":2}"#).unwrap();
        assert_eq!(play, Command::Play { id: Some("8584177317".into()), songs: None, index: Some(2), shuffle: None });
        assert_eq!(
            serde_json::from_str::<Command>(r#"{"action":"play"}"#).unwrap(),
            Command::Play { id: None, songs: None, index: None, shuffle: None }
        );
        assert!(serde_json::from_str::<Command>(r#"{"action":"start"}"#).unwrap() == Command::Start);
        assert!(serde_json::from_str::<Command>(r#"{"action":"explode"}"#).is_err());
    }

    #[test]
    fn passes_the_page_its_commands_as_the_app_sent_them() {
        let ask = Command::Ask { id: 9, question: Question::Search { query: "周杰伦".into() } };
        assert_eq!(
            serde_json::to_string(&ask).unwrap(),
            r#"{"action":"ask","id":9,"question":{"ask":"search","query":"周杰伦"}}"#
        );
        assert!(ask.for_page() && Command::Next.for_page());
        assert!(!Command::Start.for_page());
    }

    #[test]
    fn keeps_only_safe_ids_for_the_layer() {
        let checked = Question::Lyrics { id: "001fsNdn1zuZnA\"><script>".into() }.checked();
        let Question::Lyrics { id } = checked else { panic!() };
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.')));
        assert!(!id.contains('<') && !id.contains('>') && !id.contains('"'));
    }
}
