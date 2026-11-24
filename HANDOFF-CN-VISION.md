# WestPlay CN Vision · 交接文档

写给接手排查的人。这一轮做了三件事：**合入 3.0 的空间音频与 WebView2 修复**、**给车机页加中文输入法**、**把主窗口账号页的三个登录服务换成我们自己的**。前两件已完成并验证；第三件有残留问题（账号页按钮没有文字），需要接着查。

- 仓库：`LucianLuu/WestPlay-CN-Vision`，分支 `hotfix-webview`
- 基线：上游 `2.4.1+2` + 主窗口换成上游 `3.0.0-beta.1` 的界面
- 版本号：`3.0.0`
- 构建产物：`WestPlay_3.0.0_x64-setup.exe`（NSIS，38.3 MB）

---

## 一、当前遗留问题（优先看这个）

### 账号页三个服务的按钮没有文字

**现象**：设置向导 → 账号，三行都在（Bilibili / 网易云音乐 / QQ 音乐），行标题正确，但右侧的「登录 / 退出登录」按钮是**空白的**。

**已确认**：词条数据在文件里是对的。`D:\WestPlay\ui\assets\companion-BB_QWF30.js` 第 567073 字节起：

```js
accounts:{title:`Accounts`,sub:`Sign in to see your own feed, ...`,
  signIn:`Sign In`,signOut:`Sign Out`,signedIn:`Signed in`,notSignedIn:`Not signed in`,
  finishInWindow:`...`,signingIn:{...},
  bilibili:{title:`Bilibili`,sub:`...`,signIn:`Sign In`,...},
  netease:{...}, qqMusic:{...}}
```

**行组件 `ai` 的取词路径**（同一文件内）：

```js
function ai({service:e, status:t, signedIn:n, hover:r}) {
  let i = H(),                    // ← 词条上下文
      a = i.accounts,             // ← 外层 accounts
      o = ni[e],                  // ← 服务定义（名字、命令、glow、words）
      s = n[e],                   // ← 登录态
      c = s ?? false,
      l = o.signingIn(t),
      u = s === null,
      d = Ln(c, o.signOut);
  return jsx(Z, {
    title: o.name,
    detail: u ? undefined : l ? o.words(i).finishInWindow : c ? a.signedIn : a.notSignedIn,
    accessory: u ? jsx(Qn,{})
      : c ? jsx(Y,{..., children: a.signOut})
          : jsx(Y,{..., children: a.signIn}),   // ← 这里该出「登录」
  })
}
```

`a.signIn` 在外层 accounts 里**确实存在**（见上面摘录）。所以要么是 `H()` 拿到的不是这一套词条，要么 `a` 不是这个对象。

**排查建议**：

1. **确认 `H()` 到底返回哪一套词条。** 文件里有**两套** `accounts`：
   - 第 1 套（companion 页自己的）：`accounts:{title:`账号`,sub:`…`}` —— 只有 title/sub，约在 497757 字节
   - 第 2 套（onboarding 页的）：`accounts:{title:`Accounts`,...signIn...}` —— 约在 567073 字节
   
   两套在**同一个**词条大对象里吗？如果不是，`H()` 取的是哪一个？
2. **在浏览器里断点确认。** 用 `--remote-debugging-port=9333` 打开主窗口（`app/tauri.conf.json` 的 `additionalBrowserArgs` 里加，注意 `bundle-240.json` 也会覆盖），到 `ai` 里打印 `a` 的实际内容。
3. **检查 `Z` 组件的 `accessory` 渲染。** `Z` 的签名：
   ```js
   function Z({title:e,detail:t,value:n,accessory:r,onClick:i,link:a,danger:o,wrap:s,hover:c})
   ```
   确认 `accessory` 真的被渲染进 DOM，而不是被条件跳过。

**临时可用**：账号页三行能显示、点击应该仍会触发对应的 sign_in 命令（按钮存在，只是没文字）。

---

## 二、这一轮做了什么

### 1. 空间音频（`crates/host/`）

**来源**：交接包 `WestPlay-3.0.0-beta.1-full-audio-webview2.zip` 里的 `spatial-audio/`。

#### 1a. 头部遥测迟到导致静音（已完成，与 3.0 逐字一致）

`crates/host/src/cab_sound.js`。

