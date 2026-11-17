// 简洁音乐播放器（扩展页面）
//  · 歌单列表 / 歌曲列表 / 播放 都走官网自己用的那套接口（见 安装说明.txt）
//  · 扩展页面读不到 y.qq.com 源下的 IndexedDB，所以这里自己拉一份并缓存在扩展自己的库里
//  · 扩展页面读不到页面 cookie，要用 chrome.cookies 拿 uin / 密钥算 g_tk
'use strict';

const LIKE = 795604074;          // 「我喜欢」的真实 disstid
const LIKE_DIRID = 201;          // 「我喜欢」的 dirid（收藏 = 往 dirId 201 增删，官网就是这么做的）
const VER = '3.9.49';            // 玩家界面右上角显示的版本号，方便确认自己跑的是哪份代码
// 排障探针开关（v3.9.41）：__qqTestLike* / __qqLikeAddBG / __qqLikeRmBG / __qqAg1Test / __qqCapLog / __qqDumpDirs
// 等仅用于排查「我喜欢」写入，正常运行不参与任何逻辑。默认关闭以减小内存占用与代码体积；
// 需要时把这里改成 true 重新加载即可恢复这些控制台工具。
const DIAG = false;
const PAGE = 500;                // 服务端单页上限
const DB = 'qq_player', ST = 'kv';
const API = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const STREAM = 'https://ws6.stream.qqmusic.qq.com/';
const audio = document.getElementById('audio');
const $ = (id) => document.getElementById(id);

// ---------- 小工具 ----------
function bkn(s) { let h = 5381; for (let i = 0; i < s.length; i++) h += (h << 5) + s.charCodeAt(i); return h & 0x7fffffff; }
function fmt(sec) { sec = Math.max(0, Math.floor(sec || 0)); return String((sec / 60) | 0).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
const S = (x) => (x && x.songInfo && typeof x.songInfo === 'object') ? x.songInfo : x;
const midOf = (s) => s.mid || s.songmid || '';
const singersOf = (s) => (s.singer || []).map((x) => x.name).filter(Boolean).join('/');
const albumOf = (s) => (s.album && s.album.name) || s.albumname || '';
// 显示名（v3.8.2）：专辑接口的 songInfo 里 name=基础名（"原色"）、title=完整名（"原色（Ist Take Ver.）"），
// 官网显示的是 title。取**更长的那个**，对歌单/搜索来源（name 即全名、无 title 或 title===name）无影响。
const dispName = (s) => { const n = s.name || '', t = s.title || ''; return (t.length > n.length) ? t : (n || t); };
const coverOf = (s) => (s.album && s.album.mid) ? 'https://y.qq.com/music/photo_new/T002R300x300M000' + s.album.mid + '.jpg' : '';
const num = (v) => (typeof v === 'number' ? v : parseInt(v, 10) || 0);
// 是否需要 VIP 才能完整播放（非会员点它会拿不到地址，或播到一半被掐断）
// 官方字段：song.pay.pay_play=1（仅 VIP 可播）/ pay_month=1（绿钻）；部分来源用 song.label 标 "VIP"
const isVipSong = (s) => {
  if (!s) return false;
  const p = s.pay || {};
  if (p.pay_play === 1 || p.pay_month === 1) return true;
  const lb = s.label;
  return typeof lb === 'string' && /VIP|会员|绿钻/i.test(lb);
};

let toastTimer = 0;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  if (ms !== 0) toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2800);
}
// 状态区默认隐藏：只在"真的出问题"时露出来，平时完全安静
// （详细诊断一律走 console.log，需要排查时 F12 可见，不占界面）
function note(msg) {
  const wrap = $('status-wrap');
  if (!wrap) return;
  if (!msg) { wrap.hidden = true; $('side-note').textContent = ''; return; }
  wrap.hidden = false;
  $('side-note').textContent = msg;
}

// ---------- 凭证 + 接口 ----------
let UIN = 0, GTK = 0, GUID = '';
async function cookie(name) {
  try { const c = await chrome.cookies.get({ url: 'https://y.qq.com', name: name }); return c ? c.value : ''; } catch (e) { return ''; }
}
async function initAuth() {
  UIN = +((await cookie('uin')) || (await cookie('wxuin')) || '0').replace(/^o/, '') || 0;
  const key = (await cookie('qm_keyst')) || (await cookie('p_skey')) || (await cookie('skey')) || '';
  GTK = key ? bkn(key) : 0;
  GUID = localStorage.getItem('guid') || '';
  if (!GUID) {
    GUID = String(Math.round(2147483647 * Math.random()) * new Date().getUTCMilliseconds() % 1e10);
    localStorage.setItem('guid', GUID);
  }
  note(UIN ? '' : '未登录\n请点右上角「登录」按钮');
  updateAuth();
}
// 右上角「登录 / 退出」按钮的文案随登录态变化
function updateAuth() {
  const b = $('auth');
  if (!b) return;
  if (UIN) { b.textContent = '退出'; b.title = '退出登录 QQ 音乐'; b.classList.remove('need'); }
  else { b.textContent = '登录'; b.title = '登录 QQ 音乐'; b.classList.add('need'); }
}

// ---------- 登录 / 退出登录 ----------
// 登录（v3.6.5 最终方案 + v3.9.38 优化）：弹一个独立小窗口打开 y.qq.com，注入脚本**直接读取「登录」链接的 href 并在同一窗口内导航到登录页**，
//        因此全程只有这一个窗口（不会再由 y.qq.com 的 window.open 弹第二个登录窗口）。登录发生在 y.qq.com 上下文里，
//        网页版登录 cookie 一定会种到 .qq.com，本页每 2s 轮询 uin，成功后自动关窗并接上歌单。
//        ⚠️ OAuth 授权页方案（v3.6.4）废弃：登录框虽然直达，但 QQ 互联的快捷登录是 token 体系，
//        **不会**把网页版登录 cookie（uin/p_skey/qm_keyst）种到 .qq.com——实测登录后回调页空白、播放器
//        依旧未登录。历史死路：v3.6.0 自绘二维码（图片挂）、v3.6.1 iframe 官方框（appid is invalid）。
// 退出：只清 QQ 音乐相关的登录 cookie（不动其它腾讯服务的会话），然后干净重启到未登录态。
let loginPoll = null, loginWin = null;
function stopLoginPoll() { clearInterval(loginPoll); loginPoll = null; }
async function doLogin() {
  if (UIN) { doLogout(); return; }
  let tabId = null;
  try {
    const w = await chrome.windows.create({ url: 'https://y.qq.com/?noplayer=1', type: 'popup', width: 1020, height: 720 });
    loginWin = w && typeof w.id === 'number' ? w.id : null;
    tabId = w && w.tabs && w.tabs[0] && typeof w.tabs[0].id === 'number' ? w.tabs[0].id : null;
  } catch (e) { location.href = 'https://y.qq.com/?noplayer=1'; return; }
  toast('已打开登录窗口，正在直接跳到登录页…');
  autoGotoLogin(tabId);                                      // 同窗口内导航到登录页，避免再弹第二个窗口
  stopLoginPoll();
  let n = 0;
  loginPoll = setInterval(async () => {
    try {
      if (loginWin != null) {
        const w = await chrome.windows.get(loginWin).catch(() => null);
        if (!w) { stopLoginPoll(); return; }                 // 用户自己把窗口关了 → 停止轮询
      }
      await initAuth(); updateAuth();
      if (UIN) {
        if (loginWin != null) { try { await chrome.windows.remove(loginWin); } catch (e) {} }
        loginWin = null;
        stopLoginPoll();
        toast('登录成功');
        try { await loadPlaylists(); await open('like', LIKE, LIKE_DIRID, '我喜欢', false, 'like'); await loadLikeMids().catch(() => {}); } catch (e) {}
      } else if (++n > 150) stopLoginPoll();                 // 5 分钟上限
    } catch (e) {}
  }, 2000);
}
// v3.9.38：在登录窗口里**尽量把「登录」链接的 href 直接用在当前标签内打开**（同一窗口），
//  避免 y.qq.com 的登录按钮用 window.open 再弹第二个窗口。拿不到 href（按钮是 JS 触发、无链接）时
//  回退到旧行为：点一下让官方登录框弹出来（功能仍可用，只是可能多一个窗口）。
//  扩展页碰不到那个页面的 DOM，用 chrome.scripting 注入；首页没加载好就 1s 后重试（最多 12 次）。
function autoGotoLogin(tabId) {
  if (tabId == null || !chrome.scripting || !chrome.scripting.executeScript) return;
  let clicks = 0;
  const tryNav = () => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        try {
          // 优先找带登录 href 的 <a>（通常是 xui.ptlogin2.qq.com 的登录页，绝对地址）
          const a = document.querySelector('a[class*="login"], [class*="login"] a, a[href*="ptlogin"], a[href*="xlogin"]');
          if (a && a.href) return a.href;                        // 返回绝对地址 → 扩展在同标签内导航
          // 退而求其次：找文本为「登录」的纯文本元素
          const nodes = document.querySelectorAll('a,button,span,div,li');
          for (const el of nodes) {
            if (el.children.length === 0 && (el.textContent || '').trim() === '登录') {
              if (el.href) return el.href;                       // 有 href 就同标签导航
              return 'click';                                    // 无 href：只能点（可能弹第二个窗口）
            }
          }
          return 'not-found';
        } catch (e) { return 'err'; }
      }
    }).then((rs) => {
      const r = rs && rs[0] && rs[0].result;
      if (typeof r === 'string' && /^https?:\/\//.test(r)) {
        // 同一标签内直接导航到登录页 → 全程只有一个窗口
        chrome.tabs.update(tabId, { url: r }).catch(() => {});
        return;
      }
      // 拿不到可用 href：回退旧行为，点一下登录按钮（最多 12 次重试）
      if (r === 'click' || r === 'not-found' || r === 'err') {
        if (clicks++ < 12) {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              const nodes = document.querySelectorAll('a,button,span,div,li');
              for (const el of nodes) {
                if (el.children.length === 0 && (el.textContent || '').trim() === '登录') { el.click(); return; }
              }
              const a = document.querySelector('a[class*="login"], [class*="login"] a');
              if (a) a.click();
            }
          });
          setTimeout(tryNav, 1000);
        }
      }
    }).catch(() => {});
  };
  setTimeout(tryNav, 800);                                       // 等首页加载后再取登录链接
}
async function doLogout() {
  if (!confirm('确定退出登录 QQ 音乐？当前播放会停止。')) return;
  const names = ['uin', 'p_uin', 'p_skey', 'skey', 'lskey', 'p_luin', 'p_lskey',
    'qm_keyst', 'wxuin', 'wxkey', 'login_type', 'qqmusic_key', 'qqmusic_uin',
    'tme_ad_uin', 'tme_ad_pass', 'vus_session', 'vus_sess', 'vqq_openid', 'vqq_appid'];
  if (chrome && chrome.cookies && chrome.cookies.getAll && chrome.cookies.remove) {
    // 必须用 y.qq.com 作锚点枚举；仅声明 *.y.qq.com 时，getAll({}) 不会暴露 .qq.com 父域 cookie。
    let list = [];
    const seen = new Set();
    function addAll(arr) {
      for (const c of arr) {
        if (!c || !c.name) continue;
        const key = (c.storeId || '') + '|' + c.domain + '|' + c.path + '|' + c.name;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(c);
      }
    }
    try { addAll(await chrome.cookies.getAll({ url: 'https://y.qq.com' })); } catch (e) { console.error('[auth] getAll url', e); }
    // 再兜底扫一遍相关 domain（兼容不同 Chrome 对 getAll url 的返回范围）
    try { addAll(await chrome.cookies.getAll({ domain: 'qq.com' })); } catch (e) {}
    try { addAll(await chrome.cookies.getAll({ domain: 'y.qq.com' })); } catch (e) {}

    for (const c of list) {
      if (c.domain.indexOf('qq.com') < 0) continue;          // 只碰 QQ 系 cookie
      if (names.indexOf(c.name) < 0) continue;                // 只清登录态相关的那几个
      // 用 cookie 真实 domain/path/secure 构造最精确的删除 URL
      const proto = c.secure ? 'https:' : 'http:';
      const host = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
      const urls = [
        proto + '//' + host + c.path,
        'https://y.qq.com' + c.path,
        'https://qq.com' + c.path
      ];
      let removed = false;
      for (const url of urls) {
        if (removed) break;
        try { await chrome.cookies.remove({ url, name: c.name, storeId: c.storeId }); removed = true; }
        catch (e) { console.error('[auth] remove', c.name, url, e); }
      }
    }
  }
  // 清完再读一次 uin，确认真的退出了；如果 .qq.com cookie 还是清不掉，就不 reload，给出提示。
  const still = await cookie('uin');
  if (still) {
    toast('退出未生效：浏览器仍保留 QQ 登录态，请手动清除 y.qq.com / .qq.com 的 cookie 后刷新');
    return;
  }
  // ⚠️ 本地歌曲缓存（list_/al_）也要清：不清的话重载后会从缓存把「我喜欢」整页又画出来，
  //    用户看到的就是"退出后依然显示我喜欢的歌单页面"（v3.5.3）
  try {
    if (db) await new Promise((res) => {
      try { const q = db.transaction(ST, 'readwrite').objectStore(ST).clear(); q.onsuccess = q.onerror = res; } catch (e) { res(); }
    });
  } catch (e) {}
  toast('已退出登录');
  location.reload();                                         // 干净重启到未登录态（会停掉音乐，符合换号预期）
}
async function api(req1) {
  const res = await fetch(API + '?format=json&platform=yqq.json&g_tk=' + GTK, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comm: { cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1, uin: UIN, g_tk: GTK, g_tk_new_20200303: GTK },
      req_1: req1
    })
  });
  const j = await res.json();
  const r = (j && j.req_1) || {};
  if (r.code === 1000) { const e = new Error('需要先登录 QQ 音乐'); e.login = true; throw e; }
  return r;
}
// 老式 GET 接口（c.y.qq.com/xxx.fcg）——列歌单用的是这一套
// 这类老接口通常还要带 g_tk（官网的请求封装里是自动加的），这里显式带上
async function getJSON(host, params) {
  const p = Object.assign({ format: 'json', g_tk: GTK }, params);
  const q = Object.keys(p).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
  const url = 'https://' + host + '?' + q;
  let res, txt;
  try {
    res = await fetch(url, { credentials: 'include' });
    txt = await res.text();
  } catch (e) { throw new Error('请求失败：' + (e && e.message ? e.message : e)); }
  let j = null;
  try { j = JSON.parse(txt); } catch (e) { throw new Error('HTTP ' + (res && res.status) + ' 非JSON：' + String(txt).slice(0, 40)); }
  if (j && j.code === 1000) { const e = new Error('需要先登录 QQ 音乐'); e.login = true; throw e; }
  return j || {};
}

