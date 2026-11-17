// 后台 v3.9.49：六件事（⑥ 最小化 normal 窗口承载 ag-1 临时页；⑦ 播放器底部 ♥ 放大、移除 VIP 锁开关）
console.log('[QQ-bg] 后台脚本已加载 v3.9.49');   // 判据：重新加载后后台控制台出现此行 = 新代码在跑
//  ① 进入 QQ音乐「入口页」→ 直接替换成播放器（可用 ?noplayer=1 绕过）
//  ② 在「我喜欢」/歌单/专辑页注入 main.js（MAIN world，不经过页面 CSP）
//  ③ 点击工具栏图标 → 打开播放器
//  ④ [QQCAP-BG] webRequest 抓官网"写歌单/收藏"请求（排查「我喜欢」加不进去用）
const PLAYER = 'player.html';
const MATCH = /\/ryqq(_v2)?\/(profile\/like\/song|playlist\/\d+|albumDetail\/[A-Za-z0-9]+)/;

// 「进入域名」的入口页：只拦这几个，站内深层页面（专辑/歌单/搜索…）一概不拦，
// 这样你照旧能正常浏览网页版。
const HOME = /^https?:\/\/y\.qq\.com\/(index\.html)?(\?[^#]*)?(#.*)?$/;
const HOME2 = /^https?:\/\/y\.qq\.com\/n\/ryqq(_v2)?\/?(\?[^#]*)?(#.*)?$/;
const isHome = (u) => (HOME.test(u) || HOME2.test(u)) && !/[?&]noplayer=1/.test(u);

const injected = new Set();
// 排障抓包开关（v3.9.41）：[QQCAP-BG] 对*.qq.com 所有 fcg 请求做网络层抓包并写 chrome.storage，
// 仅排查「我喜欢」写入时才有用，平时是常驻开销（每条 fcg 都解码 body + 存盘）。默认关闭；
// 需要时改成 true 重新加载后台即恢复抓包。
const CAPTURE_ENABLED = false;

// v3.9.36：ag-1 写请求「完成」信号。handleAg1 在点官方 ♥ 之前 arm，onCompleted 监听到 ag-1 响应后 resolve，
// 于是关窗口的时机由「请求真正发完」决定（事件驱动）——既不早于请求完成（避免窗口过早关闭中断请求），
// 也不像以前那样盲目多等 1.8s。最多等 5s 超时兜底（请求正常 <1s 完成）。
let _ag1Waiter = null;
function armAg1Waiter() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (_ag1Waiter && _ag1Waiter.resolve === resolve) { _ag1Waiter = null; resolve(false); }
    }, 5000);
    _ag1Waiter = { resolve, timer };
  });
}

function inject(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['main.js'],
    world: 'MAIN',
    injectImmediately: true
  }).then(() => {
    injected.add(tabId);
  }).catch((e) => console.log('[歌单全量] 注入失败：', e));
}

// ① 先注册：入口页 → 播放器（越早替换，闪一下的时间越短）
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const url = info.url || (tab && tab.url) || '';
  if (!url || !isHome(url)) return;
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL(PLAYER) }).catch(() => {});
});

// ② 业务页面注入
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!tab.url || !MATCH.test(tab.url)) return;
  // 首次进入：文档刚开始加载时注入（此时页面 JS 还没跑，hook 最早生效）
  if (info.status === 'loading') {
    inject(tabId);
    return;
  }
  // SPA 内部跳转：地址变了但没有重新加载文档，补一次注入
  if (info.url) {
    setTimeout(() => inject(tabId), 0);
  }
});

// 标签页被替换（例如刷新）时清掉记录
chrome.tabs.onRemoved.addListener((tabId) => injected.delete(tabId));

// ③ 点击工具栏图标 → 打开播放器
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL(PLAYER) });
  });
}

