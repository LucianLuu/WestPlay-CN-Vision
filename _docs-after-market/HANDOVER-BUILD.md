# WestPlay 2.1.4 定制版 —— 编译／构建／装配／打包 交接文档

> **给新对话的接手者**：这份文档是**自足的**。照 §3 装环境、照 §4 构建、照 §5 装配、
> 照 §6 验证即可；想改代码前先读 §10，那里指向真正的不变量与逐条修复记录。
>
> 写于 2026-10-31 晚（最后一次构建／装配／打包之后）。机器：owner 的实机（Windows 11、无 git）。

---

## §0 三十秒了解现状

WestPlay 2.1.4 的定制版：把 Apple Music／Spotify／YouTube Music／YouTube 换成
Apple Music（保留）／QQ音乐／网易云／哔哩哔哩（+蜻蜓FM），汉化，并做过：
网页 App 的 **Ctrl+滚轮无级缩放**、**屏幕刷新率 60/30 Hz**、**座舱自带中文输入法**（含 B 站）、
**上电自动续播（除 B 站）**、**地图搜索改为最近优先** —— 全部**已编译、已装配、已打包**。

| 现产物 | 值 |
|---|---|
| `westplay.exe` | **24,561,152 B** |
| `westplay.dll`（游戏插件） | **608,768 B** |
| `ui/dist` | **72 个文件**（含 720 KB 中文词库 `chinese/pinyin.json`：7,735 字 / 29,867 词） |
| 安装包 `WestPlay_2.1.4_x64-setup.exe` | **10,277,793 B**，SHA256 `4B9C595E947A16903FF34B27D91BA12754F96D6293056D9E8910EE0D166654F7` |
| 完整源码 `WestPlay-2.1.4-src-full.zip` | `src/` **650** 个文件 + `_docs/` 5 个 + README（**这份交接文档就在 `_docs/` 里**），共 656 项 |
| 改动文件 `westplay-mods-src-214.zip` | **431** 项（`crates/`、`app/`、`tools/`、`ui/src/`、`_docs-after-market/`）（含 `_docs-after-market/HANDOVER-BUILD.md`），与安装包一起收在 `D:\West Update\`（工作区根目录也留一份） |

> **产物放在哪由 owner 定**：2026-10-31 晚与 11-01 上午 owner 都指定 **`D:\West Update\`**，
> 新对话做完一轮后仍**问一句 owner 要放哪**，或先看看 `D:\West Update\` 在不在（旧包在本轮被移到
> `D:\West Update\_previous-2026-10-31\`）。
> 两个 zip 的哈希**不在本文里**（文档就在 zip 里，自录哈希会自相矛盾）：要哈希就直接算文件。

源码树的**权威位置**是工作区：
`C:\Users\Administrator\Documents\deepseek-harness\default-workspace\WestPlay-2.1.4-src-full\src`（650 个文件）。

**文档**：改代码前必读 `FIXES.md`（55 组，症状→根因→改法，索引表在最前）与 `PLAN.md`（规格 + 验收 + §4 不变量）。
两份都在工作区根目录，也在源码树的 `_docs/` 里。

---

## §1 路径总表

| 用途 | 路径 |
|---|---|
| 构建树（源码） | `C:\Users\Administrator\Documents\deepseek-harness\default-workspace\WestPlay-2.1.4-src-full\src` |
| 构建产物目录（**必须短路径**） | `D:\wp-build\target`（release 在 `D:\wp-build\target\release`） |
| 构建日志 | `D:\wp-build\*.log` |
| **npm 转发脚本** | `D:\wp-build\bin\npm.cmd` |
| 词库下载缓存 | `D:\wp-build\data`（pinyin-data / rime-essay / OpenCC / phrase-pinyin-data） |
| 源码导出暂存 | `D:\wp-build\export-214`、改动文件暂存 `D:\wp-build\mods-214`、ZIP 脚本 `D:\wp-build\zip-export-31.py`（旧 `zip-export.py` 同理） |
| **装机目录** | `D:\WestPlay`（`westplay.exe` + `westplay.dll` + `ui/` + `uninstall.exe` + 许可文件） |
| **交付目录（安装包 + 两个 zip）** | **`D:\West Update\`**（owner 指定；旧包在 `D:\West Update\_previous-2026-10-31\`）。`D:\WestPlay-2.1.4-src-full.zip` 是同一个源码包的老惯例位置，重导出时顺手刷新，别当成两份不同的东西 |
| **游戏插件目录** | `E:\SteamLibrary\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\westplay.dll` |
| 运行日志 | `%USERPROFILE%\Documents\WestPlay\logs\app.log`（**每次启动清空**） |
| 模组（app 自己构建维护） | `%USERPROFILE%\Documents\WestPlay\westplay.scs` —— **不要手工替换** |
| 设置 | `%APPDATA%\app.westplay\settings.json` |
| **玩家数据（永远别删）** | `%LOCALAPPDATA%\app.westplay\`（`webview2-*` 各站点登录态、`maps/`、`customize/`） |
| VS Build Tools | `D:\VSBuildTools`（`VC\Auxiliary\Build\vcvars64.bat` 在） |
| NSIS（本机自带，备选） | `D:\nsis\nsis-3.11\makensis.exe` |
| Tauri 自己下的 NSIS | `%LOCALAPPDATA%\tauri\NSIS`（已存在；缺它会联网下载） |

---

## §2 这台机器的环境（**已经配好，除非重装系统**）

| 组件 | 状态 |
|---|---|
| rustc / cargo | **1.99.1**（`~\.cargo\bin`，`stable-x86_64-pc-windows-msvc`） |
| crates.io 镜像 | `~\.cargo\config.toml` → `sparse+https://rsproxy.cn/index/` + `git-fetch-with-cli = true` |
| node | **v24.21.0**（DSH 自带运行时，**不在 PATH**） |
| pnpm | **11.28.5**（同上） |
| npm | **没有**（靠 §2.1 的转发脚本） |
| MSVC | VS Build Tools 2022（`D:\VSBuildTools`） |
| WebView2 Runtime | 已装 |
| Python | DSH 自带的 3.14（生成词库用） |

