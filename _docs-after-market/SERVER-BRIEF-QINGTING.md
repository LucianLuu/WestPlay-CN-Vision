# 第 3 批：新增蜻蜓FM WebApp（`podcasts` 槽位）

> 给构建机：本批**改了宿主（Rust + 注入脚本）**，所以必须重编 `westplay.exe`；只换 `ui/dist` 不够。
> 插件 `westplay.dll` 没有改动。
> 前两批见 `SERVER-BRIEF-2.1.2.md`、`SERVER-BRIEF-2.1.2-FIXES.md`，缺陷记录见 `FIXES.md`。

---

## 0. 一句话

把上游留给“下个版本”的 `podcasts` 槽位提前放出来，显示**蜻蜓FM**（`https://www.qtfm.cn/`）：整页 WebView、座舱键盘、主页媒体控件（封面/节目名/主播/播放暂停/上一集/下一集）全部接上。

---

## 1. 为什么必须重编 exe

宿主 `Site` 是一个 Rust 枚举（`crates/host/src/webapp.rs`），`webapp.js` 是 `include_str!` 编译进 exe 的。新增站点要做两件宿主侧的事：

1. `Site::Qingting`：首页地址、WebView2 profile、日志名、id、标题清洗；
2. `webapp.js` 读蜻蜓FM 自己的播放条（它**没有 Media Session**），并认识它的三个无文字按钮。

UI 只是“让 `podcasts` 槽位渲染 `<WebApp site="qingting" />`”。旧 exe 收到 `{"action":"open","site":"qingting"}` 会解析失败、静默丢弃，界面会一直停在 “Opening…”。所以**宿主和 UI 要一起部署**。

---

## 2. 改动清单

| 文件 | 改什么 |
|---|---|
| `crates/host/src/webapp.rs` | `Site::Qingting`（`https://www.qtfm.cn/`、`webview2-qingting`、`qingting`、`Qingting FM`）；`clean_title` 去掉 `-蜻蜓FM…` 尾巴；单测 |
| `crates/host/src/webapp.js` | 新增 `qingting()`：读 `.player-wrapper` 的节目名/主播/频道/封面/播放状态；`QT_BUTTONS` 三键；歌词只在网易云页面查询 |
| `crates/host/src/performance.rs` | `qtfm.cn` / `qingting.fm` 的进程名显示为 `Qingting FM`；单测 |
| `ui/src/shared/host.ts` | `WebAppSite` 加 `'qingting'` |
| `ui/src/cabin/apps/web/webapp.ts` | 新增并导出 `APP_OF_SITE`（含 `qingting → podcasts`；顺手把 `qqMusic` 的映射从 `music` 修正为 `youtubeMusic`） |
| `ui/src/cabin/apps/web/WebAppScreen.tsx` | 站点名 `Qingting FM`；改用共享的 `APP_OF_SITE` |
| `ui/src/cabin/dashboard/widgets.tsx` | Now Playing 打开对应 App 改用 `APP_OF_SITE`（蜻蜓FM → `podcasts`） |
| `ui/src/cabin/apps/AppScreen.tsx` | `case 'podcasts'` → `<WebApp site="qingting" />` |
| `ui/src/cabin/state/apps.ts` | `podcasts` 从 `NEXT_RELEASE` 移出（Phone/Messages 仍不发） |
| `ui/src/cabin/state/apps.test.ts` | Home 顺序断言加入 `podcasts` |
| `ui/src/cabin/state/strings.ts` | `apps.podcasts`：英/土 `Qingting FM`，中 `蜻蜓FM` |
| `ui/src/shared/icons.ts` | `podcasts` 角色的文件改为 `qingting` |
| `ui/public/icons/westplay/qingting.{light,dark}.svg` | 新图标（官方红底电台波形） |
| `ui/src/hostScripts.test.ts` | 把 `webapp.js` 也纳入“注入脚本能编译”的测试 |
| `ui/dist` | 已用 `WESTPLAY_RELEASE=1` 构建好（含新图标、新文案） |

---

## 3. 蜻蜓FM 的页面事实（实测，2026-10-27）

