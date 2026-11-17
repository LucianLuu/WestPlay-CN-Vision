# WestPlay 改造 —— 交接计划 / 改动清单（v2，终态）

> 一句话：把 WestPlay 的 **Apple Music / Spotify / YouTube Music / YouTube** 换成
> **Apple Music（保留在 music 位）/ QQ 音乐 / 网易云音乐 / 哔哩哔哩**，界面汉化，并接入主页媒体控件与座舱屏幕键盘。
>
> 本文档是**规格 + 移植顺序**；每个坑的症状与根因在 `FIXES.md`。
> 上游出新版时，按 §5 的顺序把改动搬过去。

---

## §0 当前状态

| 项 | 值 |
|---|---|
| 基线 | WestPlay **2.1.4**（GPL-3.0，`https://github.com/enes-less/WestPlay`）；历史基线 2.1.3、2.1.2、2.0.3 |
| 状态 | **2.1.4 已合并、编译、单测通过、已装机**（2026-10-28）；**2026-10-31** 查清并定案“雷诺 T 2024 的仪表屏”：2024 款导航页原生显示、不用部件，老款要装 WestPlay tablet（FIXES §22）；**2026-10-30 晚又完成**：三站点登录接入主程序、网页 App 整页滚动歌词（同步/切歌/音量修复）、两条音量条、首启遮罩修复、壁纸轮换合入 —— 均由 owner 实机验证；**2026-10-31 下午再完成**：网页 App 的 **Ctrl+滚轮缩放**、外观设置里的**屏幕刷新率（60 Hz / 30 Hz）**，重编译、重装配、重打安装包（FIXES §24）；**2026-10-31 晚再完成**：**插件自带的输入法支持中文**（座舱里的拼音输入法：拼音栏 + 候选 + 数字/鼠标选字，座舱与网页 App 的输入框都能打，FIXES §25）；**2026-11-01 上午再完成**：**性能模式**（阉割导航的 3D 建筑、毛玻璃——换成适配明暗的纯色透明底——与动画），并把**屏幕刷新率与它合并成设置里的「显示与性能」**（放在外观、壁纸下面；三语，刷新率的描述「修改屏幕显示的刷新率」、性能模式的描述「阉割部分效果以换取性能」），；**2026-11-01 中午再完成**：**中文字库扩容**——去掉每音节 24 个候选的闸、常用字全给（7,735 字）、词条 29,867（FIXES §32）；**2026-11-01 下午再完成**：**「车辆信息」app**——左栏车名、右栏车损，挂上挂车/接上货再多挂车与货物两块，数字全部来自游戏遥测（插件新读 9 条 SDK 通道，FIXES §34）；**2026-11-01 傍晚再完成**：**倒车影像**——挂 R 档时屏幕切成监视器，没挂车显示车尾视角、挂了挂车显示车顶视角，底下小黄字「倒车时请注意后方安全」，辅助线随方向盘摆动（FIXES §35）；**2026-11-01 傍晚再完成**：**挂 R 档真切游戏自己的相机**——挂着挂车切成顶部视角、没挂车切成车外视角（车尾后面），退出 R 回驾驶室；读玩家 `controls.sii` 里的相机键，用 `SendInput` 送进游戏（只送前台的游戏窗口），挡位防抖 400 ms、冷却 900 ms，暂停/打字/已在车外都不动，`reversing.json` 可调；**倒车雷达做不了**（SDK 不给障碍物距离，FIXES §36）；**2026-11-01 晚再完成**：**车机显示真实的游戏画面**——挂 R 时把游戏自己渲染的左右后视镜读回来、并排写进车机纹理（真像素，相机留在驾驶室所以屏还被画），退出 R 回到页面；切相机改为默认关；按键补扫描码（FIXES §37） |
| 构建产物 | `westplay.exe`（host）+ `westplay.dll`（插件）+ `ui/`（座舱界面静态资源） |
| 构建环境（2026-10-31 起用这一套） | 构建树改成工作区 `…\default-workspace\WestPlay-2.1.4-src-full\src`（旧 `D:\wpq13\src`/`D:\wp14\src` 已不在）；本机**原本没有 Rust 也没有 npm**：Rust 用 rsproxy 镜像装，`npm` 用 `D:\wp-build\bin\npm.cmd` 转发到 DSH 自带的 pnpm；**`CARGO_TARGET_DIR` 必须用短路径** `D:\wp-build\target`，否则 MSVC 编 minhook 时报 D8050（FIXES §24.6） |
| 现装置 | `D:\WestPlay`（2.1.4 + FIXES §24–§55；exe **24,561,152 B** / 插件 dll **608,768 B**，ui 72 个文件含中文词库 720 KB）；游戏插件目录 `E:\SteamLibrary\…\bin\win_x64\plugins\westplay.dll` 同步更新 |
| 参考实现 | `westplay-mods-src-214.zip`（相对纯净 2.1.4 的**改动文件**，**431 项**：`crates/`、`app/`、`tools/`、`ui/src/`、`_docs-after-market/`）+ `WestPlay-2.1.4-src-full.zip`（**完整源码树** **656** 文件 + `_docs/` + README，共 662 项）。两个包都在 **`D:\West Update\`**（旧的 `-213`/`-212` 已清理） |
| 升级说明 | `FIXES.md` §12（2.1.2 → 2.1.3：9 个冲突文件）+ §14（2.1.3 → 2.1.4：70 改 / 66 我们的 / 7 两边都改 / 1 个真冲突） |
| 未做 | 电话 / 消息（上游本就是下个版本才有，`apps.ts` 的 `NEXT_RELEASE` 已排除）；播客位已被蜻蜓FM 占用；视频卡片（YouTube）没有音量条；QQ音乐/网易云的「已登录」是启发式判断；B站/蜻蜓不给歌词入口 |

**用户诉求（原文）**：
「把里面的 AppleMusic 改成 QQ音乐，Spotify 改成网易云音乐，Youtube 改成哔哩哔哩，别动其他功能」
后追加：保留 AppleMusic 换掉 YouTubeMusic、汉化、调整顺序、主页媒体控件、屏幕键盘。


## §0.1 2026-10-30 晚的交付状态（owner 已实机验证）

| 做了什么 | 关键文件 | 备注 |
|---|---|---|
| 壁纸轮换上电即换 + 设置开关 | `cabin/state/wallpaperRotation.ts`（新）、`SettingsApp.tsx`、`store.ts`、`CabinApp.tsx` | Lite 补丁的原生实现，不注入 |
| 限速牌/时速字号跟文本大小 | `cabin/dashboard/map.css` | 同上 |
| 网页 App 首启不再露游戏导航 | `webapp.rs`（`State::shown`）+ `Shell.tsx` + `webapp.ts`/`webapp.css` | 有 `shown` 才挖洞；遮罩在窗口内部 |
| 三站点登录接进主程序 + 新手引导 | `weblogin.rs`（新）、`signin.rs`、`lib.rs`、`app/src/main.rs`、`companion/accounts.ts`、`pages/Accounts.tsx`、`onboarding/Onboarding.tsx`、`words` | 四行：B站/网易云/QQ音乐/Apple Music；**Apple Music 原版未动** |
| 网页 App 整页滚动歌词 | `webapp.js`、`webapp.rs`、`lyrics.rs`、`webapp.ts`、`LyricsPage.tsx`、`webapp.css` | 封面 + 上一曲/播放/下一曲 + 音量条（带小喇叭）；离开收起、切歌不消失 |
| 歌词同步修复 | `webapp.js`（时钟选择、元素挑选、`STREAM_LEAD = 0.5`） | 三个毛病：越来越偏 / 慢半拍 / 切歌进度不重置 |
| 音量 | `webapp.js`（元素音量、看门狗、Web Audio 增益）、`webapp.rs`（`Volume`）、`webapp.ts`、`widgets.tsx` | 歌词页 + 首页卡片各一条；按站点记住；QQ音乐不再一开就最大声 |
| 日志降噪 | `lib.rs`、`webapp.js` | 一首歌一行（以前每换一句歌词一行）；排查用的探针已删 |

**还没做 / 留给下一步**：伙伴程序把「不在车内」四种情况分开（尤其“这辆车没装 WestPlay 部件”，见 FIXES §22.6）；视频卡片（YouTube）的音量条；QQ音乐那种「跨域 frame 里的声音」目前只覆盖了
Web Audio 与顶层元素两条路（frame 广播已留好，但没实测到需要它的站点）；三站点登录态的启发式判断
（站点改版要跟着改）；新手引导的三步只有中/繁/英有专门文案，其它语言落到英文兜底。

## §0.3 2026-10-31 下午的交付（本轮）

| 做了什么 | 关键文件 | 备注 |
|---|---|---|
| 网页 App 的 **Ctrl+滚轮无级缩放** | `crates/host/src/pointer.rs`（`ctrl_held`/`over_inside`/`Mouse::zoom`）、`webapp.rs`（`fit` + `wanted_player_zoom`/`player_zoom` + `zoom_by`/`tick`）、`lib.rs`、`cursor.rs` | 插件与共享内存布局**没动**（Ctrl 由宿主问 Windows）；粒度跟滚轮计数走、显示上按每轮时间平滑收敛（无级），自动适配让位给玩家的放大（FIXES §24.1） |
| **屏幕刷新率 60/30 Hz** | `crates/host/src/settings.rs`、`capture.rs`（`MOST_FPS`/`interval_for`/`set_fps`）、`lib.rs`、`ui/…/SettingsApp.tsx`（外观页）、`state/refreshRate.ts`（新）、`store.ts`、`maps/frameCap.ts` | 原来 `MAX_FPS` 是编译期常量；现在随 `settings.json` 保存、页面与伙伴程序都认（FIXES §24.2） |
| 汉化 | `state/strings.ts` | 新增刷新率四个词条三语；壁纸轮换的说明按 owner 指定改成「启用后，每次重新启动卡车时随机轮换一张壁纸」（FIXES §24.7），漏翻/漏键 `tsc` 报错 |
| **插件自带输入法支持中文** | `ui/src/cabin/keyboard/pinyin.ts`（新）、`store.ts`、`Keyboard.tsx`、`keyboard.css`、`state/strings.ts`、`shared/host.ts`、`crates/host/src/lib.rs`（`PageMessage::Ime`）、`tools/chinese/build_pinyin_table.py`（新）、`ui/public/chinese/pinyin.json`（生成物）、`THIRD_PARTY_NOTICES.md` | 拼音栏 + 候选（空格/数字 1–9/鼠标选字）；座舱与网页 App 的输入框都能打；网页输入框时宿主不再把字母直接透传进页面（FIXES §25） |
| 候选翻页 + B 站输入适配 | `keyboard/pinyin.ts`（`candidatesFor` 返回全部、`CANDIDATES_PER_PAGE = 8`）、`store.ts`（`page`/`turnPage`）、`Keyboard.tsx`（右端两个箭头）、`keyboard/glyphs.tsx`（`PageGlyph`）、`keyboard.css`、`crates/host/src/webapp.js`（`focused()`/`field()`/`writeText()`/`shadowFields()`）、`state/strings.ts` | 一页八个、两端绕回；B 站（shadow root 里的输入框、contenteditable）也能收中文（FIXES §26.1/§26.2；每页 8 个见 §33） |
| B 站不显示首页音量条 | `apps/web/webapp.ts`（`cabinVolumeFor`）、`dashboard/widgets.tsx` | B 站播放器自己有音量条，卡片那条会覆盖它（FIXES §26.3） |
| 输入法上屏走浏览器 | `crates/host/src/webview.rs`（`devtools()`：`CallDevToolsProtocolMethod`）、`crates/host/src/webapp.rs`（`Command::InsertText`）、`crates/host/src/lib.rs`（`Ime` 日志）、`shared/host.ts`、`keyboard/store.ts`（`Typing.insert?`）、`apps/web/webapp.ts`（`webAppField.insert`） | 选中的字用 `Input.insertText` 上屏（浏览器自己的输入管线）：站点自家组件包着的字段也收得下（FIXES §27.2） |
| B 站音量放手 + 拼音栏右端 | `crates/host/src/webapp.js`（`ownVolume`）、`keyboard/Keyboard.tsx`（右端只留两个翻页键） | B 站页面侧不再写元素/插增益/跑看门狗；拼音栏右端是 `◀ ▶`（FIXES §27.4；收起键 §27.5 加过、§33 又按 owner 要求移除） |
| 重编译 / 重装配 / 重打包 | — | exe 24,375,808 B、dll 552,448 B、ui 70 文件（含 614 KB 中文词库）、安装包 10,180,715 B（SHA256 `B0603188…`） |
| 候选框在网页 App 里被遮罩抹掉（真凶） | `apps/web/webapp.ts`（`floatingTop`）、`apps/web/WebAppScreen.tsx`（`place()`） | 洞的收缩量现在算**键盘 + 候选栏 + 状态小标**里最高的那个（FIXES §28） |
| 上电自动续播（除 B 站） | `apps/youtube/withGame.ts`（`poweredOn`）、`apps/musicWithGame.ts`、`apps/web/pauseWithPower.ts`（`playsOnWithPower`） | 断电暂停照旧；来电时 Apple Music/QQ音乐/网易云/蜻蜓 FM 自己接着播，**B 站不续播**（FIXES §29） |
| 地图搜索的排序 | `ui/src/cabin/maps/places.ts`（`searchPlaces`） | 城市名第一（无论多远），**其余最近优先**；匹配分组只在距离相同时做次序（FIXES §30） |
| 候选翻页 / B 站上屏与音量 | `keyboard/pinyin.ts`+`store.ts`+`Keyboard.tsx`、`webview.rs`、`webapp.rs`、`webapp.js`、`apps/web/webapp.ts` | 见 FIXES §26、§27；B 站的中文上屏改走 `Input.insertText`（浏览器自己的输入管线） |

**还没做**：网页缩放不跨站点记忆（见 §8）；中文只有全拼、候选只到第一个音节（FIXES §25.5）；两功能与中文输入都还没有 owner 的实机确认。

## §0.2 2026-10-30 夜清理了什么

删掉（2.1.3 / 2.1.2 及更早的产物与备份）：

| 位置 | 内容 |
|---|---|
| `D:\` | `WestPlay_2.1.2_x64-setup.exe`、`WestPlay_2.1.3_x64-setup.exe`、`WestPlay-更新说明-2.1.3.md`、`WestPlay-小更新-2.1.3.md`、`WestPlay-backup-20261026*`（4 个目录 + 2 个 zip）、`WestPlay-backup-20261027-*`、`WestPlay-backup-20261028-212`/`-213`、`WestPlay-lite-test`、`wp-patch-inspect`、`wp13`（2.1.3 构建树）、`wpq`（2.1.2 改造树）、`wp-target`、`wp-build*.log`/`wp-check*.log`/`wp-host.log` |
| 工作区 | `WestPlay-2.1.2*`（4 个目录 + 2 个 zip）、`WestPlay-main`/`WestPlay-main.zip`、`westplay-handoff.zip`、`westplay-mods-src-212.zip`/`-213.zip`/`westplay-mods-src.zip`、`WestPlay-server`、`westplay-webapp-m1-m4.zip`、`WestPlay-zh`/`westplay-zh-src.zip`/`westplay-zh-ui.zip`、`UPDATES-zh-2.1.3.md`/`-small.md` |

保留：`D:\wpq13\src`（当前）、`D:\wp14\src`（纯净 2.1.4 基线）、`D:\WestPlay-backup-20261028-214`（当前版本的备份）、
`D:\WestPlay`（装机）、`D:\WestPlay_2.1.4_x64-setup.exe`、`D:\WestPlay-2.1.4-src-full.zip`（完整源码）、
`westplay-mods-src-214.zip`（改动文件）、`D:\WestPlay-data`（**玩家数据：账号 cookie 与设置都在里面，永远别删**）、
以及 `FIXES.md`/`PLAN.md`/`SERVER-BRIEF-*.md` 等文档。


---

## §1 最终形态（验收标准）

### 1.1 Home 顺序

```
地图 · QQ音乐 · 网易云 · AppleMusic · 哔哩哔哩 · 蜻蜓FM · 天气 · 设置
```

### 1.2 槽位映射（**id 不变**，只换它显示的服务）

上游用 id 做导航/设置/最近使用，所以 **id 一律不改**，只改 id 指向的实现：

| App id | 原服务 | 现在 | 实现 |
|---|---|---|---|
| `music` | Apple Music | **Apple Music（保留）** | 上游原生的 `AppleMusicApp`，未动 |
| `youtubeMusic` | YouTube Music | **QQ 音乐** | `<WebApp site="qqMusic" />` |
| `spotify` | Spotify | **网易云音乐** | `<WebApp site="netease" />` |
| `youtube` | YouTube | **哔哩哔哩** | `<WebApp site="bilibili" />` |
| `podcasts` | Podcasts | **蜻蜓FM** | `<WebApp site="qingting" />`（从“下个版本”提前放出） |
| `maps` / `weather` / `settings` | — | 未动 | — |

### 1.3 主页媒体控件（Now Playing）

QQ 音乐和网易云分别显示：封面、歌名、歌手、**歌词**、播放/暂停、上一首、下一首，并**与网页双向联动**。
蜻蜓FM 同样显示封面、节目名、主播、播放/暂停/上一集/下一集（它没有歌词）。

### 1.6 空间音频（卡车自己的喇叭）

原生四个播放器（YouTube / Apple Music / YouTube Music / Spotify）的声音一直走 `cab_sound.js`：按每辆车
喇叭的位置、频段、电平、延时做分频，用 HRTF 从司机人头去听，镜头出车外会闷、越远越闷，均衡器也作用在这。

我们加接的网页站点现在也接上了（`webapp.rs` 的 `cab()` + `lib.rs` 每帧调用 + `webapp.js` 里的
`window.westplayCabSound`）：

| 站点 | 能不能走喇叭 | 原因（日志 `webapp: mediaProbe:` 可查） |
|---|---|---|
| 哔哩哔哩 | **能** | 播放器是 MSE（`src=blob:` + `crossOrigin=anonymous`），浏览器允许接进音频图 |
| 网易云 | 不能 | 播放元素上挂着一条 `MediaStream`，但那是个配角：真正的声音在它自己的 `AudioContext` 里，页面自己的音频图**外部无法接管**（试过接流，无效果，FIXES §13.6） |
| QQ音乐 | 不能 | 播放器在另一个文档里，本页拿不到元素 |
| 蜻蜓FM | 不能 | 普通跨域 mp3（`https://lhttp-hw.qtfm.cn/…`），没有 CORS 头，接进去会静音 |

