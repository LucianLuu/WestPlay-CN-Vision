# 升级到 2.1.2 —— 给服务器的交接说明

> **后继文档：`SERVER-BRIEF-2.1.2-FIXES.md`（第 2 批）** —— 2.1.2 合并之后又打的四组改动：
> 站点页面按宽自适应缩放、打开不跳变、B站全屏铺满、启动品牌 logo 资源恢复，含三处必修（拖放死锁、
> 消息泵限流、`brand-logos` 不在 git）。要在一份干净的 2.1.2 上重现当前状态，照那份做。

> 基线换成 **WestPlay 2.1.2**（原先是 2.0.3）。本文只说「这次升级带来的差异和必须注意的事」，
> 改造本身的目标与规格仍看 `PLAN.md`，缺陷清单看 `FIXES.md`。
>
> 结论先行：**改动量比想象的小**。上游没动我们改过的大部分文件；但有一个我们修过的 bug 上游自己修了，
> 那条补丁现在**必须撤销**，否则会冲突。

---

## ⚠ 本文档已成历史：2.1.2 的合并**已经做完并实机验证通过**（2026-10-27）

实际执行结果（可作为"照做一遍应该得到什么"的对照）：

| 项 | 结果 |
|---|---|
| 自动合并 | 5 个冲突候选文件**零冲突** |
| 需要手改的额外文件 | 2 个（`Keyboard.tsx`、`music/pages.tsx`，见 §2.4） |
| `tsc -b` | 0 错误 |
| `vitest run` | **440 通过**（2.0.3 时 419） |
| `cargo test -p westplay-host` | **191 通过**（2.0.3 时 165） |
| 构建 | `cargo build --release -p westplay-plugin` + `tauri build --no-bundle`，产物 `westplay.exe` 22.07 MB / `westplay.dll` 0.52 MB |
| 实机 | 三个站点、媒体控件、屏幕键盘、回车搜索、9 档文字大小全部正常 |
| 地图 | 启动时自动重建一次；坏 mod（`data_bus.mp`）被跳过并记录，不再中断 |
| 安装包 | `tauri build --config app/tauri.installer.conf.json` → `WestPlay_2.1.2_x64-setup.exe`（9.06 MB）。**NSIS 不会自己下**（GitHub 被墙），要先离线放到 `%LOCALAPPDATA%\tauri\NSIS\`，见 `PLAN.md` §6.1 |

最终产物路径：`WestPlay-2.1.2-mod/`（源码）、`D:\WestPlay`（装置）、`D:\WestPlay-backup-20261027-212`（快照）、
`westplay-mods-src-212.zip`（相对纯净 2.1.2 的改动集）。

**如果只是要"再来一次"**：拿新的纯净版，按 §2.1 覆盖 13 个文件、§2.2 的 7 个文件合并、
加上 §2.4 的两处一改，然后跑 §6 的构建与验收即可。

---

## 0. 三条最重要的结论

1. **地图崩溃（FIXES §1）不要打了。** 上游 2.1.2 自己修好了，方式与我们不同：
   `crates/mapdata/src/archive.rs:473` 现在是
   `out.reserve(out.len().max(64 * 1024).min(most - out.len()));`，注释（:685）直接点名了 2.0.3 的
   `min > max. min = 65536, max = 42304`。**用上游版本，删掉我们的 `.max(64*1024).min()` 改法。**
2. **不需要、也不该再带 `app/tauri.local.conf.json`。** 2.1.2 的基础配置里 `bundle.active` 已经是 `false`，
   `beforeBuildCommand` 已经是 `npm run build:release`。改用 `tauri build --no-bundle` 即可；
   带着我们那份会把 `bundle.active` 改回 `true`，反而去跑本机坏掉的 NSIS。
3. **必须保留新的 `crates/plugin/build.rs`。** 它是 2.1.0 的头号修复（静态链接 VC++ 运行时），
   删掉或替换成 2.0.3 的版本 = 没装 VC++ Redistributable 的玩家加载不了插件（game.log 里 `0000007E`）。

---

## 1. 上游 2.0.3 → 2.1.2 中会碰到我们的变化

| 上游更新（CHANGELOG 2.1.0） | 撞到我们哪块 | 处理 |
|---|---|---|
| #11 地图准备失败隔离（`archive.rs` 那处 `clamp` 崩） | FIXES §1 | **撤销我们的补丁**（见 §0.1） |
| #15 日志：Documents 被拒时改落 `%LOCALAPPDATA%\app.westplay\logs`；重启不再清空 | 排查流程 | 两个路径都看；日志会累积，**认时间戳** |
| #6 Text Size 新增 0.8 / 0.9 两个更小档，Home 名称与 Settings 标题跟着缩放 | 汉化后的排版 | 最小档必测（中文比英文宽，容易顶格） |
| #10 平板 / 任意卡车：新增 `crates/setup/src/tablet.rs`、`crates/host/src/fitted.rs`、屏幕布局 `tablet` | 洞与合成、屏幕几何 | 在**平板**屏幕上把三个站点跑一遍 |
| #17–22 车内音响（`speakers.rs`、`fitted.rs`、`cab_sound.js`） | 我们的网页播放器**不经过**它 | 记为已知限制，见 §8 |
| #1 插件静态 VC 运行时（新 `crates/plugin/build.rs`） | 构建 | **必须保留** |
| `ui/src/shared/host.ts` 新增 `{ action: 'fade'; level: number }` | 我们要加的 webApp 消息类型 | 合并（互不冲突） |
| `ui/src/cabin/state/store.ts`：持久化版本→3、`truckScreen`(台板)、Spotify 状态搬去 `apps/spotify/spotify` | 我们要加的 `case 'webApp'…` | 加进**新的** switch |
| `ui/src/companion/preview.ts`：新增 `truckSupported`、`any-truck-tablet`、`app_log_place` | 我们的图标映射 | 重贴 3 个图标 |
| `crates/host/src/performance.rs`：新增 `captured` / `waited` 字段 | 我们要加的 `Profile::WebApp` | 加枚举变体即可 |
| `crates/setup/Cargo.toml` 新增 `png = "0.18"`；`crates/mapdata` 改依赖 `westplay-shared` | 编译 | 需要 `cargo fetch`（走镜像） |

**上游完全没动**（确认过，逐字节一致）：`crates/host/src/pointer.rs`、`crates/host/src/webview.rs`、
`ui/src/cabin/apps/AppScreen.tsx`、`ui/src/cabin/dashboard/*`、`ui/src/cabin/keyboard/{layouts,store}.ts`、
`ui/src/cabin/shell/Shell.tsx`、`ui/src/cabin/state/{apps,strings}.ts`、`ui/src/shared/{icons,media}.ts`。

---

## 2. 合并矩阵

### 2.1 直接用我们的版本覆盖（上游没动，13 个）

```
crates/host/src/pointer.rs
crates/host/src/webview.rs
ui/src/cabin/apps/AppScreen.tsx
ui/src/cabin/dashboard/nowPlaying.ts
ui/src/cabin/dashboard/useNowPlaying.ts
ui/src/cabin/dashboard/widgets.tsx
ui/src/cabin/keyboard/layouts.ts        ← 我们的 zh 键位（上游没动）
ui/src/cabin/keyboard/store.ts
ui/src/cabin/shell/Shell.tsx            ← holeMask 在这里
ui/src/cabin/state/apps.ts              ← Home 顺序
ui/src/cabin/state/strings.ts           ← 整份 zh 词条（上游没动）
ui/src/shared/icons.ts
ui/src/shared/media.ts
```

测试文件一并覆盖：`dashboard/nowPlaying.test.ts`、`state/apps.test.ts`、`shared/icons.test.ts`，
以及新增的 `apps/web/webapp.test.ts`。

### 2.2 要手工合并（7 个）

| 文件 | 上游改了什么 | 我们要保留/加上什么 |
|---|---|---|
| `crates/host/src/lib.rs` | 平板、音响、视频诊断、日志等（+50 行） | 我们的 ~15 处 webapp 挂钩 |
| `crates/host/src/performance.rs` | `Sample` 加 `captured`/`waited` 与统计 | `Profile::WebApp(&'static str)` + 站点命名 |
| `ui/src/cabin/state/store.ts` | 迁移版本 3、`truckScreen`、Spotify 导入 | `case 'webApp' / 'webAppMedia' / 'webAppTyping'` |
| `ui/src/shared/host.ts` | Spotify 播放器 `fade` 动作 | `WebAppCommand`、`webAppTyping`、`WebAppMedia`、`WebAppState` |
| `ui/src/companion/preview.ts` | 卡车支持状态、平板、日志路径 | `spotify→netease.*`、`youtube→bilibili.*`、`music→qq-music.*` |
| `app/tauri.conf.json` | 只有 `version` 变了 | **不用改**（描述文案可选） |
| `crates/mapdata/src/archive.rs` | 上游修好了同一个崩溃 | **不要打我们的补丁** |

### 2.3 新增文件（9 个）与图标

```
crates/host/src/webapp.rs            新
crates/host/src/webapp.js            新
ui/src/cabin/apps/web/webapp.ts      新
ui/src/cabin/apps/web/WebAppScreen.tsx  新
ui/src/cabin/apps/web/webapp.css     新
ui/src/cabin/apps/web/webapp.test.ts 新
ui/public/icons/westplay/qq-music.{light,dark}.svg    新
ui/public/icons/westplay/netease.{light,dark}.svg     新
ui/public/icons/westplay/bilibili.{light,dark}.svg    新
```

删除：`ui/public/icons/westplay/{spotify,youtube}.{light,dark}.svg`（4 个）。
**不要**带 `app/tauri.local.conf.json`。

### 2.4 实际合并时才暴露出来的两个文件（**矩阵漏了，必须一起改**）

这两个文件上游确实改过，但改动不在我们触摸的行上，所以「上游没动」的判断骗过了自动合并——**类型检查会拦住**：

| 文件 | 上游改了什么 | 要改什么 |
|---|---|---|
| `ui/src/cabin/keyboard/Keyboard.tsx` | 新抽了 `KeyFace` 组件，参数写死 `language: 'en' \| 'tr'` | 改成 `Language`（`import type { Language } from '../state/strings'`），否则 `'zh'` 传不进去 |
| `ui/src/cabin/apps/music/pages.tsx` | 新版把 `useLanguage()` 的结果直接传给 Apple Music 的 `library` 请求（`language?: 'en' \| 'tr'`） | 边界处映射：`language: language === 'tr' ? 'tr' : 'en'`。**不能直接把 `'zh'` 发给宿主**——Rust 侧只认 en/tr，整条消息会解析失败，Apple Music 的媒体库会空 |

第二条尤其要注意：它不是一个纯类型问题，是**协议边界**。宿主（Rust）的参数类型窄于界面语言，新增一门语言必须在边界收口。

---

## 3. 七个合并项的具体锚点（2.1.2 的行号是当前包的）

### 3.1 `crates/host/src/lib.rs`（最关键）

上游结构没变，我们原来挂钩的位置在新版里这样对应：

| 我们要加的东西 | 2.1.2 的锚点 |
|---|---|
| `mod webapp;` | 文件顶部的 `mod` 列表（33 行附近 `mod youtube;` 之后） |
| `let mut webapp: Option<webapp::WebApp> = None;` 等 4 个局部变量 | 352–385 行：`let mut youtube: Option<…>`、`spotify`、`youtube_music` 那一串声明之后 |
| `PageMessage::WebApp { command }` 分支 | 705 行 `for message in webview.take_page_messages()` 的 `match` 里 |
| `PageMessage::Typing` 的「座舱键盘不覆盖页面序号」守卫（`webapp_selected == 0` 才存） | 839 行 `Some(PageMessage::Typing { selection }) =>` |
| `PageMessage` 枚举加 `WebApp { command }` | 1867 行 `enum PageMessage` |
| 性能统计里登记站点 | 570–575 行 `profiles.push((performance::Profile::…, …view().environment()))` |
| 每帧推进（读 report、post 消息） | 1124–1160 行 `for report in player.take_reports()` 那几段（spotify 的处理是最像我们的模板） |
| 游戏按键转发进页面（`selection == webapp_selected`） | 1337–1345 行 `let typed: Vec<u32> = … typing_block.keys.pop()` |
| 每帧 `update()` | 1489 行 `fn update(&mut self, heartbeat: u64, now: Instant) -> bool` |

⚠ 两个必须照抄的细节：**`match` 第一条 `Open | Close => Ok(())` 里绝对不能再放 `SetText`/`Enter`**（FIXES §7.5）；
`webapp_selected` 与 `typing.selection` 的互斥（FIXES §7.1 末尾）。

### 3.2 `crates/host/src/performance.rs`
加变体 `WebApp(&'static str)`，并在 223 行那个 `match profile` 里给 Bilibili / QQ Music / NetEase Cloud Music 取名。
上游新加了 `captured`/`waited` 字段，与我们的改动无交集。

### 3.3 `ui/src/cabin/state/store.ts`
上游没有新增 `case`，但 switch 外面的导入和迁移逻辑变了。把我们的三个 case 加进 360 行 `switch (message.type)`：
`case 'webApp'` → `receiveWebApp(message)`、`'webAppMedia'`、`'webAppTyping'`。

### 3.4 `ui/src/shared/host.ts`
把我们那几组类型并进去即可（上游只多了一个 `fade` 动作，名字不冲突）。

### 3.5 `ui/src/companion/preview.ts`
上游加了 `truckSupported`、`any-truck-tablet`、`app_log_place`。重贴三行图标映射
（`spotify→netease.*`、`youtube→bilibili.*`、`music→qq-music.*`），别把上游新加的分支覆盖掉。

### 3.6 `app/tauri.conf.json`
只有版本号变化，**不需要动**。我们要做的只是**删掉** `app/tauri.local.conf.json`。

### 3.7 `crates/mapdata/src/archive.rs`
用上游的。我们那行 `.max(64 * 1024).min(most - out.len())` 与上游 473 行是同一处，**只留上游的**。

---

## 4. 构建方式的变化（服务器交付后，本机执行）

```powershell
# 1) 取依赖（2.1.2 新增 png 依赖；有新增/改版本的 crate）
cargo fetch

# 2) 前端依赖（2.1.2 的 devDependencies 与 2.0.3 相同，通常无需重装；换了 node_modules 就装一次）
cd ui; npm install; cd ..

# 3) 先编插件（cdylib，新的 build.rs 会加静态 VC 运行时链接参数）
cargo build --release -p westplay-plugin

# 4) 再编 host（2.1.2 不需要 --config）
npx --no-install tauri build --no-bundle
#   产物：target/release/westplay.exe

# 5) 部署（目录结构没变）
taskkill /IM westplay.exe /F
copy target\release\westplay.exe D:\WestPlay\
robocopy ui\dist D:\WestPlay\ui /MIR
start D:\WestPlay\westplay.exe
```

注意：
- `--no-bundle` 之后 `ui/dist` **不会**被自动拷进安装目录（`bundle.resources` 只在打包时生效），必须手动 `robocopy`
- 换版本要**清掉** `D:\WestPlay\ui\assets` 里旧版本的 hashed chunk（`/MIR` 会清）
- 版本号现在是 **2.1.2**

---

## 5. 服务器这边能做什么、不能做什么

**能做（请在交付前跑完）**
```bash
cd ui && npx tsc -b && npx vitest run     # 类型 + 419+ 个测试
```
- 逻辑性改动尽量只落在 TS/JS 侧（这部分能验证）
- Rust 侧改动保持「加法」：新增文件、新增枚举变体、新增 match 分支，别重构上游代码

**不能做**
- 不能编 Windows 目标、不能跑 `tauri build`、不能实机验证（MSVC + WebView2 的活只能在这台 Windows 上）
- 不要试图用 `cargo check` 做最终把关（`windows` crate 目标是 Windows）

**交付物**
- 改完的源码树（`ui` 依赖目录别带）
- 一份「改了哪些文件」的清单（这台机器没有 git，用路径 + 是否新增）

---

## 6. 本机验收清单（改完必须全过）

**先跑一遍基础**
```powershell
cd ui; npx --no-install tsc -b; npx --no-install vitest run; cd ..
cargo test -p westplay-host
cargo check -p westplay-host
```

**再进游戏按这个顺序点**

| # | 检查 | 期望 |
|---|---|---|
| 1 | 引导页地图 | 不卡在「正在准备你的地图…」（上游已修，确认没被打补丁打坏） |
| 2 | Home 顺序 | 地图 · QQ音乐 · 网易云 · AppleMusic · 哔哩哔哩 · 天气 · 设置 |
| 3 | 界面语言 | 全中文（`strings.ts` 的 zh 没被上游覆盖掉） |
| 4 | Apple Music | 仍能播放（这部分上游改动最多，是本次最大回归风险） |
| 5 | 三个站点 | 都能打开、能登录/扫码、能播放 |
| 6 | 点链接 | B 站视频、QQ 音乐「我的音乐」能进（FIXES §3） |
| 7 | 主页媒体控件 | 封面/歌名/歌词/三键，与网页双向联动 |
| 8 | 屏幕键盘 | 点输入框升起、在网页之上、打字、回车搜索（FIXES §7） |
| 9 | **文本大小最小档** | 0.8 / 0.9 档下中文不顶格、不裁切（2.1.2 新增，必查） |
| 10 | **平板** | 在没屏幕的卡车上装 WestPlay 平板，三个站点能否正常显示与键盘 |
| 11 | 日志 | `Documents\WestPlay\logs\app.log` 或 `%LOCALAPPDATA%\app.westplay\logs\app.log` |

---

## 7. 四个还会再踩一次的坑

1. **`match` 顺序**：`Open | Close => Ok(())` 那张网会把后面写的 `SetText`/`Enter` 吞掉（FIXES §7.5）
2. **Windows 大小写**：`WebApp.tsx` 与 `webapp.ts` 在 Linux 上没事，Windows 上必炸（FIXES §2）
3. **mapdata 别再打补丁**：上游已修，重复改只会冲突
4. **洞是遮罩出来的**：网页盖在座舱页之上，任何要显示在网页之上的座舱元素都得先收缩 `hole`（FIXES §7.2）

---

## 8. 已知限制（2.1.2 后新增/仍存在）

| 限制 | 说明 |
|---|---|
| 网页播放器**没有**车内音响效果 | 2.1.0 给 Apple Music / Spotify / YouTube Music 加了按卡车扬声器位置的空间音频与淡入淡出（`speakers.rs` + `cab_sound.js`）；我们的 QQ音乐/网易云是普通 WebView，声音不经过这套处理，出驾驶室也不会变闷。要做需要把 `cab_sound.js` 也注入 webapp 的视图——属可选增强，需实机验证，别在本次一起改。 |
| 平板/任意卡车屏幕未验证 | 洞与合成逻辑没为 `tablet` 布局专门测过 |
| 站点改版即失效 | QQ 音乐的 DOM 选择器、歌词接口都是硬编码 |
| 一次只开一个站点 | 只维持一个离屏 WebView |
| 2.1.3 已有更新 | 本包是 2.1.2；2.1.3 只修了 TruckersMP 自分身的小红点，不影响改造 |
