# QQ 音乐架构迁移交接文档

**日期**：2026-11-27
**版本**：3.0.3（未发布）
**背景**：把 QQ 音乐从"本地 Python 中间层"改成"B 站那样的隐藏 WebView 直连抓取"

---

## 一、先说结论

**架构迁移做完了，核心功能可用，但还没发布。**

| 状态 | 内容 |
|---|---|
| ✅ 完成 | 中间层移除、直连 y.qq.com、播放、搜索、歌单、我的、榜单列表、雷达 |
| ❌ 未验证 | 首页排版优化（已回退） |
| ⚠️ 遗留 | 前端"官方歌单"页仍是卡片墙（想改成展开列表，回退了） |

**当前部署的是 20:58 回退后的版本**，等于把 19:07 那个可用状态恢复了。

---

## 二、为什么迁移

原来 QQ 音乐走的是**本地 Python 中间层**（`qq-music-layer`，62 MB）：

```
隐藏页（空白） → 中间层 HTTP API → 中间层自己调 y.qq.com
```

中间层有两个改不了的 bug（它是编译好的 `run.pyc`，源码不在）：

1. **歌单只返回 30 首** —— 中间层的查询里写死了 `num=30`
2. **VIP 歌播不了** —— 请求 `CgiGetVkey` 时不带 filename，站点判定无权限

玩家报的"只能播前 30 首"就是这个。改不动中间层，只能绕开它。

---

## 三、新架构

和 B 站（`bilibili.rs` + `bilibili.js`）完全一样：

```
隐藏页（真实加载 y.qq.com） → 页面内注入 qq_music.js → 直接调站点接口
```

**关键点**：

| 项 | 旧 | 新 |
|---|---|---|
| 页面 | `NavigateToString(SHELL)` 空白页 | `navigate("https://y.qq.com/")` 真实页 |
| 数据源 | 中间层 API | `c.y.qq.com` / `u.y.qq.com` 直接调 |
| Cookie | 宿主传给中间层 | 浏览器自动带（`credentials: 'include'`）|
| 消息传递 | `PostWebMessageAsJson` | `ExecuteScript` → `window.westplayRun` |
| 中间层 | 必需 62 MB | **不需要** |

---

## 四、这一轮遇到的 12 个坑（重要）

按发现顺序，每个都是"看起来正常但实际不行"的那种：

### 坑 1：车机屏幕闪烁

**现象**：屏幕一秒原版导航、一秒 WestPlay，无限循环
**根因**：QQ 音乐页在**启动时就被创建**（账号检查触发），而它是完整的 y.qq.com 网站，持续渲染抢 GPU
**修法**：改成延迟创建，用户点了才开（`lib.rs` 里去掉 `AccountAction::Check` 时的 `start_qq_music`）

### 坑 2：网易云层静默失效

**现象**：网易云打不开，日志里一个字都没有
**根因**：`resources_folder()` 靠 `qq-music-layer` 目录存在来判定资源目录。我删了 QQ 中间层，这个函数就永远返回 `None`，网易云层永远启动不了
**修法**：改用 `netease-layer` 判定

### 坑 3：消息传不到页面

**现象**：页面发请求给宿主正常，宿主回消息页面收不到
**根因**：`post_json`（`PostWebMessageAsJson`）在真实站点页面上会被站点自己的 `chrome.webview` handler 吃掉
**修法**：新增 `webview.rs::execute_script()`，用 `ExecuteScript` 调 `window.westplayRun`

### 坑 4：所有请求 CORS 失败

**现象**：`TypeError: Failed to fetch`
**根因**：`credentialHeaders()` 带的 `X-Qq-*` 自定义头触发 CORS 预检，y.qq.com 不允许
**修法**：直连时不再发这些头（它们是给中间层的）

### 坑 5：首页空白

**现象**：首页没有任何内容
**根因**：站点返回 `v_shelf` / `v_niche` / `v_card`，代码读 `shelves` / `niches` / `cards`（中间层做过改名）
**修法**：加 `named()` 做字段规范化

### 坑 6：歌曲字段全空

**现象**：歌名、封面都是空
**根因**：站点用 `songmid` / `songname` / `albummid`，代码读 `mid` / `name` / `album.mid`
**修法**：加 `songNamed()`

### 坑 7：歌单/榜单/我的全部 no route

**现象**：打开任何列表都失败
**根因**：`ROUTES_BY_ID` 用前两段匹配（`/songlist/{id}`），但路由是 `/songlist/{id}/detail`（id 在第三段）
**修法**：改成 `kind`（第1段）+ `last`（最后一段）匹配

### 坑 8：列表重复 10 次

**现象**：559 首的歌单返回 5590 首
**根因**：`fetchAllSongs` 对"一次返回全部"的接口翻页，每页拿到同样的数据
**修法**：`wholeList()` 标记这类路径（`/songlist/`、`/top/`、`/fav/songs`），走单次

### 坑 9：搜索返回空

**根因**：站点用 `data.song.list`，代码读 `found.song.items`
**修法**：`cgi()` 解包 `data`，字段用 `list`

### 坑 10：歌名封面空白（播放界面）

**根因**：`get_song_detail` 返回 `{ track_info: {...} }`，代码直接读根对象
**修法**：解包 `track_info`

### 坑 11：http/https 混合内容

**现象**：播放地址拿不到
**根因**：站点返回的 `sip` 全是 `http://`，页面是 `https://`，浏览器拦截混合内容
**修法**：强制转成 `https://`

### 坑 12：播放被网站自己的播放器打断（最难查）