### §2.1 这台机器**本该有而没有**的两样（重装后会再遇到）

1. **没有 npm** → `tauri build` 与 `ui` 的脚本会调 `npm run …`，所以要一个转发到 pnpm 的
   `npm.cmd`（内容如下，**注意别在注释里写 `%`**：批处理会把 `%n` 当变量吃掉）：

   ```bat
   @echo off
   rem WestPlay build machine: no npm here, pnpm does the job for npm run <script>.
   "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs" %*
   ```

   并把 **node 所在目录**加进 PATH（`D:\wp-build\bin` 与 `…\node\bin` 都要）——
   否则 pnpm 生成的 `.CMD` 包装器里 `node` 找不到，报 `'node' is not recognized`。

2. **MSVC 的 D8050（最坑的一条）**：`CARGO_TARGET_DIR` 落在很深的路径时（例如
   `…\default-workspace\WestPlay-2.1.4-src-full\src\target`），`cl.exe` 编 `minhook` 的 C 文件会报
   `error D8050: 无法执行 c1.dll / 未能将命令行放入调试记录中`（`cargo check` 也会踩）。
   **解法只有一个：把 target 放短路径** —— 本机固定在 `D:\wp-build\target`。
   包一层 `vcvars64.bat` **没用**（不是环境变量问题）。

---

## §3 从零到可编译（重装机器时照做；已配好可跳过）

```powershell
# 1) Rust（本机 static.rust-lang.org 可达；工具链走 rsproxy 镜像快得多）
New-Item -ItemType Directory -Force 'D:\rust-install' | Out-Null
curl.exe -s -L -o 'D:\rust-install\rustup-init.exe' https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
$env:RUSTUP_DIST_SERVER='https://rsproxy.cn'; $env:RUSTUP_UPDATE_ROOT='https://rsproxy.cn/rustup'
& 'D:\rust-install\rustup-init.exe' -y --profile minimal --default-toolchain stable-x86_64-pc-windows-msvc --no-modify-path
# ⚠️ PowerShell 5.1 会把 rustup 的 stderr 当错误终止脚本；若工具链没装完，补一句：
#    cmd /c "`"$env:USERPROFILE\.cargo\bin\rustup.exe`" toolchain install stable-x86_64-pc-windows-msvc --profile minimal"

# 2) crates.io 镜像
@'
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
'@ | Set-Content -Path "$env:USERPROFILE\.cargo\config.toml" -Encoding ASCII

# 3) npm 转发脚本（见 §2.1）
New-Item -ItemType Directory -Force 'D:\wp-build\bin' | Out-Null
#    把 §2.1 那段内容存成 D:\wp-build\bin\npm.cmd

# 4) 前端依赖（仓库根 + ui；**必须 hoisted**：这份源码树是按 npm 扁平 node_modules 写的，
#    pnpm 默认不提升，tsc 会找不到 @maplibre/maplibre-gl-style-spec）
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'
$src  = 'C:\Users\Administrator\Documents\deepseek-harness\default-workspace\WestPlay-2.1.4-src-full\src'
$env:npm_config_registry = 'https://registry.npmmirror.com'
Set-Location "$src\ui"; & $node $pnpm install --node-linker=hoisted   # 先 `pnpm import` 可以把 package-lock 转成 pnpm-lock（可选）
Set-Location $src;      & $node $pnpm install --ignore-scripts       # 根的 @tauri-apps/cli；postinstall 要 npm，跳过
```

> 每次构建前，把这两样放进环境（一条命令搞定，见 §4 的开头）：
> `PATH` 里加上 `D:\wp-build\bin`、`…\node\bin`、`…\.cargo\bin`；并 `$env:CARGO_TARGET_DIR='D:\wp-build\target'`。

---

## §4 日常构建（四步，缺一不可）

```powershell
# ── 0) 环境（每个新 shell 都要做一次）
$src  = 'C:\Users\Administrator\Documents\deepseek-harness\default-workspace\WestPlay-2.1.4-src-full\src'
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$env:PATH = "D:\wp-build\bin;C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:CARGO_TARGET_DIR = 'D:\wp-build\target'
$rel = 'D:\wp-build\target\release'
Set-Location $src

# ── 1) 界面（ui/dist；含 tsc -b 与 vite build）
& cmd /c "cd ui && npm run build:release"          # 走 §2.1 的 npm.cmd → pnpm

# ── 2) 游戏插件 dll（改了 crates/plugin 才需要）
& cmd /c "cargo build --release -p westplay-plugin"

# ── 3) 宿主 exe（改了 crates/host、crates/app、页面脚本都算）
& cmd /c "node node_modules\@tauri-apps\cli\tauri.js build --no-bundle"
#    它会先跑 beforeBuildCommand（又是 ui 构建），产物在 $rel\westplay.exe