**关键坑（FIXES §13）**：`MediaElementAudioSourceNode` 对“跨域且没 CORS 的媒体”只输出静音，而且**接进去就不能退出**。
所以判据必须是「地址非空 + `readyState ≥ 2` + （`blob:` / 同域 / `crossOrigin`）」，否则不接——宁可没有空间感，也不能把声音弄没。

### 1.5 熄火自动暂停 + **上电自动续播**（2026-10-31 晚改过）

卡车**电瓶断电**（熄火）的那一下，音乐立即暂停；断电期间不会有声音 —— 这一半照 AppleMusic 的规则（`ui/src/cabin/apps/web/pauseWithPower.ts`、`ui/src/cabin/apps/musicWithGame.ts`）：

| 时机 | 行为 |
|---|---|
| 电瓶断电（`power.phase` → `off`） | 正在播 → 立即暂停，**无淡出**（和 AppleMusic 一样“立即”）；网页站点是发一次 `playPause`（点站点自己的播放按钮） |
| 断电期间 | 自己开始播（自动播放、切歌、页面重载）→ 立刻再暂停 |
| **点火回来（`off` → `splash/connecting/on`）** | **自己接着播**（`poweredOn`）：**除哔哩哔哩外**的 app 都会 —— Apple Music（原生）、QQ音乐、网易云、蜻蜓FM（网页）；**B 站不续播**（`playsOnWithPower`，视频自己又开始放不是 owner 要的）。玩家自己已经按了播放的，一律不动（`playPause` 是 toggle） |
| 没在播 | 什么都不做（不做“盲切”，避免把暂停的反而点成播放） |

