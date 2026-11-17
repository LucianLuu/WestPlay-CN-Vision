//! Signing in to the sites the WebApp apps show (Bilibili, QQ Music, NetEase Cloud Music): each its own page in
//! a window of WestPlay's on the PC's desktop (a real keyboard, out of the game), on the WebView2 profile the
//! app's page in the cabin uses (`webapp::Site::profile`), so the sign-in is that app's too. Nothing of the
//! account passes through WestPlay: the page is the site's, and what it keeps (its cookies) is WebView2's, as a
//! browser's would be.
//!
//! Two of the three say nothing by their address (their sign-in is a dialog on the page itself): a script in the
//! page says when it's signed in (`page_says`, as Apple Music's does in `signin.rs`). Bilibili's sign-in is a
//! page of its own, which comes back to Bilibili once done. Signing out is the site's own page for it, which the
//! player closes when it's done.

use std::cell::{Cell, RefCell};
use std::path::{Path, PathBuf};

use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment;

use crate::signin::{self, Progress, SignInWindow};
use crate::webapp;
use crate::AccountAction;

/// QQ Music's sign-in: a dialog of its own page, which says so once signed in.
/// The `?noplayer=1` keeps the bundled full-list extension from swapping this entry page for its own player.
const QQ_MUSIC: signin::Site = signin::Site {
    sign_in: "https://y.qq.com/?noplayer=1",
    title: "Sign in to QQ Music - WestPlay",
    home: "https://y.qq.com/",
    not_yet: None,
    page_says: Some(include_str!("qq_music_sign_in.js")),
};

/// QQ Music's signing out: its own page for it (the player closes the window when done).
const QQ_MUSIC_OUT: signin::Site = signin::Site {
    sign_in: "https://y.qq.com/portal/profile.html",
    title: "Sign out of QQ Music - WestPlay",
    home: "https://y.qq.com/",
    not_yet: None,
    page_says: Some("/* signing out: the window closing says it's done */"),
};

/// NetEase Cloud Music's sign-in: a dialog of its own page, which says so once signed in.
const NETEASE: signin::Site = signin::Site {
    sign_in: "https://music.163.com/",
    title: "Sign in to NetEase Cloud Music - WestPlay",
    home: "https://music.163.com/",
    not_yet: None,
    page_says: Some(include_str!("netease_sign_in.js")),
};

/// NetEase Cloud Music's signing out: its own page for it.
const NETEASE_OUT: signin::Site = signin::Site {
    sign_in: "https://music.163.com/logout",
    title: "Sign out of NetEase Cloud Music - WestPlay",
    home: "https://music.163.com/",
    not_yet: None,
    page_says: Some("/* signing out: the window closing says it's done */"),
};

/// Bilibili's sign-in: a page of its own (passport), coming back to Bilibili once signed in.
const BILIBILI: signin::Site = signin::Site {
    sign_in: "https://passport.bilibili.com/login?gourl=https%3A%2F%2Fwww.bilibili.com%2F",
    title: "Sign in to Bilibili - WestPlay",
    home: "https://www.bilibili.com/",
    not_yet: None,
    page_says: None,
};

/// Bilibili's signing out: its own page for it.
const BILIBILI_OUT: signin::Site = signin::Site {
    sign_in: "https://passport.bilibili.com/logout",
    title: "Sign out of Bilibili - WestPlay",
    home: "https://www.bilibili.com/",
    not_yet: None,
    page_says: Some("/* signing out: the window closing says it's done */"),
};

/// Which of the three sites.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Site {
    Bilibili,
    QqMusic,
    Netease,
}

impl Site {
    pub const ALL: [Site; 3] = [Site::Bilibili, Site::Netease, Site::QqMusic];

    /// The app in the cabin whose page it is (`webapp.rs`).
    pub fn app(self) -> webapp::Site {
        match self {
            Site::Bilibili => webapp::Site::Bilibili,
            Site::QqMusic => webapp::Site::QqMusic,
            Site::Netease => webapp::Site::Netease,
        }
    }

