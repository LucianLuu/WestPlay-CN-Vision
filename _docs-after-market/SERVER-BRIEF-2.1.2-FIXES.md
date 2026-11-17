# 第 2 批交接：站点页面显示适配 / 全屏铺满 / 启动品牌 logo

> 给另一台机器上的 DeepSeek（服务器那边）。
> 前置文档：`SERVER-BRIEF-2.1.2.md`（合并 2.0.3 改造到 2.1.2，已完成）、`PLAN.md`（改造总计划）、**`FIXES.md`（缺陷记录，本批的 §8/§9/§10 就是这份文档的实现规格）**。
> 本批在 2.1.2 上改的是**宿主（Rust）+ 座舱界面（TS/CSS）+ 一个资源目录**，`westplay.dll`（游戏插件）**没有改动**。
> 机主 2026-10-27 实机全部验收通过。

---

## 0. 三条最重要的结论

1. **本批 4 组改动里，只有 3 组算"功能"**（按宽缩放、不跳变显示、全屏铺满），另一组（品牌 logo）是**资源文件没进构建**，属于必修项。三组功能彼此独立，但都依赖同一份 `webapp.js` 注入脚本，**必须一批打上**。
2. **`ui/dist` 与 `westplay.exe` 是两个交付物**：界面改动后如果不把新的 `ui/dist` 同步到安装目录的 `ui/`，宿主行为变了但界面还是旧的——全屏会变成"什么都不发生"。部署脚本见 §8。
3. **`ui/public/brand-logos/` 的 7 个图片不在 git 仓库里**（上游说得很清楚：商标）。从源码构建的包/安装目录里一个都不会有，启动画面会退化成"品牌名文字"（§2.3）。

---

## 1. 这批要交付的四个结果

| # | 结果 | 验收方式 |
|---|---|---|
| A | QQ音乐 / 网易云 / B站 三个站点页面**右侧完整显示**，不再被切 | 打开任一站点，底部播放栏/音量条右端完整可见 |
| B | 打开站点时**不会先显示再缩一下** | 冷启动 App 后第一个打开的站点，出现即已是最终大小 |
| C | B站视频**全屏铺满整个插件区域**，退出全屏恢复原样 | 播放器点全屏 → 整个 CarPlay 区都是视频；退出 → 顶部条回来 |
| D | 电动打火时的启动画面显示**卡车品牌 logo**（如 Scania 狮鹫） | 关电门再开电门，splash 2.4 秒内看到 logo |

---

## 2. 必修项（来自 `FIXES.md`，与功能同一批打上）

### 2.1 拖放死锁（`FIXES.md` §8）—— 会让人以为程序死了

**症状**：在 QQ 音乐里拖音量条/进度条，界面卡住、卡车上的屏幕消失，进程 100% 占一个核。
**根因**：WebView2 把页面内的拖动升级成 OLE 桌面拖放，模态循环跑在宿主线程上；同时我们的消息泵 `pump_messages` 无上限。
**三处改动**（缺一不可，前两条是根因的两层）：

`crates/host/src/webview.rs`，`OffscreenWebView::new` 里 `controller.SetIsVisible(true)?` 之后：

```rust
        // A page's own drags must not become the shell's drop target: that loop runs on this thread, and the
        // frames stop until it ends (FIXES.md §8).
        if let Ok(controller4) = controller.cast::<ICoreWebView2Controller4>() {
            let _ = controller4.SetAllowExternalDrop(false);
        }
```

文件头的 `use windows::Web::WebView2::Core::*` 清单里补上 `ICoreWebView2Controller4`。

`crates/host/src/lib.rs`，把 `pump_messages` 换成有界版（约 2180 行）：

```rust
const PUMP_MESSAGES_MOST: u32 = 64;
const PUMP_TIME_MOST: Duration = Duration::from_millis(4);

/// [`pump_messages`] passes that ended on their limit, not on an empty queue: logged (rarely) as a sign of a
/// page's own queue filling faster than the host drains it.
static PUMP_CAPPED: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

fn pump_messages() {
    let started = Instant::now();
    let mut taken = 0;
    // SAFETY: this thread's own messages, each passed on as Windows hands it; `msg` is a local.
    unsafe {
        let mut msg = MSG::default();
        while taken < PUMP_MESSAGES_MOST
            && started.elapsed() < PUMP_TIME_MOST
            && PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool()
        {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
            taken += 1;
        }
    }
    if taken == PUMP_MESSAGES_MOST || started.elapsed() >= PUMP_TIME_MOST {
        let capped = PUMP_CAPPED.fetch_add(1, Ordering::Relaxed) + 1;
        if capped == 1 || capped % 2000 == 0 {
            log!("messages: the queue filled faster than it could be drained ({capped} passes cut short, {taken} taken, {} ms)", started.elapsed().as_millis());
        }
    }
}
```