> ⚠️ **这条规则在 2026-10-31 晚被 owner 改过**：原来点回来是“什么都不做、要玩家自己按”（照 AppleMusic），
> 现在来电要自己续播（FIXES §29）。**只有 B 站保持不续播**。

挂在 `CabinApp.tsx` 的生命周期里（不是 App 屏幕里），所以玩家在**主页/地图**时网页音乐照常被熄火暂停。窗口外播放（比如手机上投屏）不在管辖范围——网页站点没有这个概念。

测试：`ui/src/cabin/apps/web/pauseWithPower.test.ts`（11 个用例）、`ui/src/cabin/apps/musicWithGame.test.ts`（6 个，原生播放器）、`apps/youtube/withGame.test.ts`（`poweredOff`/`poweredOn`）。

**实机验证**：2026-10-28 用户确认「熄火立刻停、断电期间没声音、点火回来保持暂停」；**2026-10-31 晚改为来电续播**（B 站除外），待 owner 复验。

### 1.4 座舱屏幕键盘

点任意站点的输入框 → 座舱键盘升起（在网页**之上**）→ 打字进网页 → 回车搜索 → 收起后网页恢复满高。

### 1.7 网页 App 的 Ctrl + 滚轮缩放（2026-10-31）

用屏幕时（按住交互键）光标落在站点页面上，**按住 Ctrl 滚滚轮**：远离自己的方向放大、朝自己的方向缩小，
范围 **0.5×–2.0×**（`webapp.rs` 的 `zoom_by` + `tick`）。要点：

- **无级**：缩放跟滚轮自己的**计数**走（一个刻度 120 counts ≈ 4.2%，只转半个刻度就只走一半），不是固定倍率台阶；
  显示上再按宿主每轮的时间**平滑收敛**（一次滚动读起来是一段连续缩放）；
- **默认行为不变**：没动滚轮时页面还是「按房间宽度自适应、右侧不被切」（§9 那套）；
- 玩家放大后 `fit_width` 不再介入（页面可能比洞宽，是页面缩放的正常代价），缩小后 fit 照旧；
- 换页/回主页/刷新**保留玩家的缩放**（同一站点内），换站点回到 1.0；
- 页面自己的滚动不受影响（Ctrl 没按时滚轮照旧给页面）；页面也**收不到** Ctrl（Ctrl+点击 不会变成网页的 Ctrl+点击）。

### 1.8 屏幕刷新率（2026-10-31；11-01 起在「显示与性能」里）

设置 → **显示与性能 → 屏幕刷新率**：**60 Hz**（默认，和卡车自己的屏幕一样）或 **30 Hz**（弱机器省一点）。
它管的是**宿主每秒把多少帧交给游戏**（`capture.rs` 的 `MOST_FPS = 60` 原来是编译期常量，现在是 `ScreenSettings.refresh_rate`），
座舱页面的地图自绘上限跟着一起降（`maps/frameCap.ts`）。三语（中/英/土）；旧设置文件没有这一项就是 60 Hz。

### 1.9 中文输入（2026-10-31 晚）

**插件自带的输入法现在能打中文**：座舱的键盘或玩家自己的键盘键入拼音，键盘上方出现**拼音栏与候选**
（空格选第一个、数字 1–9、鼠标点选），选中的字/词写进**当前输入框**——座舱自己的（地图搜索等）与**网页 App
的搜索框**（QQ音乐/网易云/B站）都可以；`xi'an` 用撇号切音节，字母原样提交永远可行。词库是生成的
（`tools/chinese/build_pinyin_table.py`，来源与许可见 FIXES §25.4），第一次打中文才加载。

**怎么进入中文**：中文是键盘语言之一，**默认跟游戏的语言**（游戏 `zh_cn` → 键盘就是中文）；否则按左下角的
**地球键**切：**英文 → 中文 → 土耳其 → 英文**（切一次就到中文）。⚠️ 第一版的地球键只换 en↔tr、切不到中文，
owner 当天就撞上了（“输入依然是英文”），**§25.8 已修**；那一版也补了两行日志（`keyboard language …`、
词库取到/取不到），下次同类问题一看日志就能定位。

**候选更多了怎么翻**：词库不再给音节设上限（常用字全收，高频音节最多 172 个字，如 `yi`），栏里一次只放
**八个**（数字 1–8 与空格按这一页算；9 在这一页上不选字），**栏右端两个箭头键翻页**（到两端绕回去，
只有一页时灰着）；打字/退格/选完字都回到第一页。

**哔哩哔哩也支持**（FIXES §26.2 / **§27.2**）：它的搜索框本来就是普通 `<input class="nav-search-input">`（抓 HTML 可证），
卡的是**上屏**那一跳 —— 现在输入法选中字后走**浏览器自己的输入管线**（宿主 `CallDevToolsProtocolMethod` 发
`Input.insertText`），不再自己动 DOM：任何站点自家组件包着的字段都收得下，光标也留在页面自己那边。
页面侧的 `focused()`/`field()`/`writeText()`（§26.2）保留，作为“找字段/整段写”那条路的加固。
**B 站的音量由它自己的播放器说了算**（§26.3 去掉卡片滑条，§27.4 页面侧连元素写入、增益节点、看门狗、frame 广播一起停掉）。

**键盘右端**（§26.1；§27.5 曾加过收起键，§33 已移除）：拼音栏右端只有两个**翻页键** `◀ ▶`（到两端绕回，
只有一页时灰着）；**收起键盘靠底部那一排的收起键**（`[ABC][地球][空格][收起][回车]`，没动）——右端那颗会
压住每页第九个候选。

### 1.10 性能模式（2026-11-01）

设置 → **显示与性能 → 性能模式**：开关。打开后座舱页**当场**放弃三样最贵的效果（FIXES §31）：

| 放弃的 | 变成 |
|---|---|
| 导航地图的 **3D 建筑**（`fill-extrusion` 那一层） | 整层收起：不画、也不逐帧重画（地图最贵的一项） |
| **毛玻璃**（所有 `backdrop-filter`） | 换成**适配明暗的纯色透明底**（深色配深底、浅色配浅底，照 iOS 的「降低透明度」）；三大张模糊装饰图不画 |
| **动画与过渡** | 全部 0 时长：直接到位；无限动画（转圈、下雨、呼吸光、波形）跑一趟就停 |

