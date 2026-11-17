//! A streaming site's own page, whole, in a WebView of its own: Bilibili, QQ Music, NetEase Cloud Music, Qingting
//! FM, Douyin or Kugou Music, shown where the cabin page cuts itself open (the WebApp app, ui/src/cabin/apps/web).
//! The site's own page, signed in as the player signed in there: no re-implementation of it, and nothing of it
//! WestPlay has to keep up with.
//!
//! The bar above it shows the page's own `<title>`, from WebView2 (`DocumentTitleChanged`): no script of ours
//! in the page for it. `webapp.js` only reports a text field's focus, so the player's keyboard types into the
//! page (the game's typing, as the cabin's own fields take it), and types what the host sends there.
//!
//! Each site has a WebView2 profile of its own (signed in to one is not signed in to another), and one site
//! runs at a time: the app shows the one open.

use std::cell::{Cell, RefCell};
use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment;

use crate::speakers::{Equalizer, Head, Speaker};
use crate::webview::{self, OffscreenWebView, PageSize, Stage};

/// The browser the pages are told they're in: WebView2's own User-Agent says "Edg", which some sites serve a
/// lesser page for (and some refuse).
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) \
                          Chrome/140.0.0.0 Safari/537.36";

/// A site the WebApp app can show (a `Site` in ui/src/shared/host.ts).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Site {
    Bilibili,
    QqMusic,
    Netease,
    Qingting,
    Douyin,
    Kugou,
}

impl Site {
    /// The page it opens on.
    pub fn home(self) -> &'static str {
        match self {
            Site::Bilibili => "https://www.bilibili.com/",
            Site::QqMusic => "https://y.qq.com/",
            // Its new web player (owner 2026-11-01), whose playbar is the old site's: its sign-in still opens
            // the old pages' dialog (weblogin.rs), signing in the cookies this page shares.
            Site::Netease => "https://music.163.com/st/webplayer",
            // The old qingting.fm address redirects here; the pages themselves are qtfm.cn's.
            Site::Qingting => "https://www.qtfm.cn/",
            Site::Douyin => "https://www.douyin.com/",
            Site::Kugou => "https://www.kugou.com/",
        }
    }

    /// Its WebView2 profile's folder, in WestPlay's data folder: one per site, so signing in to one doesn't
    /// sign in to (or out of) another.
    pub fn profile(self) -> &'static str {
        match self {
            Site::Bilibili => "webview2-bilibili",
            Site::QqMusic => "webview2-qq-music",
            Site::Netease => "webview2-netease",
            Site::Qingting => "webview2-qingting",
            Site::Douyin => "webview2-douyin",
            Site::Kugou => "webview2-kugou",
        }
    }

    /// What the host's log calls its WebView (`[bilibili] …`).
    pub fn log_name(self) -> &'static str {
        match self {
            Site::Bilibili => "bilibili",
            Site::QqMusic => "qq music",
            Site::Netease => "netease",
            Site::Qingting => "qingting",
            Site::Douyin => "douyin",
            Site::Kugou => "kugou",
        }
    }

    /// Its name on WestPlay's screen (the app's own name is the cabin language's: state/strings.ts).
    pub fn name(self) -> &'static str {
        match self {
            Site::Bilibili => "Bilibili",
            Site::QqMusic => "QQ Music",
            Site::Netease => "NetEase Cloud Music",
            Site::Qingting => "Qingting FM",
            Site::Douyin => "Douyin",
            Site::Kugou => "Kugou Music",
        }
    }

    /// `title`, the page's own, as the bar above shows it: one line, and without the site's own tail (Bilibili
    /// puts its name at the end of every video's).
    pub fn clean_title(self, title: &str) -> String {
        // Kugou Music's pages put the song, its singers and then the site's own boilerplate in the title,
        // separated by underscores ("寻诀_铁痕电台-MSR、Kkoori、钱润玉Runyu_高音质在线试听_寻诀歌词|歌曲下载_酷狗音乐"):
        // the bar keeps the song and who it's by, and its home is left as its own name.
        if matches!(self, Site::Kugou) {
            if title.starts_with("酷狗音乐") {
                return "酷狗音乐".to_owned();
            }
            let mut parts = title.split('_').filter(|part| !part.is_empty());
            let song = parts.next().unwrap_or_default().trim();
            let by = parts.next().unwrap_or_default();
            let by = by.split("高音质").next().unwrap_or_default().trim();
            return if by.is_empty() { song.to_owned() } else { format!("{song} · {by}") };
        }
        let title = match self {
            Site::Bilibili => {
                title.strip_suffix("_哔哩哔哩_bilibili").or_else(|| title.strip_suffix(" - 哔哩哔哩")).unwrap_or(title)
            }
            // Its pages end the title with the site's own name ("…-鬼点灯后传【周建龙演播】-蜻蜓FM听小说"): the app's
            // bar keeps the page's own part.
            Site::Qingting => {
                let tail = title.rfind("-蜻蜓FM").or_else(|| title.rfind("_蜻蜓FM"));
                tail.map_or(title, |at| &title[..at])
            }
            // QQ Music and NetEase leave their titles as they are: an artist's name is the page's own. Douyin's
            // clips end with the site's own name ("… - 抖音"), which its reader drops before the title is ever
            // given here (Kugou Music is read above).
            // (Kugou Music's is read above, before this.)
            Site::QqMusic | Site::Netease | Site::Kugou | Site::Douyin => title,
        };
        title.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// Its id, as the page sends it and the host says it back.
    pub fn id(self) -> &'static str {
        match self {
            Site::Bilibili => "bilibili",
            Site::QqMusic => "qqMusic",
            Site::Netease => "netease",
            Site::Qingting => "qingting",
            Site::Douyin => "douyin",
            Site::Kugou => "kugou",
        }
    }
}