`crates/host/src/webapp.js`（注入脚本，尽早）：

```js
  for (const type of ['dragstart', 'drag', 'dragend', 'drop']) {
    document.addEventListener(type, (event) => event.preventDefault(), true)
  }
```

**验证**：拖 QQ 音乐音量条和进度条，不卡；日志里最多出现一条 `messages: the queue filled faster than it could be drained (…)`。

### 2.2 启动画面的品牌 logo（`FIXES.md` §10）

**症状**：打火时的 splash 只显示品牌名文字，没有 logo。
**根因**：`ui/src/cabin/boot/BootScreen.tsx` 从 `/brand-logos/<brandId>.color.svg|.color.png|.svg|.png` 取图，全 404 时退化为 `boot-brand-wordmark`（`truck.brand` 文字）。而这 7 个文件是**车厂商标，上游故意放在仓库外**（`ui/public/brand-logos`，git-ignored），源码构建出来的 `ui/dist` 里没有。

**改法**：从**官方安装包**（不是源码仓库）里取这 7 个文件，放到 `ui/public/brand-logos/`：

```
daf.svg  daf-logo.svg  iveco.svg  renault.png  scania.svg  scania.color.svg  volvo.svg
```

来源：任何一台装过官方版的机器，`<安装目录>\ui\brand-logos\`。
Vite 会把 `public/` 原样拷进 `dist/`，所以**放进源码树之后必须重新构建 UI**；已装环境也可以直接把文件夹复制到 `<安装目录>\ui\brand-logos\` 立即生效。

**注意**：`man` / `mercedes` / `setra` 官方也没给文件，这三家就是显示品牌名文字，不是 bug。
**注意**：splash 只在**"电门从关到开"**时出现（`ui/src/cabin/state/power.ts`：WestPlay 在电动已开时启动会跳过 `splash` 直接 `connecting`）。

---

## 3. 功能 A：页面按宽度自适应缩放

### 3.1 规格

- 座舱屏幕是 **1280×720**（`crates/shared/src/lib.rs` 的 `SCREEN_WIDTH/SCREEN_HEIGHT`）；网页的"洞"实测 **1012 px** 宽（两侧留边）。
- QQ音乐 / B站 桌面版按 **1100 px** 排版 → 右边被切。
- 处理：**按宽度等比缩小网页像素**（`ICoreWebView2Controller::SetZoomFactor`），让页面的 CSS 宽度 ≥ 洞宽。
- **只缩不放**（放大只会更切）；**死区 3%**（`ratio >= 0.97` 不处理，避免滚动条导致的来回抖）；**迟滞 0.02**；**下限 0.55**（再小字就看不清了）。
- **不处理高度**：页面比洞高就靠滚动（滚轮已转发给页面）。刻意如此——长页面缩到整页可见会缩到看不清。

### 3.2 宿主端

`crates/host/src/webview.rs` 加一个设置缩放的方法（放在 `set_zoom`/`reload` 附近）：

```rust
    /// The page's pixels against the frame's: 0.92 shows a page laid out 1100 px wide in a 1012 px hole whole.
    pub fn set_zoom(&self, factor: f64) -> windows::core::Result<()> {
        // SAFETY: the controller is alive as long as `self`; a plain value.
        unsafe { self.controller.SetZoomFactor(factor) }
    }
```

`crates/host/src/webapp.rs`：`WebApp` 增加 `zoom: Cell<f64>`（初值 1.0）等字段（字段全表见 §6.1），并加：

```rust
    /// Back to 1:1 before a page of another kind loads (a new site, the site's home, a reload): its own layout
    /// decides the fit anew.
    fn zoom_back(&self) {
        if self.zoom.replace(1.0) != 1.0 {
            let _ = self.view.set_zoom(1.0);
        }
    }

    fn fit_width(&self, seen: f64, needed: f64) {
        /// Smaller than this and the page's words stop being readable at arm's length in the cab.
        const LEAST_ZOOM: f64 = 0.55;
        if seen <= 0.0 || needed <= 0.0 {
            return;
        }
        let ratio = seen / needed;
        // What fits, and a little over (a scrollbar's worth), takes no narrowing.
        if ratio >= 0.97 {
            return;
        }
        let zoom = (self.zoom.get() * ratio).clamp(LEAST_ZOOM, 1.0);
        if (zoom - self.zoom.get()).abs() < 0.02 {
            return;
        }
        if self.view.set_zoom(zoom).is_ok() {
            self.zoom.set(zoom);
            crate::log!(
                "webapp: the page lays out {} px wide in {} px, so its pixels are {zoom:.2} the frame's",
                needed.round(),
                seen.round()
            );
        }
    }