```js
// 改前：没拿到头位就整个跳过，音源悬空 → 无声
if (audio.wired === speakers || (speakers && !head)) return
audio.wired = speakers

// 改后：没头位走普通输出（EQ + 车舱滤波仍生效），有头位再切 HRTF
const using = speakers && head ? speakers : null
if (audio.wired === using) return
audio.wired = using
...
if (!using) { trim.connect(walls); through.connect(context.destination); return }
```

验证：与 3.0 的 `cab_sound.js` **去掉注释后 275 行全同，0 差异**。

#### 1b. DAF XG / XG+ 低音炮（已完成）

`crates/host/src/speakers.rs`。

3.0 按**内饰模型文件**（`/vehicle/truck/daf_2021/interior/` + `xg.pmd` 等）区分 XF / XG / XG+。我们的 `TruckInfo`（`crates/shared/src/lib.rs:858`）**没有内饰字段**，只有 `id` / `name` / `brand` 等，所以改用游戏给的车名分派。

新增两张表：

```rust
const DAF_2021_XG: &[Speaker] = &[ ... 8 条 ... ]     // 左舵
const DAF_2021_XG_UK: &[Speaker] = &[ ... 8 条 ... ]  // 右舵镜像
```

与原有 `DAF_2021`（7 条，XF 的）的差别只有两处：

```
门板分频：60–400 Hz  →  80–400 Hz
新增低音炮：[0, 80] 0 dB both [±0.651, 0.785, 1.089] 0 ms
```

新增函数：

```rust
pub fn in_truck_named(id: &str, name: &str) -> Option<&'static [Speaker]>
pub fn in_truck_named_uk(id: &str, name: &str, uk: bool) -> Option<&'static [Speaker]>
```

调用点：`crates/host/src/lib.rs:2374`

```rust
_ => speakers::in_truck_named(truck.id.as_str(), truck.name.as_str()),
```

**已知限制**：`in_truck_named_uk` 写好了但**没接进调用点**，因为没有右舵判断来源。所有 DAF 2021 目前都用左舵表。右舵车主的低音炮会在副驾那侧（x 正方向），实际应该在 x 负方向。

#### 1c. 大巴外视角误判（已完成）

`crates/plugin/src/screens.rs:573`。

```rust
// 改前：只认 CAB_MARK_SAID
if (on_it && !(tablet && CAB_MARK_SAID.load(Ordering::Acquire))) || given_up {

// 改后：补上 TABLET_TOOK_BUS（3.0 的 ignore_tablet）
let tablet_out = tablet
    && (CAB_MARK_SAID.load(Ordering::Acquire) || tablet_took);
if (on_it && !tablet_out) || given_up {
```

`tablet_took` 在同函数第 475 行已经读出来了。

### 2. WebView2 崩溃韧性（`crates/host/src/webview.rs`）

**来源**：交接包里的 `WebView崩溃修复分析.md`（5 层机制）。

核对结果：**第 1、3、4、5 层我们本来就有**，缺第 2 层。

#### 新增：frame 级精准重载

原来 `failure_of` 把 frame 失败归到 `_ => None`，那个 iframe 会永久空白。现在：

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Failure {
    Frame,      // 新增：只有那个 iframe，页面其余部分还在
    Page,
    Browser,
}

COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED => Some(Failure::Frame),
```

配套两个东西：

```rust
// 从 WebView2 拿到崩溃的 frame 名单（Name + Source）
fn frames_of(args: &ICoreWebView2ProcessFailedEventArgs) -> Vec<FailedFrame>

