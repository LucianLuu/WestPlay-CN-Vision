// QQ音乐网页版「我喜欢」/ 歌单 / 专辑 —— 全量显示  v3.9.49
// MAIN world，document-start 注入（manifest content_scripts）
//
// 手段：① 请求改写（主力）—— 专辑 musichallAlbum.AlbumSongList 的 num→1000；
//                       我喜欢/歌单的 song_num|songnum→500
//      ② 响应改写（只在必要时）—— 我喜欢 2626 首需自拉分页后整体替换；
//                       专辑只认 songList 键 + 顺序一致子序列，作为缓存兜底
//      ③ 缓存优先 —— 有缓存立刻渲染（秒开），后台核对，只有数量变了才刷新一次
//
// 已实测定量的事实（据此才敢只改参数、不做宽泛替换）：
//   · 专辑页一次批量 4 模块，曲目那个 num 默认 10；页面是 n.songList = t[1].data.songList 直接赋值渲染
//     （无分页、无 concat），order 写死 2
//   · num 只影响单页条数，永不超 totalNum（22/48/110 三张专辑验证）
//   · HOLD 正则只匹配 musics.fcg（musicu.fcg 里 musi 后是 c 不是 u）—— 被扣住的正是加密通道
//
// 性能：热 hook 先做"最廉价判断"再动手；递归有深度上限+节点预算且跳过数组；
//       有缓存时不扣请求；非 fcg 的 XHR 完全不处理；大列表写库放到空闲时间；默认零日志
(function () {
  const DEBUG = (() => { try { return localStorage.getItem('qq_like_debug') === '1'; } catch (e) { return false; } })();
  const log = DEBUG ? (...a) => console.log('%c[歌单全量]', 'color:#31c27c;font-weight:bold', ...a) : () => {};
  // 排障开关（v3.9.41）：[QQCAP] 请求抓包 + [QQPAGE] webpack 探测 + __qqLikeAdd/__qqLikeRemove + qq-like-do-* 消息监听
  // 都只在排查「我喜欢」写入时用，正常运行无调用方。默认 false 以省掉每页 3 次 webpack 全量扫描与 fetch/XHR 包装开销；
  // 需要时改成 true 重新加载即可恢复。
  const DIAG = false;

  // ---------- [QQCAP] 捕获官网自己的"写歌单/收藏"请求（排查用） ----------
  // 为什么需要：扩展页（chrome-extension:// 源）往「我喜欢」(dirId 201) 加歌会被服务端拒（80105），
  // 但官网原版页面可以正常加 —— 把官网真正发出去的请求体打到控制台（前缀 [QQCAP]），照抄即可。
  // 必须装在路径判断**之前**，这样不管在 y.qq.com 的哪个页面点红心都能抓到。
  (function () {
    if (!DIAG) return;
    try {
      const CAP = /PlaylistDetailWrite|SongFavWrite|AlbumFavWrite/i;
      const dump = (b) => { try { if (b != null && CAP.test(String(b))) console.log('[QQCAP] ' + String(b).slice(0, 1200)); } catch (e) {} };
      if (typeof window.fetch === 'function') {
        const _f = window.fetch;
        window.fetch = function () {
          try { const o = arguments[1]; if (o && o.body != null) dump(typeof o.body === 'string' ? o.body : String(o.body)); } catch (e) {}
          return _f.apply(this, arguments);
        };
      }
      if (typeof window.XMLHttpRequest === 'function' && window.XMLHttpRequest.prototype) {
        const _s = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.send = function (b) {
          try { if (b != null) dump(typeof b === 'string' ? b : String(b)); } catch (e) {}
          return _s.apply(this, arguments);
        };
      }
    } catch (e) {}
  })();

  // ---------- [QQPAGE] 取出官网自己的请求管线（v3.9.14 排查/修复用） ----------
  // 为什么：probe4 证明明文 musicu 在所有 host 都写不进「我喜欢」(dirId 201 → 80105)，
  // 而 musics.fcg（ag-1 加密签名通道）明文发返回 2000 —— 也就是说必须走加密通道。
  // 我们自己实现不了 ag-1 加密，只能**借用官网页面自己的请求函数**来发。
  // 做法：用 webpack chunk 的 push 技巧拿到页面的 __webpack_require__，再从模块表里
  // 找出带 .request() 的那个（官网 common chunk 里是 a.j().request([...])），
  // 之后就能用官网的通道发任意 {module, method, param}。
  (function () {
    if (!DIAG) return;
    // 把每一条诊断都回传给后台（后台控制台是用户一直在看的，避免“页面控制台没输出”的误会）
    const RELAY = (() => {
      try {
        return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)
          ? (m) => { try { chrome.runtime.sendMessage({ __qqpage_log: String(m) }); } catch (e) {} }
          : null;
      } catch (e) { return null; }
    })();
    const say = (m) => { const s = '[QQPAGE] ' + m; try { console.log(s); } catch (e) {} if (RELAY) RELAY(s); };
    // 用页面登录 cookie 里的 qm_keyst（与 initAuth 一致，musicu.fcg 用这套 g_tk 校验）算真实 g_tk；回落 p_skey/skey/p_uin；qqmusic_key 是错的 key（本账户用它算出的 g_tk 不被接受）。
    const gtk = () => {
      try {
        const ck = (typeof document !== 'undefined' && document.cookie) || '';
        const get = (n) => { const m = ck.match(new RegExp(n + '=([^;]+)')); return m ? m[1] : ''; };
        const skey = get('qm_keyst') || get('p_skey') || get('skey') || get('p_uin') || '';
        let hash = 5381;
        for (let i = 0; i < skey.length; i++) hash += (hash << 5) + skey.charCodeAt(i);
        return (hash & 0x7fffffff) || 5381;
      } catch (e) { return 5381; }
    };
    const pageUin = () => {
      try { const m = document.cookie.match(/uin=o?(\d+)/); return m ? m[1] : ''; } catch (e) { return ''; }
    };
    // ⚠️ for...in 拿不到不可枚举的全局，必须 getOwnPropertyNames；并且要逐个候选试、
    //    每次 push 单独 try（webpackJsonpCallback 可能对我们塞的 chunk 抛错）。
    const findChunkArrays = () => {
      const out = [];
      try {
        const names = Object.getOwnPropertyNames(window);
        for (const n of names) {
          if (!/webpack/i.test(n)) continue;
          let v = null;
          try { v = window[n]; } catch (e) { continue; }
          if (v && typeof v.push === 'function') out.push({ name: n, arr: v });
        }
      } catch (e) {}
      return out;
    };
    const grab = () => {
      const cands = findChunkArrays();
      for (const c of cands) {
        try {
          c.arr.push([['__qq_probe'], { '__qq_probe': (m, e, r) => { window.__qqRequire = r; } }, (r) => r('__qq_probe')]);
          if (window.__qqRequire) { window.__qqChunkName = c.name; say('拿到 require，来自全局 ' + c.name); return true; }
        } catch (e) { say('push 失败 ' + c.name + '：' + (e && e.message ? e.message : e)); }
      }
      say('没找到可用的 webpack chunk 数组。候选=' + JSON.stringify(cands.map((c) => c.name)) + '（window 上含 webpack 的全局共 ' + cands.length + ' 个）');
      return false;
    };
    const findRequester = () => {
      const req = window.__qqRequire;
      if (!req) return false;
      const ids = Object.keys(req.m || {});
      say('模块表 ' + ids.length + ' 个，开始找 .request()');
      for (const id of ids) {
        let ex = null;
        try { ex = req(id); } catch (e) { continue; }
        if (!ex) continue;
        const cands = [];
        try { if (typeof ex.request === 'function') cands.push(ex); } catch (e) {}
        try { if (typeof ex.j === 'function') { const j = ex.j(); if (j && typeof j.request === 'function') cands.push(j); } } catch (e) {}
        try {
          for (const kk in ex) {
            const v = ex[kk];
            if (v && typeof v === 'object' && typeof v.request === 'function') cands.push(v);
            if (v && typeof v === 'object' && typeof v.j === 'function') {
              try { const j = v.j(); if (j && typeof j.request === 'function') cands.push(j); } catch (e) {}
            }
          }
        } catch (e) {}
        for (const c of cands) {
          if (typeof c.request === 'function') { window.__qqRequester = c; say('找到请求函数（module ' + id + '）'); return true; }
        }
      }
      return false;
    };
    // 兜底：不管 webpack，直接扫 window 上所有全局，看有没有现成挂出来的 .request()
    // （有些站点会把 API 对象挂到某个命名空间上，比挖 webpack 省事）
    const scanGlobals = () => {
      try {
        const names = Object.getOwnPropertyNames(window);
        for (const n of names) {
          let v = null;
          try { v = window[n]; } catch (e) { continue; }
          if (!v || (typeof v !== 'object' && typeof v !== 'function')) continue;
          try {
            if (typeof v.request === 'function') { window.__qqRequester = v; say('全局 ' + n + ' 上直接有 .request'); return true; }
            if (typeof v.j === 'function') {
              const j = v.j();
              if (j && typeof j.request === 'function') { window.__qqRequester = j; say('全局 ' + n + ' 的 j() 上有 .request'); return true; }
            }
          } catch (e) {}
        }
      } catch (e) {}
      return false;
    };
    const boot = () => {
      if (window.__qqRequester) return;
      if (grab()) findRequester();
      if (!window.__qqRequester) scanGlobals();
      say('require=' + !!window.__qqRequire + ' requester=' + !!window.__qqRequester);
    };
    // ⚠️ 回归测试沙箱里没有 addEventListener / document，必须做类型守卫再挂
    try {
      if (typeof document !== 'undefined' && document.readyState === 'complete') setTimeout(boot, 800);
      else if (typeof window.addEventListener === 'function') window.addEventListener('load', () => setTimeout(boot, 800));
      setTimeout(boot, 3000);   // 兜底重试：webpack 挂载得晚
      setTimeout(boot, 6000);
    } catch (e) {}
    // 用官网通道发一次「加入我喜欢」。用法：官网页面控制台 __qqPageWrite(649470295)
    // 手动触发：**在官网页面控制台里执行 __qqProbe()** —— 不管时机，一调用就重跑并打印，
    // 保证一定有输出（自动那几次可能因为页面还没就绪而错过）。
    window.__qqProbe = function () {
      say('=== 手动探测开始 ===');
      const ok1 = grab();
      say('require=' + !!window.__qqRequire);
      const ok2 = ok1 ? findRequester() : false;
      if (!window.__qqRequester) { const ok3 = scanGlobals(); say('scanGlobals=' + ok3); }
      say('结果：require=' + !!window.__qqRequire + ' requester=' + !!window.__qqRequester);
      return { require: !!window.__qqRequire, requester: !!window.__qqRequester };
    };
    // ---------- 「我喜欢」加/取消（v3.9.21 正解） ----------
    // 实测两条 legacy fcg（c.y.qq.com/splcloud/fcg_music_add2songdir.fcg、c.y.qq.com/qzone/fcg_music_delbatchsong.fcg）
    // 在本账户已死（全 403，因校验 g_tk 用 p_skey，而本账户 p_skey 为空）。
    // 正确通道 = 与普通歌单加歌同一个 musicu.fcg POST 网关（本扩展播放器页实测 code 0）：
    //   module: music.musicasset.PlaylistDetailWrite，method: AddSonglist / DelSonglist，dirId: 201
    //   v_songInfo 必须带 songMid（字符串）：201 通道只认 mid，纯数字 songId → 80105。
    // 本函数在官网页面（MAIN world）里执行，fetch 带 credentials:'include' 自动带上 .qq.com 登录 cookie。
    // 用法（官网页面控制台）：__qqLikeAdd('002eQfMi0Ps0ub')   ← mid 是字符串，不是数字 id
    window.__qqLikeAdd = async function (mid, dirId) {
      if (!mid) { say('__qqLikeAdd(mid) 需要歌曲 mid（字符串，如 002eQfMi0Ps0ub），不是数字 id'); return null; }
      const g = gtk(), uin = pageUin();
      const body = { comm: { cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1, uin: uin, g_tk: g, g_tk_new_20200303: g }, req_1: { module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: dirId || 201, v_songInfo: [{ songType: 13, songMid: mid }] } } };
      say('加入我喜欢: ' + JSON.stringify(body.req_1).slice(0, 200));
      try {
        const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&platform=yqq.json&g_tk=' + g, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        const out = (j && j.req_1) || {};
        say('加入返回: ' + JSON.stringify(out).slice(0, 500));
        return out;
      } catch (e) { say('加入失败 ' + (e && e.message ? e.message : e)); return null; }
    };
    // 取消喜欢：同一个 musicu.fcg 通道，method DelSonglist，v_songInfo 带 songMid（传 mid 或数字 id 都行）
    window.__qqLikeRemove = async function (arg, dirId) {
      const isMid = typeof arg === 'string' && /^[0-9A-Za-z]{8,}$/.test(arg);
      const v = { songType: 13 };
      if (isMid) v.songMid = arg; else if (arg != null) v.songId = arg;
      if (!v.songMid && !v.songId) { say('__qqLikeRemove 需要歌曲 mid 或数字 id'); return null; }
      const g = gtk(), uin = pageUin();
      const body = { comm: { cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1, uin: uin, g_tk: g, g_tk_new_20200303: g }, req_1: { module: 'music.musicasset.PlaylistDetailWrite', method: 'DelSonglist', param: { dirId: dirId || 201, v_songInfo: [v] } } };
      say('取消喜欢: ' + JSON.stringify(body.req_1).slice(0, 200));
      try {
        const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&platform=yqq.json&g_tk=' + g, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        const out = (j && j.req_1) || {};
        say('取消返回: ' + JSON.stringify(out).slice(0, 500));
        return out;
      } catch (e) { say('取消失败 ' + (e && e.message ? e.message : e)); return null; }
    };
    window.__qqPageWrite = window.__qqLikeAdd;   // 兼容旧名

    // 让播放器页（chrome-extension://）能通过「后台 → 本页」指挥官网页面发写入（本页带 cookie）
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener) {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
          if (!msg || typeof msg !== 'object') return false;
          if (msg.type === 'qq-like-do-add') {
            window.__qqLikeAdd(msg.mid, msg.dirId).then((r) => { if (sendResponse) sendResponse({ ok: !!r, text: r }); });
            return true;
          }
          if (msg.type === 'qq-like-do-remove') {
            window.__qqLikeRemove(msg.id, msg.dirId).then((r) => { if (sendResponse) sendResponse({ ok: !!r, text: r }); });
            return true;
          }
          return false;
        });
      }
    } catch (e) {}
  })();

  const P = location.pathname;
  if (!/\/ryqq(_v2)?\/(profile\/like\/song|playlist\/\d+|albumDetail\/[A-Za-z0-9]+)/.test(P)) return;
  const booted = window.__qqLikePaths || (window.__qqLikePaths = {});
  if (booted[P]) return;
  booted[P] = true;

  const LIKE = 795604074;        // 「我喜欢」真实歌单 ID（URL 上的 95564074 少一位，是错的）
  const PAGE = 500;              // 我喜欢/歌单：单页上限
  const ALBUM_NUM = 1000;        // 专辑：单页条数（服务端按 totalNum 截断）
  const APAGE = 100;             // 专辑分页步长
  const DB = 'qq_like_full', ST = 'kv';
  const HOLD = /cgi-bin\/musi(cs|u)\.fcg/;
  const ALBUM_SONGS = /musichallAlbum\.AlbumSongList$/i;   // 只认这一个模块
  const IDLE = window.requestIdleCallback || ((f) => setTimeout(f, 0));

  const isLike = P.indexOf('/profile/like/song') > -1;
  const am = P.match(/\/albumDetail\/([A-Za-z0-9]+)/);
  const albumMid = am ? am[1] : null;
  const isAlbum = !!albumMid;
  const pm = P.match(/\/playlist\/(\d+)/);
  let DISSID = pm ? parseInt(pm[1], 10) : LIKE;
  const CK = () => (isAlbum ? 'al_' + albumMid : 'full_' + DISSID);

  const _parse = JSON.parse, _stringify = JSON.stringify, _fetch = window.fetch;

  // ---------- IndexedDB ----------
  let _db = null;
  const idbOpen = () => new Promise((res) => {
    if (_db) return res(_db);
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(ST); } catch (e) {} };
      r.onsuccess = () => res(_db = r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  const idb = (mode, fn) => new Promise((res) => {
    if (!_db) return res(null);
    try { fn(_db.transaction(ST, mode).objectStore(ST), res); } catch (e) { res(null); }
  });
  const idbGet = (k) => idb('readonly', (s, r) => { const q = s.get(k); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); });
  const idbSet = (k, v) => idb('readwrite', (s, r) => { const q = s.put(v, k); q.onsuccess = () => r(true); q.onerror = () => r(false); });
  const idbDel = (k) => idb('readwrite', (s, r) => { const q = s.delete(k); q.onsuccess = () => r(true); q.onerror = () => r(false); });

  // ---------- 状态 ----------
  let fullList = null, sourceDissid = null, swapped = false, seenLen = 0;

  // 请求闸门：只有"必须等自己拉完"的页面才扣请求
  //   我喜欢/歌单（无缓存）→ 扣住；专辑页/有缓存的页面 → 立刻放行
  //   ⚠️ 无论哪条分支都无条件挂超时兜底：否则 ready 永不 resolve，页面会一直加载不出来（v2.0 的教训）
  let readyRes = null;
  const ready = new Promise((r) => { readyRes = r; });
  const openGate = () => { if (readyRes) { const r = readyRes; readyRes = null; r(); } };
  if (isAlbum) openGate();
  setTimeout(openGate, isAlbum ? 0 : isLike ? 4000 : 3000);

  // ---------- g_tk（bkn 算法；实测这些接口 g_tk=0 就够，放候选最前） ----------
  const ck = (n) => (document.cookie.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)')) || [])[1] || '';
  function bkn(s) { let h = 5381; for (let i = 0; i < s.length; i++) h += (h << 5) + s.charCodeAt(i); return h & 0x7fffffff; }
  const uin = (ck('uin') || ck('wxuin') || '0').replace(/^o/, '');
  const gList = [0];
  ['p_skey', 'qm_p_skey', 'skey', 'p_lskey', 'qm_skey'].forEach((n) => { const v = ck(n); if (v) gList.push(bkn(v)); });
  gList.push(5381);
  let gtkCache = null;
  try { gtkCache = localStorage.getItem('qq_like_gtk'); } catch (e) { if (DEBUG) log('localStorage 不可用'); }

  const pick = (t) => (t && (t.songInfoList || t.songlist || t.songList)) || [];
  const idOf = (t) => { if (!t) return 0; return +(t.disstid !== undefined ? t.disstid : t.dissid !== undefined ? t.dissid : t.diss_tid !== undefined ? t.diss_tid : t.tid) || 0; };
  const songOf = (x) => (x && x.songInfo && typeof x.songInfo === 'object' ? x.songInfo : x);
  const midOf = (x) => { const s = songOf(x); return s ? (s.mid || s.songmid || s.songMid || s.id || '') : ''; };
  const nameOf = (x) => { const s = songOf(x); return s ? (s.name || s.title || s.songname) : undefined; };

  const COMM = (g) => ({ cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1, uin: +uin, g_tk: g, g_tk_new_20200303: g });
  const post = (body, g) => _fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?_=' + Date.now() + Math.random() + '&format=json&platform=yqq.json&g_tk=' + g, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: _stringify(body)
  });
  const dataOf = async (p) => { try { return (_parse(await (await p).text()).req_1 || {}).data || null; } catch (e) { return null; } };

  // ---------- 拉取 ----------
  const callData = (begin, num, g, id) => dataOf(post({
    comm: COMM(g), req_1: { module: 'music.srfDissInfo.aiDissInfo', method: 'uniform_get_Dissinfo', param: { song_begin: begin, song_num: num, disstid: +id, ctx: 1 } }
  }, g));
  const albumCall = (g, begin, num) => dataOf(post({
    comm: COMM(g), req_1: { module: 'music.musichallAlbum.AlbumSongList', method: 'GetAlbumSongList', param: { albumMid: albumMid, albumID: 0, begin: begin, num: num, order: 2 } }
  }, g));

  function pickGtk(tryOne) {
    return (async () => {
      if (gtkCache !== null && await tryOne(gtkCache) !== null) return gtkCache;
      for (let i = 0; i < gList.length; i++) {
        const g = await tryOne(gList[i]);
        if (g !== null) { gtkCache = g; try { localStorage.setItem('qq_like_gtk', String(g)); } catch (e) {} return g; }
      }
      return null;
    })();
  }
  const findGtk = (id) => pickGtk(async (g) => { try { return pick(await callData(0, 10, g, id)).length ? g : null; } catch (e) { return null; } });
  const findGtkAlbum = () => pickGtk(async (g) => { try { return pick(await albumCall(g, 0, 1)).length ? g : null; } catch (e) { return null; } });

  // 分页拉到底；响应 disstid 与请求不一致就丢弃（防串台）
  async function pullAll(g, id) {
    let real = +id; const all = [];
    for (let begin = 0; ; begin += PAGE) {
      const d = await callData(begin, PAGE, g, real);
      if (!d) break;
      if (!begin) {
        const rid = idOf(d);
        if (rid && rid !== real) {
          if (rid === LIKE && !isLike) return null;
          real = rid;
        }
      }
      const list = pick(d);
      if (!list.length) break;
      for (let i = 0; i < list.length; i++) all.push(list[i]);
      if (list.length < PAGE || begin > 100000) break;
    }
    return all.length ? { list: all, id: real } : null;
  }
  // 按 totalNum 封顶 + 按 mid 去重，分页再异常也不会多出歌
  async function pullAlbum(g) {
    const all = [], seen = new Set();
    let total = 0;
    for (let begin = 0; begin <= 5000; begin += APAGE) {
      const d = await albumCall(g, begin, APAGE);
      if (!d) break;
      if (!total) total = +d.totalNum || 0;
      const list = pick(d);
      if (!list.length) break;
      for (let i = 0; i < list.length; i++) {
        const s = list[i], mid = midOf(s);
        if (mid) { if (seen.has(mid)) continue; seen.add(mid); }
        all.push(s);
      }
      if (total && all.length >= total) break;
      if (list.length < APAGE) break;
    }
    return all.length ? all : null;
  }

  function saveCache(list, g, id) {
    const key = isAlbum ? 'al_' + albumMid : 'full_' + id;
    IDLE(async () => {
      const rec = { ts: Date.now(), g: g, list: list, disstid: id };
      if (!await idbSet(key, rec)) {
        const slim = list.map((s) => ({ id: s.id, mid: s.mid, name: s.name, title: s.title, subtitle: s.subtitle, album: s.album, singer: s.singer, interval: s.interval, mv: s.mv, songInfo: s.songInfo }));
        await idbSet(key, { ts: rec.ts, g: g, list: slim, disstid: id, slim: true });
      }
    });
  }

  // ---------- ① 请求改写（主力） ----------
  function fixReq(o, d) {
    if (!o || typeof o !== 'object' || d > 5) return false;
    let hit = false;
    const p = o.param;
    if (p && typeof p === 'object') {
      if (typeof o.module === 'string' && ALBUM_SONGS.test(o.module)) {
        // 专辑曲目：只改 num，不碰 order/begin
        if (p.num > 0 && p.num < ALBUM_NUM) { p.num = ALBUM_NUM; hit = true; }
        if (hit) swapped = false;                       // 页面又要了一遍 → 允许再兜底补一次
      } else {
        if (p.song_num > 0 && p.song_num < PAGE) { p.song_num = PAGE; hit = true; }
        if (p.songnum > 0 && p.songnum < PAGE) { p.songnum = PAGE; hit = true; }
        if (hit && (p.disstid === DISSID || p.dissid === DISSID)) swapped = false;
      }
    }
    for (const k in o) {
      const c = o[k];
      if (c && typeof c === 'object' && !Array.isArray(c) && fixReq(c, d + 1)) hit = true;
    }
    return hit;
  }
  // 廉价预检：只有"像 fcg 请求体"的对象才值得递归，避免在页面的大 state 上白跑递归
  function fcgish(v) {
    if (v.comm !== undefined) return true;      // fcg 请求体都有 comm，最快命中
    for (const k in v) {
      const c = v[k];
      if (c && typeof c === 'object' && !Array.isArray(c) && (c.module !== undefined || c.param !== undefined)) return true;
    }
    return false;
  }
  JSON.stringify = function (v) {
    if (v && typeof v === 'object') { try { if (fcgish(v)) fixReq(v, 0); } catch (e) {} }
    return _stringify.apply(this, arguments);
  };

  // 传输层兜底：应付自定义序列化器
  const reNum = /("song_?num"\s*:\s*)(\d+)/g;
  function patchBody(s) {
    if (s.length < 20) return s;
    let hit = false;
    const out = s.replace(reNum, (mt, p1, p2) => { if (+p2 > 0 && +p2 < PAGE) { hit = true; return p1 + PAGE; } return mt; });
    if (hit) return out;
    try { const o = _parse(s); if (o && typeof o === 'object' && fixReq(o, 0)) return _stringify(o); } catch (e) {}
    return s;
  }

  // ---------- ② 响应改写（必要时） ----------
  let budget = 0;
  // 通用（歌单）：找任何"像歌曲列表"的数组
  function findSongs(o, d, out) {
    if (!o || typeof o !== 'object' || d > 5 || out.length > 2 || budget-- < 0) return;
    for (const k in o) {
      const c = o[k];
      if (Array.isArray(c)) {
        const s = c.length >= 5 ? songOf(c[0]) : null;
        if (s && typeof s === 'object' && (s.mid !== undefined || s.songmid !== undefined || s.songMid !== undefined || s.id !== undefined) && nameOf(c[0]) !== undefined) out.push({ a: c, h: o });
      } else if (c && typeof c === 'object') findSongs(c, d + 1, out);
    }
  }
  // 专辑：只认 songList 这一个键（页面就是 n.songList = data.songList），避免误伤其他数组
  function findAlbumSongs(o, d, out) {
    if (!o || typeof o !== 'object' || d > 3 || out.length > 1 || budget-- < 0) return;
    for (const k in o) {
      const c = o[k];
      if (Array.isArray(c)) {
        if ((k === 'songList' || k === 'songlist') && c.length >= 2 && nameOf(c[0]) !== undefined) out.push(c);
      } else if (c && typeof c === 'object') findAlbumSongs(c, d + 1, out);
    }
  }
  // a 是否为 full 的「顺序一致子序列」：顺序对不上就不补，绝不打乱专辑曲序
  function isSubseq(a, full) {
    let j = 0;
    for (let i = 0; i < a.length && j < full.length; i++) {
      const mid = midOf(a[i]);
      while (j < full.length && midOf(full[j]) !== mid) j++;
      if (j >= full.length) return false;
      j++;
    }
    return true;
  }
  function fill(a) { a.length = 0; for (let j = 0; j < fullList.length; j++) a.push(fullList[j]); swapped = true; }

  JSON.parse = function (s) {
    const o = _parse.apply(this, arguments);
    if (swapped || !o || typeof o !== 'object' || location.pathname !== P) return o;
    // 廉价预检：原文里不可能含目标数组就直接跳过整棵树遍历
    if (typeof s === 'string') {
      const maybe = isAlbum ? (s.indexOf('songList') >= 0 || s.indexOf('songlist') >= 0)
                            : (s.indexOf('mid') >= 0 || s.indexOf('song') >= 0);
      if (!maybe) return o;
    }
    try {
      if (isAlbum) {
        const found = [];
        budget = 60;
        findAlbumSongs(o, 0, found);
        const a = found.length ? found[0] : null;
        if (!a) return o;
        if (a.length > seenLen) seenLen = a.length;
        if (!fullList || !fullList.length || a.length >= fullList.length || !isSubseq(a, fullList)) return o;
        fill(a);
        log('专辑已补全 ' + fullList.length + ' 首');
        return o;
      }

      if (!fullList || !fullList.length) {      // 没有全量：顺便学一下真实 ID / 攒下次的缓存
        if (isLike) return o;
        const f0 = [];
        budget = 300;
        findSongs(o, 0, f0);
        if (!f0.length) return o;
        const f = f0[0], rid = idOf(f.h);
        if (rid && rid !== DISSID) { DISSID = rid; idbSet('diss_' + P, rid); }
        if (f.a.length >= 10) bgPull(rid || DISSID);
        return o;
      }
      const found = [];
      budget = 300;
      findSongs(o, 0, found);
      for (let i = 0; i < found.length; i++) {
        const f = found[i];
        if (f.a.length >= fullList.length) continue;
        const rid = idOf(f.h);
        if (rid && sourceDissid && rid !== sourceDissid) continue;
        let ok = false;
        const first = midOf(f.a[0]);
        for (let j = 0, n = Math.min(fullList.length, 120); !ok && j < n; j++) ok = midOf(fullList[j]) === first;
        if (!ok) continue;
        fill(f.a);
        log('已替换为完整 ' + fullList.length + ' 首');
        return o;
      }
      log('数据对不上，丢弃缓存');
      fullList = null;
      idbDel(CK()); idbDel('diss_' + P);
    } catch (e) {}
    return o;
  };

  const bgTried = new Set();
  function bgPull(id) {
    if (bgTried.has(id)) return;
    bgTried.add(id);
    (async () => {
      const g = await findGtk(id);
      if (g === null) return;
      const r = await pullAll(g, id);
      if (r) { saveCache(r.list, g, r.id); idbSet('diss_' + P, r.id); }
    })();
  }
  // 后台核对：数量真的变了才刷新一次，没变完全不打扰
  function verify(key, cachedLen) {
    if (bgTried.has(key)) return;
    bgTried.add(key);
    (async () => {
      if (isAlbum) {
        const g = await findGtkAlbum();
        if (g === null) return;
        const list = await pullAlbum(g);
        if (!list) return;
        if (!fullList || !fullList.length) fullList = list;
        saveCache(list, g, null);
        if (!cachedLen) {
          // 首次访问（无缓存）：如果页面只拿到短列表且没被补上，补刷一次让缓存生效
          if (!swapped && seenLen > 0 && seenLen < list.length) setTimeout(() => location.reload(), 400);
          return;
        }
        if (list.length === cachedLen) { log('专辑无变化（' + cachedLen + ' 首），不重新加载'); return; }
        log('专辑有变化：' + cachedLen + ' → ' + list.length + '，刷新一次显示最新');
        setTimeout(() => location.reload(), 400);
        return;
      }
      const g = await findGtk(DISSID);
      if (g === null) return;
      const r = await pullAll(g, DISSID);
      if (!r) return;
      saveCache(r.list, g, r.id);
      if (r.list.length === cachedLen) { log('「我喜欢」无变化（' + cachedLen + ' 首），不重新加载'); return; }
      log('「我喜欢」有变化：' + cachedLen + ' → ' + r.list.length + '，刷新一次显示最新');
      setTimeout(() => location.reload(), 500);
    })();
  }

  // ---------- 网络钩子 ----------
  const gate = (p) => (readyRes ? ready.then(() => p()) : p());
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!HOLD.test(url)) return _fetch.apply(this, arguments);
    if (init && typeof init.body === 'string') init.body = patchBody(init.body);
    return gate(() => _fetch.apply(this, arguments));
  };
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { if (HOLD.test(u || '')) this.__q = 1; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    // 非 fcg 的 XHR 完全不碰（省掉正则与 JSON 往返）
    if (!this.__q) return XS.apply(this, arguments);
    const x = this, nb = typeof b === 'string' ? patchBody(b) : b;
    gate(() => XS.call(x, nb));
  };

  // ---------- 主流程 ----------
  (async () => {
    await idbOpen();

    // 专辑页：缓存优先（刷新立刻出全量），后台核对
    if (isAlbum) {
      const rec0 = await idbGet(CK());
      if (rec0 && rec0.list && rec0.list.length) { fullList = rec0.list; log('专辑用缓存秒开 ' + rec0.list.length + ' 首'); }
      verify('al' + albumMid, fullList ? fullList.length : 0);
      return;
    }

    const mapped = await idbGet('diss_' + P);
    if (mapped && !isLike) DISSID = +mapped;
    const rec = await idbGet(CK());
    const cached = rec && rec.list && rec.list.length ? rec.list : null;

    if (isLike) {
      if (cached) {                                  // ① 有缓存 → 秒开，不等网络
        fullList = cached; sourceDissid = DISSID;
        openGate();
        log('「我喜欢」用缓存秒开 ' + cached.length + ' 首');
        verify('v' + DISSID, cached.length);
        return;
      }
      const g = await findGtk(DISSID);                // ② 首次装：等拉完再放行
      const r = g === null ? null : await pullAll(g, DISSID);
      if (r) { fullList = r.list; sourceDissid = r.id; saveCache(r.list, g, r.id); }
      openGate();
      if (r) setTimeout(() => { if (!swapped && document.readyState !== 'loading') location.reload(); }, 2500);
      return;
    }

    // 歌单详情页：尽力而为
    if (cached) { fullList = cached; sourceDissid = rec.disstid || DISSID; openGate(); return; }
    const g2 = await findGtk(DISSID);
    const r2 = g2 === null ? null : await pullAll(g2, DISSID);
    if (r2) { fullList = r2.list; sourceDissid = r2.id; saveCache(r2.list, g2, r2.id); idbSet('diss_' + P, r2.id); }
    openGate();
  })();

  window.__qqLikeFull = async () => { await idbOpen(); await idbDel(CK()); await idbDel('diss_' + P); log('缓存已清，刷新重拉'); };
})();