```

`Command::Reload / Home / Back` 处理前先 `self.zoom_back()`。

### 3.3 页面端（`crates/host/src/webapp.js`）

```js
  // The room this page has against the width it lays out in, to the host: a page written for a desktop screen is
  // wider than the cabin's, and its pixels go smaller until all of it shows (webapp.rs, `fit_width`). Said again as
  // it changes: the fit settles over a couple of rounds, the page laying itself out anew each time.
  let room = ''
  const reportRoom = () => {
    const needed = Math.round(
      Math.max(
        document.documentElement?.scrollWidth ?? 0,
        document.body?.scrollWidth ?? 0,
        document.body?.getBoundingClientRect().width ?? 0,
      ),
    )
    const seen = Math.round(window.innerWidth)
    const now = `${seen} ${needed}`
    if (!needed || now === room) return
    room = now
    post({ room: { seen, needed } })
  }
  window.addEventListener('resize', reportRoom)
  document.addEventListener('DOMContentLoaded', reportRoom)
  window.addEventListener('load', reportRoom)
  for (const delay of [200, 600, 1200]) setTimeout(reportRoom, delay)
  setInterval(reportRoom, 2500)
  reportRoom()
```

宿主侧接收（`take_reports` 里，与 `typing` 同级）：

```rust
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
```

### 3.4 数值参考

| 站点 | 洞宽 | 页面排版宽 | 得到 zoom |
|---|---|---|---|
| QQ音乐 | 1012 | 1100 | 0.92 |
| B站 | 1012 | 1100 | 0.92 |
| 网易云 | 1012 | ≈1012 | 1.00（不缩） |

日志证据：`webapp: the page lays out 1100 px wide in 1012 px, so its pixels are 0.92 the frame's`。

---

## 4. 功能 B：不跳变地显示（先适配，后显示）

**问题**：缩放要等页面排版完、把宽度报上来才发生，而那时页面已经显示了 → 用户看到"先出现，再缩一下"。

**做法**：`WebApp` 用三个状态控制可见性——`wanted`（界面要求显示）、`fitted`（页面已报过宽度并适配过）、`waiting`（开始等的时刻，用于兜底）。

```rust
    /// The app wants it in view (the cabin page cut itself open for it).
    wanted: Cell<bool>,
    /// It has said how wide it lays out since it came into view: shown then, not before.
    fitted: Cell<bool>,
    /// When it came into view, while it hasn't said that.
    waiting: Cell<Option<Instant>>,
```

- `Command::Show`：**首次**进入视图（`self.placed.get().is_none()`）时 `fitted=false`、`waiting=Some(now)`；然后 `wanted=true`、`place()`、`reveal()`。
- `Command::Hide`：`wanted=false`、`placed=None`。
- `reveal()`：

```rust
    fn reveal(&self) {
        let _ = self.view.show(self.wanted.get() && self.fitted.get());
    }
```

- 兜底（`take_reports` 开头，`const FITTING: Duration = Duration::from_millis(1500);`）：页面一直不报（浏览器自己的错误页、脚本没跑）就照常显示，**不能一直黑着**：

```rust
        if self.wanted.get()
            && !self.fitted.get()
            && self.waiting.get().is_some_and(|since| since.elapsed() > FITTING)
        {
            self.fitted.set(true);
            self.waiting.set(None);
            self.reveal();
        }
```

**注意**：`webapp.js` 里的上报时机（`resize` / `DOMContentLoaded` / `load` / 200-600-1200ms）就是为这个服务的，不能只留 2.5 秒的轮询——那会让每次打开都先黑 1 秒多。

---

## 5. 功能 C：HTML5 全屏铺满整个插件区域

### 5.1 为什么不能只靠 WebView2

页面里的 `<video>` 全屏时，Chromium 只是把 `document.fullscreenElement` 设上、把该元素铺满**它自己的视口**；WebView2 不会替 App 改变视口大小（`ContainsFullScreenElementChanged` 需要宿主自己处理）。而"洞"是座舱页挖出来的，宿主只能按界面给的矩形摆 WebView。所以链路必须是：**页面说 → 宿主转发 → 界面把洞放到整个区域 → 宿主把 WebView 摆过去**。

### 5.2 页面端（`webapp.js`）