// 注入脚本，只重载这些 iframe
pub fn reload_frames(&self, failed: &[FailedFrame]) -> windows::core::Result<()>
pub fn take_frames(&self) -> Vec<FailedFrame>
```

注入的脚本按 `name` 或 `src` 匹配，递归进同源嵌套 frame：

```js
const again = (page) => {
  for (const frame of page.querySelectorAll('iframe, frame')) {
    const one = failed.find(each => each.name === frame.name || each.source === frame.src);
    if (one) { frame.src = 'about:blank'; frame.src = one.source || frame.src; }
    else try { if (frame.contentDocument) again(frame.contentDocument) } catch {}
  }
}
```

**注意 `about:blank` 那一行**：同一个 `src` 赋值不会触发重载，是 3.0 原脚本没有的补丁，这里加上了。

调用点两处：`lib.rs:663`（cabin 页）、`safari.rs:909`（Safari 标签）。

**API 踩坑记录**（webview2-com 0.39.1）：

- 常量名是 `COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED`，不是 `FRAME_PROCESS_EXITED`
- `args.cast::<EventArgs2>()` 返回 `Result`，不是 `Option`
- `FrameInfosForFailedProcess()` → `ICoreWebView2FrameInfoCollection`，它的 `GetIterator()` 给 `ICoreWebView2FrameInfoCollectionIterator`
- 迭代器是 `HasCurrent(&mut BOOL)` / `GetCurrent()` / `MoveNext(&mut BOOL)`，**不是** `Current()`
- `ICoreWebView2::ExecuteScript` 是 `unsafe`

#### WebView2 158 `STATUS_BREAKPOINT`：我们本来就有

这三份文件与上游发布版一致，`yf()`（包装）、`bf()`（安装）、`Ht()`（桥接）与两条 CSS 规则都在其中。

**如果仍然崩溃，问题在 `westplay.exe` 里的 Chromium 内部断言，WestPlay 侧改不了。**

### 3. 中文输入法（`ui/src/cabin/keyboard/`）

**来源**：小千提供的补丁 `WestPlay-中文输入法候选框.patch`（`git apply --exclude=CHANGELOG.md` 应用，我们没这个文件）。

他改的 10 个文件全部应用成功，44 个输入法用例通过。

**我额外做的一处放宽**（`store.ts:93`）：

```ts
// 他的写法（只有 webAppField 带 playerTypes: false，车机自己的框都没这个字段）
const ime = keys.language === 'zh' && field?.playerTypes === false

// 改成
const ime = keys.language === 'zh' && field != null && field.playerTypes !== true
```

**已知遗留**：Safari 地址栏打拼音没有候选框。日志显示 `attach safari-address language=zh` 成功、拼音表加载成功（415 音节），但按键事件到不了 `press`。没查出来，暂停了。

### 4. 账号页三个服务（**有遗留问题，见第一节**）

`tools/scripts/accounts_services.py`

改动点：

1. `ni` / `ri`：YouTube / Spotify / Apple Music → Bilibili / 网易云 / QQ 音乐
2. `De`：读 `status.webLogins.<服务>.signedIn`（宿主一直在推，`crates/host/src/weblogin.rs:293` 的 `Logins::state()`）
3. `Oe`：清空（原来是启动时各 check 一次，现在宿主主动推）
4. 账号页默认服务 `useState('youtube')` → `useState('bilibili')`
5. 服务查找加兜底 `ni[o??i] ?? ni[ri[0]]`
6. 重写 onboarding 那套 `accounts` 词条（三种语言），外层留通用词，内嵌三个子服务

**后端是现成的**：`crates/host/src/lib.rs:167` 的 `Accounts` 结构里早就有 `bilibili` / `netease` / `qq_music` 三个 `AccountRequest`，`app/src/main.rs` 里有对应的 `*_sign_in` / `*_sign_out` 命令。`Status.web_logins` 也一直在填。

**为什么前两轮改完还是黑屏**：`companion-BB_QWF30.js` 被打进 **exe 的资源**里，只替换 `D:\WestPlay\ui` 目录不生效，必须重新 `tauri build`。这一点容易踩。

---

## 三、其他改动（这一轮之前就有，一并说明）

| 项 | 位置 | 说明 |
|---|---|---|
| 帧率统一 | `settings.rs` / `lib.rs` | `FrameRate` ↔ `RefreshRate` 互通，3.0 界面的「帧率」写到 `screen.refreshRate` |
| 性能模式删除 | 多处 | 字段、消息、store 状态、设置页、词条、测试全删 |
| 侧栏退回 2.4.1 | `shell.css` | 3.0 的侧栏按 `--sidebar-w` 推导，与我们几套独立 scale 混用会打架，整块退回 |
| 侧栏 View Transition | `Sidebar.tsx` | 恢复 `viewTransitionName`（去掉反而出残影）|
| 网易云 logo | `NeteaseApp.tsx` / `netease.css` | SVG glyph → 官方 `netease-mark.png`（62px），`.ne-brand` 66px |
| 网易云歌词白字 | `netease.css` | `.ne-now[data-words='light']` 也改白，未唱歌词透明度 0.3 → 0.45 |
| 后台不切歌 | `audio.ts` | cleanup 不再 `audio.onended = null`（来自 `58bc6f9`）|
| 空间音频抖动 | `camera.rs` | 删 `outside_with_camera` / `OUTSIDE_METRES`，只按屏幕绘制判断（来自 `93c5236`）|
| WebApp 插字 | `webapp.rs` / `webapp.js` | `Input.insertText`（CDP）→ 页内消息 `webAppInsert` + `insert()` |
| 诊断开关 | `webview.rs:1253` | `WESTPLAY_DEBUG_PORT=9222` 时车机页开远程调试 |

---

## 四、构建与部署

### 环境变量

```powershell
$env:CARGO_HOME  = 'D:\WestPlay-dev\toolchain\rust\cargo'
$env:RUSTUP_HOME = 'D:\WestPlay-dev\toolchain\rust\rustup'
$env:PATH        = 'D:\WestPlay-dev\toolchain\rust\cargo\bin;' + $env:PATH
$env:CARGO_TARGET_DIR = 'D:\WestPlay-dev\target-fresh'      # 不要用 target-merge，那边 app-manifest 坏了
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content 'D:\WestPlay-dev\keys\westplay-cn.key' -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
```

### 三步构建（**顺序不能乱**）

```powershell
cd D:\WestPlay-dev\merge\ui
npx --no-install vite build          # 1. 车机页