    /// Its sign-in page, in a window on the desktop.
    fn sign_in(self) -> &'static signin::Site {
        match self {
            Site::Bilibili => &BILIBILI,
            Site::QqMusic => &QQ_MUSIC,
            Site::Netease => &NETEASE,
        }
    }

    /// Its own page to sign out on.
    fn sign_out(self) -> &'static signin::Site {
        match self {
            Site::Bilibili => &BILIBILI_OUT,
            Site::QqMusic => &QQ_MUSIC_OUT,
            Site::Netease => &NETEASE_OUT,
        }
    }

    fn index(self) -> usize {
        match self {
            Site::Bilibili => 0,
            Site::QqMusic => 1,
            Site::Netease => 2,
        }
    }

    /// Its id in the status (`Logins`' field names).
    fn id(self) -> &'static str {
        match self {
            Site::Bilibili => "bilibili",
            Site::QqMusic => "qqMusic",
            Site::Netease => "netease",
        }
    }
}

/// One site's sign-in, for the companion's status.
#[derive(Clone, Copy, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Login {
    /// Whether it's signed in (`None`: not known, nothing asked of it this run).
    pub signed_in: Option<bool>,
    /// Its window is open on the desktop (signing in, out, or its page to look at).
    pub signing_in: bool,
}

/// The three, as the companion shows them.
#[derive(Clone, Copy, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Logins {
    pub bilibili: Login,
    pub qq_music: Login,
    pub netease: Login,
}

/// What a window did since the last call: a sign-in done (the app's page loads again, signed in), a sign-out
/// done, or just closed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Done {
    SignedIn,
    SignedOut,
    Closed,
}

/// The three sites' sign-ins, as they are this run: their windows (one at a time each), and whether each is
/// signed in.
pub struct WebLogins {
    data_dir: PathBuf,
    windows: [RefCell<Option<SignInWindow>>; 3],
    /// Whether the window open is a sign-out window (`false`: a sign-in).
    signing_out: [Cell<bool>; 3],
    signed_in: [Cell<bool>; 3],
    /// It was asked to sign in or out this run (before that, whether it's signed in isn't known).
    asked: [Cell<bool>; 3],
    /// The cookie string the sign-in window's page sent when it said it's signed in, last one per site.
    last_cookies: [RefCell<Option<String>>; 3],
}