// ④ [QQCAP-BG] 用 webRequest 在网络层抓官网的写歌单/收藏请求（v3.9.12 排查用）。
// 为什么：扩展页（chrome-extension:// 源）往「我喜欢」(dirId 201) 加歌被服务端拒（80105），
// 官网却可以；而页面级 fetch/XHR 钩子一条都没抓到 —— 说明官网的请求可能是 GET 型老接口
// 或在 Worker 里发。webRequest 在网络层，GET/POST/Worker 全都能抓到。
// 抓到的存进 chrome.storage.session（键 qqcap=疑似写请求 / qqcapMisc=其它 fcg 流量），
// 播放器控制台执行 __qqCapLog() 查看。
if (CAPTURE_ENABLED && chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  try {
    const WRITE = /PlaylistDetailWrite|SongFav|AddSonglist|DelSonglist|FavSong|AddFav|DelFav|favorit/i;
    const dec = new TextDecoder('utf-8');
    const bodyOf = (d) => {
      try {
        const raw = d.requestBody && d.requestBody.raw;
        if (raw && raw[0] && raw[0].bytes) return dec.decode(raw[0].bytes);
        if (d.requestBody && d.requestBody.formData) return JSON.stringify(d.requestBody.formData);
      } catch (e) {}
      return '';
    };
    const save = (key, rec, cap) => {
      try {
        chrome.storage.session.get([key]).then((o) => {
          const arr = (o && o[key]) || [];
          arr.unshift(rec);
          if (arr.length > cap) arr.length = cap;
          return chrome.storage.session.set({ [key]: arr });
        }).catch(() => {
          // session 不可用就退回 local
          chrome.storage.local.get([key]).then((o2) => {
            const arr = (o2 && o2[key]) || [];
            arr.unshift(rec);
            if (arr.length > cap) arr.length = cap;
            return chrome.storage.local.set({ [key]: arr });
          }).catch(() => {});
        });
      } catch (e) {}
    };
    chrome.webRequest.onBeforeRequest.addListener((d) => {
      try {
        if (!d || !d.url || d.url.indexOf('qq.com') < 0) return;
        if (!/\.fcg/.test(d.url)) return;                       // 只关心 QQ 音乐的 fcg 通道
        let qs = '';
        const qi = d.url.indexOf('?');
        if (qi >= 0) { try { qs = decodeURIComponent(d.url.slice(qi + 1)); } catch (e) { qs = d.url.slice(qi + 1); } }
        const body = bodyOf(d);
        const hay = body + '\n' + qs;
        const isWrite = WRITE.test(hay);
        if (!isWrite && !/musicu\.fcg|musics\.fcg/.test(d.url) && !/fav/i.test(d.url)) return;
        const rec = { t: Date.now(), method: d.method, url: d.url.slice(0, 300), body: body.slice(0, 1500), qs: qs.slice(0, 1500) };
        console.log('[QQCAP-BG]', (isWrite ? '★写请求★ ' : '') + rec.method, rec.url, rec.body || rec.qs);
        save(isWrite ? 'qqcap' : 'qqcapMisc', rec, isWrite ? 30 : 12);
      } catch (e) {}
    }, { urls: ['*://*.y.qq.com/*', '*://*.qq.com/*'] }, ['requestBody']);

    // 记录 ag-1 写请求的响应状态，帮助判断"请求发出但服务端未生效"的情况
    chrome.webRequest.onCompleted.addListener((d) => {
      try {
        if (!d || !d.url || d.url.indexOf('qq.com') < 0) return;
        if (!/\.fcg/.test(d.url)) return;
        const isAg1 = /musics\.fcg/.test(d.url) && /encoding=ag-1/i.test(d.url);
        if (!isAg1) return;
        console.log('[QQCAP-BG-RESP] status=' + (d.statusCode || '?') + ' method=' + d.method + ' url=' + d.url.slice(0, 220));
        if (_ag1Waiter) { clearTimeout(_ag1Waiter.timer); const r = _ag1Waiter.resolve; _ag1Waiter = null; r(true); }  // v3.9.36：通知 handleAg1 可以关窗口了
      } catch (e) {}
    }, { urls: ['*://*.y.qq.com/*', '*://*.qq.com/*'] });
  } catch (e) {}
}