# 2. 恢复 3.0 主窗口的资源（vite build 会清空 ui/dist）
$p300 = '<上游 3.0 的原始资源目录>'
foreach ($f in 'companion-BB_QWF30.js','liquidGlass-BV0aK3K-.js','liquidGlass-BJ5o1Imv.css',
               'companion-BtxdEn94.css','app-B1Rt6EbS.js') {
  Copy-Item "$p300\assets\$f" 'ui\dist\assets\' -Force
}
Get-ChildItem "$p300\assets" -Filter '*.woff2' | Copy-Item -Destination 'ui\dist\assets\' -Force
Copy-Item "$p300\index.html" 'ui\dist\index.html' -Force
Copy-Item "$p300\assets\companion-BB_QWF30.js"  'ui\dist\assets\companion-BB_QWF30.js.orig'  -Force
Copy-Item "$p300\assets\companion-BtxdEn94.css" 'ui\dist\assets\companion-BtxdEn94.css.orig' -Force

# 3. 重跑 3.0 的所有改动。**必须按这个顺序串行**：
#    rebuild_companion.py   从 .orig 起，写出一份
#    accounts_services.py   从**上一步的输出**接着改（不是从 .orig，否则会冲掉上一步）
python -X utf8 D:\WestPlay-dev\tools\scripts\rebuild_companion.py
python -X utf8 D:\WestPlay-dev\tools\scripts\rebuild_companion_css.py
python -X utf8 D:\WestPlay-dev\tools\scripts\accounts_services.py

# 3b. 校验 158 的规避真的在 iframe 会跑的 bundle 里（退出码非零就别发版）
python -X utf8 D:\WestPlay-dev\tools\scripts\verify_158.py

cd D:\WestPlay-dev\merge
cargo build --release --workspace
Copy-Item "$env:CARGO_TARGET_DIR\release\deps\westplay.dll"        app\dist-plugin\ -Force
Copy-Item "$env:CARGO_TARGET_DIR\release\westplay-maps.exe"        app\dist-plugin\ -Force
Copy-Item "$env:CARGO_TARGET_DIR\release\westplay-probe.exe"       app\dist-plugin\ -Force
cargo clean -p westplay-app
node D:\WestPlay-dev\src-240-clean\node_modules\@tauri-apps\cli\tauri.js build `
     --bundles nsis --ci --config D:\WestPlay-dev\tools\scripts\bundle-240.json
```

产物：`D:\WestPlay-dev\target-fresh\release\bundle\nsis\WestPlay_3.0.0_x64-setup.exe`

### 关键陷阱

1. **`beforeBuildCommand` 必须是 `null`**。`bundle-240.json` 里要覆盖掉，否则 Tauri 会重跑 `vite build`，把恢复好的 3.0 资源全冲掉。
2. **`vite build` 会清空整个 `ui/dist`**，包括 `.orig` 备份。所以恢复步骤必须紧跟其后。
3. **前端资源打进 exe**，只换 `D:\WestPlay\ui` 不生效，必须重打包。这轮账号页黑屏绕了两圈就栽在这。
4. **判断 dev / release**：`westplay.exe` < 20 MB 是 dev，> 23 MB 是 release。

### 部署

安装包完整，静默安装即可：