| 项 | 实测 |
|---|---|
| 域名 | `www.qingting.fm` 会 302 到 **`www.qtfm.cn`**；用后者做首页 |
| Media Session | **没有**（`navigator.mediaSession.metadata` 为 `null`） |
| `<audio>` | **不在 DOM 里**（脚本自建的元素）；`webapp.js` 的 `HTMLMediaElement.play` 钩子能拿到 |
| 播放条 | `.audio-player > .player-wrapper`：`.program-title`、`.podcaster`、`.channel-title`、`img.cover`、`.time-elapsed`、`.time-total` |
| 三键 | `.prev` / `.play-pause`（`paused` ⇄ `playing`）/ `.next`，都是无文字的 `<div>` |
| 封面 | `//pic.qtfm.cn/...jpg!200`，CDN **不校验 Referer**；脚本转成绝对 `https://` |
| 登录 | 免费节目不登录即可播放；付费/收藏才需要，登录态存在 `webview2-qingting` profile |
| 页面宽度 | 首屏实测 `seen 1250 / needed 1235`，不需要缩放 |

注入 `webapp.js` 到真实节目页的实测回报：

```json
{"media":{"title":"诡吹灯续·四部合集 片花","artist":"中广影音",
 "artwork":"https://pic.qtfm.cn/device/…/1729158655999_PcBjvLh8S.jpg!200",
 "mid":null,"playing":true,"lyric":null}}
```

暂停后同一节目回报 `"playing":false`。

---

## 4. 构建与部署

```powershell
cd <仓库根>

# 1) 宿主（插件没改，不用重编 dll）
npx --no-install tauri build --no-bundle        # 产物 target\release\westplay.exe

# 2) 停掉旧进程
Get-Process westplay -ErrorAction SilentlyContinue | ForEach-Object { $_.Kill() }
Start-Sleep 2

# 3) exe 和 ui/dist 一起拷（缺一个都不行）
Copy-Item target\release\westplay.exe <安装目录>\westplay.exe -Force
robocopy ui\dist <安装目录>\ui /MIR

# 4) 启动
Start-Process <安装目录>\westplay.exe -WorkingDirectory <安装目录>
```

> 只换 `ui/dist`：主页会出现“蜻蜓FM”图标，但点开打不开（旧宿主不认 `qingting`）。
> 只换 exe：宿主认识 `qingting`，但 UI 里没有这个图标。

安装包（可选）：

```powershell
npx --no-install tauri build --config app/tauri.installer.conf.json
```

---

## 5. 验收

- [ ] Home 顺序：地图 · QQ音乐 · 网易云 · AppleMusic · 哔哩哔哩 · **蜻蜓FM** · 天气 · 设置
- [ ] 点蜻蜓FM → 打开 `www.qtfm.cn` 首页，右侧不被切
- [ ] 点任意节目 → 播放条出现 → 主页 Now Playing 显示**封面、节目名、主播**
- [ ] 主页三键：播放/暂停、上一集、下一集都作用在页面上
- [ ] 退出 App（回主页）后声音继续，Now Playing 仍在
- [ ] 页面搜索框 → 座舱键盘升起，能输入、回车
- [ ] 换站点再回来：`webview2-qingting` 登录态还在
- [ ] 回归：B站封面（上一批的 `no-referrer`）、QQ音乐/网易云媒体控件、拖动音量条不卡

测试：`tsc -b` 0 错误、`vitest run` **441 passed**；`cargo test -p westplay-host --lib webapp` 应为 5 passed，`performance` 的 `pages_are_named_by_what_they_are` 也过。

---

## 6. 已知限制

- **没有歌词**：蜻蜓FM 是电台/有声书，页面本身不提供歌词；`webapp.js` 也不再拿节目名去网易云搜歌词（那会搜到同名歌曲，B站之前就是因此刷 `netease failed`）。
- **DOM 选择器**：`.player-wrapper`、`.program-title` 等是站点自己的 class，改版可能失效；`[qingting]` 日志里会打出播放回报，便于重读。
- **上一集/下一集在列表边界**：站点自己不动，主页按钮也就没有变化（不会报错）。
- **`podcasts` id**：沿用了上游未发布的播客槽位，这样 Home 顺序、最近使用、图标自定义都自然接上；上游以后若真发布 Podcasts，需要决定是否让位。
- 本机（玩家机器）没有 Rust/MSVC，**没有在这里产出新 exe**；源码与 `ui/dist` 已就绪，交给构建机执行 §4。