# ── 4) 安装包（NSIS）
#    ⚠️ 安装包配置里的资源路径是 `../target/release/westplay.dll`（相对 app/ 解析），
#       所以**打之前**先把 dll 补一份到源码树里：
New-Item -ItemType Directory -Force "$src\target\release" | Out-Null
Copy-Item "$rel\westplay.dll" "$src\target\release\westplay.dll" -Force
& cmd /c "node node_modules\@tauri-apps\cli\tauri.js build --config app\tauri.installer.conf.json"
Copy-Item "$rel\bundle\nsis\WestPlay_2.1.4_x64-setup.exe" 'D:\WestPlay_2.1.4_x64-setup.exe' -Force
Remove-Item "$src\target" -Recurse -Force        # 临时的 dll 暂存，别留在树里
```

**四个必须记住的坑**

1. **`--no-bundle` 与安装包配置会互相覆盖 `westplay.exe`**：打安装包那一步会把合并后的 `bundle.*`
   配置内嵌进二进制，于是 `$rel\westplay.exe` 变成"安装包那一版"。**日常装配之后如果又打了安装包，
   想再拿 exe 要重新 `--no-bundle` 编一次**（两份功能相同，只是内嵌配置文本不同）。
2. **exe 只能由 `tauri build` 产出，不能拿 `cargo build --release` 的**（2026-11-01 下午踩过）：
   `ui/dist` 的资源是 `tauri build` 阶段嵌进 exe 的，`cargo build` 出来的 exe 只有代码、**没有界面资源**，
   装上后主窗口一片「`localhost` 拒绝连接」，日志里是 `app: window shown without its page ready`。
   两个 exe 大小差约 2.5 MB（缺资源那版更小）。辨别办法：在 exe 里搜 `chinese/pinyin.json` 这个字符串，
   能搜到才是带资源的那版。**所以第 3 步不能偷懒换成 `cargo build --workspace`**（第 2 步的插件 dll 照旧用 cargo）。
3. **exe 不是字节可复现的**（PE 头里的链接时间戳）：同源码两次构建 SHA256 不同、**大小一致**。
   所以校验用**大小 + 启动日志**，别用 exe 的哈希（`westplay.dll` 与 `ui/dist` 是可复现的，逐文件哈希有意义）。
4. **Tauri 需要 NSIS**：本机 `%LOCALAPPDATA%\tauri\NSIS` 已存在（离线可用）。若换机器且没有它，
   联网会自己下（GitHub 可达时成功）；实在不行用 `D:\nsis\nsis-3.11\makensis.exe` 自己打。

---

## §5 装配与自检

```powershell
# 装配（先确保 westplay.exe / 游戏都没在跑）
Copy-Item "$rel\westplay.exe" 'D:\WestPlay\westplay.exe' -Force
Copy-Item "$rel\westplay.dll" 'D:\WestPlay\westplay.dll' -Force
Copy-Item "$rel\westplay.dll" 'E:\SteamLibrary\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\westplay.dll' -Force
robocopy "$src\ui\dist" 'D:\WestPlay\ui' /MIR      # /MIR 必须：清掉旧的 hashed 文件名