**现象**：`audio.play()` 报 `AbortError: The play() request was interrupted by a call to pause()`
**根因**：**y.qq.com 自己的播放器会 pause 页面上任何 `<audio>`**。追调用栈发现调用者是站点的 `HTMLDocument.<anonymous>`，不是我们的代码
**修法**：给我们的 audio 加 `data-westplay-audio` 标记，`qq_quiet.js` 里拦截 `pause()`，只允许我们自己的代码调用

---

## 五、关键文件

| 文件 | 作用 |
|---|---|
| `crates/host/src/qq_music.rs` | 隐藏页管理、消息收发 |
| `crates/host/src/qq_music.js` | 页面内脚本：路由、数据解析、播放器 |
| `crates/host/src/qq_quiet.js` | **新增**：压制站点自身的渲染（动画/视频/rAF）和音频抢占 |
| `crates/host/src/webview.rs` | 新增 `execute_script()` |

### 路由表（`qq_music.js` 的 `ROUTES`）

```js
'/recommend/get_home_feed'      → musicu RecommendFeed.get_recommend_feed
'/recommend/get_radar_recommend'→ fcg_v8_toplist_cp (topid=62)
'/recommend/get_recommend_songlist' → fcg_v8_splcomm_rec
'/top/get_category'             → fcg_myqq_toplist
'/search/general_search'        → soso client_search_cp
'/search/get_hotkey'            → splcloud gethotkey
'/user/.../homepage'            → musicu UserInfo.GetLoginUserInfo
'/user/.../created_songlists'   → musicu PlaylistBaseRead.GetPlaylistByUin
'/user/.../fav/songlists'       → musicu PlaylistFavRead.CgiGetPlaylistFavInfo
'/user/.../fav/songs'           → 我喜欢歌单（dirId 201）
'/songlist/{id}/detail'         → fcg_ucc_getcdinfo_byids_cp（一次返回全部）
'/top/{id}/detail'              → fcg_v8_toplist_cp（需要解包 data）
'/song/{mid}/detail'            → musicu get_song_detail（需要解包 track_info）
'/song/{mid}/url'               → musicu CgiGetVkey（带 filename）
'/song/{mid}/lyric'             → lyric fcg_query_lyric_new
```

### 字段规范化（`named()` / `songNamed()`）

站点字段 → 代码期望字段：

```
v_shelf → shelves
v_niche → niches
v_card  → cards
songmid → mid
songname→ name
albummid/albumname → album: { mid, name }
songlist → songs（别名）
```

---

## 六、回退了什么

**19:07 之后的改动已撤销**，包括：

1. `feedSections` 合并同名 section（6 个"为你推荐"合成一行）
2. `Playlists` 改成展开列表布局
3. `qq.css` 的榜单样式
4. `top` 路由返回 `songs` 字段

**为什么回退**：改完后出现"我的选项卡无法载入"，同时用户报告官方歌单没变化、每日30首书架消失。

**备份在**：`D:\WestPlay-dev\backup-before-rollback-1127-2043`

---

## 七、待办

### 高优先级

1. **验证回退后的版本**：确认核心功能都还正常（首页、搜索、歌单、我的、播放、榜单、雷达）
2. **打包给玩家测试**：特别是"歌单能播过第 30 首"

### 中优先级

3. **官方歌单页排版**：想改成"每个榜单下直接列前 3 首"，但要注意别搞坏其他页面
4. **首页"为你推荐"分 6 行**：同名 section 应该合并，但要小心"我的"选项卡的问题

### 低优先级

5. 首页"每日30首"书架（`id: '0'` 的卡片）—— 现在走 `qqdaily` 分支
6. 歌词功能没测过

---

## 八、调试方法

### 开调试端口

```powershell
Start-Process 'D:\WestPlay\westplay.exe' -Environment @{
  WESTPLAY_DEBUG_PORT = '9222'
  WESTPLAY_DEBUG_PORT_WEBVIEW2_QQ_MUSIC = '9335'
}
```

### 连 QQ 音乐页面

```python
import sys
sys.path.insert(0, r"C:\Users\28160\Documents\deepseek-harness\default-workspace")
from cdp import CDP
import json, urllib.request

pages = json.loads(urllib.request.urlopen('http://127.0.0.1:9335/json/list').read())
c = CDP(pages[0]["webSocketDebuggerUrl"])
```

### 手动触发一次问答

```javascript
window.westplayRun({ action: 'ask', id: 999, question: { ask: 'home' } })
```

回答会被 `chrome.webview.postMessage` 发出，可以钩住它看内容。

### 看日志

```powershell
Get-Content "$env:USERPROFILE\Documents\WestPlay\logs\app.log" | Select-String 'qq music'
```

---

## 九、几个必须知道的点

1. **页面是延迟创建的** —— 启动时不会建，要在应用里点开 QQ 音乐才有
2. **QQ 音乐页加载的是真实 y.qq.com** —— 所以有 cookie，但也意味着站点的脚本都在跑
3. **`qq_quiet.js` 必须在 `qq_music.js` 之前注入** —— 顺序反了保护不生效
4. **站点所有 CDN 地址都是 `http://`** —— 必须手动转 `https://`
5. **`post_json` 已经不用了** —— 全部改成 `post_script`（`ExecuteScript`）
6. **中间层已经删了** —— `qq_layer.rs` 和 `app/qq-music-layer/` 都不在了

---

## 十、如果要从头再来

万一改动太乱需要重来：

1. `git checkout` 到 `1af2085`（迁移前的提交）
2. 但注意：中间层删除、`resources_folder` 修复这些是**必须的**，不能回退

更好的办法是**看 `backup-before-rollback-1127-2043` 里的三个文件**，和当前对比。