// ---------- 扩展自己的 IndexedDB ----------
let db = null;
function openDB() {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(ST); } catch (e) {} };
      r.onsuccess = () => res(db = r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
const kvGet = (k) => new Promise((res) => { if (!db) return res(null); try { const q = db.transaction(ST, 'readonly').objectStore(ST).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } });
const kvSet = (k, v) => new Promise((res) => { if (!db) return res(false); try { const q = db.transaction(ST, 'readwrite').objectStore(ST).put(v, k); q.onsuccess = () => res(true); q.onerror = () => res(false); } catch (e) { res(false); } });

// ---------- 歌单 ----------
let mine = [], fav = [], albums = [];    // 我创建的 / 我收藏的歌单 / 我收藏的专辑
let curKey = 'like', curTid = LIKE, curDirId = LIKE_DIRID, curName = '我喜欢', curMine = false, curKind = 'like';
let all = [], view = [], idx = -1;
let searching = false, savedAll = [], searchSeq = 0;   // 全库搜索状态
let playingSong = null;                  // 正在播放的歌（切换歌单/专辑时保持不变，音乐不会中断）
let likeMids = new Set();                // 「我喜欢」里所有歌的 mid（用于每行 ♥ 状态显示，v3.9.22）
let likeList = [];                       // v3.9.42：loadLikeMids 重拉到的权威完整列表（用于写回缓存，避免从别处加歌后打开看不到）
const CHUNK = 150;
const sameSong = (a, b) => { if (!a || !b) return false; const m = midOf(a); return m !== '' && m === midOf(b); };
// 缓存键：专辑用 al_，歌单用 list_
const ckKey = () => (curKind === 'album' ? 'al_' : 'list_') + curTid;

// 歌单对象各家字段名不一，这里做宽容取值（有的包一层 playlist/dirinfo）
// ⚠️ 老接口小写（dissid/dissname/dirname/songnum）、新接口驼峰（dirName/songNum）都要兜
function mapPl(raw) {
  const p = (raw && (raw.dissname || raw.dirname || raw.dirName || raw.name)) ? raw : ((raw && (raw.playlist || raw.dirinfo || raw.base)) || raw || {});
  return {
    tid: num(p.tid || p.dissid || p.diss_id || p.dirid || p.dir_id || p.id || p.content_id),
    dirid: num(p.dirid || p.dirId || p.dir_id),
    name: p.dissname || p.diss_name || p.dirname || p.dirName || p.name || p.title || '(未命名歌单)',
    count: num(p.songnum || p.songNum || p.song_cnt || p.listennum)
  };
}
// 专辑对象（收藏的专辑）字段同样不统一
// ⚠️ 老接口（.fcg）用**全小写**：albummid / albumname / songnum / singername
//    新接口（musicu）用驼峰：albumMid / albumName → 两边都要兜
function mapAlbum(raw) {
  return {
    tid: raw.albummid || raw.albumMid || raw.albumMID || raw.album_mid || raw.mid || '',
    dirid: 0,
    name: raw.albumname || raw.albumName || raw.album_name || raw.name || raw.title || '(未命名专辑)',
    count: num(raw.songnum || raw.songNum || raw.song_cnt || raw.total_song_num || raw.listennum),
    singer: raw.singername || raw.singerName || raw.singer_name || (raw.singer && raw.singer[0] && raw.singer[0].name) || ''
  };
}
const keysOf = (d) => (d && typeof d === 'object' ? (Object.keys(d).join(',') || '(空对象)') : (d === undefined ? '(无 data)' : typeof d));
// 只做"必须"的过滤：
//   · 创建列表里 dirid 200~210 是系统目录（201=我喜欢、205=QZone背景音乐、206=本地上传），排除
//     ⚠️ 但**收藏列表不能套这条** —— 收藏来的歌单不是系统目录，套上去会把它们全丢掉
//   · dir_show===2（私密歌单）**不过滤**：官网看自己主页时是要收的
function normPl(raw, isCreated) {
  return raw.map(mapPl).filter((p) => p.tid && !(isCreated && p.dirid > 200 && p.dirid < 210));
}

// 依次尝试多组参数，返回第一个真的拿到列表的结果；把每次的结果记到 dg 里便于排查
async function tryList(tries, keys, dg) {
  for (const t of tries) {
    try {
      const r = await getJSON(t.host, t.params);
      const data = r.data || {};
      let arr = [];
      for (const k of keys) { if (Array.isArray(data[k]) && data[k].length) { arr = data[k]; break; } }
      dg.push(t.tag + ' code=' + r.code + ' keys=' + keysOf(r.data) + ' n=' + arr.length);
      if (arr.length) {
        dg.push(t.tag + ' 首项字段=' + Object.keys(arr[0]).slice(0, 16).join(','));
        return arr;
      }
    } catch (e) { dg.push(t.tag + ' ✗ ' + (e && e.message ? e.message : e)); }
  }
  return [];
}

// 官网的「创建的歌单」和「收藏的歌单」是**两个不同接口**，不是一份列表按字段分组
async function loadPlaylists() {
  const dg = [];
  // 创建：官网的 fcg_user_created_diss 实测会返回 5000/2000（拿不到 data），
  //       所以实测可用的 v_playlist 才是主力，legacy 只作为备选
  let cRaw = [];
  try {
    const r = await api({ module: 'music.musicasset.PlaylistBaseRead', method: 'GetPlaylistByUin', param: { uin: String(UIN), bWithoutStatus: false } });
    cRaw = (r.data && (r.data.v_playlist || r.data.playlist)) || [];
    dg.push('创建 v_playlist n=' + cRaw.length + (cRaw[0] ? ' 首项字段=' + Object.keys(cRaw[0]).slice(0, 16).join(',') : ''));
  } catch (e) { dg.push('创建 v_playlist ✗ ' + (e && e.message ? e.message : e)); }
  if (!cRaw.length) {
    cRaw = await tryList([
      { tag: '创建', host: 'c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss', params: { r: Date.now(), hostuin: UIN, sin: 0, size: 200 } },
      { tag: '创建0', host: 'c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss', params: { r: Date.now(), hostuin: 0, sin: 0, size: 200 } }
    ], ['disslist', 'list'], dg);
  }
  const fRaw = await tryList([
    { tag: '收藏', host: 'c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg', params: { ct: 20, cid: 205360956, userid: UIN, reqtype: 3, sin: 0, ein: 200 } },
    { tag: '收藏0', host: 'c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg', params: { ct: 20, cid: 205360956, userid: 0, reqtype: 3, sin: 0, ein: 200 } }
  ], ['cdlist', 'list'], dg);
  // 收藏的专辑：同一个接口，reqtype=2 → data.albumlist
  const aRaw = await tryList([
    { tag: '专辑', host: 'c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg', params: { ct: 20, cid: 205360956, userid: UIN, reqtype: 2, sin: 0, ein: 200 } }
  ], ['albumlist', 'list'], dg);

  mine = normPl(cRaw, true);
  fav = normPl(fRaw, false);
  albums = aRaw.map(mapAlbum).filter((a) => a.tid);

  renderSide();
  // 详细诊断只进控制台（F12 可见），界面保持干净
  console.log('[player] 歌单诊断\n' + dg.join('\n')
    + '\n创建 ' + mine.length + ' / 收藏歌单 ' + fav.length + ' / 收藏专辑 ' + albums.length);
  // 只有真的出问题才在界面上提示
  const bad = [];
  if (!UIN) bad.push('未登录：请点右上角「网页版」登录 QQ 音乐');
  else if (!mine.length && !fav.length && !albums.length) bad.push('没能读到歌单/专辑（接口异常，稍后刷新）');
  if (!albums.length && aRaw.length) bad.push('收藏的专辑字段没认出来：' + Object.keys(aRaw[0]).slice(0, 12).join(','));
  note(bad.join('\n'));
}
function sideItem(p, kind) {
  const a = document.createElement('a');
  a.className = 'side-item';
  a.href = '#';
  a.dataset.key = kind + ':' + p.tid;
  a.dataset.kind = kind;
  a.dataset.tid = p.tid;
  a.dataset.dirid = p.dirid;
  a.dataset.name = p.name;
  a.dataset.mine = kind === 'm' ? '1' : '';
  const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name;
  const n = document.createElement('span'); n.className = 'num'; n.textContent = p.count ? p.count : '';
  a.appendChild(nm); a.appendChild(n);
  if (kind === 'm' && (p.dirid || p.tid)) {                      // 自己创建的歌单可删
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.title = '删除歌单'; rm.textContent = '×';
    rm.dataset.del = p.dirid || p.tid;
    a.appendChild(rm);
  }
  if (kind === 'a' && p.tid) {                                   // 收藏的专辑可取消收藏（接口同官方专辑页）
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.title = '取消收藏'; rm.textContent = '×';
    rm.dataset.unfav = p.tid;
    a.appendChild(rm);
  }
  return a;
}
function renderSide() {
  const fill = (nav, list, kind, empty) => {
    nav.textContent = '';
    list.forEach((p) => nav.appendChild(sideItem(p, kind)));
    if (!list.length && empty) { const d = document.createElement('div'); d.className = 'side-note'; d.textContent = '（无）'; nav.appendChild(d); }
  };
  fill($('nav-mine'), mine, 'm', true);
  fill($('nav-fav'), fav, 'f', true);
  fill($('nav-album'), albums, 'a', true);
  markSide();
}
function markSide() {
  document.querySelectorAll('.side-item').forEach((el) => el.classList.toggle('on', el.dataset.key === curKey));
}
function sideClick(e) {
  const rm = e.target.closest ? e.target.closest('.rm') : null;
  if (rm) {
    e.preventDefault(); e.stopPropagation();
    if (rm.dataset.del) delPl(+rm.dataset.del);                  // 删除自己创建的歌单
    else if (rm.dataset.unfav) unfavAlbum(rm.dataset.unfav);     // 取消收藏专辑
    return;
  }
  const a = e.target.closest ? e.target.closest('.side-item') : null;
  if (!a) return;
  e.preventDefault();
  open(a.dataset.key, a.dataset.tid, +a.dataset.dirid || 0, a.dataset.name, a.dataset.mine === '1', a.dataset.kind);
}

// ---------- 歌曲 ----------
async function pullSongs(tid) {
  const out = [];
  const isLike = +tid === LIKE;
  for (let begin = 0; begin < 100000; begin += PAGE) {
    const param = { disstid: +tid, song_begin: begin, song_num: PAGE, ctx: 1 };
    // 别人的歌单（收藏来的）按官网的写法多带几个参数，自己的/我喜欢只带已验证过的最小集
    if (!isLike) { param.userinfo = 1; param.tag = 1; param.orderlist = 1; param.onlysonglist = 0; param.enc_host_uin = ''; }
    const r = await api({ module: 'music.srfDissInfo.aiDissInfo', method: 'uniform_get_Dissinfo', param: param });
    const d = r.data || {};
    const list = d.songInfoList || d.songlist || d.songList || [];
    if (!list.length) break;
    for (const s of list) out.push(s);
    if (list.length < PAGE) break;
  }
  return out;
}
function use(list) {
  all = list.map(S);
  view = all.slice();
  // 正在播放的那首如果也在这一栏里，就把它标出来（切回来还能看到）；不在就置 -1
  idx = playingSong ? view.findIndex((s) => sameSong(s, playingSong)) : -1;
  render();
}
// ---------- 全库搜索（v3.8.0） ----------
// 接口：music.search.SearchCgiService / DoSearchForQQMusicDesktop（y.qq.com 网页版搜索同款）
// 返回 data.body.song.list[]，字段与歌单歌曲一致（mid/id/name/singer/album/interval/file），可直接播放/加歌单。
async function doSearch(q) {
  const seq = ++searchSeq;
  fail('正在搜索「' + q + '」…');
  try {
    const r = await api({ module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: { query: q, page_num: 1, num_per_page: 30 } });
    if (seq !== searchSeq) return;                             // 期间又输入了新词 → 丢弃旧结果
    const d = (r.data && (r.data.body || r.data)) || {};
    const list = (((d.song || {}).list) || []).map((x) => { const s = S(x); if (typeof s.type !== 'number') s.type = 0; return s; });
    if (!searching && all.length) savedAll = all.slice();      // 第一次进搜索：记住当前歌单，方便恢复
    searching = true;
    $('list-name').textContent = '搜索：「' + q + '」';
    if (!list.length) { all = []; view = []; idx = -1; render(); fail('没有搜到「' + q + '」相关的歌曲'); return; }
    use(list);
  } catch (e) { fail('搜索失败：' + (e && e.message ? e.message : e)); }
}
function exitSearch() {
  searching = false;
  searchSeq++;                                                 // 作废在途的搜索响应
  if (savedAll.length) { use(savedAll); $('list-name').textContent = curName; }
  else { all = []; view = []; idx = -1; render(); }
  savedAll = [];                                               // 用完即释放：大歌单 2600+ 首的数组别一直攥着（v3.8.3）
}
function rowEl(i) {
  const s = view[i];
  const el = document.createElement('div');
  el.className = 'row' + (sameSong(s, playingSong) ? ' cur' : '');
  el.dataset.i = i;
  const t = document.createElement('span'); t.className = 'c-title';
  const b = document.createElement('b'); b.textContent = dispName(s) || '(无标题)';
  t.appendChild(b);
  if (s.subtitle) { const it = document.createElement('i'); it.textContent = s.subtitle; t.appendChild(it); }
  const cells = [['c-idx', String(i + 1)], null, ['c-singer', singersOf(s)], ['c-album', albumOf(s)], ['c-time', fmt(s.interval)]];
  for (const c of cells) {
    if (c === null) { el.appendChild(t); continue; }
    const sp = document.createElement('span'); sp.className = c[0]; sp.textContent = c[1]; el.appendChild(sp);
  }
  const act = document.createElement('span'); act.className = 'c-act';
  // v3.9.26：移除每行常显 ♥（用户要求只保留底部 ♥ 切换当前播放歌），保留 ＋（加入歌单）/ －（移除）。
  const add = document.createElement('button');
  add.className = 'mini'; add.title = '加入歌单'; add.textContent = '＋'; add.dataset.add = i;
  act.appendChild(add);
  if (curDirId && !searching) {                                // 搜索结果不属于任何歌单 → 不显示「－」（v3.8.0）
    const del = document.createElement('button');
    del.className = 'mini dang';
    del.title = curKey === 'like' ? '取消喜欢' : '从本歌单移除';
    del.textContent = '－'; del.dataset.del = i;
    act.appendChild(del);
  }
  el.appendChild(act);
  return el;
}
function render() {
  const box = $('rows');
  box.textContent = '';
  const tip = $('tip');
  tip.hidden = view.length > 0;
  if (!view.length && all.length) tip.textContent = '没有匹配的歌曲';
  $('count').textContent = view.length + (view.length === all.length ? ' 首' : ' / ' + all.length + ' 首');
  let i = 0;
  (function step() {
    const frag = document.createDocumentFragment();
    for (let n = 0; n < CHUNK && i < view.length; n++, i++) frag.appendChild(rowEl(i));
    box.appendChild(frag);
    if (i < view.length) requestAnimationFrame(step);
  })();
  syncCurHeart();   // v3.9.26：每次渲染后同步底部 ♥ 状态
}
function fail(msg) { $('tip').hidden = false; $('tip').textContent = msg; }

// 专辑曲目（收藏的专辑点进去看）：songList 里的每项是 {songInfo:{...}}，use() 会拆开
async function pullAlbumSongs(mid) {
  const out = [];
  for (let begin = 0; begin < 5000; begin += 200) {
    const r = await api({ module: 'music.musichallAlbum.AlbumSongList', method: 'GetAlbumSongList', param: { albumMid: mid, albumID: 0, begin: begin, num: 200, order: 2 } });
    const d = r.data || {};
    const list = d.songList || d.songlist || [];
    if (!list.length) break;
    for (const s of list) out.push(s);
    if (list.length < 200 || (d.totalNum && out.length >= +d.totalNum)) break;
  }
  return out;
}
const pullByKind = (tid, kind) => (kind === 'album' ? pullAlbumSongs(tid) : pullSongs(tid));

async function open(key, id, dirid, name, isMine, kind) {
  // ⚠️ 侧栏给的 kind 是 'a'（专辑），内部统一用 'album'；之前两边不一致，
  //    结果专辑去走了歌单接口（拿 mid 当 disstid）→ 永远 0 首
  curKind = (kind === 'album' || kind === 'a') ? 'album' : (kind === 'like' ? 'like' : 'pl');
  curTid = curKind === 'album' ? String(id) : +id;
  curKey = key; curDirId = dirid || 0; curName = name; curMine = !!isMine;
  $('list-name').textContent = name;
  $('q').value = '';
  searching = false;                                           // 切歌单即退出搜索态（v3.8.0）
  savedAll = [];                                               // 顺手释放搜索前快照（v3.8.3 内存）
  markSide();
  // ⚠️ 这里**不要** pause：切换歌单/专辑时音乐要接着放（之前多了一句 audio.pause()，一切换就断）
  const rec = await kvGet(ckKey());
  if (rec && rec.list && rec.list.length) { use(rec.list); refresh(); return; }
  all = []; view = []; idx = -1; render();
  fail('正在读取「' + name + '」…');
  try {
    const list = await pullByKind(curTid, curKind);
    if (!list.length) { fail('这里没有读到歌曲（可能是空的，或受版权限制）。'); return; }
    await kvSet(ckKey(), { ts: Date.now(), list: list });
    use(list);
  } catch (e) { fail(e && e.login ? '需要先点右上角「网页版」登录 QQ 音乐。' : ('读取失败：' + (e && e.message))); }
}
async function refresh() {
  // ⚠️ 防竞态：这个函数是"打开后顺手核对一下"，不 await。
  //    如果期间用户又切了别的歌单/专辑，它回来时必须丢弃结果，
  //    否则会拿旧列表的数据把新列表覆盖掉（显示错位一拍）。
  const tid = curTid, kind = curKind, key = ckKey();
  try {
    const list = await pullByKind(tid, kind);
    if (tid !== curTid || kind !== curKind) return;      // 已经切走了 → 丢弃
    if (!list.length) return;
    await kvSet(key, { ts: Date.now(), list: list });
    if (tid !== curTid || kind !== curKind) return;      // 写库期间又切走了 → 不再动界面
    if (list.length !== all.length) use(list);                // v3.9.39：静默更新，不再弹「已更新 N 首」toast
  } catch (e) {}
}

// ---------- 播放地址 / 播放 ----------
const urlCache = new Map();
const firstPurl = (d) => (d && d.midurlinfo && d.midurlinfo[0] && d.midurlinfo[0].purl) || '';
async function fetchUrl(song) {
  const mid = midOf(song);
  const media = (song.file && song.file.media_mid) || mid;
  const base = { guid: GUID, songmid: [mid], songtype: [0], uin: String(UIN), loginflag: 1, platform: '20' };
  let r = await api({ module: 'music.vkey.GetEVkey', method: 'GetUrl', param: Object.assign({ xcdn: 1, filename: ['RS02' + media + '.mp3'] }, base) });
  let d = r.data, purl = firstPurl(d);
  if (!purl) {                                     // 兜底：另一套 vkey 接口
    r = await api({ module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: Object.assign({ filename: ['M500' + media + '.mp3'] }, base) });
    d = r.data; purl = firstPurl(d);
  }
  if (!purl) throw new Error('拿不到播放地址（可能需要 VIP 或受版权限制）');
  const host = (d && d.thirdip && d.thirdip[0]) || STREAM;
  const full = /^https?:\/\//i.test(purl) ? purl : host + purl;
  // 扩展页面是安全上下文：地址必须升级成 https，否则会被当混合内容拦掉
  return full.replace(/^http:\/\//i, 'https://');
}
async function resolve(song) {
  const mid = midOf(song);
  const hit = urlCache.get(mid);
  if (hit && hit.exp > Date.now() / 1000) {          // 命中：挪到"最近使用"（真 LRU，Map 迭代序即插入序）
    urlCache.delete(mid); urlCache.set(mid, hit);
    return hit.url;
  }
  if (hit) urlCache.delete(mid);                     // 已过期的先清掉，别占位置
  const url = await fetchUrl(song);
  urlCache.set(mid, { url: url, exp: Math.floor(Date.now() / 1000) + 1800 });
  // 上限 120 条（≈每条 200B，几万字节封顶；30 秒一首也够连续循环一小时）。淘汰最久未用的。
  if (urlCache.size > 120) urlCache.delete(urlCache.keys().next().value);
  return url;
}

let mode = localStorage.getItem('mode') || 'list';   // list | one | rand
const MODE_TXT = { list: '🔁', one: '🔂', rand: '🔀' };
const MODE_NM = { list: '列表循环', one: '单曲循环', rand: '随机播放' };
// v3.9.37：自动跳过「拿不到播放地址」的歌（VIP/版权限制，通常就是非会员）：仅「自动连播」时触发，
// 且只在 resolve 真的失败时跳 —— VIP 用户能正常拿到地址，所以 VIP 歌照常播放，非会员连播时不会卡住。
let autoSkip = 0;                                       // 连续自动跳过的计数，防止全是 VIP/版权歌时死循环
function setPlayBtn() { $('play').textContent = audio.paused ? '▶' : '❚❚'; }
function showNp(song) {
  $('np-name').textContent = dispName(song) || '';
  $('np-singer').textContent = singersOf(song);
  const c = coverOf(song);
  const img = $('np-cover');
  if (c) { img.src = c; img.hidden = false; $('np-cover-txt').hidden = true; }
  else { img.hidden = true; $('np-cover-txt').hidden = false; }
}
function markCur(i) {
  // v3.9.49：querySelector 命中即停（.cur 全表只有 1 个），不再 forEach 全量扫描
  const prev = $('rows').querySelector('.row.cur');
  if (prev) prev.classList.remove('cur');
  const row = $('rows').querySelector('.row[data-i="' + i + '"]');
  if (row) row.classList.add('cur');
}
async function play(i, auto, dir) {
  if (i < 0 || i >= view.length) return;
  idx = i;
  const song = view[i];
  playingSong = song;
  markCur(i);
  showNp(song);
  $('t-all').textContent = fmt(song.interval);
  audio.pause();
  try {
    audio.src = await resolve(song);
    await audio.play();
    autoSkip = 0;                                       // 成功播出来 → 连跳计数清零
  } catch (e) {
    // 连播（自动切歌/播完）时撞上 VIP 歌且拿不到地址 → 按原方向继续找可播的歌，不再"播到一半卡住"
    if (auto) {
      if (autoSkip++ > view.length) { autoSkip = 0; toast('列表里没有可播放的歌曲，已停止'); setPlayBtn(); return; }
      toast('已跳过：' + (dispName(song) || '这首歌') + '（需要 VIP 或受版权限制）');
      go(dir || 1);
      setPlayBtn();
      return;
    }
    toast(e && e.message ? e.message : '播放失败');
  }
  setPlayBtn();
  syncCurHeart();                                                  // v3.9.28：切歌后立即同步底部 ♥ 状态
  if (i + 1 < view.length) resolve(view[i + 1]).catch(() => {});   // 预取下一首
}
function go(n) {
  if (!view.length) return;
  const len = view.length;
  const i = mode === 'rand' ? Math.floor(Math.random() * len) : ((idx + n + len) % len);
  play(i, true, n);
}

// ---------- 歌单管理 ----------
// v3.9.8（关键修复）：AddSonglist/DelSonglist 的 v_songInfo 必须用 **songType: 13**。
// 之前发 s.type（通常是 0）或不带 → 服务端解析不到这首歌 → 新加入直接报 code 80105；
// 而"已存在"的歌会被去重逻辑短路返回 code 0 —— 这就是之前"已加入/已经在里面"方向反了的真正根因
// （80105 根本不是"歌曲已存在"，那是个真错误码，v3.9.4 起一直理解反了）。
// "是否重复"要看响应 data.result.songlist[].existed（1=已存在，0=新加入），见 addSongs。
// 取歌曲数字 id：不同接口字段名不一样（id / songid / song_id），统一兜底。
const songIdOf = (s) => (s.id != null ? s.id : (s.songid != null ? s.songid : (s.song_id != null ? s.song_id : undefined)));
const songKey = (s, dirId) => {
  // v3.9.26：只取 s.id 会漏掉「我喜欢」/歌单详情（uniform_get_Dissinfo）里的 s.songid，导致写请求 songId=undefined。
  const k = { songType: 13, songId: songIdOf(s) };
  // 「我喜欢」(dirId 201) 必须用 songMid（字符串）定位，纯 songId 会 80105；普通歌单只用 songId 即可
  if (+dirId === 201) { const m = midOf(s); if (m) k.songMid = m; }
  return k;
};
// 收进「我喜欢」是否重复，完全以**服务端回答为准**（AddSonglist 返回 code 80105 = 歌曲已在歌单里）。
// 不前置查红心（IsSongFanByMid）：v3.9.3 那版前置查会误判（把所有歌都当成"已收藏"），
// 所以这里只在写失败后读 80105 来翻译成友好提示，避免再踩"前置查把方向判反"的坑。
async function addSongs(dirId, songs) {
  const v_songInfo = songs.map((s) => {
    if (+dirId === 201) {
      // 「我喜欢的」：实测只认 songMid——带 songId 反而 80105（backendSongId=0，服务端解析不到）。
      // 与 __qqLikeAddBG 同构（那套在真实账户上 code 0）。普通歌单(dirId≠201)才用 songId。
      const m = midOf(s);
      if (!m) throw new Error('这首歌缺少 mid，无法加入「我喜欢」');
      return { songType: 13, songMid: m };
    }
    return songKey(s, dirId);
  });
  if (+dirId !== 201 && v_songInfo.some((v) => !v.songId)) throw new Error('这首歌缺少 id，无法加入歌单');
  const r = await api({ module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: dirId, v_songInfo: v_songInfo } });
  // 诊断：把请求和完整响应都打进控制台（F12 可见），再出问题一眼能对出服务端原文
  console.log('[addSongs] dirId=' + dirId + ' req=' + JSON.stringify(v_songInfo) + ' resp=' + JSON.stringify(r).slice(0, 500));
  // code≠0 = 真错误（80105 通常是 songType 不对导致服务端解析不到歌，不是"已存在"）
  if (r.code !== 0) { const err = new Error('加入失败（code ' + r.code + '）'); err.code = r.code; throw err; }
  // code=0 时再分"新加入 / 已存在"：data.result.songlist[].existed（1=已存在，0=新加入）
  const it = (r.data && r.data.result && Array.isArray(r.data.result.songlist) && r.data.result.songlist[0]) || null;
  return { existed: !!(it && it.existed) };
}
async function delSong(dirId, song) {
  // v3.9.49：删除 dirId 201 的明文多策略分支与 legacy fcg（delLikeLegacy/songNumericId/GTK_LEGACY 一并清除）
  // —— v3.9.29 起「我喜欢」删除一律走 writeLike → ag-1 加密通道，delSong 只会被普通歌单（dirId≠201）调用。
  const v = songKey(song, dirId);
  if (!v.songId) throw new Error('这首歌缺少 id，无法移除');
  const r = await api({ module: 'music.musicasset.PlaylistDetailWrite', method: 'DelSonglist', param: { dirId: dirId, v_songInfo: [v] } });
  console.log('[delSong] dirId=' + dirId + ' req=' + JSON.stringify(v) + ' resp=' + JSON.stringify(r).slice(0, 500));
  if (r.code !== 0) { const err = new Error('移除失败（code ' + r.code + '）'); err.code = r.code; throw err; }
}
// 「我喜欢的」(dirId 201) 写入：当前账户下明文 musicu AddSonglist/DelSonglist 全部 80105、
// legacy fcg_music_delbatchsong.fcg 全 404（v3.9.28 实机坐实），唯一能写的是官网自己的 ag-1 加密通道
// （u6.y.qq.com musics.fcg，扩展算不出 sign）。所以这里一律走 ag-1：后台借官网歌曲详情页点官方 ♥，
// 发完重拉整张「我喜欢」列表，以服务端真实增减为唯一判据。
// op: 'add' | 'remove'；返回 {ok, already?, nowOn?}，失败抛 Error（带中文提示）。
async function writeLike(op, song) {
  const m = midOf(song);
  if (!m) throw new Error('这首歌缺少 mid，无法收藏');
  const wantOn = (op === 'add');
  if (likeMids.has(m) === wantOn) {        // 已处于目标状态，无需再发（避免来回误 toggle）
    console.log('[writeLike] mid=' + m + ' 已是' + (wantOn ? '已喜欢' : '未喜欢') + '，跳过');
    return { ok: true, already: true };
  }
  showBusy(wantOn ? '正在加入「我喜欢」…' : '正在取消「我喜欢」…');   // v3.9.38：操作期间显示"加载中"，结束即隐藏
  try {
    const r = await ag1Fallback(op, m);
    if (!r || !r.clicked) throw new Error('加密通道未生效：' + ((r && r.error) || '看后台 [QQCAP-BG]'));
    await new Promise((res) => setTimeout(res, 1000));   // 等 ag-1 写请求落库（v3.9.36：由 1300 降到 1000，配合后台事件驱动关窗整体更快）
    await loadLikeMids();                                // 重拉整张「我喜欢」，建立权威 mid 集合 + 对齐 UI
    const nowOn = likeMids.has(m);
    if (nowOn === wantOn) { await cacheLike(); return { ok: true, nowOn }; }
    throw new Error('「我喜欢的」' + (wantOn ? '加入' : '取消') + '未生效，请重试');
  } finally {
    hideBusy();
  }
}
// v3.9.38：加/删「我喜欢的」时的"加载中"提示（独立元素，不与 toast 冲突）
function showBusy(txt) {
  const b = $('busy');
  if (!b) return;
  const t = $('busy-txt'); if (t) t.textContent = txt || '加载中…';
  b.hidden = false;
}
function hideBusy() {
  const b = $('busy');
  if (b) b.hidden = true;
}
// ♥ 一键收藏/取消「我喜欢」（v3.9.22）：与 __qqLikeAddBG/__qqLikeRmBG 同通道；v3.9.29 起
//   dirId 201 一律走 ag-1 加密通道（明文 musicu / legacy fcg 在当前账户已失效 80105/404）。
async function toggleLike(song) {
  const m = midOf(song);
  if (!m) { toast('这首歌缺少 mid，无法收藏'); return; }
  const on = likeMids.has(m);
  try {
    // 「我喜欢的」(dirId 201)：只走 ag-1 加密通道（明文/legacy 已失效）
    await writeLike(on ? 'remove' : 'add', song);
    toast(on ? '已取消喜欢' : '已加入「我喜欢」');
    if (on) dropFromCurrentList(song); else injectIntoCurrentList(song);   // 即时刷新当前视图
    syncCurHeart();                                                   // v3.9.43：底部 ♥ 才是真实状态（每行 ♥ 已移除）
    // v3.9.42：不再延迟 refresh() —— writeLike 内的 loadLikeMids 已是权威重拉，
    // 多余 refresh 会让"新歌已显示"和"加载中"遮罩时序错位；缓存已由 cacheLike() 写回。
  } catch (e) {
    toast(e && e.message ? e.message : (on ? '取消喜欢失败' : '加入失败'));
    console.log('[toggleLike] ag-1 失败:', e && e.message);
  }
}
// v3.9.23：ag-1 加密通道兜底。明文 musicu.fcg 对某些歌 80105 时，让后台借官网歌曲详情页
// 点官方 ♥（官方走 ag-1 加密 musics.fcg，扩展自己算不出 sign）。返回 {ok, favored?, error?}。
function ag1Fallback(op, mid) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'qq-like-ag1', op, mid }, (r) => {
        if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
        resolve(r || { ok: false, error: 'no response' });
      });
    } catch (e) { resolve({ ok: false, error: String((e && e.message) || e) }); }
  });
}
// v3.9.43：v3.9.26 起每行已无 ♥（仅保留底部 #like-cur 一颗），原 refreshHearts/syncHeart 每调用都全量扫
//   .row[data-i] 找并不存在的 .heart 元素，纯属空转；已删除，♥ 状态统一由 syncCurHeart() 维护底部那颗。
// v3.9.26：底部 ♥ 按钮状态同步（当前播放/高亮歌是否在「我喜欢」里）
function syncCurHeart() {
  const b = $('like-cur'); if (!b) return;
  const s = playingSong || view[idx] || null;
  const on = s ? likeMids.has(midOf(s)) : false;
  b.classList.toggle('on', on);
  b.title = on ? '取消喜欢' : '喜欢';
}
// v3.9.26：加歌到「我喜欢的」后，若当前正在「我喜欢的」页，就地插入该行并刷新底部 ♥，解决"加完不显示"问题。
function injectIntoCurrentList(song) {
  const m = midOf(song);
  if (curKey !== 'like' || !m) return;
  if (all.some((s) => midOf(s) === m)) return;
  all.unshift(song); view.unshift(song);
  if (idx >= 0 && playingSong && sameSong(song, playingSong)) idx = 0;
  render(); syncCurHeart();
  syncLikeCache();                                    // v3.9.38：把最新视图写回缓存，避免切走再切回闪旧数据
}
// v3.9.26：从「我喜欢的」移除后，若当前正在该页，就地删除该行并刷新底部 ♥。
function dropFromCurrentList(song) {
  const m = midOf(song);
  if (curKey !== 'like' || !m) return;
  all = all.filter((s) => midOf(s) !== m);
  view = view.filter((s) => midOf(s) !== m);
  if (idx >= view.length) idx = Math.max(view.length - 1, -1);
  render(); syncCurHeart();
  syncLikeCache();                                    // v3.9.38：把最新视图写回缓存，避免切走再切回闪旧数据
}
// v3.9.38：加/删「我喜欢的」后，立即把当前视图(all)写回 IndexedDB 缓存（仅当正停留在该页）。
// 否则切到别的歌单再切回来时，open() 会先显示旧缓存（含刚删的歌）再等 refresh 重拉，闪一下才消失。
async function syncLikeCache() {
  if (curKey !== 'like') return;
  try { await kvSet(ckKey(), { ts: Date.now(), list: all.slice() }); } catch (e) {}
}
// 拉一次「我喜欢」整张列表，建立 mid 集合（启动/登录后各调一次，v3.9.22）
async function loadLikeMids() {
  try {
    const list = await pullSongs(LIKE);
    likeList = list;
    likeMids = new Set(list.map((s) => midOf(s)).filter(Boolean));
    syncCurHeart();                                                   // v3.9.43：底部 ♥ 才是真实状态（每行 ♥ 已移除）
  } catch (e) { likeMids = new Set(); likeList = []; }
}
// v3.9.42：加/删「我喜欢的」成功后，把服务端权威列表写回「我喜欢的」缓存，
// 不论当前停在哪个页面，之后点开「我喜欢的」都能立刻看到增减结果（不再依赖打开时的后台 refresh 慢一拍）。
async function cacheLike() {
  if (!likeList.length) return;
  try { await kvSet('list_' + LIKE, { ts: Date.now(), list: likeList.slice() }); } catch (e) {}
}
async function createPl(name) {
  const r = await api({ module: 'music.musicasset.PlaylistBaseWrite', method: 'AddPlaylist', param: { dirName: name, dirDesc: '', dirPicUrl: '', taglist: [] } });
  if (r.code !== 0) throw new Error('新建失败（code ' + r.code + '）');
}
async function delPl(dirId) {
  if (!dirId) return;
  if (!confirm('确定删除这个歌单？此操作不可撤销。')) return;
  try {
    const r = await api({ module: 'music.musicasset.PlaylistBaseWrite', method: 'DelPlaylist', param: { dirId: dirId } });
    if (r.code !== 0) throw new Error('删除失败（code ' + r.code + '）');
    toast('歌单已删除');
    if (curDirId === dirId) await open('like', LIKE, LIKE_DIRID, '我喜欢', false);
    await loadPlaylists();
  } catch (e) { toast(e && e.message ? e.message : '删除失败'); }
}
// 取消收藏专辑（接口从 y.qq.com 专辑页源码里挖出：music.musicasset.AlbumFavWrite / CancelFavAlbum，
// param {uin:字符串, v_albumMid:[mid]}，成功判定 data.result===0 —— 网上查不到文档，实读源码拿到的）
async function unfavAlbum(mid) {
  if (!mid) return;
  if (!confirm('确定取消收藏该专辑？')) return;
  try {
    const r = await api({ module: 'music.musicasset.AlbumFavWrite', method: 'CancelFavAlbum', param: { uin: String(UIN), v_albumMid: [mid] } });
    if (r.code !== 0 || (r.data && r.data.result !== 0)) throw new Error('取消收藏失败（code ' + r.code + '）');
    toast('已取消收藏');
    if (curKind === 'album' && String(curTid) === String(mid)) await open('like', LIKE, LIKE_DIRID, '我喜欢', false);
    await loadPlaylists();
  } catch (e) { toast(e && e.message ? e.message : '取消收藏失败'); }
}
function pickPlaylist(title, onPick) {
  const body = $('modal-body');
  body.textContent = '';
  $('modal-title').textContent = title;
  // 「我喜欢」永远排第一（v3.9.2）：官网的"收藏"就是往 dirId 201 增删，
  // 与行内 － 按钮"取消喜欢"走同一条通道，技术上是现成的。
  const like = document.createElement('div');
  like.className = 'modal-item';
  const ln = document.createElement('span'); ln.className = 'nm';
  ln.textContent = '\u2764 我喜欢';   // v3.9.48：❤(U+2764) 字形比 ♥(U+2665) 饱满，直接混排同字号即可，无需单独放大
  ln.style.color = 'var(--accent)';
  like.appendChild(ln);
  like.onclick = () => { $('modal').hidden = true; onPick({ dirid: LIKE_DIRID, name: '我喜欢' }); };
  body.appendChild(like);
  if (!mine.length) {
    const d = document.createElement('div');
    d.className = 'modal-none';
    d.textContent = '还没有你自己创建的歌单。先点左栏「创建的歌单」旁边的 ＋ 新建一个。';
    body.appendChild(d);
  }
  mine.forEach((p) => {
    const it = document.createElement('div');
    it.className = 'modal-item';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name;
    const c = document.createElement('span'); c.className = 'num'; c.textContent = p.count ? p.count + ' 首' : '';
    it.appendChild(nm); it.appendChild(c);
    it.onclick = () => { $('modal').hidden = true; onPick(p); };
    body.appendChild(it);
  });
  $('modal').hidden = false;
}
function askAdd(song) {
  if (!song) { toast('还没有在播放的歌'); return; }
  pickPlaylist('把「' + (dispName(song) || '') + '」加入歌单', async (p) => {
    const isLike = (p.dirid || p.tid) === LIKE_DIRID;
    try {
      if (isLike) {
        // 「我喜欢」只走 ag-1 加密通道（明文 musicu / legacy fcg 在当前账户已失效 80105/404）。
        // v3.9.28 之前这里没有 ag-1 兜底，所以 ＋ 选「我喜欢」会直接 80105 报错 —— 现已修复。
        const res = await writeLike('add', song);
        if (res && res.already) toast('这首歌已经在「我喜欢」里了');
        else toast('已加入「我喜欢」');
        likeMids.add(midOf(song)); injectIntoCurrentList(song); syncCurHeart();   // v3.9.43：底部 ♥ 才是真实状态
        // v3.9.42：不再延迟 refresh()（见 toggleLike 注释）；缓存已由 cacheLike() 写回，从别处加完也能立刻看到。
      } else {
        // 普通歌单（dirId≠201）走明文 musicu（可用）。"是否已存在"以服务端 existed 为准（v3.9.8）。
        const res = await addSongs(p.dirid || p.tid, [song]);
        if (res && res.existed) toast('这首歌已经在「' + p.name + '」里了，不用重复添加');
        else toast('已加入「' + p.name + '」');
      }
    }
    catch (e) {
      toast(e && e.message ? e.message : '加入失败');
    }
  });
}