impl WebLogins {
    /// The sign-ins of `data_dir`'s WebView2 profiles (those the apps' pages use: `webapp::Site::profile`).
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.to_path_buf(),
            windows: Default::default(),
            signing_out: Default::default(),
            signed_in: Default::default(),
            asked: Default::default(),
            last_cookies: Default::default(),
        }
    }

    /// Carries out the companion's request: its sign-in page in a window on the desktop, or its page to sign out
    /// on. A window already open is brought to the front. `environment` is the site's page running in the cabin
    /// (WebView2's own page cookies then, no second environment on its profile), where it is.
    pub fn command(&self, which: Site, action: AccountAction, environment: Option<&ICoreWebView2Environment>) {
        match action {
            AccountAction::SignIn => self.open(which, false, environment),
            AccountAction::SignOut => self.open(which, true, environment),
            // Its page can't say without being opened: nothing to carry out.
            AccountAction::Check => {}
        }
    }

    fn open(&self, which: Site, out: bool, open_in: Option<&ICoreWebView2Environment>) {
        let index = which.index();
        if let Some(window) = self.windows[index].borrow().as_ref() {
            window.bring_forward();
            return;
        }
        let environment = match open_in {
            Some(environment) => environment.clone(),
            None => {
                let user_data = self.data_dir.join(which.app().profile());
                match crate::webview::environment_for(&user_data) {
                    Ok(environment) => environment,
                    Err(e) => {
                        log!("[{}] its sign-in window can't open: {e}", which.id());
                        return;
                    }
                }
            }
        };
        let site = if out { which.sign_out() } else { which.sign_in() };
        match SignInWindow::open(&environment, site) {
            Ok(window) => {
                self.signing_out[index].set(out);
                *self.windows[index].borrow_mut() = Some(window);
                log!("[{}] {} window open: {}", which.id(), if out { "sign-out" } else { "sign-in" }, site.sign_in);
            }
            Err(e) => log!("[{}] its sign-in window can't open: {e}", which.id()),
        }
    }

    /// Where the windows are at since the last call (each taken off the list as it's done with).
    pub fn take_reports(&self) -> Vec<(Site, Done)> {
        let mut done = Vec::new();
        for which in Site::ALL {
            let index = which.index();
            let Some(progress) = self.windows[index].borrow().as_ref().map(SignInWindow::progress) else {
                continue;
            };
            if !matches!(progress, Progress::SignedIn | Progress::Closed) {
                continue;
            }
            // Take the page's cookie string before the window goes away.
            let cookies = self.windows[index].borrow().as_ref().and_then(SignInWindow::take_cookies);
            self.windows[index].borrow_mut().take();
            let out = self.signing_out[index].replace(false);
            let done_with = match (progress, out) {
                (Progress::SignedIn, false) => {
                    self.signed_in[index].set(true);
                    Done::SignedIn
                }
                (_, true) => {
                    self.signed_in[index].set(false);
                    Done::SignedOut
                }
                _ => Done::Closed,
            };
            self.asked[index].set(true);
            if matches!(done_with, Done::SignedIn) {
                log!(
                    "[{}] cookies taken: {}",
                    which.id(),
                    cookies.as_deref().map_or("none".to_owned(), |c| format!("{} chars", c.len()))
                );
                *self.last_cookies[index].borrow_mut() = cookies;
            }
            log!("[{}] {}", which.id(), match done_with {
                Done::SignedIn => "signed in",
                Done::SignedOut => "signed out",
                Done::Closed => "its window closed",
            });
            done.push((which, done_with));
        }
        done
    }

    /// The cookie string captured when `which` signed in last this run (`None`: none taken yet).
    pub fn take_cookies(&self, which: Site) -> Option<String> {
        self.last_cookies[which.index()].borrow_mut().take()
    }

    /// The three, as the companion shows them.
    pub fn state(&self) -> Logins {
        let login = |which: Site| Login {
            signed_in: self.asked[which.index()].get().then(|| self.signed_in[which.index()].get()),
            signing_in: self.windows[which.index()].borrow().is_some(),
        };
        Logins {
            bilibili: login(Site::Bilibili),
            qq_music: login(Site::QqMusic),
            netease: login(Site::Netease),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Each of the three has its own site in the cabin, its own sign-in page, and its own profile (signing in
    /// to one is not signing in to another).
    #[test]
    fn each_site_is_its_own() {
        for (i, site) in Site::ALL.iter().enumerate() {
            for other in &Site::ALL[i + 1..] {
                assert_ne!(site.app().profile(), other.app().profile(), "{site:?} and {other:?}");
                assert_ne!(site.sign_in().sign_in, other.sign_in().sign_in);
                assert_ne!(site.id(), other.id());
            }
            assert_ne!(site.index(), usize::MAX);
        }
        // QQ Music's and NetEase's pages say when they're signed in; Bilibili's comes back to Bilibili.
        assert!(QQ_MUSIC.page_says.is_some());
        assert!(NETEASE.page_says.is_some());
        assert!(BILIBILI.page_says.is_none());
        assert!(BILIBILI.home.starts_with("https://www.bilibili.com/"));
        // The sign-out windows never say signed in: they end as they're closed.
        for site in Site::ALL {
            assert!(site.sign_out().page_says.is_some());
        }
    }

    /// Before anything is asked, nothing is known; after a sign-in window closed signed in, it is.
    #[test]
    fn knows_a_sign_in_once_its_window_says_so() {
        let logins = WebLogins::new(Path::new("."));
        let before = logins.state();
        assert_eq!(before.bilibili.signed_in, None);
        assert!(!before.bilibili.signing_in);
        logins.asked[0].set(true);
        logins.signed_in[0].set(true);
        assert_eq!(logins.state().bilibili.signed_in, Some(true));
        assert_eq!(logins.state().netease.signed_in, None, "another site's");
    }
}
