// Says when NetEase Cloud Music's page is signed in, once (`{"signedIn":true}`), which is what ends its sign-in
// window (signin.rs). Its page has its own account dialog: signed in, the top bar has the player's own picture and
// name in place of its sign-in link, and its session cookie is one the page itself can read.
;(function () {
  var told = false
  function signedIn() {
      // Its account's own token only: MUSIC_A (anonymous) and __csrf are there before anyone signs in.
      if (/(?:^|;\s*)MUSIC_U=[^;]+/.test(document.cookie)) return true
    // Else its own header: signed in, the sign-in link is gone and the account's own picture (with its name
    // beside it) is there instead (the new page's bar: owner 2026-11-02, the window never closed).
    var head = document.querySelector('.m-tophead, [class*="tophead"], header')
    if (!head) return false
    var words = (head.innerText || '').replace(/\s+/g, '')
    if (words.indexOf('登录') >= 0) return false
    return head.querySelector('img, [class*="face"], [class*="avatar"], [class*="user"]') !== null
  }
  function say() {
      if (told || !signedIn()) return
    told = true
    try {
      window.chrome.webview.postMessage({ signedIn: true })
    } catch (e) {
      // Not in its sign-in window: nothing to tell.
    }
  }
  document.addEventListener('DOMContentLoaded', say)
  setInterval(say, 1000)
  say()
})()