```js
  let fullScreen = null
  const tellFullScreen = () => {
    const on = !!document.fullscreenElement
    if (on === fullScreen) return
    fullScreen = on
    post({ fullScreen: on })
  }
  document.addEventListener('fullscreenchange', tellFullScreen)
  tellFullScreen()
```

### 5.3 宿主端

`webapp.rs`：`full_screen: Cell<bool>`（初值 false），`State` 加字段（`#[serde(rename_all = "camelCase")]` → JSON 里的 `fullScreen`）：

```rust
    /// A video of the page's in full screen: the cabin page then cuts itself open over the whole area, its app's
    /// bar and the rest of it out of the way.
    pub full_screen: bool,
```

`state()` 填 `full_screen: self.full_screen.get()`；`take_reports` 里变化才推 `Report::State`：

```rust
            if let Some(on) = said
                .as_ref()
                .and_then(|said| said.get("fullScreen"))
                .and_then(serde_json::Value::as_bool)
                && on != self.full_screen.replace(on)
            {
                reports.push(Report::State);
            }
```

### 5.4 界面端

`ui/src/shared/host.ts`：

```ts
export interface WebAppState {
  site: WebAppSite
  title: string
  canGoBack: boolean
  /** A video of the page's in full screen: the app covers the whole CarPlay area (WebAppScreen.tsx). */
  fullScreen: boolean
}
```

`ui/src/cabin/apps/web/webapp.ts`（store）：加 `fullScreen: boolean`（初值 `false`），`receiveWebApp` 里 `setState({ …, fullScreen: state.fullScreen })`，收到 `null` 时一并复位。

`ui/src/cabin/apps/web/WebAppScreen.tsx`：

```tsx
  const fullScreen = useWebApp((state) => state.fullScreen)
  …
    <section className={`app-panel webapp${fullScreen ? ' full-screen' : ''}`} aria-label={…}>
```

`ui/src/cabin/apps/web/webapp.css`（追加）：

```css
/* A video of the page's gone full screen (the page says so, the host passes it on): this app takes the whole
   CarPlay area, its bar out of the way, and the page cuts the cabin page open all over it — the way YouTube's own
   player does (youtube.css `.yt-player`). The truck's OEM strip and the sidebar are where they were. */
.webapp.full-screen {
  position: absolute;
  inset: 0;
  z-index: 3;
}

.webapp.full-screen .webapp-bar {
  display: none;
}

.webapp.full-screen .webapp-page {
  border-radius: 0;
}
```

### 5.5 为什么这样就够

- 顶部条消失 → `.webapp-page`（`flex: 1`）变大 → `WebAppScreen` 里 `followArea()` 的 `ResizeObserver`（观察 `.carplay` 和页面元素）触发 → 重算 `hole` → `command({action:'show', …})` → 宿主 `place()` 把 WebView 摆到整个区域。**退出全屏自动反向**，不需要额外代码。
- 洞坐标是相对 `.carplay` 的（`WebAppScreen.tsx` 用 `.carplay` 的 `getBoundingClientRect()` 做原点），所以 `inset: 0` 的自然结果就是"整个 CarPlay 区"，与座舱里 YouTube 播放器的全屏行为一致（侧边栏和卡车原厂条保持原位）。

---

## 6. 改动清单（10 个文件）

| 文件 | 改什么 |
|---|---|
| `crates/host/src/lib.rs` | `pump_messages` 有界（§2.1） |
| `crates/host/src/webview.rs` | `SetAllowExternalDrop(false)`、`set_zoom()`、import 加 `ICoreWebView2Controller4` |
| `crates/host/src/webapp.rs` | 字段 `zoom/wanted/fitted/waiting/full_screen`、`zoom_back/reveal/fit_width`、`Show/Hide` 语义、`take_reports`（room / fullScreen / 兜底）、`State::full_screen`、单测更新 |
| `crates/host/src/webapp.js` | 拒绝拖动、`reportRoom`、`fullScreen` 上报 |
| `ui/src/shared/host.ts` | `WebAppState.fullScreen` |
| `ui/src/cabin/apps/web/webapp.ts` | store 的 `fullScreen` |
| `ui/src/cabin/apps/web/WebAppScreen.tsx` | `full-screen` 类 |
| `ui/src/cabin/apps/web/webapp.css` | `.webapp.full-screen` 三段 |
| `ui/src/cabin/apps/web/webapp.test.ts` | 断言带上 `fullScreen` |
| `ui/public/brand-logos/*` | 7 个图片（仓库外资源，§2.2） |

### 6.1 `WebApp` 的字段（放在 `State` 附近的 `struct WebApp` 里）