- 只在**座舱页面**生效（伙伴窗口、桌面预览不受影响），随时可关，关掉下一帧就恢复；
- 与刷新率**互相独立**，两项都存进 `settings.json`（`screen.performanceMode` / `screen.refreshRate`）；
- 旧宿主不发这一项 → 一律当关；坏值也当关（`lenient`）。

### 1.11 车辆信息 app（2026-11-01 下午）

Home 里新的**车辆信息**图标（原生 app，不加载任何网页）：左栏车型，右栏车损；挂上挂车、接上货再多两块（FIXES §34）。

| 显示 | 来自 |
|---|---|
| 车辆：品牌 + 型号 | 已有的 `truck` 消息 |
| 车辆状态：引擎 / 变速箱 / 驾驶室 / 底盘 / 轮胎 | **新读**的 `truck.wear.*` 五条通道 |
| 挂车：品牌 / 型号 / 车牌 | **新读**的 “trailer” 配置事件（新的 `trailer` 消息） |
| 挂车状态：底盘 / 轮胎 | **新读**的 `trailer.wear.*` |
| 货物：名称 / 吨位 / 货损 | 已有的 `job` 消息 + **新读**的 `trailer.cargo.damage` |

- 数字全是游戏自己的，**不估算**；游戏没给的通道显示「—」而不是 0%（`wearKnown` 位图区分「没坏」和「不知道」）；
- 桥接版本 24 → **25**：插件与宿主必须一起换，只换界面会让 app 一直停在「等待游戏数据…」；
- 深色/浅色与字号跟随现有主题；不做动画（性能模式下一样）。

### 1.12 倒车影像（2026-11-01 傍晚）

挂 **R 档**时整个座舱屏切成一台监视器（`cabin/reverse/ReverseCamera.tsx`）：

| 条件 | 画面 |
|---|---|
| 未连接挂车 | **车尾视角**：从车尾往后看的路面透视、米数行、红/黄/绿三条动态辅助线 |
| 已连接挂车 | **车顶视角**：俯视整车（牵引车 + 13 m 挂车）、米格、挂车尾部要扫过的弧形区域 |
| 两种都有 | 顶部一条状态栏（挡位 `R1`/`R2`、车速、视角名、挂车名）+ 底部黄色小字「**倒车时请注意后方安全**」 |

- 辅助线随**方向盘**摆动（`truck.effective.steering`，-1..1），打多少弯多少；
- 只在挂 R 时出现，退出 R 立刻回到原来的界面；把屏幕交给卡车原厂屏时不显示；
- **画面是画出来的**，不是摄像头：游戏不给插件任何世界画面（WestPlay 的页面只是游戏画在驾驶室屏幕上的一块纹理，见 FIXES §35.2）；三语；不做动画。

### 1.13 挂 R 真切游戏视角（2026-11-01 傍晚，接在 1.12 之后）

1.12 那套是自己画的。这一节把**真的切游戏相机**做出来了：真像素、真渲染；代价是切出去以后驾驶室不在画面里，
那块屏幕不画了，**WestPlay 界面暂时不显示**（FIXES §35.2 那条事实的正面用法）。

| 条件 | 切成游戏的哪个相机 | 按哪个键（读玩家自己的 `controls.sii`） |
|---|---|---|
| 挂着挂车 | **顶部视角**（相机 3） | `mix cam3` |
| 没挂挂车 | **车外视角**（相机 2，在车尾后面） | `mix cam2` |
| 退出 R | 回**驾驶室**（相机 1） | `mix cam1` |

- 挂 R 后**稳定 400 ms** 才切（防抖：从 R 拨回 N 再进 R、拨杆抖一下都不算），两次按键至少隔 900 ms；
- 只在驾驶室视角、游戏没暂停、玩家没在往 WestPlay 里打字、**游戏窗口是前台**时按；
- 只切回自己切过的视角（玩家自己在 R 里按了相机键，退出 R 不会被拽一次）；
- 键位读玩家 profile 的 `controls.sii`（`mix cam1`…`mix cam8`），玩家改过键也跟着走；
- `%USERPROFILE%\Documents\WestPlay\reversing.json` 可改相机号或整个关掉（关掉就回到 1.12 自己画的那套）；
- 1.12 那套留着当兜底：从按 R 到切视角成功之间的几百毫秒、以及按键没送进游戏时，看到的还是它；
- **停了就不再显示在播**（§55）：`intent`（座舱自己按下的结果）只活 6 秒；页面有自己的声音元素时以元素为准；
  什么都读不到时四个来源写进日志（`stateProbe`）。
- **上电续播不再问页面**（§54）：QQ 音乐的首页什么都不报（播放条是没有字的精灵），上电就按「它还在播」
  不发续播。现在 WestPlay 停掉的就由 WestPlay 放回去；页面另读 Windows 的媒体状态、控件没有名字时按
  class 认，首页播放条的结构打进日志。
- **上电续播真的会回来**（§53）：页面报 `playing` 改为看真正的时钟跳动（画过进度就以时钟为准），发完
  「plays on」1.6 秒再核一次、没回来再发一次；伴侣页在游戏没被看到且插件是旧版本时给出红字提示。
- **游戏里的插件永远是这一版**（§52）：启动时、游戏关闭时、以及没看到游戏时每 30 秒检查并替换游戏`plugins\westplay.dll`——旧版插件开的桥接名字不同，游戏会彻底「看不见」；换不进去时日志说清原因。
- **QQ 音乐的播放/暂停不再反**（§51）：页面把「在不在播」读站点按钮名字，那名字慢好几秒，于是图标反、上电不续播；现在车厢按下时记下「这次按成什么」（intent），站点改口前以它为准。
- **播放/暂停的图标与开关（§50）**：判断「这一下生效了没」改用页面自己的媒体元素（QQ 音乐的按钮名字慢好几秒，原来因此再点一次，把暂停点回播放）；车厢按下的播放/暂停立刻显示；网易云的「播放全部」不再被当成播放/暂停。
- **网页应用的快捷键修好**：站点自己做、不放回页面的媒体元素也调音量；暂停中的站点仍算「有东西可放」，热键能把暂停的站点叫回来；插件把「按下却没计入」的原因写进日志（§49）。
- **页面拖动条修好**：WebView2 在页面还没有 `<html>` 时就跑注入脚本，原来的 `documentElement.append` 抛异常并中断整个 `webapp.js`；改成 `DOMContentLoaded` 再装，右侧/底部条真的出现（§48）。
- **红绿灯读秒**：宿主只读游戏内存（`base_ctrl` 特征码 → 附近预置件 → 信号灯实例），取最近一盏的灯色与剩余秒数，地图上三灯 + 读秒，设置 › 地图可关（§47，§63 从「外观」搬到「地图」）。
- **Present 钩子加固**：游戏 exe 同目录有 `dxgi.dll` 就从它取 vtable，加模块诊断与 20 s 无帧看门狗（§47）。
- **页面的拖动条与放大键**：站点页面的右侧与下方有自己的拖动条（16px 圆角，放得下时不出条）；页面放大改成**右 Ctrl + 滚轮**（左 Ctrl 留给换挡）（§46）。
- **倒车压音量**：挂 R 档（倒车影像）时座舱音乐自动降到 **15%**，挂到其它挡位恢复；用的是淡出淡入那套（不改玩家设的音量），倒车中自己调过就以新值为准（§45）。
- **地图视角**：地图 App 右上角 2D/3D（2D＝正上方俯视、3D＝跟随车头的倾斜视角，两者都跟车；仪表盘的小地图没有），`flatLiveMap`／`useMapFlat`（§44）。
- **网易云音乐**：网页应用改开新播放器 `music.163.com/st/webplayer`，旧功能（播放条三键、进度、歌词、音量、座舱键盘、登录）全部照旧（§44）。
- **显示优先级**（卡车屏幕页）：关＝车机优先（原行为），开＝平板优先（平板显示 WestPlay，车机交还游戏自己的画面）；没装平板时自动退回车机（§43）。
- **快捷键**：播放/暂停、调低/调高音量现在也能控制**网页应用**（哔哩哔哩、网易云音乐、QQ 音乐、蜻蜓 FM）——站点在播时优先给它（§42）。
- **壁纸**：设置 › 壁纸新增**明暗壁纸**（浅色/深色各一张，与壁纸轮换互斥），轮换池里只剩玩家自己的壁纸（§41）。
- **倒车雷达不做**：SDK 不给“后方障碍物距离”，也不给碰撞物位置（FIXES §36.1）。**2026-11-01 深夜三（§40）**：倒车画面**退回第一版**（手绘车尾/车顶 + 红黄绿动态辅助线 + 黄字），§39 的地图俯视撤掉。**2026-11-01 更晚（§39）**：倒车屏幕改成**游戏地图的正上方俯视**（正北朝上、卡车居中、跟车），进出 R 自动切换并还原；相机自动切换恢复默认关。**2026-11-01 深夜再改（§38）**：owner 要的是**整屏游戏视角**，所以相机切换
  默认打开；相机键一次同时用三种方式送出（扫描码 / 虚拟键+扫描码 / 窗口消息）；按下后 700 ms 看相机真动没动，
  没动就重按（最多 3 次），三次都没动就写清楚并放弃；§37 的“偷镜子”实测抓到的是**法线缓冲**，改为只勘察不写屏。