// ⑤ 「我喜欢」ag-1 加密通道兜底（v3.9.23）：明文 musicu.fcg 对某些歌返回 80105（服务端解析不到该 mid，
//   只有官网自己的加密通道 ag-1 的 musics.fcg 加得进——扩展算不出 ag-1 的 sign）。所以借官网的代码发：
//   后台复用已开的 y.qq.com 歌曲详情页；否则开一个最小化 normal 窗口加载 songDetail，
//   用 executeScript 在 MAIN world 点官方 ♥ 按钮，触发官网自己的 ag-1 写请求，发完关闭窗口。
//   最小化 normal 窗口（type:'normal' + state:'minimized'）屏幕上完全不可见（仅任务栏一个最小化项），
//   而 popup+minimized 在创建时会被拒（v3.9.34 的 "Invalid value for state"）。失败回退顺序：
//     ① 最小化 normal 窗口 → ② 屏幕外 1×1 popup 窗口 → ③ active:false 临时标签（保底可用）。
//   注入函数自带包含（闭包不序列化）。
// 复用现有 y.qq.com 标签：若已经开着该歌曲的详情页就直接点；否则用最小化窗口避免在当前窗口出现新标签/弹窗。
// 为什么不让后台/播放器直接发：① 明文 musicu.fcg 对坏歌 80105；② 扩展页自己发 ag-1 算不出 sign。