/// What the cabin page asks of the web app (a `webApp` page message).
#[derive(Debug, PartialEq, serde::Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Command {
    /// The app opened on this site: its page, if it isn't running already (`start`). The host starts it.
    Open {
        site: Site,
    },
    /// Where the page shows, at this rectangle of the frame (pixels), under the cabin page: the app cuts
    /// itself open there.
    Show {
        x: f32,
        y: f32,
        width: u32,
        height: u32,
    },
    /// Show no page (the app left the screen; the page runs on, its sound too).
    Hide,
    Reload,
    /// Back to the site's home page.
    Home,
    /// Back in the page's history.
    Back,
    /// The dashboard's own controls, on the page's own buttons: playing or pausing, and the song either side.
    PlayPause,
    Next,
    Previous,
    /// The cabin's own volume slider, onto the page's sound (0: silent).
    SetVolume {
        volume: f64,
    },
    /// The cab's own quiet over the page's sound, while the truck reverses (owner 2026-11-03: Bilibili's volume
    /// fell not at all): held at `Some`'s level while the cab says so, the page's own volume back with `None`. It
    /// is the one volume a page whose player keeps its own volume takes — nothing is kept of it, and nothing is
    /// watched over (see `webapp.js`'s `ownVolume`/`hotkeyVolume`).
    DuckVolume {
        volume: Option<f64>,
    },
    /// The cabin's keyboard typing into the page's field: its text, whole (the page's field takes it as it is).
    SetText {
        text: String,
    },
    /// What the cabin's **own input method** picked, committed at the page's own caret through the browser's
    /// input pipeline (`Input.insertText`): a field our own DOM write can't reach — Bilibili's own components, a
    /// field React draws again — still takes it, and the page's own caret and selection do the work.
    InsertText {
        text: String,
    },
    /// A key of the cabin's keyboard with no text of its own (its return key, in the page's field).
    Enter,
    /// Done with the site: the WebView goes (signed in as it was: its profile stays).
    Close,
}

/// How the page is, as the cabin page hears it.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    /// The site's id (`Site::id`).
    pub site: &'static str,
    /// The page's own `<title>` (empty until the page has one).
    pub title: String,
    /// Whether the page can go back in its history.
    pub can_go_back: bool,
    /// A video of the page's in full screen: the cabin page then cuts itself open over the whole area, its app's
    /// bar and the rest of it out of the way.
    pub full_screen: bool,
    /// Whether the page is on show in the app (it has said how wide it lays out, and the app has it in view).
    /// The cabin page cuts itself open for the site only then: before that its own background covers the room,
    /// so the game's own navigation doesn't show through while the site loads.
    pub shown: bool,
}

/// What the page plays, as the site tells the system (its Media Session) and the page's own lyrics say: the
/// dashboard's Now Playing shows it as it shows WestPlay's own players.
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    /// The song's name.
    #[serde(default)]
    pub title: String,
    /// Who it's by.
    #[serde(default)]
    pub artist: String,
    /// Its cover, as the page gives it (a URL the cabin page loads itself).
    #[serde(default)]
    pub artwork: Option<String>,
    /// Whether it plays now.
    #[serde(default)]
    pub playing: bool,
    /// The line of its words the song is at, where the page has them.
    #[serde(default)]
    pub lyric: Option<String>,
}

/// What the page said since the last call.
#[derive(Clone, Debug, PartialEq)]
pub enum Report {
    /// The page's title (WebView2's own: the page's `<title>`), or its history (whether it can go back now):
    /// the app's state is fresh.
    State,
    /// A field of the page's has the keyboard's focus (the player's own keyboard then types into it, and the
    /// cabin's keyboard comes up on the screen), with the text it holds, or a field that had it lost it.
    Typing { on: bool, text: String },
    /// What the page plays (`Some`: a song, `None`: nothing any more).
    Media(Option<Media>),
    /// The music's spectrum, as the page measured it through the truck's speakers (`cab_sound.js`): the cab's
    /// Equalizer draws it behind its curve while it's open.
    Spectrum(Vec<u8>),
    /// The words its page has for what it plays, whole and with when each line is sung (`None`: none): the
    /// cabin's own lyrics view draws them, the line sung lit.
    Lyrics(Option<crate::lyrics::Lyrics>),
    /// Where in the song its page is (seconds), as it says: the lyrics view follows.
    LyricAt(f64),
    /// The page's sound's volume (0 to 1; a muted one reads 0): the cabin's own slider follows it.
    Volume(f64),
}

/// What the host tells a site's page of the cab (never the cabin page's to send): the truck's speakers (`None`:
/// as it is, a truck whose speakers aren't known), the driver's head, the camera outside (its distance, metres;
/// 0: not known), the cab's tone, and whether the music's spectrum is wanted. As Spotify's page is told
/// (spotify.rs): `cab_sound.js` makes the sound WestPlay plays come from the truck's own speakers.
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
enum Cab {
    Speakers {
        speakers: Option<Vec<Speaker>>,
    },
    Head {
        #[serde(flatten)]
        head: Head,
    },
    Outside {
        on: bool,
        distance: f32,
    },
    Equalizer {
        #[serde(flatten)]
        equalizer: Equalizer,
    },
    Spectrum {
        on: bool,
    },
}

/// What the page was told last of the cab (sent again to a page that loaded anew): the truck's speakers (none:
/// its sound as it is), and the speakers, head, camera, tone and spectrum messages.
#[derive(Debug, Default)]
struct Told {
    speakers: Option<Option<Vec<Speaker>>>,
    head: Option<Head>,
    camera: Option<(bool, f32)>,
    equalizer: Option<Equalizer>,
    spectrum: Option<bool>,
    messages: [Option<String>; 5],
}