# 装配后校验：ui 必须与 dist 逐文件一致（72 个文件）
$diff = 0
Get-ChildItem "$src\ui\dist" -Recurse -File | ForEach-Object {
  $rel2 = $_.FullName.Substring("$src\ui\dist".Length).TrimStart('\')
  $inst = Join-Path 'D:\WestPlay\ui' $rel2
  if (-not (Test-Path -LiteralPath $inst)) { "MISSING: $rel2"; $script:diff++ }
  elseif ((Get-FileHash -LiteralPath $inst -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash) { "DIFF: $rel2"; $script:diff++ }
}
"differences: $diff"      # 期望 0

# 启动自检（约 20 秒；日志每次启动会清空）
Start-Process 'D:\WestPlay\westplay.exe'
Start-Sleep -Seconds 20
Get-Content "$env:USERPROFILE\Documents\WestPlay\logs\app.log" | Select-Object -Last 12
Stop-Process -Name westplay -Force
```

日志里**应当**看到（零 `error`／`panic`）：

```
[startup] app: started → host: started → host: cabin browser (WebView2) ready
[startup] host: capturing (game not seen yet) → host: first frame captured
[startup] page: running (its scripts loaded) → page: power off → page: clock country …
```

`westplay.scs` 由 app 自己构建并维护（含 cab mark）：**改了 `crates/shared/screen_layouts.txt`
或模组相关代码**时，启动一次 app 会自动重建；**其它情况不要动它**（PLAN §6 / FIXES §22.13）。

---

## §6 验证（改完代码必须全绿）

```powershell
Set-Location "$src\ui"
& $node "$src\ui\node_modules\typescript\bin\tsc" -b            # 期望：0 错
& $node "$src\ui\node_modules\vitest\vitest.mjs" run            # 期望：75 文件 / 555 测试全过
& $node "$src\ui\node_modules\prettier\bin\prettier.cjs" --check <改过的文件>   # 期望：All matched files use Prettier code style

Set-Location $src
& cmd /c "cargo test -p westplay-host --lib"                    # 期望：224 通过 / 0 失败
& $node --check "$src\crates\host\src\webapp.js"                # 注入脚本的语法（改过就要跑）
```

当前基线（2026-11-02 深夜，§59–§61 之后）：**tsc 0 错；vitest 75 文件 / 557 测试；`cargo test -p westplay-setup --lib` 70 通过 / 0 失败 / 9 忽略；`cargo test -p westplay-host --lib` 224 通过 / 0 失败 / 26 忽略；`cargo test -p westplay-plugin --lib` 43 通过 / 0 失败 / 1 忽略；`cargo test -p westplay-shared --lib` 21 通过 / 0 失败**。
（`cargo test --workspace` 会连 `westplay-setup` 一起跑，它有个环境相关的 `names_a_folder_as_windows_does` 在本机失败：
拿 `%SystemRoot%` 的小写去磁盘上找回原名，本机是 `C:\WINDOWS` → `C:\Windows`。**与本项目改动无关**，跑宿主那个 `-p` 就行。）

---

## §7 重新导出两个 zip（改了代码/文档之后）

- **完整源码** `D:\West Update\WestPlay-2.1.4-src-full.zip`：`src/`（**不含** `target/ node_modules/ ui/dist/ .git/`）
  + `_docs/`（FIXES/PLAN/快报/时钟测试）+ `README-源码导出.txt`（当前 `src/` 650 文件，共 656 项）。
- **改动文件** `D:\West Update\westplay-mods-src-214.zip`（工作区根目录也留一份）：相对纯净 2.1.4 的改动文件
  （当前 **137 项**），含 `_docs-after-market/`（树内那份 FIXES/PLAN/HANDOVER 副本）。

**必须用 Python 打包**（`D:\wp-build\zip-export.py`，内容是 `zipfile.ZipFile(...).write()` 遍历后 `CreateFromDirectory` 那套）：
.NET Framework 的 `ZipFile.CreateFromDirectory`（也就是 PowerShell 5.1 的 `Compress-Archive`）
会把条目名写成**反斜杠**，在别的机器上解出来是一坨；Python 的 `zipfile` 一律正斜杠。

导出前记得：`robocopy src <暂存>\src /MIR /XD target node_modules dist .git`（`/MIR`：删掉已移除的文件），
并把最新的 FIXES/PLAN 覆盖进 `_docs/` 与 `src/_docs-after-market/`。

---

## §8 中文词库怎么重新生成

`ui/public/chinese/pinyin.json`（720 KB，415 音节 / 7,735 字 / 29,867 词）是**生成的**，别手写：

```powershell
Set-Location $src
& python tools\chinese\build_pinyin_table.py            # 首次会联网抓四个来源（jsDelivr 可达）
& python tools\chinese\build_pinyin_table.py --data D:\wp-build\data   # 用已经下好的（本机已缓存）
```

想调候选多少：脚本顶部的 `MOST_PER_SYLLABLE`（每音节上限）、`MOST_PER_WORD`（每个拼音键的词数）、
`LEAST_WORD_FREQ = {2:1500, 3:1200, 4:800}`（按词长的词频门槛；数值越小词越多、包越大）。
四个来源与许可见 `THIRD_PARTY_NOTICES.md` 的 "The Chinese input method's table"。

---

## §9 故障对照表

| 症状 | 原因 / 解法 |
|---|---|
| `error D8050: 无法执行 c1.dll` | `CARGO_TARGET_DIR` 路径太深 → 改用 `D:\wp-build\target`（§2.1） |
| `'node' is not recognized` | PATH 里缺 node 目录（§2.1） |
| `'npm' is not recognized` / `npm --prefix ui install` 失败 | 用 `D:\wp-build\bin\npm.cmd` 转发脚本；根目录 `pnpm install` 要 `--ignore-scripts` |
| `Cannot find module '@maplibre/maplibre-gl-style-spec'` | pnpm 没提升 → `pnpm install --node-linker=hoisted`（§3 第 4 步） |
| 安装包打不出来、提示找不到 `westplay.dll` | 打之前没把 dll 补到 `src\target\release\`（§4 第 4 步） |
| 打完安装包后 `target` 里的 exe 变了 | 安装包构建会重编 exe（§4 坑 1）→ 需要的话重新 `--no-bundle` |
| 主窗口显示「**`localhost` 拒绝连接**」/ 日志有 `app: window shown without its page ready` | 装的是 `cargo build` 出来的 exe（没有内嵌界面资源）→ 换成 `tauri build --no-bundle` 的产物；在 exe 里搜 `chinese/pinyin.json` 能搜到才算对（§4 坑 2） |
| 启动后屏幕还是老界面 | `ui` 没镜像（`robocopy /MIR`）或 app 没重启（§5） |
| 游戏里 WestPlay 没反应 | 看日志是 `game: connected` 还是 `the game's WestPlay plugin is another version`（插件 dll 要同步进游戏目录） |
| 装机后站点要重新登录 | `%LOCALAPPDATA%\app.westplay\webview2-*` 被删了 → **别删那里的东西**（§1） |

---

## §10 改代码之前必读

1. **`FIXES.md` 的索引表**（58 组）：每一组都是"症状 → 根因 → 改法"，尤其 **§28**（候选栏被洞的遮罩抹掉）
   与 **§27**（中文上屏走浏览器自己的输入管线）—— 这两条最容易在重构时被做回去。
2. **`PLAN.md` §4「关键不变量」**：
   - **id 不改**（`music/spotify/youtube/youtubeMusic` 是导航与设置的键，只换它们渲染什么）；
   - **洞 = 合成位置**：网页盖在座舱页之上；**任何要让玩家看见的座舱元素（键盘、候选栏、状态小标）
     都必须让洞收缩或避开** —— 注意键盘的绝对定位子元素**不在键盘的盒子里**，量键盘量不到它们；
   - **输入槽只有一个**（`typing.selection` 全局，网页自己有 `webapp_selected`，不能互相覆盖）；
   - **网页 App 的媒体状态靠轮询、必须容错**。
3. **别删探针**（`lyricProbe`/`domProbe`/`apiProbe`/`buttonProbe`/`pressProbe`/`textProbe`/`submitProbe`/
   `mediaProbe`/`biliProbe`/`stateProbe`，以及 `keyboard language …`、`Chinese input method: its table is here …`）：
   平时不刷屏，出问题时是唯一能定位的证据。
4. 中文相关：`ui/src/cabin/keyboard/pinyin.ts`（引擎，纯函数 + 14 个单测）、`store.ts`（缓冲/候选/上屏/
   给宿主的 `{"type":"ime"}` 标志）、`crates/host/src/webapp.js`（页面侧：字段识别、整段写、音量）、
   `crates/host/src/lib.rs`（`PageMessage::Ime`：中文组装时**不把按键直接透传进网页**）。

---

## §11 还没做 / 下一步的候选

- **中文输入**：只有全拼（无双拼/五笔/手写）、候选只到第一个音节、词库是简体且有限（生僻词选不到，
  但字母可原样提交）；组装不跨输入框保留（FIXES §25.5）。
- **中文词库只收常用字**（2026-11-01 owner 定的口径）：GB2312 基本集 ∪ 语料在用的标准字 = 7,735 字，
  每音节不设上限；**生僻字有意不收**（三级字/Ext-A/B/GBK 异体，如 赟 祎 龘），要加某个具体字就加一条
  白名单（FIXES §32.3）。
- **性能模式**（2026-11-01）：只放弃三样（3D 建筑、毛玻璃、动画），不做别的降级（比如不降分辨率、不跳帧）；
  玻璃的纯色底固定两套（深/浅各一套），不跟随壁纸取色（FIXES §31）。
- **车辆信息 app**（2026-11-01 下午，FIXES §34）：只有游戏的磨损/货损数字（`truck.wear.*`、`trailer.wear.*`、
  `trailer.cargo.damage`），不换算维修费、不显示油温油压；挂车身份只有品牌/型号/车牌；游戏没给的通道显示「—」。
- **停了，卡片还说在播**（2026-11-02 凌晨，FIXES §55）：`intent`（座舱自己按下的结果）从 §53 起没有过期，
  页面什么旁证都没有时就一直照着它说（截图：歌停了，卡片还是「暂停」图标）。现在 `intent` 只活 6 秒
  （`INTENT_MS`），页面有自己的 `audio` 时以元素为准，四个来源都读不到时写进日志（`stateProbe`）。
- **切歌用页面自己的动作**（2026-11-02 深夜，FIXES §58）：网易云新版播放器的上一首/下一首是 SVG 图标，没名字
  可找，但它自己注册了媒体键动作。`webapp.js` 在页面脚本前包一层 `MediaSession.prototype.setActionHandler`，把
  页面注册的 handler 记下来，网易云切歌直接调它；其它站点仍按自己的按钮（QQ 不动），最后才是 `Ctrl+←/→`。
- **真因是「歌」挑错了**（2026-11-02 深夜，FIXES §57）：QQ 播放器页自己的**空媒体元素**（无 `src`、`readyState`
  0）被 `play()` 过就永不 `paused`，被 `player()` 当成歌 → `playing` 永远 true（暂停也报在播）。现在能当歌的元素
  必须先有东西可播（`sounding`）；网易云新版播放器的控件是图标字体文字（`.cmd-icon` 里 "prev"/"next"），
  `button()` 多一轮按「它自己说的话」找最小元素，再不行发播放器自己的 `Ctrl+←/→`。
- **五处一起修**（2026-11-02 深夜，FIXES §56）：
  - 卡片的「反的」根因在**界面**：`shownPlaying`（座舱自己按下的结果）没有期限，页面不报就永远留着。现在只活
    2.5 秒（`SHOWN_FOR`）；`intent`（页面侧）仍是 6 秒；
  - 网易云新版的播放条不写歌名 → `netease()` 读 `document.title`（「歌名 - 歌手 - 网易云音乐」）；
  - B 站滚轮：`pointer.rs` 除 `send_mouse` 外再发 `webAppWheel`，页面 90 毫秒后没动才自己滚（`turnWithWheel`）；
  - 游戏开着时也能换插件：被占用就改名叫 `westplay.dll.<时间戳>.old` 挪开（Windows 允许改名已加载的 DLL），
    游戏下次启动生效；
  - 网易云新版登录：`MUSIC_U` 是 HttpOnly，cookie 读不到时改看头部条（没有「登录」二字 + 有头像）。
- **QQ 音乐首页：卡片不动、上电还是不续播**（2026-11-02 凌晨，FIXES §54）：首页的播放条是
  `<a class="btn_bottom_player">`——「打开播放器」而不是播放/暂停，页面没有进度、没有元素、什么都不报，
  于是座舱的 `playing` 一直是断电前的 true，上电按「它还在播」判成不发。现在 `pauseWithPower.ts` 上电
  **不问页面**（WestPlay 停掉的由 WestPlay 放回去，断电时自己起的先被 `dark` 按停）；`webapp.js` 另读
  `navigator.mediaSession.playbackState`，控件没名字时按 class 认（`CLASS_NAMED`），首页播放条的结构打进
  日志（`domProbe: qq home …`，三次）。
- **上电不续播（QQ 音乐）**（2026-11-02 凌晨，FIXES §53）：`webapp.js` 的 `moved` 改看真正的时钟跳动
  （`drawnClock.moved`/`elementClock.moved`），画过进度就以时钟为准；`pauseWithPower.ts` 发完 toggle 1.6 秒再核
  一次、没回来再发一次。伴侣页新增 `Status.plugin_outdated` → 「游戏里的 WestPlay 插件是旧版本」红字（36 种语言，
  词条在 `ui/src/companion/pages/words/`，别名语言沿用英文）。
- **另一台设备检测不到游戏**（2026-11-02 凌晨，FIXES §52）：游戏里是旧版 `westplay.dll`（插件日志 24 个通道），
  桥接按版本命名（`v26`），两边碰不上。`crates/host/src/lib.rs` 的 `keep_plugins_up_to_date()` 在启动时、游戏关闭时、
  以及没看到游戏时每 30 秒，把 exe 旁的 dll 与游戏里的比对并装进去（装不上就说明原因，同一句话只说一次）；插件
  加载行加了 `bridge v26`。**本轮没有部署到 `D:\WestPlay` 或游戏目录**（owner 的游戏和 WestPlay 开着）。
- **QQ 音乐的播放/暂停反了**（2026-11-02 凌晨，FIXES §51）：`crates/host/src/webapp.js` 的 `playingOwn()` 先读
  `intent`——收到 `playPause` 时记下「按成了什么」，站点按钮改口（或 15 秒）前以它为准；按下 350 ms 的那次上报
  因此立刻是对的（图标、断电暂停、上电续播）。
- **播放/暂停的图标与开关**（2026-11-02 凌晨，FIXES §50）：`webapp.js` 的 playPause 判据改成页面自己的媒体元素
  （`paused` 瞬间变），不再因为按钮名字慢而补点第二次；`NOR` 加 `全部`，`insideNo()` 让「播放全部」里的图标不被
  当成播放/暂停；`webapp.ts` 新增 `shownPlaying`（按下的瞬间就显示，页面下一次上报再交回），
  `dashboard/useNowPlaying.ts` 与 `apps/web/LyricsPage.tsx` 用它；`shared/host.ts` + `host/src/lib.rs` 新增
  `{type:"log"}`（`logToHost` → `cabin: …` 进 app.log），`apps/web/pauseWithPower.ts` 与 `apps/musicWithGame.ts`
  的断电/上电暂停与续播各写一行。
- **网页应用的快捷键**（2026-11-01 深夜十二，FIXES §49）：`crates/host/src/webapp.js` 记下页面自己造、
  不放回文档的媒体元素（`window.Audio` 子类 + `createElement` 记录，最多 32 个）并让 `elements()` 包含它们，
  音量落到空处时写 `volumeProbe`；`crates/plugin/src/keybinds.rs` 对「按下却没计入」的热键写一行原因
  （屏幕没显示 / WestPlay 不在屏上 / 正在输入，5 秒最多一行）；`ui/src/cabin/apps/web/player.ts` 的
  `subscribe` 改成看「有没有东西可放」，暂停中的站点也能被热键叫回来（测试同改）。
- **拖动条真装上**（2026-11-01 深夜十一，FIXES §48）：`crates/host/src/webapp.js` 的样式注入原来在
  document-start 就 `document.documentElement.append`，那时还没有 `<html>`，抛 TypeError 并把整个脚本打断
  （§46 起就失效）；改成 `showBars()` + `DOMContentLoaded`。真注入方式实测：`#westplay-bars` 在、
  滚动条 16px、放大到 640×330 时根元素 1100/640、`scrollLeft` 可移到 200，截图上右条与底条都在。
- **红绿灯读秒 + Present 钩子**（2026-11-01 深夜十，FIXES §47）：`crates/host/src/traffic_lights.rs`（新，
  只读游戏内存）、`lib.rs` 的路线/位置/消息/开关四处接入、`crates/plugin/src/d3d.rs`（游戏自己的 dxgi + 模块
  诊断 + 帧计数）、`plugin/src/lib.rs`（20 s 无帧看门狗 `watch_for_frames()`，保留我们的 `mirror`）、`crates/plugin/Cargo.toml`
  （ToolHelp）；页面侧 `shared/host.ts`（`TrafficLight` 类型与两条消息）、`state/store.ts`（设置项 + LiveState
  + 分发）、`state/strings.ts`（中/英/土）、`apps/settings/SettingsApp.tsx`（外观里的开关）、`maps/liveMap.ts`
  （`syncTrafficLight`、`routePointOnSpans`）、`maps/maps.css`（三灯与读秒样式）。另外 `webapp.js` 给站点页面加
  `body { min-width: min-content }`，内容比房间宽时右下拖动条把裁掉的部分拖进来。时间（DST）修复按 owner
  要求**没做**。
- **页面拖动条 + 右 Ctrl**（2026-11-01 深夜九，FIXES §46）：`crates/host/src/webapp.js` 注入滚动条样式
  （`html/body` 改 `overflow: auto`，16px 圆角滑块，右与下两条）；`pointer.rs` 的 `zoom_held()` 读
  `VK_RCONTROL`（页面放大只认右 Ctrl，左 Ctrl + 滚轮留给换挡），`cursor.rs`/`lib.rs`/`webapp.rs` 的注释同步。
  红绿灯相位那条还没做：SDK 与 `eurotrucks2.exe` 里都没有 `traffic_light.state`/`state_time_remaining`，
  要 owner 给来源（见 FIXES §46.3）。
- **倒车压音量**（2026-11-01 深夜八，FIXES §45）：`ui/src/cabin/reverse/quiet.ts` 的
  `quietWhileReversing(CAB_PLAYERS)` 订阅挡位（`reversing`：`displayedGear < 0`），进 R 用 `fade`+`sendVolume`
  把五个播放器压到 `REVERSING_VOLUME = 0.15`，出 R 回到它们自己的音量；`CabinApp.tsx` 的播放器列表抽成
  `CAB_PLAYERS`（快捷键与它共用）。Rust 没动。
- **地图 2D/3D**（2026-11-01 深夜七，FIXES §44）：`liveMap.ts` 的 `flat`／`useMapFlat`／`flatLiveMap`，
  `camera.ts` 的 `PITCH` 与 `followPitch`，`MapControls.tsx` 的 `MapMode`（地图 App 右上角两段胶囊），
  `maps.css` 的 `.map-mode`（有引导路线时让开右上角的搜索键）；Rust 没动。
- **网易云音乐新播放器**（2026-11-01 深夜七，FIXES §44）：`webapp.rs` 的 `Site::Netease::home()` 改成
  `https://music.163.com/st/webplayer`；`webapp.js` 认新播放条的 `.g-btmbar`，补 `netease()`（播放条上的
  歌名/歌手/封面，Media Session 沉默时用）与 `?id=` 的歌曲地址；按钮、进度、歌词、音量、键盘、登录都没改。
- **显示优先级**（2026-11-01 深夜六，FIXES §43）：卡车屏幕页新增开关（`ScreenPage.tsx` 的 `DisplayFirst`），
  设置 `screen.tabletFirst`（默认 false＝车机优先），桥 `HostBlock.tablet_first`，`BRIDGE_VERSION` **26**；
  插件 `screens.rs` 的 `shows_here` 多了 `TABLET_SEEN` 与优先级：平板优先时平板一显示过 WestPlay，车机就交还游戏自己的画面，
  没装平板自动退回车机。**dll 变了：游戏里那份要换，换完重启游戏一次。**
- **快捷键控制网页应用**（2026-11-01 深夜五，FIXES §42）：`apps/web/player.ts` 把网页应用做成第五个 `MusicPlayer`
  （`playingHere` 看 `useWebApp.media.playing`，播放/暂停发 `Command::PlayPause`，音量发 `Command::SetVolume`），
  `CabinApp.followKeybinds()` 里排在第一位。四个站：哔哩哔哩、网易云音乐、QQ 音乐、蜻蜓 FM。Rust 没动。
- **明暗壁纸**（2026-11-01 深夜四，FIXES §41）：设置 › 壁纸多了“明暗壁纸”开关，打开后给浅色和深色各挑一张
  （`wallpapersByAppearance`／`wallpaperLight`／`wallpaperDark`，`state/hooks.ts` 按外观选图）。它和**壁纸轮换互斥**，
  开一个顶掉另一个。**轮换池只剩玩家自己的壁纸**：WestPlay 自带的 Silk 与 Plain 不再参与。Rust 没动。
- **倒车画面是第一版**（2026-11-01 深夜三，FIXES §40）：owner 说“退回第一版”，确认指第一版倒车影像，
  就回到 §35 的手绘版本（车尾透视路面 + 红黄绿动态辅助线；有挂车则是车顶俯视 + 轨迹带；底部黄字）。
  §39 的地图俯视与 `topDownLiveMap` 已删除。相机自动切换（§36/§38）仍默认关，插件与桥接未动。
- **倒车屏幕 = 地图正上方俯视**（2026-11-01 更晚，FIXES §39，已在 §40 撤回）：挂 R 时倒车页把**实时地图**切到正上方
  （`pitch 0`、正北朝上、卡车居中、跟车；`maps/liveMap.ts` 的 `topDownLiveMap`），退出 R 自动还原成跟车视角。
  这是**游戏自己的道路/建筑数据**画的，不是游戏 3D 画面（那三条约束见 FIXES 39.2）。透视路面、倒车辅助线已删除。
  相机自动切换（§36/§38）恢复**默认关**（切了相机屏就不画）。
- **挂 R 整屏切到游戏自己的视角**（2026-11-01 深夜，FIXES §38）：相机键一次按下同时走三条路（只带扫描码
  的 `SendInput`、虚拟键+扫描码的 `SendInput`、给游戏窗口的 `WM_KEYDOWN`/`WM_KEYUP`）；按下后看相机真动没动，
  700 ms 没动就重按，最多 3 次，三次都没动写清楚并放弃（`reversing.json` 的 `enabled` 现在**默认开**）。
  默认相机 3（正俯视），空车 2；想换视角改 `reversing.json` 的 `reversing_camera`（4~8 逐个试），5 秒内生效。
  **§37 的“偷镜子”实测抓到的是法线缓冲**（`logs/mirror/left.bmp`），所以那条路不再写屏，只保留一次勘察 dump。
- **车机显示真实画面**（2026-11-01 晚，FIXES §37）：挂 R 时插件把游戏自己渲染的**左右后视镜**读回来
  （RT+SRV、R8G8B8A8、尺寸是车机 1280×720 的 1/2/3/4、同尺寸恰好两个 → 左右镜；排除车机自己的纹理），
  每 80 ms 一次，左右并排写进车机纹理，替换页面帧；相机留在驾驶室（屏才被画），退出 R 回到页面。
  第一次抓到会 dump `logs/mirror/{left,right,sheet}.bmp`。**谁左谁右没验证**（反了就在 `mirror.rs` 的
  `pair` 里交换）；**玩家关掉后视镜或改了镜面尺寸** → 回落 §35 那套自己画的；车机里没有黄字/辅助线；
  挂 R 时每 80 ms 一次读回会让渲染线程有小停顿。**切相机现在默认关**（`reversing.json` 的 `enabled`）：
  切了相机屏就不画了。按键已补扫描码（DirectInput 只认扫描码，§37.2）。
- **倒车影像**（2026-11-01 傍晚，FIXES §35 + §36）：**挂 R 会真切游戏自己的相机**（**默认关**）——挂着挂车切顶部视角、
  没挂车切车外视角（车尾后面），退出 R 回驾驶室。键位读玩家 profile 的 `controls.sii`（`mix cam1`…`mix cam8`），
  用 `SendInput` 只送前台的游戏窗口；挡位稳定 400 ms 才切，两次按键隔 900 ms，暂停/打字/已在车外都不动；
  `%USERPROFILE%\Documents\WestPlay\reversing.json` 可改相机号（`reversing_camera`/`solo_camera`/`cab_camera`）
  或整个关掉（`enabled: false`）。切出去以后驾驶室不在画面里，**那块屏幕不画了，WestPlay 界面连同黄字一起消失**
  （§35.1），所以 §35 那套自己画的监视器留着当兜底：从按 R 到切视角成功之间的几百毫秒、以及按键没送进游戏时。
  **相机号 1/2/3 = 驾驶室/车外/顶部是 ETS2 的默认**，号不对就改 JSON（或告诉我改默认值）。
  **倒车雷达不做**：SDK 不给“后方障碍物距离”（§36.1）。
  **桥接版本 25**：插件与宿主必须成对更新，否则 app 停在「等待游戏数据…」。
  **桥接版本 25**：插件与宿主必须成对更新，否则 app 停在「等待游戏数据…」。
- **Bilibili**：不自动续播（有意）、无座舱音量条（有意）；歌词页对它没有入口（§20.8）。
- **视频卡片**（原生 YouTube）没有音量条。
- 伙伴程序把「不在车内」四种情况分开（尤其"这辆车没装 WestPlay 部件"）：FIXES §22.6。
- 三站点「已登录」是启发式判断（站点改版要跟着改）；新手引导三步只有中/繁/英有专门文案。

---

## §12 一键复制：完整一轮（从改完代码到打包）

```powershell
$src  = 'C:\Users\Administrator\Documents\deepseek-harness\default-workspace\WestPlay-2.1.4-src-full\src'
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$env:PATH = "D:\wp-build\bin;C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:CARGO_TARGET_DIR = 'D:\wp-build\target'
$rel = 'D:\wp-build\target\release'

# 验证
Set-Location "$src\ui"; & $node "$src\ui\node_modules\typescript\bin\tsc" -b
& $node "$src\ui\node_modules\vitest\vitest.mjs" run
Set-Location $src;      & cmd /c "cargo test -p westplay-host --lib"
& $node --check "$src\crates\host\src\webapp.js"

# 构建
& cmd /c "node node_modules\@tauri-apps\cli\tauri.js build --no-bundle"      # 含 ui 构建
New-Item -ItemType Directory -Force "$src\target\release" | Out-Null
Copy-Item "$rel\westplay.dll" "$src\target\release\westplay.dll" -Force
& cmd /c "node node_modules\@tauri-apps\cli\tauri.js build --config app\tauri.installer.conf.json"
Remove-Item "$src\target" -Recurse -Force

# 装配 + 自检
Copy-Item "$rel\westplay.exe" 'D:\WestPlay\westplay.exe' -Force
Copy-Item "$rel\westplay.dll" 'D:\WestPlay\westplay.dll' -Force
Copy-Item "$rel\westplay.dll" 'E:\SteamLibrary\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\westplay.dll' -Force
robocopy "$src\ui\dist" 'D:\WestPlay\ui' /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
Copy-Item "$rel\bundle\nsis\WestPlay_2.1.4_x64-setup.exe" 'D:\West Update\WestPlay_2.1.4_x64-setup.exe' -Force
Start-Process 'D:\WestPlay\westplay.exe'; Start-Sleep -Seconds 20
Get-Content "$env:USERPROFILE\Documents\WestPlay\logs\app.log" | Select-Object -Last 10
Stop-Process -Name westplay -Force
(Get-Item 'D:\West Update\WestPlay_2.1.4_x64-setup.exe').Length; (Get-FileHash 'D:\West Update\WestPlay_2.1.4_x64-setup.exe' -Algorithm SHA256).Hash

# 重新导出两个 zip（§7：必须 Python；先把最新 FIXES/PLAN/HANDOVER 覆盖进 _docs/ 与 src\_docs-after-market/，
# 再 robocopy src → export-214\src /MIR /XD target node_modules dist .git，并把本轮改过的文件更新进 mods-214\）
& 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe' 'D:\wp-build\zip-export-31.py'
```