代码：`crates/host/src/keys.rs`（新，`SendInput`）、`reversing.rs`（新，状态机 + `reversing.json`）、
`game_settings.rs`（读 `controls.sii`）、`lib.rs`（每帧调用 + 日志）；**插件、桥接、UI 没动**。

### 1.14 车机显示真实的游戏画面（2026-11-01 晚，接在 1.12/1.13 之后）

1.12 是自己画的、1.13 是整屏切相机。这一节是 owner 要的那件事：**车机那块屏里显示真画面**。

车机上的像素永远是 WestPlay 自己的纹理，所以真画面只能从游戏自己的渲染里取：游戏每帧渲染**左右后视镜**
（`r_mirror_scale_x/y = 2`，镜像是屏的 1/2 = 1280×720，正好等于车机纹理）。插件在挂 R 时把这两张读回来：

| 步骤 | 做什么 |
|---|---|
| 认 | RT+SRV、mips=1、单采样、R8G8B8A8、尺寸能整除车机 1280×720 的 1/2/3/4 倍、排除车机自己的纹理；同尺寸恰好两个 = 左右镜（取最大的一对） |
| 读 | 每 80 ms 一次 GPU 读回（会阻塞渲染线程，所以只在 R 时做） |
| 拼 | 左右各进半边、保持比例居中，铺满 1280×720 |
| 写 | 写进插件自己的纹理，再按页面帧同样的路数拷进车机纹理 |

- 只在挂 R 时替换页面帧；退出 R 的下一帧页面就回来了；
- 视图 700 ms 不更新（相机离开驾驶室、暂停、认不出来）→ 自动回落自己画的倒车影像（1.12）；
- **相机不切**（`reversing.json` 的 `enabled` 现在默认 false）：切了相机屏就不画了；
- 车机里没有黄字与辅助线（是游戏像素，插件不在上面画字）；
- 第一次抓到会写 `logs/mirror/{left,right,sheet}.bmp`，认错缓冲时看这三张图就能定位。

代码：`crates/plugin/src/mirror.rs`（新）、`screens.rs`、`d3d.rs`、`telemetry.rs`；`crates/host/src/reversing.rs`
（默认关）、`keys.rs`（按键带扫描码）。**桥接没动**（版本仍 25），UI 没动。

---

## §2 技术路线（为什么这么做）

三个站点都**不是**可以靠 API 接入的：它们要求登录态、有反爬、播放器是自家加密逻辑。
所以做法是：**在宿主里开一个离屏 WebView2，整页加载站点自己的网页**，再把它的像素合成到座舱页的一个「洞」里，鼠标键盘都转发进去。

- 好处：站点改版不用管，登录态用 WebView2 自己的 profile 持久化
- 代价：需要一套「宿主 ↔ 页面」的桥（状态、媒体、输入、按键）

模块：`crates/host/src/webapp.rs`（Rust 侧）+ `crates/host/src/webapp.js`（注入页面 document-start 的代理）。

---

## §3 改动清单（文件级）

`新` = 新增文件；`改` = 修改上游文件。括号里是要找的关键符号。

### 3.1 站点接入（宿主）

| 文件 | | 作用 |
|---|---|---|
| `crates/host/src/webapp.rs` | 新 | 整个 webapp 模块：`Site`（Bilibili/QqMusic/Netease + `home()`）、`WebApp`（建/关/放置/转发鼠标键盘）、`Command`（Open/Show/Hide/Reload/Home/Back/PlayPause/Next/Previous/**SetText**/**Enter**/Close）、`Report`（State/Typing/Media）、`Media`、`state_message`/`media_message`/`typing_message` |
| `crates/host/src/webapp.js` | 新 | 页面代理：状态与媒体上报、链接劫持、媒体按键、歌词抓取、输入框桥（typing/text/Enter） |
| `crates/host/src/lib.rs` | 改 | 接线：`webapp` 字段、`PageMessage::WebApp` 分发、`Report::State/Media/Typing` 处理、每帧 `show`、鼠标转发、游戏键盘转发（`webapp_selected`）、`typing.selection` 互斥 |
| `crates/host/src/webview.rs` | 改 | 离屏 WebView2 的支持（`post_json`、`take_page_messages`、合成鼠标输入、`CompositionController`） |
| `crates/host/src/pointer.rs` | 改 | 虚拟光标：**先 MOVE 再按键**、`LEAVE`(675) 单独处理（见 FIXES §3 点击问题）；**Ctrl+滚轮**时把滚轮增量留在 `Mouse::zoom` 给缩放用（`ctrl_held()`、`over_inside()`，FIXES §24.1） |
| `crates/host/src/capture.rs` | 改 | 帧率不再是常量：`MOST_FPS`/`interval_for`、`Mailbox::set_interval`、`Capture::set_fps`（FIXES §24.2） |
| `crates/host/src/settings.rs` | 改 | `ScreenSettings.refresh_rate: RefreshRate`（`"60"`/`"30"`，缺省 60） |
| `crates/host/src/cursor.rs` | 改 | `Mouse::zoom`（这一轮的滚轮增量，0 = 给页面滚动） |
| `crates/host/src/performance.rs` | 改 | `Profile::WebApp(&'static str)`，按域名给站点命名（Bilibili / QQ Music / NetEase Cloud Music） |
| `crates/host/src/webapp.rs` | 改 | `fit` + `player_zoom` 两个缩放分量、`apply_zoom()`、`zoom_by(notches)`（FIXES §24.1） |

### 3.2 座舱界面

| 文件 | | 作用 |
|---|---|---|
| `ui/src/cabin/apps/web/webapp.ts` | 新 | `useWebApp` 状态（`site/title/canGoBack/hole/media/typing/text/selection`）、`command()`、`receiveWebApp/Media/Typing()`、`webAppField`（屏幕键盘的字段） |
| `ui/src/cabin/apps/web/WebAppScreen.tsx` | 新 | 页面容器 + 洞的定位（`place()`）、键盘升降时收缩洞、`useKeyboard.attach` |
| `ui/src/cabin/apps/web/webapp.css` | 新 | 洞的样式 |
| `ui/src/cabin/apps/AppScreen.tsx` | 改 | `spotify→<WebApp site="netease">`、`youtube→bilibili`、`youtubeMusic→qqMusic`；`music` 仍走 Apple Music |
| `ui/src/cabin/state/apps.ts` | 改 | `APP_IDS` 顺序；`NEXT_RELEASE` 排除 podcasts/phone/messages |
| `ui/src/cabin/state/store.ts` | 改 | 消息分发：`webApp`/`webAppMedia`/`webAppTyping` |
| `ui/src/cabin/state/strings.ts` | 改 | **汉化**：`Language` 加 `'zh'`，`STRINGS` 加整份 `zh` 词条 |
| `ui/src/cabin/keyboard/layouts.ts` | 改 | 中文用 QWERTY 键位（真机中文走 IME） |
| `ui/src/cabin/keyboard/store.ts` | 改 | `Typing.playerTypes`（网页自己的框不接受座舱转写的按键） |
| `ui/src/cabin/keyboard/Keyboard.tsx` | 改 | **2.1.2 新增**：上游把 `KeyFace` 的语言写死成 `'en' \| 'tr'`，改成 `Language` 才能传 `'zh'` |
| `ui/src/cabin/apps/music/pages.tsx` | 改 | **2.1.2 新增**：界面语言直发 Apple Music 的 `library` 请求，在边界收口成 `'tr' \| 'en'`（宿主只认这两种） |
| `ui/src/cabin/shell/Shell.tsx` | 改 | `holeMask()`：`mask-composite: exclude` 打出洞（**键盘被抹掉的根因就在这**，FIXES §7.2） |
| `ui/src/shared/host.ts` | 改 | 消息类型：`WebAppCommand`（含 `setText`/`enter`）、`webAppTyping`、`WebAppMedia`、`WebAppState` |
| `ui/src/shared/media.ts` | 改 | `MusicService` 加 `'webApp'`；`lyric?: string` |
| `ui/src/shared/icons.ts` | 改 | 新图标角色（qq-music / netease / bilibili） |
| `ui/src/companion/preview.ts` | 改 | 预览里的图标映射（`spotify→netease.*`、`youtube→bilibili.*`、`music→qq-music.*`） |
| `ui/public/icons/westplay/*.svg` | 新 | `qq-music` / `netease` / `bilibili`，各 light+dark；**删除** `spotify.*`、`youtube.*` |

### 3.3 主页媒体控件