/// A site's page, running.
pub struct WebApp {
    site: Site,
    view: OffscreenWebView,
    /// The stage's page size, the picture kept within it.
    frame: PageSize,
    /// The page's `<title>`, as WebView2 last gave it.
    title: Rc<RefCell<String>>,
    /// It changed since the last `take_reports`.
    titled: Rc<Cell<bool>>,
    /// A field's focus had the last say (the page's own).
    typing: Cell<bool>,
    /// Whether the page could go back, as last reported.
    back: Cell<bool>,
    /// What the page plays, as it last said.
    media: RefCell<Option<Media>>,
    /// The words its page has for it, as last said.
    lyrics: RefCell<Option<crate::lyrics::Lyrics>>,
    /// Its sound's volume, as last said (-1: not said yet).
    volume: Cell<f64>,
    /// Where the page shows (frame pixels), while the app shows it.
    placed: Cell<Option<(f32, f32, u32, u32)>>,
    /// The page's own zoom, as last set: its pixels against the frame's. The fit's own times the player's
    /// (`apply_zoom`).
    zoom: Cell<f64>,
    /// What the room the page reports asks for, before the player's own zoom (`fit_width`).
    fit: Cell<f64>,
    /// The player's own zoom as the wheel asks for it (`zoom_by`): 1.0 until they use it, kept across the pages
    /// of the site. The fit's own is on top of it.
    wanted_player_zoom: Cell<f64>,
    /// ...and as it is being shown: [`WebApp::tick`] settles it toward the wanted one every turn, so however
    /// coarsely the wheel counts arrive the zoom reads as one stepless motion.
    player_zoom: Cell<f64>,
    /// When that settling last ran, for how much of what's left a turn covers.
    settled_at: Cell<Instant>,
    /// The player's own zoom last written to the log (a whole gesture is one line, not one a notch).
    zoom_logged: Cell<f64>,
    /// The app has it in view (its `Show`, not yet its `Hide`).
    wanted: Cell<bool>,
    /// It has said how wide it lays out since it came into view: shown then, not before.
    fitted: Cell<bool>,
    /// When it came into view, while it hasn't said that.
    waiting: Cell<Option<Instant>>,
    /// A video of the page's in full screen: it takes the whole area WestPlay draws in.
    full_screen: Cell<bool>,
    /// Whether it was on show as last reported, to report the change (`State::shown`).
    last_shown: Cell<bool>,
    /// What the page was told of the cab, sent again when it loads anew.
    told: RefCell<Told>,
}

/// How long a page coming into view is given to say how wide it lays out, before it's shown as it is: a page of
/// the browser's own (an error page, `about:blank`) never says.
const FITTING: Duration = Duration::from_millis(1500);

/// The page's pixels never made smaller than this share of the frame's by the fit: below it its words stop
/// being readable at arm's length in the cab.
const LEAST_FIT: f64 = 0.55;
/// The fit never enlarges a page: one that fits is left at its own size, which keeps the zoom from swinging
/// between two values.
const MOST_FIT: f64 = 1.0;

/// The player's own zoom (the right Ctrl with the wheel over the page, [`WebApp::zoom_by`]): how much larger
/// count, and how far it may go. A notch of the wheel is 120 counts, so a notch is about 4% larger — fine
/// enough to stop anywhere, where a fixed step a notch jumped 10% at a time (the owner asked for stepless,
/// 2026-10-31). The small side goes below [`LEAST_FIT`], so a page already narrowed can be narrowed further
/// to see more of it at once.
const ZOOM_PER_COUNT: f64 = 0.00035;
const LEAST_PLAYER_ZOOM: f64 = 0.5;
const MOST_PLAYER_ZOOM: f64 = 2.0;
/// How fast the page catches up with the wheel ([`WebApp::tick`]): the share of what's left it covers a
/// second.
const ZOOM_SETTLE: f64 = 20.0;
/// The page's pixels as a whole (the fit's times the player's own) stay between these.
const LEAST_ZOOM: f64 = LEAST_FIT * LEAST_PLAYER_ZOOM;
const MOST_ZOOM: f64 = MOST_PLAYER_ZOOM;

/// The player's own zoom `counts` of wheel ask for, from the one it is at now: stepless, the counts
/// themselves moving it (a notch is 120), within [`LEAST_PLAYER_ZOOM`] and [`MOST_PLAYER_ZOOM`].
fn player_zoom_for(zoom: f64, counts: i32) -> f64 {
    (zoom * (1.0 + ZOOM_PER_COUNT * f64::from(counts))).clamp(LEAST_PLAYER_ZOOM, MOST_PLAYER_ZOOM)
}

/// The share of what's left of the player's own zoom a turn of `since` covers (`tick`): at most a quarter,
/// so a turn after a long gap (the app idle) doesn't jump.
fn zoom_share(since: Duration) -> f64 {
    (1.0 - (-ZOOM_SETTLE * since.as_secs_f64()).exp()).min(0.25)
}

impl WebApp {
    /// Opens `site` in a hidden WebView of `stage`'s frame (`width` x `height`), under the cabin page, on the
    /// WebView2 profile at `user_data` (a folder: one per site).
    pub fn start(stage: &Stage, site: Site, width: u32, height: u32, user_data: &Path) -> Result<Self, webview::Error> {
        let view = OffscreenWebView::new(stage, width, height, user_data)?;
        view.log_as(site.log_name())?;
        view.show(false)?;
        stage.add(&view, false)?;
        // Some sites serve a lesser page for WebView2's own User-Agent (it says "Edg"); one they don't know is
        // no reason not to open the site.
        let _ = view.set_user_agent(USER_AGENT);
        // A site's links that ask for a window of their own (a video, a sign-in): here, in this page.
        view.new_windows_here()?;
        // Where the site's page goes when it's clicked: a link that seems to do nothing is either no
        // navigation at all, or one to a page that couldn't be shown.
        view.watch_navigation()?;
        // The title before the page loads: none of its own yet.
        let title = Rc::new(RefCell::new(String::new()));
        let titled = Rc::new(Cell::new(false));
        let sink = title.clone();
        let changed = titled.clone();
        view.watch_title(move |page_title| {
            *sink.borrow_mut() = site.clean_title(&page_title);
            changed.set(true);
        })?;
        // The truck speakers' sound first: the page's script makes its own of it (cab_sound.js).
        view.add_startup_script(concat!(include_str!("cab_sound.js"), "\n", include_str!("webapp.js")))?;
        view.navigate(site.home())?;
        Ok(Self {
            site,
            view,
            frame: stage.page_size(),
            title,
            titled,
            typing: Cell::new(false),
            back: Cell::new(false),
            media: RefCell::new(None),
            lyrics: RefCell::new(None),
            volume: Cell::new(-1.0),
            placed: Cell::new(None),
            zoom: Cell::new(1.0),
            fit: Cell::new(1.0),
            wanted_player_zoom: Cell::new(1.0),
            player_zoom: Cell::new(1.0),
            settled_at: Cell::new(Instant::now()),
            zoom_logged: Cell::new(1.0),
            wanted: Cell::new(false),
            fitted: Cell::new(true),
            waiting: Cell::new(None),
            full_screen: Cell::new(false),
            last_shown: Cell::new(false),
            told: RefCell::default(),
        })
    }