// 在 y.qq.com 歌曲详情页 MAIN world 里执行的点击函数（自包含）。
// 返回语义（v3.9.24 起）：官方「收藏」按钮点完不翻转文案/图标，也不能靠本地读状态判定成败，
// 所以这里只要「点击已执行」就返回 {ok:true, clicked:true}，由播放器重拉「我喜欢」列表核验真实增减。
// 仅两种情况算真失败：① 找不到按钮 → {ok:false, error}；② 注入异常（由 handleAg1 兜）。
function ag1ClickFav(op) {
  return (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const want = (op === 'add');
    // v3.9.33：操作全程隐藏"选择歌单"浮层，避免每加/删一次就闪一下官方弹窗。
    // 用 opacity:0 + pointer-events:none（而不是 visibility:hidden / display:none），
    // 保证浮层仍在 DOM、offsetParent 非空 —— 既能让下面的 pickerOpen() 正常检测到弹层，
    // 又能让 .click() 程序化点击生效；对用户完全不可见、不可误触。
    const styleId = '__qq_like_hide_picker';
    let hideStyle = document.getElementById(styleId);
    if (!hideStyle) {
      hideStyle = document.createElement('style');
      hideStyle.id = styleId;
      hideStyle.textContent = '.popup,.mod_popup,.dialog,[class*="popup"],[class*="modal"],[class*="dialog"],[class*="picker"],[class*="mask"]{opacity:0!important;pointer-events:none!important;}';
      (document.head || document.documentElement).appendChild(hideStyle);
    }
    const isFav = (el) => {
      if (!el) return false;
      const cls = (el.className || '').toString();
      if (/\b(on|current|active|selected|checked)\b/.test(cls)) return true;
      if (el.getAttribute && el.getAttribute('aria-pressed') === 'true') return true;
      if (el.getAttribute && el.getAttribute('aria-checked') === 'true') return true;
      const t = (el.textContent || '').trim();
      if (/已收藏|已喜欢|取消喜欢|取消收藏/.test(t)) return true;
      return false;
    };
    const find = () => {
      const sels = ['.js_fav_song', '.songlist__fav', '.btn_fav', '[class*="fav_song"]',
        '[class*="songFav"]', '[class*="fav"]', '.heart', '.icon_fav',
        '[data-type="fav"]', '[data-action="fav"]', '[data-command="fav"]', 'button.fav'];
      for (const s of sels) { const e = document.querySelector(s); if (e && e.offsetParent !== null) return e; }
      const all = Array.from(document.querySelectorAll('button,a,[role=button],span,div,i,b'));
      for (const e of all) {
        const t = (e.textContent || '').trim();
        const title = (e.getAttribute && (e.getAttribute('title') || e.getAttribute('aria-label'))) || '';
        const sig = t || title;
        if (!sig || sig.length > 12) continue;
        if (/(♥|♡|红心|我喜欢|喜欢这首歌|收藏这首歌|收藏)/.test(sig) && e.offsetParent !== null && e.children.length <= 2) return e;
      }
      return null;
    };
    try {
      let btn = null;
      for (let i = 0; i < 40; i++) { btn = find(); if (btn) break; await wait(250); }
      if (!btn) return { ok: false, error: '未找到收藏按钮', url: location.href };
      const info = { html: (btn.outerHTML || '').slice(0, 240), cls: (btn.className || '').toString(), txt: (btn.textContent || '').trim(), title: (btn.getAttribute && btn.getAttribute('title')) || '', href: location.href };
      if (op === 'add') {
        // 加：仅当当前确实未喜欢才点，避免重复点反而把已喜欢的取消掉。
        const cur = isFav(btn);
        console.log('[ag1ClickFav] op=add want=' + want + ' isFav=' + cur + ' btn=' + (info.cls || info.txt));
        if (cur === want) { console.log('[ag1ClickFav] 已是已喜欢，跳过点击'); return { ok: true, clicked: true, note: 'already', info }; }
        btn.click();
      } else {
        // 删：能走到这里，播放器层已经用 likeMids 确认服务器侧该歌确实在「我喜欢的」里（writeLike 已 gate）。
        // 所以不能信页面 ♥ 是否渲染出"已喜欢"——刚开页时收藏态常晚于按钮出现，isFav 会误判为"未喜欢"，
        // 若据此跳过点击就会出现用户侧"删不掉"（v3.9.29 删除失效根因）。这里无论 isFav 结果都点一下把它关掉：
        // 先等至多 ~3s 让"已喜欢"态加载，尽量走 ON→OFF 直接移除；否则点完走「选择歌单」浮层取消勾选再确定。
        let fav = false, waitMs = 0;
        for (let k = 0; k < 30; k++) { if (isFav(btn)) { fav = true; waitMs = k * 100; break; } await wait(100); }
        console.log('[ag1ClickFav] op=remove want=' + want + ' isFav(after wait)=' + fav + ' waitMs=' + waitMs + ' btn=' + (info.cls || info.txt));
        btn.click();
      }
      // v3.9.36：不再盲目等 1.8s。点完等至多 ~500ms 让「选择歌单」浮层（若有）出现；
      // 浮层是否出现、请求何时发完，交由 handleAg1 的 ag1Wait 事件驱动判定，避免无谓多等。
      await wait(500);

      // 点击后若冒出"选择歌单"弹层：在弹层里操作「我喜欢的音乐」那一行
      // （add → 勾选；remove → 取消勾选；弹层可能有「确定/完成」按钮需点）。浮层已被 CSS 隐藏，用户不可见。
      const pickerOpen = () => Array.from(document.querySelectorAll('.popup,.mod_popup,.dialog,[class*="popup"],[class*="modal"],[class*="dialog"],[class*="picker"]'))
        .find((p) => p.offsetParent !== null && /我喜欢的音乐|我喜欢的|我的收藏/.test(p.textContent || ''));
      let pick = pickerOpen();
      console.log('[ag1ClickFav] pickerOpened=' + !!pick + ' op=' + op);
      if (pick) {
        console.log('[ag1ClickFav] pickerHTML=' + (pick.outerHTML || '').slice(0, 500));
        const rows = Array.from(pick.querySelectorAll('li,[class*="item"],[class*="row"],[role=option],label,div'));
        const row = rows.find((li) => /我喜欢的音乐|我喜欢的|我的收藏/.test(li.textContent || ''));
        console.log('[ag1ClickFav] rowFound=' + !!row + ' rows=' + rows.length + ' op=' + op);
        if (row) {
          const rowCls = (row.className || '').toString();
          const checkEl = row.querySelector('input[type="checkbox"],[class*="check"],[class*="tick"],[class*="selected"],i,span');
          const sel = /\b(on|current|checked|selected|active)\b/.test(rowCls)
            || !!(checkEl && (checkEl.checked || checkEl.getAttribute('aria-checked') === 'true' || /\b(on|checked|selected)\b/.test((checkEl.className || '').toString())))
            || /已添加|已收藏|已喜欢/.test(row.textContent || '');
          console.log('[ag1ClickFav] rowCls=' + rowCls + ' sel=' + sel + ' want=' + want + ' checkEl=' + (checkEl && checkEl.className));
          if (sel !== want) {
            // 尽量点实际的勾选框/图标，而不是整行，避免误触
            const target = checkEl || row.querySelector('i,span,div') || row;
            target.click();
            console.log('[ag1ClickFav] clicked row target to set sel=' + !sel);
          }
          await wait(500);
          const ok = Array.from(pick.querySelectorAll('button,[class*="btn"],[role=button]')).find((b) => /确定|完成|保存|好了|OK|Confirm|Done/i.test((b.textContent || '').trim()));
          console.log('[ag1ClickFav] okFound=' + !!ok + ' okText=' + ((ok && ok.textContent) || '').trim());
          if (ok) ok.click();
          await wait(600);
          return { ok: true, clicked: true, note: 'viaPicker', info };
        }
      }
      // 点击已执行、ag-1 写请求已发出（[QQCAP-BG] 可佐证）。成败交由播放器重拉「我喜欢」核验，不在这里读按钮状态。
      return { ok: true, clicked: true, info };
    } finally {
      // v3.9.33：无论走哪条 return 路径，都把隐藏样式撤掉，避免残留影响用户后续在可见标签上打开的其它弹层。
      const s = document.getElementById(styleId);
      if (s && s.parentNode) s.parentNode.removeChild(s);
    }
  })();
}