| 文件 | | 作用 |
|---|---|---|
| `ui/src/cabin/dashboard/nowPlaying.ts` | 改 | `NOW_PLAYING_ORDER = ['video','webApp','spotify','appleMusic','youtubeMusic']` |
| `ui/src/cabin/dashboard/useNowPlaying.ts` | 改 | `useWebAppSource()`：把 webapp 的 media 变成一个 source（`controls` 三个键全开、`lyric`） |
| `ui/src/cabin/dashboard/widgets.tsx` | 改 | `WebAppWidget`：三个按键 → `command({action:'playPause'|'next'|'previous'})`；`MusicWidget` 第二行显示 `lyric ?? artist` |

### 3.5 屏幕刷新率与网页缩放（2026-10-31）

| 文件 | | 作用 |
|---|---|---|
| `ui/src/cabin/state/refreshRate.ts` | 新 | `RefreshRate = '60' \| '30'`、`REFRESH_RATES`、`DEFAULT_REFRESH_RATE`、`isRefreshRate`、`hertz` |
| `ui/src/cabin/apps/settings/SettingsApp.tsx` | 改 | 外观页新增一行「屏幕刷新率」两段式按钮（`.refresh-rate-row`/`.refresh-rate-choice`）——**11-01 起搬到新的「显示与性能」页**（§3.7） |
| `ui/src/cabin/apps/settings/settings.css` | 改 | 上面那两段式控件的样式（灰底轨道 + 选中胶囊） |
| `ui/src/cabin/state/strings.ts` | 改 | 三语新增 `refreshRate` / `refreshRateFooter` / `hz60` / `hz30` |
| `ui/src/cabin/state/store.ts` | 改 | `refreshRate` 状态、`setRefreshRate`（宿主的）、`chooseRefreshRate`（玩家的，发 `{"type":"refreshRate"}`）、`settings` 消息里取用；`setMapFps` 让地图跟随 |
| `ui/src/cabin/maps/frameCap.ts` | 改 | 上限从常量变成 `setMapFps()`/`mapFpsNow()`（默认 60） |
| `ui/src/cabin/maps/liveMap.ts` | 改 | 注释跟着改（上限不再写死 60） |
| `ui/src/shared/host.ts` | 改 | 页面消息 `{type:'refreshRate'; rate:'60'\|'30'}`；`settings` 消息加 `refreshRate?` |
| `ui/src/companion/useSettings.ts` | 改 | 设置类型加 `screen.refreshRate`（伙伴程序保存设置时不会把它丢掉） |
| `ui/src/companion/preview.ts` | 改 | 预览的假设置补上 `refreshRate: '60'` |

### 3.6 中文输入（插件自带的输入法）

| 文件 | | 作用 |
|---|---|---|
| `ui/src/cabin/keyboard/pinyin.ts` | 新 | 拼音引擎：切音节（`syllablesIn`，撇号是边界）、候选（`candidatesFor`）、选字（`pick`）、键的取舍（`pinyinKey`/`digitChoice`）、词库懒加载（`loadTable`） |
| `ui/src/cabin/keyboard/pinyin.test.ts` | 新 | 引擎的 14 个用例 |
| `ui/src/cabin/keyboard/ime.test.ts` | 新 | 接线的 6 个用例（屏幕键盘/物理键盘/数字选字/Esc/宿主标志/其它语言不受影响） |
| `ui/src/cabin/keyboard/store.ts` | 改 | `composing`/`table` 状态、`choose()`、中文时字母进缓冲；`{"type":"ime"}` 通知宿主 |
| `ui/src/cabin/keyboard/Keyboard.tsx` | 改 | 键盘上方的拼音栏与候选（带 1–9 的小号数字，第一个填色） |
| `ui/src/cabin/keyboard/keyboard.css` | 改 | `.keyboard-ime*` 的样式（拼音栏压在键盘之上；有它时状态 chip 再往上让位） |
| `ui/src/cabin/keyboard/layouts.ts` | 改 | 注释：中文就是在这套 QWERTY 上打拼音 |
| `ui/src/cabin/state/strings.ts` | 改 | `keyboard.ime` 三语（拼音输入 / Pinyin input / Pinyin girişi） |
| `ui/src/shared/host.ts` | 改 | 页面消息 `{type:'ime'; on:boolean}` |
| `crates/host/src/lib.rs` | 改 | `PageMessage::Ime` + `ime_takes_keys`：中文组装时不再把 typed 直接送进网页字段 |
| `tools/chinese/build_pinyin_table.py` | 新 | 词库生成器（pinyin-data / rime-essay / OpenCC / phrase-pinyin-data） |
| `ui/public/chinese/pinyin.json` | 新（生成物） | 415 音节 / 10,569 条 / **7,735 字** / **29,867 词**，720 KB；第一次打中文才 fetch（§32） |
| `THIRD_PARTY_NOTICES.md` | 改 | 四个数据来源的许可与声明 |

### 3.7 性能模式（2026-11-01）

| 文件 | | 作用 |
|---|---|---|
| `ui/src/cabin/performance.css` | 新 | `html.performance` 下的三件事：全局去 `backdrop-filter`（含 View Transition 的侧栏玻璃）、玻璃底色换成适配明暗的纯色透明底、动画/过渡 0 时长且只跑一次 |
| `ui/src/cabin/CabinApp.tsx` | 改 | 把 `performance` 类挂上 `<html>`（与 `documentElement.lang`、demo 的类同一处）；引入 `performance.css` |
| `ui/src/cabin/maps/buildings.ts` | 改 | `buildingsVisibility(performanceMode)`：性能模式给 `'none'` |
| `ui/src/cabin/maps/liveMap.ts` | 改 | `syncBuildings()`：按 store 显示/收起建筑层（每帧重试到样式加载好），`buildingsMode` 记住已应用的值 |
| `ui/src/cabin/apps/settings/settings.ts` | 改 | 新页 `display` |
| `ui/src/cabin/apps/settings/SettingsApp.tsx` | 改 | 列表在 外观/壁纸 下面加「显示与性能」行；新 `DisplayPage`（刷新率从外观页搬来 + 性能模式开关）；外观页去掉刷新率那一组 |
| `ui/src/cabin/apps/settings/glyphs.tsx` | 改 | `DisplayGlyph`（表盘） |
| `ui/src/cabin/state/store.ts` | 改 | `performanceMode` 状态、`setPerformanceMode`（宿主的）、`choosePerformanceMode`（玩家的，发 `{"type":"performanceMode"}`）、`settings` 消息里取用 |
| `ui/src/cabin/state/strings.ts` | 改 | `displayPerformance` / `performanceMode` / `performanceModeFooter` 三语；`refreshRateFooter` 换成本轮指定的文案 |
| `ui/src/shared/host.ts` | 改 | 页面消息 `{type:'performanceMode'; on:boolean}`；`settings` 消息加 `performanceMode?` |
| `crates/host/src/settings.rs` | 改 | `ScreenSettings.performance_mode: bool`（lenient，默认 false） |
| `crates/host/src/lib.rs` | 改 | `PageMessage::PerformanceMode`：存进设置并回传；`settings` 消息加 `performanceMode` |
| `ui/src/companion/useSettings.ts`、`ui/src/companion/preview.ts` | 改 | 设置类型加 `screen.performanceMode`；假设置补上 |

### 3.4 构建

| 文件 | | 作用 |
|---|---|---|
| `app/tauri.local.conf.json` | 新（2.0.3 才有） | 关掉打包与 dev server，`frontendDist` 指向 `../ui/dist`（见 §6） |
| `app/tauri.installer.conf.json` | 新（2.1.2 起） | 打安装包用：`tauri.release.conf.json` 但把 `createUpdaterArtifacts` 关掉（见 §6.1） |
| `app/tauri.conf.json` | 改 | 描述文案（不影响功能） |

---

## §4 关键不变量（改的时候别破坏）

1. **id 不改**：`music/spotify/youtube/youtubeMusic` 是导航与设置的键，只换它们渲染什么。
2. **洞 = 合成位置**：宿主把站点页面画在 `hole` 矩形里，且**盖在座舱页之上**；座舱页在洞里是**被遮罩抹掉**的。任何要显示在网页之上的座舱元素（键盘、弹窗、**候选栏与状态小标**）都必须让洞收缩或避开——**注意键盘的绝对定位子元素不在键盘的盒子里**，量键盘量不到它们（FIXES §28 就是这么栽的）。
3. **输入槽只有一个**：宿主 `bridge.typing.selection` 是全局的。页面有自己的选中序号（`webapp_selected`），座舱键盘的序号**不能**覆盖它，否则物理键盘会打不进网页。
4. **游戏里的按键**：只有 `selection == webapp_selected` 时才转发进页面（否则会串到座舱自己的搜索框）。
5. **媒体状态是轮询出来的**：站点没有统一 Now Playing API（QQ 音乐完全没有 `MediaSession`），必须容错。

---

## §5 移植到新版上游（推荐顺序）