    /// Its page's WebView2 environment: its profile's (a sign-in window on it is the page's own account,
    /// weblogin.rs).
    pub fn environment(&self) -> &ICoreWebView2Environment {
        self.view.environment()
    }

    pub fn site(&self) -> Site {
        self.site
    }

    /// Its WebView (the performance meter counts its processes, and the mouse goes to it where it shows).
    pub fn view(&self) -> &OffscreenWebView {
        &self.view
    }

    /// Carries out the page's command (`Open` is the caller's: [`WebApp::start`]; `Close` the caller's too).
    pub fn command(&self, command: &Command) -> windows::core::Result<()> {
        match command {
            Command::Open { .. } | Command::Close => Ok(()),
            Command::Show { x, y, width, height } => {
                let (x, y, width, height) = crate::youtube::within(self.frame.get(), *x, *y, *width, *height);
                // Coming into view from nothing: the page fits the room it has before it's seen, or the narrowing
                // would show as a jump a moment after it appeared (the owner's report, 2026-10-27).
                if self.placed.get().is_none() {
                    self.fitted.set(false);
                    self.waiting.set(Some(Instant::now()));
                }
                self.wanted.set(true);
                self.view.place(x, y, width, height)?;
                self.placed.set(Some((x, y, width, height)));
                self.reveal();
                Ok(())
            }
            Command::Hide => {
                self.wanted.set(false);
                self.placed.set(None);
                // The page's field lets the keyboard go (the app left the screen): its blur says the focus
                // went, and the game's keys are its own again.
                let _ = self.view.run_script(
                    "document.activeElement instanceof HTMLElement && document.activeElement.blur()",
                    |_| {},
                );
                self.view.show(false)
            }
            Command::Reload => {
                self.zoom_back();
                self.view.reload()
            }
            Command::Home => {
                self.zoom_back();
                self.view.navigate(self.site.home())
            }
            Command::Back => {
                self.zoom_back();
                self.view.back()
            }
            // The dashboard's own controls, on the page's own buttons (webapp.js presses them there). Each press is
            // one line in the log: the page's answer (`pressProbe`) says which of its ways it went, and this says
            // the card's press reached it at all (§62: a card whose 上一首/下一首 looked dead).
            Command::PlayPause => {
                crate::log!("webapp: {} the card says play/pause", self.site().name());
                self.view.post_json(r#"{"type":"webAppMedia","action":"playPause"}"#)
            }
            Command::Next => {
                crate::log!("webapp: {} the card says next", self.site().name());
                self.view.post_json(r#"{"type":"webAppMedia","action":"next"}"#)
            }
            Command::Previous => {
                crate::log!("webapp: {} the card says previous", self.site().name());
                self.view.post_json(r#"{"type":"webAppMedia","action":"previous"}"#)
            }
            Command::SetVolume { volume } => {
                let level = volume.clamp(0.0, 1.0);
                let message = serde_json::json!({ "type": "webAppMedia", "action": "setVolume", "volume": level });
                self.view.post_json(&message.to_string())
            }
            // The cab's own quiet (the truck reversing): held while it lasts, `None` letting the page's own back.
            Command::DuckVolume { volume } => {
                let level = volume.map(|level| level.clamp(0.0, 1.0));
                crate::log!("webapp: {} duck {}", self.site().name(), level.map_or("off".into(), |l| l.to_string()));
                let message = serde_json::json!({ "type": "webAppMedia", "action": "duckVolume", "volume": level });
                self.view.post_json(&message.to_string())
            }
            // The cabin's keyboard, into the page's own field.
            Command::SetText { text } => {
                self.view.post_json(&serde_json::json!({ "type": "webAppText", "text": text }).to_string())
            }
            // The cabin's own input method's pick, at the page's own caret, through the browser itself.
            Command::InsertText { text } => {
                let parameters = serde_json::json!({ "text": text }).to_string();
                self.view.devtools("Input.insertText", &parameters)
            }
            Command::Enter => self.view.post_json(r#"{"type":"webAppKey","key":"Enter"}"#),
        }
    }

    /// How the page is now, for the page above it.
    pub fn state(&self) -> State {
        State {
            site: self.site.id(),
            title: self.title.borrow().clone(),
            can_go_back: self.view.can_go_back(),
            full_screen: self.full_screen.get(),
            shown: self.page_shown(),
        }
    }

    /// Whether the page is on show: the app has it in view and it has said how wide it lays out (`reveal`).
    fn page_shown(&self) -> bool {
        self.wanted.get() && self.fitted.get()
    }

    /// The truck's speakers (none: the sound plays as it is, a truck whose speakers aren't known), the driver's
    /// head, and whether the camera is outside the cab and how far (metres; 0: not known), the cab's tone and
    /// the spectrum it wants: the page is told each as it changes, and plays its sound through the truck's own
    /// speakers (`cab_sound.js`, as Apple Music's and Spotify's pages do).
    pub fn cab(
        &self,
        speakers: Option<&[Speaker]>,
        head: Head,
        outside: bool,
        distance: f32,
        equalizer: Equalizer,
        spectrum: bool,
    ) -> windows::core::Result<()> {
        let mut told = self.told.borrow_mut();
        // The head first: the speakers' loudness is set from where it is as they're placed.
        if told.head != Some(head) && head.is_sound() {
            told.head = Some(head);
            let message = serde_json::to_string(&Cab::Head { head }).unwrap_or_default();
            told.messages[1] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.speakers.as_ref().map(Option::as_deref) != Some(speakers) {
            let speakers = speakers.map(<[_]>::to_vec);
            told.speakers = Some(speakers.clone());
            let message = serde_json::to_string(&Cab::Speakers { speakers }).unwrap_or_default();
            told.messages[0] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        let camera = (outside, if outside { (distance * 4.0).round() / 4.0 } else { 0.0 });
        if told.camera != Some(camera) && camera.1.is_finite() {
            told.camera = Some(camera);
            let message = serde_json::to_string(&Cab::Outside { on: camera.0, distance: camera.1 }).unwrap_or_default();
            told.messages[2] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.equalizer != Some(equalizer) {
            told.equalizer = Some(equalizer);
            let message = serde_json::to_string(&Cab::Equalizer { equalizer }).unwrap_or_default();
            told.messages[3] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        if told.spectrum != Some(spectrum) {
            told.spectrum = Some(spectrum);
            let message = serde_json::to_string(&Cab::Spectrum { on: spectrum }).unwrap_or_default();
            told.messages[4] = Some(message.clone());
            self.view.post_json(&message)?;
        }
        Ok(())
    }

    /// What the page said since the last call, oldest first.
    pub fn take_reports(&self) -> Vec<Report> {
        let mut reports = Vec::new();
        // A page that hasn't said how wide it lays out in the time it's given (one of the browser's own, or a
        // script of its own that never ran) is shown as it is rather than kept hidden for good.
        if self.wanted.get()
            && !self.fitted.get()
            && self.waiting.get().is_some_and(|since| since.elapsed() > FITTING)
        {
            self.fitted.set(true);
            self.waiting.set(None);
            self.reveal();
        }
        // On show, or no longer: the cabin page cuts itself open for the site only then (its own background
        // covers the room before that, so the game's screen doesn't show through while the site loads).
        let shown = self.page_shown();
        if shown != self.last_shown.replace(shown) {
            reports.push(Report::State);
        }
        let can_go_back = self.view.can_go_back();
        if self.titled.replace(false) || can_go_back != self.back.replace(can_go_back) {
            reports.push(Report::State);
        }
        for message in self.view.take_page_messages() {
            // The music's spectrum, as the page measured it for the cab's Equalizer (cab_sound.js).
            if let Some(bars) = crate::speakers::read_spectrum(&message) {
                reports.push(Report::Spectrum(bars));
                continue;
            }
            let said = serde_json::from_str::<serde_json::Value>(&message).ok();
            // A page loaded anew (or a site's own router): the cab as it is, for the sound it plays through the
            // truck's speakers (told each as it changed since, and lost with the page's own script).
            if said.as_ref().and_then(|said| said.get("ready")).and_then(serde_json::Value::as_bool) == Some(true) {
                for message in self.told.borrow().messages.iter().flatten() {
                    let _ = self.view.post_json(message);
                }
            }
            let typing = said
                .as_ref()
                .and_then(|said| said.get("typing"))
                .and_then(serde_json::Value::as_bool);
            if let Some(typing) = typing {
                // A field taking the focus again (the player clicked it again) is a new selection too: the
                // game's keys type again after the truck stopped, though the field never let the focus go.
                let changed = typing != self.typing.replace(typing);
                if typing || changed {
                    let text = said
                        .as_ref()
                        .and_then(|said| said.get("text"))
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default()
                        .to_owned();
                    reports.push(Report::Typing { on: typing, text });
                }
            }
            // What the page plays: a song, or nothing any more (the page stopped saying one).
            // PROBE: what the page's own script failed at (its page came up blank).
        if let Some(probe) = said.as_ref().and_then(|said| said.get("sayProbe")) {
            log!("webapp: SAY {}", probe.as_str().unwrap_or(""));
        }
        if let Some(problem) = said.as_ref().and_then(|said| said.get("pageError")) {
            log!("webapp: PAGE ERROR {}", problem.as_str().unwrap_or(""));
        }
if let Some(media) = said.as_ref().and_then(|said| said.get("media")) {
                let read = if media.is_null() {
                    Some(None)
                } else {
                    serde_json::from_value::<Media>(media.clone()).ok().map(Some)
                };
                if let Some(media) = read
                    && media != *self.media.borrow()
                {
                    *self.media.borrow_mut() = media.clone();
                    reports.push(Report::Media(media));
                }
            }
            // The words its page has for what it plays, whole (its own lyrics view cuts them into lines), and
            // where in the song it is now: the cabin's lyrics view draws them as it follows.
            if let Some(lines) = said
                .as_ref()
                .and_then(|said| said.get("lyricLines"))
                .and_then(serde_json::Value::as_array)
            {
                let lines: Vec<crate::lyrics::Line> = lines
                    .iter()
                    .filter_map(|line| {
                        Some(crate::lyrics::Line {
                            start: line.get("at")?.as_f64()?,
                            end: 0.0,
                            text: line.get("words")?.as_str()?.to_owned(),
                            stanza: false,
                        })
                    })
                    .collect();
                let lyrics = (!lines.is_empty())
                    .then(|| crate::lyrics::Lyrics { synced: true, lines, ..Default::default() }.checked());
                if lyrics != *self.lyrics.borrow() {
                    *self.lyrics.borrow_mut() = lyrics.clone();
                    reports.push(Report::Lyrics(lyrics));
                }
            }
            if let Some(at) = said
                .as_ref()
                .and_then(|said| said.get("lyricAt"))
                .and_then(serde_json::Value::as_f64)
            {
                reports.push(Report::LyricAt(at));
            }
            // The page's own sound's volume, as its own bar or the cabin's slider left it.
            if let Some(level) = said
                .as_ref()
                .and_then(|said| said.get("volume"))
                .and_then(serde_json::Value::as_f64)
            {
                let level = level.clamp(0.0, 1.0);
                if level != self.volume.replace(level) {
                    reports.push(Report::Volume(level));
                }
            }
            // A video gone full screen in the page (or come back out): the cabin page cuts itself open over the
            // whole area then, its bar and the rest of the app out of the way (`State::full_screen`).
            if let Some(on) = said
                .as_ref()
                .and_then(|said| said.get("fullScreen"))
                .and_then(serde_json::Value::as_bool)
                && on != self.full_screen.replace(on)
            {
                reports.push(Report::State);
            }
            // The room the page has against the width it lays out in: one laid out for a desktop is wider than
            // this screen, and its pixels go smaller until all of it shows (`fit_width`).
            if let Some(room) = said.as_ref().and_then(|said| said.get("room"))
                && let (Some(seen), Some(needed)) = (
                    room.get("seen").and_then(serde_json::Value::as_f64),
                    room.get("needed").and_then(serde_json::Value::as_f64),
                )
            {
                self.fit_width(seen, needed);
                // Fitted: it can be seen now (and is, if the app wants it in view).
                self.fitted.set(true);
                self.waiting.set(None);
                self.reveal();
            }
            // What the page said about its words and its own markup: the log's, for reading the next shape
            // of a site's page from (`webapp.js`).
            for key in [
                "lyricProbe",
                "mediaProbe",
                "domProbe",
                "stateProbe",
                "biliProbe",
                "apiProbe",
                "buttonProbe",
                "pressProbe",
                "textProbe",
                "submitProbe",
            ] {
                if let Some(said) = said.as_ref().and_then(|said| said.get(key)).and_then(serde_json::Value::as_str) {
                    crate::log!("webapp: {key}: {said}");
                }
            }
        }
        reports
    }

    /// The player's own keyboard's keys, for the page's focused field (`webapp.js` types them there).
    pub fn type_message(&self, message: &str) -> windows::core::Result<()> {
        self.view.post_json(message)
    }

    /// Where the page shows (frame pixels), if it shows (the app's `Show` placed it).
    pub fn place(&self) -> Option<(f32, f32, u32, u32)> {
        self.placed.get()
    }

    /// Whether the WebView failed since the last call (it's then closed and started again when needed).
    pub fn failed(&self) -> bool {
        self.view.take_failure().is_some()
    }

    /// Takes the WebView off the frame; it closes as it's dropped.
    pub fn close(self, stage: &Stage) {
        let _ = stage.remove(&self.view);
    }

    /// The page's own pixels again: another page on it may not need the room this one did (`fit_width`). The
    /// player's own zoom stays: it's their choice, not that page's.
    fn zoom_back(&self) {
        self.fit.set(MOST_FIT);
        self.apply_zoom();
    }

    /// Sets the page's zoom to what the room asks for with the player's own on top, if that's a change:
    /// whether it went out.
    fn apply_zoom(&self) -> bool {
        let wanted = (self.fit.get() * self.player_zoom.get()).clamp(LEAST_ZOOM, MOST_ZOOM);
        if (wanted - self.zoom.get()).abs() < 0.005 {
            return false;
        }
        if self.view.set_zoom(wanted).is_ok() {
            self.zoom.set(wanted);
            true
        } else {
            false
        }
    }

    /// The player's own zoom on the page, from the wheel with the right Ctrl held over it (`pointer::Mouse::zoom`):
    /// `counts` of wheel, positive away from the player (the page's pixels larger), negative towards them
    /// (smaller). A notch of the wheel is 120 counts.
    ///
    /// Stepless: the zoom asked for follows the counts themselves — a wheel reporting part of a notch moves it
    /// part of the way, and a notch is a small enough share that it can be stopped anywhere (the owner asked
    /// for it, 2026-10-31). The page then settles there smoothly ([`WebApp::tick`]), rather than jumping a
    /// fixed factor a notch.
    ///
    /// Kept across the pages of the site (a page they've zoomed in on reads as they left it when they come
    /// back), and the fit's own is on top of it. Zoomed in, the page may be wider than the room and its right
    /// side out of sight, as page zoom does anywhere: the fit doesn't narrow it back, or the player's own zoom
    /// would never take.
    pub fn zoom_by(&self, counts: i32) {
        if counts == 0 {
            return;
        }
        let asked = player_zoom_for(self.wanted_player_zoom.get(), counts);
        if (asked - self.wanted_player_zoom.get()).abs() < 1e-6 {
            return;
        }
        self.wanted_player_zoom.set(asked);
    }

    /// Settles the page's own zoom toward what the wheel asked for, and says so once it's there: called every
    /// turn of the host's loop (`lib.rs`). A share of what's left each turn, by how long that turn was, so the
    /// motion is the same however fast the loop runs; at most a quarter a turn, so a gap (the app idle) doesn't
    /// jump. This is what makes the zoom read as stepless, however coarsely the wheel counts.
    pub fn tick(&self, now: Instant) {
        let wanted = self.wanted_player_zoom.get();
        let shown = self.player_zoom.get();
        let since = now.saturating_duration_since(self.settled_at.get());
        self.settled_at.set(now);
        let left = wanted - shown;
        if left.abs() < 0.0005 {
            // There: a whole gesture is one line in the log, not one a notch the wheel turned.
            if self.zoom_logged.replace(wanted) != wanted {
                crate::log!(
                    "webapp: the player's own zoom {:.2}x: the page's pixels are {:.2} the frame's (1.00 is its own size)",
                    wanted,
                    self.zoom.get()
                );
            }
            return;
        }
        let share = zoom_share(since);
        let next = shown + left * share;
        let next = if (wanted - next).abs() < 0.0005 { wanted } else { next };
        self.player_zoom.set(next);
        self.apply_zoom();
    }

    /// In view when the app wants it there and it has fitted its room: a page narrowed a moment after it appeared
    /// would be seen to jump, which is what the owner asked to be rid of (2026-10-27).
    fn reveal(&self) {
        let _ = self.view.show(self.wanted.get() && self.fitted.get());
    }

    /// The page's pixels made as much smaller than the frame's as its width needs, so a page laid out for a
    /// desktop shows whole on the cabin's 1280-wide screen instead of being cut off at the right with nothing to
    /// drag it across (the owner's report, 2026-10-27: QQ Music's player, wider than the app's area).
    ///
    /// `seen` and `needed` are the page's own numbers (webapp.js): the room it has and the width it lays out in,
    /// both in its pixels at the zoom it's at now — so their ratio is the zoom it takes to fit. Narrowed only:
    /// a page that fits is left at its own size, which keeps the zoom from swinging between two values.
    fn fit_width(&self, seen: f64, needed: f64) {
        if seen <= 0.0 || needed <= 0.0 {
            return;
        }
        // The player's own zoom, larger: theirs, and the fit doesn't narrow it back (a page laid out wider
        // than the room then, as page zoom leaves it, and one they can narrow again with the wheel).
        if self.player_zoom.get() > 1.0 {
            return;
        }
        let ratio = seen / needed;
        // What fits, and a little over (a scrollbar's worth), takes no narrowing.
        if ratio >= 0.97 {
            return;
        }
        let fit = (self.fit.get() * ratio).clamp(LEAST_FIT, MOST_FIT);
        if (fit - self.fit.get()).abs() < 0.02 {
            return;
        }
        self.fit.set(fit);
        if self.apply_zoom() {
            crate::log!(
                "webapp: the page lays out {} px wide in {} px, so its pixels are {:.2} the frame's",
                needed.round(),
                seen.round(),
                self.zoom.get()
            );
        }
    }
}

/// `{"type":"webApp","state":{…}}`: the site the app shows and its page's title (`null`: none running).
pub fn state_message(state: Option<&State>) -> String {
    serde_json::json!({ "type": "webApp", "state": state }).to_string()
}

/// `{"type":"webAppMedia","media":{…}}`: what the page plays, for the dashboard's Now Playing (`null`: nothing).
pub fn media_message(media: Option<&Media>) -> String {
    serde_json::json!({ "type": "webAppMedia", "media": media }).to_string()
}

/// `{"type":"webAppLyrics","lyrics":{…}}`: the words its page has for what it plays, for the cabin's own
/// lyrics view (`null`: none).
pub fn lyrics_message(lyrics: Option<&crate::lyrics::Lyrics>) -> String {
    serde_json::json!({ "type": "webAppLyrics", "lyrics": lyrics }).to_string()
}

/// `{"type":"webAppLyricAt","at":12.3}`: where in the song its page is, for the cabin's own lyrics view.
pub fn lyric_at_message(at: f64) -> String {
    serde_json::json!({ "type": "webAppLyricAt", "at": at }).to_string()
}

/// `{"type":"webAppVolume","volume":0.6}`: the page's own sound's volume (0 to 1), for the cabin's slider.
pub fn volume_message(volume: f64) -> String {
    serde_json::json!({ "type": "webAppVolume", "volume": volume }).to_string()
}

/// `{"type":"webAppTyping",…}`: the page's own field, for the cabin's keyboard — whether one has the focus, the
/// text it holds, and which selection it is (a number that changes each time one takes the focus, so a field
/// clicked again brings the keyboard up again).
pub fn typing_message(on: bool, text: &str, selection: u32) -> String {
    serde_json::json!({ "type": "webAppTyping", "on": on, "text": text, "selection": selection }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_wheel_zooms_the_page_steplessly_by_its_own_counts() {
        // A notch of the wheel is 120 counts: about 4% larger, not a fixed step (it used to be 10%).
        assert!((player_zoom_for(1.0, 120) - 1.042).abs() < 0.002, "{}", player_zoom_for(1.0, 120));
        // Part of a notch — a high-resolution wheel, a touchpad, a flick — moves it part of the way: that's
        // what makes it stepless rather than a row of fixed steps.
        assert!((player_zoom_for(1.0, 12) - 1.0042).abs() < 0.0005);
        assert!((player_zoom_for(1.0, -12) - 0.9958).abs() < 0.0005);
        // However far the wheel turns, within what the player may zoom to.
        assert_eq!(player_zoom_for(1.0, 100_000), MOST_PLAYER_ZOOM);
        assert_eq!(player_zoom_for(1.0, -100_000), LEAST_PLAYER_ZOOM);
        // And a notch back the other way roughly undoes it.
        assert!((player_zoom_for(player_zoom_for(1.0, 120), -120) - 1.0).abs() < 0.002);
    }

    #[test]
    fn the_page_settles_toward_the_wheel_without_jumping() {
        // A turn of the usual length covers a few tenths of what's left: a smooth motion over a few turns.
        let sixteen_ms = zoom_share(Duration::from_millis(16));
        assert!((0.2..=0.25).contains(&sixteen_ms), "{sixteen_ms}");
        // A longer gap (a slow loop, the app idle) is capped, so the page never jumps to the wheel's end.
        assert_eq!(zoom_share(Duration::from_secs(2)), 0.25);
        // No time at all: nothing.
        assert!(zoom_share(Duration::ZERO) < 1e-9);
    }

    #[test]
    fn reads_the_pages_commands() {
        let read = |text: &str| serde_json::from_str::<Command>(text).ok();
        assert_eq!(read(r#"{"action":"open","site":"bilibili"}"#), Some(Command::Open { site: Site::Bilibili }));
        assert_eq!(read(r#"{"action":"open","site":"qingting"}"#), Some(Command::Open { site: Site::Qingting }));
        assert_eq!(read(r#"{"action":"open","site":"douyin"}"#), Some(Command::Open { site: Site::Douyin }));
        assert_eq!(read(r#"{"action":"open","site":"kugou"}"#), Some(Command::Open { site: Site::Kugou }));
        assert_eq!(
            read(r#"{"action":"show","x":170,"y":32,"width":1080,"height":630}"#),
            Some(Command::Show { x: 170.0, y: 32.0, width: 1080, height: 630 })
        );
        assert_eq!(read(r#"{"action":"hide"}"#), Some(Command::Hide));
        assert_eq!(read(r#"{"action":"close"}"#), Some(Command::Close));
        // What the cabin's own input method commits, and the keyboard's whole-text writes beside it (both must
        // reach their own arm: `Open | Close` is the match's first, and a variant put there is dropped).
        assert_eq!(
            read(r#"{"action":"insertText","text":"你好"}"#),
            Some(Command::InsertText { text: "你好".into() })
        );
        assert_eq!(read(r#"{"action":"setText","text":"ab"}"#), Some(Command::SetText { text: "ab".into() }));
        assert_eq!(
            read(r#"{"action":"duckVolume","volume":0.15}"#),
            Some(Command::DuckVolume { volume: Some(0.15) })
        );
        // The cab lets go: the page's own volume is back.
        assert_eq!(read(r#"{"action":"duckVolume","volume":null}"#), Some(Command::DuckVolume { volume: None }));
        // A site this host doesn't know (a newer UI): nothing.
        assert_eq!(read(r#"{"action":"open","site":"lastfm"}"#), None);
    }

    #[test]
    fn each_site_is_its_own_page_and_profile() {
        let sites = [Site::Bilibili, Site::QqMusic, Site::Netease, Site::Qingting, Site::Douyin, Site::Kugou];
        for (index, site) in sites.iter().enumerate() {
            assert!(site.home().starts_with("https://"));
            for other in &sites[index + 1..] {
                assert_ne!(site.home(), other.home());
                assert_ne!(site.profile(), other.profile());
                assert_ne!(site.id(), other.id());
                assert_ne!(site.name(), other.name());
            }
        }
    }

    #[test]
    fn kugou_titles_keep_the_song_and_its_singers() {
        assert_eq!(
            Site::Kugou.clean_title("寻诀_铁痕电台-MSR、Kkoori、钱润玉Runyu_高音质在线试听_寻诀歌词|歌曲下载_酷狗音乐"),
            "寻诀 · 铁痕电台-MSR、Kkoori、钱润玉Runyu"
        );
        assert_eq!(Site::Kugou.clean_title("酷狗音乐 - 就是歌多！小说相声也很多！"), "酷狗音乐");
        assert_eq!(Site::Kugou.clean_title("寻诀"), "寻诀");
    }

    #[test]
    fn a_title_is_one_line_without_the_sites_tail() {
        assert_eq!(Site::Bilibili.clean_title("【4K】A video_哔哩哔哩_bilibili"), "【4K】A video");
        assert_eq!(Site::Bilibili.clean_title("A video - 哔哩哔哩"), "A video");
        assert_eq!(
            Site::Bilibili.clean_title("哔哩哔哩 (゜-゜)つロ 干杯~-bilibili"),
            "哔哩哔哩 (゜-゜)つロ 干杯~-bilibili"
        );
        // Qingting FM's own tail goes, the channel it keeps: its page names the site after the program's channel.
        assert_eq!(
            Site::Qingting.clean_title("诡吹灯续·四部合集 片花-鬼点灯后传【周建龙演播】-蜻蜓FM听小说"),
            "诡吹灯续·四部合集 片花-鬼点灯后传【周建龙演播】"
        );
        assert_eq!(Site::Qingting.clean_title("A station_蜻蜓FM"), "A station");
        // An artist's name is the page's own: nothing of it dropped.
        assert_eq!(Site::QqMusic.clean_title("A song - An artist - QQ音乐"), "A song - An artist - QQ音乐");
        assert_eq!(Site::Netease.clean_title("  A song\n- An artist  "), "A song - An artist");
    }

    #[test]
    fn says_whether_the_page_shows() {
        let message = state_message(Some(&State {
            site: "bilibili",
            title: "【4K】Test_哔哩哔哩_bilibili".into(),
            can_go_back: true,
            full_screen: true,
            shown: true,
        }));
        assert_eq!(
            message,
            r#"{"state":{"canGoBack":true,"fullScreen":true,"shown":true,"site":"bilibili","title":"【4K】Test_哔哩哔哩_bilibili"},"type":"webApp"}"#
        );
        assert_eq!(state_message(None), r#"{"state":null,"type":"webApp"}"#);
    }

    #[test]
    fn reads_what_the_page_plays() {
        let media = serde_json::from_str::<Media>(
            r#"{"title":"晴天","artist":"周杰伦","artwork":"https://y.gtimg.cn/a.jpg","playing":true,"lyric":"故事的小黄花"}"#,
        )
        .expect("a song");
        assert_eq!(media.title, "晴天");
        assert_eq!(media.artist, "周杰伦");
        assert_eq!(media.artwork.as_deref(), Some("https://y.gtimg.cn/a.jpg"));
        assert_eq!(media.lyric.as_deref(), Some("故事的小黄花"));
        assert!(media.playing);

        // A page saying only what plays: no cover, no words, not playing.
        let bare = serde_json::from_str::<Media>(r#"{"title":"A song","artist":"Someone"}"#).expect("a song");
        assert_eq!((bare.artwork, bare.lyric, bare.playing), (None, None, false));

        let message = media_message(Some(&media));
        assert!(message.contains(r#""type":"webAppMedia""#), "{message}");
        assert!(message.contains("晴天"), "{message}");
        // Nothing playing any more: the cabin stops showing it.
        assert_eq!(media_message(None), r#"{"media":null,"type":"webAppMedia"}"#);

        // Its words, whole and timed, and where in the song it is: the cabin's own lyrics view's.
        let said = crate::lyrics::Lyrics {
            synced: true,
            lines: vec![crate::lyrics::Line { start: 1.5, end: 0.0, text: "one".into(), stanza: false }],
            ..Default::default()
        };
        let message = lyrics_message(Some(&said));
        assert!(message.contains(r#""type":"webAppLyrics""#), "{message}");
        assert!(message.contains(r#""start":1.5"#), "{message}");
        assert_eq!(lyrics_message(None), r#"{"lyrics":null,"type":"webAppLyrics"}"#);
        assert_eq!(lyric_at_message(12.5), r#"{"at":12.5,"type":"webAppLyricAt"}"#);
    }
}