function waitTabComplete(tabId, timeout) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      try {
        chrome.tabs.get(tabId, (t) => {
          if ((t && t.status === 'complete') || Date.now() - start > timeout) return resolve();
          setTimeout(tick, 300);
        });
      } catch (e) { resolve(); }
    };
    tick();
  });
}

// 处理来自播放器的 ag-1 兜底请求：复用已有 songDetail 页 / 否则开最小化 normal 窗口（几乎不可见） → 点官方 ♥ → 关闭窗口
async function handleAg1(op, mid) {
  console.log('[ag1ClickFav] handleAg1 invoked op=' + op + ' mid=' + mid);   // 后台可见，证明新代码在跑
  if (!mid) return { ok: false, error: '需要歌曲 mid（字符串）' };
  const detailUrl = 'https://y.qq.com/n/ryqq/songDetail/' + mid;
  let tabId = null, winId = null, created = false;
  try {
    const tabs = await new Promise((res) => chrome.tabs.query({ url: '*://*.qq.com/*' }, res));
    const hit = tabs.find((t) => t.url && /songDetail/i.test(t.url) && t.url.indexOf(mid) >= 0);
    if (hit) {
      tabId = hit.id;            // 复用：已经开着这个歌曲的详情页，直接点（不打扰用户其它标签）
    } else {
      // v3.9.36：承载 ag-1 临时页的窗口——优先「最小化 normal 窗口」(type:'normal' + state:'minimized')。
      // 最小化窗口屏幕上完全不可见（仅任务栏一个最小化项，几乎无感），而 popup+minimized 在创建时会被拒
      // （v3.9.34 的 "Invalid value for state"）。先开 about:blank 再后台导航，避免创建瞬间加载 URL 闪一下。
      // 失败回退：① 最小化 normal 窗口 → ② 屏幕外 1×1 popup 窗口 → ③ active:false 临时标签（保底可用）。
      let win = null, lastErr = '';
      try {
        win = await new Promise((res) => {
          chrome.windows.create({
            url: 'about:blank',
            type: 'normal',
            state: 'minimized',
            focused: false
          }, (w) => {
            if (chrome.runtime.lastError) { lastErr = chrome.runtime.lastError.message; res(null); }
            else res(w);
          });
        });
      } catch (e) { lastErr = String((e && e.message) || e); }
      if (!win || !win.tabs || !win.tabs[0]) {
        // 回退 ②：屏幕外极小 popup 窗口
        console.log('[ag1ClickFav] 最小化窗口创建失败(' + lastErr + ')，回退屏幕外 popup 窗口');
        try {
          win = await new Promise((res) => {
            chrome.windows.create({
              url: detailUrl, type: 'popup', width: 1, height: 1, left: -32000, top: -32000, focused: false
            }, (w) => { if (chrome.runtime.lastError) res(null); else res(w); });
          });
        } catch (e) {}
      }
      if (!win || !win.tabs || !win.tabs[0]) {
        // 回退 ③：active:false 临时标签（可能再闪一下，但功能不挂）
        console.log('[ag1ClickFav] popup 窗口也失败，回退 active:false 临时标签');
        const t = await new Promise((res) => chrome.tabs.create({ url: detailUrl, active: false }, res));
        tabId = t.id; created = true;
      } else {
        tabId = win.tabs[0].id; winId = win.id; created = true;
        if (win.type === 'popup') {
          console.log('[ag1ClickFav] created offscreen popup window=' + winId + ' tabId=' + tabId);
        } else {
          // normal 最小化窗口：开在 about:blank，这里再后台导航到 songDetail（窗口始终最小化，不可见）
          console.log('[ag1ClickFav] created minimized normal window=' + winId + ' tabId=' + tabId);
          await chrome.tabs.update(tabId, { url: detailUrl }).catch(() => {});
        }
      }
      await waitTabComplete(tabId, 12000);
    }
    const ag1Wait = armAg1Waiter();   // v3.9.36：点 ♥ 触发的 ag-1 请求真正完成（onCompleted）后才关窗口——事件驱动，不盲目多等
    const out = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: ag1ClickFav, args: [op] });
    const r = (out && out[0] && out[0].result) || { ok: false, error: 'no result' };
    console.log('[ag1ClickFav] result=' + JSON.stringify(r));   // 回传页面侧诊断到后台控制台（页面侧日志抓不到）
    await ag1Wait;   // 等 ag-1 写请求真正发完再关窗口（cap 5s，避免窗口过早关闭中断请求；通常 <1s 即返回）
    return r;
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    // v3.9.36：关闭临时载体。窗口优先整窗移除；回退到 tabs.create 的单独关标签。复用已有标签(created=false)不动。
    if (created) {
      if (winId) { try { chrome.windows.remove(winId); } catch (e) {} }
      else if (tabId) { try { chrome.tabs.remove(tabId); } catch (e) {} }
    }
  }
}

if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.__qqpage_log) { console.log('[QQPAGE-DIAG]', msg.__qqpage_log); return false; }
    // v3.9.23：ag-1 加密通道兜底（明文 80105 时由播放器触发）
    if (msg.type === 'qq-like-ag1') {
      handleAg1(msg.op, msg.mid).then((r) => { if (sendResponse) sendResponse(r); }).catch((e) => { if (sendResponse) sendResponse({ ok: false, error: String((e && e.message) || e) }); });
      return true;
    }
    return false;
  });
}