> 环境：Windows + MSVC + WebView2。Linux 上只能改代码，**不能**出可用的 exe（见 §7）。

**Step 0｜先让新版自己编译过**
```powershell
cd <新版根目录>
cd ui; npx --no-install tsc -b; npx --no-install vitest run; cd ..
cargo check -p westplay-host; cargo test -p westplay-host
```
不先确认这一步，后面分不清是上游的问题还是移植的问题。

**Step 1｜放新文件**
把 `src/` 里的「新」文件按原路径拷进去（`webapp.rs`、`webapp.js`、`apps/web/*`、图标、`tauri.local.conf.json`）。
此时**先别改 wire 代码**，让它编译失败——失败的每一处都是需要接线的点。

**Step 2｜接线宿主**（`lib.rs`）
要接的四处，按报错逐个补：
2. 建/关站点：`start_webapp(...)` / `app.close(&stage)`
3. 消息分发：`PageMessage::WebApp { command }` → **注意 `match` 顺序**（FIXES §7.5 的坑）
4. 上报：`Report::State / Media / Typing` → 存状态 / 转 UI / 改 `typing.selection`
5. 每帧：`app.show(&stage)`；鼠标进页面：`pointer.rs` 的转发；游戏键盘：`selection == webapp_selected` 时 `type_message`

**Step 3｜槽位映射 + 图标**
`AppScreen.tsx` 三个分支 → `WebApp`；`apps.ts` 顺序；图标 svg + `icons.ts` + `preview.ts`。
> 新版若把 `AppScreen` 拆成 registry（`APPS[id].component`），照它的写法挂，**不要**硬塞 switch。

**Step 4｜汉化**
`strings.ts`：`Language` 加 `'zh'`，`STRINGS` 加 `zh` 条目，`languageOf` 把 `zh_CN/zh_TW/zh_Hans...` 归到 `'zh'`。
> `Strings` 类型由 `STRINGS.en` 推导，**漏翻会直接 tsc 报错**——这就是检查器。把我们的 `zh` 整块搬过去，再按报错补新增的键。

**Step 5｜媒体控件**
`shared/media.ts`（`'webApp'` + `lyric`）→ `dashboard/nowPlaying.ts` 顺序 → `useNowPlaying.ts` 的 `useWebAppSource` → `widgets.tsx` 的 `WebAppWidget` 与歌词行。
> 新版若重写了 dashboard，只要保住「webApp 是一种 source，三个控制键都开着，第二行优先 lyric」这个契约。

**Step 6｜屏幕键盘**
`webAppField`（`playerTypes:false`）→ `WebAppScreen` 里 `attach/detach` → `store.ts` 的 `webAppTyping` → 宿主 `typing_message` 与 `webapp_selected` 互斥 → `Shell.tsx` 的 `holeMask` 收缩。
四个环节缺一不可，FIXES §7 逐条写了症状。

**Step 7｜缺陷修复逐个核对**（`FIXES.md` §1/§2/§3/§4）
尤其：
- `mapdata/src/archive.rs` 的 `min/max`（§1，不改就卡在「正在准备你的地图」）
- `WebApp.tsx` 大小写（§2，Windows 上必炸）
- 链接劫持（§3，不改就点不动 B 站视频）

**Step 8｜全量验证**
```powershell
npx --no-install tsc -b                 # 0 error
npx --no-install vitest run             # 全绿
cargo test -p westplay-host             # 全绿
```

---

## §6 构建与部署

**日常构建**用 `--no-bundle`（拿到 exe + ui 手动部署）；**要发安装包**用 §6.1。
两种都必须走 `tauri build`，纯 `cargo build` 出来的是 dev 模式（指 `localhost:5173`，进游戏白屏）。

```powershell
# 2.0.3 基线：
npx --no-install tauri build --config app/tauri.local.conf.json --no-bundle
# 2.1.2 起：不再需要那个 --config（那份配置应删除，见 SERVER-BRIEF-2.1.2.md §4）
npx --no-install tauri build --no-bundle
# 产物：target/release/westplay.exe
```

- 纯 `cargo build` 默认 feature 是 dev，**不要**用
- `--no-bundle`：直接拿 exe + ui 手动部署（日常调试走这条）
- 先编 `crates/plugin`（cdylib），否则运行时报 `westplay.dll doesn't exist`

### §6.1 打安装包（NSIS）

```powershell
npx --no-install tauri build --config app/tauri.installer.conf.json
# 产物：target/release/bundle/nsis/WestPlay_2.1.4_x64-setup.exe（约 9.8 MB）
```

- `app/tauri.installer.conf.json` = `tauri.release.conf.json` 但 `createUpdaterArtifacts: false`
  （上游的签名私钥我们拿不到；不关掉会直接报错）
- **NSIS 不会自动下载**（它从 GitHub 拉 `nsis-3.11.zip` + `nsis_tauri_utils.dll`，国内必失败）。
  离线放置位置：`%LOCALAPPDATA%\tauri\NSIS\`，结构为
  `Bin\makensis.exe`、`Stubs\lzma-x86-unicode`、`Stubs\lzma_solid-x86-unicode`、
  `Plugins\x86-unicode\additional\nsis_tauri_utils.dll`（zip 里的顶层 `nsis-3.11\` 要去掉）
- 校验值：`nsis-3.11.zip` SHA-1 `EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D`；
  `nsis_tauri_utils.dll` SHA-1 `75197FEE3C6A814FE035788D1C34EAD39349B860`
- `installMode: currentUser` → 装到 `%LOCALAPPDATA%\Programs\WestPlay`，与 `D:\WestPlay` **并存**，
  两套别同时跑（插件 dll 会被后启动的那套覆盖）

部署（安装目录 = exe 所在目录；**插件 dll 要放两处**）：

```
D:\WestPlay\
  westplay.exe
  westplay.dll              ← 宿主同目录
  ui\
    cabin.html
    assets\...              ← 每次换版本要删掉旧的 hashed chunk，否则残留

