// Sounds off nothing: says when QQ Music's page is signed in, once (`{"signedIn":true}`), which is what ends its
// sign-in window (signin.rs). Its page has its own account dialog: signed in, the top bar has the player's own
// picture and name in place of its sign-in link, and its key is in a cookie the page itself can read.
;(function () {
  var told = false
  function signedIn() {
    // The real account token is what matters: a `qm_keyst`/`qqmusic_key` cookie only exists after login;
    // anonymous visitors carry device cookies (pgv_pvid, _tme_did, ...) but no token. The site's top-bar
    // markup changes between releases, so the token cookie — not a DOM selector — decides signed-in state.
    return /(?:^|;\s*)(?:qqmusic_key|qm_keyst)=[^;]/.test(document.cookie)
  }
  function say() {
    if (told || !signedIn()) return
    told = true
    try {
      // The cookie string goes back with the signed-in flag: the host hands it to the hidden QQ page, which
      // re-sends it to the local layer as a credential (custom `X-Qq-*` headers, with the Cookie string as
      // a fallback).
      window.chrome.webview.postMessage({ signedIn: true, cookies: document.cookie })
    } catch (e) {
      // Not in its sign-in window: nothing to tell.
    }
  }
  document.addEventListener('DOMContentLoaded', say)
  setInterval(say, 1000)
  say()
})()