```powershell
$setup = 'D:\WestPlay-dev\target-fresh\release\bundle\nsis\WestPlay_3.0.0_x64-setup.exe'
Start-Process $setup -ArgumentList '/S', '/D=D:\WestPlay' -Wait
```

安装包已包含 `netease-layer/python/` 和 `qq-music-layer/python/`（网易云和 QQ 音乐的中间层，缺了会「无法载入」）。

---

## 五、测试基线

```
cargo test --release -p westplay-host --lib     275 passed, 1 failed
cargo test --release -p westplay-plugin         50 passed
cd ui && npx vitest run                          680 passed
cd ui && npx tsc -b --noEmit                     0 errors
```

那 1 个失败是 `tests::a_game_run_normally_isnt_elevated`——断言「自己不是管理员」，但构建 shell 是管理员权限，**这是环境问题，不是回归**。

---

## 六、未完成 / 待办

| 事项 | 状态 |
|---|---|
| Safari 地址栏无候选框 | 暂停。`attach` 成功、拼音表加载成功，但按键到不了 `press` |
| DAF 右舵低音炮 | `in_truck_named_uk` 写好了，缺右舵判断来源，没接 |
| 哔哩哔哩客户端 | 小千的补丁基于另一个分支（有 `bilibili.rs`/`bilibili.js`），我们的仓库从来没有那两个文件，`git apply` 失败。要他的完整分支才行 |
| WebView2 158 崩溃 | 前端规避已进 `demo.ts`（不再是「文件一致但没执行」）。若仍崩，根因在 Chromium 内部；心跳会让页面 7 秒内自己回来 |

### ⚠ 不在仓库里的一处修复（重新打包会丢）

`app/qq-music-layer/` 整个目录在 `.gitignore` 里，所以中间层的改动**不进仓库**。
其中有一行是 VIP 歌能播的必要条件，重装/重打包后如果 VIP 又播不了，先查这里：

```python
# app/qq-music-layer/web/run_westplay.py，_westplay_song_url()
# 站点 cookie 里的名字是 uin，不是层自己那套 qq_musicid / qq_uin。
# 缺了它 uin 退到 "0"，站点把请求当成匿名 → result 104003（VIP 歌无权限）。
uin = _westplay_cookie(cookie, "uin", "qq_musicid", "qq_uin") or "0"
```

完整的 VIP 链路（三处缺一不可）：

1. 前端 `streamOf` 先走 `/westplay/song_url/{mid}`（`crates/host/src/qq_music.js`，**在仓库里**）；
2. 请求带 `X-Westplay-Site-Cookie`（同上，**在仓库里**）；
3. `run_westplay.py` 取 `uin` 时要认站点原名（**不在仓库里**，见上）。

### 也记一笔：账号页转圈

`ai` 的转圈条件是 `s === null`（登录态未知就转）。我们把启动时的 check 去掉了，
而宿主侧 `AccountAction::Check` 本来就是空实现（`weblogin.rs:208`），`signed_in`
永远是 `None` —— 三行会永远转圈，连「登录」按钮都点不到。

现在改成 `s === null && !!l`（只有正在登录才转），未登录就显示可点的按钮。
这一处在 `tools/scripts/accounts_services.py` 里，那个脚本也不进仓库。

---

## 七、关键文件索引

| 内容 | 路径 |
|---|---|
| 空间音频脚本 | `crates/host/src/cab_sound.js` |
| 扬声器表 | `crates/host/src/speakers.rs`（`DAF_2021` / `DAF_2021_XG` / `DAF_2021_XG_UK` / `in_truck_named`）|
| 相机与车内外判定 | `crates/host/src/camera.rs` |
| 大巴平板判定 | `crates/plugin/src/screens.rs` |
| WebView2 韧性 | `crates/host/src/webview.rs`（`Failure::Frame` / `frames_of` / `reload_frames`）|
| 登录态 | `crates/host/src/weblogin.rs`（`Logins::state()`）|
| 账号页改写 | `tools/scripts/accounts_services.py` |
| 3.0 主窗口改写 | `tools/scripts/rebuild_companion.py` / `rebuild_companion_css.py` |
| 3.0 原始资源 | `<上游 3.0 资源目录>\` |
| 打包配置 | `D:\WestPlay-dev\tools\scripts\bundle-240.json` |
| 3.0 交接材料 | 上游发布包里的说明（不在本仓库） |