游戏目录\bin\win_x64\plugins\westplay.dll   ← 游戏真正加载的那一份
```

```powershell
taskkill /IM westplay.exe /F
cargo build --release -p westplay-plugin                   # 新版编译要先过这一步
copy target\release\westplay.exe D:\WestPlay\
copy target\release\westplay.dll D:\WestPlay\
copy target\release\westplay.dll "E:\SteamLibrary\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\"
robocopy ui\dist D:\WestPlay\ui /MIR      # 或 xcopy; 注意清掉旧 assets
start D:\WestPlay\westplay.exe
```

- 2.1.2 的 `npm run build:release` 需要 `ui/node_modules` 已安装（`cross-env`），且 `tauri` CLI 在**仓库根**的 `node_modules` 里（所以在仓库根跑 `npx --no-install tauri`）
- 换大版本后地图会**自动重建一次**（mapdata 变了，缓存失效），欧洲地图约 2 分钟，属正常

日志：`%USERPROFILE%\Documents\WestPlay\logs\app.log`；Documents 被拒时落 `%LOCALAPPDATA%\app.westplay\logs\app.log`（2.1.0 起，且不再每次启动清空——读日志认时间戳）。
数据：`%APPDATA%\app.westplay\setup.json`、`%LOCALAPPDATA%\app.westplay\{maps,EBWebView}`。

---

## §7 环境边界（踩过的）

- 这台 Windows 机器**没有 git**，做文件级对比要用哈希/`Compare-Object`
- 服务器是 Debian：能改代码、能跑 `cargo check`（不含 Windows 目标）、能跑 `tsc`/`vitest`，**不能**产出可用 exe（MSVC + WebView2 只能在 Windows）
- 上游依赖走 rsproxy 镜像；GitHub 直连被墙，`ghfast.top` 可用
- 站点会改版：QQ 音乐的 DOM 选择器（`.song_info__name`、`.player_music__time`、`A.btn_big_prev` 等）是硬编码的，改版后媒体控件会失灵，日志里 `domProbe` 能看出结构变了

---

## §8 已知限制

| 限制 | 说明 |
|---|---|
| 站点登录要手动一次 | 每个站点第一次要扫码/登录，登录态存在 WebView2 profile 里，之后免登录 |
| QQ 音乐没有 `MediaSession` | 媒体信息靠读 DOM + 时钟推断，站点改版即失效 |
| 歌词来自第三方接口 | QQ 音乐走 `c.y.qq.com` JSONP，网易云走同源 `/api/song/lyric`；接口变动需重写 `qqWords` / `neteaseWords` |
| 一次只能开一个站点 | 宿主只维持一个离屏 WebView（省内存），切站点会重建 |
| 物理键盘与座舱键盘互斥 | 页面输入框有焦点时，游戏按键直接进网页；座舱键盘只负责显示与写入 |
| 三站点「已登录」是启发式的 | 网易云/QQ音乐看顶栏头像与能读到的 cookie，站点改版可能失效（失效只是那行显示未登录，登录照旧可用）；B站按网址判断最稳 |
| 歌词同需要按站点校准 | 网易云把声音以 MediaStream 交给元素、`currentTime` 比喇叭早约 1 秒：用 `el − 0.5`；站点改版后重新校一次（`STREAM_LEAD`） |
| QQ音乐音量靠 Web Audio 接管 | 它页面里没有可播的 `<audio>`、没有 iframe，声音走 AudioContext 音频图；我们拦 `connect(destination)` 插自己的增益节点 |
| 一辆车可能有几份仪表脚本 | “原生支持”是**按脚本**的：同一辆车可能有好几页仪表，我们补了哪一页才在哪一页显示。雷诺 T 2024：导航页是我们（不用部件），仪表自己那页按 owner 的选择保留游戏信息；老款 T 用 generic（`ui/gps.sii`），那种车只能靠 WestPlay tablet（FIXES §22.9/§22.12/§22.13） |
| 视频卡片没有音量条 | 首页只有音乐卡片带音量（Apple Music/Spotify/YouTube Music/网页站点）；YouTube 视频用播放器自己的音量键 |
| 网页缩放的记忆范围 | Ctrl+滚轮缩放只在**同一站点的一次打开**里有效（换站点会重建 WebApp 回到 1.0）；不写进设置，也不按站点保存 |
| 网页放大后右侧会被切 | 玩家的放大（>1.0）时自动适配让位：页面比洞宽，右端看不全，和浏览器里页面缩放一样；滚回 1.0 或更小就恢复“自适应不切” |
| 30 Hz 是折中 | 屏幕刷新率选 30 Hz 时宿主的帧数上限、地图自绘上限都降到 30：画面明显不如 60 顺，是给弱机器省 GPU/电的 |
| 刷新率是全局一项 | 不是按站点/按 App 分：宿主只有一条画面通道（`capture.rs`），所以 60/30 是整块屏幕的 |
| 性能模式只动座舱页 | 它放弃的三样（3D 建筑、毛玻璃、动画）都是座舱页面自己画的；伙伴窗口、桌面预览、游戏里的模组都不受影响（FIXES §31.4） |
| 性能模式下的玻璃是纯色 | 深色配深底、浅色配浅底（iOS「降低透明度」那套）：它不再像磨砂玻璃那样透出后面的壁纸，这是**有意**的交换（FIXES §31.1） |
| 中文只有全拼 | 没有双拼/五笔/手写，也不做声调数字；候选只到**第一个音节**（外加整串命中的词），跨音节自由组合要一个字一个字选（FIXES §25.5） |
| 中文词库是简体、有限的 | 常用字（GB2312 基本集 6,763 + 语料在用的标准字，共 **7,735 字**）+ 词频阈值筛出的 **29,867 个词**；**生僻字（三级字/Ext-A/B/GBK 异体）有意不收**（owner 2026-11-01 定的），生僻词/繁体选不到，但**字母原样提交**永远可行 |
| 中文输入只在选中的输入框里 | 键盘收起或换输入框，组装中的拼音就没了（系统输入法也一样）；网页 App 的输入框要宿主配合拦按键，旧插件+新界面这一条会退化成“字母既进网页又进拼音栏” |
| 中文候选一次九条 | 一页九个，其余靠栏右端两个箭头翻页（数字 1–9 与空格只按当前这一页算）；到两端会绕回去 |
| B 站没有座舱音量条 | 首页卡片对 B 站不画音量条，页面侧也不再接管它的音量（元素、音频图、看门狗、frame 广播全停）：音量只用 B 站自己播放器上那条（FIXES §26.3/§27.4） |
| 歌必须是能播的元素 | 一个页面可以留着自己造的媒体元素（无地址、`readyState` 0），`play()` 一调就永不 `paused`：这种元素不算歌（`sounding`）。真歌用 MSE（`blob:`）或 `srcObject` 的算（FIXES §57.1） |
| 切歌走页面自己的动作 | 页面给 Windows 媒体键注册的动作（`setActionHandler`）在页面脚本之前被包一层记下来：网易云切歌直接调它自己的 `nexttrack`/`previoustrack`，不靠按元素；其它站点仍按自己的按钮（FIXES §58） |
| 切歌有两层兜底 | 先按「控件自己说的话」找（图标字体文字：`cmd-icon` 里的 prev/next），找不到就发播放器自己的 `Ctrl+←/→`；两者都记日志（`pressProbe`），所以下一轮能看出走的哪条（FIXES §57.2） |
| 滚轮有两条路 | 滚轮先交给 WebView2，再以 `webAppWheel` 告诉页面；页面**按整次滚动结算**：它自己的滚轮真把页面滚了（下一帧看位置）就一点都不补，一格都没动才把这次累计的位移一次补上。所以每一格只滚一次——§64 之前是两次（原生一次 + 90 ms 后我们补一次），那才是"一顿一顿"；只有"完全收不到滚轮"的页面才走兜底那条（FIXES §56.3、§64） |
| 卡车后置视角要先认镜子 | 屏上的倒车影像仍是 App 画的；要让屏上出现**游戏自己渲染**的后视画面（方案 B：相机我们给、渲染游戏自己画），第一步是认出游戏的两面镜子、找到画它们的代码。§37 按"尺寸最大的一对"抓到的是法线缓冲（`logs/mirror/left.bmp` 已确证）；现在按**画面内容**认（法线带占比 < 0.35 才算画面），每个候选留 `logs/mirror/cand-N.bmp` 与一行分数，认出后抓绑定时的调用栈；普查也不再只在倒车时跑（镜子只在座舱视角才画）（FIXES §65） |
| 游戏开着时换插件 | 被占用的旧 `westplay.dll` 改名成 `westplay.dll.<时间戳>.old` 挪开再装：**游戏本次运行仍是旧插件**，下次启动才生效；`.old` 装成功后清掉（FIXES §56.4） |
| 卡片的按下立刻生效有上限 | 座舱自己按下的结果只显示 2.5 秒（`SHOWN_FOR`），页面一报告立刻交还；页面不说话就回到它最后说的状态（FIXES §56.1） |
| B 站上电不自动续播 | 上电自动续播是**除 B 站外**的 app 才有的（`playsOnWithPower`）：视频自己又开始放不是 owner 要的；B 站断电照旧停、要自己按（FIXES §29） |
| 换了文档的页面要先沉默 2 秒 | 一份新文档 2 秒内说不清自己播什么，就先把「没在播」报上去（只报一次）：不报的话座舱会留着上一份文档的歌（QQ 音乐首页那张「反过来的」卡片就是这么来的）。代价是页面自己一秒多才起播放器的站点，卡片会先闪一下「没在播」（FIXES §59） |
| 网易云新版播放条是按形状找的 | 新播放器的 class 全是编译哈希（`DefaultBarWrapper_d1fdcdsp`），所以从 `.author` 往上找第一个「有 play/pause 图标 + 两个 `mm:ss`」的盒子当播放条；它改结构就变成找不到（退回 metadata/页标题两条路，不会报错歌），日志 `stateProbe` 能看出走的是哪条（FIXES §60） |
| 地图随车速缩放是一个开关 | 设置 › 地图 ›「随车速缩放」，默认开：20 km/h 及以下 17.2 级，110 km/h 及以上 15.2 级（中间 smoothstep），玩家自己用缩放键加的偏移两种情况都照加。关掉就固定 16 级。这条只存在页面自己（`zoomWithSpeed`，与文本大小同类），宿主不参与（FIXES §61） |
| 回首页会把歌接回去（QQ） | QQ 的首页是整页加载、里面**没有任何能出声的东西**：页面记着「这一标签刚才在播」（`sessionStorage`），发现新页面什么都没有就点站点自己的「播放器」链接回去，歌由站点自己接上、位置不丢。手动暂停过的不会再接；app 关掉再开不算（`sessionStorage` 随标签清空）。代价：几秒后会从首页被送回播放器页——想在 QQ 里出声只有那一页（FIXES §62） |
| 卡片的上一首/下一首有据可查 | 每次按下都留证据：宿主 `webapp: <站点> the card says next`，页面 `pressProbe … -> media session nexttrack`；3 秒还没换歌会写 `… moved nothing`。网易云走它注册的 `nexttrack`/`previoustrack`（页面藏着、在首页路由都一样灵），没注册时按它播放条上自己的图标，最后才 `Ctrl+←/→`（FIXES §62.4） |

---

## §9 给接手者的第一条指令

> 先读 `FIXES.md` 的索引表，再读本文 §1（验收标准）和 §4（不变量）。
> 新版上游先跑通 Step 0，再按 Step 1→8 搬。
> **别删 `FIXES.md` 里的探针**（`lyricProbe`/`domProbe`/`apiProbe`/`buttonProbe`/`pressProbe`/`textProbe`/`submitProbe`/`stateProbe`）：它们都有上限，平时不刷屏，出问题时是唯一能定位的证据。