```rust
    zoom: Cell<f64>,
    /// The app wants it in view (the cabin page cut itself open for it).
    wanted: Cell<bool>,
    /// It has said how wide it lays out since it came into view: shown then, not before.
    fitted: Cell<bool>,
    /// When it came into view, while it hasn't said that.
    waiting: Cell<Option<Instant>>,
    /// A video of the page's in full screen: it takes the whole area WestPlay draws in.
    full_screen: Cell<bool>,
```

构造时：`zoom: Cell::new(1.0), wanted: Cell::new(false), fitted: Cell::new(true), waiting: Cell::new(None), full_screen: Cell::new(false)`。
（`fitted` 初值必须是 `true`：新建时页面还没进视图，不能因为"没适配过"就把之后第一次 `show` 卡住。）

---

## 7. 验收（全过才算完）

```powershell
# 1) 类型检查 + 前端测试（在 ui\ 下）
npx --no-install tsc -b
npx --no-install vitest run            # 期望 440 passed

# 2) 宿主单测（在仓库根）
cargo test -p westplay-host --lib webapp   # 期望 5 passed

# 3) 构建 + 部署见 §8
```

实机四项：§1 的表格 A/B/C/D。另外**回归一遍**：拖音量条不卡（§2.1）、网易云与 QQ 音乐正常播放、座舱键盘能输入到网页搜索框。

---

## 8. 构建与部署（Windows 上执行）

```powershell
cd <仓库根>

# 1) 只编 hosts（插件没改，不需要重编、游戏不用退）
npx --no-install tauri build --no-bundle        # 约 90 秒；产物 target\release\westplay.exe

# 2) 部署：exe + ui/dist 两个都要（界面改动在 ui/dist 里！）
Get-Process westplay -ErrorAction SilentlyContinue | ForEach-Object { $_.Kill() }
Start-Sleep 2
Copy-Item target\release\westplay.exe <安装目录>\westplay.exe -Force
Copy-Item ui\dist\* <安装目录>\ui\ -Recurse -Force
# 确认品牌 logo 在（§2.2）
Get-ChildItem <安装目录>\ui\brand-logos   # 期望 7 个文件
Start-Process <安装目录>\westplay.exe -WorkingDirectory <安装目录>

# 3) 打安装包（可选，需要 NSIS）
npx --no-install tauri build --config app/tauri.installer.conf.json
# 产物 target\release\bundle\nsis\WestPlay_2.1.2_x64-setup.exe（约 9.2 MB）
```

**安装包是全量包**：`westplay.exe` + `ui/`（含 brand-logos）+ `westplay.dll`（游戏插件）+ 三个许可文件 + 卸载器，按用户安装（不需要管理员）。不含 WebView2 Runtime（安装前会检测并提示）、不含 `westplay.scs`（那是运行时用玩家自己的游戏文件生成的）。

---

## 9. 五个已经踩过的坑

1. **只部署 exe 不部署 `ui/dist`**：全屏点了没反应、缩放看起来"没生效"。两个都要拷。
2. **`brand-logos` 不在 git**：`git clean -xdf` 或换一台机器构建就没了；构建前先 `Test-Path ui\public\brand-logos`，没有就从官方安装拷。
3. **`fitted` 初值写成 `false`**：第一次打开站点会黑 1.5 秒（等兜底）。
4. **把 `zoom_back()` 忘了**：换站点/回主页后沿用上一个站点的缩放，页面要么过小要么又被切。
5. **`fit_width` 想"放大回 1.0"**：只缩不放，否则页面在"切一点/缩一点"之间来回抖（`ratio >= 0.97` 与 0.02 迟滞是为同一个目的）。

---

## 10. 明确不做的事（下一批候选）

- **按高度自适应**：页面比洞高时不缩，靠滚动。缩到整页可见会把 B站首页那种长页面缩没。
- **`man` / `mercedes` / `setra` 的品牌 logo**：官方也没有这些文件，仍显示品牌名文字。
- **网页站点的座舱空间音频**：三站点目前不走 `speakers.rs` / `cab_sound.js`，是普通立体声。
- **网页站点的音量滑块联动**：`Command` 里没有 `Volume`，站点音量只能在页面里调。
- 这些都在 `FIXES.md` 的"已知限制"与 `PLAN.md` §8 里，别当成回归。

---

## 11. 一句话给接手的模型

把 §2 的三处必修 + §3/§4/§5 的三组功能按顺序打上（`webapp.js` 一次改完，宿主一次改完，UI 一次改完），跑 §7 的验收，部署时**exe 和 ui/dist 一起拷**，然后按 §1 的四项实机确认。`FIXES.md` 的 §8/§9/§10 是这三组改动对应的缺陷记录，含症状、根因、实测数字，遇到疑问先看那里。