// ---------- 事件 ----------
$('play').onclick = () => { if (!audio.src && view.length) play(idx < 0 ? 0 : idx); else if (audio.paused) audio.play(); else audio.pause(); };
$('prev').onclick = () => go(-1);
$('next').onclick = () => go(1);
$('rows').addEventListener('click', (e) => {
  const t = e.target;
  const add = t.closest ? t.closest('[data-add]') : null;
  if (add) { askAdd(view[+add.dataset.add]); return; }
  const del = t.closest ? t.closest('[data-del]') : null;
  if (del) {
    const i = +del.dataset.del, song = view[i];
    const what = curKey === 'like' ? '取消喜欢' : '从本歌单移除';
    if (!confirm('确定把「' + (dispName(song) || '') + '」' + what + '？')) return;
    const doRemove = async () => {
      // 「我喜欢的」(dirId 201) 只走 ag-1 加密通道（明文 musicu / legacy fcg 已失效 80105/404）；
      // 普通歌单（dirId≠201）走明文 musicu（可用）。
      if (curDirId === LIKE_DIRID) await writeLike('remove', song);
      else await delSong(curDirId, song);
    };
    doRemove().then(() => {
      toast(curKey === 'like' ? '已取消喜欢' : '已移除');
      if (curKey === 'like') dropFromCurrentList(song);          // v3.9.26：就地移除行
      else { all = all.filter((s) => s !== song); view.splice(i, 1); render(); }
      syncCurHeart();
      // v3.9.42：不再延迟 refresh()（见 toggleLike 注释）；缓存已由 cacheLike() 写回。
    }).catch((err) => toast(err && err.message ? err.message : '操作失败'));
    return;
  }
  const row = t.closest ? t.closest('.row[data-i]') : null;
  if (row) play(+row.dataset.i);
});
$('nav-like').onclick = (e) => { e.preventDefault(); open('like', LIKE, LIKE_DIRID, '我喜欢', false, 'like'); };
[$('nav-mine'), $('nav-fav'), $('nav-album')].forEach((n) => n.addEventListener('click', sideClick));
$('new-pl').onclick = async () => {
  const name = prompt('新歌单名称：');
  if (!name || !name.trim()) return;
  try {
    await createPl(name.trim());
    toast('已新建「' + name.trim() + '」');
    await loadPlaylists();
  } catch (e) { toast(e && e.message ? e.message : '新建失败'); }
};
$('like-cur').onclick = () => toggleLike(playingSong || view[idx]);
$('modal-cancel').onclick = () => { $('modal').hidden = true; };
$('modal').onclick = (e) => { if (e.target === $('modal')) $('modal').hidden = true; };
$('seek').addEventListener('input', () => { if (audio.duration) audio.currentTime = +$('seek').value / 1000 * audio.duration; });
$('vol').addEventListener('input', () => { audio.volume = +$('vol').value / 100; localStorage.setItem('vol', $('vol').value); });
$('mute').onclick = () => { audio.muted = !audio.muted; $('mute').textContent = audio.muted ? '🔇' : '🔊'; };
$('mode').onclick = () => {
  mode = mode === 'list' ? 'one' : mode === 'one' ? 'rand' : 'list';
  localStorage.setItem('mode', mode);
  $('mode').textContent = MODE_TXT[mode];
  toast(MODE_NM[mode], 1200);
};
// 搜索框（v3.8.1）：搜**整个 QQ 音乐曲库**，结果直接替换主列表；侧栏不动，方便切回。
// 不随打字实时搜（防卡）：**回车或点「搜索」按钮**才发请求；清空输入框即恢复当前歌单。
function runSearch() {
  const q = $('q').value.trim();
  if (!q) {
    if (searching) exitSearch();
    else { view = all.slice(); idx = playingSong ? view.findIndex((s) => sameSong(s, playingSong)) : -1; render(); }
    return;
  }
  doSearch(q);
}
$('q').addEventListener('input', () => {
  if ($('q').value.trim()) return;                       // 有词不打扰，等回车/按钮
  if (searching) exitSearch();
  else { view = all.slice(); idx = playingSong ? view.findIndex((s) => sameSong(s, playingSong)) : -1; render(); }
});
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
$('q-go').onclick = runSearch;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('modal').hidden = true; return; }
  if (e.target === $('q')) return;
  if (e.code === 'Space') { e.preventDefault(); $('play').onclick(); }
});
$('np-cover').addEventListener('error', () => { $('np-cover').hidden = true; $('np-cover-txt').hidden = false; });
$('site').onclick = (e) => {
  e.preventDefault();
  try { chrome.tabs.create({ url: 'https://y.qq.com/?noplayer=1' }); }
  catch (err) { location.href = 'https://y.qq.com/?noplayer=1'; }
};
$('auth').onclick = () => { if (UIN) doLogout(); else doLogin(); };
audio.addEventListener('play', setPlayBtn);
audio.addEventListener('pause', setPlayBtn);
audio.addEventListener('ended', () => { if (mode === 'one') { audio.currentTime = 0; audio.play(); } else go(1); });
audio.addEventListener('timeupdate', () => {
  $('t-cur').textContent = fmt(audio.currentTime);
  if (audio.duration) $('seek').value = String(Math.round(audio.currentTime / audio.duration * 1000));
});

// ---------- 收藏写入排查工具（v3.9.9） ----------
// 「我喜欢」加不进去时用：控制台执行 __qqTestLike()，它会把"几种可能的写法"各发一次，
// 并把服务端的原始回答打印出来，从而一次性确定到底哪种写法对。
// ⚠️ 注意：其中成功的那一种会**真的把歌收进我喜欢**（这正是要验证的）。
// 另一个 __qqDumpDirs() 用来确认你账号里「我喜欢」的真实 dirId/tid（账号之间可能不是 201）。
if (DIAG && typeof window !== 'undefined') {
  window.__qqDumpDirs = function () {
    console.log('[dirs] UIN=' + UIN + ' LIKE_DIRID(常量)=' + LIKE_DIRID + ' LIKE(常量 disstid)=' + LIKE);
    console.log('[dirs] 创建的歌单(含被过滤掉的系统目录部分原始字段): ' + JSON.stringify(mine.map((p) => ({ tid: p.tid, dirid: p.dirid, name: p.name, count: p.count })), null, 1));
    console.log('[dirs] 收藏的歌单: ' + JSON.stringify(fav.map((p) => ({ tid: p.tid, dirid: p.dirid, name: p.name })), null, 1));
  };
  window.__qqTestLike = async function () {
    const song = playingSong || view[idx];
    if (!song) { console.log('[testLike] 没有选中/正在播放的歌，先在列表里点一首再试'); return; }
    console.log('[testLike] 目标歌: ' + JSON.stringify({ id: song.id, mid: midOf(song), type: song.type, name: dispName(song) }));
    const tries = [
      { tag: 'A dirId201+songType13', req: { module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: 201, v_songInfo: [{ songType: 13, songId: song.id }] } } },
      { tag: 'B dirId201+songType0', req: { module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: 201, v_songInfo: [{ songType: 0, songId: song.id }] } } },
      { tag: 'C dirId201+只给songId', req: { module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: 201, v_songInfo: [{ songId: song.id }] } } },
      { tag: 'D dirId用我喜欢的disstid', req: { module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: LIKE, v_songInfo: [{ songType: 13, songId: song.id }] } } },
      { tag: 'E SongFavWrite/FavSong(id)', req: { module: 'music.musicasset.SongFavWrite', method: 'FavSong', param: { uin: String(UIN), v_songId: [song.id] } } },
      { tag: 'F SongFavWrite/AddFavSong(mid)', req: { module: 'music.musicasset.SongFavWrite', method: 'AddFavSong', param: { uin: String(UIN), v_songMid: [midOf(song)] } } },
      { tag: 'G SongFavWrite/AddFavSong(id)', req: { module: 'music.musicasset.SongFavWrite', method: 'AddFavSong', param: { uin: String(UIN), v_songId: [song.id] } } }
    ];
    for (const t of tries) {
      try {
        const r = await api(t.req);
        console.log('[testLike] ' + t.tag + ' -> ' + JSON.stringify(r).slice(0, 400));
      } catch (e) { console.log('[testLike] ' + t.tag + ' ERR ' + (e && e.message ? e.message : e)); }
      await new Promise((res) => setTimeout(res, 400));   // 别打太急
    }
    console.log('[testLike] 完成。把上面 A~G 的结果整段复制回来即可。');
  };
  // 第二轮探针（v3.9.10）：A~G 证明 songType 无关、且没有可用的 SongFavWrite，
  // 所以这一轮改为"对照实验"：用你自己的一个真实歌单走完全相同的 AddSonglist，
  // 看它是不是成功——从而判断 80105 是"只有 201 被拒"还是"整个账号现在都加不了"。
  // ⚠️ 会往你歌数最少的那个歌单加一首歌做对照，随后立刻尝试删掉（删不掉会提示你手动删）。
  window.__qqTestLike2 = async function () {
    const song = playingSong || view[idx];
    if (!song) { console.log('[probe2] 先在列表里点一首歌再执行'); return; }
    const pause = () => new Promise((r) => setTimeout(r, 400));
    console.log('[probe2] 目标歌: ' + JSON.stringify({ id: song.id, mid: midOf(song), name: dispName(song) }));

    // ① 原始创建列表（**含系统目录**）——确认「我喜欢」的真实 dirId / tid / 歌数
    try {
      const r = await api({ module: 'music.musicasset.PlaylistBaseRead', method: 'GetPlaylistByUin', param: { uin: String(UIN), bWithoutStatus: false } });
      const arr = (r.data && (r.data.v_playlist || r.data.playlist)) || [];
      console.log('[probe2] 原始创建列表(含系统目录) n=' + arr.length);
      arr.forEach((p, i) => console.log('  #' + i + ' ' + JSON.stringify({
        tid: p.tid, dirid: p.dirid || p.dirId,
        name: p.dissname || p.dirname || p.dirName,
        songnum: p.songnum || p.songNum || p.song_cnt
      })));
    } catch (e) { console.log('[probe2] 原始列表读取失败 ' + e.message); }
    await pause();

    // ② 对照实验：往你自己歌数最少的歌单加同一首歌（同样的 AddSonglist 写法）
    if (mine.length) {
      const p = mine.reduce((a, b) => ((num(a.count) <= num(b.count)) ? a : b), mine[0]);
      const did = p.dirid || p.tid;
      try {
        const ra = await api({ module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: did, v_songInfo: [{ songType: 13, songId: song.id }] } });
        console.log('[probe2] 对照 歌单「' + p.name + '」(dirId=' + did + ') 加入 -> ' + JSON.stringify(ra).slice(0, 300));
        await pause();
        try {
          const rd = await api({ module: 'music.musicasset.PlaylistDetailWrite', method: 'DelSonglist', param: { dirId: did, v_songInfo: [{ songType: 13, songId: song.id }] } });
          console.log('[probe2] 对照 自动清理(移除) -> ' + JSON.stringify(rd).slice(0, 200));
        } catch (e) { console.log('[probe2] 对照 自动清理失败：' + e.message + '，请手动到「' + p.name + '」删掉刚加的《' + (dispName(song) || '') + '》'); }
      } catch (e) { console.log('[probe2] 对照 加入异常 ' + e.message); }
    } else { console.log('[probe2] 对照 跳过（没读到你自己创建的歌单）'); }
    await pause();

    // ③ 201 再补两个变体：带 uin / 带 hostUin
    for (const extra of [{ uin: String(UIN) }, { uin: String(UIN), hostUin: String(UIN) }]) {
      try {
        const ru = await api({ module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: Object.assign({ dirId: 201, v_songInfo: [{ songType: 13, songId: song.id }] }, extra) });
        console.log('[probe2] 201+' + JSON.stringify(Object.keys(extra)) + ' -> ' + JSON.stringify(ru).slice(0, 300));
      } catch (e) { console.log('[probe2] 201+' + JSON.stringify(Object.keys(extra)) + ' ERR ' + e.message); }
      await pause();
    }

    // ④ 服务端视角：这首歌是不是已经在收藏里（用来交叉验证）
    try {
      const rf = await api({ module: 'music.musicasset.SongFavRead', method: 'IsSongFanByMid', param: { v_songMid: [midOf(song)] } });
      console.log('[probe2] IsSongFanByMid -> ' + JSON.stringify(rf).slice(0, 300));
    } catch (e) { console.log('[probe2] IsSongFanByMid ERR ' + e.message); }

    console.log('[probe2] 完成。把上面整段（尤其是「对照」那两行和 IsSongFanByMid）复制回来。');
  };

  // 第三轮探针（v3.9.11）：把**同一条** AddSonglist 放到 y.qq.com 页面上下文里发一次。
  // 官方网页能加、扩展页（chrome-extension:// 源）加不了 —— 如果这里成功，就说明服务端校验的是
  // 请求来源（Origin / Referer），后续把「加入/取消喜欢」改成"借道 y.qq.com 页面发请求"即可。
  window.__qqTestLike3 = async function () {
    const song = playingSong || view[idx];
    if (!song) { console.log('[probe3] 先在列表里点一首歌'); return; }
    const body = {
      comm: { cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1, uin: UIN, g_tk: GTK, g_tk_new_20200303: GTK },
      req_1: { module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: 201, v_songInfo: [{ songType: 13, songId: song.id }] } }
    };
    let tab = null, created = false;
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.y.qq.com/*' });
      tab = (tabs || []).filter((t) => t && typeof t.id === 'number')[0] || null;
    } catch (e) { console.log('[probe3] tabs.query 失败 ' + e.message); }
    if (!tab) {
      try {
        tab = await chrome.tabs.create({ url: 'https://y.qq.com/?noplayer=1', active: false });
        created = true;
        await new Promise((r) => setTimeout(r, 3500));           // 等页面加载出来再注入
      } catch (e) { console.log('[probe3] 无法打开 y.qq.com 标签页：' + e.message); return; }
    }
    const doFetch = (b) => fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&platform=yqq.json', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
    }).then((r) => r.text()).then((t) => t.slice(0, 700)).catch((e) => 'FETCH ERR ' + e.message);
    const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r([{ result: 'TIMEOUT(注入无返回，可能是页面没加载好)' }]), ms))]);
    let out = null;
    try {
      out = await withTimeout(chrome.scripting.executeScript({ target: { tabId: tab.id }, func: doFetch, args: [body] }), 15000);
    } catch (e) { console.log('[probe3] 注入失败 ' + e.message); }
    const res = out && out[0] ? out[0].result : null;
    console.log('[probe3] **在 y.qq.com 页面上下文里**加入 dirId 201 -> ' + String(res).slice(0, 700));
    console.log('[probe3] 对照：扩展页自己发是 80105。这里是 code 0 → 确认是**请求来源(Origin/Referer)校验**；若仍是 80105 → 是请求参数与官网不同。');
    if (created) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
  };

  // 第四轮探针（v3.9.13）：抓包显示官网的请求走的是 **u6.y.qq.com + ag-1 加密通道**，
  // 而我们一直往 u.y.qq.com 发明文 musicu。这里把同一条明文请求分别打到几个 host，
  // 看能不能绕开（u6 / c.y.qq.com 等）。若某个 host 返回 code 0，就直接改成发它。
  window.__qqTestLike4 = async function () {
    const song = playingSong || view[idx];
    if (!song) { console.log('[probe4] 先在列表里点一首歌'); return; }
    const hosts = [
      'https://u.y.qq.com/cgi-bin/musicu.fcg',        // 当前用的（已知 80105，作基线）
      'https://u6.y.qq.com/cgi-bin/musicu.fcg',       // 官网加密通道所在的 host
      'https://c.y.qq.com/cgi-bin/musicu.fcg',        // 老接口常用 host
      'https://u6.y.qq.com/cgi-bin/musics.fcg'        // 官网加密通道（明文发应该失败，仅作对照）
    ];
    for (const h of hosts) {
      const body = {
        comm: { cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 1, uin: UIN, g_tk: GTK, g_tk_new_20200303: GTK },
        req_1: { module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: 201, v_songInfo: [{ songType: 13, songId: song.id }] } }
      };
      try {
        const res = await fetch(h + '?format=json&platform=yqq.json&g_tk=' + GTK, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const t = await res.text();
        console.log('[probe4] ' + h.replace('https://', '') + ' -> HTTP ' + res.status + ' ' + t.slice(0, 260));
      } catch (e) { console.log('[probe4] ' + h.replace('https://', '') + ' ERR ' + e.message); }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log('[probe4] 完成。哪一行出现 code 0，就说明该 host 可用 → 我会把收藏写入改发到它。');
  };

  // 第五轮（v3.9.16）：201 失败响应里 backendSongId=0（服务端没解析出这首歌），
  // 但同样的 songId+songType 在 dirId 86/1 上能解析成功 —— 怀疑收藏目录的写入要用 songMid 定位。
  // 这里把几种"识别方式"各试一次。
  window.__qqTestLike5 = async function () {
    const song = playingSong || view[idx];
    if (!song) { console.log('[probe5] 先在列表里点一首歌'); return; }
    const mid = midOf(song);
    const variants = [
      { tag: '1 songId only (基线)', v: [{ songType: 13, songId: song.id }] },
      { tag: '2 songId + songMid', v: [{ songType: 13, songId: song.id, songMid: mid }] },
      { tag: '3 songMid only', v: [{ songType: 13, songMid: mid }] },
      { tag: '4 songId + backendSongId', v: [{ songType: 13, songId: song.id, backendSongId: song.id }] }
    ];
    for (const t of variants) {
      try {
        const r = await api({ module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: 201, v_songInfo: t.v } });
        console.log('[probe5] ' + t.tag + ' -> ' + JSON.stringify(r).slice(0, 300));
      } catch (e) { console.log('[probe5] ' + t.tag + ' ERR ' + e.message); }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log('[probe5] 完成。看有没有哪一行是 code 0（且 backendSongId 非 0）。');
  };

  // 「我喜欢」加/取消（v3.9.21 正解）：
  // 实测两条 legacy fcg（c.y.qq.com/splcloud/fcg_music_add2songdir.fcg、c.y.qq.com/qzone/fcg_music_delbatchsong.fcg）
  // 在本账户已死（全 403，因校验 g_tk 用 p_skey，而本账户 p_skey 为空）——g_tk 优先级连改三轮（v3.9.18/19/20）全是红鲱鱼。
  // 正确通道 = 与普通歌单加歌同一个 musicu.fcg POST 网关（[QQCAP-BG] 抓包 + 控制台探针实证 code 0）：
  //   module: music.musicasset.PlaylistDetailWrite，method: AddSonglist / DelSonglist，dirId: 201
  //   v_songInfo 必须带 songMid（字符串）：201 通道只认 mid，纯数字 songId → 80105（普通歌单 dirId≠201 用 songId 即可）。
  // 复用本页 api()（带登录 cookie）。扩展页面(chrome-extension://) 自己 fetch 能带 .qq.com 登录态，无需开 y.qq.com 标签。
  // 用法：__qqLikeAddBG() 用当前歌曲；__qqLikeAddBG('002eQfMi0Ps0ub') 指定 mid；__qqLikeRmBG('002eQfMi0Ps0ub' / 123456) 取消。
  window.__qqLikeAddBG = async function (midArg) {
    const song = playingSong || view[idx];
    const mid = midArg || (song ? midOf(song) : null);
    if (!mid) { console.log('[v3.9.21] 需要 mid：先点一首歌，或传 __qqLikeAddBG("002eQfMi0Ps0ub")'); return; }
    console.log('[v3.9.21] 直接加入我喜欢 mid=' + mid);
    try {
      // v3.9.21：老 splcloud fcg 在本账户已死（全 403，因其校验 g_tk 用 p_skey，而本账户 p_skey 为空）。
      // 正解=与普通歌单加歌同一个 musicu.fcg 通道，dirId 201 + v_songInfo 带 songMid（纯 songId 会 80105）。
      const r = await api({ module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist',
        param: { dirId: 201, v_songInfo: [{ songType: 13, songMid: mid }] } });
      console.log('[v3.9.21] 加入返回: ' + JSON.stringify(r).slice(0, 400));
      return r;
    } catch (e) { console.log('[v3.9.21] 加入失败 ' + e.message); }
  };
  window.__qqLikeRmBG = async function (arg) {
    const song = playingSong || view[idx];
    const isMid = typeof arg === 'string' && /^[0-9A-Za-z]{8,}$/.test(arg);
    let songMid = isMid ? arg : null, songId = isMid ? null : arg;
    // 传数字 id 时，若正好是当前歌曲，顺手补上 mid（删除同样需要 songMid 定位）
    if (!isMid && song && String(song.id) === String(arg)) { const m = midOf(song); if (m) songMid = m; }
    if (!songMid && !songId) { console.log('[v3.9.21] 需要 mid 或 id：先点一首歌，或传 __qqLikeRmBG("002eQfMi0Ps0ub" / 123456)'); return; }
    const v = { songType: 13 }; if (songId) v.songId = songId; if (songMid) v.songMid = songMid;
    console.log('[v3.9.21] 直接取消喜欢 ' + JSON.stringify(v));
    try {
      const r = await api({ module: 'music.musicasset.PlaylistDetailWrite', method: 'DelSonglist', param: { dirId: 201, v_songInfo: [v] } });
      console.log('[v3.9.21] 取消返回: ' + JSON.stringify(r).slice(0, 400));
      return r;
    } catch (e) { console.log('[v3.9.21] 取消失败 ' + e.message); }
  };
  // v3.9.24：手动触发 ag-1 兜底（无需真撞 80105），验证通道是否通、按钮能否点中。
  // 用法：__qqAg1Test('001wBvG51L81zs') —— 会后台开/复用官网歌曲详情页点官方 ♥，点完重拉「我喜欢」核验真实增减。
  window.__qqAg1Test = async function (midArg) {
    const song = playingSong || view[idx];
    const mid = midArg || (song ? midOf(song) : null);
    if (!mid) { console.log('[ag1] 需要 mid：先点一首歌，或传 __qqAg1Test("001wBvG51L81zs")'); return; }
    const before = likeMids.has(mid);
    console.log('[ag1] 触发加密通道兜底 op=add mid=' + mid + '（before=' + before + '）');
    const r = await ag1Fallback('add', mid);
    console.log('[ag1] 点击结果:', JSON.stringify(r));
    if (r && r.clicked) {
      await new Promise((res) => setTimeout(res, 1300));
      await loadLikeMids();
      const after = likeMids.has(mid);
      console.log('[ag1] 重拉核验：before=' + before + ' after=' + after + ' → ' + (after ? '✅ 已在「我喜欢」' : '❌ 不在「我喜欢」（可能未生效）'));
      return { ok: true, clicked: true, before, after, nowInList: after };
    }
    return r;
  };

  // 查看后台 webRequest 抓到的官网写请求（v3.9.12）：先去官网页面点一次「我喜欢」，再回这里执行。
  window.__qqCapLog = async function () {
    const read = async (k) => {
      try { const o = await chrome.storage.session.get([k]); if (o && o[k]) return o[k]; } catch (e) {}
      try { const o = await chrome.storage.local.get([k]); if (o && o[k]) return o[k]; } catch (e) {}
      return null;
    };
    const hits = (await read('qqcap')) || [];
    const misc = (await read('qqcapMisc')) || [];
    const fmt = (r) => new Date(r.t).toLocaleTimeString() + ' ' + r.method + ' ' + r.url + '\n' + (r.body || r.qs || '(无 body)');
    console.log('===== [qqcap] 疑似"写歌单/收藏"请求 ' + hits.length + ' 条 =====');
    hits.forEach((r, i) => console.log('[qqcap #' + i + ']\n' + fmt(r)));
    if (!hits.length) console.log('（没抓到。确认已重载到 v3.9.12，且是**在官网页面**上点了一次「我喜欢」再回来看）');
    console.log('===== [qqcap] 其它 fcg 流量（最近 ' + misc.length + ' 条，兜底参考）=====');
    misc.forEach((r, i) => console.log('[misc #' + i + ']\n' + fmt(r)));
  };
}

// ---------- 启动 ----------
(async () => {
  $('vol').value = localStorage.getItem('vol') || '80';
  audio.volume = +$('vol').value / 100;
  $('mode').textContent = MODE_TXT[mode];
  const verEl = $('ver'); if (verEl) verEl.textContent = 'v' + VER;
  try {
    await initAuth();
    await openDB();
    // ⚠️ 未登录时绝不能自动打开「我喜欢」：open() 会先读 IndexedDB 缓存秒开，
    //    退出重载后就变成"已退出却还显示我喜欢的歌单"（v3.5.3）。未登录只给引导提示。
    if (!UIN) { fail('未登录：点右上角「登录」按钮，登录后即可查看歌单'); }
    else {
      await open('like', LIKE, LIKE_DIRID, '我喜欢', false, 'like');   // 默认进「我喜欢」
      loadLikeMids().catch(() => {});   // 建立「我喜欢」mid 集合，供每行 ♥ 状态显示（v3.9.22）
    }
  } catch (e) {
    fail('初始化失败：' + (e && e.message ? e.message : e));
  }
  if (UIN) loadPlaylists().catch((e) => {
    note('歌单列表读取失败\n' + (e && e.message ? e.message : e));
    console.error('[player] loadPlaylists 失败', e);
  });
})();
