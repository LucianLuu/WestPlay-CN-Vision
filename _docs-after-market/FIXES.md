# WestPlay 改造后的修复记录

原版 2.0.3 自带的缺陷 + 本次改造引入的问题，共 13 组。按发现顺序写，每条含**症状 → 根因 → 改法**，改法精确到文件和符号，方便搬到新版上游。

配套文档：`PLAN.md`（改什么、槽位映射、移植顺序、构建部署）。

## 索引（先看这张表）

| # | 症状 | 改哪里 | 新版上游还要不要 |
|---|---|---|---|
| 1 | 永远停在「正在准备你的地图…」 | `crates/mapdata/src/archive.rs`（`min`/`max`） | **已废弃：2.1.2 上游自己修好了，不要再打** |
| 2 | Windows 上 `TS1149 … only in casing` | `apps/web/WebApp.tsx` → `WebAppScreen.tsx` | 只在新增 webapp 模块时才要 |
| 3 | 点网页链接没反应（B站视频/QQ音乐「我的音乐」） | `crates/host/src/webapp.js` 链接劫持 + `pointer.rs` 光标顺序 | 要（用 webapp 就有） |
| 4 | 构建/打包卡住（dev 模式、NSIS 失败、找不到 dll） | `app/tauri.local.conf.json`、手动拷贝 | 要（本机环境问题） |
| 5 | 想恢复 Apple Music 的位置 | `apps/AppScreen.tsx`、`state/apps.ts` | 看需求 |
| 6 | 主页媒体控件（封面/歌名/歌词/三键） | `webapp.rs` + `webapp.js` + `dashboard/*` | 要 |
| 7 | 三站点输入框调用不了座舱键盘 | `webapp.js` + `webapp.rs` + `keyboard/store.ts` + `Shell.tsx` | 要 |
| 8 | 拖音量条/进度条 → 卡住、屏幕消失 | `lib.rs`（`pump_messages`）+ `webview.rs`（`SetAllowExternalDrop`）+ `webapp.js`（拒绝拖动） | **要，原版 2.1.2 也有** |
| 9 | 三站点页面比可视区宽（右侧被切）、打开时缩放跳变、B站全屏不铺满 | `webapp.js` + `webapp.rs`（`fit_width`/`reveal`/`full_screen`）+ `WebAppScreen.tsx`/`webapp.css` | 要（用 webapp 就有） |
| 10 | 启动时的卡车品牌 logo 不见了（只剩品牌名文字） | `ui/public/brand-logos/`（7 个资源文件，仓库外，需从官方安装取回） | **要，源码构建必踩** |
| 11 | B站视频不上报播放信息（Now Playing 空白、切视频不更新） | `webapp.js`（`bilibili()` 解析 + `biliProbe`）+ `webapp.rs`（探针键表） | 要（用 B站 就会遇到） |
| 12 | 上游 2.1.2 → 2.1.3 升级（9 个冲突文件怎么合） | `lib.rs`、`pointer.rs`、`webview.rs`、`performance.rs`、`Shell.tsx`、`store.ts`、`preview.ts`、`host.ts` | 要（每次跟上游都要走一遍） |
| 13 | 网页站点的空间音频：网易云一放歌就没声音 | `webapp.js`（`speakable()`）、`webapp.rs`（`cab()`） | 要（以后再加站点就会遇到） |
| 14 | 座舱时钟差一小时（认不出国家就退回 0） | `ui/src/cabin/state/timeZone.ts`（时钟探测 + 保底偏移） | 要（原版也会猜错） |
| 15 | 第三方「Lite」补丁包合入；打上后「打开动画像没了」 | `wallpaperRotation.ts`（新）、`SettingsApp.tsx`、`store.ts`、`CabinApp.tsx`、`map.css`、`webapp.ts`/`WebAppScreen.tsx`/`webapp.css`/`Shell.tsx` | 要（壁纸轮换、限速牌字号、首启遮罩） |
| 16 | 网页 App 刚打开时露出游戏导航 | `webapp.rs`（`State::shown` 真信号）+ `Shell.tsx`（有 `shown` 才挖洞）+ `webapp.ts`（窗口内遮罩） | 要 |
| 17 | 三站点登录接进主程序（含新手引导），只留 Apple Music 原入口 | `crates/host/src/weblogin.rs`（新）+ `qq_music_sign_in.js`/`netease_sign_in.js`、`signin.rs`、`webview.rs`、`lib.rs`、`app/src/main.rs`、`companion/*` | 要（用 webapp 就有） |
| 18 | 网页 App 整页滚动歌词（+ 同步 / 切歌 / 音量） | `webapp.js`、`webapp.rs`、`lyrics.rs`、`webapp.ts`、`LyricsPage.tsx`、`widgets.tsx`、`webapp.css`、`dashboard.css` | 要 |

索引只列到 18（§19 之后的内容按时间追加在下面）：

| # | 是什么 | 改哪里 |
|---|---|---|
| 19 | 三站点登录接进主程序（账号页 + 新手引导） | `crates/host/src/weblogin.rs`（新）、`signin.rs`、`app/src/main.rs`、`companion/*` |
| 20 | 网页 App 的整页滚动歌词与两处音量条（同步定稿） | `webapp.js`、`webapp.rs`、`LyricsPage.tsx`、`widgets.tsx`、`webapp.css` |
| 21 | 完整源码导出 / 文档更新 / 旧产物清理 | `_docs/`、本文、`PLAN.md` |
| 22 | 「视野里有卡车屏幕，但 WestPlay 没显示」（仪表/平板两条路） | `crates/shared/screen_layouts.txt`、`crates/setup/src/game_mod.rs`、诊断测试 |
| 23 | 2026-10-31 收尾：雷诺 T 2024 结论、A/B 定案、产物重打 | 同上 |
| 24 | **本轮**：网页 App 的 Ctrl+滚轮无级缩放、屏幕刷新率 60/30 Hz（+ 汉化、重装配、重打包） | `pointer.rs`/`webapp.rs`/`cursor.rs`/`capture.rs`/`settings.rs`/`lib.rs`、`SettingsApp.tsx`、`state/refreshRate.ts`（新）、`maps/frameCap.ts`、`strings.ts` |
| 25 | **插件自带输入法支持中文**：座舱里的拼音输入法（拼音栏 + 候选 + 数字/鼠标选字，座舱与网页输入框都能打） | `keyboard/pinyin.ts`（新）、`keyboard/store.ts`、`Keyboard.tsx`、`keyboard.css`、`shared/host.ts`、`lib.rs`（`PageMessage::Ime`）、`tools/chinese/build_pinyin_table.py`（新）、`ui/public/chinese/pinyin.json`（生成物） |
| 26 | **候选翻页键、B 站的输入适配、B 站不显示首页音量条** | `keyboard/pinyin.ts`/`store.ts`/`Keyboard.tsx`/`glyphs.tsx`/`keyboard.css`、`webapp.js`（`focused()`/`field()`/`writeText()`）、`apps/web/webapp.ts`（`cabinVolumeFor`）、`dashboard/widgets.tsx` |
| 27 | **B 站中文上屏改走 `Input.insertText`（CDP）、B 站音量彻底放手、键盘右端加收起键** | `webview.rs`（`devtools()`）、`webapp.rs`（`Command::InsertText`）、`lib.rs`（`Ime` 日志）、`shared/host.ts`、`keyboard/store.ts`（`Typing.insert?`）、`apps/web/webapp.ts`（`webAppField.insert`）、`webapp.js`（`ownVolume`）、`Keyboard.tsx` |
| 28 | **所有网页 App 都看不见候选框（真凶：候选栏在洞里被遮罩抹掉）** | `apps/web/webapp.ts`（`floatingTop`）、`apps/web/WebAppScreen.tsx`（`place()` 量最高的一摞） |
| 29 | **上电自动续播（除哔哩哔哩外）** | `apps/youtube/withGame.ts`（`poweredOn`）、`apps/musicWithGame.ts`、`apps/web/pauseWithPower.ts`（`playsOnWithPower`） |
| 30 | **地图搜索第一个结果不是最近的**（原来是“先按匹配分组、组内才按距离”） | `ui/src/cabin/maps/places.ts`（`searchPlaces` 的排序）+ `places.test.ts` |
| 31 | **性能模式**：阉割导航的 3D 建筑、毛玻璃（换成适配深色的纯色透明底）与动画；刷新率与它合并成设置里的「显示与性能」 | `maps/buildings.ts`/`maps/liveMap.ts`、`performance.css`（新）、`CabinApp.tsx`、`SettingsApp.tsx`/`settings.ts`/`glyphs.tsx`、`state/store.ts`、`strings.ts`、`shared/host.ts`、`crates/host/src/{settings.rs,lib.rs}`、`companion/{useSettings,preview}.ts` |
| 32 | **中文字库扩容**：去掉每音节 24 个候选的闸，常用字全给（7,735 字）；词条 25,040 → 29,867 | `tools/chinese/build_pinyin_table.py`、重新生成的 `ui/public/chinese/pinyin.json` |
| 33 | **移除拼音栏右端的收起键**（它压住每页第 8/9 个候选）；收键盘仍用底部那一排的键 | `ui/src/cabin/keyboard/Keyboard.tsx` |
| 34 | **新增「车辆信息」app**（原生，非网页）：左栏车型、右栏车损；挂上挂车显示挂车状态、接上货显示货物状态——全部同步游戏遥测（插件新读 9 条 SDK 通道）；桥接版本 24 → 25 | `crates/plugin/src/telemetry.rs`、`crates/shared/src/lib.rs`、`crates/host/src/lib.rs`、`ui/src/cabin/apps/vehicle/*`（新）、`apps.ts`/`strings.ts`/`icons.ts`/`host.ts`/`store.ts` |
| 35 | **倒车影像**：挂 R 档整天屏切成监视器——没挂车是车尾视角（透视路面 + 红黄绿动态辅助线），挂了挂车是车顶视角（俯视整车 + 米格 + 挂车扫描带），底下黄字「倒车时请注意后方安全」；**为什么是画出来的**见 §35.1（游戏不给世界画面） | `ui/src/cabin/reverse/*`（新：`reverse.ts`/`ReverseCamera.tsx`/`reverse.css`/`reverse.test.ts`）、`CabinApp.tsx`、`state/strings.ts`、`shared/host.ts`（补 `Telemetry.steering`） |
| 43 | **显示优先级**：卡车屏幕页新增开关，关＝车机优先（原行为，平板保持空白），开＝平板优先（车机交还游戏自己的画面）；设置 `screen.tabletFirst`，桥 `tablet_first`，`BRIDGE_VERSION` 26 | `crates/plugin/src/screens.rs`、`crates/host/src/settings.rs`、`ui/src/companion/pages/ScreenPage.tsx` |
| 44 | **地图 2D/3D 切换 + 网易云新版播放器**：地图 App 右上角两段胶囊（2D＝正上方俯视，3D＝跟随车头的倾斜视角，都跟车），`flatLiveMap`／`useMapFlat`／`followPitch`；网易云音乐改开 `music.163.com/st/webplayer`，播放条没变（`.m-playbar`），`webapp.js` 补 `netease()` 回退与 `?id=` 识别 | `ui/src/cabin/maps/{liveMap.ts,camera.ts,MapControls.tsx,maps.css}`、`ui/src/cabin/dashboard/MapView.tsx`、`ui/src/cabin/state/strings.ts`、`crates/host/src/webapp.rs`、`crates/host/src/webapp.js` |
| 45 | **倒车时音量压到 15%**：挂 R 档把五个播放器（网页应用、YouTube、Spotify、Apple Music、YouTube Music）平滑压到 15%，挂出倒挡恢复；用 `fade`+`sendVolume`，不改玩家自己设的音量，倒车中改过则以新值为准 | `ui/src/cabin/reverse/quiet.ts`（新）、`ui/src/cabin/CabinApp.tsx` |
| 46 | **页面拖动条 + 右 Ctrl 滚轮**：站点页面注入 16px 圆角滚动条（右、下两条，`html/body` 改 `overflow: auto`，放得下时不出条）；页面放大的修饰键从 Ctrl 改成**右 Ctrl**（左 Ctrl + 滚轮留给换挡）。红绿灯相位：SDK/二进制里没有 `traffic_light.state`/`state_time_remaining`，需要来源 | `crates/host/src/webapp.js`、`pointer.rs`、`cursor.rs`、`lib.rs`、`webapp.rs` |
| 47 | **红绿灯读秒 + Present 钩子加固 + 页面拖动条**：宿主只读游戏内存取最近一盏灯的灯色与剩余秒数（`base_ctrl` 特征码 → 附近预置件 → 信号灯实例），地图上画三灯加读秒，设置 › 外观可关；插件 Present 改从游戏自己的 `dxgi.dll` 取 vtable，加模块诊断与无帧看门狗；站点页面 `body` 跟随内容宽度，右下可拖 | `crates/host/src/traffic_lights.rs`（新）、`lib.rs`、`webapp.js`、`crates/plugin/src/d3d.rs`、`plugin/src/lib.rs`、`ui/src/cabin/maps/liveMap.ts`、`maps.css`、`state/store.ts`、`state/strings.ts`、`apps/settings/SettingsApp.tsx`、`shared/host.ts` |
| 48 | **页面拖动条真的装上了**：WebView2 的 document-start 脚本运行时页面还没有 `<html>`，§46/§47 的`documentElement.append` 抛 TypeError，整个 `webapp.js` 从这里中断（样式与音量/媒体/输入注入一起失效）；改成等 `DOMContentLoaded` 再装。实测注入后右、下两条 16px 圆角滚动条出现，根元素可滚宽度 1100 > 640 | `crates/host/src/webapp.js` |
| 49 | **网页应用的快捷键（播放/暂停、音量）修好**：网易云新版播放器的声音是页面自己做出来、**不放进页面**的媒体元素（`media=0`），音量改的是查询得到的元素，所以按了什么也没发生；现在页面把「做出来但没放进页面」的媒体也记下来并一起调音量。暂停中的站点也算「这里有东西可放」，所以按热键能把暂停的站点叫回来。另外插件在热键按下却没被计入时（屏幕未显示 / WestPlay 不在屏上 / 正在输入）记一行原因 | `crates/host/src/webapp.js`、`crates/plugin/src/keybinds.rs`、`ui/src/cabin/apps/web/player.ts`（+ 测试） |
| 50 | **播放/暂停的图标与开关**：QQ 音乐的按钮名字要好几秒才更新，页面把「名字没变」当成「没生效」，于是再点一次（暂停又被点回播放）；现在判据是页面自己的媒体元素（瞬间变），不补点。车厢这头按下的播放/暂停**立刻**显示（`shownPlaying`），站点下一次上报再交回页面。网易云的「播放全部」也不再被当成播放/暂停。断电/上电的暂停与续播写进 `app.log`（`cabin: …`） | `crates/host/src/webapp.js`、`crates/host/src/lib.rs`、`ui/src/shared/host.ts`、`ui/src/cabin/apps/web/*`、`ui/src/cabin/apps/musicWithGame.ts`、`ui/src/cabin/dashboard/useNowPlaying.ts` |
| 51 | **QQ 音乐的播放/暂停是反的**（图标反、断电后上电不续播）：页面把「在不在播」读的是站点自己的按钮名字，而 QQ 的按钮名字要好几秒才更新——刚按完暂停，页面还在报 `playing: true`。现在车厢按下时先记下「这次是按成什么」（`intent`），站点按钮的说法与它一致之前以它为准（15 秒作废） | `crates/host/src/webapp.js` |
| 52 | **另一台设备「检测不到游戏」**：游戏里的 `westplay.dll` 是旧版（插件日志 `24/24 channels`，这一版是 33），而桥接按版本命名（`Local\WestPlay.Bridge.v26`），旧插件开的另一个名字，两边永远碰不上，主机安静地显示「未运行」。现在 host 在启动时、游戏关闭时、以及一直没看到游戏时每 30 秒，把 exe 旁的 `westplay.dll` 同游戏 `plugins\westplay.dll` 比对，不同就装进去，装不进去在日志里说清楚为什么；插件加载行也带上了 `bridge v26` | `crates/host/src/lib.rs`、`crates/plugin/src/lib.rs` |
| 53 | **断电暂停后上电不续播（QQ 音乐）+ 伴侣页提示旧版插件**：页面报的 `playing` 在断电暂停后仍是 true（它的「时钟在动」其实读的是插值位置，永远为真；按钮名字又滞后），上电时判成「已经在播」就不发 toggle。现在 `moved` 看真正的时钟跳动、画过进度的页面以时钟为准；发完「plays on」1.6 秒再核一次、没回来就再发一次。伴侣页新增「游戏里的 WestPlay 插件是旧版本」提示（`Status.plugin_outdated`，36 种语言）| `crates/host/src/webapp.js`、`crates/host/src/lib.rs`、`ui/src/cabin/apps/web/pauseWithPower.ts`、`ui/src/companion/**` |
| 54 | **QQ 音乐首页：媒体卡片不动、上电还是不续播**：首页的播放条是一个不带字的精灵（`btn_bottom_player`）——它不是播放/暂停，页面也没有进度、没有 sound 消息，于是页面什么都不报，座舱的卡片停在上一首、`playing` 也不会变；上电时按「它还在播」判成不用发，续播就永远不发。现在上电**不问页面**：WestPlay 停掉的就由 WestPlay 放回去（断电时自己起的会先被按停，所以不会误停）；页面也读Windows 自己的媒体状态（`navigator.mediaSession.playbackState`），控件没有名字时按 class 认，首页播放条的真实结构会打进日志 | `ui/src/cabin/apps/web/pauseWithPower.ts`、`crates/host/src/webapp.js` |
| 55 | **停了，卡片还说在播**（QQ 音乐）：座舱自己按下 playPause 的那句话（`intent`）从 §53 起不再过期——页面没画时钟、没有声音元素、`mediaSession` 也没有状态时，卡片就一直照着那一次按下的结果说。现在 `intent`只活 6 秒；页面有自己的声音元素时以元素为准；四个来源都读不到时把它们写进日志（`stateProbe`） | `crates/host/src/webapp.js`、`crates/host/src/webapp.rs` |
| 56 | **五处**：① **QQ 音乐卡片与页面反着**（座舱自己那句「这次按成了什么」没有期限，页面不报就永远留着）② **网易云没有卡片**（新版播放条不写歌名，`netease()` 直接返回 null）③ **B 站滚轮不翻页**（WebView2 不给页面就没人滚：现在另发页面消息、页面自己兜底）④ **首次安装留下旧 `westplay.dll`**（游戏开着时被占用，`copy_into` 报 InUse 就不装了：现在改名叫 `.old` 挪开再装）⑤ **网易云外部登录窗口不关**（新版 `MUSIC_U` 是 HttpOnly，页面读不到 cookie） | `ui/src/cabin/apps/web/webapp.ts`、`crates/host/src/webapp.js`、`crates/host/src/pointer.rs`、`crates/setup/src/plugin.rs`、`crates/host/src/netease_sign_in.js` |
| 57 | **QQ 还是反的 + 网易云不能切歌**：QQ 播放器页有一个自己造的**空媒体元素**（无 `src`、`readyState` 0），`play()` 一调就永不 `paused`，被 `player()` 当成歌 → `playing` 永远 true；网易云新版播放器的控件是图标字体的文字（`<span class="cmd-icon">prev</span>`），没有 `title`/`aria-label`、也不是 `a`/`button` → 找不到。现在「能当歌的元素必须先有东西可播」（`sounding`），`button()` 多一轮按「它自己说的话」找最小元素，最后还有播放器自己的 `Ctrl+←/→` 键兜底 | `crates/host/src/webapp.js` |
| 58 | **网易云切歌**：新版播放器的上一首/下一首是 **SVG 图标**（没文字、没 title、class 是编译的），而它自己给 Windows 的媒体键注册了 `nexttrack`/`previoustrack`。现在把 `MediaSession.prototype.setActionHandler` 包一层，记下页面注册的 handler，切歌时**直接调它**（网易云优先；其它站点照旧按自己的按钮，QQ 不动），最后才是 `Ctrl+←/→` 兜底 | `crates/host/src/webapp.js` |
| 59 | **QQ 音乐首页的卡片是「反的」**：点站内 logo 回首页是**整页重新加载**（声音随旧文档停掉；新文档里没有播放器、没有媒体元素、没有 `mediaSession`、也没有 `AudioContext`），而注入脚本的 `said` 初值就是 `'null'`，「页面什么都没有」这个结论被当成「和上次一样」跳过 → 主机与卡片一直留着上一份文档的 `playing: true`。现在一份新文档 2 秒后自己报一次 `{media: null}` | `crates/host/src/webapp.js` |
| 60 | **网易云新版播放器的首页卡片**：新版没有 `.m-playbar`（`netease()` 直接 `return null`），而 §56 加的「读页面标题」写在 `if (!bar) return null` 之后，永远走不到。现在按**形状**找它自己的播放条（从 `.author` 往上第一个「有 play/pause 图标 + 两个 `mm:ss`」的盒子），歌名/歌手/封面/播放状态都从那里读；老 `.m-playbar` 与页标题两条路保留 | `crates/host/src/webapp.js` |
| 61 | **地图随车速自适应缩放**：`zoomForSpeed` 原来只差 **1.3 级**（20 km/h 以下 17.2、90 km/h 以上 15.9），几乎看不出。现在拉开到 **2 级**、封顶在 110 km/h（17.2 → 15.2），另加 `followZoom`/`STEADY_ZOOM` 与 **设置 › 地图 ›「随车速缩放」**（`zoomWithSpeed`，默认开；关掉固定 16 级），玩家自己加的缩放偏移两种情况都照加 | `ui/src/cabin/maps/{camera.ts,liveMap.ts}`、`ui/src/cabin/state/{store.ts,strings.ts}`、`ui/src/cabin/apps/settings/*` |
| 62 | **QQ 音乐回首页不再断歌 + 网易云卡片的上一首/下一首**：QQ 的首页是**整页加载**、里面没有任何能出声的东西（0 个媒体元素、0 个 `AudioContext`），但它自己的播放器页会把歌接上；现在页面把「这一标签刚才在播」记进 `sessionStorage`，新文档发现「什么都没有」时**点站点自己的「播放器」链接**回到播放器页（歌由站点自己接上，卡片不闪），手动暂停过的则照旧清空。网易云那四个媒体键动作本来就在（卡片按下去就换歌），这一轮补了宿主一行日志、按下立刻上报、3 秒没动写日志、以及没有动作时按它播放条上自己的图标 | `crates/host/src/webapp.js`、`crates/host/src/webapp.rs` |
| 63 | **「红绿灯显示」搬进「设置 › 地图」**：它管的是地图上画不画那盏灯（宿主为它读游戏内存），原来在「设置 › 外观」的最后一块。`MapsPage` 现在两项：红绿灯显示、随车速缩放；开关行为、文案、持久化键与宿主消息一字未改，「外观」页只剩明暗、文本大小、车机栏 | `ui/src/cabin/apps/settings/SettingsApp.tsx`、`ui/src/cabin/state/store.ts`、`crates/host/src/lib.rs`（注释） |
| 64 | **哔哩哔哩滚轮翻页卡顿**：不是卡，是**每一格滚了两次**——WebView2 其实会把滚轮交给页面（实测一格 120 px 立刻到位），而 §59 加的兜底在 90 ms 后又补一次，因为它的判据是"消息发出之后有没有动"，可原生滚动在消息之前就落地了。现在兜底按**整次滚动**结算：页面自己滚过就一点都不补，页面一格都没动才把整次累计的 `dy` 一次补上（10 格就滚 10 格，过去只滚 1 格），并写一行 `stateProbe`。实测 5 格：修前 720 px → 修后 600 px | `crates/host/src/webapp.js`、`crates/host/src/pointer.rs`（注释） |
| 65 | **卡车后置视角（方案 B）的第一步**：§37 的 `left.bmp` 转图确证是视图空间法线；判据从"尺寸最大的那一对 RT"改成**按内容认**（法线带占比 < 0.35 才算画面），每个候选留一张 `cand-<n>.bmp` 并记分数，非镜子形状的 RT 也记一行；认出镜子后抓**绑定时的调用栈**（`game+0x…`），这是方案 B 复用游戏自己渲染入口的落点。普查也不再只在倒车时跑（镜子只在座舱视角画）。只读，不写屏 | `crates/plugin/src/mirror.rs`、`crates/plugin/src/screens.rs`、`crates/plugin/src/telemetry.rs`、`crates/plugin/Cargo.toml` |
| 66 | **卡车后置视角（方案 B）第二步：镜子根本没有纹理**。owner 那一跑的日志里，全机只有 25 种 RT、没有一个"镜子尺寸"的颜色缓冲；1280×720 那 4 张的中心取样是座舱内饰，调用栈落在带环形队列的 worker 线程（`r_deferred_mirrors` 的 deferred 真是异步）。结论：ETS2 像传送门那样把镜子视角**画进主渲染目标的一小块视口**。于是挂钩 `RSSetViewports`（见过的小视口 + 调用栈）与 `DrawIndexed`（小视口里的那笔 draw + 调用栈），再导出一帧的 RT 绑定顺序。只读，不写屏 | `crates/plugin/src/d3d.rs`、`crates/plugin/src/mirror.rs` |
| 67 | **卡车后置视角（方案 B）第三步：镜子是被“挖”出来的主画面**。第二跑证明那两张 1280×720 是**内饰**的半分辨率延迟缓冲（全尺寸图就是方向盘和仪表台），而且全程 **16 种视口里没有一种是镜子**（只有全屏、离屏贴图和右下角 113×28 的提示条）。所以镜子既没有自己的图也没有自己的视口，只能是被 scissor/stencil 圈出来的主画面一块。于是挂 `RSSetScissorRects`（见过的矩形 + 栈，窄 25% 且 ≥200 px 才算“挖出来的”），`DrawIndexed` 同时看小视口与被挖矩形，再把普查后两帧里**像素着色器采样到的每张纹理**取样落盘（`srv-*.bmp`，≤20 张）。只读，不写屏 | `crates/plugin/src/d3d.rs`、`crates/plugin/src/mirror.rs` |
| 68 | **卡车后置视角换路子：把镜子那块画面搬到车机屏**。§65–§67 证明游戏没有镜子贴图、也没有镜子视口，镜子是被 scissor 挖出来的主画面一块。于是不再找图：`RSSetScissorRects` 里连续 10 次相同、窄 25% 以上且宽 ≥200 px 的矩形当作镜子矩形，`Present` 时从交换链后备缓冲拷出来，交给独立线程双线性放大到 1280×720，再由 `frame` 覆盖屏幕纹理——车机屏显示游戏画在镜子位置的后视画面（清晰度上限就是镜子在屏上的大小）。找不到矩形时什么都不做，不回归 | `crates/plugin/src/rearcam.rs`（新）、`crates/plugin/src/mirror.rs`、`crates/plugin/src/frame.rs`、`crates/plugin/src/d3d.rs`、`crates/plugin/src/lib.rs` |
| 69 | **倒车影像全部还原**（插件 `mirror.rs`/`rearcam.rs`、主进程 `reversing.rs`/`keys.rs`/相机键、UI `cabin/reverse/`、四种语言文案、`d3d.rs` 的三个镜子钩子、`frame` 的后视覆盖、`Cargo.toml` 的 Debug 特性全删）；**哔哩哔哩滚轮**改成看任何滚动（页面自己滚过就不插手，页面不给滚就下一帧跟手滚），实测一格一倍无双滚；**地图上方居中**加「距下一次强制休息还剩 XX 小时」（SDK `rest.stop` + 游戏 `uset g_fatigue`，关了疲劳模拟不显示）；**交货胶囊**的到达时刻换成订单剩余期限「剩余 XX 小时」，里程不变；`BRIDGE_VERSION` 26→27 | `crates/plugin/src/*`、`crates/host/src/*`、`crates/shared/src/lib.rs`、`ui/src/cabin/**`、`ui/src/shared/host.ts` |
| 42 | **快捷键控制网页应用**：网页应用（哔哩哔哩/网易云音乐/QQ 音乐/蜻蜓 FM）作为第五个播放器接进 `keybinds`，播放暂停按站点自己的按钮（`Command::PlayPause`），音量步进改页面的媒体音量（`Command::SetVolume`）；Rust 未改 | `ui/src/cabin/apps/web/player.ts`、`ui/src/cabin/CabinApp.tsx` |
| 70 | **哔哩哔哩滚轮改成无极**（页面接管这一格：`preventDefault` + 每帧走 30%，约 120 ms 滑到位；播放器/进度条/右 Ctrl 不接管；宿主那条同格消息 400 ms 内不再叠加）；**交货卡片**左下的「周一 18:18 前到达」换成「剩余 XX 小时」（`destination.ts` + `formatTimeLeft`），§69.4 改错地方的地图胶囊同时恢复成到达时刻 | `crates/host/src/webapp.js`、`ui/src/shared/format.ts`、`ui/src/cabin/dashboard/{destination.ts,destination.test.ts,MapView.tsx}`、`ui/src/shared/format.test.ts` |
| 72 | **哔哩哔哩一格 60 px**（`NOTCH = 0.5`，两条路径都乘；只对 `bilibili.com` 生效）；**倒车顶栏**「有挂车但游戏没给名字」时写「挂车已连接」（不再落回「未连接挂车」）；**红绿灯只认自己那盏**（右行优先、路口内粘住、横向 12 m / 锥体 28° / 路线 14 m，`choose` 纯函数 + 3 个用例）；**空间音效开关**按快照补丁写入「设置 › 声音」（`SoundSettings.spatial` + `PageMessage::Spatial` + 关掉时喇叭列表 `None` + 设置页开关 + 三语文案） | `crates/host/src/{webapp.js,traffic_lights.rs,settings.rs,lib.rs}`、`ui/src/shared/host.ts`、`ui/src/cabin/state/{store.ts,strings.ts,connectHost.test.ts}`、`ui/src/cabin/apps/settings/SettingsApp.tsx`、`ui/src/cabin/reverse/ReverseCamera.tsx` |
| 73 | **退出确认**：点桌面窗口右上角的 ×（Alt+F4、任务栏「关闭」也一样）先问一句「退出 WestPlay？」，「取消」/点弹窗外什么都不做，「退出」才真的退；页面 3 秒不应答（WebView2 崩、dist 坏）时照旧关，免得关不掉；卸载 / 更新安装这些有意的退出不弹 | `app/src/main.rs`（`Quitting` + `on_window_event` 的 `CloseRequested` + `quit_app`/`quit_shown`/`quit_hidden` + 3 s 看门狗）、`ui/src/companion/pages/QuitSheet.tsx`（新）、`Companion.tsx`、`pages/words/*.ts`（43 语言的 `quit`）、`preview.ts` |
| 74 | **地球键写「中/英/土」**：键面不再是地球图标，改成三个字、当前那个白另两个淡；顺序也改成 **中 → 英 → 土 → 中**（原先是英 → 中 → 土） | `ui/src/cabin/keyboard/{layouts.ts,Keyboard.tsx,keyboard.css}` 与四个测试 |
| 92 | **屏幕显示原版导航时不再出现两个虚拟后视镜的框**：模组原先在 GPS 的「screen on」组里加了 `park`/`near_mirror`/`far_mirror` 三个元素（层 99），它们是游戏自己画的 UI，WestPlay 关掉、页面变透明时照样骑在原版导航上；撤掉这三个元素（`LAYOUT` 5 → 6），页面删掉镜像控件与挖孔、设置里删掉「虚拟后视镜」，代价是仪表盘不再有镜面预览 | `crates/setup/src/game_mod.rs`、`ui/src/cabin/shell/Shell.tsx`、`ui/src/cabin/{dashboard/MirrorWidget.tsx,dashboard/mirrorHole.ts}`（删）、`ui/src/cabin/apps/settings/SettingsApp.tsx`、`ui/src/cabin/state/strings.ts` |
| 91 | **倒车影像要整屏真实画面：引擎只给乘用车画，撤回**：模组加了引擎的驻车摄像头元素 `park_1x1_ui.mat`，两次实测都只有占位图（`1x1 PARK`），按游戏自己的 `parking_cams` 键反而把镜子也变成占位图；结论是卡车没有相机源，页面把 `live` 布局收起（代码留着），默认回到「两种」手绘图，模组里那个元素挪到镜子下面留着给插件用 | `crates/setup/src/game_mod.rs`（`PARK_CAMERA`、`LAYOUT` 5）、`ui/src/cabin/reverse/{layout.ts,ReverseBar.tsx,ReverseOver.tsx,ReverseCamera.tsx,reverse.css}`、`ui/src/cabin/shell/Shell.tsx`、`ui/src/cabin/state/strings.ts` |
| 90 | **有导航点时不再弹「附近推荐」**：卡片原来只看「到了/收起」，现在再看 GPS 上还有没有导航点——有就不画，交付或路线清掉后自动回来 | `ui/src/cabin/dashboard/arrival.ts`（`hasDestination`）、`dashboard/ArrivalCard.tsx`、`dashboard/arrival.test.ts` |
| 89 | **显示设置里的「虚拟后视镜」开关 + 安装包自带一份 `.scs`**：镜子开/关不再只能靠游戏的 F2；新装的机器装完就有带镜面元素的模组（自带的只作垫底，游戏一关就按本机文件重做） | `ui/src/cabin/state/store.ts`、`apps/settings/SettingsApp.tsx`、`state/strings.ts`、`dashboard/MirrorWidget.tsx`、`assets/westplay.scs`、`app/src/setup.rs`、`crates/setup/src/game_mod.rs`、两个 `tauri*.json` |
| 88 | **后视镜只透出一角**：孔的矩形是从「被 `--ui-scale` 缩放过的」元素量的，而模组按页面自己的像素画 —— 现在槽位与孔都只用页面自己的像素（1280×720） | `dashboard/MirrorWidget.tsx`、`dashboard/mirror.ts`（`mirrorBox`/`holeInside`）、`shell/Shell.tsx`、`dashboard/dashboard.css` |
| 87 | **哔哩哔哩适配音量快捷键**：`hotkeyVolume` 加上 bilibili，与抖音同一条「按一下、按住 1.2 秒、不记不守」的路 | `crates/host/src/webapp.js`（`hotkeyVolume`） |
| 86 | **后视镜不显示（黑洞）**：模组 `westplay.scs` 没跟着程序更新重建；模组现在带 layout 版本，程序见版本旧就重做一次 | `crates/setup/src/game_mod.rs`（`LAYOUT`/`layout_current`）、`app/src/setup.rs`、`MirrorWidget.tsx`（日志探针） |
| 85 | **倒车压音量对哔哩哔哩无效**：新增「座舱自己的安静」通道，压下去、放手还原（不动站点自己的音量） | `crates/host/src/webapp.rs`（`DuckVolume`）、`webapp.js`（`duckVolume`）、`reverse/quiet.ts`、`apps/web/player.ts`、`musicWithGame.ts`、`shared/host.ts` |
| 84 | **仪表盘后视镜**（合并外部增量）：打转向灯时把游戏真实的左/右后视镜透出来 | `crates/setup/src/game_mod.rs`、`dashboard/mirror*.ts`、`MirrorWidget.tsx`、`Dashboard.tsx`、`dashboard.css`、`shell/Shell.tsx` |
| 83 | **抖音的音量快捷键**：卡片滑条仍然不给它，但玩家的音量键照样能调它——一次设定，不记不守 | `crates/host/src/webapp.js`（`hotkeyVolume`、`applyVolume`、`putVolume`） |
| 82 | **抖音的音量由它自己那条说了算**，首页卡片不再给它音量滑条（与 B 站同一套开关） | `crates/host/src/webapp.js`（`ownVolume`）、`ui/src/cabin/apps/web/webapp.ts`（`cabinVolumeFor`）、`webapp.test.ts` |
| 81 | **两个新小组件：相册展示、车辆状态**（车身：x% / 挂车：x%，不含轮胎）；相册从壁纸图库选图；顶部滚轮只留强制休息与剩余里程 | `ui/src/cabin/dashboard/{widgets,photo,Dashboard}.tsx`、`apps/settings/SettingsApp.tsx`、`state/store.ts`、`strings.ts`、`dashboard.css`、`RestTicker.tsx` |
| 80 | **酷狗的大歌词页**（歌词其实早到了，是仪表盘那个歌词按钮只认 QQ 音乐和网易云，酷狗没有按钮）、**换应用时输入法被带过来**（上一页的 `typing` 状态没清，新应用一挂载就升键盘；日志同毫秒可证）、页面每次加载完主动上报「没有焦点」（`7C320012…`） | `ui/src/cabin/dashboard/widgets.tsx`、`ui/src/cabin/apps/web/webapp.ts`、`crates/host/src/webapp.js` |
| 79 | **酷狗的大歌词页真的通了**（歌词只在换歌那一下读一次，酷狗晚一步才把词交出来，就再没重试过）、**输入法第二次修**（页面里随便一点也报焦点、站点在第一次点击后自己抢焦点两条漏路）、`lyricProbe` 日志（`D9655CEF…`） | `crates/host/src/webapp.js` |
| 78 | **酷狗音乐的大歌词页**、**开应用不再弹输入法**、**抖音/酷狗换成官方图标**、油量措辞改成「剩余里程」；断电暂停/上电续播核对下来是站点无关的（`D5DCC10F…` 之后 `C8E3D3AA…`） | `crates/host/src/webapp.js`、`ui/src/cabin/state/strings.ts`、`ui/public/icons/westplay/{kugou,douyin}.*.svg`、`ui/src/cabin/apps/web/pauseWithPower.test.ts` |
| 77 | **酷狗音乐接进车机的播放/歌词/切歌**、**抖音的封面与标题**、酷狗页面露出游戏画面的修、退出确认文案、滚动条去掉磨损并换油量说法、倒车视角改叫「后置视角/俯视视角」（`D5DCC10F…`） | `crates/host/src/{webapp.js,webapp.rs}`、`ui/src/cabin/dashboard/RestTicker.tsx`、`ui/src/cabin/state/strings.ts`、`ui/src/companion/pages/words/*.ts` |
| 76 | **两个增量包合入**（抖音槽位、酷狗音乐、到达推荐卡片、顶部滚动条、倒车 5 种视角，B 包的三件改成源码实现）、**安装包里的 dll 每次重打都核对**（`93536599…`） | `ui/src/cabin/{dashboard,reverse,state,apps}`、`crates/host/src/{webapp.rs,webapp.js}`、`ui/public/icons/westplay/{douyin,kugou}.*.svg` |
| 75 | **安装包里的插件 dll 就是这一版**（静默安装到临时目录核对过，装出来的是 `93536599…`）；**强制休息提示适配浅色模式**（浅色壁纸下那粒胶囊原来是白字压浅底，现在深字浅底，跟目的地胶囊一致） | `app/tauri.installer.conf.json`（资源映射，未改）、`ui/src/cabin/dashboard/map.css` |
| 71 | **把「模拟倒车影像」加回来**：§69 撤的是「游戏画面/相机」那一路，`ui/src/cabin/reverse/` 手绘的监视器（车尾视角/车顶视角、红黄绿辅助带、米格、扫描带、黄字）与 §45 的倒车压音量误删，这一轮全部恢复；画布加宽到 960×480 / 1000×580（保险杠不再被裁），逻辑与几何独立在 `reverse.ts` 便于测 | `ui/src/cabin/reverse/*`（新 6 个文件）、`ui/src/cabin/CabinApp.tsx`、`ui/src/cabin/state/strings.ts` |
| 41 | **壁纸设置页新增“明暗壁纸”**：浅色/深色各指定一张（`wallpapersByAppearance`、`setWallpaperFor`），与壁纸轮换互斥；轮换池去掉 WestPlay 自带的两张，只轮换玩家自己的壁纸；缺图有回退（`pickForAppearance`） | `ui/src/cabin/{wallpapers.ts,state/store.ts,state/hooks.ts,state/strings.ts,state/wallpaperRotation.ts,apps/settings/SettingsApp.tsx}` |
| 40 | **退回第一版倒车影像（撤回 §39）**：手绘车尾/车顶 + 红黄绿动态辅助线 + 黄字回来；地图俯视与 `topDownLiveMap` 删除；相机自动切换仍默认关；插件与桥接未动 | `ui/src/cabin/reverse/*`、`ui/src/cabin/maps/liveMap.ts` |
| 39 | **倒车屏幕 = 游戏地图正上方俯视（“按 3”那种构图）**：挂 R 时倒车页把实时地图切到正上方、正北朝上、卡车居中并跟车（`topDownLiveMap`），退出 R 自动还原；删掉透视路面与辅助线；相机自动切换恢复默认关 | `ui/src/cabin/reverse/*`、`ui/src/cabin/maps/liveMap.ts`、`crates/host/src/reversing.rs` |
| 38 | **挂 R 整屏切到游戏自己的视角**：相机键一次按下同时走三条路（扫描码 / 虚拟键+扫描码 / 窗口消息）；按了不算数，700 ms 内相机没动就再按（最多 3 次），三次都没动就明确放弃并写日志；`enabled` 默认开；§37 的“偷镜子”实测抓到的是**法线缓冲**，改为只勘察、不写屏 | `crates/host/src/keys.rs`、`reversing.rs`、`crates/plugin/src/{mirror.rs,screens.rs}` |
| 37 | **车机显示真实画面**：挂 R 时把游戏自己渲染的**左右后视镜**读回来、并排写进车机纹理——真像素，相机留在驾驶室（屏才被画）；认镜子的规则、dump 自证、只在 R 时每 80 ms 一次；切相机改为默认关；按键补扫描码（DirectInput 只认扫描码） | `crates/plugin/src/mirror.rs`（新）、`screens.rs`、`d3d.rs`、`telemetry.rs`、`crates/host/src/{reversing.rs,keys.rs}` |
| 36 | **挂 R 档真切游戏的相机**：挂车 → 顶部视角、没挂车 → 车外视角，退出 R 回驾驶室；用玩家自己 `controls.sii` 里的相机键、`SendInput` 送进去（只送前台的游戏窗口），挡位防抖 400 ms、冷却 900 ms，暂停/打字/已在车外都不动；`reversing.json` 可调；**倒车雷达做不了**（SDK 不给障碍物距离，§36.1） | `crates/host/src/keys.rs`（新）、`reversing.rs`（新）、`game_settings.rs`（读 `controls.sii`）、`lib.rs` |

**改之前先读** `PLAN.md` §4「关键不变量」——尤其「洞是遮罩出来的，网页盖在座舱页之上」这条，第 7 组问题的三个坑全由它引起。

---

## 1. 地图构建崩溃（原版自带，最严重）

> **2.1.2 起已废弃**：上游自己修好了（`archive.rs:473` 改成 `.max(64*1024).min(most - out.len())`，
> 注释里直接点名了这个 panic），并且改成了"坏 mod 只让那一份失败、其它照建"。
> 实测启动日志可见：`built without data_bus … corrupt archive: entry doesn't unpack to its size`，
> 地图照建 100%。**新版不要再打这条补丁。**

**症状**：引导页永远停在「正在准备你的地图…」，进不去游戏。

**日志**：

```
panic in thread westplay-maps: panicked at crates\mapdata\src\archive.rs:465:35:
min > max. min = 65536, max = 42304
```

**根因**：解压 SCS 归档条目时按剩余空间预分配缓冲区，用了 `clamp(min, max)`。当某个条目小到"剩余空间不足 64 KB"时，`min(65536) > max(42304)`，`clamp` 直接 panic，建图线程整个死掉。

**改法** `crates/mapdata/src/archive.rs:465`：

```rust
// 改前
out.reserve(out.len().clamp(64 * 1024, most - out.len()));
// 改后：预留量不超过剩余空间
out.reserve((64 * 1024).min(most - out.len()));
```

**验证**：`cargo test -p westplay-mapdata` → 159 个测试全过；实机三张地图建成（原版欧洲 61 s / TruckersMP 77 s / ProMods 107 s）。

---

## 2. Windows 上编译不过（大小写冲突）

**症状**：`error TS1149: File name 'WebApp.ts' differs from 'webapp.ts' only in casing`。

**根因**：服务器（Linux）上 `WebApp.tsx` 和 `webapp.ts` 是两个文件，Windows 文件系统不区分大小写，必然冲突。**在 Debian 上永远复现不出来。**

**改法**：`ui/src/cabin/apps/web/WebApp.tsx` → `WebAppScreen.tsx`，同步改 `AppScreen.tsx` 的 import。

---

## 3. 点击网页没反应（改造引入）

**症状**：三个站点里点链接无反应，尤其是 B 站视频封面、QQ 音乐「我的音乐」。

**排查过程**（日志打点确认，非猜测）：

- 鼠标事件确实送达：左键按下 `513`、抬起 `514`，坐标落在页面区域内
- `document.elementFromPoint` 确认命中的就是目标 `<a>`
- 页面侧 `navigator.userActivation.isActive === true`（是有效用户手势）、`defaultPrevented === false`（页面没拦）

**根因**：离屏 WebView2 里，合成点击**不会触发浏览器的默认跳转行为**——既不导航，也不发 `NewWindowRequested`。B 站链接是 `target="_blank"`，QQ 音乐那个链接**没有** `target` 属性，两种都一样死。

**改法** `crates/host/src/webapp.js`：页面没拦下的 http(s) 链接，直接在本页打开。页内锚点（`#`）和 `download` 链接放行。

```js
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button > 0) return
  const link = event.target?.closest?.('a[href]')
  if (!link) return
  const asked = link.getAttribute('href')
  if (!asked || asked.startsWith('#')) return   // 页内锚点，浏览器自己处理
  if (link.hasAttribute('download')) return
  const href = link.href
  if (typeof href !== 'string' || !/^https?:/i.test(href)) return
  event.preventDefault()
  location.assign(href)                          // 同一页面跳过去
})
```

**配套改动** `crates/host/src/pointer.rs`：

- 每次按下/抬起前先补一个 `MOVE`（WebView2 按光标最后到达的位置做命中判定）
- `LEAVE` 不再转发到站点（`COREWEBVIEW2_MOUSE_EVENT_KIND_LEAVE = 675`，在页面角落发出会被 WebView2 以 `E_INVALIDARG` 拒绝），改在移出时用夹取后的坐标单独发

---

## 4. 打包/构建的坑（不是代码缺陷，但会卡住人）

| 坑 | 现象 | 正确做法 |
|---|---|---|
| 用 `cargo build` 直接编 | 程序连 `localhost:5173`，报 `ERR_CONNECTION_REFUSED`（编成了 dev 模式，界面去连 Vite 开发服务器） | 必须走 `npx tauri build`，CLI 会注入构建期环境变量 |
| `westplay.dll` 不存在 | `resource path ..\target\release\westplay.dll doesn't exist` | 先编游戏插件：`cargo build --release -p westplay-plugin`（`crates/plugin` 是 `cdylib`，输出名 `westplay`） |
| `createUpdaterArtifacts: true` | 打包要求更新签名私钥 | 用 `app/tauri.local.conf.json` 关掉 |
| NSIS 打包工具下载 | GitHub 超时，且 Tauri 校验缓存的 NSIS 目录"缺文件" | 放弃安装器，直接免安装：`exe + westplay.dll + ui/` 放同目录即可 |

**最终构建命令**：

```powershell
cargo build --release -p westplay-plugin
npx tauri build --config app/tauri.local.conf.json --no-bundle
# 产物：target/release/westplay.exe（约 21.4 MB）
```

装到 `D:\WestPlay\` 需要三个东西：`westplay.exe`、`westplay.dll`、`ui/`（`ui/dist` 的内容）。

---

## 验证汇总

- `cargo check --workspace` → 0 错误
- `cargo test -p westplay-mapdata` → 159 通过
- `cargo test -p westplay-host` → 164 通过
- `tsc -b` → 0 错误；`vitest run` → 418 通过
- 实机：三张地图建成、三个站点加载、B 站视频可打开、QQ 音乐「我的音乐」可打开、网易云正常

## 日志位置

`文档\WestPlay\logs\app.log`（每次启动重写）。排查点击/导航问题看 `webapp:` 开头的行。

---

## 5. 应用布局调整：恢复 Apple Music

改造时三个位置被占用（`music`→QQ音乐、`spotify`→网易云、`youtube`→B站），原版的 YouTube Music（`youtubeMusic`）一直空着没用。后来要求：**Apple Music 保留，QQ 音乐挪去顶掉 YouTube Music**。

最终布局：

| 位置（app id） | 应用 |
|---|---|
| `music` | Apple Music（原版代码，未改动） |
| `spotify` | 网易云音乐 |
| `youtube` | 哔哩哔哩 |
| `youtubeMusic` | QQ 音乐 |

纯界面改动，**宿主 Rust 代码一行没动**（`apple_music.rs` 一直完好，`start_apple_music` 等全在）：

1. `ui/src/cabin/apps/AppScreen.tsx`
   - `case 'music'` → `<MusicApp />`（原本是 `<WebApp site="qqMusic" />`）
   - `case 'youtubeMusic'` → `<WebApp site="qqMusic" />`（原本是 `<YouTubeMusicApp />`）
2. `ui/src/shared/icons.ts` —— 图标按"位置"绑定，所以映射跟着换：
   - `music: 'music'`（原 `'qq-music'`）、`youtubeMusic: 'qq-music'`（原 `'youtube-music'`）
   - 图标文件 `music.dark.svg` / `music.light.svg` 从原版拷回
3. `ui/src/cabin/state/strings.ts` —— 三种语言（en/zh/tr）各改两行：`music: 'Apple Music'`、`youtubeMusic: 'QQ 音乐'`
4. `ui/src/shared/icons.test.ts` —— 断言跟着更新

**Home 主屏顺序**（`ui/src/cabin/state/apps.ts` 的 `APP_IDS`）：

```
地图 · QQ 音乐 · 网易云 · Apple Music · 哔哩哔哩 · 天气 · 设置
```

`Home.tsx` 用 `pagesOf(RELEASED_APP_IDS, …)` 分页，所以改 `APP_IDS` 一处即生效；`apps.test.ts` 里有一条断言锁定了这个顺序，一并更新。

> 侧边栏竖排那列是「最近使用」（`state/store.ts` 的 `navigation.recents`），按点开的先后自动变，不是固定顺序。

验证：`tsc -b` 0 错误、418 个测试全过；构建产物 `demo-*.js`（共享分块）里确认数组已是新顺序。

验证：`tsc -b` 0 错误、418 个测试全过；实机启动日志出现 `[apple music] opened` 和 `[apple music] page loaded (music.apple.com)`；构建产物 `demo-*.js`（共享分块）里确认数组已是新顺序。

> 注意：`MusicApp` 是 Apple Music 原生播放器（扫码/账号登录由原版 `apple_music.rs` 处理），需要登录 Apple ID 才能放歌。

---

## 6. 主页媒体控件接入 QQ 音乐 / 网易云

目标：主页 Now Playing 控件显示**封面、歌名、歌词**，并能**播放/暂停、上一首、下一首**，与网页双向联动。

### 数据链路

```
页面 (webapp.js)  --postMessage-->  host (webapp.rs)  --emit-->  UI store  -->  Now Playing 控件
                                                                                    |
                         页面 (webapp.js)  <--post_json--  host  <--command--  UI 控件按键
```

- `crates/host/src/webapp.js` —— 注入到每个站点页面的脚本（document-start 运行，早于页面自己的脚本）
- `crates/host/src/webapp.rs` —— `Media` 结构（`title/artist/artwork/playing/lyric`）、`Report::Media`、`media_message()`、`Command::{PlayPause, Next, Previous}`
- `ui/src/shared/host.ts` —— `WebAppMedia`、`WebAppCommand`
- `ui/src/cabin/apps/web/webapp.ts` → `state/store.ts` —— 收到的媒体信息进 store
- `ui/src/cabin/dashboard/useNowPlaying.ts` —— `useWebAppSource()`，`NOW_PLAYING_ORDER` 里 `webApp` 排第二（仅次于视频）
- `ui/src/cabin/dashboard/widgets.tsx` —— `WebAppWidget`，第二行显示 `lyric ?? artist`

### 两个站点的真实差异（都是踩出来的）

| | 网易云 | QQ 音乐 |
|---|---|---|
| MediaSession | 有（歌名/歌手/封面直接读） | **没有** |
| 音频元素 | 在页面里 | **不在主文档**（`heard 0`、`page 0`） |
| 播放位置 | 元素 `currentTime` | `.player_music__time`（"00:39 / 03:43"） |
| 播放状态 | 元素 `paused` | **播放按钮文字**（暂停⇄播放），时钟兜底 |
| 歌词 | `weapi` 加密 → 改走站内搜索 + `/api/song/lyric` | JSONP `c.y.qq.com/.../fcg_query_lyric_new.fcg`（mid 来自 `a[href*="/songDetail/"]`） |

关键点：

1. **音频元素可能不在 DOM 里**。`new Audio()` 建的游离元素 `querySelectorAll('audio,video')` 永远查不到，所以启动时劫持 `HTMLMediaElement.prototype.play` 登记（`heard`）。
2. **QQ 音乐没有可操作的元素**，所以播放/暂停/上下曲一律**点它自己的按钮**——这样它自己的播放器和界面都会同步。
3. 按钮靠**文字**定位（`title`/`aria-label`，没有就取 `<a>` 自己的文字），锚定开头 + 排除 `播放模式/随机/展开播放条/列表…`。改版换了 class 也不影响。
4. 点击后判断"有没有生效"看**按钮文字变化**（`暂停`→`播放`），不看播放状态——QQ 音乐的状态要等时钟停下才确认，用状态判断会误以为没点动而**补点一次**，正好把暂停取消（表现为"暂停 0.几秒又自己播"）。
5. 点击策略：先 `click()`；1.2 秒无变化再派发完整按下序列（`pointerdown → mousedown → pointerup → mouseup → click`）。

### 留下的排错探针

`webapp.js` 会把这几类行写进日志（`webapp: xxxProbe:`），拿到日志就能照着重写选择器，不用猜：

| 探针 | 内容 |
|---|---|
| `lyricProbe` | 歌词请求结果（几行 / 原始内容） |
| `apiProbe` | 抓到的歌曲信息 JSON |
| `domProbe` | 播放页元素（class、文字、时钟、heard 数） |
| `pressProbe` | 实际点了哪个元素 |
| `buttonProbe` | 点了没生效时，播放条里真实有哪些按钮 |

都是有上限的（`buttonProbe` 每次按键最多一条、`domProbe` 最多 3 条），平时不影响性能，留着排查。

### 验证

`tsc -b` 0 错误、UI 419 个测试全过、`cargo check -p westplay-host` 干净；实机两个站点封面/歌名/歌词/三个按键均正常。

---

## 7. 网页应用接入座舱屏幕键盘

三个站点（QQ 音乐 / 网易云 / B站）的输入框，用鼠标点中后座舱键盘不弹出；弹出后又被网页盖住；盖住的问题解决后，键盘上的字又打不进网页。是三个独立原因叠在一起。

### 7.1 链路根本没接（键盘不出）

宿主其实**一直知道**页面里有没有输入框获得焦点（`Report::Typing`），但只把这个信息用于一件事：决定要不要把游戏键盘的按键转发进网页。**从来没告诉座舱界面**，所以屏幕键盘（只认座舱自己画的输入框）不知道要弹出来。

补上的链路：

```
页面输入框获得焦点 → webapp.js 上报（typing + 当前文字）
  → 宿主 lib.rs → 新增 webapp::typing_message() → UI `webAppTyping`
  → apps/web/webapp.ts 的 typing/text/selection
  → WebAppScreen.tsx 在 typing && selection !== 0 时 attach(webAppField)
  → 键盘升起；字段失焦 / 换字段 / 关应用时 detach
```

`selection` 是宿主每次"输入框获得焦点"时递增的序号（点同一个框也算新的一次），所以**再点一次输入框，键盘会重新升起**。

### 7.2 键盘被遮罩吃掉（键盘在网页下面）

座舱页为了让 WebView 透出来，用 `holeMask`（`mask-composite: exclude`）在 `hole` 矩形上打了个洞——**落在洞里的座舱内容会被整块抹掉**，露出下面的 WebView。键盘正好升在洞的范围内，于是被一起抹掉。

改法：`WebAppScreen.tsx` 的 `place()` 里量键盘高度（`.keyboard.shown`），`hole.height` 与 WebView 的显示矩形同步减掉这块；再用 `useKeyboard.subscribe(place)` 在键盘升降时重算（80/200/340/520 ms，跟着它的滑入动画）。

代价：打字时网页下半部分被裁掉（和 iOS 弹键盘一致），搜索框一般在顶部，不受影响。

### 7.3 字打不进网页（焦点丢了）

站点在文字变化后会**重画输入框**，新节点没有焦点，`document.activeElement` 变成 `body`，写入全部落空。

改法：`webapp.js` 记住最后聚焦过的输入框（`lastField`），写入前发现焦点已经丢了就先 `focus()` 再写。

### 写入方式

- **整段文字覆盖写入**（`setText` 指令），不是逐字符模拟——站点自己的输入框（光标、联想、搜索历史）都按原样工作
- 游戏键盘仍然**直接**打进网页（原有行为未变），座舱键盘只负责点亮按键：`Typing.playerTypes = false`，避免重复输入
- 页面有焦点时，座舱键盘的 `selection` **不再写进**宿主的 input 槽（否则会把游戏键盘打断）。见 `lib.rs` 的 `PageMessage::Typing` 分支

### 7.4 回车搜索（QQ音乐 / 网易云 搜不了，B站能）

B站用 `e.key === 'Enter'` 判断，QQ音乐和网易云的老代码读 `e.keyCode === 13`。合成事件的 `keyCode` 只读且默认 **0**，所以两家都当没按。

- 补旧属性：`keyCode` / `which` / `charCode` 按真实按键设（Enter=13、Esc=27、Backspace=8），Enter 额外补一次 `keypress`（老式搜索框挂的是这个）
- 兜底：按 Enter 后 800ms，若页面地址没变（说明没反应），在输入框附近找 `搜索 / 搜一下 / Search` 的按钮点它
- 按 Enter 前先把输入框重新聚焦（站点重画后焦点可能是空的，Enter 会落到 `body`）
- 游戏键盘的回车与屏幕键盘的回车走同一条路（`submit()`）

### 7.5 一个自己挖的坑（记下来）

`WebApp::command` 的 `match` 第一条是 `Open | Close => Ok(())`（这两个由调用方处理）。新加的 `SetText` / `Enter` 一开始被写进了这条表达式，于是**指令到达宿主、JSON 解析成功、命中第一条分支、静默丢弃**——真正的处理分支在下面，永远走不到。匹配是按顺序的，第一条赢。

排查方式：先用临时单测确认 `serde_json` 解析没问题（`{"type":"webApp","command":{"action":"setText","text":"ab"}}` 能解析成 `WebApp { command: SetText }`），再把范围缩到分支顺序上。

### 验证

`tsc -b` 0 错误、UI 419 测试全过、`cargo check -p westplay-host` + `cargo test -p westplay-host`（165 通过）干净；实机验证：

- 三个站点点输入框 → 键盘升起、在网页之上、打字正常
- QQ音乐 / 网易云 / B站 回车都能搜索
- 键盘收起后网页恢复满高

日志里保留的探针（都有上限，平时不刷屏）：`lyricProbe` / `domProbe`（前 3 条）/ `apiProbe` / `buttonProbe` / `pressProbe` / `textProbe`（前 8 条）/ `submitProbe`（回车没生效时才写）。

---

## 8. 拖动音量条/进度条 → 宿主线程死锁，屏幕消失（原版自带）

### 8.1 现象

QQ 音乐里拖动音量条，画面卡住，游戏里挂载的屏幕直接消失（不再送帧）。关掉重开才能恢复。**原版 2.1.2 同样触发**，不是改造引入的。

### 8.2 现场证据（进程还活着，只是不干活）

| 观察 | 值 |
|---|---|
| 卡住的线程 | 与启动日志 `host: started` 同一时刻创建的那个线程——宿主主循环线程（App 的 UI 线程另有其人，仍正常） |
| 线程状态 | `Running`，3 秒吃掉 3.0 秒 CPU（**占满一个核**） |
| 指令指针 | 25 次采样全部 `win32u.dll+0x1304`（`PeekMessageW` 的系统调用桩） |
| 栈上调用者 | `user32!PeekMessageW`，再往上还有 `ole32` 的帧（OLE 模态循环区域） |
| 栈上有无 `westplay.exe` 返回地址 | 前 4 KB 一条都没有 → 循环不是从我们代码的近处进去的 |
| 日志 | 停在卡住那一刻，之后连每分钟一条的 performance 行都没有 |

### 8.3 根因：两层，先后命中

**第一层（我们自己的消息泵无界）**：`crates/host/src/lib.rs::pump_messages`

```rust
while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() { … }   // 队列不空就永不退出
```

拖动时页面重绘消息把队列填得比排空快，该循环出不来 → 主循环停摆、不送帧。上游原版一模一样。

**第二层（真正把线程锁死的是 WebView2 的拖放）**：拖动被当作桌面拖放，WebView2 在**我们这个线程**上跑 OLE 模态循环（`ole32`）——它抽消息直到拖动结束，而「松开鼠标」正是被它堵住的这个线程发的 → 死锁，CPU 100%，帧停，屏幕消失。这一层用消息泵上限挡不住，因为循环在 OLE 内部。

### 8.4 改法

1. `crates/host/src/lib.rs::pump_messages`：一轮最多 **64 条消息 / 4 ms**，然后一定交还主循环；触发上限时写一条限流日志（每 2000 次才写一次）：
   `messages: the queue filled faster than it could be drained (…)`
2. `crates/host/src/webview.rs`（`OffscreenWebView::new`，`SetBounds` 之后）：`ICoreWebView2Controller4::SetAllowExternalDrop(false)`——页面内的拖动不再变成桌面拖放，OLE 循环根本不会起来。
3. `crates/host/src/webapp.js`：注入脚本里 `dragstart / drag / dragend / drop` 一律 `preventDefault`（第二层保险）。

两者都不影响正常使用：滑块走的是指针事件，拖动照旧，只是「拖到别处去」这条路被堵死。

### 8.5 验证

实机拖动 QQ 音乐音量条、进度条：不卡、屏幕不消失；连续运行 55 分钟日志正常（181 行，帧率正常输出 `26 frames a second`），只有启动时一条限流行（`2 taken, 17 ms`），属预期。

> 向上游提 issue 时给这三个文件的三处改动即可；`cargo test -p westplay-host` 与 UI 测试均不受影响。

---

## 9. 站点页面的显示适配（右侧被切 / 打开时跳变 / 全屏不铺满）

三件事同一个来源：站点页面是按桌面屏幕写的，而座舱里给它的洞只有 **1012 px 宽**，且这个洞在座舱页上是「挖」出来的，页面自己没法平移。

### 9.1 右侧被切（三个站点都有）

**症状**：QQ 音乐底部播放栏右端的音量条只露出一半；B站、网易云同样右边少一截；用鼠标左右拖页面没有任何反应（桌面网页的拖动是就地选字，不是平移）。

**根因**：页面排版宽度大于洞的宽度。日志实测：`the page lays out 1100 px wide in 1012 px`。

**改法**（`crates/host/src/webapp.js` + `crates/host/src/webapp.rs`）：

- 注入脚本定期/在关键时机把「可用宽度 / 排版宽度」报给宿主（`post({ room: { seen, needed } })`；`innerWidth` 与 `scrollWidth` 取大者）
- 宿主 `WebApp::fit_width` 按比值缩放：`zoom = 当前zoom × seen/needed`，**只缩不放**、3% 死区（半个滚动条不算溢出）、下限 0.55
- 换页 / 回主页 / 刷新时 `zoom_back()` 恢复 1.0 再重新适配
- 缩放生效时写日志：`webapp: the page lays out 1100 px wide in 1012 px, so its pixels are 0.92 the frame's`

缩放后页面拿到更多 CSS 宽度（1012 / 0.92 ≈ 1100），右端那一截就回来了；代价是字略小（本例约 8%）。

### 9.2 打开时「突然缩一下」

**根因**：适配发生在页面显示之后（首个越界报告要等页面排版完成）。

**改法**：`WebApp` 增加 `wanted` / `fitted` / `waiting` 三个状态，`reveal()` 只在「App 要显示 **且** 页面已报过自己的宽度」时才 `show(true)`；脚本侧把上报时机提前到 `resize` / `DOMContentLoaded` / `load`（含 200/600/1200 ms 补报）。另有 `FITTING = 1.5 s` 兜底：页面始终不报（浏览器自己的错误页等）就照原样显示，不会一直黑着。

### 9.3 B站视频全屏不铺满整个插件区域

**症状**：全屏后视频仍只在原来那块框里（或只在页面内放大），不占满座舱屏幕。

**改法**：页面 `fullscreenchange` → 上报 `{ fullScreen }` → 宿主 `State::full_screen` 变化时推一条 `State` 消息 → 座舱页给 App 加 `.full-screen`：`position: absolute; inset: 0; z-index: 3`、隐藏顶部条、网页块圆角归零。尺寸一变，`followArea` 的 `ResizeObserver` 自动重算洞并 `Show` 新矩形，宿主把 WebView 摆到整个 CarPlay 区。退出全屏反向还原。侧边栏与卡车原厂条保留（与座舱里 YouTube 播放器全屏一致）。

### 9.4 验证

`tsc -b` 0 错误、UI 测试 440 全过、`cargo test -p westplay-host --lib webapp` 5 个全过；实机：三个站点右侧完整、打开无跳变、B站全屏铺满且能退回（机主 2026-10-27 确认）。

> 缩放是「按宽度自适应」，**不处理高度**：页面比洞高时仍靠滚动（滚轮已转发给页面，`pointer.rs`）。刻意如此——把长页面（如 B站首页）缩到整页可见会缩到看不清。

---

## 10. 启动时的卡车品牌 logo 不见了（构建漏了资源文件）

### 10.1 现象

电动打火那一刻的启动画面（`splash`，2.4 秒）上，本该是卡车品牌的 logo，现在只剩品牌名的文字（Scania 的狮鹫图案没了）。

### 10.2 根因

品牌 logo 是各家车厂的商标，上游**故意把它们放在 git 仓库之外**——`ui/src/cabin/boot/BootScreen.tsx` 的注释写明「`public/brand-logos` 是 git-ignored」。官方发布包里带着这 7 个文件；我们**从源码构建**出来的 `ui/dist` 里一个都没有，于是 `BrandSplash` 的四级回退（`.color.svg` → `.color.png` → `.svg` → `.png`）全部 404，落到最后的 `boot-brand-wordmark`（品牌名文字）。

也就是说：这不是代码缺陷，是**源码树缺资源**，任何人用源码重打包都会遇到。

### 10.3 改法

从官方安装里取回这 7 个文件（本机取自 `D:\WestPlay-backup-20261026\ui\brand-logos`），放进两处：

- 源码树 `ui/public/brand-logos/`（Vite 会把 `public/` 原样拷进 `dist/`，安装包才有）
- 已装目录 `D:\WestPlay\ui\brand-logos/`（立即生效，不用重装）

文件清单：`daf.svg`、`daf-logo.svg`、`iveco.svg`、`renault.png`、`scania.svg`、`scania.color.svg`、`volvo.svg`。
命名规则：`<品牌id>.color.svg|png` 保留原色（Scania 的狮鹫要彩色），`<品牌id>.svg|png` 按白色剪影绘制。

### 10.4 验证与注意

`ui/dist/brand-logos` 7 个文件、安装目录 7 个、安装包 9.16 MB（比原来大 70 KB，就是这些 logo）。

**启动画面只在“断电 → 上电”时出现**（`ui/src/cabin/state/power.ts`）：WestPlay 在电动已经打开时才启动（半路开 App）会跳过 `splash`，直接走 `connecting` → `on`。要看到 logo，得先关电门再开。另外 `man` / `mercedes` / `setra` 这三家官方也没给文件，仍显示品牌名文字，属正常。

---

## 11. B站视频不上报播放信息（Now Playing 空白、切视频不更新）

### 11.1 症状

打开 B站视频后，主页 Now Playing 一直没有内容；在 B站 里点另一个视频，也不会变。日志能直接看出来：网易云有 `[netease] playing: …`，**B站 一条 `[bilibili] playing:` 都没有**（连 `nothing playing` 都没有，说明页面根本没发过媒体消息）。

### 11.2 根因

`webapp.js` 的媒体收集只有两条路：

1. **Media Session**：`navigator.mediaSession.metadata`（QQ音乐/网易云/蜻蜓FM 都不靠它）；
2. **各站点自己的 DOM 解析**：`qqMusic()`、`qingting()`、网易云的歌词接口。

**B站 两条都没有**：它的播放器在这个 WebView 里不设 Media Session，而当初也没给它写 DOM 解析。于是 `media = null`，Now Playing 空着。

### 11.3 改法（`crates/host/src/webapp.js` 新增 `bilibili()`）

| 信息 | 来源（按顺序回退） |
|---|---|
| 标题 | `h1.video-title` 的 `title` 属性 → 它的文字 → `document.title` 去掉 `_哔哩哔哩_bilibili` / ` - 哔哩哔哩` |
| UP 主 | `.up-name` / `.up-info-container .up-name` 的文字 → `meta[name="author"]` |
| 封面 | `meta[property="og:image"]`（`//i0.hdslb.com/…` 用 `new URL(src, location.href)` 补成 `https:`）→ `.bpx-player-video-poster` 的 `background-image` |
| 播放状态/进度 | `<video>` 元素自己的 `paused` / `ended` / `currentTime`（`say()` 里 `player()` 取的就是它） |

两处关键设计：

- **对 B站 优先用页面数据、不用 Media Session**：B站 是单页应用，切视频只换地址和标题、不换文档，Media Session 那边会是旧的。`say()` 里写成 `if (bili === null && metadata && …)`，页面数据在时一律走页面。
- **不上报误报**：页面里没有 `<video>`、且地址不在 `/video/` 或 `/bangumi/` 下（B站 首页、搜索页）时返回 `null`，Now Playing 保持原样，不被站点名占住。

另加诊断探针 `biliProbe`（最多 5 行，每次“标题或 UP 主变了”才写一次），宿主侧把它加进 `webapp.rs` 的探针键表，日志里形如：

```
webapp: biliProbe: #1 title="【4K】…" up="某某UP主" cover=yes video=playing:12
```

以后再失效（B站 改版），先看这行就知道是标题没了、UP 主没了，还是 `<video>` 没找到。

### 11.4 验证

实机 2026-10-27：打开 B站视频 → Now Playing 出现封面、标题、UP 主；不刷新页面切到另一个视频 → 立刻更新；暂停 → 控件跟着变；只逛首页 → Now Playing 不被占。`npx vitest run src/hostScripts.test.ts` 仍 6 passed（注入脚本能编译）。

---

## 12. 上游 2.1.2 → 2.1.3 的升级合并（2026-10-28）

### 12.1 规模

| 项 | 数量 |
|---|---|
| 上游 2.1.2 → 2.1.3 改/增 | 100 个文件 |
| 上游删除 | 2 个：`assets/tablet/tablet.dds`（换成 `ipad.dds`/`ipad.pmg`）、`ui/src/cabin/apps/youtubeMusic/more.ts` |
| 我们的改动 | 62 个文件 |
| **双方都碰过（要人工合）** | **9 个** |

9 个冲突文件：`crates/host/src/lib.rs`、`performance.rs`、`pointer.rs`、`webview.rs`、`ui/src/cabin/shell/Shell.tsx`、`ui/src/cabin/state/store.ts`、`ui/src/companion/preview.ts`、`ui/src/shared/host.ts`、`ui/package-lock.json`。

其余：**仅上游改的 91 个直接取 2.1.3**；**仅我们改的 53 个保留我们的**（含 `webapp.rs`/`webapp.js` —— 上游这次没动它们，所以蜻蜓FM/B站/QQ音乐/网易云那一整套完全没冲突）。

### 12.2 怎么合的（没有 git 的机器上）

这台机器没有 git，所以用 Python 的 `difflib` 自己做三方合并（脚本思路：以 2.1.2 为 base，把「我们」和「2.1.3」的 hunk 都套上去；两边改到同一段就报冲突）。结果只有 **2 处真冲突**，都很好解：

**① `pointer.rs`** —— 双方都改 `update` 的签名：

```rust
// 2.1.3：返回 Mouse 给光标绘制用
pub fn update(&mut self, block: &PointerBlock, webview: &OffscreenWebView) -> Mouse
// 我们：多一个 over 参数，把鼠标转发进站点页面
pub fn update(&mut self, block, webview, over: Option<(&OffscreenWebView, (f32, f32, u32, u32))>)
// 合并后：两个都要
pub fn update(&mut self, block, webview, over: Option<…>) -> Mouse
```

**② `lib.rs`** —— 调用点合并：

```rust
let over = webapp.as_ref().and_then(|app| app.place().map(|area| (app.view(), area)));
let mouse = pointer.update(&bridge.bridge().plugin.pointer, &webview, over);
cursor.follow(mouse, Instant::now());
```

其余 7 个冲突都是「各加各的」：`Shell.tsx`（我们加 webapp 的洞，上游加 `--edge` 边距）、`store.ts`（我们加 webApp 三种消息，上游加 `cursorByHost`）、`preview.ts`（我们换三家图标，上游加 `otherApps`）、`host.ts`（我们加 webapp 消息类型，上游加 cursor 消息和 `more` 字段）、`performance.rs`（我们加 `Profile::WebApp` 与站点命名，上游重写 10 秒上报）—— 三方合并没有冲突。`package-lock.json` 直接取上游的，然后 `npm ci`。

### 12.3 验证

| 项 | 结果 |
|---|---|
| `cargo check --workspace --all-targets` | 0 error |
| `cargo test -p westplay-host --lib` | **199 passed**（2.1.3 自带 199 个，含我们的站点命名测试） |
| `tsc -b` | 0 error |
| `vitest run` | **447 passed**（64 文件；2.1.3 新增了它的测试，我们的 webapp/本地化测试也在） |
| 构建 | exe 24,040,960 B（版本 2.1.3）、插件 550,912 B、安装包 9.33 MiB |

**实机验证（2026-10-28，用户确认「全都没问题」）**：新平板外观与位置、圆角统一、页面完整不被切、缩放不跳、全屏正常、拖音量条不卡、座舱键盘输入、B站 媒体控件、蜻蜓FM Now Playing、光标跟手 —— 全部正常。

### 12.4 部署与两个坑

- `ui/dist` 里有 **69** 个文件（2.1.3 加了新资源），`brand-logos` 7 个、蜻蜓FM 图标 2 个 —— 都跟着走。
- **插件 dll 不会自己更新**：这次是外部部署（没走 App 的 Setup 流程），所以 `westplay.dll` 要手动复制进 `E:\SteamLibrary\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins`。装完哈希核对一致（550,912 B）。
- `Documents\WestPlay\westplay.scs`（游戏内平板模型/屏幕布局的那个 mod）**由 App 启动时自动重建**：这次 09:44:37 重建过，不用管；只有把 dll 换掉又没开过 App 时才需要先开一次 App。
- 2.1.3 的专项修复里，**YouTube / Spotify 那几条对我们无效**（那两个槽已经是 B站 / 网易云），但公共层（光标、帧率、圆角、10 秒日志）全都吃到了。

---

## 13. 空间音频接到网页站点（B站 能，网易云一放歌就没声）

### 13.1 起因

用户要求“给咱加的几个 app 适配原生的空间音频”。原生四个播放器早就走 `cab_sound.js`（每辆车的喇叭位置、
分频、电平、延时 + HRTF + 镜头出车外变闷 + 均衡器），网页站点没有。

### 13.2 做法

- `webapp.rs`：照搬 `spotify.rs` 的 `cab()`——每帧把 `Speakers` / `Head` / `Outside` / `Equalizer` / `Spectrum`
  五条消息发给站点页面，`Told` 记住最后一条，页面重载（`{ready:true}`）时重发。启动脚本改成
  `concat!(include_str!("cab_sound.js"), "\n", include_str!("webapp.js"))`。
- `lib.rs`：每帧 `player.cab(truck_speakers, head, outside, distance, equalizer, spectrum)`；`Report::Spectrum`
  转给座舱均衡器的频谱图。
- `webapp.js`：`window.westplayCabSound(() => speakable(player()), post)`，每 350ms `cab.tick()`（站点换歌
  换元素时自动跟上）。

### 13.3 坑：网易云一放歌就没声音

第一次实机（2026-10-28 20:47）网易云有进度、有歌名、**没声音**。日志：

```
webapp: mediaProbe: music.163.com src= xo=none keys=false speakable=true
```

`src=` 是空的——判断函数把「地址还没挂上」的元素也交了出去。`createMediaElementSource` **不可逆**：
元素之后挂上跨域、无 CORS 的 mp3，浏览器就只给静音。页面自己的 UI 一切正常，所以看起来像“站点自己的问题”。

### 13.4 修法

```js
if (!src || element.readyState < 2) return null      // 地址空 / 还没加载到数据：不接
if (src.startsWith('blob:') || element.crossOrigin) return element
if (new URL(src, location.href).origin === location.origin) return element
return null                                           // 别的站点的普通文件：宁可不接
```

### 13.5 验证（2026-10-28 实机）

| 站点 | `mediaProbe` | 结果 |
|---|---|---|
| 哔哩哔哩 | `src=blob:… xo=anonymous speakable=true` | **空间音频生效**（有方位、镜头拉远变闷） |
| 网易云 | `src= speakable=false` | 不接管，**放歌正常** |
| 蜻蜓FM | `src=https://lhttp-hw.qtfm.cn/…64k.mp3 speakable=false` | 原声，无空间感 |
| QQ音乐 | 无探针行（元素在另一个文档） | 原声，无空间感 |

结论：只有 B站 的流是浏览器允许接进音频图的（MSE）。其余三个要上空间音频，得站点自己配合（CORS、
把媒体元素放在本页、或不用页面自己的 Web Audio），否则只能保持原声。

### 13.6 网易云的流：试过，接管不了（2026-10-28 实机）

诊断显示网易云的播放元素 `so=MediaStream`（`srcObject` 是一条流，没有地址、没有 DRM、不在 iframe 里），
看起来有戏。三次尝试：

1. **先测后接**（临时 AudioContext 量 0.4 s 的 RMS）→ 永远测到 0。原因是「一条流被元素占着时，
   再接一个 analyser 拿不到数据」，测法本身不成立，不是没声音。
2. **直接接**（`createMediaStreamSource(element.srcObject)` + `cab_sound.js` 支持流）→ 声音正常，
   **但没有空间感**。
3. 结论：那个带流的元素是**配角**（网易云真正的发声在它自己的 `AudioContext` → destination，
   元素只是给 MediaSystem/歌词用的），接管它等于空转。**一个页面自己的 Web Audio 图，外部没有任何办法接管**
   ——只能听站点自己的，所以网易云到此为止。

已把流的接管整段撤掉（`webapp.js` 的 `speakable` 流分支、`cab_sound.js` 的 `MediaStream` 支持、看门狗），
回到「B站 有空间音频、其余原声」的稳定状态。探针行保留（以后再遇到新站点，直接看 `mediaProbe` 就知道
能不能接：`src=` 的协议、`xo=`、`so=`、`frames=`、`media=`、`cors=`）。

---

## 14. 上游 2.1.3 → 2.1.4（2026-10-28，同一天）

### 14.1 规模

| 类 | 数 | 处理 |
|---|---|---|
| 上游新增文件 | 1（`crates/host/src/consent.js`） | 直接拷（`youtube.rs`/`youtube_music.rs` 的 `include_str!` 要用） |
| 上游改动文件 | 70 | 其中 63 个只有上游动 → 直接取新版 |
| 我们改动文件 | 66 | 其中 59 个只有我们动 → 保留 |
| **两边都改** | **7** | `lib.rs`、`ui/package-lock.json`、`cabin/dashboard/widgets.tsx`、`cabin/state/store.ts`、`cabin/state/strings.ts`、`companion/preview.ts`、`shared/host.ts` |

`ui/package-lock.json` 按老规矩直接取上游的，然后 `npm ci`。

### 14.2 怎么合的

把 `merge3.py` 复制成 `merge14.py`，只改三棵树和文件清单（base=`D:\wp13\src` 上游 2.1.3、ours=`D:\wpq13\src`、theirs=`D:\wp14\src`），输出到 `D:\wpq13\merged14`，人工看完再拷回去。

**7 个里只出了 1 个真冲突。**

### 14.3 真冲突：`widgets.tsx`（同一位置各插各的）

- 我们：在 `MusicWidget` 前插了 `WebAppWidget`（网页站点的播放控件）
- 上游：在同一个位置插了 `WIDGET_BACKDROPS`（2.1.4 的"浅色封面用深色字"配色表）
- 解法：**两个都留**，顺序 `WebAppWidget` → `WIDGET_BACKDROPS`。`MusicWidget` 内部用 `useWordsOver(cover, look, WIDGET_BACKDROPS)`，我们的控件调 `MusicWidget`，自动跟着享受对比色，不用单独改。

### 14.4 合并后 tsc 抓到一个类型错误（必看）

```
src/cabin/state/strings.ts(1005,5): error TS2741: Property 'elevated' is missing ...
```

上游 2.1.4 在 `destinations` 里加了 `elevated`（"游戏以管理员身份运行"那条提示），英文和土耳其语上游自带，**中文块我们自己维护，缺这个键**。补：

```ts
noAnswer: '游戏没有响应',
elevated: '游戏以管理员身份运行，WestPlay 看不到路线。请正常启动游戏',
unsupported: '暂不支持这个版本的游戏',
```

**教训**：以后每次跟上游升级，`tsc -b` 是必跑的第一道关——上游往字符串类型里加键，只有中文块会漏，编译器直接点名。

### 14.5 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **456 / 456** 通过（65 个测试文件） |
| `cargo check --workspace --all-targets` | 0 错 |
| `cargo test -p westplay-host --lib` | 200 通过 / **1 失败**：`a_game_run_normally_isnt_elevated` |

那条失败是**环境问题，不是代码问题**：上游新加的测试断言"当前进程不是管理员"，而我们的编译会话是提权的（`提权: True`），必然失败。玩家正常双击运行的 WestPlay 不受影响；提权启动时这条测试根本不参与运行。

### 14.6 产物与部署

| 产物 | 值 |
|---|---|
| `westplay.exe` | 24,055,808 B（2.1.4 + §15 的补丁） |
| `westplay.dll` | 551,424 B（比 2.1.3 的 550,912 多 512 B，插件源码变了） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` 9,792,854 B，SHA256 `3B0C18F23F6C5C0B4F9DB1DDE3673F04E3E6EC24F018A108854A5E3779BDE602`（含 §15 提权、§16 时钟与探针、§17 原生合入的四项、§18 首启遮罩） |
| 部署 | exe + dll + `ui/dist`（69 个文件）→ `D:\WestPlay`；插件 dll 还要进游戏 `bin\win_x64\plugins`（**游戏必须关着**） |

### 14.7 2.1.4 的"管理员游戏"提示：本机是误报（根因：UAC 被关了）

现象：2.1.4 一启动就写 `the game runs as administrator: WestPlay can't read its route, guidance or weather`，
而**天气照样读得到**（下一行就是 `weather: found in the game`），地图、路线也都正常。

排查过程：

1. 查 `eurotrucks2.exe` 的令牌 → `elevated=1`，**真的是管理员**（父进程 steam.exe）
2. 玩家完全关掉 Steam 和游戏、正常双击重开 → **还是 elevated**
3. 查 UAC：`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System` →
   **`EnableLUA = 0`**、`ConsentPromptBehaviorAdmin = 0`

结论：**这台机器的 UAC 是关的**。UAC 关闭 + 账户属于 Administrators ⇒ 系统里**每个进程都是 High 完整性
（提权）**：Steam、游戏、WestPlay 全一样。所以：

- 上游的检测**没说错**：游戏确实以管理员跑
- 但它的前提"游戏提权 ⇒ WestPlay 读不到"在**两边都提权**时不成立——同一完整性级别，互相读得到
- 玩家也**没法**"正常启动"消掉它：UAC 关着，怎么启动都是提权

（`is_elevated()` 里还有一处：`OpenProcessToken` 失败且错误是 `E_ACCESSDENIED` 就**当作提权**。
这在本机无关，但以后遇到「WestPlay 普通、游戏普通」的机器上如果也弹这条，八成是这里——见 §15 的补丁已经绕开了这个分支的一半。）

---

## 15. 我们的偏离（第 1 处）：只在"真的挡住"时提示提权（2026-10-28）

改 `crates/host/src/lib.rs`（约 528 行）一行：

```rust
// 上游：game_elevated = is_elevated(pid);
game_elevated = is_elevated(pid) && !is_elevated(std::process::id());
```

含义：游戏提权、**并且 WestPlay 自己没提权**，才算"被挡住"，提示才有意义。

| 场景 | 上游 | 我们 |
|---|---|---|
| UAC 关（本机），两边都提权 | 提示（误报，功能其实正常） | **不提示** ✓ |
| UAC 开，游戏提权、WestPlay 普通 | 提示（真挡住） | 提示 ✓ |
| UAC 开，两边都普通 | 不提示 | 不提示 ✓ |

验证（22:21:24 重启后）：`game: connected` → `weather: found in the game`，日志里那条提示**消失**，功能正常。

保留的地方：`game_elevated` 还喂给 `Maps`（网页 `answer = "elevated"`）和 companion 的 Truck Screen 页，
所以现在这些界面在"真的被挡住"时才提示，UAC 关闭的机器上不再无故报警。

> 顺带提醒：**UAC 关着有安全代价**——任何程序（包括随手下载的 exe）都直接以管理员身份运行，没有确认这一步。
> 这不是 WestPlay 的事，但给玩家提一句是应该的。

---

## 16. 时钟差一小时：查不到国家就退回中欧时间（2026-10-29）

### 16.1 玩家报的现象

"有时候比游戏时间慢一个小时"，怀疑插件自己算了夏令时。

### 16.2 先把"有没有夏令时"查清楚

全库搜 `dst` / `daylight` / `summer` / `winter` / `chrono` / `Local::now` / `Utc::now`：
**WestPlay 里没有任何夏令时或本地时区计算**。侧栏时钟只有一条路：

```
时钟分钟数 = telemetry.gameTime + multiplayerTimeOffset + clockShift
clockShift  = 卡车所在国家的 time_zone − 120（中欧）      ← 只有这一处会差
显示        = 纯整数除法取时/分（shared/format.ts，不碰 Date、不碰本地时区）
```

`time_zone` 来自游戏自己的 `country_data`，由 `crates/mapdata` 导出成 `countries.json`。实测导出表
（`D:\WestPlay-data\app.westplay\maps\…\countries.json`）：中欧 120、英国 60、芬兰/波罗的海/希腊/土耳其 180、
莫斯科 240、冰岛 0。**都是静态值，没有季节项。**

### 16.3 真正的 bug：认不出国家 → 退回 0

```ts
// 旧：state/timeZone.ts
const shift = timeZones && grid && telemetry ? clockShiftAt(grid, telemetry.x, telemetry.z) : 0
```

`clockShiftAt` 在"格子没有国家 / 国家没有时区"时返回 **0**，也就是当场退回中欧时间。于是：

- 在 **+180** 的国家（芬兰、波罗的海、罗马尼亚、保加利亚、希腊、土耳其）以及更东的地区，一旦网格没认出国家
  （坐渡轮、地图模组新增的路、网格边缘、城市中心）→ 时钟**慢一小时**，人话就是"有时候差一个小时"
- 在英国/葡萄牙（+60）方向相反，会快一小时
- 而在中欧（120）永远对得上——所以开发时测不出来

网格本身已经给"没有国家道路的格子"用了最近国家的兜底（`countries.rs` 的 `SEARCH_RINGS`），但
`countryAt` 在**网格外**（`x/z` 超出导出范围，例如地图模组把路修到范围外）以及某些图块缺数据时仍返回 0。

### 16.4 修法

`state/timeZone.ts`：**认不出国家时保持上一个时区**，不再跳回中欧时间；只有明确拿到国家时区才更新。

```ts
const zone = timeZones && grid ? grid.zones.get(country) : undefined
const shift = !timeZones ? 0 : zone === undefined ? kept : zone - GAME_ZONE
if (timeZones) kept = shift
```

上下渡轮、进模组区域都不再让时钟跳一下。

### 16.5 探针（**故意留在发行版里**）

改完后每次"国家/时区/选项"变化，页面往日志写一行（走已有的 `startup` 通道，不新增协议）：

```
page: clock country 23 zone 180 shift 60 on true at 13:05
```

- 只有变化时才写，一次游戏通常十几行
- 带 `at HH:MM` 是那一刻 **WestPlay 显示的时间**，方便和玩家截图里的游戏时钟直接对比
- 通道 `startup::mark` 自带去重（同一个字符串只记一次），所以不会刷屏

发版时**保留**，给玩家测时钟用（说明文档：`CLOCK-TEST-zh.md`，可直接转发）。收够数据后可以去掉，
或改成默认只记在 `RUST_LOG=debug` 下。

### 16.6 还没定的：游戏自己有没有按季节减 60

玩家的"有时候"有两种可能，探针就是为分辨它们：

1. **网格没认出来**（§16.3）→ 已修，日志会显示 `zone unknown` / `country 0`
2. **游戏自己按季节把时区减了 60**（`time_zone` 存的是夏令时值，冬天游戏显示标准时）→ 日志会显示
   `zone 180 shift 60` 但玩家说游戏比 WestPlay 快一小时

若是第 2 种，就要给时钟补一份"夏令时表"（欧盟/EEA/瑞士/英国 vs 土耳其/俄罗斯/白俄罗斯/冰岛等不实行的国家），
按**游戏内日期**判断。目前没有足够数据，先不动——猜着加会把现在对的部分改坏。

---

## 17. 第三方的 "Lite" 补丁包合入（2026-10-30）

### 17.1 那个包是什么

`WestPlay-Lite-2.1.4-patch.zip`（8,457 B）里有四个文件：`apply-patch.cmd`、`undo-patch.cmd`、
`README.txt`、`ui\cabin.html`。它**不动 exe、不动 dll、不动我们任何一个源码文件**，只做一件事：
把打好补丁的 `ui\cabin.html`（16,191 B）覆盖到安装目录，原件存成 `cabin.html.bak`。

补丁内容是在 `cabin.html` 的 `<head>` 里加两块：

- `<style id="wp-tweak-css">`：只改 `.speed-limit` / `.speed-badge` 的尺寸（66→76、74→86，矮屏那套 46/52→54/61）
- `<script id="wp-patch">`：壁纸轮换（上电随机换）、WebApp 首次打开的纯色遮罩、设置里插一行开关

"Lite" 是误写，内容就是给我们这版 2.1.4 的（引用的资源名 `cabin-BneHR9-j.js` 与我们的构建一致）。

### 17.2 为什么打上之后我们四个 WebApp 的打开动画看起来没了

补丁的"纯色遮罩"是这么做的（`injected.js` 第 141–192 行）：

```js
cover.style.cssText = 'position:fixed; z-index:2147483000; background:' + themeColor() + '; opacity:1'
document.body.appendChild(cover)
// 然后每帧 requestAnimationFrame 把 cover 摆到 .webapp-page 的框上
```

三个事实拼起来就是问题：

1. 我们的车机页面在 WebApp 位置**是透明的**——那是个洞，洞下面是宿主自己的 WebView（`Shell.tsx` 的
   `holeMask`），页面上那里一个像素都没有；
2. 我们的打开动画用 View Transitions（`state/launch.ts`），而 `shell/transitions.css` 里明写着
   "页面在自己的内容之外是透明的"，所以动画快照在洞那里也是透明的，**底下的真实页面像素会透过来**
   （这也正是 `mix-blend-mode: plus-lighter` 那段在处理的同一件事）；
3. 补丁的 cover 是 `body` 里的 `position:fixed` 元素，z-index 21 亿，正好盖在洞上，且**不透明**。

于是：点开 QQ音乐/网易云/B站/蜻蜓 → 窗口从图标长出来仍然是 560 ms 的弹簧动画，但那个 app 露出来的地方
**是一整块纯色**（主题底色）而不是网站画面；这块颜色还一直盖到 2–5 秒（`COVER_FLOOR 2000`、
`COVER_CAP 5000`）才淡出。看起来就是"这四个 app 的打开动画没了"，而其他 app（天气、设置、地图）不受影响——
因为遮罩只对这四个 WebApp 生效。

另外两个隐患（不一定直接导致现象，但都不该留在交付物里）：

- 脚本用 `MutationObserver(document.documentElement, {subtree:true})` 盯整棵 DOM，每次变化跑一次 rAF + 两次
  querySelector，车机页面每秒本来就在更新（时钟、遥测），等于常年多一份无谓的工作；
- 它往 React 管的 `.settings-group` 里 `insertBefore` 自己的一行——React 不认这个节点，后续设置页重渲染
  有可能直接抛 `NotFoundError`（React 的 insertBefore 失配）。

### 17.3 我们怎么合的（原生实现，不再注入）

| 补丁的功能 | 我们的实现 |
|---|---|
| 壁纸轮换上电即换 | `cabin/state/wallpaperRotation.ts`：`settingsShown()`（启动那次）+ `followWallpaperRotation()`（电门 false→true 沿）+ `rotateWallpaper()`；设置项持久化在 `store.ts` 的 `rotateWallpaper` |
| 短时间重复上电也换 | 只认电门"断开过"这件事，`MIN_GAP_MS = 400` 合并同一瞬间的几条消息，原来的 10 秒冷却不用了 |
| 不连着两次同一张 | `chooseWallpaper()` 同时避开**屏幕上那张**和**上次抽到那张**；两张都避开不了（池子只有两张）时退回"避开屏幕上那张" |
| 玩家自己的壁纸进池子 | 从 `useLooks().custom.wallpapers` 取，随 Customize 自动进出，不需要 localStorage 缓存 |
| 设置里一行开关 | `SettingsApp.tsx` 的 `WallpaperPage` 上方新 Group：`SwitchRow` + 说明文字（三语：中/英/土） |
| WebApp 首启纯色底 | `webapp.ts` 的 `useWebAppCover()` + `WebAppScreen` 里 `.webapp-cover` 元素，**放在 app 窗口内部**（`.webapp-page` 的子节点），2 000 ms 起、标题后 700 ms、最多 5 000 ms，同一次运行已画过的站点不再盖 |
| 限速标志/时速放大 | 直接改 `cabin/dashboard/map.css`（76/86，29/35，矮屏 54/61、21/25），不再靠注入样式覆盖 |

关键差别：遮罩现在是 **app 窗口自己的一块像素**，跟着窗口一起长大、一起圆角、一起被动画快照带走；
不再有 fixed 覆盖层、不再有 MutationObserver、不再往 React 的 DOM 里插节点。

### 17.4 验证

- `tsc -b` 干净；`vitest run` **66 个文件 / 464 个测试**全过（新增 `wallpaperRotation.test.ts` 8 个）
- 构建后产物里确认四项都在：`壁纸轮换`、`webapp-cover`、`width:76px`、`width:86px`
- 装好后启动，日志 `page: running (its scripts loaded)`，零错误
- 安装包与快照已随这次重新生成

### 17.5 注意

- **不要**再把这个补丁打到我们的 2.1.4 定制版上：它会让四项功能变成两套（原生一套 + 注入一套），
  并且动画问题会回来
- 补丁的 `undo-patch.cmd` 只是把 `cabin.html.bak` 拷回去，对我们这版没意义（我们的 `cabin.html` 是构建产物）

---

## 18. WebApp 首启遮罩：露出游戏导航的原因与修法（2026-10-30）

### 18.1 现象

打开 QQ音乐 / 网易云 / B站 / 蜻蜓，网站还没画出来的时候，app 窗口里露出来的是**游戏自己的导航界面**
（截图 `Euro Truck Simulator 2 Screenshot 2026.10.30 - 14.51.04.48`：上面那条 bar 已经有 QQ 音乐的标题，
下面一块却是游戏的地图）。

### 18.2 三个原因叠在一起（§17 的实现在这里不够用）

1. **洞是 CSS mask，会把洞里的一切挖掉。** `Shell.tsx` 的 `holeMask()` 是加在 `.carplay` 上的
   `mask-composite: exclude`：洞里（以及洞里的**所有子元素**）都不画。我们 §17 把 `.webapp-cover`
   放在 `.webapp-page` 里——它正好在洞里，于是**从来没显示过**。
2. **宿主在站点"报出自己多宽"之前不显示 WebView。** `webapp.rs` 的 `fitted`/`reveal()`：页面进视野后
   最多等 1500 ms（`FITTING`）才 `show(true)`。在那之前洞下面是**游戏自己的屏幕**，也就是导航。
3. **旧计时靠"标题"，对 QQ音乐 无效。** 站点 `<title>` 在 `<head>` 里一开始就有，和"画出来"无关；
   旧逻辑 `max(2 s, 标题+0.7 s)` 到点就撤遮罩，而页面往往还没画。

### 18.3 修法（宿主给一个真信号，页面据此决定挖不挖洞）

- `crates/host/src/webapp.rs`：`State` 新增 **`shown`**（`wanted && fitted`，即页面真的显示出来了）；
  `last_shown: Cell<bool>` 记住上次的值，变化时推一条 `Report::State`，`state_message` 里就有了它。
- `ui/src/shared/host.ts`：`WebAppState` 加 `shown: boolean`；旧宿主不发这个字段时按 `true` 处理（兼容）。
- `ui/src/cabin/shell/Shell.tsx`：**页面没 `shown` 就不挖洞**（`cut = hole && (hole !== webAppHole || webAppShown)`）。
  这段代码的条件是 `cut && hole && !watching && isInHost()`。于是游戏导航没有洞可露；窗口里由
  `.webapp-cover`（主题底色，在窗口内部，跟着打开动画一起长大/圆角）盖住。
- `ui/src/cabin/apps/web/webapp.ts`：`useWebAppCover(site)` 改成听 `shown`：
  - 最低 **1.2 s**（`COVER_FLOOR_MS`，避免快到看不见的闪）；
  - 页面 `shown` 之后 **250 ms** 淡出（`COVER_TAIL_MS`，避开首帧）；
  - 最长 **30 s**（`COVER_CAP_MS`，站点永远不报也总会撤）；
  - 页面刷新/换页（`shown` 变 false）遮罩**重新盖上**；
  - 本次运行已经画过的站点（`pageDrawn`）重开时不盖，避免多余的色块。

这套做法没有 §17 那段补丁的三个毛病：没有 `position: fixed` 覆盖层、没有全文档 `MutationObserver`、
没有每帧追踪 `.webapp-page` 的坐标。

### 18.4 验证

- `cargo test --release -p westplay-host --lib webapp`：**5 个通过**（含 `says_whether_the_page_shows`，
  断言里有 `"shown":true`）
- `tsc -b` 干净；`vitest run`：**66 文件 / 466 测试**（`webapp.test.ts` 新增 2 个：`shown` 进状态、
  旧宿主缺字段按已显示处理）
- 装配（新 exe + 新 ui）启动：`game: connected` → `page: running`，零错误
- 安装包重打：`WestPlay_2.1.4_x64-setup.exe` 9,792,854 B，SHA256
  `3B0C18F23F6C5C0B4F9DB1DDE3673F04E3E6EC24F018A108854A5E3779BDE602`

## 19. 三个站点的登录接进主程序（含新手引导），只留 Apple Music 原入口

需求原话：“给QQ音乐、网易云、B站登陆链接接入主程序（包括新手引导）然后只保留原版AppleMusic的登录入口”。

### 19.1 做了什么

三个 App 的登录不再只在 App 自己的页面里点：**主程序的「账号」页**和**新手引导**各有一行，点“登录”会在
PC 桌面上打开一个小窗口，窗口里就是那个网站自己的登录页（键盘是真的，能扫码、能输密码、能装插件），登录
完成后窗口自己关掉。

- 四个入口，顺序固定：**B 站、网易云音乐、QQ 音乐、Apple Music**。
- Apple Music 那一行**完全没动**：还是原来 `apple_music` 播放器的登录窗口（`apple_music.rs`、
  `signin::APPLE_MUSIC`），用的是它自己的 WebView2 profile，代码一行没改。
- 网页 App 用的三个站长这样接进来，只多了一层“窗口”。

### 19.2 宿主：`crates/host/src/weblogin.rs`（新）

- `Site { Bilibili, QqMusic, Netease }`，每个站点一套 `signin::Site`：
  - 登录页：B 站走 `passport.bilibili.com/login`（登录完回 `www.bilibili.com`，**用网址判断成功**）；
    网易云、QQ 音乐是页面里的弹窗，**页面里带一段脚本**（`netease_sign_in.js`、`qq_music_sign_in.js`）
    在真的登录上之后 `postMessage({signedIn:true})`。
  - 退出页：站点自己的退出地址（B 站 `passport.bilibili.com/logout`，网易云 `music.163.com/logout`，
    QQ 音乐 `y.qq.com/portal/profile.html`）。退出的窗口没有“成功”信号，**关掉窗口就算退出**。
- **profile 就是 App 自己的**（`webapp::Site::profile()`：`webview2-bilibili` / `webview2-qq-music` /
  `webview2-netease`），所以窗口里登录完，卡车屏幕上的 App 刷新一下就带着登录了；`webapp` 页正开着时直接
  用它的 WebView2 environment（`webapp::WebApp::environment()`，新加；`webview::environment_for()` 也是新加的
  公开包装），不重复建环境。
- 登录成功后如果那个 App 正开着，发一条 `webapp::Command::Reload`，页面立刻变成登录状态。
- `WebLogins::state()` → 状态里的 `webLogins`：

  ```json
  {"bilibili":{"signedIn":true,"signingIn":false},
   "netease":{"signedIn":null,"signingIn":false},
   "qqMusic":{"signedIn":false,"signingIn":true}}
  ```

  `signedIn: null` = 这次运行还没问过它（宿主不猜）；`signingIn` = 它的窗口开着。
- 状态是新字段，老前端不认识也不会坏（`Status` 用 `Default`，字段带默认值）。

### 19.3 命令（`app/src/main.rs`）

新增六个：`bilibili_sign_in` / `bilibili_sign_out`、`netease_sign_in` / `netease_sign_out`、
`qq_music_sign_in` / `qq_music_sign_out`，都只是把请求塞进 `AccountRequests`（`bilibili`/`netease`/`qq_music`
三个新字段，原来的 `youtube`/`spotify`/`apple_music` 不动）。

### 19.4 前端

- `ui/src/companion/useHostStatus.ts`：`HostStatus.webLogins`（`WebService = 'bilibili'|'netease'|'qqMusic'`）、
  `webSignIn` / `webSignOut`。
- `ui/src/companion/accounts.ts`：`SignedIn` 四键（三个站点 + `appleMusic`），本地只记“是否”，宿主说了就存；
  开机只对 Apple Music 做一次隐藏的 `appleMusicCheck()`（三个站点由窗口说，不用先问）。
- `ui/src/companion/pages/Accounts.tsx`：四行；三个站点 `checks: false`（**不显示永远转圈的 Checking**，
  未登录就直接显示“登录”按钮——这是这次实现里最容易犯的错，专门避掉了）。
- `ui/src/companion/onboarding/Onboarding.tsx`：步骤从
  `… controls, accounts, spotify, appleMusic, tutorial` 换成
  `… controls, bilibili, netease, qqMusic, appleMusic, tutorial`；YouTube 那一步和它用的
  `youtubeCheck/SignIn/SignOut`、Spotify 那一步一起去掉；`ServiceStep` 合并成一张表（`checks` 区分
  “能先问”和“只能开了窗口才知道”）。
- 文案：`Words` 加**可选**的 `webAccounts`（`title` 里有 `{name}`），只写进 `zh_cn`、`zh_tw`、`en_us`
  （`en_gb` 继承 `en_us`），别的语言落到代码里的英文兜底，**不逼着 40 个语言文件一起改**。
- 顶栏（`Companion.tsx`）账号摘要跟着换成四个名字。
- `ui/src/companion/preview.ts`（`?preview` 设计预览）同步：假的 `webLogins` 和六个命令。

### 19.5 验证

- `cargo check --release -p westplay-host`、`--manifest-path app/Cargo.toml` 干净
- `cargo test --release -p westplay-host --lib weblogin`：**2 个通过**（三个站点各是各的 profile / 网址 /
  脚本；窗口说的话才算数）
- 全套 `cargo test -p westplay-host --lib`：**202 通过 / 1 失败**，失败的是
  `tests::a_game_run_normally_isnt_elevated`——本机全程提权（UAC 关闭），这个测试环境性失败，与本次改动无关
  （之前也一样）
- `tsc -b` 干净；`vitest run`：**66 文件 / 466 测试**（没动测试用例，加字段后旧用例照旧通过）
- 装配（新 exe + 新 ui）启动：`game: connected` → `page: running` → 网易云页面正常，日志零错误
- 安装包重打：`WestPlay_2.1.4_x64-setup.exe` **9,791,944 B**，SHA256
  `8351B5D6673EBD933430078D07DC304133A156178FA902007C9273599B552953`

### 19.6 已知限制（如实说）

- QQ 音乐、网易云的“已登录”是**看页面**（顶栏头像 / 能读到的 cookie），站点改版可能失效；失效的表现只是
  那一行仍显示“未登录”，点登录照样能用。B 站看网址，最稳。
- “退出登录”靠**关窗口**：退出页没有成功信号，关掉就算退了，宿主随即把状态设成未登录。
- 重启 WestPlay 后，主程序对三个站点先是“不知道”（`null`），界面显示的是**上次记下的**那个值；等窗口说一次
  就以宿主为准。Apple Music 是开机隐藏跑一次问出来的。
- 登录窗口是 WebView2 的独立窗口，不在游戏里：切出游戏去扫码/输密码是正常的。

## 20. 网页 App（网易云/QQ 音乐）的整页滚动歌词

需求原话：“网易云的歌词显示没法同步吗”，接着选了“想要整页滚动歌词”和“仪表盘那一行”两处。

### 20.1 先查清了“同步”到底哪里有问题

日志里的探针（`webapp.js` 的 `lyricProbe`）说明了两件事：

- 页面自己的 LRC 是**带时间轴**的（`lyricProbe: netease: 36 lines`），位置也是真的：播放时
  `media.lyric` 每换一句就报一次（旧日志里 `[netease] playing: …` 大约每 6 秒一行，就是歌词在换行）。
- 暂停时位置停在 0.2–0.9 秒，因为网易云的声音是**页面外的 `<audio>` + MediaStream**（`mediaProbe:
  so=MediaStream src= rs=4 media=0`）：流的时间轴不跟着歌走。所以“暂停时歌词停在第一句”是正常的。

于是：仪表盘那一行本来就跟着走；真正的缺口是**没有整页歌词**（以前只有那一行），加上页面自己的时钟兜底。

### 20.2 现在的样子

- **仪表盘「正在播放」卡片多了一个歌词按钮**（只在网页 App 的站点有歌词时出现，比另外三个按钮小一号，
  免得挤出卡片）：点它整页歌词就盖在屏幕上。
- **整页歌词**（`LyricsPage.tsx` + `webapp.css` 的 `.wal`）：站点名、歌名、歌手在上，封面模糊铺底；
  歌词大字、当前这句提亮并略微右移，唱过的淡一些，自动把当前句保持在屏幕三分之一处；滚轮/拖动可以自己翻，
  4 秒后回到跟着歌走。这一页是暗色（和 Apple Music 的歌词页一样），两种外观通用。
  点的“跳到这一句”对网页 App 不做（页面的播放器是网站自己的，不去戳它）。
- **Apple Music 的歌词页一个字没动**：它还是 `NowPlaying.tsx` 里原来那套（`useAsked({ask:'lyrics'})`）。

### 20.3 数据怎么走

1. `webapp.js`（在站点页面里）：
   - 歌词学到/换歌 → `post({ lyricLines: [{at, words}, …] })`（一首歌一次，`at` 保留两位小数）；
   - 每 500 ms → `post({ lyricAt: seconds })`；
   - 原来的 `media.lyric`（当前那一句）照旧，仪表盘那行没变。
2. 宿主 `webapp.rs`：`Report::Lyrics(Option<lyrics::Lyrics>)`、`Report::LyricAt(f64)`；把页面的
   `{at, words}` 拼成 `lyrics::Lyrics { synced: true, lines: [Line{start, text}] }` 并走一遍
   `Lyrics::checked()`（行数/长度/时间都有上限，和 Apple Music、Spotify 同一套约束）。消息：
   `{"type":"webAppLyrics","lyrics":{…}}`、`{"type":"webAppLyricAt","at":12.3}`；App 关掉时发
   `lyrics: null`。
   - 顺带把日志里的噪音治了：以前**每换一句歌词就打印一次** `[netease] playing: …`，现在一首歌一行
     （`webapp_song` 记住上一首），另加一行 `[netease] its words: 36 lines`。
3. 前端：`shared/host.ts` 两条消息 → `store.ts` → `webapp.ts` 的 `lyrics / lyricAt / lyricsOpen`；
   `Dashboard.tsx` 里挂 `<WebAppLyrics />`（`.screen` 是 `position: absolute`，所以 `.wal` 直接
   `inset: 0; z-index: 5`，光标 40 还在上面）。
4. 位置兜底：`playerClock()` 现在除了 QQ 音乐自己的 `00:39 / 03:43`，还认网易云播放条上画的时间；
   但只在页面元素自己的时钟**不动**时才用它（`song.currentTime > 1` 且在播 → 用元素的），所以暂停时不会
   把歌词钉死在 0。

### 20.4 验证

- `tsc -b` 干净；`vitest run`：**66 文件 / 466 测试**通过
- `cargo test --release -p westplay-host --lib webapp`：**5 个通过**（`reads_what_the_page_plays` 新增
  了 `webAppLyrics` / `webAppLyricAt` 两条消息的断言）
- `node --check crates/host/src/webapp.js` 通过（页面脚本是宿主里 `include_str!` 嵌进去的，语法错会让构建失败）
- 装配（新 exe + 新 ui）已更新并启动（exe 24,094,208 B；ui 69 个文件与 dist 一致）；
  安装包重打：`WestPlay_2.1.4_x64-setup.exe` **9,793,254 B**，SHA256
  `AEE4B8C70ED449CF65196837B051FEB48867F3297B3BE31B033CC4A012D1E4EC`

### 20.5 还没验证的（要人在游戏里看）

- 歌词按钮 → 整页歌词的实际观感（字号、对齐、当前句的位置）；
- 网易云播放中的换行节奏（日志里 `its words: N lines` 能确认歌词进没进来）。
  这些我没法自己点，得你开着网易云放一首歌看一眼。

### 20.6 实测之后的三处修正（2026-10-30 晚，owner 在游戏里验过）

**a) “快一秒 / 每句乱跳”是时钟选错了。** 页面里能读到两个时钟，日志的探针把它们摊开了：

```
at=51.5 el=52.2 bar=51   "时间是让人猝不及防的东西"
at=51   el=52.2 bar=51   "笑着哭着都快活 谁让~"      ← 退回上一句（bar 整秒在前）
at=52.6 el=52.6 bar=51   "时间是让人猝不及防的东西"  ← 又跳回来
```

- `el` = 页面声音元素的 `currentTime`，比喇叭真正出声**快约一秒**（Chromium 的播放流水线位置在听感前面；
  网易云还是流式播放，先缓冲再出声）。
- `bar` = 站点播放条上画的时间，**和它自己歌词面板、和听到的声音是同一条线**，但只有整秒。

两版试过：`el` 优先 → 稳定快一秒（owner 的“重开就快一秒”）；`bar`/`el` 交替 → 边界来回弹（owner 的“按
六秒切一句”）。**最终做法**：有时间条画的站点就用它（每换一格记下“值 + 当时的时间”，中间用“上一格 +
已经过去的时间”插值，最多补一秒，所以不会整秒一跳），站点没得画或超过 2.5 秒没动才回退到元素时钟。
owner 验过：“歌词能同步了”。

**b) 歌词页的版式**（owner 提的四点）：

- 封面放到右侧上方（不再垂直居中），占约 1/3 宽，圆角 20px + 投影；
- 封面下面是**上一曲 / 暂停（播放）/ 下一曲** 三个按钮（`webAppCommand` 的 `previous`/`playPause`/`next`，
  就是页面自己播放器的那三个动作；播放/暂停图标跟着 `media.playing` 换）；
- 没有封面（封面开关关掉、或站点没有图）时按钮在那一列居中；
- 圆角跟仪表盘卡片一套（`--panel-radius`，30px / 小屏 22px）+ `overflow: hidden`，不再露方角；
- **离开歌词页自动收起**：`WebAppLyrics` 卸载时把 `lyricsOpen` 置 false，回主页只能再点按钮打开。

**c) 网易云歌词改成按页面自己的歌曲 id 取**（`music.163.com/#/song?id=…`、`/song?id=…`），拿不到 id
才退回“歌名+歌手”搜索第一条——搜第一条可能命中翻唱/现场版，时间轴是另一份录音的。

**d) 探针收掉。** 排查用的 `lyricProbe`（每换一句打一行）在 owner 确认同步后删掉了；日志里只留
`[netease] its words: 46 lines` 这种一首歌一行的。

**e) 这一版装配**：exe 24,096,256 B；ui 69 个文件与 dist 一致；安装包
`WestPlay_2.1.4_x64-setup.exe` **9,797,704 B**，SHA256
`24855654B8EA0EC0804A6319F647D7547ED0D3AE42A6E8844259B5CA5C4CBC27`。
`tsc -b` 干净，`vitest run` 66 文件 / 466 测试通过。

### 20.7 版式再调（owner 2026-10-30 晚）

- **封面 + 三个键当成一组，在右列的垂直中线上居中**（`.wal-art { justify-content: center }`），像 Apple
  Music 的 Now Playing 那样：上面封面、下面上一曲/播放暂停/下一曲；原来“贴顶”和“无封面时居中”两个特例
  合成一个。
- **切歌不再收起歌词页**：以前页面换歌时先发一份空歌词（新歌的还没到），前端把 `lyrics: null` 当成“没歌词
  了”顺手把 `lyricsOpen` 关了，歌词页就闪一下没了。现在 `receiveWebAppLyrics(null)` 只清歌词、不动
  `lyricsOpen`——那一页只在两种情况下收起：**离开它**（卸载时自己关）或**页面本身没了**
  （`receiveWebApp(null)`）。切歌期间最多一瞬显示“没有歌词”，新歌词到了就接着滚动。

**f) 这一版**：安装包 `WestPlay_2.1.4_x64-setup.exe` **9,793,448 B**，SHA256 `C4847BB22B53D8695A291C198BA09BA264125447A338EF4EE764D6DED384FED5`。

### 20.8 入口收口 + 封面回退（owner 2026-10-30 晚）

- **歌词入口只在三个音乐软件里出现**：QQ音乐 / 网易云（有歌词时）显示我们自己的歌词页按钮；**Apple Music**
  也显示，但点它打开的是**它原版的 Now Playing 歌词页**（`useAppleMusic.setState({ nowPlaying: true,
  lyrics: true, queue: false })` + 打开 music App），原版那段代码一行没动；B站、蜻蜓**不再有**入口
  （视频/播客的“歌词”不是歌的）。
- **切歌时封面不换**：日志里查到的实情是——网易云连给三首不同的歌**同一个封面地址**
  （`109951173971233652.jpg`，三首都是 斯丹曼簇，很可能同一张合集封面），QQ音乐则每首不同。
  - 先加了前端保险：封面 `<img>` 按地址 `key` 重挂，换歌就是新元素（旧图在新地址没加载出来时不会赖着不走）。
  - 又试过“优先读页面播放条上画的那张封面”（`pageCover()`），**owner 实测不能用了**（取不到/取错），
    **已回退**：恢复成第一版——网易云走系统媒体信息（Media Session）的 `artwork`（取最大那张），
    QQ音乐走它页面上的 `.song_info__pic`。`pageCover()` 和那条一次性探针都删掉了。

**g) 这一版**：安装包 `WestPlay_2.1.4_x64-setup.exe` **9,792,330 B**，SHA256 `212387BD980D9D39349BBC48E04FBC09905D7BBED2074E718D80E2C74F71D7B5`。

### 20.9 歌词同步定下来的那个值（owner 2026-10-30 晚，已确认）

三版实测把范围夹住了：

| 用的时钟 | owner 的耳朵 |
|---|---|
| 元素时钟 `el`（`currentTime`） | **快 1 秒** |
| 站点播放条 `bar`（整秒） | **慢约 1 秒** |
| `el − 1.0` | **慢半秒** |
| **`el − 0.5`** | **好了（定稿）** |

原因是网易云把声音以 **MediaStream** 交给 `<audio>`：浏览器先把一段音频缓冲进流里再出声，元素的
`currentTime` 已经走到缓冲的头，比喇叭早；它自己播放条画的又是整秒、还晚一点。所以最终：

```js
const STREAM_LEAD = 0.5
const sounded = elementAt - (song.srcObject ? STREAM_LEAD : 0)   // 只有“流式播放”的页面减
const at = elementLive ? sounded : drawnAt
```

- 只对流式元素减（`srcObject` 存在），普通 `<audio src>` 的页面（B站视频、QQ音乐页面里的元素）不动；
- 元素时钟停住（暂停/换页）才退回播放条 + 亚秒插值；
- 这一次调试用的 `lyricProbe`（每换一句一行的 `at/el/bar`）**已删除**，日志只剩一首歌一行的
  `[netease] its words: N lines`。

**h) 定稿这一版**：exe 24,096,768 B、ui 69 个文件；安装包 `WestPlay_2.1.4_x64-setup.exe` **9,795,326 B**，SHA256 `363E1E2579640FA9A8B01CC7E974849AAC6556EAD3E18D3F4B774335749E568D`。`tsc -b` 干净，`vitest run` 66 文件 / 466 测试通过，`node --check` 页面脚本通过。

### 20.10 切歌后歌词“进度不重置”的真凶（owner 2026-10-30 晚，已确认）

日志逐秒抓到的（`at` 是我们算的位置，`el` 是页面元素时钟，`bar` 是网页播放条）：

```
19:52:49  at=34  el=34.5  bar=33        上一首《齐天》播到 34 秒
19:52:50  [netease] playing: 活着 — 郝云  切歌
19:52:51  at=36  el=36.5  bar=0         新歌从 0 开始（bar=0），我们还在用 36
19:53:16  at=61  el=61.7  bar=25        差 36 秒，一直是“上一首的进度”在走
```

原因：**网易云切歌时新建一个声音元素，而上一首的元素还在 `paused=false`**（其实已经不出声）。
`player()` 取“第一个在播放的元素”，拿到的永远是上一首那个，于是歌词按上一首的进度跑
（“不重置、按自己的节奏一秒一切”就是这么来的）。

改法（`webapp.js`）：同时有多个元素在“播放”时，用**网页播放条的时间**挑出真正在响的那个
（`|currentTime − bar|` 最小的），并且要求它和播放条相差不超过 3 秒——超了就不采信元素时钟、
直接用播放条（新歌从 0 起）。确认后 owner 回：“没问题了”。

### 20.11 歌词页音量条 + 站点音量记忆（QQ音乐“每次打开变最大音量”）

- **页面侧**（`webapp.js`）：`setVolume` 命令直接写页面的声音元素（`volume`/`muted`），并记进该站点自己的
  `localStorage['westplay.volume']`；某个元素第一次出现时（换歌新建的、或页面重开后新出现的）把上次设的
  音量**补回去**。QQ音乐每次打开音量失效、跳回最大，就是它自己的播放器把新元素初始化成 1.0——现在补上了。
  音量变化也会回报（每 0.01 一次），包括用户拖动网页自己的音量条。
- **宿主**：`Report::Volume(f64)` → 消息 `{"type":"webAppVolume","volume":0.6}`；
  命令 `Command::SetVolume { volume }` → 页面 `{"type":"webAppMedia","action":"setVolume","volume":…}`。
- **前端**：`webapp` store 加 `volume`；歌词页三个键下面加一条**音量滑条**（`input[type=range]`，0–1，
  白色圆点，暗色底），拖动即改网页音量，网页自己改音量时滑条也跟着动。
- 每个站点各记各的音量（按站点 origin 的 localStorage），不是全局音量。

**i) 这一版**：exe 24,092,672 B、ui 69 个文件；安装包 `WestPlay_2.1.4_x64-setup.exe` **9,793,593 B**，SHA256 `2554A43D80C48DF40C5DA023BEDCEB6F1E11E41E88258FF111F211186611EA97`。`tsc -b` 干净，`vitest run` 66 文件 / 466 测试通过。

### 20.12 音量条落地过程里的四个坑（owner 2026-10-30 晚，已确认可接管）

1. **滑条没出现**：我改那次只把 CSS 写进文件、JSX 那半边没落盘（脚本里两次 `write_text` 只执行了最后一个）。
   现在滑条在**歌词页最下面一条通栏**，并确认装配后的 bundle 里搜得到 `wal-volume`。
2. **网易云直接没声**：`Number(localStorage.getItem('westplay.volume'))` 在**没有记录**时是 `Number(null) = 0`，
   于是“上次音量”被当成 0，新建的每个声音元素都被设成静音。改成先判 `null`（没记录就不碰站点的音量）。
3. **QQ音乐 音量改不动**：日志的探针给出实情——
   `volumeProbe: nothing to set here; frames none; elements 0; heard 0; graphs 1; gains 1`：
   它的页面里**没有任何 `<audio>/<video>` 被播放过**（我们挂的 `play()` 一次都没触发），**也没有 iframe**，
   声音走的是 **Web Audio API**（自己拼的音频图）——没有“元素音量”可设。
   最终做法：把 `AudioNode.prototype.connect` 包起来，**凡连到 `AudioContext.destination`（扬声器出口）的连接，
   都改接到我们自己建的 `GainNode`** 上，该节点带着歌词页的音量（拖条即改；页面新图连接时也带上当前值，
   所以第一次进去第一声就是设定音量，不会先响一下最大的）。
   为了这条路还先做了一层：**每个 frame 注入的音量小脚本** + 顶层用 `postMessage` 把音量广播给所有 frame
   （跨域也能发），元素每次 `play()` 前先补上音量——这条对“声音在 frame 里”的站点有用（QQ音乐不是这种，
   但留着不吃亏）。
4. **音量记忆**：站点各自按 origin 存在 `localStorage['westplay.volume']`；元素/音频图新建时补回；
   站点把音量改回去（QQ音乐每首歌都干）由看门狗补回，每秒最多一次，免得和网页自己拖动打架；
   歌词页的滑条拖动时**界面先动**，不等网页回话。

**j) 音量这一版**：exe 24,096,256 B、ui 69 个文件；安装包 `WestPlay_2.1.4_x64-setup.exe` **9,797,536 B**，SHA256 `D07FC10B17B80A3468712C3BFB5FBEDA177C6EB8E59494B3A75577FA3C136F9C`。`tsc -b` 干净、`vitest run` 66 文件 / 466 测试通过、页面脚本 `node --check` 通过。

### 20.13 音量条的位置与“插件首页也来一条”（owner 2026-10-30 晚）

- **歌词页**：音量条从页脚通栏（拖动时太像歌曲进度条）改成**封面 + 三个键那一列里的、三个键下面**，宽度收到
  `68%`，用原生外观（`accent-color: #fff`）。
- **插件首页的 Now Playing 卡片**：控件下面加一条音量（`.np-volume`，`padding: 0 34px`，原生滑条、
  `accent-color: currentColor` 跟卡片的字色走），**只加这一条，布局其余不动**。它控制的是**当前播放的那一方**
  自己的音量，按卡片显示的是谁分派：
  - Apple Music → `setVolume(level, done)`（`appleMusic.ts`，`playback.volume` 取值）
  - Spotify → `setVolume`（`spotify.ts`）
  - YouTube Music → `setVolume`（`youtubeMusic.ts`）
  - 网页 App（QQ音乐/网易云） → `webAppCommand({action:'setVolume'})`，即 §20.12 那条（元素 / Web Audio 图）
  - `volume: null` 的来源（播放器说自己不提供音量）不画这条。
  - **视频卡片（YouTube）没加**：那是另一张卡，且 YouTube 播放器自己带音量键，owner 没提。
- 拖动时 `done` 语义沿用各播放器自己的：`onChange` 送 `false`（节流），`onPointerUp`/`onKeyUp` 送 `true`
  （立刻把最后一次送出去）。

**k) 两条音量条这一版**：exe 24,096,256 B、ui 69 个文件；安装包 `WestPlay_2.1.4_x64-setup.exe` **9,796,580 B**，SHA256 `84A05108AC942E468C36BAFB3CA7AFEC9ED723A5754D0AFA53F176042048DC45`。`tsc -b` 干净、`vitest run` 66 文件 / 466 测试通过。

### 20.14 两条音量条前面各加一个小喇叭（owner 2026-10-30 晚）

Owner 的建议：“给这两个音量条前面加一个小喇叭图标，以免用户以为是进度条”。

- 歌词页：`.wal-volume` 里加 `SpeakerGlyph size={22} volume={…}`（`aria-hidden`，蓝本就在
  `apps/music/glyphs` 里，Apple Music 的 Now Playing 音量用的同一个图标——图标本身随音量变：静音/有声）。
  滑条宽度 74%、图标与滑条间距 10px。
- 插件首页卡片：`.np-volume` 里加 `SpeakerGlyph size={20}`，同样 `gap: 10px`，图标 `opacity: .75`
  （跟着卡片的字色），卡片其余布局仍未动。

**l) 喇叭图标这一版**：exe 24,096,256 B、ui 69 个文件；安装包 `WestPlay_2.1.4_x64-setup.exe` **9,794,982 B**，SHA256 `B056EBCB2D78C66CB5C7C3F03B77B1644F26EEA2D8405E3318C3E1348F1309ED`。

## 21. 收尾：完整源码导出、文档更新、旧产物清理（2026-10-30 夜）

- **完整源码导出**：`D:\WestPlay-2.1.4-src-full.zip`（7.5 MB，636 项）——`src/`（完整源码树，626 个文件，
  已排除 `target/`、`node_modules/`、`ui/dist/`、`.git/`）+ `_docs/`（FIXES.md、PLAN.md、
  `UPDATES-zh-2.1.4-快报-2026-10-30.md`、CLOCK-TEST-zh.md）+ `README-源码导出.txt`（构建与装配路径）。
  与 `westplay-mods-src-214.zip` 的区别：后者只是**相对纯净 2.1.4 的改动文件**（89 项），前者是**整棵树**。
- **文档**：FIXES 的索引表补到 18 组（§16–§20）；PLAN 的 §0 现状、§0.1（今晚的交付状态）、§6.1、§8 已更新。
- **清理**：删掉 2.1.3 / 2.1.2 及更早的产物与备份（安装包、快照 zip、旧构建树、备份目录/zip、临时工作目录、
  旧构建日志），见 PLAN.md §0.2 的清单；保留：当前构建树 `D:\wpq13\src`、纯净 2.1.4 基线 `D:\wp14\src`、
  2.1.4 的备份 `D:\WestPlay-backup-20261028-214`、装机目录、2.1.4 安装包与两个 2.1.4 源码包、
  `D:\WestPlay-data`（账号与浏览器的数据，**不能删**）。

## 22. “视野里有卡车屏幕，但 WestPlay 没显示”（2026-10-31，owner 实机复现并修好）

### 22.1 现象

卡车内视角里那块仪表屏是亮的、上面有内容，但内容**是游戏自己的**（不是 WestPlay 的）；伙伴程序
「屏幕」页灰着，宿主日志一路 `WestPlay's screen in view 0%`。

### 22.2 查证（按顺序，每一步都排掉一种可能）

| 看到的 | 说明 |
|---|---|
| 插件 `mod mount: …/westplay.scs into the mod pool at priority 99999` | 模组**自动注入正常**（插件自己挂的，不需要玩家操作） |
| 插件 `screen: renault-t-2024's texture view made (1 kept)` | 我们那块屏的贴图**在显存里**（模组资源加载了） |
| 插件整局 `screen textures in use: 0` | **游戏从没引用过**我们的屏 |
| 插件没有 `cab: the dashboard's mark drawn` | 我们模组的那块仪表（模型）也没被画 |
| `textures.txt` 里只有一条 1280 宽：`1280x723`（= `SCREEN_HEIGHT + 3` = `renault-t-2024` 布局） | 贴图有、没人用 |
| 宿主 09:31–09:39 `in view 0%`（322→120 fps，既在菜单也在开） | 综上：**游戏在用它自己的仪表** |

排掉的两种假设：
- **外部任务禁用模组**：owner 当时没有接任务；而且配置器里我们的部件是能看到的（真被禁用的话看不到）。
- **插件/钩子坏了**：钩子日志齐全（`CreateTexture2D`/`PSSetShaderResources`/`OMSetRenderTargets` 都 hooked），
  且同一天早先（17:42、19:30）`in view 100%` 正常。

### 22.3 根因：**“自动注入模组”≠“车里装了 WestPlay 的部件”**

- 插件确实每次启动都把 `westplay.scs` 挂进模组池（`mod_mount.rs`），玩家不用管；
- 但**这辆车里装的是哪块仪表/平板，是存档里的车辆配置**（`def/vehicle/truck/<truck>/accessory/set_dashbrd|toyhang/westplay_tablet.sii`，
  `name: "WestPlay tablet"`，价格 1，aftermarket）。没装 → 游戏用它自己的仪表 → 我们的贴图躺在显存里没人引用
  → 宿主如实报“没在画”。

owner 之前的记忆是“昨天没装平板也能用”，实际是**昨天车里装着的部件是 WestPlay 的**（日志留了证据：
`screen: renault-t-2024 shows WestPlay in this truck: the tablet kept blank in it`），
今天把那个槽位换成了别的部件，于是屏回到游戏自己的。

### 22.4 修法（玩家侧，1 分钟）

**服务 → 卡车配置（Truck Configurator）→ 选这辆车 → 仪表 / 驾驶室配件** 里选 **“WestPlay tablet”**：

- `仪表（set_dashbrd）` 槽：接管卡车原本那块仪表屏（推荐）；
- `挂件（toyhang）` 槽：单独挂一台小平板。

改完**不用重开游戏**，回车内视角即生效。

### 22.5 装好之后的日志（owner 10:05 实测）

```
[ 2207.291] screen: tablet isn't WestPlay's in vehicle.renault.t, the game's own shows   ← 换部件前，插件就认出来了
[ 2208.113] screen layout: renault-t-2024                                                ← 换成我们的部件
[ 2215.738] screen textures in use: 2                                                    ← 我们的屏开始被画
宿主 10:07:34  WestPlay's screen in view 100% of the time                                 ← 屏幕正常
```

### 22.6 顺手的改进（还没做，等 owner 发话）

伙伴程序现在把四种完全不同的情况都写成一句 `notInCab`（“坐进你的卡车” / “正在等待驾驶室”）：

1. 游戏没在画驾驶室（菜单、后台、车外视角）；
2. **在车里，但这辆车没装 WestPlay 的部件** ← 本次这种；
3. 装了、在车里，但钩子真漏了；
4. 游戏没连上。

最省事的一版（只改文案）：把 `ui/src/companion/pages/words/{zh_cn,zh_tw,en_us}.ts` 里
`notInCab` 的两处文字补上“若坐进驾驶室后屏幕仍是游戏自己的内容：请在「服务 → 卡车配置」给这辆车装上
WestPlay tablet”。
更进一步的一版（要动插件与宿主）：插件已经把“驾驶室画过没有”（`cab_frame`）和“我们的屏画过没有”
（`screen_frame`）分开上报，宿主可据此直接判断“车里没装我们的部件”，由伙伴程序点名说出来。

### 22.7 补记：这台车是**原生支持**的，平板只是另一条路，两条路不冲突（owner 2026-10-31 追问）

owner 的猜测：“是不是这个车 WestPlay 已经做了原生支持，但跟平板那条路冲突了？” —— **一半对：原生支持确实有；冲突没有，
插件故意让闲置的那条保持空白。**

两条路（`crates/plugin/src/screens.rs` 开头的模块说明写得很清楚）：

| 路 | 怎么来的 | 什么时候用 |
|---|---|---|
| **原生（卡车自己的仪表屏）** | 模组（`westplay_setup::game_mod`）**改写游戏的 GPS/仪表 UI 脚本**：每个布局的脚本把「我们的屏贴图」当作它 “screen on” 组的最上层整屏图去画；游戏照常走它自己的渲染、后期、翻转、mip 生成 | 车的仪表/设备槽里选的是**我们的部件**（如 `renault-t-2024` 布局） |
| **平板（独立模型）** | 模组里的附件 `name: "WestPlay tablet"`（`interior_model: …/westplay_tablet.pmd`），它在 3D 通路里画自己的贴图 | 槽里装的是平板，或挂件式的平板 |

- 两条**不打架**：插件会**把闲置的那条留白**。owner 10:11 的日志正是这样：
  ```
  [ 2486.767] released 1 unused screen textures, 0 in use          ← 平板那条的贴图被释放（平板去掉了）
  [ 2490.588] screen texture loaded: renault-t-2024 (1 in use)      ← 卡车自己的仪表屏在画
  [ 2490.588] screen: renault-t-2024 shows WestPlay in this truck: the tablet kept blank in it
  [ 2490.588] screen layout: renault-t-2024
  ```
  即：**去掉平板，原生的仪表屏照样显示**（owner 观察到的现象），平板只是被留白。
- 今早不行，是因为**游戏自己的仪表设备占着那个槽**：插件当时就点出来了 ——
  `screen: tablet isn't WestPlay's in vehicle.renault.t, the game's own shows`（10:05，换部件之前），
  也就是“这块仪表不是 WestPlay 的，游戏自己那张在画”。
- 所以决定权在**卡车配置里那个仪表/设备槽**（选游戏的 → 游戏自己的内容；选 WestPlay 的 → 我们的）。
  名字都是 “WestPlay tablet”，但装进 `仪表(set_dashbrd)` 槽后，游戏会把该车的仪表布局切到我们改写过的那份
  （日志里 `screen layout: renault-t-2024`），于是**不需要平板模型**也能显示；`挂件(toyhang)` 槽则是多一台挂在
  驾驶室里的平板。

### 22.8 再追问：原生支持到底覆盖到哪一步（2026-10-31 上午）

owner 的疑问：“插件自己没主动占槽位；按理说 WestPlay 原生支持的不用改装也能显示。” —— **结论：原生支持是真的，
而且 owner 现在正是这样跑着的；但它是绑在“某个仪表脚本”上的，不是“任何仪表”。**

模组里三份 Renault T 的脚本，各自干了什么（直接解包 `westplay.scs` 看到的）：

| 模组里的文件 | 里面加了什么 | 效果 |
|---|---|---|
| `ui/dashboard/renault_t_2024_gps.sii` | 一张 `_nameless.westplay.screen`，`<img src=/material/ui/westplay/screen_renault_t_2024.mat>` | **卡车自己的 GPS 仪表屏 = WestPlay 的屏**（原生，不用装任何部件） |
| `ui/dashboard/renault_t_2024_uk.sii` | 只有 `_nameless.westplay.cab`（`cab_mark.mat`） | 只给“驾驶室被画过”做个标记，**屏还是游戏的**（UK/mph 变体） |
| `ui/dashboard/renault_t.sii` | 同上（只有 cab mark） | 同上（老 Renault T 的仪表脚本） |

`crates/shared/screen_layouts.txt` 里 `renault-t-2024` 也只登记了 `ui/dashboard/renault_t_2024_gps.sii` 这一份
脚本 —— 也就是说：**WestPlay 在雷诺 T 2024 上的原生支持 = 它的 GPS 仪表变体**。卡车配置里如果用的是别的仪表
变体（UK/mph、或游戏的普通仪表），模组只留了个 cab 标记，屏就还是游戏自己的（今早看到的就是这种）。

另外那条看着像报错的日志其实是**设计如此**：

```
[ 2207.291] screen: tablet isn't WestPlay's in vehicle.renault.t, the game's own shows
```
= “这块平板不是 WestPlay 的（因为这台车**卡车自己的屏已经是我们的**了，见 `shows_here()`：
`supported && !(tablet && (blank || own_seen))`），平板保持游戏原样”——**故意留白**，免得同时出现两块屏。

**还没定死的**：今早那次“游戏自己的内容”，究竟是这辆车存档里的仪表**变体**不是 GPS 那份，还是那个槽位里
装的是游戏自己的设备。要在配置器里看一眼这辆 Renault T 2024 的仪表选项列表（有哪些、现在选的是哪个）才能确定。

**如果确认是变体问题**，改法很小：把该车另外那几份仪表脚本（`renault_t_2024_uk.sii`、`renault_t.sii`）也当成
布局加进 `screen_layouts.txt`（或让 mod 构建器把同一个车的所有仪表脚本都打上屏），这样任何变体都不用手动改装。
（外部任务禁用模组这条，owner 10:20 实测**排除**：接着外部任务照样显示。）

### 22.9 从玩家自己的游戏里读出来的事实（2026-10-31，加入 `westplay-setup` 的只读诊断测试）

owner 更正：**10-30 23:00 左右才换成这辆雷诺 T**。这解释了“昨天能显示、今天不能”——昨天是另一辆车。

为了不再猜，我加了一个**只读**的忽略测试（`cargo test -p westplay-setup -- --ignored --nocapture
the_games_dashboards_of_one_truck`，读玩家自己装的游戏，不改任何东西），把雷诺 T 的仪表脚本与内饰的
`gps_path` 全列出来。结果（`E:\SteamLibrary\steamapps\common\Euro Truck Simulator 2`）：

- `ui/dashboard` 里雷诺相关的脚本：`renault_t.sii`、`renault_t_2024.sii`、`renault_t_2024_cam_mirrors.sii`、
  `renault_t_2024_gps.sii`、`renault_t_2024_uk.sii`（另有 etech/magnum）。
- **2024 款驾驶室的全部内饰**（`computers_2024.sui` / `computers_2024_uk.sui`）都写
  `gps_path: "/ui/dashboard/renault_t_2024_gps.sii"` —— 正是我们原生支持的那份 ✓。
- **老款 T 的驾驶室**（`standard_19_*`、`exclusive_21_*`、`black_19_*`、`exclusive_high` 等）写的是
  `gps_path: "/ui/gps.sii"` = **generic** 布局，而 `SHARED_LAYOUT_TRUCKS` 里 generic 只对
  `scania.s_2016 / scania.r_2016 / scania.s_2024e` 开放 —— 雷诺 T 不在其中，插件**故意不接管**（那句
  `screen: generic isn't WestPlay's in vehicle.renault.t, the game's own shows` 就是它）。
  原因在 `screen_layouts.txt` 的注释里：generic 是“大多数卡车共用的原版 GPS 屏”，对大多数车它其实是
  **游戏的路线顾问 HUD**，不是车里的实体屏；只有 Scania S/R 的 7" 实体屏才是 WestPlay 的。

**结论**：
- 2024 款雷诺 T → 原生支持，**不用装任何部件**就该显示 ✓（owner 的预期正确）；
- 老款雷诺 T（19/21 驾驶室）→ 车里压根没有我们能接管的实体仪表屏，`set_dashbrd` 槽里的
  **WestPlay tablet** 才是显示途径（owner 今天装的就是它，中控因此亮起 ✓）；
- 两条路**不冲突**：卡车自己的屏已经是我们的时，平板被故意留白（§22.7）。

**待 owner 确认**：这辆 T 是 2024 款还是老款（看驾驶室：2024 = 大尺寸数字仪表；老款 = 指针表 + 无实体屏）。
- 是 2024 款 → 今早“没显示”就还有别的原因，我再加探针查（比如 mod 挂载/缓存时序）；
- 是老款 → 一切解释得通，就这么用（平板上屏），我把这条写进玩家向说明。

### 22.10 2024 款雷诺 T 的真相：我们只补了“导航页”，没补仪表自己的那一页（2026-10-31）

把玩家游戏里的两份脚本读出来对比，一眼就清楚了：

| 游戏文件 | 行数 | 里面有什么 | 我们的补丁 |
|---|---|---|---|
| `ui/dashboard/renault_t_2024.sii` | 1899 | **仪表自己的那一页**，含 `id: 100` 组（画 `/material/ui/dashboard/renault_t_2024/display.mat` 的那块中央显示屏） | **没有补** ← 这就是今早“没显示”的原因 |
| `ui/dashboard/renault_t_2024_gps.sii` | 526 | **导航页**（地图那一页），内饰的 `gps_path` 指的就是它 | 补了（`screen_layouts.txt` 里 `renault-t-2024`） |
| `ui/dashboard/renault_t_2024_cam_mirrors.sii` | — | 摄像头后视镜那款：**没有 `id: 100` 组**（它的屏是门上的镜子） | 不能补（构建器会报 `no group with id 100`） |
| `ui/dashboard/renault_t_2024_uk.sii` | — | 英国版仪表页 | 补了（新加） |

2024 款 T 的**全部内饰**都把 `gps_path` 指向**导航脚本**，所以我们原生的那块屏只在**仪表显示导航页**时
才被画（有路线/任务时）；**没接任务**时仪表停在“自己的那一页”，游戏画的是它自己的内容 ——
owner 今早看到的正是这个（日志里我们的贴图 `view made` 了却始终 `screen textures in use: 0`），
而装了平板就亮，是因为**平板是自己的模型、走 3D 通路，跟仪表哪一页无关**。

**改法**（已做）：把 `ui/dashboard/renault_t_2024.sii` 与 `_uk.sii` 也加进 `renault-t-2024` 这个布局的
脚本列表（`crates/shared/screen_layouts.txt`），这样模组会**同时**给仪表自己那一页的 `id: 100` 组盖上我们的屏 →
不接任务、不装平板也应该显示。`_cam_mirrors.sii` 因为没有 `id: 100` 组而排除（构建器会拒绝，这是设计：
表里写的脚本必须能补，否则说明游戏改版了）。

- 构建验证：`cargo test -p westplay-setup -- --ignored --nocapture builds_the_mod_from_the_installed_game`
  → `patched` 含 `renault-t-2024` ✓，`missing` 只有没装的客车 mod。
- 新模组 `%TEMP%\westplay.scs`（1,700,132 B，旧版 1,818,234 B）已放到
  `Documents\WestPlay\westplay.scs.new` 等游戏关闭后替换（游戏运行时锁着原文件）；旧版备份为
  `westplay.scs.bak-20261031`。
- 插件 DLL 不需要跟着换：布局的**索引没变**（只是给同一行加了脚本），插件还是按贴图尺寸认屏。
- 之后要把 app 一起重打（`screen_layouts.txt` 也编进了 setup/host），让“安装/修复”自己就能构建出这一版模组。

### 22.11 教训

“原生支持”这句话要落到**具体哪一份脚本**：同一辆车可能有好几份仪表脚本，各是一页；我们补了哪一页，
就只在那一页显示。下次接一辆新车，先用 `the_games_dashboards_of_one_truck` 这个只读测试列出
`gps_path` 与各脚本的 `id: 100` 组，再决定补哪些。

### 22.12 补丁生效（owner 2026-10-31 11:23 实机）

换上补了三份仪表脚本的模组后，**不装任何部件**：

```
插件 [ 486.274] screen texture loaded: renault-t-2024 (1 in use)
插件 [ 486.274] screen: renault-t-2024 shows WestPlay in this truck: the tablet kept blank in it
插件 screen textures in use: 1（此后一直 1）
宿主 11:23:15  WestPlay's screen in view 100% of the time
```

即：**雷诺 T 2024 的仪表中央屏 = WestPlay，不用装平板、不用接任务** ✓ —— owner 期待的“原生支持不用改装”成立。
owner 问到“仪表盘也能显示 WestPlay 是不是 bug”：不是，这正是设计——补丁只把我们的整屏图作为 **`id: 100`（显示屏组）
的最上层**，仪表的表盘/指针/警示灯在别的组（`id: 1000`、`1100` …）里，不受影响；被替换的只是那块**显示屏的内容**
（游戏自己的路线/行程信息）。若想保留游戏那页、只用平板看 WestPlay，把布局那一行改回只列 `_gps.sii` 即可（一行）。

### 22.13 owner 选 B（2026-10-31 11:35）：仪表只补导航页

- **定案**：`screen_layouts.txt` 里 `renault-t-2024` 恢复成只列 `ui/dashboard/renault_t_2024_gps.sii`（A 那次加的
  `renault_t_2024.sii`/`_uk.sii` 撤掉）。语义：**仪表在导航页时显示 WestPlay（有路线/任务），仪表自己那一页保留
  游戏的行程信息；想任何一页都常显就装 WestPlay tablet**。撤掉后构建出来的模组与 10-30 那份**逐字节相同**
  （SHA256 `F9534E25F959F932…`），即“回到改动前”。
- **一个重要的坑（记下来）**：`westplay.scs` 是 **app 自己构建**的（`crates/setup` 的安装流程，启动时也会重建），
  构建时会算出 **cab mark**（“相机在不在驾驶室里”的标记，分布在该车仪表脚本里；本次 34 个脚本带它）。
  我手工用诊断测试构建的那份用了 `cab_mark::Marks::default()` → **没有这些标记**，尺寸 1,690,332 B（vs 完整版
  1,818,234 B）。手工换上去的那份虽然能让仪表显示 WestPlay，但会**丢掉 cab mark**（影响“车内/车外”判断与
  空间音频）。**以后模组的改动一律靠 app 重启重建，不要手工替换。**
- 现状：模组 = app 构建的完整版（1,818,234 B，293 项，34 个脚本带 cab mark，`_gps.sii` 有我们的屏、仪表页没有）。

## 23. 2026-10-31 收尾：雷诺 T 2024 的结论、A/B 定案、产物重打

- **雷诺 T 2024**（owner 已实机确认）：不用装任何部件；**仪表在导航页**（有路线/任务时）显示 WestPlay，
  **仪表自己那一页**保留游戏的行程信息（owner 选 B，见 §22.13）；想任何一页都常显就装 **WestPlay tablet**。
- **老款雷诺 T**（19/21 驾驶室）的内饰把 `gps_path` 指向 `ui/gps.sii`（generic），而 generic 在我们的白名单里
  只对 Scania S/R 开放 —— 车里没有我们能接管的实体屏，**必须装 WestPlay tablet**（§22.9）。
- **两条路不冲突**（§22.7）；**“仪表/平板两条路”这件事本身不是 bug**（§22.12）。
- **方法沉淀**：新增只读诊断测试 `westplay-setup` 的 `the_games_dashboards_of_one_truck`
  （列出某车所有仪表脚本与每个内饰的 `gps_path`，判断该补哪一页）；文档把“哪份脚本 = 哪一页”的因果关系写清楚。
- **教训**：`westplay.scs` 由 app 自己构建（含 cab mark），**不要手工替换模组**（§22.13）。
- **产物**：安装包 `WestPlay_2.1.4_x64-setup.exe` **9,793,383 B**，SHA256 `9B78E8BC23ED75E5CBE544F1C86516DEB2F8BD2555110E56B4347A975385F2C1`；
  完整源码 `D:\\WestPlay-2.1.4-src-full.zip`；改动文件 `westplay-mods-src-214.zip`。
  装配：exe 24,096,768 B、ui 69 个文件与 dist 一致；`tsc -b` 干净，`vitest run` 66 文件 / 466 测试通过。

---

## 24. 两个新功能：网页 App 的 Ctrl+滚轮缩放、屏幕刷新率（2026-10-31 下午）

需求原话：“**1.给webapp添加按住Ctrl+鼠标滚轮可以自适应缩放的功能 2.将帧率锁定到60，并在外观设置里面添加一个屏幕刷新率选项，包含60hz和30hz**”，
追加：“完成后合并到已有版本，记得打包”“记得把选项汉化了”；同一晚追加：“**放大做成无极放大而不是固定倍率**”、把设置里壁纸轮换的描述改成
“**启用后，每次重新启动卡车时随机轮换一张壁纸**”（见 §24.7）。

### 24.1 网页 App 按 Ctrl + 滚轮缩放（无级）

**行为**：用屏幕时（按住交互键，鼠标进得到站点页面），光标在站点页面上、**按住 Ctrl 滚滚轮** → 页面的像素缩放：
远离自己的方向放大、朝自己的方向缩小；范围 **0.5×–2.0×**。网页自己的滚动不受影响（Ctrl 没按时滚轮照旧发给页面）。

**无级（stepless）是怎么做到的**（owner 2026-10-31 晚要求：“不要固定倍率”）：

| 一层 | 做法 |
|---|---|
| 粒度 | 缩放直接跟**滚轮自身的计数**（一个刻度 = 120 counts）：`zoom × (1 + 0.00035 × counts)`。一个刻度约 4.2%，**不是**固定台阶；只转了半个刻度（高分辨率滚轮、触摸板、甩一下）就只走半个刻度那么多 —— 这是“无极”的本体 |
| 平滑 | 缩放不是立刻跳过去：`Wanted`（滚轮要的）与 `player_zoom`（正在显示的）分开，`WebApp::tick()` 在**宿主每轮循环**里把后者向前者收敛（按这一轮过去的时间算，每秒收敛约 20 的指数逼近，单轮最多走 25%），所以一次滚动看起来是一段连续的缩放，而不是一跳一跳 |

`player_zoom_for()` / `zoom_share()` 两个纯函数把这两层数学单独拎出来，单测直接断言
（一个刻度 ≈ ×1.042、十二分之一刻度 ≈ ×1.004、两端 clamp、16 ms 一轮走 20–25%）：
`the_wheel_zooms_the_page_steplessly_by_its_own_counts`、`the_page_settles_toward_the_wheel_without_jumping`。

**链路（没有动桥的共享内存布局，插件一行没改）**：

| 环节 | 文件 | 做什么 |
|---|---|---|
| 取 Ctrl | `crates/host/src/pointer.rs` 新 `ctrl_held()` | 宿主自己 `GetAsyncKeyState(VK_CONTROL)` 问 Windows：玩家的键盘在游戏手里，这样问比往 `PointerBlock` 加字段省事，**旧插件/新宿主也不会对不上**（共享布局没变） |
| 吃滚轮 | `pointer.rs::update` | 光标落在站点页矩形内 + Ctrl 按住 + 这一批有滚轮增量 → **不发给页面**，把这批**计数**放进 `Mouse::zoom` 带回去 |
| 应用 | `crates/host/src/lib.rs` | `if mouse.zoom != 0 { app.zoom_by(mouse.zoom) }`（只记下想要的）；每轮再 `app.tick(Instant::now())` 收敛一次 |
| 缩放模型 | `crates/host/src/webapp.rs` | `zoom` 拆成 **`fit`**（按房间宽度的自动适配，≤1.0、地板 0.55，就是 §9 那套）、**`wanted_player_zoom`**（滚轮要的）与 **`player_zoom`**（正在显示的，0.5–2.0）；真正 `set_zoom` 的是 **`fit × player_zoom`**，夹在 0.28–2.0 |

**为什么不能简单地乘一下（这是这次唯一的设计点）**：自动适配算的是「页面**当前**报的房间/排版宽」的比值，
如果玩家的放大也乘在里面，下一次报告会把放大又抵掉（放大后页面排版更窄 → 比值把 `fit` 压回去 → 玩家按了没反应）。
所以定成：

- **玩家放大（`player_zoom > 1`）时 `fit_width` 直接不介入**：页面会比洞宽、右端看不全——这是页面缩放的正常代价，
  玩家再滚回去就行（也说明这个功能不影响原来“打开即自适应、右侧不被切”的默认行为：没动滚轮就还是 `player_zoom = 1`）；
- **玩家缩小（< 1）时 `fit` 照旧工作**：页面变小后比值自然 ≥ 0.97，不会再被压小；
- `zoom_back()`（换页/回主页/刷新）**只把 `fit` 复位，玩家的缩放保留**：同一站点里一直有效（换站点会重建 WebApp，回到 1.0）。

**其余细节**：

- 页面看不到 Ctrl：`virtual_keys()` 仍只带鼠标按键（没把 `CONTROL` 位传给 WebView2），所以 **Ctrl+点击 不会变成页面的“Ctrl+点击”**；
- App 没显示时 `over` 是 `None`，滚轮不进缩放（也不会误吃仪表盘/地图上的滚轮）；
- 日志一行、**一整次滚动才一行**（收敛到位才写）：`webapp: the player's own zoom 1.21x: the page's pixels are 1.21 the frame's (1.00 is its own size)`；
  早期实现在每个滚轮批次都写一行，滚一屏就是十几行——已改掉；
- 探针一行没加：这条链路没有站点 DOM 依赖，改版也不会失效。

### 24.2 屏幕刷新率（60 Hz / 30 Hz，外观设置里）

原来 `capture.rs` 是**编译期常量** `MAX_FPS = 60`（`FRAME_INTERVAL` 由它算）。现在是一个设置项：

| 环节 | 文件 | 说明 |
|---|---|---|
| 设置 | `crates/host/src/settings.rs` | `ScreenSettings.refresh_rate: RefreshRate`（JSON 里 `"60"` / `"30"`，缺省 60，坏值回退 60），随 `settings.json` 保存 |
| 帧率 | `crates/host/src/capture.rs` | `MOST_FPS = 60` + `interval_for(fps)`；`Mailbox` 的间隔可 `set_interval`；对外 `Capture::set_fps(fps)` |
| 应用 | `crates/host/src/lib.rs` | 设置变化时 `pipeline.capture.set_fps(rate.hz())`；**新建 capture 时也补一次**（新管道默认 60，不然切 GPU/重连后设置会丢） |
| 界面 | `ui/src/cabin/apps/settings/SettingsApp.tsx`（**外观**页） | 一行两段式按钮 **60 Hz / 30 Hz** + 页脚说明；`settings.css` 的 `.refresh-rate-row/.refresh-rate-choice` |
| 汉化 | `ui/src/cabin/state/strings.ts` | `refreshRate` / `refreshRateFooter` / `hz60` / `hz30` 三语（中/英/土），漏翻 `tsc` 直接报错 |
| 消息 | `ui/src/shared/host.ts` + `cabin/state/store.ts` | 新页面消息 `{"type":"refreshRate","rate":"30"}`（和 vehicleBar 同一套：界面选、宿主存进设置）；宿主回给页面的 `settings` 消息新增 `refreshRate` |
| 页面 | `ui/src/cabin/maps/frameCap.ts` + `store.ts` | 地图自绘上限跟着刷新率走（`setMapFps`）：30 Hz 时不再白画 60 次（地图每帧重画全部可见 3D 建筑，§9 那条注释） |

- **兼容**：旧宿主不发 `refreshRate` → 页面按 60 Hz 处理；旧 `settings.json` 没有这一项 → 60 Hz（测试 `missing_settings_take_their_defaults` 有断言）。
- **代价**：30 Hz 是「每两帧送一帧」，画面明显不如 60 顺（本来就是给弱机器省电/省 GPU 用的），`performance` 日志里的
  `N frames a second sent` 会跟着变成约 30。

### 24.3 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **66 文件 / 469 测试通过**（新增 3：`connectHost` 的刷新率跟随与上报、`frameCap` 的 30 Hz 上限与回到 60） |
| `cargo test -p westplay-host --lib` | **207 通过 / 0 失败**（新增 `capture::the_players_own_refresh_rate_sets_how_often_frames_go_out`、`pointer::the_zoom_is_only_taken_over_the_site_s_page`、`webapp::the_wheel_zooms_the_page_steplessly_by_its_own_counts`、`webapp::the_page_settles_toward_the_wheel_without_jumping`，settings 的刷新率断言、lib 的 `refreshRate` 页面消息与 `settings` 消息断言） |
| `node --check crates/host/src/webapp.js` | 通过（页面脚本这次没改，仍跑一遍） |
| 产物 | 见 §24.4 |
| 实机 | 见 §24.5（等 owner） |

### 24.4 产物（本次重打）

| 产物 | 值 |
|---|---|
| `westplay.exe` | **24,178,176 B**（10-31 16:33，含无级缩放那版；上一版 24,146,944 B） |
| `westplay.dll` | **552,448 B**（10-31 15:17；插件源码本轮没动，dll 与上一版逐字节相同） |
| `ui/dist` | 69 个文件（与装机目录逐项一致） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **9,807,923 B**（9.35 MiB），SHA256 `F9FB658D4C84357B74F226DDD77D2AFFBF06CD03F5785CF75C359D96C491E1A9`；已放到 `D:\WestPlay_2.1.4_x64-setup.exe`（第一次打包是 9,804,197 B / `15E25364…`，无级缩放改完重打） |
| 装配 | exe + dll → `D:\WestPlay`；dll → 游戏 `…\bin\win_x64\plugins\`；`ui\dist` → `D:\WestPlay\ui`（robocopy /MIR，**旧的 hashed chunk 已清掉**） |
| 启动检查 | 16:34:47 启动：`app: started → host: started → cabin browser (WebView2) ready → page: running (its scripts loaded)`，零错误；查完即关（现在没在跑）。`westplay.scs` 没被重建（1,827,518 B，本轮没动 `screen_layouts.txt`，模组不用换） |
| 新代码在产物里 | 部署的 exe 里能搜到 `the player's own zoom` 与 `refreshRate`；部署的 ui（`cabin-BGOWxeR2.js`）里能搜到 `启用后，每次重新启动卡车时随机轮换一张壁纸`、`refresh-rate-choice` |
| 源码包 | 两个包都重新导出了：`D:\WestPlay-2.1.4-src-full.zip`（完整树：`src/` 627 文件 + `_docs/` 4 + README）与 `westplay-mods-src-214.zip`（相对纯净 2.1.4 的改动文件 97 项，本轮新增 11 个）。**哈希不写在这里**：包里就含这份文档，写进来会自我矛盾（安装包的哈希没这个问题，见上一行） |

> Tauri 这次**自己下载了 NSIS**（本机 `%LOCALAPPDATA%\tauri\NSIS` 原本是空的，GitHub 可达所以成功）。
> 离线机器仍要按 PLAN §6.1 手工放好 NSIS 布局；另一条路是用 `D:\nsis\nsis-3.11\makensis.exe` 配
> `wp213-patches/setup/installer.nsi`（owner 自用的那套，产物名 `WestPlay-Lite-*.exe`）。

两个和脚本/文档有关的注意点：

- **exe 不是字节可复现的**：同一份源码、同一套配置，两次 `tauri build` 出来的 `westplay.exe` SHA256 不同（PE 头里的链接时间戳），
  **大小一致**（24,146,944 B）。所以别拿「部署的 exe 与 target 里的 exe 哈希一致」当校验，比大小 + 看启动日志即可；
  `westplay.dll` 与 `ui/dist` 是可复现的，逐文件哈希对比有意义（本次都比过）。
- **打安装包那一步会重编 exe**：`tauri build --config app/tauri.installer.conf.json` 把合并后的 `bundle.*` 配置内嵌进二进制，
  于是 `target\release\westplay.exe` 被换成「安装包那一版」。日常装配（`--no-bundle`）之后又打了安装包的话，
  想再拿 exe 记得**重新 `--no-bundle` 编一次**（两份功能相同，只是内嵌配置文本不同）。

### 24.5 实机验证（待 owner 确认）

- **缩放**：开 QQ 音乐/网易云/B站，按住交互键 + Ctrl 滚滚轮 → 放大/缩小；换页、回主页后缩放仍在；松手后滚轮仍能滚页面。
- **刷新率**：设置 → 外观 → 屏幕刷新率切到 30 Hz → 画面更新变一半（`performance` 日志 `… frames a second sent`）；
  重启 WestPlay 后仍是 30 Hz（设置文件里存着）。

### 24.6 这次构建环境的三个坑（换机器/重装后必看）

这台机器**原本没有 Rust，也没有 npm**（Node 只有 DSH 自带的那套），构建前先补齐：

1. **Rust**：`rustup-init.exe`（自 `static.rust-lang.org`，本机可达）+ `RUSTUP_DIST_SERVER=https://rsproxy.cn` 装
   `stable-x86_64-pc-windows-msvc`；`~/.cargo/config.toml` 把 crates.io 换成 `sparse+https://rsproxy.cn/index/`。
   **注意**：第一次用 `rustup-init -y …` 时 PowerShell 5.1 会把它的 stderr 当错误终止脚本，工具链没装完；
   要 `cmd /c "… > log 2>&1"` 重定向，或事后补 `rustup toolchain install`。
2. **npm**：`node` 与 `pnpm` 都有（DSH 运行时里），**没有 npm**。构建脚本里的 `npm run …`（`tauri.conf.json` 的
   `beforeBuildCommand`、`ui` 的 `cross-env WESTPLAY_RELEASE=1 npm run build`）靠一个转发脚本顶上：
   `D:\wp-build\bin\npm.cmd` → `node <pnpm.mjs> %*`；**并把 node 所在目录加进 PATH**（否则 pnpm 生成的
   `.CMD` 包装器里 `node` 找不到，报 `'node' is not recognized`）。
3. **MSVC 的 D8050**：`CARGO_TARGET_DIR` 指向很深的路径时（`…\default-workspace\WestPlay-2.1.4-src-full\src\target`），
   `cl.exe` 编 `minhook` 的 C 文件报 `error D8050: 无法执行 c1.dll / 未能将命令行放入调试记录中`（`cargo check` 也会踩）。
   **把 target 放到短路径**（`D:\wp-build\target`）即可；用 `vcvars64.bat` 包一层**没用**（不是环境变量的问题）。
   所以：构建一律 `CARGO_TARGET_DIR=D:\wp-build\target`；而**打安装包**时那一步要在源码树里补一份 dll
   （安装包配置里写的是 `../target/release/westplay.dll`，相对 `app/` 解析）：
   ```powershell
   New-Item -ItemType Directory -Force "$src\target\release" | Out-Null
   Copy-Item D:\wp-build\target\release\westplay.dll "$src\target\release\westplay.dll" -Force
   ```
   （另一条完全绕开它的路：用本机 `D:\nsis\nsis-3.11\makensis.exe` 配 `wp213-patches/setup/installer.nsi` 自己打，
   产物名是 owner 自用的 `WestPlay-Lite-*.exe`。）

### 24.7 设置里壁纸轮换的说明文字（owner 2026-10-31 晚）

owner 指定：把**设置 › 壁纸 › 壁纸轮换**那一行下面的说明改成

> **启用后，每次重新启动卡车时随机轮换一张壁纸**

只改文案，**行为一行没动**（`cabin/state/wallpaperRotation.ts`：`settingsShown()` 管 App 启动那一次，
`followWallpaperRotation()` 管电门 false→on 那一次；`MIN_GAP_MS = 400` 合并同一瞬间的几条消息）。
三语同步改了（`ui/src/cabin/state/strings.ts` 的 `wallpaperRotationNote`）：

| 语言 | 现在的说明 |
|---|---|
| 中文 | 启用后，每次重新启动卡车时随机轮换一张壁纸 |
| English | On, a random wallpaper each time the truck is started again. |
| Türkçe | Açıkken, kamyon her yeniden çalıştırıldığında rastgele bir duvar kâğıdı. |

旧的文案是“每次上电换一张，熄火马上再打火也算。”／“A different one every time the truck is powered up, however short.”
—— 说的其实是同一件事，但把“熄火马上再打火也算”这句容易让人以为**短时间重复打火**会连换多张**去掉**了。

---

## 25. 插件自带的输入法加上中文：座舱里的拼音输入法（2026-10-31 晚）

需求原话：“**让插件自带的输入法支持输入中文**”（owner 选定：所有输入框都要、词库做到常用单字 + 常用词组）。

### 25.1 为什么不能借系统的输入法

WestPlay 打字这条路的入口在**游戏里**：插件把玩家的按键从游戏手里抢过来（`crates/plugin/src/typing.rs`
的键盘钩子），用 `ToUnicodeEx` 按玩家自己的 Windows 布局换成字符，再走桥给宿主。也就是说：

- 按键**根本没到** Windows 的 IME 那里 —— 微软拼音一个字母都收不到，自然没有候选；
- 就算它在别处组装出来，它的候选窗口也是**桌面上的窗口**，不可能出现在卡车的屏幕上。

所以中文只能由 WestPlay 自己实现：**拼音在座舱里组装，候选在座舱屏幕上选**。

### 25.2 做到的样子（玩家的手感）

中文键盘（游戏语言是中文时默认，或用地球键切到中文）下：

| 操作 | 结果 |
|---|---|
| 打字（自己的键盘 / 屏幕键盘的字母） | 字母进了键盘上方那条**拼音栏**，不直接进输入框；栏里按音节分段显示，如 `ni hao` |
| 候选 | 栏里一排候选字/词，**空格选第一个**，**数字键 1–9** 选对应的，**鼠标点**也行（第一个是填色的那个） |
| 选词 | 整个拼音命中的词排在最前（`nihao` → 你好、`beijing` → 北京），选中就把整词写进输入框 |
| 选单字 | 一次只选**第一个音节**的字：`nihao` 按 2 选“你”，栏里剩下 `hao`，再按 1 选“好” |
| 退格 | 拼音还有字母时**退一个字母**；没有在组装时才是输入框自己的退格（长按仍然连删） |
| 回车 | 先把第一个候选写进去，然后回车照旧（搜索/前往/完成） |
| Esc | 把这次组装**收掉**（不写进输入框）；没在组装时才是收键盘 |
| 地球键 / 别的语言 | 组装中的字母**原样写进输入框**（不丢字），然后按那个语言打字 |
| 想打英文 | 直接输字母（`abc`）没有候选时，空格/回车把字母原样写进去 —— 和真输入法一样 |

边界规则：`xi'an` 里的撇号是**音节切分**（`xi`+`an` → 西安），不写进输入框；`xian` 不切，按一个音节算（先/线/现…，
西安排在这排候选的后面）。这条是为了不让 西安 顶掉最常见的“先”。

**怎么进入中文键盘**：中文是键盘语言之一。**默认跟着游戏的语言** —— 游戏是 `zh_cn`（本机就是）时键盘本来就是中文；
游戏是英文/土耳其语时，用键盘左下角的**地球键**切过来：**英文 → 中文 → 土耳其 → 英文**（切一次就到中文）。
中文模式下打字母不会直接落进输入框，而是先进拼音栏。

### 25.3 链路（四段，插件与桥一行没改）

| 段 | 文件 | 做什么 |
|---|---|---|
| 引擎 | `ui/src/cabin/keyboard/pinyin.ts`（新） | 纯函数：`syllablesIn`（贪心最长匹配切音节，撇号是边界）、`candidatesFor`（整串命中的词 + 第一个音节的字，一到九条）、`pick`（选中的字/词 + 剩下的拼音）、`pinyinKey`/`digitChoice`/`rawText`、`loadTable`（懒加载词库） |
| 词库 | `ui/public/chinese/pinyin.json`（生成物，614 KB / gzip 213 KB） | `{chars: {音节: "候选字串"}, words: {拼音: [词…]}}`，**第一次打中文才 fetch**，不打中文的玩家一分钱不花 |
| 键盘 | `ui/src/cabin/keyboard/store.ts`（改）、`Keyboard.tsx`（改）、`keyboard.css`（改） | store 里多一个 `composing`（拼音缓冲）与 `table`；中文时字母进缓冲、空格/数字/鼠标走选字；`Keyboard.tsx` 画那条拼音栏（候选带 1–9 的小号数字） |
| 宿主 | `ui/src/shared/host.ts`（新页面消息）+ `crates/host/src/lib.rs`（`PageMessage::Ime`） | 网页 App 的输入框是**页面自己的**（`playerTypes: false`），物理按键本来是**宿主直接送进网页**的：中文时要拦住，否则网页会同时收到组装用的字母。所以界面在「中文 + 网页输入框」时发 `{"type":"ime","on":true}`，宿主在那之后**不再把 typed 直接送进页面**，改由界面按整段文字写（`webAppText`，和屏幕键盘一贯的做法一样）；切回别的语言或关掉键盘时发 `on:false` |

### 25.4 词库是生成的，不是手写的（`tools/chinese/build_pinyin_table.py`）

| 来源 | 许可 | 给什么 |
|---|---|---|
| pinyin-data | MIT | 每个字的读音（`U+4E00: yī`） |
| rime-essay | LGPL-3.0 | **词表与词频** —— 候选的先后顺序就是它的 freq；顺带决定“哪些词值得给” |
| OpenCC 的 `TSCharacters.txt` | Apache-2.0 | 繁→简（`漢`→`汉`）：essay 的词偏繁体（中國/謝謝/什麼），不转换这些词会被“常用字表”过滤掉 |
| phrase-pinyin-data | MIT | 词组的**正确读音**（银行是 yín háng，不是 yín xíng），拿不到时退回逐字首读音 |
| pinyin-data 的 `china-8105` | MIT | 通用规范汉字表 8,105 字：什么算“值得给的字”，避免生僻异体字 |

产物实测：**415 音节 / 7,051 字 / 22,994 键 / 25,040 词**（2 字 13,128、3 字 5,812、4 字 6,100）。
阈值在脚本顶部的 `LEAST_WORD_FREQ = {2: 1500, 3: 1200, 4: 800}`（rime-essay 的频次尺度：的 4,822,928、
工作 177,744、壁纸 4,125、仪表盘 718）。抽查的排序：`ni`→你呢拟尼泥、`shi`→是时事使市式、`de`→的地得德、
`guo`→过国活果郭、`nihao`→你好、`xiexie`→谢谢、`shenme`→什么、`yinyue`→音乐、`beijing`→北京。
三个数据来源的声明都进了 `THIRD_PARTY_NOTICES.md`（§“The Chinese input method's table”）。

### 25.5 代价与已知限制

- 只有**拼音全拼**：没有双拼、五笔、手写，也不做声调数字；
- 候选只到**第一个音节**（+整串命中的词）：跨音节的自由组合（如“的”+“时候”拼成一句）要靠一个一个字选；
- 词库里没有的词（或要打繁体）：数字键选不到，但**字母原样提交**这条路永远在（`rawText`）；
- 只在**选中的输入框**里工作：键盘收起来/换输入框，组装中的拼音就没了（和系统输入法一样）；
- 词库是**简体**的（`china-8105` + OpenCC 繁→简），不提供繁体候选；
- 第一次打中文会读一次 614 KB 的表（本地文件，几十毫秒级）。

### 25.6 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **68 文件 / 489 测试通过**（新增 20：`pinyin.test.ts` 14 个（切音节/撇号/候选顺序/选字/键的取舍/词库只取一次）+ `ime.test.ts` 6 个（屏幕键盘拼拼音并选词、数字选单字后继续组装、物理键盘组装且不进输入框、Esc 收掉、网页输入框时通知宿主拦住按键、其它语言不受影响）） |
| `cargo test -p westplay-host --lib` | **207 通过 / 0 失败**（新增 `{"type":"ime",…}` 的解析断言） |
| 生成器 | `python tools/chinese/build_pinyin_table.py` 可重跑（`--data` 用现成的下载，`--cache` 换缓存位置） |
| 产物 | 见 §25.7 |

### 25.7 产物（本次重打）

| 产物 | 值 |
|---|---|
| `westplay.exe` | **24,372,736 B**（10-31 18:00；含中文输入法与无级缩放） |
| `westplay.dll` | **552,448 B**（15:17；插件源码这一轮也没动） |
| `ui/dist` | **70 个文件**（69 + `chinese/pinyin.json` 614,205 B） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,177,637 B**（9.71 MiB），SHA256 `FDB930AE9F39D021706688CF9540DA70400D5958B38360CEAB7CBCF2BCA5283B`；已放到 `D:\WestPlay_2.1.4_x64-setup.exe` |
| 装配 | exe + dll → `D:\WestPlay`；dll → 游戏 `…\bin\win_x64\plugins\`；`ui\dist` → `D:\WestPlay\ui`（robocopy /MIR） |
| 启动检查 | 18:02:50 启动：`host: started → cabin browser ready → page: running`，零错误；查完即关。`westplay.scs` 没被重建（本轮没动屏幕布局表） |
| 词库 | 部署的 `D:\WestPlay\ui\chinese\pinyin.json` 与 `ui/dist` 的**逐字节相同**（614,205 B，SHA256 `b4d8e37e…`），解析后 415 音节 / 25,040 词，`nihao/xiexie/shenme/beijing/yinyue` 都在 |
| 代码风格 | 新文件过 `prettier --check`（`.prettierrc.json`：无分号、单引号、120 列）；**格式化后重建的 UI bundle 与部署的逐字节相同**，所以不用重打包 |

实机验证（待 owner）：中文键盘下打 `nihao` → 拼音栏出现、空格得“你好”；数字 2 选“你”后栏里剩 `hao`；
在 QQ音乐/网易云的搜索框里同样能打（这时宿主会把物理按键拦下来，不再直接透传给网页）；`abc` 之类的字母能原样落进输入框。

### 25.8 第一版“输入依然是英文”（owner 当天发现，已修）

owner 试完回：“**没有，输入依然是英文**”。查下来是两个原因叠在一起，第一个是硬 bug：

1. **地球键根本切不到中文**（真 bug）。`layouts.ts` 的 `otherLanguage` 一直是「英文与土耳其语互换，中文落到英文」：

   ```ts
   // 改前
   return language === 'tr' ? 'en' : language === 'zh' ? 'en' : 'tr'   // en ↔ tr，zh → en
   ```

   于是键盘**只有 en/tr** 两个状态：一旦按过地球键（或本次会话里选过别的语言），中文就再也回不去了 ——
   键盘语言在**一次会话里记住**（`store.ts` 的 `chosen`），之后每选一个输入框都还是英文，打字当然还是英文。
   中文输入法本身是好的，玩家却永远走不到它。
   **改法**：三个语言成一个环，英文后面就是中文（本机游戏是 `zh_cn`，键盘本来默认就是中文，但被地球键按掉之后要能回来）：

   ```ts
   export const KEYBOARD_LANGUAGES: readonly Language[] = ['en', 'zh', 'tr']
   export function otherLanguage(language: Language): Language {
     const at = KEYBOARD_LANGUAGES.indexOf(language)
     return KEYBOARD_LANGUAGES[(at + 1) % KEYBOARD_LANGUAGES.length] ?? 'en'
   }
   ```

   单测：`layouts.test.ts`（en→zh→tr→en，三下回到原处）。**英文按一下就是中文**，中文按三下回到英文。

2. **没有证据可查**。这一轮之前，“输入还是英文”有两条完全不同的成因 —— **键盘语言不是中文**，或**词库没取到**
   （取不到时 `choose()` 把字母原样写进输入框，看起来一模一样）。两者从日志里都看不见（座舱页自己的 console 不在日志里）。
   **改法**：座舱键盘第一次打中文时，往宿主日志写两行（走已有的 `startup` 通道，§16.5 的老办法，不新增协议；
   宿主对同一句只记一行）：

   ```
   page: keyboard language zh
   page: Chinese input method: its table is here (415 syllables, 25040 words)
   ```

   词库取不到时写 `… its table could not be read (<错误>)`；键盘在哪个语言下挂起来，`keyboard language <en|zh|tr>` 一行说明。
   有了这两行，“还是英文”下次就能一眼定位。

不涉及插件与桥：两处改动都在座舱界面（`layouts.ts`、`store.ts`）。

### 25.9 这一版（地球键修好 + 两行日志）的产物

| 产物 | 值 |
|---|---|
| `ui/dist` | 70 个文件（重新构建；座舱界面 chunk `cabin-MYN1OtuI.js`，键盘/输入法的代码在共享 chunk `demo-Cip24lCp.js` —— 部署后在其中确认到 `var wo=[\`en\`,\`zh\`,\`tr\`]` 与 `(wo.indexOf(e)+1)%wo.length`，即三语循环真的在装机那一份里） |
| `westplay.exe` | 仍是 **24,372,736 B**（这一轮宿主 Rust 一行没动；打安装包那步会重编一次同源码的 exe） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,176,317 B**（9.70 MiB），SHA256 `F92983779929F6C15222538C47DED3150AA16D90FF5FE2E2BEDFD212503688DA`；已放到 `D:\WestPlay_2.1.4_x64-setup.exe` |
| 装配 | `ui\dist` → `D:\WestPlay\ui`（robocopy /MIR；新旧逐文件哈希比对 **0 差异**） |
| 启动检查 | 18:35:43 启动：`page: running (its scripts loaded)`，零错误；查完即关 |
| 验证 | `tsc -b` 0 错；`vitest run` **69 文件 / 490 测试通过**（新增 `layouts.test.ts` 的三语循环；`ime.test.ts` 里“网页输入框时通知宿主”那条跟着改成走完一圈） |

**这一版的产物**：安装包 `WestPlay_2.1.4_x64-setup.exe`（见 §25.9）；装配：exe 仍是 24,372,736 B（宿主没动），
ui 重新构建装配（bundle 的 hashed 文件名会变），词库文件未变。

---

## 26. 候选翻页键、哔哩哔哩的输入适配、哔哩哔哩不显示首页音量条（2026-10-31 晚）

需求原话：“**给文字候选框右边加上两个翻页键，顺带给哔哩哔哩也加上适配，然后如果正在播放是哔哩哔哩时移除首页的音量控件**”，
追问后 owner 明确：“**适配是指让哔哩哔哩也能用中文输入法**；第三件事指首页正在播放的音量条优先级高于哔哩哔哩内的音量控制，所以需要移除”。

### 26.1 候选翻页键（拼音栏右端两个箭头）

词库里一个音节最多给 24 个字（`MOST_PER_SYLLABLE`），加上整串命中的词，一条拼音的候选远不止栏里放得下的九个原来 `candidatesFor` 直接 `slice(0, 9)` 把其余丢掉了。现在：

- `pinyin.ts` 的 `candidatesFor` **返回全部**（表自己的上限保证不失控）；新增 `CANDIDATES_PER_PAGE = 9`
  （§33 后来改成 **8**，见那节）；
- 键盘 store 多一个 `page`（第几页，0 起）与 `turnPage(by)`（**到两端绕回去**：最后一页再往后是第一页，第一页再往前是最后一页）；
- `Keyboard.tsx` 只画 `page` 那一页的九个，栏的右端是**两个带箭头的键**（`glyphs.tsx` 的 `PageGlyph`）；只有一页时两个键灰着（`disabled`）；
- **数字 1–9 与空格按“当前这一页”算**（数字 1 = 这一页第一个，空格 = 第一个，回车 = 第一个然后搜索）——和 iOS 的候选页一致；
- 拼音缓冲一变（打字、退格、选完字）`page` 回到第一页（`store.ts` 的 `compose`/`choose`/`commitRaw`/`attach`/`detach`）。

单测：`ime.test.ts` 的 “pages through what one syllable offers, nine to a page”（14 个字的音节 → 两页、第 9 个选对、第二页数字 5 选对、两端绕回、选完缓冲清空）。

### 26.2 哔哩哔哩也能用中文输入法（页面侧四处）

其他站点的搜索框是普通 `<input>`，我们的注入脚本一直处理得了；**B 站的一部分界面是它自己的组件（自定义元素 + shadow root）**，
于是：

| 症状 | 原因 | 改法（都在 `webapp.js`） |
|---|---|---|
| 点 B 站搜索框，座舱键盘不弹（或焦点像丢了） | `document.activeElement` 在 shadow root 的情况下是**宿主元素**，不是里面的 `<input>`：`field()` 认不出 → `Report::Typing` 不发 | 新 `focused()`：从 `document.activeElement` **一层层走进 shadowRoot.activeElement**；`focusin`/`input`/`pointerdown` 三个监听与 `report()` 全用它 |
| 认字段靠 `instanceof HTMLInputElement` | 页面另一帧里的字段是**另一个 realm** 的构造器，`instanceof` 为假 | `field()` 改按 `element.tagName` 认（`INPUT`/`TEXTAREA`） |
| 中文提交（整段写入）到不了 B 站的框 | ① `webAppText` 分支遇到 `contenteditable` 直接跳过；② 找字段只在 `document` 上找，shadow root 里的找不到 | 新 `writeText(element, text)`：`contenteditable` 用「全选 + `document.execCommand('insertText')` + 派发 `input`」写（React 的受控框就认这个），普通框走原来的原生 setter + `input`；`webAppText` 与 `insert()` 都用它；找不到焦点字段时的兜底也**走进 shadow root**（`shadowFields()`，深度最多 3） |
| 排查时看不出目标是谁 | — | `textProbe` 行改成报**真实**的聚焦元素（`focused()?.tagName`），并在 `contenteditable` 时多一个 ` ce` 标记（前 8 次写入，和原来一样） |

物理按键那条路不变：中文时宿主仍然**被界面拦着**不把字母直接送进页面（§25.3 的 `PageMessage::Ime`），
所以 B 站收到的是我们选好的中文整段文字。

### 26.3 哔哩哔哩不显示首页音量条

首页“正在播放”卡片上的音量条会把音量**写进网页自己的媒体元素**（`webAppCommand setVolume`），而 B 站的播放器**自己也有音量条**：
两者互相打架，且卡片那条一碰就覆盖站内的（owner 的要求）。

- `apps/web/webapp.ts` 新增 `cabinVolumeFor(site)`：`bilibili` → `false`，其余站点与“没有页面” → `true`；
- `dashboard/widgets.tsx` 的 `WebAppWidget` 按它决定传不传 `volume`/`onVolume`（`MusicWidget` 只在两者都在时才画那条，`dashboard.css` 的 `.np-volume`），**其余布局一格没动**。

单测：`webapp.test.ts` 的 “is left out for Bilibili, whose player has a volume control of its own”。

### 26.4 验证与产物

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **69 文件 / 492 测试通过**（新增 2：候选翻页、B 站不显示音量条） |
| `node --check crates/host/src/webapp.js` | 通过；`hostScripts.test.ts`（注入脚本能编译）6 个通过 |
| 代码风格 | 新写的 `PageGlyph`、`cabinVolumeFor`、翻页与页面侧改动都过 `prettier --check`（`webapp.ts`/`strings.ts` 等**原本就不是** prettier-clean 的文件保持原样，免得把整份文件的风格改动混进来） |
| 产物 | 见 §26.5 |

### 26.5 这一版的产物

| 产物 | 值 |
|---|---|
| `westplay.exe` | **24,375,296 B**（10-31 19:33；页面脚本改了，所以要重编） |
| `westplay.dll` | **552,448 B**（插件源码仍未动） |
| `ui/dist` | 70 个文件（界面 chunk `cabin-B6fpTbF6.js` / `cabin-BzUQJnxY.css`；部署后在其中核到 `keyboard-ime-page` 与 `imeBack`） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,176,991 B**（9.71 MiB），SHA256 `319B9EBC09FC2E90F14CC5282E2612826590DD4DB831740609ECDD0BE67167F3`；已放到 `D:\WestPlay_2.1.4_x64-setup.exe` |
| 装配 | exe + dll → `D:\WestPlay`；dll → 游戏 `…\bin\win_x64\plugins\`；`ui\dist` → `D:\WestPlay\ui`（逐文件哈希比对 **0 差异**） |
| 页面侧的改动在产物里 | `webapp.js` 是**原样嵌进 exe** 的（`include_str!`），部署的 exe 里能搜到 `shadowFields`、`const writeText`、`const focused` |
| 启动检查 | 19:36:06 启动：`page: running (its scripts loaded)`，零错误；查完即关 |

实机验证（待 owner）：中文键盘下拼音栏右端应有两个箭头键（只有一页时灰着），打一个音节后按它能翻到下一批候选；
在**B 站**的搜索框里能打中文（物理键盘与屏幕键盘都试一下）；B 站播放时首页“正在播放”卡片**没有**音量条，
QQ音乐/网易云/蜻蜓的还在。

---

## 27. B 站中文上屏改走浏览器自己的输入管线；B 站音量彻底放手；键盘右端加收起键（2026-10-31 深夜）

owner 反馈：“**哔哩哔哩还是无法输入，还有让哔哩哔哩自带的声音调节恢复正常**”，并追加：“**给键盘右边加一个收起按键**”。

### 27.1 先用证据否掉上一轮的猜测

§26.2 猜的是「B 站的字段在 shadow root / contenteditable 里，我们的 DOM 写进不去」。两条证据把它否掉了：

1. **抓 B 站首页的 HTML**（`curl https://www.bilibili.com/`，172,969 B）：
   全页**只有一个 `<input>`**，就是
   `<input class="nav-search-input" type="text" autocomplete="off" accesskey="s" maxlength="100" …>` ——
   普通输入框，light DOM，`document.querySelectorAll('input')` 一直就找得到。**不是 shadow、也不是 contenteditable。**
2. **owner 那一次的日志**（19:42–19:47 那局，`app.log`）：两行新探针都在 ——

   ```
   19:44:58  page: keyboard language zh
   19:44:59  page: Chinese input method: its table is here (415 syllables, 25040 words)
   ```

   说明**输入法确实起来了、词库也取到了**；但整局里**一条 `webApp:textProbe` 都没有** ——
   也就是我们**从没往 B 站页面发过一次整段文字**（`webAppText`）。他还只在 B 站首页点了两次「搜索发现」
   的推荐词（URL 里 `from_source=web_recourse_search`），并没有成功的输入。

结论：**卡在“上屏”这一跳**（界面把选中的字写进页面），不在“找字段/认字段”那一跳。

### 27.2 改法：上屏走**浏览器自己的输入管线**

原来上屏是我们自己动 DOM：整段写入 → 页面的 `{"type":"webAppText"}` → `setValue()`（原生 setter + `input` 事件）。
对一个站点自家组件包着的字段，这条路本来就不该赌。现在换成浏览器自己的输入：

| 环节 | 文件 | 做什么 |
|---|---|---|
| 宿主 | `crates/host/src/webview.rs` 新 `devtools()` | `ICoreWebView2::CallDevToolsProtocolMethod`（不读回答案），把 `Input.insertText` 发进页面 |
| 宿主 | `crates/host/src/webapp.rs` 新 `Command::InsertText { text }` | 转成 `devtools("Input.insertText", {"text":…})`；**注意它不能落在 `Open \| Close` 那条首分支上**（§7.5 的老坑），单测里加了一条断言 |
| 界面 | `ui/src/shared/host.ts` | `WebAppCommand` 加 `{ action: 'insertText'; text }` |
| 界面 | `keyboard/store.ts` | `Typing` 多一个可选 `insert?()`；**选字上屏**与字母原样上屏都改走 `insert()`：字段自己会（网页字段）就交给它，不会（座舱自己的框）才整段写 |
| 界面 | `apps/web/webapp.ts` | `webAppField.insert = (text) => command({ action: 'insertText', text })` |

为什么这是对的：`Input.insertText` 是浏览器**真输入法上屏**用的那条通路 —— 光标在哪就在哪插入、页面的
caret/选区/受控组件（React 也好、自定义元素也好）全部照常，既不用我们知道字段的 DOM，也不用整段覆盖。
页面自己因为 `input` 事件把新文字报回来（`typing` 消息），所以界面里那份文本副本自己会跟上。

### 27.3 顺手补一条诊断

`PageMessage::Ime` 现在会写一行日志（只在变化时）：

```
webapp: the cabin's input method takes the player's keys      （或 lets go of）
```

下次如果“中文还是打不出去”，这行有没有出现，就能直接区分「界面没把标志发出来」和「上屏这一跳丢了」。

### 27.4 B 站自带的声音调节恢复正常（页面侧彻底放手）

上一版只是把**首页卡片的那条音量条**去掉了（§26.3），但页面脚本还在接管 B 站的声音：它会把
`localStorage['westplay.volume']` 里记着的音量**写进 B 站的媒体元素**，并且每秒一次**看门狗**把 B 站自己的
音量改回去（§20.12 为 QQ 音乐加的），还会拦 `AudioNode.connect(destination)` 插自己的增益节点。
所以玩家在 B 站播放器上拖音量，一秒后就被改回去 —— “自带的声音调节不正常”。

现在 `webapp.js` 里多一个判断（按主机名）：

```js
const ownVolume = /(^|\.)bilibili\.com$/i.test(location.hostname)
```

命中时：**不写元素**（`applyVolume` 直接返回）、**不插增益节点**（`connect` 不接管）、**不跑看门狗**（还原那段跳过）、
**不向 frame 广播音量**（`keptVolume` 直接置 `null`）。于是 B 站页面上的音量只有它自己那一条说了算。
（音量**上报**留着无害：B 站没有歌词页也没有卡片滑条，界面不会因此显示什么。）

### 27.5 键盘右端加「收起」键

拼音栏右端那一组（§26.1 的两个翻页键）后面再加一个**收起键**（`HideGlyph`，与底部那一排的收起键同一个动作
`press({kind:'hide'})`）。底部那一排的收起键**保留**（`[ABC][地球][空格][收起][回车]` 没动）——
这一颗是给“正在打拼音、眼睛在栏上”的时候用的。

### 27.6 验证与产物

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | **207 通过 / 0 失败**（新增 `insertText` 命令的解析断言；`CallDevToolsProtocolMethod` 编译通过） |
| `tsc -b` | 0 错 |
| `vitest run` | **69 文件 / 493 测试通过**（新增：网页字段走字段自己的 caret 上屏，整段写不再被使用） |
| `node --check crates/host/src/webapp.js` | 通过 |
| 产物 | 见 §27.7 |

### 27.7 这一版的产物

| 产物 | 值 |
|---|---|
| `westplay.exe` | **24,375,808 B**（10-31 20:09；宿主与页面脚本都改了） |
| `westplay.dll` | **552,448 B**（插件源码仍未动） |
| `ui/dist` | 70 个文件（界面 chunk `cabin-DlszdoHH.js` / `cabin-BzUQJnxY.css`，输入法与它同住的共享 chunk `demo-DmRhZTMi.js`） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,179,969 B**（9.71 MiB），SHA256 `E7277DA46BAD453516C9F31DA41466DC739C3D64AE0741BEDB81512F11003D25`；已放到 `D:\WestPlay_2.1.4_x64-setup.exe` |
| 装配 | exe + dll → `D:\WestPlay`；dll → 游戏 `…\bin\win_x64\plugins\`；`ui\dist` → `D:\WestPlay\ui`（逐文件哈希比对 **0 差异**） |
| 改动在产物里 | 部署的 exe 里能搜到 `Input.insertText`、`devtools`、`ownVolume` 与那行 `the cabin's input method …` 日志；部署的 UI 里能搜到 `insertText` |
| 启动检查 | 20:11:26 启动：`page: running (its scripts loaded)`，零错误；查完即关 |

实机验证（待 owner）：
1. **B 站中文**：点 B 站搜索框 → 中文键盘打 `beijing` → 选「北京」→ 搜索框里应出现中文（物理键盘与屏幕键盘各试一次）；
2. **B 站音量**：在 B 站播放器上拖它自己的音量 → 一秒后**不再被改回去**；
3. **收起键**：拼音栏右端应有 `◀ ▶ 收起` 三颗，点收起收键盘（底部那一排的收起键仍在）。
   若日志里出现 `webapp: the cabin's input method takes the player's keys` 却仍打不出字，把 `webapp: textProbe: …` 那几行发我。

---

## 28. 所有网页 App 里都看不到候选框（真凶，2026-10-31 深夜）

owner 反馈：“**为什么所有 webapp 都显示不了候选框，修复它**”。这一条查下来是**前两轮所有症状的总根因**。

### 28.1 症状与根因

**看不见候选栏**在座舱自己的输入框（地图搜索等）里没有，只有在**网页 App 的输入框**里才有 —— 这个差别指向“洞”。

- 座舱键盘浮在屏幕底部，**候选栏与状态小标是它的绝对定位子元素**，挂在**键盘自身盒子之上**
  （`keyboard.css`：`.keyboard-ime { bottom: calc(100% + 10px) }`，`.keyboard-chip` 同理）；
- 网页 App 要透出页面，靠 `Shell.tsx` 的 `holeMask()`（`mask-composite: exclude`）在 `.carplay` 上**挖洞**：
  **洞里的一切座舱像素都不画**（§4 不变量 2 说的就是这件事）；
- `WebAppScreen.tsx` 的 `place()` 把洞从下往上收缩以让出键盘 —— 但它量的是 **`.keyboard.shown` 自身的矩形**，
  而候选栏/小标**在键盘盒子之外**，`getBoundingClientRect()` 量不到它们；
- 于是：**候选栏仍然落在洞里 → 被遮罩整块抹掉**。四个站点全一样，因为这是合成机制，不是某个站点的怪癖。

### 28.2 它同时解释了前面三轮的抱怨

候选栏看不见 → 玩家**永远不会去选字** → 我们从没发过一次上屏指令：

- 上一轮日志里 `keyboard language zh`、词库都在，却**一条 `webApp:textProbe` 都没有**（§27.1）；
- 玩家看到的只是自己敲进去的字母 —— “**输入依然是英文**”（§25.8）与“**哔哩哔哩还是无法输入**”（§27）说的是同一件事；
- 而 §26.2/§27.2 那两轮改的“找字段”“上屏通道”都是**真的问题**（B 站的字段确实是普通 input，上屏也确实该走浏览器自己的输入管线），
  只是**都不是**“打不出中文”的主因。**先看见，才谈得上选。**

### 28.3 改法

| 文件 | 改法 |
|---|---|
| `apps/web/webapp.ts` | 新纯函数 `floatingTop(rects)`：给出飘在页面上方那一摞的**最高点**（没有则 `null`；高度为 0 的不算） |
| `apps/web/WebAppScreen.tsx` | `place()` 不再只量键盘，而是量 **`.keyboard.shown` / `.keyboard-ime` / `.keyboard-chip` 三个里最高的那个**，据此收缩洞（因而状态小标也一并可见了） |

单测（`webapp.test.ts`）：只有键盘 → 键盘顶；加上候选栏 → 候选栏顶；再加上小标 → 小标顶；空数组 → `null`；高度 0 → 不算。

### 28.4 验证与产物

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **69 文件 / 494 测试通过**（新增 `floatingTop` 的用例） |
| 产物核验 | 部署的 UI chunk 里能读到 `[\`.keyboard.shown\`,\`.keyboard-ime\`,\`.keyboard-chip\`]` 一起 query 再取最小 top；ui 与 dist 逐文件 **0 差异** |
| 启动检查 | 20:33:37 启动：`page: running (its scripts loaded)`，零错误；查完即关 |

| 产物 | 值 |
|---|---|
| `westplay.exe` | 仍是 **24,375,808 B**（这一轮只动界面：宿主 Rust 与页面脚本都没改） |
| `westplay.dll` | **552,448 B** |
| `ui/dist` | 70 个文件（界面 chunk `cabin-DnNCD80L.js`） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,180,290 B**（9.71 MiB），SHA256 `151EF02B36E4D6D05C8EEF56C2B4539074330DB34C75619831FC39DBDFF122C2`；已放到 `D:\WestPlay_2.1.4_x64-setup.exe` |

**教训（写进 §4 的精神里）**：洞是遮罩挖出来的，**凡是“要让玩家看见”的座舱元素，都必须算进收缩量**；
键盘的绝对定位子元素（候选栏、状态小标）不在键盘的盒子里，量键盘量不到它们。

---

## 29. 上电后自动继续播放（除哔哩哔哩外）—— 2026-10-31 深夜

owner 需求：“现在车辆断电后虽然会自动暂停，但重新上电后不能自动播放，**为除了哔哩哔哩外的 app 加上上电后自动继续播放的功能**”。

### 29.1 改的是哪条规则

断电暂停本来就是照 **Apple Music 自己的规则**做的（PLAN §1.5）：断电那一下立即暂停、断电期间不出声、
**来电不续播、要玩家自己按**。owner 现在要电波回来时音乐自己回来 —— 这是**有意改掉**那条规则的一部分（只改“回来”那一半，暂停那一半照旧）。

### 29.2 改法（两处，对称的一对）

| 文件 | 改法 |
|---|---|
| `apps/youtube/withGame.ts` | 新 `poweredOn(wasOff, off)`：**来电那一瞬**（与既有的 `poweredOff` 对称），单测 `withGame.test.ts` |
| `apps/musicWithGame.ts`（Apple Music / Spotify / YouTube Music / YouTube 这些**原生**播放器） | 多一个 `pausedByPower`：断电那一瞬记下“它在播、是我们按停的”；来电时若它**仍停着**、且玩家**没离开游戏**（`isAway` 为假）→ `playAndFadeIn(player)` 播回来。玩家自己在暗处按了播放（已经在播）→ **不动**（`playPause` 是 toggle，再发一次反而会把它停掉） |
| `apps/web/pauseWithPower.ts`（四个网页站点） | 同样一个 `pausedByPower`（也涵盖“断电期间网页自己起播 → 被我们按停”那种）；来电时 `playsOnWithPower(site)` 且它没在播 → 发一次 `playPause` |

**B 站怎么排除的**：`pauseWithPower.ts` 里

```ts
/** 来电时页面自己播回来吗：每个站点都会，B 站不会 —— 视频自己又开始放不是 owner 在那要的。 */
export function playsOnWithPower(site: WebAppSite | null): boolean {
  return site !== 'bilibili'
}
```

B 站断电照旧暂停、断电期间照旧不响，只是**不自己续播**（要玩家自己按）。

### 29.3 覆盖范围

- **会自己播回来**：Apple Music（原生）、QQ音乐、网易云、蜻蜓FM（网页）；
- **不自己播回来**：哔哩哔哩（有意排除）；
- 原生 Spotify / YouTube Music / YouTube 走的是同一个 `pauseMusicWithGame`，因此一并生效（当前槽位是网页 App，正常跑不到它们）；
- 玩家自己按过播放的，一律不动（`playing` 判断 + toggle 语义）。

### 29.4 验证与产物

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **70 文件 / 505 测试通过**（新增 11：`withGame.test.ts` 的 `poweredOn` 2 个 + 原生播放器的 `musicWithGame.test.ts` 6 个 + 网页站点改/加 3 个） |
| 代码风格 | 改动的文件全过 `prettier --check` |
| 产物核验 | 部署的 UI 与 `dist` 逐文件 **0 差异**；21:08:37 启动零错误 |

| 产物 | 值 |
|---|---|
| `westplay.exe` | 仍是 **24,375,808 B**（这一轮只动界面） |
| `westplay.dll` | **552,448 B** |
| `ui/dist` | 70 个文件（界面 chunk `cabin-Y94IquB5.js`） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,182,285 B**（9.71 MiB），SHA256 `EB1927094B53AB5A1C8E8B53CE4B6E93301CC464E1A1F67F1AFA13DBCA5D5F08`；已放到 `D:\WestPlay_2.1.4_x64-setup.exe` |

实机验证（待 owner）：QQ音乐/网易云/蜻蜓 FM/Apple Music 放着 → 熄火（断电）→ 停 → 重新上电 → **自己接着放**；
B 站放着视频 → 熄火 → 停 → 上电 → **仍然停着**（要自己按）。

---

## 30. 地图搜索的第一个结果不是最近的（2026-10-31 深夜）

owner 反馈：“我在地图 app 搜索地点时，最先出现的结果并不是距离最近的那个，尝试修复这个问题”。

### 30.1 根因：排名是「先按匹配分组，组内才按距离」

`ui/src/cabin/maps/places.ts` 的 `searchPlaces` 把命中分成四组，**组的优先级压过距离**：

| 组 | 什么算 |
|---|---|
| 0 | **城市**的名字以整串查询开头 |
| 1 | 其它地点，名字以整串查询开头 |
| 2 | 名字里带全每一个查询词 |
| 3 | 其余（靠所在城市或“它是什么”命中的，例如 `fuel` 找到加油站） |

再 `sort(a.group - b.group || a.distance - b.distance)` —— **先看组，距离只是组内次序**。
于是「名字恰好以关键词开头、但 80 km 外」的地点会排在「就在 4 km 外、只是所在城市叫这个名字」的前面。

这不是偶然：**当时的单测把这条行为写死在期望里**（`places.test.ts` 里 `Tarandi (Bari)`（80 km）排在
`Filling station (Taranto)`（4 km）之前），说明当初是有意为之 —— 但车主在开车时显然要「最近的那个」先出来。

### 30.2 改法：城市仍是第一，**其余一律最近优先**

```ts
found.sort((a, b) => Number(a.group !== 0) - Number(b.group !== 0) || a.distance - b.distance || a.group - b.group)
```

- **城市（组 0）永远第一**，无论多远 —— 玩家说出一个城市名，要的就是那座城；
- **其余地点按距离排**（离卡车最近的先出），匹配分组只在**距离相同**时做次序；
- **没有卡车位置时**（`from` 为 `null`，距离都是 `Infinity`）：`Infinity - Infinity` 是 `NaN`（falsy）→ 落到分组那一项，
  于是**退回原来的按名字排序**，行为不变（不会因为没定位就乱排）。
- 走路线时（`Destinations.tsx` 传进来的 `distanceOf` 是“沿路线已走多远”）语义一样：沿线最近的先出。

### 30.3 测试

`places.test.ts`：
- 原来那条期望改成 `Taranto（城市）→ Filling station(4 km) → Tradeaux(9 km) → Tarandi(80 km)`，
  并在注释里写明「它就是 owner 报的那个」；
- 新增一条「没有车的位置时退回按名字分组」的用例（组内保持数据自身顺序）。

### 30.4 验证与产物

| 项 | 结果 |
|---|---|
| `tsc -b`（在 `ui/` 里） | 0 错 |
| `vitest run` | **70 文件 / 506 测试通过** |
| `prettier --check` | `places.ts` / `places.test.ts` 干净 |
| 产物核验 | 部署的 UI 与 `dist` 逐文件 **0 差异**；21:31:34 启动零错误 |

| 产物 | 值 |
|---|---|
| `westplay.exe` | 仍是 **24,375,808 B**（只动界面） |
| `westplay.dll` | **552,448 B** |
| `ui/dist` | 70 个文件（界面 chunk `cabin-DW8-rbIa.js`） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,180,715 B**（9.71 MiB），SHA256 `B0603188BC3F11C5B5B562668D4AC540001F4E497EA33E8913FD83098CBB5863`；已放到 `D:\WestPlay_2.1.4_x64-setup.exe` |

---

## 31. 性能模式：阉割 3D 建筑、毛玻璃与动画；设置里的「显示与性能」（2026-11-01）

需求原话：“**添加一个新模式：性能模式。要求：阉割导航的3d建筑模型；阉割毛玻璃效果；阉割动画效果**”，
并指定：“**完成后和先前已经完成的刷新率修改在外观和壁纸下面合并为新的显示与性能设置，记得汉化选项，
刷新率的描述为：修改屏幕显示的刷新率；性能模式的描述为：阉割部分效果以换取性能**”；
追加一句：“**把毛玻璃替换为适配深色模式的纯色透明底**”。

### 31.1 三样效果各自怎么阉割

| 效果 | 做法 | 在哪 |
|---|---|---|
| 导航的 3D 建筑 | 建筑层（`fill-extrusion`，源图层 `building`）**整层收起**（`visibility: none`）：不再绘制、也不再逐帧重绘——这是地图最贵的一项（§24.2 引的玩家日志：市区里座舱页开销到过 4 倍） | `ui/src/cabin/maps/buildings.ts` 的 `buildingsVisibility(performanceMode)`；`maps/liveMap.ts` 的 `syncBuildings()`（每帧重试到样式加载好，与 `syncAppearance` 同一套路；`buildingsMode` 记住已应用的值，不每帧写） |
| 毛玻璃 | `<html>` 上挂 `performance` 类 → 全局 `backdrop-filter: none !important`（连 `::view-transition-group(sidebar)` 那片玻璃也去掉）；玻璃**不是留空**，而是换成**适配明暗的纯色透明底**（照 iOS「降低透明度」那套）：`--glass`/`--glass-rim`/`--chip`/`--keyboard-glass` 在 `.shell`（深色）与 `.shell.appearance-light`（浅色）各给一套更实的半透明色，天气卡片 `.wx-card`、视频玻璃 `.yt-glass`、仪表盘深色卡片 `.appearance-dark .weather/.job` 各补一档；`np-tint`/`music-backdrop`/`wal-cover` 三张大模糊装饰图直接不画（它们的透明纱罩留着，底色仍是那套纯色） | `ui/src/cabin/performance.css`（新）；类由 `CabinApp.tsx` 挂上（和 `documentElement.lang`、demo 的 `demo` 类同一处） |
| 动画 / 过渡 | 同一类下：**所有过渡 0 时长**、**所有动画 0 时长且只跑一次**——填 `both` 的动画仍落在最后一帧，`animationend` 照样来（`CabinApp.tsx` `Screens` 的切换就是等它），无限动画（转圈、下雨、呼吸光、波形）跑完这一趟就停，不再逐帧重绘；View Transition 的 `::view-transition-*` 动画一并归零 | 同上 |

**为什么是 0 时长而不是 `animation: none`**：`none` 会让“进场动画”的元素停在**基态**，而有些元素基态就是
`opacity: 0`（进出场的那两个 `screen-slot` 就是），屏幕会空一拍；0 时长让动画照跑、立刻落到最后一帧，
`animationend` 也照常来——两边都对（`Screens` 那条 `SWITCH_MS * 3` 的兜底定时器因此永远用不上）。

### 31.2 设置里的「显示与性能」

列表页在**外观、壁纸下面**多一行**显示与性能**（新页 `display`，紫色表盘图标 `DisplayGlyph`），页内两项：

| 行 | 控件 | 页脚说明 |
|---|---|---|
| 屏幕刷新率 | 60 Hz / 30 Hz 两段式——**从「外观」页搬过来的**，外观页不再有这一行 | 中文：**修改屏幕显示的刷新率** |
| 性能模式 | 开关 | 中文：**阉割部分效果以换取性能** |

三语齐全（`strings.ts` 新增 `displayPerformance` / `performanceMode` / `performanceModeFooter`，`refreshRateFooter`
换成本轮指定的新文案；英文 *Display & Performance* / *Performance Mode* / *Gives up some effects in exchange for
performance.* / *Changes the refresh rate of the screen's display.*；土耳其语 *Ekran ve Performans* / *Performans
Modu* / *Performans karşılığında bazı efektlerden vazgeçilir.* / *Ekranın yenileme hızını değiştirir.*）——
`Strings` 的字段漏翻，`tsc` 直接报错。

### 31.3 持久化（与刷新率同一套）

| 环节 | 做法 |
|---|---|
| 页面 → 宿主 | `{"type":"performanceMode","on":true}`（`ui/src/shared/host.ts` 的 `PageMessage`；选了就发，与 `truckStrip`/`refreshRate` 一样） |
| 宿主 | `settings::ScreenSettings` 新增 `performance_mode: bool`（`#[serde(deserialize_with = "lenient")]`：坏值当 false，不弄坏整份设置文件；旧文件没这一项就是 false），存进 `settings.json`，并回传 `settings` 消息里的 `performanceMode` |
| 页面 ← 宿主 | 启动时按 `settings` 消息里的值应用（`store.ts` 的 `setPerformanceMode` / `choosePerformanceMode`）；**旧宿主不发** → 一律当关 |
| 伙伴程序 | `companion/useSettings.ts` 的 `Settings.screen` 加 `performanceMode: boolean`（保存设置时不会把它丢掉），`preview.ts` 的假设置补上 |

**宿主自己不做什么**：这三样全是座舱页面自己的东西，宿主只负责**记住**这个选择（和刷新率一样）；插件与桥
一行没动，所以这一轮 `westplay.dll` 逐字节不变。

### 31.4 边界

- **只在座舱页面生效**：伙伴窗口、桌面预览不受影响（`performance` 类只由座舱页挂上）；
- **随时可反悔**：关掉开关，建筑层下一帧就回来（`liveMap` 每帧读 store），毛玻璃与动画立刻恢复；
- 刷新率与性能模式互相独立，可以只开一个；两项都进 `settings.json`；
- 地图数据、模组（`westplay.scs`）、玩家数据（`%LOCALAPPDATA%\app.westplay\`）都没动。

### 31.5 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **70 文件 / 508 测试通过**（新增 2：`buildings.test.ts` 的「性能模式把建筑层收起」、`connectHost.test.ts` 的「跟宿主的性能模式、并把自己的选择交给宿主」——含旧宿主不发、坏值当关两种情形） |
| `cargo test -p westplay-host --lib` | **207 通过 / 0 失败**（新增断言：`settings.rs` 的往返/默认/坏值，`lib.rs` 的 `performanceMode` 解析与 `settings` 消息里的 `performanceMode`） |
| `prettier --check` | 新文件 `performance.css` 干净；改动过且原本就干净的 `liveMap.ts`/`connectHost.test.ts`/`useSettings.ts`/`buildings.ts`/`buildings.test.ts`/`settings.ts`/`glyphs.tsx` 保持干净（原本就不干净的 6 个文件照旧，未混进无关的格式化） |
| 产物核验 | 构建出的 `cabin-*.css` 里有 19 处 `html.performance`、9 处 `backdrop-filter:none`/`animation-duration:0s`；`cabin-*.js` 里有 `performanceMode`、`性能模式`、`修改屏幕显示的刷新率`、`阉割部分效果以换取性能`；exe 里能搜到 `performanceMode`（宿主那条消息） |
| 启动检查 | 11-01 10:56:14 启动：`app: window shown → host: cabin browser (WebView2) ready → host: first frame captured → page: running (its scripts loaded)`，**零 error / panic**；查完即关 |

### 31.6 产物（本次重打）

| 产物 | 值 |
|---|---|
| `westplay.exe` | **24,408,064 B**（11-01 10:57；宿主改了 `settings.rs`/`lib.rs`，界面与 `performance.css` 也在里面） |
| `westplay.dll` | **552,448 B**（插件源码没动，逐字节不变） |
| `ui/dist` | **70 个文件**（座舱 chunk `cabin-DaKmhufH.css` / `cabin-IrqbD-bE.js`） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,183,817 B**（9.71 MiB），SHA256 `65D7EA3600FE4AD25D78D40C52D51105F370FCD06ABA4B837B878023035C2CB9`；放到 **`D:\West Update\`**（旧包装进 `D:\West Update\_previous-2026-10-31\`） |
| 装配 | exe + dll → `D:\WestPlay`；dll → 游戏 `…\bin\win_x64\plugins\`；`ui\dist` → `D:\WestPlay\ui`（robocopy /MIR，逐文件哈希比对 **0 差异**） |
| 源码包 | 两个 zip 重新导出，见 §31.7（大小/哈希不写在这里：包里就含这份文档，写进来会自相矛盾——要哈希直接算文件） |

### 31.7 两个 zip（重新导出）

| 包 | 内容 |
|---|---|
| `D:\West Update\WestPlay-2.1.4-src-full.zip` | `src/`（**637** 个文件，含 `_docs-after-market/`，不含 `target/ node_modules/ ui/dist/ .git/`）+ `_docs/`（5 个）+ `README-源码导出.txt`，共 643 项 |
| `D:\West Update\westplay-mods-src-214.zip` | 相对纯净 2.1.4 的改动文件 **118** 项（上一轮 113；本轮新增 `ui/src/cabin/performance.css`、`apps/settings/glyphs.tsx`、`apps/settings/settings.ts`、`maps/buildings.ts`、`maps/buildings.test.ts`，其余为更新） |

### 实机验证（待 owner）

1. **设置**：设置 → 列表里 外观、壁纸 下面应多一行**显示与性能**；点进去是「屏幕刷新率 60/30」与「性能模式」开关，页脚文案分别是「修改屏幕显示的刷新率」「阉割部分效果以换取性能」；
2. **3D 建筑**：打开性能模式 → 主页仪表盘/地图 App 的地图**不再有立体的建筑**（路面、地名、路线照旧）；关掉 → 建筑回来；
3. **毛玻璃**：打开后 侧栏按钮、键盘、音量条、设置页顶栏**不再是磨砂玻璃**，而是纯色半透明底；**深色与浅色两种外观下各看一眼**（浅色配浅底、深色配深底）；
4. **动画**：打开后 主页↔仪表盘 切换、App 打开/关闭、页面推入推出、开关滑动**都没有过渡**（直接到位）；关掉恢复；
5. **记住选择**：打开性能模式 → 重启 WestPlay → 仍然是开着的（`%APPDATA%\app.westplay\settings.json` 里 `screen.performanceMode: true`）。

---

## 32. 中文字库扩容：常用字全给（7,735 字）、词条 29,867（2026-11-01）

需求原话：“**现在中文输入法可以支持的字还是有点少，拓展一下中文字库**”，随后补了一句：
“**不用加生僻字，常用字即可**”。

### 32.1 到底哪里少（先量，再改）

| 天花板 | 后果 |
|---|---|
| 每音节**封顶 24 个候选**（`MOST_PER_SYLLABLE = 24`） | 415 个音节里 **184 个撞上限**；「yi」有 172 个常用字，只露 24 个 |
| 字池被上面这道闸截断 | 旧表实际只有 **5,410 字**：高频音节里排在 24 之后的常用字，全部打不出来 |

一句话：**不是字库小，是候选被截断了**——`yi` `shi` `ji` `yu` 这些高频音节只给 24 个，后面
两三百个常用字根本没机会出现。

### 32.2 改了什么

| 项 | 旧 | 新 |
|---|---|---|
| 每音节候选 | 24（截断） | **不截断**（常用字的每个读音全给） |
| 字池 | 8105 表（被截断成 5,410 字） | **GB2312 基本集 6,763 字 ∪ 语料里有独立单字条目的标准字 = 7,735 字** |
| 词条门槛（语料频率） | 2 字 1500 / 3 字 1200 / 4 字 800 | 2 字 **1200** / 3 字 **1000** / 4 字 800 |
| 同一拼音的词候选 | 6 | 8 |
| 词条数 | 25,040 | **29,867**（2 字 16,457 / 3 字 7,310 / 4 字 6,100） |
| 词库大小 | 614,205 B（gzip 212,813） | **720,663 B**（gzip 252,465） |

「常用」的口径（只在 `tools/chinese/build_pinyin_table.py` 里）：

- **GB2312 的 6,763 个汉字**——简体输入法的基础集（一级 3,755 + 二级 3,008）。来源是 Python 自带的
  `gb2312` 编解码器（`read_basic_set()`），不联网、不引第三方数据；
- 再并上**语料（rime-essay）里作为独立单字条目真实出现**的标准字（`read_character_use()`）——
  玥 喆 堃 燚 瑀 垚 曌 炅 珺 淼 犇 这些名字用字就是从这儿来的。
- 关键细节：这条证据必须**在繁→简归并之前**取。归并之后，每个简化字都能顺着繁体形拿到频率
  （贇 → 赟、昇 → 升），「常用」就退化成「整个 8105 全算常用」——第一版正是这么翻车的：
  量出来 8,099 字、178 个 Ext-A/B 字，和「不加生僻字」正好相反。

### 32.3 生僻字怎么挡在外面的

- **8105 的三级字（1,605 个：名物、术语、类推简化字，不少还在 Ext-A/B）不进表**——它们只在人名和
  术语里出现，混进来只会把常用字往后挤；这样 Ext-A/B 只剩 **4 个**（旧表反而有 67 个）。
- 举例：**赟 祎 骉**（8105 有、GB2312 没有、语料里也没有独立条目）→ **不进表**；
  **龘**（GBK 有、8105 没有）→ 也不进。
- 哪天要某个具体的字（比如家人的名字用字），加一条显式白名单即可，不用放开整张表。

### 32.4 代价与边界

- 表大 106 KB（gzip +40 KB）；它**仍然是第一次用中文键盘才加载**，从不打中文的玩家零成本；
  已经缓存过旧表的会话会重新拉一次。
- 长候选音节：`yi` 172 个（22 页）、`ji` 147、`yu` 147、`shi` 96。候选栏一次 **8** 个、翻页键取其余
  （`CANDIDATES_PER_PAGE = 8`，页数 `ceil(len/8)`；§33 从 9 改成 8），第一页不变——还是「一 以 也 已…」。
- 词条门槛只降了两档（4 字仍是 800），免得把「一人一神」这类语料噪音捞进来。

### 32.5 验证

| 项 | 结果 |
|---|---|
| 生成 | 720,663 B / gzip 252,465 B；415 音节 / 10,569 条 / **7,735 字**；26,856 拼音键 / 29,867 词 |
| 每音节 | yi 172 / ji 147 / yu 147 / shi 96 / mao 36 / zhang 25（旧版一律 24 封顶） |
| 生僻边界 | 玥 喆 堃 燚 瑀 垚 曌 炅 珺 淼 犇 **在表**；赟 祎 骉 龘 **不在**（符合「不加生僻字」） |
| Ext-A/B | **4 个**（旧表 67 个） |
| `tsc -b` | 0 错 |
| `vitest`（键盘/输入法） | 5 文件 / 38 测试通过 |
| `ui/dist` | 70 个文件，`chinese/pinyin.json` = 720,663 B |
| 装配 | `D:\WestPlay\ui` 与 `ui/dist` 一致 |
| 没动 | Rust、插件、界面代码、设置——本轮只改词库与生成脚本 |

### 32.6 产物

| 产物 | 值 |
|---|---|
| 词库 | `ui/public/chinese/pinyin.json` **720,663 B**，SHA256 `7088DBFBEFC17334D9F59960158FA7CE12C3E217F89418F557EA5C9B3A338347` |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,253,525 B**，SHA256 `21DD7A727B18CE1BDE558100443A450FDFA884C877F9D2A2C1E139861B8C2161`（§32 这版词库先进过一次包，§33 的界面改动后又重打，这是最终交付的那个） |
| 两个 zip | 见 §32.7 |

### 32.7 两个 zip

`src/` 仍是 **637** 个文件（词库与生成脚本都是原有文件，只改内容）；`westplay-mods-src-214.zip` 的改动文件
仍是 **118 项**——本轮动的是其中两个原有文件：`ui/public/chinese/pinyin.json`（614 KB → 720 KB）与
`tools/chinese/build_pinyin_table.py`。

### 实机验证（待 owner）

1. 打 `yi`/`shi`/`ji`/`yu` 一直按右箭头翻页：候选比旧版多得多（`yi` 172 个，22 页）；
2. 常用字不再缺：旧版翻不到的字现在翻得到（例：`zhang` 的 璋 漳 樟 鄣 嫜，`mao` 的 蝥 瞀 眊）；
3. 生僻字**仍然没有**（按要求）：赟、祎、龘 打不出来是有意的；
4. 词条：`beijing` `daohang` `biaoqing` 等词条比旧版多；
5. 如果还有你觉得该有的常用字没有 → 把字告诉我，我加白名单。

---

## 33. 拼音栏：移除右端收起键、候选每页 8 个（2026-11-01 中午）

owner 两条反馈，挨着来的：

1. “**候选框右边的收起键盘给第八个候选挡住了，移除这个收起按键**”；
2. “**候选框改成每页显示8个**”。

### 33.1 收起键的来历与问题

§27.5 是 owner 当时自己提的“给键盘右边加一个收起按键”：拼音栏右端从两个翻页键变成 `◀ ▶ 收起` **三颗**
（`HideGlyph` → `press({ kind: 'hide' })`，与底部那一排的收起键同一个动作），底部那一排的收起键**保留**。

问题：候选栏一页九个，这条 bar 的宽度是屏宽减两边 20px；三颗键那版右端多占 54px（48 宽 + 6 间距），
第 8、9 个候选正好被压住。§32 把候选表放开后（单字候选更多、更常翻页），这个挤压更显眼。

### 33.2 改法（两处）

| 改动 | 文件 |
|---|---|
| 右端只留两个翻页键（删掉第三颗收起键） | `ui/src/cabin/keyboard/Keyboard.tsx` |
| 一页 9 → **8** 个候选；9 键不再“越过这一页” | `keyboard/pinyin.ts`（`CANDIDATES_PER_PAGE = 8`）、`keyboard/store.ts` |

细节：

- **收起键**：`.keyboard-ime-pages` 只剩 `◀` `▶`；底部那一排的收起键（`[ABC][地球][空格][收起][回车]`）不动，
  键盘照样收得起来（`HideGlyph` 仍在那排用着，`text.keyboard.hide` 也没变成死字符串）。
- **每页 8 个**：`CANDIDATES_PER_PAGE = 8`。数字键只认 1–8；**9 既不会去选下一页的第一个，也不会把 9
  打进输入框**（`store.ts` 里只有 `digit < CANDIDATES_PER_PAGE` 才 `choose`，键仍被吃掉，符合“打字时
  数字键归输入法”）。翻页键、空格选第一个、两端绕回都没变。
- 测试跟着改：`ime.test.ts` 的翻页用例重写成「八到一页」（14 个字 → 第一页 8 个、第二页 6 个），并加断言
  「9 在这一页上什么都不选」；`pinyin.test.ts` 的 digit 映射用例补了 `8 → 7`。

### 33.3 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest`（键盘/输入法） | 5 文件 / 38 测试通过（翻页用例按 8/页重写，digit 用例补 `8 → 7`） |
| `prettier --check` | `Keyboard.tsx` `pinyin.ts` `ime.test.ts` `pinyin.test.ts` 全干净 |
| 构建/装配/打包 | 见 §33.4 |

### 33.4 产物

| 产物 | 值 |
|---|---|
| `westplay.exe` / `westplay.dll` | 24,408,064 B / 552,448 B（本轮只有界面，宿主未重编） |
| `ui/dist` | 70 个文件 |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` **10,253,525 B**，SHA256 `21DD7A727B18CE1BDE558100443A450FDFA884C877F9D2A2C1E139861B8C2161` |
| 两个 zip | 见下（`src/` 637 文件、改动文件 118 项；本轮动 `Keyboard.tsx`、`pinyin.ts`、`store.ts`、两个测试与文档） |

### 实机验证（待 owner）

1. 中文键盘打 `yi`：一页**8 个**候选，最右那个完整可见，bar 右端只有两个箭头；
2. 数字键 1–8 选字；按 9 不选字、也不会把 9 打进去；空格选第一个；
3. 翻页键照旧（两端绕回、只有一页时变灰）；
4. 收键盘用底部那一排的收起键（`[ABC][地球][空格][收起][回车]`）。

---

## 34. 车辆信息 app：车损、挂车与货损，从游戏遥测同步（2026-11-01 下午）

owner 原话：“**试试能不能添加一个车辆信息app，这个不是webapp，app里左侧显示车辆名称，右侧显示车辆状态，
连接挂车和接取货物时还要显示挂车状态和货物状态（就是同步游戏内的车辆损伤）**”。

能不能：**能，但车损原来根本没读**，所以要顺着「游戏插件 → 桥接 → 宿主 → 界面」改一遍，不是加个页面就行。

### 34.1 数据从哪来（全是游戏自己的数，不估算）

| 数据 | SCS 遥测通道 | 本轮之前 | 现在 |
|---|---|---|---|
| 卡车五项磨损 | `truck.wear.engine` `.transmission` `.cab` `.chassis` `.wheels` | 没读 | 读 |
| 挂车已连接 | `trailer.connected` | 没读 | 读 |
| 挂车磨损 | `trailer.wear.chassis` `.wheels` | 没读 | 读（老游戏没有该通道就留空） |
| 货损 | `trailer.cargo.damage` | 没读 | 读 |
| 挂车身份 | “trailer” 配置事件：`id` `brand_id` `brand` `name` `license.plate` `chain_type` `body_type` | 没读 | 读，走新消息 `trailer` |
| 货物名 / 重量 / 是否已装 | 已有的 `job` 消息（`cargo` `cargo.mass` `cargo.loaded`） | 有 | 直接用 |

关键一条：**「游戏到底给了哪些通道」用 `wearKnown` 位图记下来**。游戏没有的通道（比如老版本没有挂车磨损）
在界面上显示「—」；否则 0 会被读成「完好无损」，那是假消息。

### 34.2 三层改动

| 层 | 文件 | 改了什么 |
|---|---|---|
| 游戏插件（游戏内 `westplay.dll`） | `crates/plugin/src/telemetry.rs` | 注册 9 条通道；快照加 10 个字段；`trailer` 配置事件 → `TrailerInfo`；每条磨损通道到达时置位 `wear_known` |
| 桥接 | `crates/shared/src/lib.rs` | `Telemetry` 加磨损/挂车/货损字段与 `wear_known`；新 `TrailerInfo`（`Plain`）；`PluginBlock.trailer`；`BRIDGE_VERSION` 24 → **25** |
| 宿主 | `crates/host/src/lib.rs` | 磨损随每帧 `telemetry` 送出（本来就有这条消息）；挂车身份按变化发新的 `{ type: 'trailer' }` |
| 界面 | `ui/src/shared/host.ts`、`cabin/state/store.ts`、`cabin/apps/vehicle/*`（新）、`cabin/state/apps.ts`、`state/strings.ts`（三语）、`shared/icons.ts` + 两个图标、`apps/AppScreen.tsx` | 新 app：注册表、图标、文案、视图、纯逻辑与测试 |

### 34.3 app 长什么样

两栏卡片（左身份、右状态），深色/浅色都走现有 `--apple-*` 变量：

- **左栏**：`车辆` + **品牌 型号**（例：`DAF XG+`）；下面 `挂车`——挂上时显示品牌/型号/车牌，没挂显示「未连接挂车」。
- **右栏**：`车辆状态`——引擎、变速箱、驾驶室、底盘、轮胎五行；每行「损伤 12%」或「完好」，下面一条量条
  （<10% 绿、<30% 橙、更高红）。行上有颜色，扫一眼就知道哪坏得厉害。
- **挂上挂车**：右栏多一块 `挂车`：挂车底盘、挂车轮胎。
- **接上货**：右栏多一块 `货物`：货物名 + 吨位 + `货物损伤 x%`。
- **没遥测**（游戏没开、或插件比界面老）：一屏「等待游戏数据…」，不显示 0%。

不联网、不画地图、不做动画（性能模式下也是）。

### 34.4 验证

| 项 | 结果 |
|---|---|
| `cargo check --workspace --all-targets` | 0 错 |
| `cargo test --workspace` | 宿主 **207 通过 / 0 失败 / 26 忽略**，shared、plugin、mapdata、keyboard 全通过；`westplay-setup` 的 `names_a_folder_as_windows_does` 在本机失败——它拿 `%SystemRoot%`（`C:\WINDOWS`）去磁盘上找回原名，本机磁盘上是 `C:\Windows`：环境相关的老测试，与本轮无关 |
| `tsc -b` | 0 错 |
| `vitest run` | **71 文件 / 521 测试通过**（新增 `vehicle.test.ts` 13 个：五项磨损、未知通道、挂车磨损、货损、是否挂上、`percent`、`severity`、`worst`；`apps.test.ts` 加 `vehicle`；`icons.test.ts` 加图标） |
| `ui/dist` | **72 个文件**（新增 `vehicle.light.svg` / `vehicle.dark.svg`） |
| 装配 | `D:\WestPlay\westplay.exe` 24,459,264 B、插件 `westplay.dll` 556,032 B（游戏插件目录同步）、`ui` 72 文件 |
| 安装包 | 10,262,424 B，SHA256 `F3F79123AE398AB70FCBEB1917B9227525E70522F24465A717C8484B154516F3` |

### 34.5 产物

| 产物 | 值 |
|---|---|
| `WestPlay_2.1.4_x64-setup.exe` | **10,262,424 B**，SHA256 `F3F79123…154516F3` |
| `WestPlay-2.1.4-src-full.zip` | `src/` 643 文件 + `_docs/` 5 个 + README，共 **649 项** |
| `westplay-mods-src-214.zip` | 相对纯净 2.1.4 的改动文件，**126 项** |

### 34.6 踩到的坑：主窗口「localhost 拒绝连接」

第一版装配完，owner 打开 app 说「**无法进入，显示 localhost 拒绝连接**」。

原因不在这一轮的代码，而在**我把哪个 exe 装了上去**：

| exe | 大小 | 有没有界面资源 |
|---|---|---|
| `cargo build --release` 出来的（我第一版装上的） | 21,927,424 B | **没有** → 主窗口空白/拒绝连接 |
| `tauri build --no-bundle` 出来的（正确的那份） | 24,459,264 B | 有 |

`ui/dist` 的静态资源是**在 `tauri build` 阶段嵌进 exe 的**；`cargo build` 只编 Rust 代码，产物里没有页面，
Tauri 主窗口去要自己的资源时落到 `localhost`，于是浏览器内核报「拒绝连接」。日志里同时有一行
`app: window shown without its page ready`（窗口 8 秒兜底显示）——**这行出现就说明装的 exe 不对**。

判别办法：在 exe 里搜字符串 `chinese/pinyin.json`，搜得到才是带资源的那版。

修好之后的日志（同一份代码、同一台机器）：

```
app: window shown            ← 页面说了 ready，窗口正常显示
page: running (its scripts loaded)
```

已写进 HANDOVER §4（构建四步的坑 2）与 §9（故障对照表）。**教训：装配只认 `tauri build` 的 exe**，
插件的 dll 才用 `cargo build -p westplay-plugin`。

### 实机验证（待 owner）

1. 打开「车辆信息」：左边是车的品牌型号，右边五项磨损应当和游戏里维修界面/F7 的数字一致；
2. 挂上挂车：左栏出现挂车身份、右栏出现挂车磨损；摘掉挂车，左栏回到「未连接挂车」；
3. 接货后再看：底部出现货物名、吨位、货损；撞一下，货损数字应当跟着游戏涨；
4. 老版本游戏没有挂车磨损通道：那两行显示「—」，不是 0%。

> 注意：这一版**插件和宿主必须一起换**（桥接版本 24 → 25）。只换界面不换 `westplay.dll` 的话，app 会一直显示
> 「等待游戏数据…」——因为老插件不发这些字段。

---

## 35. 倒车影像（2026-11-01 傍晚）

owner 原话：“**试着添加倒车影像功能，条件：在车辆未连接挂车时挂R档显示车尾视角，连接挂车时按挂R档显示车顶视角，
然后在底下加上黄色小字：倒车时请注意后方安全**”；随后问：“**尝试能否直接调用游戏视角**”。

### 35.1 先说结论：拿不到游戏的画面，所以是画出来的

三条证据，都是这个仓库自己的代码：

| 事实 | 在哪 |
|---|---|
| SDK 只给**数据**，没有任何“设置/读取相机画面”的接口；插件能找到的只是相机的**世界坐标**（扫可执行文件定位那个三浮点静态地址） | `crates/plugin/src/camera.rs` |
| WestPlay 的界面是游戏画在驾驶室里的**纹理**：宿主把 app 的画面填进那块屏幕纹理，游戏自己把它当驾驶室的屏幕（GPS 屏、平板）画出来 | `crates/plugin/src/screens.rs` |
| 相机一旦离开驾驶室，那块屏幕就不画了 —— 宿主正是靠“纹理这一帧有没有被画”判断玩家在不在车里 | `crates/host/src/camera.rs` |

所以“直接调用游戏视角”= 让游戏切到车外/顶部相机 = **驾驶室不在画面里 = WestPlay 界面（包括那句黄字）整块消失**。
切视角技术上做得到（插件已经能往游戏窗口发键，输入法就是走这条路；也能改内存里的相机坐标），但代价是监视器本身没了。
要“有倒车画面 + 有提示”，只能由 WestPlay 自己画。

### 35.2 做成了什么

挂 **R 档**（`displayedGear < 0`，游戏里就是 `R1`/`R2`）时，整个座舱屏切成一台监视器：

| 条件 | 画面 |
|---|---|
| **未连接挂车** | **车尾视角**：从车尾往后看的路面（透视、米数行）、红/黄/绿三条动态辅助线、画面底部露出车尾保险杠与两盏尾灯 |
| **已连接挂车** | **车顶视角**：俯视整车（牵引车 + 13 m 挂车 + 车轮 + 鞍座）、1 m/5 m 米格、挂车尾部将扫过的弧形区域与黄色虚线 |
| 两种都有 | 顶栏：挡位徽标（`R1`）、车速、视角名、挂车名（没挂车写「未连接挂车」）；底部：**黄色小字「倒车时请注意后方安全」** |

- 辅助线**随方向盘摆**：车尾视角的三条带子远端摆得比近端多（透视），车顶视角的弧跟着弯；
- 只在挂 R 时出现，**退出 R 立刻回到原来的界面**（不打断、不重载）；把屏幕交给卡车原厂屏时不显示；
- 三语；不做动画（性能模式下一样）；深色监视器样式，跟外观设置无关（摄像头画面本来就不该是白的）。

### 35.3 数字怎么来的

| 量 | 来源 / 算法 |
|---|---|
| 是否倒车 | `displayedGear < 0`（`formatGear` 里就是 R1、R2） |
| 哪个视角 | `trailer.connected` 为真，或游戏报了挂车身份（`id` 非空）→ 车顶；否则车尾 |
| 辅助线摆动 | `truck.effective.steering`（SDK 的 -1..1，逆时针为正）→ `bend`（±0.02 死区） |
| 车尾视角的米数行 | 透视：`y = 210 + 350 / (1 + 0.9d)`，半宽 `172 / (1 + 0.9d)`；三条带子按 `10 + 26d` 像素摆动 |
| 车顶视角的弧 | 从挂车尾轴起，每 14 px 一步、每步转 `0.03 · bend` 弧度，积分出中线和 23 px 半宽的扫描带（曲率夸张过：真车的转弯半径比屏幕大） |
| 挡位、车速 | 现成的 `formatGear` / `speedKmh` |

### 35.4 改了什么

| 文件 | 作用 |
|---|---|
| `ui/src/cabin/reverse/reverse.ts`（新） | 纯逻辑：`reversing`、`reverseView`、`bend`、`groundAt`、`guides`、`roofArc` |
| `ui/src/cabin/reverse/ReverseCamera.tsx`（新） | 监视器页面：两个视角的 SVG、顶栏、黄字 |
| `ui/src/cabin/reverse/reverse.css`（新） | 深色监视器样式，`z-index: 30`（压住座舱页与视频洞，在光标 40、屏边 50 之下） |
| `ui/src/cabin/reverse/reverse.test.ts`（新） | 11 个测试：R 判定、视角选择、bend、透视行、三带子对称/镜像、直线弧与闭合扫描带 |
| `ui/src/cabin/CabinApp.tsx` | 在 `Shell` 的 overlay 里挂上（通电时） |
| `ui/src/cabin/state/strings.ts` | `reverseCamera`：三语标题、两个视角名、挂车、黄字 |
| `ui/src/shared/host.ts` | 补上 `Telemetry.steering`（宿主一直在发，TS 一直没声明） |

**插件、宿主、桥接一个字没改**（不需要）：挂 R、方向盘、挂车身份的数据这轮之前就已经在送了。

### 35.5 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **72 文件 / 532 测试全过**（新增 `reverse.test.ts` 11 个） |
| `cargo` | 未改动；插件 dll 仍是上一轮那份 556,032 B |
| 装配 | exe **24,463,360 B**、`ui` 72 个文件、插件 dll 556,032 B |
| 启动自检 | 日志 `app: window shown`、`page: running (its scripts loaded)`，**0 个 error/panic** |
| 安装包 | **10,265,336 B**，SHA256 `75BF972589BDABC56EA3ED7657DD49295C547B6C8F45A4155C96938BDB8848C4` |

### 35.6 已知边界（想改就看这里）

- **不是摄像头画面**。游戏不给世界画面，这是画的；数字（挡位、车速、方向盘）是真的。
- 辅助线方向如果实机看着是反的：`reverse.ts` 里的 `GUIDE_SIGN` 改成 `-1`（一个符号），车顶视角是 `roofArc` 里的 `-bend`。
- 挂 R 时整天屏被占：正在放的全屏视频会被压住（倒车安全优先）。
- 30 秒自验“页面为什么会消失”：游戏里按相机切换键切到车外/顶部视角，WestPlay 界面立刻不见；
  切回驾驶室又回来。这就是 35.1 那条事实。
- **如果仍要“游戏自己的真视角”**：可以做成开关（挂 R 时模拟游戏相机键切顶部视角，退出 R 切回驾驶室），
  但那期间 WestPlay 完全不显示（黄字也没有），而且要读玩家的 `controls.sii` 键位、还要和玩家自己转视角抢控制。
  这一条等 owner 定。

---

## 36. 挂 R 档真切游戏视角（2026-11-01 傍晚）

owner 原话：“**做成挂R时真切换视角，如果无法实现就做成倒车雷达（不同距离的提示音那种）**”，随后
“**让屏幕真的显示游戏视角**”。

### 36.1 结论：切视角能做，雷达做不了

| 要的东西 | 能不能 | 为什么 |
|---|---|---|
| 挂 R 时**真的切**游戏的相机 | **能**（§36.2） | 相机是游戏的键位（`mix cam1`…`mix cam8`，玩家可改，写在 profile 的 `controls.sii`）；宿主读玩家真实键位，把这一下“按键”送进游戏（`SendInput`，和玩家自己按一模一样） |
| **倒车雷达**（不同距离的提示音） | **不能** | SDK 不提供“后方障碍物距离”，也不给碰撞物的位置：游戏世界里的建筑、AI 车、路桩对插件全是不可见的。能做“按时间哔哔”，但那是假的，不如不做 |
| 让屏幕（WestPlay 平板）显示游戏画面 | **不能同时有界面** | 见 §35.1：切了视角，驾驶室不在画面里，那块屏幕就不画了，界面连同黄字一起消失 |

所以这轮做的是：**挂 R 真切游戏的相机**。切出去以后看的是游戏自己的画面（真像素、真渲染），WestPlay
的界面这时候不显示；WestPlay 自己画的倒车影像（§35）退到兜底位置——按 R 到切视角成功之间的几百毫秒，
以及按键没送到游戏的时候。

### 36.2 做成了什么

挂 R（`displayedGear < 0`，游戏里就是 R1/R2）并且**稳定 400 ms**（防抖：从 R 拨回 N 再进 R、或拨杆抖一下，
都不算）之后：

| 条件 | 切成游戏哪个相机 | 默认是玩家的哪个键 |
|---|---|---|
| 挂着挂车 | 顶部视角（相机 3） | `keyboard.key3` |
| 没挂挂车 | 车外视角（相机 2，在车尾后面） | `keyboard.key2` |
| 退出 R | 回驾驶室（相机 1） | `keyboard.key1` |

不乱按的几条（都有单测）：

- **只在驾驶室视角时切**：玩家自己已经在车外，就不动他的视角；
- **游戏暂停时不切**（在菜单里按数字键会改成别的设置）；
- **玩家正在往 WestPlay 里打字时不切**（那时候键盘被输入法接管，我们这个键会被吃成一个字符）；
- **游戏窗口不在前台时不按**（否则这个键会落进别的窗口），下一次冷却过后再试；
- **只切回自己切过的视角**（玩家自己在 R 里按了相机键，退出 R 时不会再被拽一次）；
- 两次按键至少隔 900 ms。

### 36.3 怎么知道成没成：看日志

`%USERPROFILE%\Documents\WestPlay\logs\app.log`：

```
reversing: the game's camera 3 (key 0x33) pressed
camera: outside the cab
```

第二行（`camera: outside the cab`，`camera.rs` 原有的判定）出现 = 相机真的切出去了。
只有第一行、没有第二行 = 这一下没被游戏吃下：把 `reversing.json` 里的相机号换一个再试（见下）。
`not pressed: the game's window isn't in front` = 按键没送出去（游戏不是前台）。

### 36.4 不用重编译就能调

`%USERPROFILE%\Documents\WestPlay\reversing.json`（没有这个文件就是默认值；每 5 秒重读一次）：

```json
{ "enabled": true, "reversing_camera": 3, "solo_camera": 2, "cab_camera": 1 }
```

- 相机号 1…16 里取 1…8，游戏不存在的号退回默认；
- `enabled: false` = 完全不切，回到 §35 那套“WestPlay 自己画的倒车影像”；
- 如果 cam3 在你机器上不是顶部视角：先在游戏里手动按 1…8 找到顶部那个号，把它写进 `reversing_camera`。

### 36.5 改了什么

| 文件 | 作用 |
|---|---|
| `crates/host/src/keys.rs`（新） | 按键：`SendInput` 按下 45 ms 再松开（一帧只查一次键盘的游戏也看得到）；只在游戏窗口是前台时发；带 2 个测试 |
| `crates/host/src/reversing.rs`（新） | 状态机：挡位防抖 / 冷却 / 四个条件 / 只切回自己的；`reversing.json`；带 7 个测试 |
| `crates/host/src/game_settings.rs` | 读 `controls.sii` 的 `mix cam1`…`mix cam8` → 虚拟键（`key3`/`num8`/`f4`/字母/方向键等都认），带 3 个测试 |
| `crates/host/src/lib.rs` | 每帧调用一次（`View { in_cab, paused, typing }`），日志；`keys::tick()` 在循环里 |
| `ui/src/shared/host.ts` | 上一轮补的 `Telemetry.steering`（本轮没动） |

**插件、桥接、UI 一个字没改**：插件 dll 仍是 556,032 B，桥接版本还是 25 —— 这轮只换了 exe。

### 36.6 验证

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | **218 通过 / 0 失败 / 26 忽略**（新增 11 个：`reversing` 7、`game_settings` 2、`keys` 2） |
| `cargo build` 警告 | 0 |
| `tsc -b` / `vitest run` | 0 错 / **72 文件 532 测试**（UI 没改） |
| 装配 | exe **24,461,312 B**、`ui` 72 个文件、插件 dll 556,032 B |
| 启动自检 | `app: window shown`、`page: running`，**0 个 error/panic** |
| 安装包 | **10,271,078 B**，SHA256 `10C28C3B93C9BB53485561BC993DCF8F37BFFDC536E2CC51DEA548A28B5D6245` |

### 36.7 已知边界

- **相机号的含义是游戏的**：1 驾驶室、2 车外、3 顶部（ETS2 的默认）。号不对就改 `reversing.json`，
  不用重编译；找不到就把你手动按出来好用的那个号告诉我，我改默认值。
- 玩家改过键位也没关系（读的是 `controls.sii`），但**绑到手柄/摇杆上的相机**按不了（那是设备输入，
  不是键盘）；这种情况日志会是 `not pressed`。
- 车外视角期间声音会闷（`camera.rs` 的既有行为：人不在车里）。
- 挂 R 时被占的屏幕不再显示 WestPlay 界面——这是“真切视角”的代价，也是 §35.1 那条事实的正面用法。
- **雷达不做**（§36.1）：没有距离数据。

---

## 37. 车机显示真实的游戏画面：偷游戏自己的镜子纹理（2026-11-01 晚）

owner 原话：“**还是无法显示，可以移除辅助线，首要目标是让挂R档是车机能显示视角**”。

### 37.1 结论：能做，做的是“偷镜子”

车机（座舱里那块屏）上的每一个像素，都是 WestPlay 自己的页面：游戏只是把我们的纹理贴在屏的模型上
（§35.1）。所以要让车机显示**真画面**，只有一条路——把游戏自己渲染出来的真像素塞进那块纹理。

游戏每帧都渲染两个朝后的视角：**左右后视镜**。这台的设置是 `r_mirror_scale_x/y = 2`，也就是镜子
渲染成屏幕的 1/2 尺寸（1280×720，正好等于车机纹理的尺寸）。插件把这两张读回来、左右并排、写进车机
纹理，替换掉页面帧：**车机显示的是游戏渲染器给出的真实像素**，而相机仍在驾驶室（屏只有在这个视角才被画）。

- 只在**挂 R** 时换；退出 R 的下一帧页面就回来了。
- 相机的自动切换（§36）现在**默认关**：切了相机，驾驶室连同那块屏一起不在画面里，与“车机显示视角”相反。
  想要整屏切游戏视角，`reversing.json` 里 `enabled: true`。
- 倒车雷达照旧不做（§36.1）。

### 37.2 上一轮为什么“无法显示”（日志里两条硬证据）

| 现象 | 原因 | 这轮的改法 |
|---|---|---|
| 13:43:34–38 连续四次 `reversing: … pressed`，一次 `camera: outside the cab` 都没有 | 游戏按**扫描码**读键盘（DirectInput），上一轮只送虚拟键，游戏看不见 | `keys.rs` 的按键补上 `MapVirtualKeyW` 的扫描码 |
| 就算切成功，也是整屏离开驾驶室＝车机连界面一起消失 | “切相机”与“车机显示”是互斥的 | 切相机默认关；车机改走镜子真像素（本轮主体） |

### 37.3 怎么认出镜子（`crates/plugin/src/mirror.rs`）

每帧在 `OMSetRenderTargets` 里看被绑成渲染目标、同时能当着色器资源（RT+SRV）的纹理，留下：

1. mips=1、单采样、格式是 `R8G8B8A8`（UNORM 或 sRGB：镜子是色调映射后的图）；
2. 尺寸能把车机的 1280×720 整除 1、2、3 或 4 倍（就是 `r_mirror_scale_x/y` 的那几档）；
3. 排除车机自己的纹理（`note_screen`：游戏把页面帧写进去的那些，尺寸一模一样）；
4. 同尺寸**恰好两个** → 左右镜；有多个候选尺寸时取最大的那对（避开广角小镜、环境反射等同样成对的缓冲）。

然后：至少隔 80 ms 读回一次（读回会阻塞渲染线程，只在挂 R 时做），左右各缩进半边、并排铺满
1280×720，先写进插件自己的纹理，再按页面帧同样的路数拷进车机纹理。视图 700 ms 没更新就当作没有
（相机离开驾驶室、游戏暂停）→ 自动回到页面帧。

### 37.4 自证：第一次抓到会 dump

`%USERPROFILE%\Documents\WestPlay\logs\mirror\{left,right,sheet}.bmp` —— 抓到的两张原图和拼好的
车机画面。日志两行：

```
mirror: 1280x720 mirrors read back and dumped in …\logs\mirror
mirror: no pair of the game's render targets is a mirror's size; the app's page stands   （认不出来时）
```

车机上如果显示的不是镜子（认错了缓冲），看 sheet.bmp 就知道该改哪条规则。

### 37.5 改了什么

| 文件 | 作用 |
|---|---|
| `crates/plugin/src/mirror.rs`（新） | 认镜子 + 读回 + 合并 + 写车机纹理 + dump；5 个单测 |
| `crates/plugin/src/screens.rs` | 挂 R 时车机纹理换成镜子视图（其余照旧） |
| `crates/plugin/src/d3d.rs`、`lib.rs` | 钩子接线（两个 OMSetRenderTargets、Present 的帧计数）、`mod mirror` |
| `crates/plugin/src/telemetry.rs` | `in_reverse()`（`displayedGear < 0`） |
| `crates/host/src/reversing.rs` | 切相机默认 **off** |
| `crates/host/src/keys.rs` | 按键带扫描码（DirectInput 看得见） |

**桥接没动**（`BRIDGE_VERSION` 仍 25），UI 没动；但**插件 dll 与宿主 exe 都要换**（都在本轮产物里）。

### 37.6 验证

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-plugin --lib` | **42 通过 / 0 失败 / 1 忽略**（新增 5 个 `mirror` 单测） |
| `cargo test -p westplay-host --lib` | **219 通过 / 0 失败 / 26 忽略** |
| 插件 dll | **586,240 B** |
| exe | **24,460,288 B**、`ui` 72 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,277,793 B**，SHA256 `4B9C595E947A16903FF34B27D91BA12754F96D6293056D9E8910EE0D166654F7` |

### 37.7 已知边界

- **谁左谁右没验证**：两张纹理谁是哪边是按绑定顺序猜的，反了就在 `mirror.rs` 的 `pair` 里交换。
- 玩家关掉后视镜、或把镜面尺寸改成 1/2/3/4 以外的值 → 认不出来，回落自己画的倒车影像（日志会说）。
- 车机里**没有黄字、没有辅助线**了：那是游戏的像素，插件不会在上面画字（要黄字就得回到页面那一套）。
- 挂 R 时每 80 ms 一次 GPU 读回，渲染线程会有小停顿（只在 R 时；这是“真像素”的代价）。
- 镜像是屏的 1/2 → 放大到车机满宽，比原生略软。

---

## 38. 挂 R 切到游戏自己的视角：按键三种送法 + 按了要看结果（2026-11-01 晚，接 §37）

owner 附了两张截图（整屏的“车后上方”与“正上方”视角），原话：“**我的意思是显示这种视角，再改改**”。

### 38.1 要的是整屏的游戏视角，不是车机

§36 的设计本来就是它：挂 R 时按游戏自己绑定的相机键，切到俯视/车后视角，整屏都是游戏渲染的真画面。
§36 失败在**按键没被游戏吃下**（四次 `pressed`，相机一次都没动）。§37 想绕开按键从侧面把真像素塞进车机，
方向错了：车机只是屏上的一块，owner 要的是整个屏幕。

### 38.2 §37 那条路（偷镜子）为什么放弃

§37 的读回**真的跑起来了**（owner 这轮进过游戏，`logs/mirror/` 有三张 2.76 MB 的 BMP，日志
`mirror: 1280x720 mirrors read back and dumped …`）。但 dump 出来的是**法线缓冲**：`left.bmp` 是驾驶室内饰
在视图空间里的法线图（紫绿一片，方向盘、仪表台、屏幕都在，还有前方的车），不是后视镜。也就是说
“RT+SRV、1280×720、成对”这套规则认错了纹理——游戏里同尺寸的缓冲很多。

所以：

- 镜子这条**不再往车机上写**（写了就是把法线图显示在屏上，比页面更糟）；
- 只保留“一次会话 dump 一次”的勘察（`mirror::survey`），留作下次真要找镜子时的底片；
- 车机照旧显示页面，倒车靠游戏自己的相机（本节）。

### 38.3 按键：一次按下，三条路同时送

`crates/host/src/keys.rs` 现在一次按键发三样东西（相机键是“选第几个相机”，重复按还是那个相机，所以冗余
是安全的）：

| 送法 | 谁读它 |
|---|---|
| 只带**扫描码**的 `SendInput` 事件（`KEYEVENTF_SCANCODE`，扩展键带 `KEYEVENTF_EXTENDEDKEY`） | 轮询原始输入 / DirectInput 的游戏 |
| **虚拟键 + 扫描码**的 `SendInput` 事件 | 读窗口消息、按虚拟键查绑定的游戏 |
| 给游戏窗口 `PostMessage` 的 **`WM_KEYDOWN`／`WM_KEYUP`** | 在自己的窗口过程里收键的游戏 |

按下仍保持 [`HOLD`] 45 ms 再发抬起；仍只在游戏窗口在最前面时发；抬起时把三条路都补一遍，不会让游戏以为键
一直按着。

### 38.4 闭环：按了不算数，看相机真动没动

`crates/host/src/reversing.rs` 每次都看相机有没有变成要去的那个（插件一直把“相机在不在驾驶室外”报给宿主）：

| 时刻 | 做什么 |
|---|---|
| 档位稳定进 R（400 ms） | 按 `reversing_camera`（有挂车）或 `solo_camera`（空车） |
| 700 ms 内相机没出去 | **再按一次**，日志 `the camera didn't change with press 1 of camera 3; pressing it again (2/3)` |
| 三次都没动 | 放弃并明确写 `the game kept its camera through 3 press(es) of camera 3; the app's own reversing view stands`，自己画的倒车影像兜底 |
| 退出 R | 按 `cab_camera` 回驾驶室，同样带确认 |
| 换挡 | 在途的按键作废，不为旧挡位继续按 |

`reversing.json` 的 `enabled` 现在**默认开**（这一轮就是要整屏切视角）。

### 38.5 日志怎么判断成败

```
reversing: the game's camera 3 (key 0x33) pressed          ← 按下去了
camera: outside the cab                                     ← 游戏吃了：整屏都是游戏视角
```

没吃下时会连着出现两行 `pressing it again (2/3)`、`(3/3)`，最后是 `the game kept its camera through 3 press(es)`。

### 38.6 改了什么

| 文件 | 作用 |
|---|---|
| `crates/host/src/keys.rs` | 三条送法（扫描码 / 虚拟键+扫描码 / 窗口消息），抬起补全 |
| `crates/host/src/reversing.rs` | 默认开；按后确认、按不住就重按（最多 3 次）、放弃时写清楚；换挡作废在途按键；2 个新单测 |
| `crates/plugin/src/mirror.rs` | 从“写车机”改成“只勘察”：一次会话 dump 一次，永不写屏 |
| `crates/plugin/src/screens.rs` | 挂 R 时只调用勘察，页面照旧 |

### 38.7 验证

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略**（新增 `presses_again_while_the_game_keeps_its_camera`、`a_camera_that_moved_confirms_the_press`） |
| `cargo test -p westplay-plugin --lib` | **42 通过 / 0 失败 / 1 忽略** |
| exe | **24,458,752 B** |
| 插件 dll | **584,192 B**（`D:\WestPlay` 与游戏插件目录同步） |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,277,043 B**，SHA256 `9B1C0567A24C97A95FCE0EAB232FD04D8ED286576C4792E4866E755B004D0127` |

### 38.8 已知边界

- **不知道你截图里那两张各是几号相机**：默认用 3（正上方俯视，倒车最常用）。想换成“车后上方”那张，
  把 `reversing.json` 的 `reversing_camera` 改成 4~8 逐个试（文件放在 `Documents\WestPlay\`，改完 5 秒内生效，不用重启）。
  空车用的是 `solo_camera`（默认 2，车尾后方）。
- 若游戏三种输入都不看（自己轮询设备），三条路都白按：日志会明确写“三次都没动”。那下一步就改成插件在游戏
  进程里注入（插件已经在进程里，可以做）。
- 玩家在 R 期间自己切回驾驶室，3 次重按之内会被再切走一次；之后不再干预。
- 相机切换期间（`SETTLE` 400 ms + 最多 3 次确认）屏幕上是游戏视角，不是 WestPlay 页面；这是有意的。

---

## 39. 倒车屏幕 = 游戏地图正上方俯视（2026-11-01 深夜，接 §37/§38）

owner 原话（附“正上方”截图）：“**让车机屏幕显示车顶视角就行了（游戏内按3那种视角效果）**”。

### 39.1 结论：用游戏自己的地图数据画一个正上方俯视

游戏的画面进不了车机（§37 读回的是法线缓冲，§38 切相机等于把屏切没了，见 39.2），而“按 3 那种视角”本质上
就是**从正上方看卡车周围**。WestPlay 手里有游戏自己的道路与建筑数据（地图页用的就是它），所以倒车页改成：
**把实时地图压到正上方**——卡车在正中、正北朝上、跟着车走（`maps/liveMap` 的 `northUp` 视图，`pitch 0`），
和“按 3”的构图一致。

- 挂 R 自动进入，退出 R 自动回到原来的跟车视角；
- 保留黄色提示“倒车时请注意后方安全”和顶部挡位/车速；
- **辅助线删掉**（owner 说过可以移）；
- 相机自动切换（§36/§38）恢复**默认关**：切了相机屏就不画了，与“车机显示”相反；想整屏切视角仍可开。

### 39.2 为什么不是游戏的画面（三条硬约束）

| 约束 | 结果 |
|---|---|
| 车机上的像素只能是 WestPlay 的纹理（游戏只是把页面贴到屏的模型上，§35.1） | 真画面得我们自己“塞” |
| 游戏只在**驾驶室视角**下画那块屏（相机一出去，屏连同驾驶室一起不画了，§36） | 切到“按 3”的相机，车机就消失了 |
| 一帧只渲染**一个**世界视角；§37 试图从渲染目标里偷“后视”，抓到的是**法线缓冲**（`logs/mirror/left.bmp`） | 想同时有驾驶室和俯视，游戏不会给 |

所以“游戏内按 3 那种效果”在车机上只能**按构图复刻**：俯视、正北、卡车居中、跟着车走。

### 39.3 与“按 3”的差别（说在前面）

| | 游戏按 3 | 这里的车机 |
|---|---|---|
| 画面来源 | 游戏渲染的 3D 世界 | 游戏自己的**地图数据**（道路、建筑、地块）由 MapLibre 画 |
| 卡车模型 | 有（真模型） | 地图上的卡车标记（蓝色箭头盘） |
| 其他车辆/行人 | 有 | 无（联机玩家有标记） |
| 光照/天气 | 游戏 | 跟随 WestPlay 的明暗主题 |
| 跟随 | 相机跟车 | 相机跟车，正北朝上 |

倒车真正要看的东西（车位、邻车位置、路沿、车身姿态）都在：道路和建筑是游戏地图的真实几何。

### 39.4 改了什么

| 文件 | 作用 |
|---|---|
| `ui/src/cabin/reverse/ReverseCamera.tsx` | 倒车页改成“地图正上方”：顶部挡位/车速/标题、中间地图、底部黄字；进出 R 时自动切视图并还原 |
| `ui/src/cabin/maps/liveMap.ts` | 新增 `topDownLiveMap(on)`：显式把地图切到/切回正上方俯视（`northUp`），幂等 |
| `ui/src/cabin/reverse/reverse.css` | 去掉透视路面/辅助线/卡车俯视图那套样式，改成地图容器的布局 |
| `ui/src/cabin/reverse/reverse.ts`、`reverse.test.ts` | 只留 `reversing`／`reverseView`（判断是否显示、有挂车与否）；辅助线、透视行、车顶弧线一并删除 |
| `crates/host/src/reversing.rs` | 相机自动切换恢复**默认关**（切了屏就不画） |

**插件、桥接没动**（`BRIDGE_VERSION` 仍 25；插件 dll 与上一轮同一份 584,192 B）。

### 39.5 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **72 文件 / 525 通过**（删掉 7 个辅助线用例，保留倒车页的 5 个） |
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略** |
| `cargo test -p westplay-plugin --lib` | **42 通过 / 0 失败 / 1 忽略** |
| exe | **24,454,144 B**、`ui` 72 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,277,670 B**，SHA256 `38BE92F26A235520B3A60E99BFD700665F08B954BD45CF59EA55B1407F04F322` |

### 39.6 已知边界

- 地图要是没加载出来（刚启动、或地图数据未就绪），倒车页先显示纯深色底，一两秒后地图就位。
- 倒车时地图会**从地图页“借走”**（同一张地图移动位置），退出 R 自动还回去；这期间地图页的浏览位置会重置到卡车。
- 地图在正北朝上时，卡车标记的箭头指它的朝向；如果玩家更想要“车头朝上”，把 `topDownLiveMap` 里的
  `northUp` 换成跟车（倾斜）视图即可（一行）。
- 车速/挡位照旧来自游戏传送；地图自身每帧绘制，性能模式（显示与性能）里的限制照旧生效。

---

## 40. 退回第一版倒车影像（撤回 §39 的地图俯视，2026-11-01 深夜三）

owner：“**退回第一版**”，并确认指的是 **第一版倒车影像（手绘后视/车顶 + 辅助线，§35）**。

### 40.1 退回了什么

| 项 | 现在 |
|---|---|
| 挂 R 的画面 | **手绘倒车影像**：无挂车是车尾透视路面（1/2/3/5/8/12 m 横线 + 车身/尾灯/暗角），有挂车是车顶俯视（卡车 + 挂车 + 车轮 + 转向扫过的轨迹带） |
| 辅助线 | **红黄绿三条动态辅助线**回来（随方向盘弯，`guides()`） |
| 黄字 | “倒车时请注意后方安全” |
| 地图俯视（§39） | 撤掉：`topDownLiveMap`、`ReverseCamera.tsx` 里的地图宿主与 `useMapData` 都删了，`liveMap.ts` 回到没有这个函数的样子 |
| 相机自动切换（§36/§38） | 保持**默认关**（这一版本来就没有自动切相机） |
| 插件、桥接、镜子勘察 | 一律没动（`BRIDGE_VERSION` 仍 25，dll 仍是 584,192 B 的同一份；§37 的勘察仍只在倒车时转一次、只写日志） |

### 40.2 改了什么

| 文件 | 改动 |
|---|---|
| `ui/src/cabin/reverse/ReverseCamera.tsx` | 回到 §35 的版本：`RearView`／`RoofView` 两张手绘图，挡位/车速/标题/黄字 |
| `ui/src/cabin/reverse/reverse.ts` | `bend`／`groundAt`／`guides`／`REAR_VIEW`／`ROOF_VIEW`／`roofArc` 全部回来 |
| `ui/src/cabin/reverse/reverse.css` | 手绘图那套样式回来（`rev-view`、`rev-band`、`rev-swept`…） |
| `ui/src/cabin/reverse/reverse.test.ts` | 7 个用例回来（辅助线对称/摆动、透视行、车顶弧线） |
| `ui/src/cabin/maps/liveMap.ts` | 删掉 `topDownLiveMap`（§39 唯一碰过它的地方） |

### 40.3 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **72 文件 / 532 通过**（与 §39 之前一致，7 个辅助线/弧线用例回来） |
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略**（这轮没改 Rust，沿用） |
| `cargo test -p westplay-plugin --lib` | **42 通过 / 0 失败 / 1 忽略**（同上） |
| exe | **24,458,752 B**，`ui` 72 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,277,696 B**，SHA256 `2217701C74E3BB945B6E37E2B2AFAF0F132B698B3F7438CF6FE424BAE22110D7` |

### 40.4 备注

- 这一版就是 §35 那一版；§37 的镜子勘察、§36 的相机自动切换都还在代码里，但都不影响画面（勘察只写日志，切换默认关）。
- 想要“按 3 那种正上方俯视”的话，§39 的做法记在上面，改回来只需把 `topDownLiveMap` 和倒车页的地图宿主加回去。

---

## 41. 壁纸设置页新增“明暗壁纸”（浅色/深色各一张，2026-11-01 深夜四）

owner：“**在壁纸设置页新加一个明暗壁纸功能，可以让用户指定在浅色和深色模式切换的壁纸，此功能和随机轮换不兼容，
然后将两张默认壁纸移出随机轮换池**”。

### 41.1 做成了什么

| 项 | 行为 |
|---|---|
| 设置 › 壁纸 › “明暗壁纸”开关 | **默认关**（和以前一样：一张壁纸两种模式共用）。打开后，设置页把单张选择区换成两个：**“浅色模式壁纸”**、**“深色模式壁纸”**，各挑一张 |
| 与壁纸轮换互斥 | 开“壁纸轮换”会**自动关掉**“明暗壁纸”，开“明暗壁纸”会**自动关掉**轮换（互斥写在 store 的两个 setter 里，不靠界面记状态）。旧存档里两个都开着时，保留明暗壁纸、轮换关掉（`sanitize`） |
| 第一次打开时 | 两张先都等于**当前壁纸**（画面不跳，等你去挑）；已经挑过的一对会记住，关掉再开不覆盖 |
| 自动（auto）模式 | 白天/浅色时用浅色那张，夜间、开大灯时用深色那张（`state/hooks.ts` 按解析出的外观选） |
| 缺图时的回退 | 选中壁纸没有该模式的图（玩家自建壁纸可能只放了一张）：先用**另一模式那张壁纸**的同一模式图（外观听玩家的），两边都没有才回退到选中壁纸的另一张（此时界面跟随图片，沿用壁纸变体的老规则，`pickForAppearance`） |
| 轮换池 | **WestPlay 自带的 Silk 和 Plain 都不再参与轮换**，只在玩家自己添加的壁纸之间换；没有自建壁纸时轮换什么也不做（设置页脚注已写明） |
| 语言 | 英文/中文/土耳其文都加了 4 条新词（开关、说明、浅色模式壁纸、深色模式壁纸），轮换说明也改写了 |

### 41.2 改了什么

| 文件 | 作用 |
|---|---|
| `ui/src/cabin/state/store.ts` | 新增 `wallpapersByAppearance`／`wallpaperLight`／`wallpaperDark`，`setWallpapersByAppearance`（首次打开时初始化为当前壁纸）、`setWallpaperFor`；`setRotateWallpaper` 与它互斥；三个值随页面设置保存，`sanitize` 校验 |
| `ui/src/cabin/state/hooks.ts` | 外观解析后：开着明暗壁纸就按浅/深各取一张，否则照旧用单张 |
| `ui/src/cabin/wallpapers.ts` | 新增 `pickForAppearance(light, dark, appearance)`：按模式选图与回退规则 |
| `ui/src/cabin/state/wallpaperRotation.ts` | 轮换池去掉两张自带壁纸，只留玩家自己的 |
| `ui/src/cabin/state/strings.ts` | 新词条（en/zh/tr）与轮换说明改写 |
| `ui/src/cabin/apps/settings/SettingsApp.tsx` | 壁纸页：新增开关，开着时显示两个选择区（`WallpaperChoices`） |
| 测试 | `wallpapers.test.ts`（`pickForAppearance` 三条）、`wallpaperRotation.test.ts`（池里只有玩家壁纸）、新 `state/wallpaperPair.test.ts`（默认值、首次打开、记住一对、互斥） |

**Rust 与插件一行没动**（这功能全在页面里；`BRIDGE_VERSION` 仍 25，插件 dll 仍是 584,192 B 的同一份）。

### 41.3 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **73 文件 / 540 通过**（新增 1 个文件、8 个用例） |
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略**（未改 Rust，沿用） |
| `cargo test -p westplay-plugin --lib` | **42 通过 / 0 失败 / 1 忽略**（同上） |
| exe | **24,458,752 B**，`ui` 72 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,280,994 B**，SHA256 `21951C392C24ED4EF48719FFD39930924BFAD4FF474489DC1F1130A2DA2B5297` |

### 41.4 备注

- 明暗壁纸和轮换一样是**页面自己的设置**（`localStorage`），不进 WestPlay 的设置文件，也不出现在伴侣程序里；换机器不会带走。
- 想把自带两张放回轮换池，改 `wallpaperRotation.ts` 的 `pool()` 一行即可。
- 设置页脚注已经说清“此功能和壁纸轮换不能同时开启”，两个开关互相顶掉时页面会有一次外观淡入（`animateAppearance`），属于正常。

---

## 42. 快捷键也能控制网页应用（哔哩哔哩 / 网易云音乐 / QQ 音乐 / 蜻蜓 FM，2026-11-01 深夜五）

owner（附“设置 › 热键”截图：使用屏幕 / 按一次无需按住 / 调低音量 / 播放暂停 / 调高音量）：“**让哔哩哔哩，网易云音乐，
QQ音乐和蜻蜓FM可以支持这个快捷键控制**”。

### 42.1 原来为什么不行

| 环节 | 原来 |
|---|---|
| 按键怎么来的 | 插件在游戏里轮询绑定的键（`crates/plugin/src/keybinds.rs`），桥接到主机，主机把 `keybind` 消息（`volumeUp`／`volumeDown`／`playPause`）发给车机页面 |
| 页面怎么处理 | `ui/src/cabin/apps/keybinds.ts` 把动作交给**车厢自己的播放器**（YouTube、Spotify、Apple Music、YouTube Music） |
| 四个网页应用 | 它们是主机开的独立 WebView（`westplay_host::webapp`），不在那个播放器列表里，所以快捷键对它们无效 |

### 42.2 这轮怎么接上

- 新增 `ui/src/cabin/apps/web/player.ts`：把网页应用当成**第五个播放器**（`MusicPlayer`）——
  - `playingHere()`：页面报的媒体在播（`useWebApp.media.playing`）；
  - 播放/暂停：`Command::PlayPause`，即页面**自己的播放按钮**（`webapp.js` 的按钮匹配表，四个站各有规则）；
  - 音量：`Command::SetVolume`，即页面**自己媒体的音量**（主机 clamp 到 0..1；页面回传 `webAppVolume`，车厢滑块/歌词页跟着走）；
  - 订阅：页面开始/停止播放时通知，供“最后一次在这里播放”的兜底。
- `ui/src/cabin/CabinApp.tsx`：`followKeybinds()` 的播放器列表把网页应用**放在第一位**——正在看的站点在播时，快捷键先给站点；
  没有站点在播时，照旧给车厢的音乐应用。
- 行为边界没动：网页应用**不**加入 `oneAtATime`（不会因为站点开播就把音乐应用停掉），也**不**参与淡入淡出（`fade.ts`）；
  电动关闭时的暂停仍由 `pauseWithPower.ts` 负责。**Rust 与插件一行没改**（`Command::PlayPause`／`SetVolume` 本来就有，
  dll 仍是 584,192 B 的同一份，`BRIDGE_VERSION` 25）。

### 42.3 效果

| 键 | 站点在播时 | 站点没在播时 |
|---|---|---|
| 播放/暂停 | 按站点自己的播放按钮（四个站都走同一套按钮匹配） | 给车厢的音乐应用（原有行为） |
| 调低/调高音量 | 页面自身音量，5% 一档，屏幕右下角照旧弹出音量条 | 给车厢的音乐应用（原有行为） |

### 42.4 改了什么

| 文件 | 作用 |
|---|---|
| `ui/src/cabin/apps/web/player.ts`（新） | 网页应用作为 `MusicPlayer`：播放/暂停、音量、订阅 |
| `ui/src/cabin/apps/web/player.test.ts`（新） | 4 个用例：是否在播、播放/暂停发什么命令、音量读写、起停通知 |
| `ui/src/cabin/CabinApp.tsx` | 快捷键的播放器列表加上它（排第一） |

### 42.5 验证

| 项 | 结果 |
|---|---|
| `tsc -b` | 0 错 |
| `vitest run` | **74 文件 / 544 通过**（新增 1 个文件、4 个用例） |
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略**（未改 Rust，沿用） |
| `cargo test -p westplay-plugin --lib` | **42 通过 / 0 失败 / 1 忽略**（同上） |
| exe | **24,458,240 B**，`ui` 72 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,281,711 B**，SHA256 `1726C5180B3A26B23418D49BD69111BC041799EC3F763DF92C4161889DA15B7B` |

### 42.6 边界

- 音量作用在**页面自己的媒体音量**上：Bilibili 自己的音量条在页面顶部，两者调的是同一个值，最后一次操作说了算（和 §之前
  把它从车厢滑块里拿掉的理由一样）。想让它改“整个车厢的音量”是另一件事，得另做。
- 站点在后台 WebView 里继续播放时，快捷键仍会作用在它上面（声音还在响，按的就是它）；关掉应用若让页暂停，快捷键就回到音乐应用。
- 使用屏幕（`使用屏幕` 那个键）与“按一次，无需按住”不在这套里：它们走的是主机与游戏窗口的切换，和这四个站点无关。

---

## 43. 显示优先级：车机优先 / 平板优先（2026-11-01 深夜六）

owner（附“卡车屏幕”页截图，指着显卡那一块）：“**在这个位置添加一个显示优先级设置，关闭时车机优先，而开启时则是平板优先**”。

### 43.1 原来是怎么定的

游戏里能同时有两块“WestPlay 的屏幕”：卡车自己的那块（`crates/shared/screen_layouts.txt` 的 `generic` 和各车专用布局）
和 **WestPlay 平板**（`tablet` 布局，1280 × 898，任何车都能装的仪表台摆件）。插件原来固定**车机优先**：卡车自己的屏幕
一旦显示出 WestPlay，平板在这辆车里就保持空白（`OWN_SCREEN_SEEN`，2026-10-27 那次的理由：两块屏都显示，页面每帧被
按一种布局又按另一种布局画，85 次每秒，页面变慢直至卡死）。

### 43.2 这轮加了什么

| 层 | 改了什么 |
|---|---|
| 伴侣（卡车屏幕页） | GPU 分组上方新增一组“显示 › 显示优先级”，一个开关；关：车机优先，开：平板优先 |
| 设置 | `crates/host/src/settings.rs`：`ScreenSettings.tablet_first`（JSON `screen.tabletFirst`），默认 `false`（车机优先，即原来的行为）。加一个设置不用升设置文件版本（缺省即默认） |
| 桥 | `HostBlock.tablet_first`（1 = 平板优先），`BRIDGE_VERSION` **25 → 26**；主机在设置变化时写入 |
| 插件 | `crates/plugin/src/screens.rs`：`shows_here` 多了“平板是否已经显示过”（`TABLET_SEEN`）和优先级两个输入。平板优先时，平板一显示过 WestPlay，卡车自己的屏幕就交还给游戏；没有平板（平板从没被画出过）时照旧显示在车机上，**不会黑屏** |
| 复位 | 换车时 `TABLET_SEEN`、`OWN_KEPT_SAID` 与 `OWN_SCREEN_SEEN` 一起复位；日志各说一次（`tablet: shows WestPlay …`、`screen: … isn't WestPlay's now: the tablet has the display's priority`） |

### 43.3 效果

| 开关 | 车里装了平板 | 没装平板 |
|---|---|---|
| 关（车机优先，默认，老行为） | 车机显示 WestPlay，平板保持空白 | 车机显示 WestPlay |
| 开（平板优先） | 平板显示 WestPlay，车机交还游戏自己的画面 | 车机显示 WestPlay（不会黑屏） |

### 43.4 改了什么

| 文件 | 作用 |
|---|---|
| `crates/shared/src/lib.rs` | `HostBlock.tablet_first`；`BRIDGE_VERSION` 26 |
| `crates/plugin/src/screens.rs` | `shows_here` 的优先级；`TABLET_SEEN`／`OWN_KEPT_SAID`；日志；两个测试（原有的改名加参数，新增 `the_tablet_first_keeps_the_trucks_own_screen_as_the_games`） |
| `crates/host/src/settings.rs` | `tablet_first` 设置＋测试（默认值、JSON、旧文件缺省） |
| `crates/host/src/lib.rs` | 设置变化时写进桥 |
| `ui/src/companion/useSettings.ts`、`preview.ts` | 镜像字段 |
| `ui/src/companion/pages/ScreenPage.tsx` | `DisplayFirst`：新组＋开关 |
| `ui/src/companion/pages/words/*.ts` | 43 种语言的 `display`／`displayFirst`／`displayFirstDetail` |

### 43.5 验证

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-plugin --lib` | **43 通过 / 0 失败 / 1 忽略**（新增 1 个用例） |
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略** |
| `cargo test -p westplay-shared --lib` | **21 通过 / 0 失败** |
| `tsc -b` | 0 错 |
| `vitest run` | **74 文件 / 544 通过**（含 43 种语言字数一致性的用例） |
| 插件 | `westplay.dll` **584,704 B**，SHA256 `90C89E72FF1616E8EBB679FEB8F436AC298C3C42C7DA6DFA2D61559CD8CF9318` |
| exe | **24,457,728 B**，`ui` 72 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,282,102 B**，SHA256 `C59CCCF63B9DA813DF8260A096851C7F28F00764A3E62263733477F81DCF7B08` |

### 43.6 边界

- 只决定“**哪一块**屏显示 WestPlay”：一份页面每帧只能按一种布局画，两块屏不会各显示一份（43.1 的卡死原因）。
- `tablet_apart.txt` 列出的车辆（平板留着当原车屏幕用的那些）里平板永远不显示，平板优先自动退回车机。
- **桥版本升到 26**：游戏里那份 `westplay.dll` 必须换成新的（已替玩家放到 `bin\win_x64\plugins\`），换完**重启一次游戏**；
  只换 app 不换 dll 时，两边版本不同，互不相认（WestPlay 不会连上游戏）。

---

## 44. 地图 App 右上角的 2D/3D 切换；网易云音乐换成新版网页播放器（2026-11-01 深夜七）

owner（附车机屏幕与手机上的 WestPlay 照片）：“**在地图app的右上角添加一个2D/3D导航切换；然后把网易云音乐的webapp换成这个
https://music.163.com/st/webplayer ，要求能适配旧版的已有功能**”。

### 44.1 2D 与 3D 在这套地图里是什么

地图到这一轮只有一种跟随视角：车头朝前、向下倾斜 52°、车标压在屏幕下方三分之一处（CarPlay 那种驾驶视角，
`camera.ts` 的 `PITCH = 52`）。**2D** ＝ 同一个朝向、从正上方看（pitch 0）：还是跟着车、还是车头朝上，只是没有倾斜的透视；
**3D** ＝ 原来的倾斜视角。两者都不动“北朝上”那个开关（指南针）：北朝上本身就是从正上方看，在它那里 2D/3D 没有区别；
按箭头回到跟随视角，才又分出 2D/3D。

### 44.2 这轮加了什么

| 层 | 改了什么 |
|---|---|
| 视角状态 | `ui/src/cabin/maps/liveMap.ts`：`LiveMap` 多一个 `flat`；新 store `useMapFlat`；新函数 `flatLiveMap(flat)`——跟随中换视角走 `glideToTruck`（和按箭头回来一样平滑），浏览地图时原地 `easeTo`；地图重建（切 app、回主页再进）沿用 `useMapFlat` 里的选择 |
| 相机 | `ui/src/cabin/maps/camera.ts`：`PITCH` 从 `liveMap.ts` 移到这里，新函数 `followPitch(northUp, flat)`（北朝上或 2D → 0°，否则 52°）；`updateCamera` 用它决定 pitch |
| 按钮 | `ui/src/cabin/maps/MapControls.tsx`：新 `MapMode`——两段胶囊“2D ｜ 3D”，当前那段亮（`aria-pressed`）；`ui/src/cabin/dashboard/MapView.tsx` 把它画在地图块里，且只在 `interactive`（地图 App）画，仪表盘那块小地图没有 |
| 样式 | `ui/src/cabin/maps/maps.css`：`.map-tile .map-mode`（右上 22px、深色玻璃，浅色主题反色，字号跟 `--text-scale` 走）；**有引导路线时**搜索键要占右上角（`.map-search-button.guided`），用 `:has()` 把切换键让到它左边 100px，不叠在一起 |
| 文案 | `ui/src/cabin/state/strings.ts`：`map2d`/`map3d` 三语（en “2D map”/“3D map”、zh “2D 地图”/“3D 地图”、tr “2B harita”/“3B harita”），做 aria-label |
| 测试 | `ui/src/cabin/maps/camera.test.ts` 新增 `followPitch` 用例（3D 倾斜、2D 与北朝上都是 0°） |

按钮位置与形状先用无头 Edge 渲染 `maps.css` 核对过（右上角、避开引导时的搜索键、浅色主题）。

### 44.3 网易云音乐：换成新版网页播放器

打开的地址从 `https://music.163.com/` 换成 `https://music.163.com/st/webplayer`（owner 指定的新播放器）。换之前先用
Edge 的 DevTools 协议把新页面的 DOM 读出来核对，结论是**它把旧站的播放条整套留了下来**：

| 旧站就有的东西 | 新页面里是什么 |
|---|---|
| 播放条本体 | `.m-playbar`（外面套一层 `.g-btmbar`）——`webapp.js` 的 `playerArea()` 加认 `.g-btmbar` |
| 上一首 / 播放暂停 / 下一首 | `A.prv`（title “上一首(ctrl+←)”）、`A.ply`（“播放/暂停(p)”）、`A.nxt`（“下一首(ctrl+→)”）——还是按名字找，不用改 |
| 进度条与时间 | `.m-pbar`，时间仍画成文本（“00:39” / “03:43”）——`playerClock()` 不动 |
| 歌词 | 页面自己的同源接口（`/api/song/lyric`、`/api/search/get`）——不动 |
| 音量、座舱键盘、登录 | 媒体元素音量 / 输入框 / `MUSIC_U` cookie——同一域，cookie 共用，`netease_sign_in.js` 不动 |

只补了一处：新页面在**没登录、或刚打开还没放歌**时 Media Session 是空的，Now Playing 会是空白。所以 `webapp.js` 里
多了一个 `netease()` 读取器（和 QQ 音乐、蜻蜓 FM 的同位置），从播放条自己读歌名（`.words .name` 的 `title`，全名不截断）、
歌手（`.words .by`）、封面（`.head img`），并把歌曲 id 的识别从旧页面的 `#/song?id=` 扩展到新播放器的 `?id=`（歌词更准）。

### 44.4 检查

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略** |
| `cargo test -p westplay-plugin --lib` | **43 通过 / 0 失败 / 1 忽略**（这轮没动插件） |
| `cargo test -p westplay-shared --lib` | **21 通过 / 0 失败** |
| `tsc -b` | 0 错 |
| `vitest run` | **74 文件 / 545 通过** |
| `node --check crates/host/src/webapp.js` | 通过（页面脚本是注入的，先过一遍语法） |
| 插件 | `westplay.dll` **584,704 B**，SHA256 `90C89E72FF1616E8EBB679FEB8F436AC298C3C42C7DA6DFA2D61559CD8CF9318`（未变） |
| exe | **24,458,240 B**，`ui` **72** 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,285,427 B**，SHA256 `A38C314CB1A562F30D178ED5081A303E9396074D87EEB11423536527198809A1` |

### 44.5 边界

- 2D/3D **不写进设置文件**：跟着这次运行走（切 app、回主页再进都记得，重启回到 3D）。要长期记住再说。
- 只有**地图 App**有这两个键：仪表盘上的那块小地图（`interactive` 为假）不显示，免得挤占本来就是给导航留的地方。
- 网易云换的是**打开的地址**；登录窗口、账号页仍走 `music.163.com` 根域（同一批 cookie），旧地址照样能用。
- 新播放器和旧站一样，**没登录时浏览器里不给放歌**（会显示“打开客户端播放”的提示）——账号在伴侣里登一次即可，
  Now Playing、歌词、音量、快捷键都按登录后的样子走。

---

## 45. 倒车影像把音量压到 15%，挂出倒挡恢复（2026-11-01 深夜八）

owner：“**给倒车影像加上这个功能：启用时，音量自动下降到15，挂到其它挡位时音量恢复**”。

### 45.1 原来

倒车影像（§35–§40）在挂 R 档时占满屏幕，音乐照旧按玩家设的音量放：倒车时听不清车外、挂车和气刹的声音，
而这正是影像要帮的那件事。

### 45.2 这轮加了什么

| 层 | 改了什么 |
|---|---|
| 新模块 | `ui/src/cabin/reverse/quiet.ts`：`REVERSING_VOLUME = 0.15` 与 `quietWhileReversing(players)`——订阅 `useLive` 的挡位（`reverse.ts` 的 `reversing`：`displayedGear < 0`，与影像同一判据），进 R 把每个播放器压到 15%，出 R 恢复；返回停止函数 |
| 音量怎么压 | 走 `fade.ts` 的 `fade()` + `MusicPlayer.sendVolume()`，和“离开游戏淡出、回来淡入”同一套：0.3 s 平滑下落与回升，**不写播放器自己的音量**，所以各 app 的滑块、快捷键设的值都不变 |
| 恢复成多少 | 出 R 时读该播放器此刻自己的音量：仍读作 15%（网页页面会把它被设的音量回报上来）就用进 R 前记下的那个；玩家在倒车时自己调过，就用新的那个 |
| 谁会被压 | 五个播放器全压（网页应用、YouTube、Spotify、Apple Music、YouTube Music）——影像是全屏的，盖住的是整个座舱，不是某一个 app |
| 不动的情况 | 本来就 ≤15% 的（静音、或本来就轻）不动，不会往上调；没有音量可设的（Spotify 在别的设备上、播放器还没加载）跳过；倒车中才开始播的，一开始就被压低 |
| 接线 | `ui/src/cabin/CabinApp.tsx`：把五个播放器的列表抽成 `CAB_PLAYERS`（与快捷键同序），`followKeybinds()` 与新的 `useEffect(() => quietWhileReversing(CAB_PLAYERS), [])` 共用一份 |
| 测试 | `ui/src/cabin/reverse/quiet.test.ts` 五个用例：进 R 落到 15% / 出 R 回到原值 / 本来就轻的不动 / 一个挡位只动一次 / 倒车时改过音量就回新值（含“网页回报被设音量”那一种） |

### 45.3 检查

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略**（这轮没动 Rust） |
| `cargo test -p westplay-plugin --lib` | **43 通过 / 0 失败 / 1 忽略** |
| `cargo test -p westplay-shared --lib` | **21 通过 / 0 失败** |
| `tsc -b` | 0 错 |
| `vitest run` | **75 文件 / 550 通过**（新增 `quiet.test.ts` 的 5 个） |
| `prettier --check` | 通过的三个文件都合式 |
| 插件 | `westplay.dll` **584,704 B**，SHA256 `90C89E72FF1616E8EBB679FEB8F436AC298C3C42C7DA6DFA2D61559CD8CF9318`（未变） |
| exe | **24,458,240 B**，`ui` **72** 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,284,034 B**，SHA256 `2B2C7CE896B258FB95D8EC313CEB571D822B95146A787FD740C715F1D36B6148` |

### 45.4 边界

- 判据是**挡位**（`displayedGear < 0`，R1/R2 都算），不是“影像这会儿可见”：即使这块屏交给了车机自己的屏幕
  （§43 的显示优先级），倒车时音乐一样会被压低。
- 15% 是**绝对值**（音量 15/100），不是“减 15”：原来 60% 的会落到 15%，原来 10% 的保持 10%。
- 玩家在倒车时按音量键或拖滑块，**以玩家为准**：出 R 时恢复的就是他刚设的那个值，不会被拽回进 R 前的音量。
- 不写进设置文件，也没做开关：跟着倒挡走，任何车、任何 app 都一样。

---

## 46. 页面自己的拖动条；页面放大改用右 Ctrl + 滚轮；红绿灯相位查证（2026-11-01 深夜九）

owner 先后三条：
1. “把网易云音乐还原成上一个版本;然后网页放大和换挡按键冲突了，改成右ctrl+滚轮;接着给地图加上显示红绿灯和读秒的功能，详情见图”
2. “网易云音乐不退回第一版，给下方和右边加上和其他app一样的拖动条”
3. “红绿灯相位和读秒可以直接读游戏内存：traffic_light.state state_time_remaining”

所以网易云**留在**新版播放器（`https://music.163.com/st/webplayer`，§44），这一轮做前两条里的两件事，第三条先给出查证结果。

### 46.1 页面自己的拖动条

站点是按整个窗口排版的，网易云的新播放器把 `html`/`body` 都设成 `overflow: hidden`：页面放大以后右下角有内容看不见，而又**没有东西可以拖**（滚轮落在 `hidden` 的根上不滚动）。做法（`crates/host/src/webapp.js`，注入到每个站点的顶层文档）：

- `html, body { overflow: auto !important }`——只有真有内容溢出时才出现滚动条，放得下的页面一点不变；
- 给滚动条上样式：16px、半透明圆角滑块（`border` 4px 透明 + `background-clip: content-box`，看起来像浮在玻璃上的一条），`scrollbar-width: thin`——**右边一条、下面一条**，两个方向都有；
- 滑块的 `:hover` 亮一档，滚动条角落透明。

无头 Edge 里对真页面核对过：注入前 `html` 是 `hidden`、`::-webkit-scrollbar` 是 `auto`（0 宽），注入后 `overflow` 变 `auto`、滚动条计算宽度 **16px**；1250×591 的窗口下页面不溢出（不出条，页面照旧），窗口变窄（相当于放大）时出现并可以拖。

### 46.2 页面放大改用右 Ctrl + 滚轮

- `crates/host/src/pointer.rs`：`ctrl_held()` → `zoom_held()`，读 **`VK_RCONTROL`**（右 Ctrl）而不是 `VK_CONTROL`（左右都算）。滚轮只有在光标压在站点页面上、并且按着右 Ctrl 时才被当作放大（`Mouse::zoom`），其余照旧交给页面自己滚。
- 原因：owner 的左 Ctrl + 滚轮是**换挡**（原话“网页放大和换挡按键冲突了”），让出左 Ctrl 就不冲突了。
- `cursor.rs`、`lib.rs`、`webapp.rs` 里相关的注释一起改了（“Ctrl” → “右 Ctrl”）。

### 46.3 红绿灯相位：查了什么，缺什么

owner 说可以直接读游戏内存的 `traffic_light.state` / `state_time_remaining`。这轮把能查的都查了：

| 查的地方 | 结果 |
|---|---|
| SCS 官方 SDK（`tools/scs_sdk_1_15/include`，1.15） | 只有**车灯**通道（`truck.light.*`：大灯、雾灯、转向灯……），**没有任何红绿灯/相位通道** |
| 遥测结构（`crates/shared/src/lib.rs` 的 `Telemetry`） | 没有灯态字段：位置、朝向、速度、挡位、导航、灯光、雨刷、暂停、头枕位置……全都不含路口灯 |
| 游戏主程序 `eurotrucks2.exe`（53,308,304 B）全文搜 | `traffic_light.state`、`state_time_remaining`、`light_state`、`state_time`：**0 命中** |
| 同一个二进制里命中的相关字符串 | `traffic_light_lamp_colors.sii`、`payload.semaphores`、`traffic_profile_coef`、`traffic_profile.node`、`Traffic lights used on prefab without traffic lights anchors!`——这些是**地图数据**（预置件的信号灯配置：周期系数、各节点的相位归属），是静态的，不含“现在红还是绿、还剩几秒” |

结论：**这两个字段名不在当前的游戏版本和官方 SDK 里**，所以没有现成地址可读。读游戏内存本身是可行的（插件就活在游戏进程里，MinHook 都在用），但缺一样东西：**这两个字段是从哪来的**——哪个工具/插件/游戏版本、结构体在哪个模块、怎么拿到指针（签名、偏移、还是某个全局）。给我这个，我就能在插件里加一条通道，经共享桥送进 UI，在地图上显示相位与读秒。

在没有来源的情况下，我能做的是“**位置 + 到灯的秒数**”：从游戏自己的地图数据里认出哪些路口有信号灯（预置件的信号灯数量），把最近的一座标在路线前方，秒数按当时的车速算到灯的时间——这个数字是准的；相位的红/绿只能估算，我不建议拿出来当真的显示。

### 46.4 检查

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | **221 通过 / 0 失败 / 26 忽略** |
| `cargo test -p westplay-plugin --lib` | **43 通过 / 0 失败 / 1 忽略**（插件没动） |
| `cargo test -p westplay-shared --lib` | **21 通过 / 0 失败** |
| `node --check crates/host/src/webapp.js` | 通过（注入的页面脚本先过语法） |
| `tsc -b` / `vitest run` | 0 错；**75 文件 / 550 通过**（这轮没动 UI） |
| 插件 | `westplay.dll` **584,704 B**，SHA256 `90C89E72FF1616E8EBB679FEB8F436AC298C3C42C7DA6DFA2D61559CD8CF9318`（未变） |
| exe | **24,459,264 B**，`ui` **72** 个文件（这轮只有宿主变了） |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,284,032 B**，SHA256 `5374FA3E4BDAD836257904EB1A37DBC6BFD84E16E8E6134E3E565CA59F217E18` |

### 46.5 边界

- 拖动条是**页面自己的**（Chromium 的），不是座舱画的：它跟着页面的内容走，站点自己滚的容器也会有；放得下的页面不出条。
- 只认**右** Ctrl + 滚轮放大；左 Ctrl 完全交还给游戏（换挡用）。
- 红绿灯：位置与“到灯秒数”可做；**相位**要等 owner 给出 `traffic_light.state`/`state_time_remaining` 的来源。

---

## 47. 红绿灯读秒；Present 钩子加固；页面拖动条（2026-11-01 深夜十）

owner 这一轮给了三份东西：`WestPlay-红绿灯功能源码快照.zip`（酷狗版实机验证过的红绿灯实现）、
`WestPlay-hook-fix-snapshot-20261101.zip`（Present 钩子加固）、`CLOCK-DST-FIX-2026-11-01.md`（时区/夏令时），
并说“网易云音乐依然没有拖动条”。**时间（DST）那条 owner 后来又说不写入**，所以这一轮没有动它。

### 47.1 红绿灯读秒：宿主只读游戏内存

官方 SDK 没有红绿灯通道（§46.3 查过），快照给的答案是读游戏进程内存，用的是 ETS2LA 公开的结构，本机 1.61 实测可读。

**结构（`crates/host/src/traffic_lights.rs`，新文件）**

| 对象 | 偏移/特征 | 含义 |
|---|---|---|
| `base_ctrl` | 特征码 `48 8b ? ? ? ? ? 48 8b ? 48 8b ? 48 8b 80` | 全局基址（RIP 相对取） |
| nearby K-DOP | 特征码 `4c 8d 81 ? ? ? ? 0f 29 ? ? 48 8d 91` | 附近对象数组在 `base_ctrl` 里的偏移 |
| item | `+0x0A` = 4 | 预置件 |
| item → segment | `+0x48`；segment `+0x88` 数组、`+0x90` 数量 | 信号灯实例 |
| instance → actor | `+8`；actor `+0x100` → `traffic_light` | |
| actor | `+0x28`/`+0x30` 世界坐标，`+0x34`/`+0x36` 格子偏移（×512） | 灯的位置 |
| traffic_light | `+0x70` 状态、`+0xB8` 当前状态剩余秒数 | 灯色与读秒 |

状态映射：2 红、1/4 黄、8 绿、32 闪烁黄（休眠），其余忽略。

**怎么用的**

- 独立线程 150 ms 一次；只 `ReadProcessMemory`，**不写游戏内存**、不注入、不改游戏；读失败只是这一轮没有灯。
- 过滤：距离 2–200 m、车头前方约 35°、横向 ≤ 25 m；有路线时灯要在 `next-2 .. next+10` 节点/线段 20 m 内；秒数 0–600；取最近一盏。
- 宿主把路线（`RouteUpdate::Route/Next/None`）与卡车位置喂进去，灯色或整数秒变化时发
  `{"type":"trafficLight","light":{"state":"red","seconds":8,"distance":42,"x":…,"z":…}}`；没有灯发 `null`。
- 设置 › 外观 ›「红绿灯显示」：关掉后宿主 `set_enabled(false)`，worker 关闭进程句柄、不再扫描；重开无需重启游戏。

**地图上**

- `liveMap.ts` 新增 `syncTrafficLight`：三灯外壳 + 读秒徽章（`maps.css` 的 `.map-traffic-light`），
  位置吸附到地图画的蓝色路线（`routePointOnSpans`，只看向前 4 段、25 m 内），没有路线就用灯自己的坐标。
- 只在灯色或整数秒变化时改 DOM；marker 复用；设置关掉立即移除。

### 47.2 Present 钩子加固（黑屏那类问题）

只挂一条 Present 还不够：玩家的进程里可能同时有三份 `dxgi.dll`（游戏自己的、ReShade 的、系统的），
原来的临时交换链是从**系统 d3d11** 上造的，取到的 vtable 可能已经被别的插件改过 → 我们的钩子永不触发 →
插件心跳停在 0 → 宿主认为游戏没跑 → 一帧不发 → 屏幕是空白的。

- `create_dummy_device()` 末尾改成：**游戏 exe 同目录有 `dxgi.dll` 就用它造临时交换链**并取那条的 vtable，
  没有就退回原行为（零风险）；另外用 `IDXGIFactory1::CreateSwapChain`（槽位 10）造链，用完释放。
- 新增诊断：`Present hook in <模块>+0x…`，并用 Toolhelp 快照列出进程里每一份 `dxgi.dll`/`d3d11.dll`（基址 + 路径）。
- `crates/plugin/src/lib.rs` 加 `watch_for_frames()`：每 5 s 读帧计数，连续 20 s 没有新帧就在
  `plugin.log` 告警（最多 6 次）——一眼能看出“被别的画面工具挡住了”。
- 我们这条线**保留了 `mirror`（后视镜）模块**：快照的 `changed/` 里没有它（那是酷狗版的取舍），合并时按我们的树补回。

### 47.3 网易云音乐的拖动条（继续）

上一版给站点页面注入了 16px 圆角滚动条样式，并让 `html/body` 改 `overflow: auto`。owner 反馈“依然没有拖动条”。
用无头 Edge 对真页面复现后确认了两件事：

1. **样式是生效的**——把窗口压到 700×330（等同放大后页面变小），左侧栏那条**经典滚动条**就出现了（有上下箭头、半透明滑块），说明 `::-webkit-scrollbar` 的规则真的画出来了；
2. **放得下的页面不会有条**（`auto` 只在内容超出时出条），而应用里那一档尺寸（1250×591）网易云整页刚好放得下——所以“没有条”并不是坏掉，是没有可滚的东西。

这次再补一条：`body { min-width: min-content; min-height: min-content }`——站点按整窗排版、内容比房间宽时，
页面本身会跟着内容变宽，于是**下方与右侧的拖动条出现并把被裁掉的右边/下边拖进来**（700×330 实测根元素的
可滚宽度 1100 > 700，出现了底部拖动条）。整页放得下时仍然一条不出。

### 47.4 没做：时间（夏令时）修复

owner 明确说“不写入时间修复”。`CLOCK-DST-FIX-2026-11-01.md` 里的方案（导出 `dst`、`shift` 带季节、
英国冬季 0 / 德国 60 / 土耳其 180）留在文档里，等 owner 决定再做。

### 47.5 检查

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | **224 通过 / 0 失败 / 26 忽略**（含 `traffic_lights` 的 3 个） |
| `cargo test -p westplay-plugin --lib` | **43 通过 / 0 失败 / 1 忽略** |
| `cargo test -p westplay-shared --lib` | **21 通过 / 0 失败** |
| `tsc -b` / `vitest run` | 0 错；**75 文件 / 550 通过** |
| `node --check crates/host/src/webapp.js` | 通过 |
| 页面实测（无头 Edge，真站点） | 700×330 出现侧栏经典滚动条；注入 `body` 规则后根元素可滚宽度 1100 > 700，出现底部条 |
| 插件 | `westplay.dll` **605,184 B**，SHA256 `CAE82E5F5D9D4E126942EE30E693D5B26415C8A5B84C5BC5A3ECDC426CE7E54B` |
| exe | **24,531,456 B**，`ui` **72** 个文件 |
| 启动自检 | `app: window shown`、`page: running`，0 个 error/panic |
| 安装包 | **10,303,002 B**，SHA256 `9FADEBCE244A14F02BF6E5106A5B9610C21CCD09FEC5D248B5103F49509EEF71` |

### 47.6 边界

- 红绿灯的偏移对应 ETS2/ATS 1.60/1.61；游戏大版本更新可能失效——失效的表现是**不显示灯并在日志里说特征码没找到**，不会写游戏内存、不会让游戏崩。
- 只显示**最近一盏**，不判断相位组、转向灯、闯红灯。
- `200 m / 35° / 25 m / 20 m / 0.82` 这些常量都在 `traffic_lights.rs` 的 `light_ahead` 里，可调。
- 地图上的灯画在路线投影点上，和真实灯杆差几米（为了贴在蓝色路线上）。
- 拖动条只解决“有内容可滚”的情况；整页放得下时本来就没有条。

---

## 48. 页面拖动条真的出现了：document-start 时还没有 `<html>`（2026-11-01 深夜十一）

owner：“网易云音乐放大以后没有拖动条导致无法拖动”。

### 48.1 根因

§46/§47 把滚动条样式写在 `webapp.js` 的最前面：

```js
const bars = document.createElement('style')
bars.textContent = `…`
document.documentElement.append(bars)
```

而 WebView2 的 `AddScriptToExecuteOnDocumentCreated`（`crates/host/src/webapp.rs` 的 `add_startup_script`）
是在**页面还没有任何节点**时执行的。用 CDP 的 `Page.addScriptToEvaluateOnNewDocument` 按同样时机实测：

```
at document start: html= false head= false ready= loading
appended to documentElement: threw TypeError: Cannot read properties of null (reading 'append')
at DOMContentLoaded: html= true head= true
```

所以那行 `append` 抛异常，**整个 IIFE 从这里就断了**：滚动条样式从未进入页面，而且 `webapp.js` 里排在它后面的
东西（页面音量上报、媒体/歌词读取、输入框焦点与按键注入）从 §46 起也一起没了——这也是为什么“样式明明写了却看不到条”。

上一轮我用手工注入（`Runtime.evaluate`）验证，那个时机 document 已经齐了，所以测出来“生效”——结论对，但**不适用于应用里的注入方式**。

### 48.2 修法

```js
const showBars = () => {
  const root = document.head ?? document.documentElement
  if (!root || document.getElementById('westplay-bars')) return
  const style = document.createElement('style')
  style.id = 'westplay-bars'
  style.textContent = bars
  root.append(style)
}
showBars()
document.addEventListener('DOMContentLoaded', showBars, { once: true })
```

现在有 document 就装，没有就等页面有了再装；`id` 防重复。

### 48.3 验证（按真实注入方式）

用 `Page.addScriptToEvaluateOnNewDocument` 把**真脚本**连同 `window.chrome.webview` 的桩一起注入，打开
`https://music.163.com/st/webplayer`，再模拟放大到 640×330：

| 检查 | 结果 |
|---|---|
| `#westplay-bars` | **present** |
| `::-webkit-scrollbar` 计算宽度 | **16px** |
| 根元素 可滚/可见 | **1100 / 640**（放大后页面比房间宽） |
| `scrollLeft = 200` | 真的移动了（200） |
| 截图 | **右侧竖条 + 底部横条都在**（上下箭头、半透明圆角滑块） |

### 48.4 检查

| 项 | 结果 |
|---|---|
| `node --check crates/host/src/webapp.js` | 通过 |
| 页面实测 | 见 48.3（真脚本 + 真注入时机） |
| `cargo test -p westplay-host --lib` | **224 通过 / 0 失败 / 26 忽略**（宿主代码未改） |
| `tsc -b` / `vitest run` | 0 错；**75 文件 / 550 通过**（页面代码未改） |
| 插件 | `westplay.dll` **605,184 B**，SHA256 `CAE82E5F5D9D4E126942EE30E693D5B26415C8A5B84C5BC5A3ECDC426CE7E54B`（未变，游戏不必重启） |
| exe | **24,529,920 B** |
| 安装包 | **10,302,958 B**，SHA256 `1A4FEA985B3C83C71D44F492915E0BB134DA46557E7F9610289D1EC1637962F5` |

### 48.5 边界

- 滚动条是页面自己的（Chromium 画的），只在**有内容可滚**时出现：整页放得下就没有条（放大以后才会超出）。
- 站点被排成比房间宽（固定宽度的 app 外壳）时，页面会跟着内容变宽，于是右侧/底部条能把裁掉的部分拖进来。
- 这一修同时让 §46 起失效的 `webapp.js` 其余注入恢复（音量、媒体、输入框按键）。

---

## 49. 网页应用的快捷键：声音不在页面里、暂停的站点、按下没生效的原因（2026-11-01 深夜十二）

owner：“快捷键控制丢了，修复一下”。指 §42 那组热键（调低音量 / 播放暂停 / 调高音量）在四个网页应用上不灵。

### 49.1 三处原因，逐个量过

| 现象 | 证据 | 原因 |
|---|---|---|
| 网易云新版播放器上按音量，什么都没发生 | 玩家机器的 `app.log`：`webapp: mediaProbe: music.163.com … media=0 speakable=false`——页面里**一个** `audio/video` 都没有 | 新版播放器的声音是一个**自己 new 出来、不放回页面**的媒体元素（`new Audio()` 或 `createElement('audio')` 不 append）。`webapp.js` 的音量作用在 `document.querySelectorAll('audio, video')` 上，自然一个也找不到 |
| 站点暂停着的时候，热键跑到车厢的音乐应用上 | `keybinds.ts` 的 `current()`：`players.find(playingHere()) ?? last`；网页应用只有「在播」才被当成它 | `webappPlayer.subscribe` 只在 `playing` 变化时通知，且 `playingHere()` 要求 `playing === true`；暂停中的站点既不是「在播」，也（在别的东西播过之后）不是「最后一个播的」 |
| 按了键日志里什么都没有，无从下手 | `plugin.log` 整场 0 条 `keybind … pressed` | 插件只在「计入」时才写日志；不计入（屏幕没显示、WestPlay 不在屏上、正在输入）时一片沉默 |

### 49.2 改了什么

**`crates/host/src/webapp.js`**

- 页面自己造出来的媒体元素一律记下（`window.Audio` 换成它的子类，`Document.prototype.createElement` 记 `audio/video`），
  最多记 32 个（老的丢掉，播放器一秒造一个也涨不起来）；
- 音量的目标从「查询到的元素」改成「查询到的 + 记下的」：`elements()`；
- 音量落到空处（真的一个媒体都没有）时，往日志里说一次：
  `volumeProbe: <站点> volume 0.3 but no media in the page`。

**`crates/plugin/src/keybinds.rs`**

- 热键按下但没被计入时，最多每 5 秒写一行原因：
  `keybind PlayPause pressed, not counted: WestPlay isn't on the truck's screen`（或「游戏窗口没显示」「正在输入」）。
  计入时那行 `keybind … pressed` 照旧。

**`ui/src/cabin/apps/web/player.ts`**

- `subscribe` 改成「这个站点有没有东西可放」（`media !== null`）：暂停了也算——按播放/暂停就是把站点叫回来。
  别的播放器正在播时仍然先给它们（§42 的规矩没变）。

### 49.3 验证

| 项 | 结果 |
|---|---|
| 真站点上按真注入方式测（无头 Edge + `Page.addScriptToEvaluateOnNewDocument` + `window.chrome.webview` 桩） | `new Audio()` 的 `volume` 与 `createElement('audio')` 的 `volume` **都变成 0.3**；放进页面的那个变成 0.45；没有误报 `volumeProbe` |
| 同一页面上 | `#westplay-bars` 仍在（§48 没被破坏） |
| `node --check crates/host/src/webapp.js` | 通过 |
| `tsc -b` | 0 错 |
| `vitest run` | 全部通过（`player.test.ts` 的用例改成「有歌就算，暂停也算」） |
| `cargo test -p westplay-plugin --lib` | **43 通过 / 0 失败 / 1 忽略** |
| exe | **24,531,968 B** |
| 插件 dll | **608,768 B**，SHA256 `C069A3A4CD2FC16D78314F1FD54ABF3AE868B5692183B0D7C0AE68CDCCCDDC05`（变了：`keybinds.rs`，**游戏要重启**） |
| 安装包 | **10,306,021 B**，SHA256 `232FADA63939CC283BBEA3FED597AB42168B5C383B76297C2E75721907FC4C0E` |

### 49.4 边界

- 音量仍然作用在**站点自己的声音**上：站点把音量交给 Web Audio 图时，`webapp.js` 早就在增益节点上做（§13），
  媒体元素那条路这次补齐了「不在页面里」的情况。
- 站点若把声音放在跨域 iframe 里且不接受消息，音量仍只能到「页面自己的元素 + 自己的图」，到不了那个 iframe——
  日志里会留下 `volumeProbe` 一行，一眼能看出是它。
- 热键的「不计入」日志是诊断用的：正常玩不会刷屏（5 秒最多一行，而且只在按下时写）。

---

## 50. QQ 音乐的暂停图标、误点的「播放全部」、被自己点回去的断电暂停（2026-11-02 凌晨）

owner（图：车机屏，QQ 音乐在放 Luna say maybe）：“QQ音乐在这个界面使用快捷键暂停时暂停图标会有显示延迟，修复这个bug并给QQ音乐和apple music加上断电暂停和上电续播”。

### 50.1 日志里的真相（玩家机器，18:48–18:50）

```
18:48:39  webapp: pressProbe:  /st/webplayer playPause -> SPAN.cmd-icon="play"        ← 网易云：点的是图标
18:49:52  webapp: pressProbe:  /n/ryqq_v2/player playPause -> A.btn_big_play="暂停"
18:49:58  webapp: buttonProbe: … no change || A.btn_big_play="暂停"                  ← 6 秒了，名字还是「暂停」
18:50:21  webapp: buttonProbe: … no change || A.btn_big_play="播放"                  ← 5 秒后才变
18:50:34  webapp: buttonProbe: … no change || A.btn_big_play="暂停"                  ← 又变回去
```

- **QQ 音乐的按钮名字要好几秒才更新**（它跟着自己的音频事件重画），而页面判断「这一下生效了没」用的正是这个名字 →
  判成「没生效」→ `tap()` **再点一次**。播放/暂停是个开关，再点一次就把暂停点回播放；1.6 秒后仍判没生效，再走
  媒体元素兜底 → 第三次开关。图标因此看起来「延迟、乱跳」，断电暂停也就变成了播放。
- **网易云新版播放器**：`playPause` 选中的是 `SPAN.cmd-icon="play"`，而那个图标属于「播放全部」的按钮——按一下
  等于重新开始播列表。这是 §49 那条「快捷键控制丢了」的另一半。

### 50.2 改了什么

| 文件 | 改动 |
|---|---|
| `crates/host/src/webapp.js` | ① `NOR` 加 `全部`（`播放全部` 不是播放/暂停）；② 新增 `insideNo()`：图标只写 `play`、但它所在的按钮叫「播放全部」时，按父按钮的名字算；③ playPause「生效了没」改看**页面自己的媒体元素 `paused`**（瞬间变），媒体状态已经翻了就不再补点、不再兜底 |
| `ui/src/cabin/apps/web/webapp.ts` | 新增 `shownPlaying`：车厢自己按的播放/暂停立刻显示（`command()` 里翻一下），站点下一次 `webAppMedia` 后交回页面（`receiveWebAppMedia` 清零） |
| `ui/src/cabin/dashboard/useNowPlaying.ts`、`apps/web/LyricsPage.tsx` | 卡片与歌词页的「在播/暂停」改用 `shownPlaying` |
| `ui/src/shared/host.ts`、`crates/host/src/lib.rs` | 新增页面→宿主 `{type:"log"}`（`logToHost`），宿主写成 `cabin: …` 进 `app.log` |
| `ui/src/cabin/apps/web/pauseWithPower.ts`、`apps/musicWithGame.ts` | 断电、上电时的暂停与续播各写一行日志：`cabin: qqMusic with the electrics off: paused`、`cabin: apple music with the electrics back: plays on` |

### 50.3 断电暂停 / 上电续播

- **QQ 音乐（网页应用）**：这条路本来就在（`apps/web/pauseWithPower.ts`，§44），断掉的是**执行**——断电时确实发了
  一次 `playPause`，页面判「没生效」又点一次，暂停变回播放；上电再发一次又成了暂停。50.2 的判据改掉后只点一次。
- **Apple Music（车厢播放器）**：逻辑本来就在（`apps/musicWithGame.ts`，§29 定的规矩：断电即停、上电续播），
  这次补上日志，把「当时到底在不在播 / 是不是因为游戏暂停中没续播 / 已经在播所以没动」写清楚。

### 50.4 验证

| 项 | 结果 |
|---|---|
| `node --check crates/host/src/webapp.js` | 通过 |
| `tsc -b` | 0 错 |
| `vitest run` | **75 文件 / 550 通过** |
| `cargo test -p westplay-plugin --lib` | 43 通过 / 1 忽略（插件本轮未改） |
| exe | **24,541,184 B** |
| 插件 dll | **608,768 B**，SHA256 `C069A3A4CD2FC16D78314F1FD54ABF3AE868B5692183B0D7C0AE68CDCCCDDC05`（未变：`webapp.js` 在宿主里，重开 WestPlay 即可） |
| 安装包 | **10,307,510 B**，SHA256 `BA70FF3F4AA43665B9273C9D6B2860E4B3A7E3655BEC0E65371D6A3C40213B7A` |

### 50.5 边界

- `shownPlaying` 只是**显示**上的乐观值：站点的下一次上报说了算，所以站点没照做时最多错到下一次上报（QQ 音乐约 0.4 秒）。
- 「播放全部」被排除后，站点若**只有**一个「播放全部」而没有单独的播放/暂停（极少数页面），热键会落到媒体元素那条兜底
  上；日志里 `pressProbe … none || …` 会把它写出来。
- 断电暂停依赖站点自己的开关，站点若在断电那一刻正卡在加载（没有媒体元素、按钮也还没画），这一次会落空：上电续播也因此
  没有「暂停过」的记录（日志 `cabin: … nothing playing`）。

---

## 51. QQ 音乐的播放/暂停是反的（图标反、上电不续播）（2026-11-02 凌晨）

owner：“QQ音乐暂停图标是反的，而且上电不会自动续播”“就是暂停图标时是播放，播放是暂停”。

### 51.1 为什么是反的

页面把「在不在播」报给车厢：QQ Music 那一路（`playingOwn()`）读的是**站点自己的按钮名字**——按钮写「暂停」就是在播。
而 QQ 的按钮名字要好几秒才更新（§50 量过：6 秒）。所以刚按完暂停，页面报上去的还是 `playing: true`：

- 车厢的卡片显示「在播」→ 图标反了；
- 断电暂停后 `playing()` 仍是 true → 上电时判成「它已经在播了」，于是不续播：

```
19:13:34  cabin: web app paused with the electrics: qqMusic
19:13:36  cabin: web app with the electrics back: qqMusic left as it is      ← 以为已经在播
```

### 51.2 改法

`crates/host/src/webapp.js`：新增「这一下是车厢按的」记忆。

- 收到 `playPause` 时先读当前状态（`wasPlaying = playingOwn()`），按下后记下**相反**的那一个（`intent`）；
- `playingOwn()` 先看 `intent`：站点按钮说的与它一致（或 15 秒后）就交回按钮；
- 按下 350 ms 后的那次上报因此立刻是对的：图标、断电暂停、上电续播都跟着对。

### 51.3 验证：真页面，按钮名字故意滞后

无头 Edge + 真注入（`Page.addScriptToEvaluateOnNewDocument`）+ 假页面（`.song_info__name` / `.song_info__singer` /
`.btn_big_play[title="暂停"]`，按钮名字要手动才改）：

| 时刻 | 页面报的 `playing` | 改之前 |
|---|---|---|
| 按下之前（按钮写「暂停」） | true | true |
| 按下暂停（按钮还没改） | **false** ✓ | true ✗ |
| 站点按钮改成「播放」 | false | false |
| 再按一次 | **true** ✓ | true |

### 51.4 验证（其余）

| 项 | 结果 |
|---|---|
| `node --check crates/host/src/webapp.js` | 通过 |
| `tsc -b` / `vitest run` | 0 错 / 75 文件 550 通过（本轮只动 `webapp.js`） |
| exe | **24,542,208 B** |
| 插件 dll | **608,768 B**，SHA256 `C069A3A4CD2FC16D78314F1FD54ABF3AE868B5692183B0D7C0AE68CDCCCDDC05`（未变，重开 WestPlay 即可） |
| 安装包 | **10,302,164 B**，SHA256 `0653F0E7FBA33294A1382A5AF6AE6BFBE2234BBBA3F73AFF2250E0447E9930C9` |
| 自检 | 0 个 error/panic |

### 51.5 边界

- `intent` 只在「车厢按下的那一下」有效：站点按钮 15 秒都不改口，就以站点为准（播放器本身卡住时不会一直骗下去）。
- 站点若在按钮之外还有自己的状态显示（QQ 的进度条、播放列表高亮），那些仍由站点自己更新，WestPlay 不改。

---

## 52. 另一台设备上「检测不到游戏」（游戏里是旧版插件）（2026-11-02 凌晨）

owner：另一台笔记本（RTX 3050 Ti）装好 2.1.4，伴侣页显示「Euro Truck Simulator 2 未运行」，车里一直是
「正在等待游戏」。

### 52.2 怎么查出来的

三行日志一对就出来了：

- `plugin.log`：`westplay 2.1.4 loaded: Euro Truck Simulator 2 1.61.1.9s (eut2), … api 1.1`
- `plugin.log` 第 2 行：`telemetry: **24/24** channels registered` —— 这一版是 **33**（我们机器上是 `32/33`）
- `app.log`：**一次都没出现过游戏**，也没有「插件是另一个版本」的提示

桥接是**按版本命名**的共享内存（`Local\WestPlay.Bridge.v26`，`BRIDGE_VERSION = 26`）：旧插件开的是它自己的
名字（v25 之类），两边永远碰不上。主机读到的 `plugin.pid` 是 0，于是安静地显示「未运行」——连错误都不报。

真因：那台机器游戏目录里的 `bin\win_x64\plugins\westplay.dll` 还是旧版。安装时游戏开着（或没给管理员权限）
→ 复制失败，而 setup 只在安装那一次做，之后再不重试。

### 52.3 改法：自己修，并且说清楚

1. **自己修**（`crates/host/src/lib.rs`，`keep_plugins_up_to_date`）：把 exe 旁边的 `westplay.dll` 与每个找到的
   游戏里的 `plugins\westplay.dll` 比一比，不同就装进去。时机是——启动时、游戏关闭时（这时文件才空出来）、
   以及「一直没看到游戏」时每 30 秒一次。日志：
   - 装上了：`the game's WestPlay plugin was another build's: this build's put in D:\… (the game starts it next time it runs)`
   - 装不上：`… can't be replaced now (the game is running: close it to install the plugin): that's why the game says nothing of itself — close the game and start WestPlay again`
   - 同一句话只说一次（`salt` 一样的去重），不会每 30 秒刷屏。
2. **说清楚**（`crates/plugin/src/lib.rs`）：插件加载那一行带上了桥接版本——`… api 1.1, bridge v26`。以后两边
   版本对不对，一眼就能看出来。

### 52.4 那台机器怎么弄

装新安装包（或把新的 `westplay.dll` 放进游戏 `bin\win_x64\plugins\`）→ 关掉游戏 → 开 WestPlay → 开游戏。
新版 WestPlay 自己也会做这件事（游戏关着的时候）。

### 52.5 验证

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | 224 通过 / 26 忽略 |
| `cargo test -p westplay-plugin --lib` | 43 通过 / 1 忽略 |
| **真机端到端**（本机，把上一版 dll 放进游戏 `plugins`，再启动新版） | 日志 `the game's WestPlay plugin was another build's: this build's put in E:\SteamLibrary\steamapps\common\Euro Truck Simulator 2 (the game starts it next time it runs)`，游戏里的 dll 随即变成这一版（`FD8814CC…`）✓ |
| 自检 | 0 个 error/panic；启动步点正常（`host: cabin browser ready` → `page: running`） |
| exe | **24,552,448 B** |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D` |
| 安装包 | **10,307,279 B**，SHA256 `768EC7D12E3672A1D9975FB710BDB7F8401368D8D12F40155A156ABF0533B5B0` |

### 52.6 边界

- 只在**找到的游戏**上动手（`westplay_setup::game::find()` 扫到的 ETS2/ATS），不碰别的目录。
- 游戏开着时换不了（Windows 锁住 dll）：日志说明原因，游戏一关就自动换上。
- 旧版插件本身仍在游戏目录里时才被替换；换成这一版之后不再有任何写操作（内容相同即跳过）。

---

## 53. 断电暂停后上电不续播（QQ 音乐），伴侣页说明旧版插件（2026-11-02 凌晨）

owner：“QQ音乐还是有bug”——现象是**断电暂停后，上电不自动续播**。

### 53.1 真因：页面把「在不在播」说错了

上电时 `pauseWithPower.ts` 的判断是 `playOn = playsOnWithPower(site) && !playing()`：页面说自己在播，就不发 toggle
（因为 `playPause` 是开关，会把在播的按停）。所以「上电不续播」只有一种可能——**页面报 `playing: true`**。

两处叠加：

1. §51 的 `intent`（车厢按下时记下的答案）只在站点按钮改口前有效；QQ 的按钮名字慢，改口后又可能保持旧话。
2. 更要紧的：`playingOwn()` 里「时钟在动」用的是 `movedAt`，而 `movedAt` 跟着**插值出来的位置**走（`drawnAt`
   每隔 350 ms 都会加一点），于是它永远「在动」——时钟这条路事实上从来没说过「停」。

### 53.2 改法

1. `webapp.js`：`moved` 改为看 `drawnClock.moved` / `elementClock.moved`（页面每画出一秒、元素每前进一格），
   只有站点真的在放才会动；
2. 页面画过进度（`lastAt > 0`）时，`playing` 直接由它决定，不再看按钮名字（QQ 走的就是这条）；没有时钟的页面仍用
   §51 的 intent → 按钮名字；
3. `pauseWithPower.ts`：说完 `plays on` 发出 toggle 后 1.6 秒再核一次，页面还说没在播就**再发一次**（一次为限）——
   播放器还没加载完、浏览器压着声音之类的也能回来。

### 53.3 验证：真页面（时钟会停、按钮名字滞后）

无头 Edge + 真注入 + 假页面（`.player_music__time` 画 “00:12 / 03:43”，`.btn_big_play` 名字滞后）：

| 时刻 | 页面报的 `playing` | 改之前 |
|---|---|---|
| 在播（时钟在走，按钮写「暂停」） | true | true |
| **时钟停住，按钮仍写「暂停」**（owner 遇到的） | **false** ✓ | true ✗ |
| 车厢按下播放 | **true** ✓ | — |
| 按钮名字迟到改成「播放」 | true | — |

另有一条页面（没有时钟，按钮名字滞后）复核 §51：按下即 `false`、再按即 `true` ✓。

### 53.4 伴侣页：游戏里是旧版插件时直接说出来

`crates/host/src/lib.rs` 新增 `Status.plugin_outdated`（camelCase `pluginOutdated`）：游戏没被看到、而找到的游戏里
`westplay.dll` 是别的版本（这会儿换不了，通常因为游戏开着）时为真。伴侣页「卡车屏幕」页在「未运行」下面多一条红字：

> **游戏里的 WestPlay 插件是旧版本** 关掉游戏再打开 WestPlay，它会自动装好，然后再打开游戏。

36 种语言的词条都加了（英式英语等 5 个别名语言沿用英文）。游戏被看到时这条永远不出现。

### 53.5 验证（其余）

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | 224 通过 / 26 忽略 |
| `tsc -b` | 0 错 |
| `vitest run` | 75 文件 / **552** 通过（新增两条：没回来的再告诉一次、自己回来的不再打扰） |
| `node --check crates/host/src/webapp.js` | 通过 |
| 本机自检 | 0 个 error/panic；游戏目录插件已是这一版，日志里没有替换那一行（对了就不吭声） |
| exe | **24,556,032 B** |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（**未变**，这轮不用重开游戏） |
| 安装包 | **10,315,937 B**，SHA256 `A41D2737AC1CA2819F3F71077C92185D3B085E03727A45C563E07032B88471F7` |

### 53.6 边界

- 时钟只在**页面画进度**时用：B 站直播这类没有进度的地方仍走 §51 的 intent → 按钮名字。
- 上电补发的 toggle 只发一次，且在发出 1.6 秒内；玩家自己按了别的，最多多一次开关。
- `pluginOutdated` 只在游戏**没被看到**时出现：游戏连上即证明插件是对的。

---

## 54. QQ 音乐首页：卡片不动，上电还是不续播（2026-11-02 凌晨）

owner：“QQ音乐首页的媒体控件有延迟，然后还是无法自动续播”。

### 54.1 首页（`/`）是这个样子

真页面（无头 Edge，真注入）读出来的：

| 首页有什么 | 内容 |
|---|---|
| 播放条 | `<a class="btn_bottom_player sprite_before"><span class="icon_txt">播放器</span></a>` ——**是「打开播放器」，不是播放/暂停** |
| 进度 | 没有（只有歌单里每首的时长 `debutlist__time`） |
| 声音 | 没有 `audio`/`video`（未登录、没在放的时候） |
| 名字 | 没有 `.song_info__name`（那是播放器页的） |

所以首页**什么都不报**：座舱的卡片停在上一首（“有延迟”），`playing` 也不会跟着变。

### 54.2 于是上电的续播永远不会发

`pauseWithPower.ts` 上电时的判断是 `playOn = 站点允许 && !playing()`。首页从不更新 `playing`，它一直是断电
前的 `true`，于是判成「它还在播」——**续播从来没发出去**。§53 的时钟与 1.6 秒重发都救不了：页面的第一个字
就没到过。

### 54.3 改法：WestPlay 停掉的，WestPlay 放回去

上电**不再问页面**：电断掉时 WestPlay 暂停过一次（`pausedByPower`），来电就把它放回去。断电时玩家自己起的
播放会被 `dark` 先按停，所以这一下不会误停别人的东西。§53 的「1.6 秒再核一次」只在**页面自己会报、并且报
了没回来**的时候补一次（页面一声不吭时不再发，第二下会把刚起来的又按停）。

### 54.4 页面这一侧也补了三处

1. `playing` 还读 `navigator.mediaSession.playbackState`（页面给 Windows 媒体控件的状态，音乐站几乎都设）；
2. 播放/暂停的控件没有名字时**按 class 认**（`CLASS_NAMED`，比如首页播放条那种只有 class 的按钮），
   `sprite`/`all`/`bottom`/`list` 这些不是传输的词先排掉；
3. 页面里有声音在放、而页面自己什么都不说时，**播放条的真实结构打进日志**（`domProbe: qq home …`，最多三次）
   —— 首页的卡片要按它自己的名字来读，下一轮照日志加。

### 54.5 验证（真页面）

| 页面 | 情况 | 结果 |
|---|---|---|
| `y.qq.com/`（首页） | 按播放/暂停 | 什么都没按（`buttonProbe … none`）——不会误按「播放全部」/「播放器」✓ |
| `y.qq.com/n/ryqq_v2/player` | 按播放/暂停 | `pressProbe … -> A.btn_big_play="播放"` ✓ 与 §53 一样 |
| 时钟页 | 三态 | 在播 true / 时钟停住 **false** / 按下 true ✓（§53 不变） |
| 按钮滞后页 | 按下 | false → true ✓（§51 不变） |
| UI | vitest | 75 文件 / **553** 通过（新增：页面说「在播」也照样放回去；一声不吭的不问第二次） |
| UI | `tsc -b` | 0 错 |
| 页面脚本 | `node --check` | 通过 |

### 54.6 交付

| 项 | 值 |
|---|---|
| 安装包 | **10,321,351 B**，SHA256 `A9EC63A7A56AC54C545B876C428F56B7F349C72161A425CB6D0E3AE3B200AEC8` |
| exe | **24,559,104 B** |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（页面与 UI 变了，游戏里的插件没变） |
| 部署 | WestPlay 当时开着，这一轮**没有**往 `D:\WestPlay` 和游戏目录写：装一下安装包就行 |

### 54.7 边界

- 首页卡片的「延迟」本身还没修好：要先从日志里读到首页播放条的名字（§54.4 第 3 条），这一轮修的是**续播**。
- 上电那一下是「开/关」：只在 WestPlay 自己停过的时候按（`pausedByPower`），并且断电期间自己起的播放会先被
  按停。

---

## 55. 歌停了，卡片还说在播（2026-11-02 凌晨）

owner（截图）：QQ 音乐没有在播，座舱的媒体卡片上却是「暂停」那个图标（= 它以为在播）。

### 55.1 真因：座舱自己那句话没有过期

§51 为了盖过站点按钮的迟疑，记下了**座舱自己按下的结果**（`intent`），§53 又把它的 15 秒期限删了。于是当页面
**什么旁证都没有**——没画进度时钟、没有自己的 `audio`、`navigator.mediaSession.playbackState` 是 `none`、播放
按钮也没有名字——`playing` 就一直是那一次按下的答案：

```
power on → 座舱发 playPause → intent = true → ……玩家后来自己停了 → 页面无话可说 → 卡片还说 playing
```

这正好是截图里的样子：歌停了，卡片上还是「暂停」图标。

### 55.2 改法：三处

1. **`intent` 只活 6 秒**（`INTENT_MS`）：按钮慢，6 秒足够；页面从不说话时，6 秒后回到页面自己的话。
2. **页面有自己的声音元素时以元素为准**：`paused` 是物理事实，任何言辞都压不过它。
3. **什么都读不到时，把四个来源写进日志**（`stateProbe`，最多 6 条、8 秒一条）：
   `clock=none element=0 session=none button=播放 intent=true -> true` —— 谁在说谎，日志里看得见。

### 55.3 验证

假页面（有歌名和播放按钮、没有时钟/元素/系统状态，就是首页那种）：

| 时刻 | 卡片报的 `playing` |
|---|---|
| 按下之前 | false |
| 按下之后 1.2 秒 | true |
| **按下之后 7 秒**（那句话过期） | **false** ✓（改之前永远 true） |

日志同时给出两条 `stateProbe`（`intent=true -> true`，然后 `intent=null -> false`）。

真页面复核：首页按 playPause 仍然什么都不按（`buttonProbe … none`）；播放器页仍然按 `.btn_big_play`；时钟页
（在播 true / 时钟停住 false / 按下 true）与按钮滞后页（按下 false→true）都不变。

| 项 | 结果 |
|---|---|
| `node --check webapp.js` | 通过 |
| `vitest run` | 75 文件 / 553 通过 |
| `tsc -b` | 0 错 |
| 安装包 | **10,317,163 B**，SHA256 `E7376AD2368E3D4CBB125063A69DD67545F37F94CC8179D406F27506AFA3E4BF` |
| exe | **24,561,152 B** |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（没变） |

### 55.4 还没读到的

首页自己的播放条叫什么，仍然只能从日志里读（`stateProbe` / `qq home`）。这一版让「停了还显示在播」有了下限：
任何情况下，6 秒后卡片不会再照着一次旧按键说话。

## 56. 五处一起修：卡片反着、网易云没卡片、B 站滚轮、首次安装的旧插件、网易云新版登录（2026-11-02 深夜）

owner 一次报了四件，随后追加第五件：

1. 「现在 QQ 音乐的播放状态跟控件是反的」
2. 「网易云音乐也没有适配控件」
3. 「哔哩哔哩无法用鼠标滚轮上下翻页」
4. 「让首次安装不再用旧版 dll」
5. （追加）「给软件的网易云外部登录适配新版」

### 56.1 QQ：座舱自己那句话没有期限（根因在界面，不在页面）

§51 为了盖住 QQ 按钮名字的迟疑，在**界面**这一层也记了一句「这次按成了什么」（`shownPlaying`）：按下立刻翻图标，
页面的下一次报告（`receiveWebAppMedia`）再把它清掉。问题在于——**页面不报告，它就不清**。QQ 音乐首页没有
`audio`、没有进度时钟、`mediaSession` 也没有状态，于是那句翻过去的答案一直留着：

```
卡片说「在播」 ← shownPlaying = true（上电时 pauseWithPower 发的那一下，或玩家自己按的那一下）
页面其实停着   ← media.playing = false，可页面不再报告，没人清它
```

页面在播卡片说停、页面停了卡片说播，正是「反的」。§54/§55 只给页面侧的 `intent` 加了期限，界面这一句一直没有。

改法：`webapp.ts` 的 `command()` 里那句只活 **2.5 秒**（`SHOWN_FOR`），到点自己交还给 `media.playing`；页面的报告
照旧立刻清掉它（`receiveWebAppMedia`）。

| 时刻 | 卡片 |
|---|---|
| 按下瞬间 | 翻成按下后的样子（页面的按钮名字要好几秒才跟上，这一步不能少） |
| 页面报告了 | 以页面为准（行为不变） |
| 页面一直不报，2.5 秒后 | 回到 `media.playing`（以前永远停在按下那一刻） |

### 56.2 网易云：新播放条不写字，页面整个不报

`netease()` 要 `.words .name` 里有歌名才返回；新版 `music.163.com/st/webplayer` 的条还在（`.m-playbar`），
但没播（以及新版布局下）`.words` 是空的 → 返回 `null` → 卡片什么都不显示，看着就是「没有适配控件」。

改法：条上没有字时读**页面标题**——网易云在播时标题是「歌名 - 歌手 - 网易云音乐」，`document.title` 去掉站名、
再按 `" - "` 拆成歌名和歌手；两者都没有才返回 `null`。播放/暂停按钮照旧（新条上就是 `.ply`，
`title="播放/暂停(p)"`，`CLASS_NAMED` 本来就能认）。

### 56.3 B 站：滚轮由页面自己兜底

宿主侧确认过：光标在页面里时滚轮是发进站点视图的（`pointer.rs`，`COREWEBVIEW2_MOUSE_EVENT_KIND_WHEEL`，
数据 ±120/格）。可它到没到页面，宿主看不出来。这一版加一条兜底，原来的路一点不改：

1. 滚轮照旧 `send_mouse` 给 WebView2（页面自己能滚就滚）；
2. 同一格滚轮另发一条页面消息 `{"type":"webAppWheel","dy":±120}`（`pointer.rs` → `post_json`）；
3. 页面（`webapp.js`，`turnWithWheel`）**先给 WebView2 90 毫秒**：这期间那个盒子自己动了 → 什么都不做（不会滚两倍）；
   没动 → 自己滚：光标下最深的可滚容器（`overflow-y: auto|scroll|overlay` 且内容比它高），没有就整页。

验证（无头 Edge，真 `webapp.js` + 假 `chrome.webview`）：

| 情形 | 结果 |
|---|---|
| 光标在可滚盒子里，滚轮向上 120 | `scrollTop` 400 → 280 ✓ |
| 向下 120 | 280 → 400 ✓ |
| 页面自己的滚轮先动过（500 → 620） | 我们不动它：仍是 620（重复滚会是 740）✓ |
| 光标在盒外，整页滚 | `scrollY` 0 → 120 ✓ |

### 56.4 首次安装：被游戏占用时把旧插件挪开

`plugin::state` 比的是**字节**（不同就装），所以「装不上」不是比对错，而是 `copy_into` 里那句「写开目标文件探一下
是否被占用」：游戏开着 → 报 `InUse` → 这一版什么都不做，游戏里的旧 `westplay.dll` 留了下来，于是「首次安装还是
旧版插件」（安装包本身带的是这一版的 dll，问题是它进不了游戏目录）。

改法：被占用时**改名挪到一边**（`westplay.dll.<时间戳>.old`）——Windows 允许改名一个已加载的 DLL，只是不许覆盖——
再把这一版拷进原位，游戏下次启动就加载新的。装成功后顺手清掉 `*.old`（还装着的删不掉，忽略；游戏只加载 `.dll`，
`.old` 永远不会被它加载）。

测试（真 DLL 载入后仍能装）：`LoadLibrary` 一份改名成 `westplay.dll` 的 `version.dll` → `install` **成功**、
`state` = Current、旁边留下一个 `.old`；`FreeLibrary` 后再 `install` → `.old` 被清掉（目录里只剩一个文件）；
`uninstall` → Missing。

### 56.5 网易云外部登录：新版页面

伴侣窗口里的登录页现在是这样：顶部条点「登录」→ 弹窗（默认「扫码登录」，可切「选择其他登录模式」），
而 `MUSIC_U` 现在是 **HttpOnly**（页面 JS 读不到 `document.cookie`）。`netease_sign_in.js` 原来只靠 cookie +
旧 `.m-tophead .login` 结构判断 → 永远不认为已登录 → 窗口不关。

改法：cookie 读不到时看**头部条**——没有「登录」二字、并且有头像/用户名元素（`img` / `face` / `avatar` / `user`）
就算已登录。

### 56.6 验证

| 项 | 结果 |
|---|---|
| `vitest run` | 75 文件 / **555** 通过（新增 2 条：按下只活 2.5 秒；页面一报告就交还） |
| `tsc -b` | 0 错 |
| `cargo test -p westplay-setup` | **70** 通过 / 0 失败 / 9 忽略（改：被占用的插件挪开再装） |
| `cargo test -p westplay-host --lib` | 224 通过 / 0 失败 / 26 忽略 |
| `cargo test -p westplay-shared --lib` | 21 通过 / 0 失败 |
| `node --check` | `webapp.js`、`netease_sign_in.js` 通过 |
| 滚轮兜底 | 无头 Edge 四例全过（§56.3） |
| 安装包 | **10,320,055 B**，SHA256 `C80CD609EB0E81CABC704CE44D709DAD857BE074D0FCAF4F69CD56BAF98D8C3A` |
| exe | **24,562,176 B** |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（没变：这一版只动宿主和界面） |

顺带：`crates/setup/src/places.rs` 的 `names_a_folder_as_windows_does` 在 `SystemRoot` 写作 `C:\WINDOWS`、真实文件夹是
`C:\Windows` 的机器上必然失败（这台就是），改成大小写不敏感——意图不变（名字取真实文件夹，不取环境变量的写法）。

### 56.7 还差什么

- **B 站滚轮**：兜底只管「页面自己滚」。若日志里出现 `webapp: the wheel to the page failed: …`，那是页面脚本没进
  那个站点（注入就失败了），是另一条路。
- **QQ 音乐首页的播放条到底叫什么**：`stateProbe` 仍在（上限 6 条），页面无话可说时把四个来源写进日志；拿到一条
  就能把首页卡片做成「读页面的真状态」，而不是靠 2.5 秒的兜底。
- **网易云新版登录**：只在登录页的**结构**上适配（没有账号可实测到底）；若窗口仍不关，请把那个弹窗截图给我。

## 57. QQ 音乐还是反的（页面自己的空媒体元素被当成歌）、网易云新版不能切歌（2026-11-02 深夜）

owner：「现在QQ音乐的播放状态跟首页的媒体控件依然是反的（暂停是播放），网易云音乐也没有适配切歌，继续修复」。

这一轮终于有**现场日志**了（`%USERPROFILE%\Documents\WestPlay\logs\app.log`，23:36–23:39，owner 自己跑的）：
两份真因都在里面。

### 57.1 QQ：真因是「没有内容可播的媒体元素」

```
23:36:14  webapp: mediaProbe: music.163.com … frames=0 media=8 speakable=false
23:36:5x  webapp: mediaProbe: y.qq.com … media=1 rs=0 speakable=false      ← QQ 播放器页：1 个，没地址、没读出来
23:37:03  webapp: pressProbe: /n/ryqq_v2/player playPause -> A.btn_big_play="暂停"
23:37:11  webapp: pressProbe: /n/ryqq_v2/player playPause -> A.btn_big_play="播放"
```

QQ 的播放器页有**一个它自己造的空媒体元素**：没有 `src`、`readyState` 是 0、`speakable=false`。这种元素一旦被
`play()` 过就**永远不再是 `paused`**（浏览器的规矩：`play()` 一调，`paused` 就是 false，哪怕一个字节都没放）。
而 §44 起 `player()` 挑「歌」的规矩是「`!paused && !ended` 的第一个」——它被当成了歌：

```
playing = song ? !song.paused : …   →   song.paused 永远 false   →   playing 永远 true
```

歌在播时它碰巧是对的，一暂停卡片就还报「在播」——正是 owner 说的「暂停是播放」。前几轮改的都是「谁说了算」，
没人怀疑过**被当成歌的那个元素本身**。

改法：**能当歌的元素必须先有东西可播**：

```js
const sounding = (one) =>
  Boolean(one) && !one.ended &&
  Boolean(one.srcObject || ((one.currentSrc || one.src) && one.readyState >= 1))
```

`player()`、`playingOwn()`、`say()` 里那三处「挑在播的元素」都改成用它过滤（`sounds()` 不动：音量仍然给页面上
每一个媒体元素，包括网易云那种造出来不放回页面的）。

A/B（无头 Edge，真 `webapp.js` + 假 `chrome.webview`）：造一个 `play()` 过的空 `<audio>`（`paused === false`），
配上 QQ 播放器页的标记，歌是暂停的（没有时钟，正是空元素说了算的那种页面形状）：

| | 报的 `playing` |
|---|---|
| 改之前（空元素被当成歌） | **true** ✗ |
| 改之后 | **false** ✓ |

### 57.2 网易云：切歌按不到（控件是「文字图标」）

```
23:36:20  webapp: buttonProbe: /st/webplayer next none || BUTTON.cmd-button="播放全部" | SPAN.cmd-icon="play" | …
23:36:23  webapp: buttonProbe: /st/webplayer previous none || …
```

新版 `music.163.com/st/webplayer`（登录后才是这个，没登录会落到旧版 `.m-playbar`）的控件是 `.cmd-button` /
`.cmd-icon`，图标是**图标字体的连字文字**：`<span class="cmd-icon">prev</span>`——没有 `title`、没有 `aria-label`、
也不是 `<a>`/`<button>`。`button()` 原来的两轮（带名字的元素、按 class）都碰不到它，所以 `previous`/`next` 都是
`none`（`播放全部` 反而差点被按到，`NOR` 挡住了）。

改法两处：

1. `button()` 加一轮：在播放条里找**最小的、名字就是它自己文字**的元素（`div`/`span`/`i`/`svg`/`use` 都算），
   用既有的 `label()`（先 `title`、再 `aria-label`、再自己的文字）与 `NAMED` 的词表匹配——`cmd-icon` 里的
   "prev"/"pause"/"next" 正好命中；
2. 实在找不到按钮时，发**播放器自己的键盘快捷键**（网易云旧条自己就写着「上一首(ctrl+←)」「下一首(ctrl+→)」）：
   往 `document`/`window` 发 `Ctrl+ArrowLeft` / `Ctrl+ArrowRight`，并把这一步写进日志
   （`pressProbe … keys ctrl+ArrowLeft`），下一轮就能从日志判断走的是哪条路。

A/B（无头 Edge）：`.cmd-button > span.cmd-icon` 里写 "prev"/"pause"/"next"，`title` 全空：

| | `previous` 的结果 |
|---|---|
| 改之前 | `none`（日志里就是这样） |
| 改之后 | `previous -> DIV.cmd-button="prev"`，点中的就是它（`next` 同理）✓ |

### 57.3 验证与产物

| 项 | 结果 |
|---|---|
| 无头 Edge：空媒体元素被当成歌 | 改前 true → 改后 **false** ✓ |
| 无头 Edge：图标字控制 | 改前 `none` → 改后点中 `DIV.cmd-button="prev"`/`"next"` ✓ |
| `node --check webapp.js` | 通过 |
| `vitest run` | 75 文件 / 555 通过（本轮没动界面） |
| `cargo test -p westplay-setup` / `-host` / `-shared` | 70 / 224 / 21 通过 |
| 安装包 | **10,324,775 B**，SHA256 `0A5CB008AB46A7BAC8924F784B2F893F515E708F1F10A697EFF5902E1AED4515` |
| exe | **24,564,736 B**，SHA256 `29365E8D980042CA9C0D20AA8FA3A1401B34A5883C19C97715DF4B1E24CAF01D` |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（没变） |

### 57.4 还差什么

- 网易云**登录后**的新播放条我这边演示不到（未登录落到旧版）。两条路（文字图标、`Ctrl+←/→`）任一能中就够；
  都中不了的话，日志里会留下 `previous -> keys ctrl+ArrowLeft` 与 `areaNames()` 的元素清单，下一轮照着它改。
- QQ 首页若还反，`stateProbe`（上限 6 条）会把四个来源写下来。

## 58. 网易云音乐：切歌走页面自己的媒体键动作（2026-11-02 深夜）

owner：「QQ音乐先别动了，让网易云音乐适配这个页面的切歌按钮」（配图是座舱首页的网易云卡片：上一首 / 播放 /
下一首 三个键，歌是《何处山海万象生》）。

### 58.1 为什么按不到

§57 已经加了「图标字体文字」和「按 class 找」两轮，但网易云**新版**播放器（`music.163.com/st/webplayer`，登录后
才是这个）的上一首/下一首是 **SVG 图标**：没有文字、没有 `title`/`aria-label`、class 名是编译出来的哈希——
页面上确实没有任何东西能按名字找到。而它自己的前端包里，`setActionHandler('nexttrack')` 与
`('previoustrack')` 各出现一次：**这两个动作它自己早就实现好了**，只是浏览器只在硬件媒体键上才调用它们。

### 58.2 改法：把页面自己的动作留着，用同一个

`webapp.js` 在页面脚本之前运行（`AddScriptToExecuteOnDocumentCreated`），所以可以在页面注册之前包一层：

```js
const real = MediaSession.prototype.setActionHandler
MediaSession.prototype.setActionHandler = function (action, handler) {
  handler ? sessionActs.set(action, handler) : sessionActs.delete(action)
  return real.call(this, action, handler)
}
```

按下切歌时，直接调页面自己注册的那个 handler——队列是它自己走的，不用找按钮，也不会点错东西。

取用的顺序（**只有网易云优先走这条路**）：

1. 网易云：先调页面自己的 `previoustrack` / `nexttrack`（日志 `pressProbe … -> media session nexttrack`）；
2. 其它站点：仍然先按**它自己的按钮**——QQ 音乐那边一点都不动（日志里 `next -> A.btn_big_next="下一首"`
   一直是好的）；
3. 一个按钮都找不到：先试页面自己的动作，再发 `Ctrl+←/→` 兜底；
4. 播放/暂停也一样：没有按钮可用时，按它给 Windows 的状态取反去调 `play`/`pause`。

### 58.3 验证（无头 Edge，真 `webapp.js`）

同一张页面（有 `.cmd-button`，也注册了四个媒体键动作）分别挂在两个域名下，按「下一首」「上一首」：

| 站点 | 结果 |
|---|---|
| `music.163.com` | `acts: ["nexttrack","previoustrack"]`、`clicked: []` → 走页面自己的动作 ✓ |
| 其它域名（同样有按钮） | `clicked: ["next","prev"]`、`acts: []` → 还是按按钮，QQ 音乐的行为没变 ✓ |
| 页面完全没有按钮（只有媒体键动作） | `next`→`nexttrack`、`previous`→`previoustrack`、`playPause`→`play` ✓ |

§57 的两个用例回归：空媒体元素不算歌（`playing: false`）、图标字仍点得中 ✓。

### 58.4 产物

| 项 | 结果 |
|---|---|
| `node --check webapp.js` | 通过 |
| vitest / tsc / cargo | 75 文件 / 555、0 错、setup 70 / host 224 / shared 21（本轮仍只动 `webapp.js`） |
| 安装包 | **10,320,508 B**，SHA256 `7B6A45AE610810A1B8222D39A6D9750798D4ADD8AC5C00193C47000D3FFE3D8F` |
| exe | **24,568,320 B**，SHA256 `6FC9E9974CB269D483E9138055726B8768382BB6331B43865DFF4B8D0B22B419` |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（没变） |

### 58.5 还差什么

如果哪天日志里出现 `pressProbe … -> keys ctrl+ArrowLeft`，说明它连媒体键动作都没注册（页面还没开始播放时
是可能的）；如果出现 `buttonProbe … none || <清单>`，清单会把它的控制条元素写下来，下一轮照着它改。

---

## 59. QQ 音乐首页的卡片是「反的」：一份新文档一句不说，旧的「在播」就留在了卡上（2026-11-02 深夜）

owner：「修复QQ音乐首页媒体控件反过来的bug」。

### 59.1 真因（无头 Edge + 真 `webapp.js`，用车主自己的 QQ 音乐账号读出来的）

1. 播放页（`/n/ryqq_v2/player`）点「播放全部」：正常出声，卡片正确（`title`、`playing: true`，时钟每秒走）。
2. 点站内 logo 回首页（`https://y.qq.com/`）：**整页重新加载**（`docAt` 变了、`sameDoc: false`），声音随旧文档
   一起停了；新文档里**没有播放器、没有媒体元素、没有 `mediaSession`、也没有 `AudioContext`**。
3. 新文档的 `webapp.js` 一条消息都没发（探针 `said: []`）——连 `{media: null}` 都没有。

为什么连「没有」都不说：`said` 的初值是字符串 `'null'`，而「页面什么都没有」算出来也是
`JSON.stringify(null) === 'null'`，`say()` 里 `if (!again && now === said) return` 把它当成「和上次一样」跳过了。
于是主机与座舱都还留着**上一份文档**的 `media`（`playing: true`）：卡片说在播、其实一点声音都没有；按卡片上的
播放/暂停也没有东西可按（首页根本没有播放器，`.btn_bottom_player` 又被 `NOR_CLASS` 排除）——「反过来」就是这一步。

### 59.1.1 顺带查出来的一件事：车主那台跑的是旧版

owner 的 `app.log`（11-02 00:06 起那次）里，按「上一首/下一首」时每 150 毫秒一行
`webapp: buttonProbe: /st/webplayer next none || SPAN.cmd-icon="return" | SPAN.cmd-icon="next3"`，
**一行 `pressProbe` 都没有**——而 §57/§58 的代码按这两个键时一定先发 `pressProbe`。也就是说那次跑的是
**§54 那一版**（当时 `D:\WestPlay\westplay.exe` 确实是 24,559,104 B 的 §54 构建），§55–§58 修的东西一次都没到过车上。
这也解释了为什么「卡片反着 / 网易云没卡片 / 切歌没反应」会同时出现：它们正是 §55–§58 逐条修过的三件事。
本轮装配之后 `D:\WestPlay\westplay.exe` 才是新的（§61.4）。

### 59.2 改法：没有东西可播的页面，等它一会儿，然后自己说「没有」

`crates/host/src/webapp.js`：

```js
const SILENT_MS = 2000
const startedAt = Date.now()
let toldNothing = false
…
// 在 say() 里，media 决定之后、和上次比之前
if (media === null && !toldNothing && Date.now() - startedAt >= SILENT_MS) {
  toldNothing = true
  said = 'null'
  post({ media: null })
}
```

- 一份文档只报一次；2 秒是给页面**找播放器**的时间（网易云/YouTube Music 有时一秒多才建出元素）。
- 宿主侧本来就有这条路（`media.is_null()` → `Some(None)` → `webAppMedia { media: null }`），**Rust 未改**。
- 卡片随之清空（`receiveWebApp` → `media: null`，`shownPlaying` 落地 → `useWebAppSource` 返回 null），回落到
  「没有在播」或别的音源：停在首页再不会有「正在播放」的假象，自然也就没有「按了没反应」的键。

### 59.3 验证（同一份 `webapp.js`，同一个账号）

| 场景 | 改前 | 改后 |
|---|---|---|
| QQ 播放页播放中 | `playing: true` | `playing: true`（未动） |
| 回首页 1.2 s | 一条消息都没有 | 仍然没有（宽限期内） |
| 回首页 2.1 s | — | `{media: null}`，`playing: null` ✓ |
| 别的站点（B 站 / 网易云 / 蜻蜓 FM） | 正常 | 正常（只在 `media === null` 时补一句，非空路径一字未动） |

### 59.4 还差什么

播放页刚点下去的头 0.5~1 秒，卡片会先说「暂停」再说「在播」：QQ 的时钟第一秒还画在 `00:00`，而「时钟不动 =
没在播」是 §53 定下的规矩。这一下只在开头一闪，没有为它改判据（改了会回到 §55/§57 踩过的坑）。

---

## 60. 网易云音乐新版播放器的首页卡片：按「形状」读它自己的播放条（2026-11-02 深夜）

owner：「给网易云音乐添加首页媒体控件适配」。

### 60.1 读出来的页面事实（车主自己的网易云账号，新版播放器 `music.163.com/st/webplayer`）

- 老播放条 `.m-playbar` **根本不存在**；新版是一根自己的条：
  - `span.title-container` → `.title`：歌名（`何处山海万象生`）+ `-` + `.author`（第一个 `a` 是歌手 `铁痕电台-MSR`，
    第二个 `a` 是专辑名 `8:48`）；
  - 封面是条里的 `img`（`thumbnail=40y40` 的缩略图）；
  - 两个时间（`00:04` / `02:50`）；
  - `span.cmd-icon[aria-label="pause"|"play"]`：在播是 `pause`、暂停是 `play`；
  - **class 名全是编译哈希**：`DefaultBarWrapper_d1fdcdsp`、`TitleWrapper_t7mtn5s`、`miniBarTimeTextStyle_m1tgepvu`…
- `document.title` 播放时**仍然是**「网易云音乐」，不写歌名。
- 它自己的 `mediaSession.metadata` 有歌名/歌手/封面，但 `playbackState` 一直是 `none`。

所以：metadata 在，卡片就正常；metadata 一缺席（没登录、刚打开、某些节目），**一张卡片都出不来**——而 §56 加的
「读页面标题兜底」正好写在 `if (!bar) return null` 之后，新版这条分支永远走不到（这也解释了 `§56.2` 为什么在真机上
没有兑现）。

### 60.2 改法：按形状找条，不按名字

`webapp.js` 把 `netease()` 拆成三条路，按顺序取第一个说得出话的：

1. `neteaseOld()`：老 `.m-playbar`（`.words .name` / `.words .by` / `.head img`，原样保留）；
2. `neteaseNew()`：**形状**——从 `.author` 往上走，第一个「同时有一个 play/pause 图标和两个 `mm:ss`」的盒子就是播放条；
   歌名取 `.title` 里不在 `.author` 里、不是 `-` 的第一个 span；歌手取 `.author a` 第一个；封面取条里的 `img` 并把
   `thumbnail=NyN` 换成 `300y300`；播放状态取图标 `aria-label`（`pause` → 在播，`play` → 暂停）；
3. 页标题兜底（挪到 `if` 外面，新版也走得到）。

### 60.3 验证（无头 Edge、真 `webapp.js`，把 `navigator.mediaSession.metadata` 摘成 `null` 模拟「没有 metadata」）

| 读到的 | 值 |
|---|---|
| `title` | 何处山海万象生 ✓ |
| `artist` | 铁痕电台-MSR ✓（不再带 `/8:48`） |
| `artwork` | `…?thumbnail=300y300&type=webp&rotate=360…` ✓ |
| 在播 → 卡片按「暂停」 | `playing: true` → `playing: false` ✓ |

有 metadata 时的老路回归：卡片照样用它给的 `title`/`artist`/`artwork`（`say()` 里 metadata 优先，`neteaseNew()` 只做兜底）。

### 60.4 还差什么

`.title` / `.author` 是它自己写的语义 class（不是哈希），但它哪天改了结构，`neteaseNew()` 会返回 null，卡片退回
metadata / 页标题两条路（不会报错歌，只是少一层）；日志里 `stateProbe … /st/webplayer` 能看出当时走的是哪条。

---

## 61. 地图随车速自适应缩放（2026-11-02 深夜）

owner：「添加一个导航地图随车速自适应缩放的功能」。

### 61.1 其实一直有，只是幅度小到看不出

`ui/src/cabin/maps/camera.ts` 的 `zoomForSpeed` 早就在做这件事：20 km/h 及以下 17.2 级，90 km/h 及以上 15.9 级——
**只差 1.3 级**，高速和城区几乎是同一个视角，也没有开关，所以看起来像「没有这个功能」。

### 61.2 改法

1. 曲线拉到 **2 级**、满量程放到 **110 km/h**：`t = (kmh − 20) / 90`，`zoom = 17.2 − 2 · smoothstep(t)`
   （0 → 17.2；50 km/h ≈ 16.7；90 km/h ≈ 15.45；110 km/h 及以上 → 15.2）。
2. 新增 `followZoom(speed, offset, withSpeed)`：开 = 随速度；关 = 固定 `STEADY_ZOOM = 16`。玩家自己用缩放键加的
   `zoomOffset` 两种情况都照加（`zoomOffsetFor` 用同一个基准，浏览完回正时不会跳；相机本来就带 1.5 s 阻尼，切换是渐变）。
3. 设置里给开关：**设置 › 地图 ›「随车速缩放」**（`store.zoomWithSpeed`，默认开，与文本大小同类只存在页面这边，
   宿主不参与；新增 `MapGlyph` 与中/英/土三条文案）。

### 61.3 验证

- `maps/camera.test.ts`：`zoomForSpeed(0) = 17.2`、`zoomForSpeed(25) ≈ 15.45`、`zoomForSpeed(40) = 15.2`（封顶）、
  `followZoom(…, false) = STEADY_ZOOM`、玩家偏移照加（+2 条用例）。
- tsc 0 错；vitest **75 文件 / 557 测试**全过。
- 实机手感（游戏里开着车看）**本轮没跑**：需要 owner 跑一段高速确认——0→110 km/h 是平滑曲线，不会跳。

### 61.4 本轮产物（§59–§61 同一次构建）

| 项 | 结果 |
|---|---|
| `node --check webapp.js` | 通过 |
| tsc / vitest / cargo | 0 错 / 75 文件 557 测试 / setup 70、host 224、shared 21 |
| 安装包 | **10,320,935 B**，SHA256 `021F422BC3DAFC25077C13ACD71C91FEE4E9E0E60FCCF9BF212F037C3A38E37B` |
| exe | **24,571,904 B**，SHA256 `7CC0C1D1F4B9FC66BC0A3D762755F54E2564A1CBB9A7AB049C0E22915CCBAEC7` |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（没变） |
| `ui/dist` | 72 个文件，装配后逐文件哈希 0 差异 |
| 启动自检 | 22 秒，`page: running (its scripts loaded)`、`page: power off`、时钟起；**0 error / 0 panic** |

### 61.5 还差什么

- 「随车速缩放」只在**跟车**时生效（浏览地图时那份缩放仍然是玩家自己的，回正后照旧加到速度缩放上）。
- 关掉开关后，如果玩家之前用缩放键加过偏移，镜头会停在 `16 + 偏移`（偏移是相对速度缩放存的），不是记忆成绝对级别；
  想记住绝对级别要再存一个字段，本轮没做。

---

## 62. QQ 音乐回首页接着放、网易云卡片的上一首/下一首（2026-11-02 下午）

owner：「QQ音乐回首页应该和applemusic一样继续播放，除非我手动点了暂停，网易云首页卡片要适配上一曲和下一曲按钮」。

### 62.1 QQ 音乐：回首页为什么断了（读出来的）

用无头 Edge + 真 `webapp.js` + 车主账号：

1. 播放页（`/n/ryqq_v2/player`）播放中：`AudioContext: running`，时钟在走，卡片正确。
2. 点站内 logo/首页 → **整页重新加载**：新文档里 `clock: null`、`ctx: []`、`sounds: 0`——QQ 的首页**没有任何能出声的东西**，
   声音随旧文档一起没了（这正是 §59 修「卡片反着」的那一步）。
3. 但 QQ **自己的播放器页会自己接上**：在同一标签里重载播放器页，`AudioContext` 回到 `running`，时钟从 `00:11` 继续走——
   它把当前歌存在自己的 `localStorage`（`playSongData`）。
4. 首页有一颗**站点自己的**链接 `a.btn_bottom_player`，正文「播放器」；点它 → 播放器页 → 歌接着放
   （探针：`00:11 → 00:19`，8 秒后仍在走）。

### 62.2 改法：记着「这一标签刚才在放」，然后借站点自己的路回去

`crates/host/src/webapp.js`：

1. 每次报「在不在播」，把它写进 **`sessionStorage`**（`westplay.played` = `'1'`/`'0'`）。选 `sessionStorage` 是因为它
   正好只跟**这一个标签**走：站点自己换文档它还在，**app 关掉再开就没了**——不会出现几天后一开 app 就自己放歌。
   手动暂停（车厢卡片或页面自己的按钮）会把 `'0'` 写进去，所以「除非我手动点了暂停」就是这条功能的开关。
2. 一份新文档 2 秒后仍然是「什么都没有」（§59 那条判定）：
   - 上一次是在播 → **点站点自己的「播放器」链接**，把自己送回播放器页（歌由站点自己接上），**不发** `{media:null}`
     ——卡片不会闪成「没在播」；
   - 上一次是停 → 照 §59 发一次 `{media:null}`，卡片清空。
3. 每份文档只点一次，且 15 秒内不重复点（站点不接也不会被一直点）；点过之后的 20 秒里按「播放器正在起」处理，
   等 8 秒再说「没有」（`SETTLE_MS`），接回来的那一两秒不会把卡片清掉。

### 62.3 验证（同一份 `webapp.js`，同一个账号）

| 场景 | 结果 |
|---|---|
| 播放页播放中 → 回首页（整页加载） | 首页停约 3.5 秒后自己回到 `/n/ryqq_v2/player`，`AudioContext: running`，时钟 `00:03 → 00:09` 继续走，**0 条 `{media:null}`** ✓ |
| 先在卡片上按暂停（`played` = `'0'`）→ 回首页 | 停在 `/`，一条 `{media:null}` ✓（没有把歌接回来） |
| 别的站点 | 未动（这段只走「什么都没有」的分支，非空路径一字未改） |

### 62.4 网易云：上一首/下一首

三条路都读了、也都跑过（真 `webapp.js`、车主账号）：

| 探针 | 结果 |
|---|---|
| 站点注册的动作 | `play` / `pause` / `previoustrack` / `nexttrack` 四个都在 |
| 卡片按 next / previous（站点自己的路由） | `pressProbe … -> media session nexttrack`，卡片歌名 `何处山海万象生 → 浮舟 → 何处山海万象生` ✓ |
| 页面**藏在仪表后面**（`document.hidden: true`）再按 | 动作照样执行、歌照样换，卡片 1 秒内拿到新歌名 ✓ |
| 点了侧栏「发现音乐」回到站点首页路由再按 | 照样换歌 ✓ |

所以这一轮补的是「按不到时查得动」和「没有媒体键动作时还有路」：

1. **宿主**：卡片每按一次播放/暂停/上一首/下一首，日志写一行 `webapp: <站点> the card says next`
   （`webapp.rs`，一次按下才一行）。
2. **页面**：按下后**立刻**报一次（不再只等 350 ms 的定时器——页面藏在仪表后面时定时器会晚）。
3. **页面**：调用站点动作 3 秒后若 `said` 没变，日志写 `… media session nexttrack moved nothing`——下次一眼看出断在哪一步。
4. **页面**：站点**没有**注册媒体键动作时，改按**它自己播放条上的**上一首/下一首图标（`span.cmd-icon[aria-label]` 里
   `return` / `next3` 这类词，按形状在播放条里找），最后才发 `Ctrl+←/→`。

### 62.5 还差什么

- QQ 的「接着放」是在**播放器页**接的：点了站点的首页，几秒后会被送回播放器页——因为 QQ 的首页**没有任何能出声的东西**
  （0 个媒体元素、0 个 `AudioContext`、没有播放条），要在 QQ 里出声就只能在播放器页。想「边逛首页边听」是站点本身做不到的
  （Apple Music 是本地播放器，不在此列）。
- app 关掉再打开不会自动接回（新标签，`sessionStorage` 已清空）——有意这样，免得几天后一开 app 自己放歌。
- 网易云那四个动作是站点注册的：站点哪天不注册了，会走 §62.4 的后两条路（日志里能看到当时走的哪条）。

### 62.6 本轮产物（§59–§62 同一次构建）

| 项 | 结果 |
|---|---|
| `node --check webapp.js` | 通过（90,859 B） |
| cargo | `cargo test -p westplay-host --lib` **224 通过 / 0 失败 / 26 忽略**（`webapp.rs` 改了这一轮） |
| tsc / vitest | 本轮没动 UI（0 错 / 75 文件 557 测试，沿用 §61） |
| 安装包 | **10,325,478 B**，SHA256 `F70BD985B9736D94DBD9AD3C2823DF660A9E29EA14B9A4130516852A2F8671AB` |
| exe | **24,578,048 B**，SHA256 `FD7CBA0C42B7606A993A85B3297E9747DC2D01B11C6D68B1A77B27161B742BE0` |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（没变） |
| `ui/dist` | 72 个文件，装配后逐文件哈希 0 差异（本轮 UI 源码没改，构建产物与 §61 相同） |
| 启动自检 | 22 秒，`page: running (its scripts loaded)`、`page: power off`、时钟起；**0 panic**（唯一含 "error" 的一行是已知的 GitHub 更新检查连不上） |

---

## 63. 「红绿灯显示」搬进「设置 › 地图」（2026-11-02 下午）

owner：「给红绿灯显示挪进你新加的地图设置里面」。

### 63.1 原来在哪、为什么该走

- 这一项原来在 **设置 › 外观**（`AppearancePage` 的最后一块，和「文本大小」「车机栏」挤在一页），可它管的是**地图上画什么**：
  宿主从游戏内存里读前方最近那盏灯（`crates/host/src/traffic_lights.rs`），地图把它画在蓝色路线上。
- §61 新开的 **设置 › 地图** 本来就是给地图自己的页，那时只有「随车速缩放」一项——红绿灯正好该在那儿。

### 63.2 改法（只挪位置，逻辑一字未改）

- `ui/src/cabin/apps/settings/SettingsApp.tsx`：`AppearancePage` 里读 store 的两行和那一整块 `<Group>` 删掉；
  `MapsPage` 变成两组：
  1. **「红绿灯显示」**（`trafficLightsFooter` 仍是原来那句：在地图上显示前方最近的红绿灯、灯色和读秒）；
  2. **「随车速缩放」**（§61）。
- 开关行为、文案、持久化键（`trafficLights`）、以及发给宿主的那条 `{ type: 'trafficLights', on }` 全都没动：
  关掉照样让宿主**停止读游戏内存**（不是只藏起来），重开 app 照样恢复。
- 顺手把三处写着「Settings › Appearance」的注释改成「Settings › Maps」：`store.ts`（两处）、`crates/host/src/lib.rs`（消息注释）。
- 「外观」页现在只剩：明暗（浅色/深色/自动）、文本大小、车机栏（有车机栏的屏幕才有）。

### 63.3 验证

- tsc 0 错；vitest **75 文件 / 557 测试**全过；prettier 检查通过（两个改动文件）。
- 构建产物核对：`ui/dist/assets/cabin-CADI6idV.js`（1,303,216 B，比 §62 的 `cabin-CAr_dZtZ.js` 大 3 B）——界面确实重新打了。
- 设置页没有自动化 UI 测试，这一项靠读代码 + 产物核对；**游戏里没跑**，请 owner 打开 设置 › 地图 看一眼。

### 63.4 本轮产物（§59–§63 同一次构建）

| 项 | 结果 |
|---|---|
| tsc / vitest / prettier | 0 错 / 75 文件 557 测试 / 两个改动文件通过 |
| 安装包 | **10,321,440 B**，SHA256 `DBCE47E1D746E72ECA4AB11C39670B6257C8C0D8A46C5DDA2E21AB41600ACF92` |
| exe | **24,578,048 B**，SHA256 `67082C075AE88CBE0FDFD85A9BBC217B93691E42E6E943B96A8D15B4D8766508` |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（没变，不用重启游戏） |
| `ui/dist` | 72 个文件，装配后逐文件哈希 0 差异 |
| 启动自检 | 20 秒，`page: running (its scripts loaded)`、`page: power off`、时钟起；**0 panic** |

---

## 64. 哔哩哔哩用滚轮翻页卡顿（2026-11-02 下午）

owner：「修一下哔哩哔哩用鼠标滚轮翻页时卡顿的问题」。

### 64.1 读出来的：不是卡，是每一格滚了两次

无头 Edge + 真 `webapp.js`、B 站首页，按 App 的真实发送顺序（先把滚轮交给页面，再把消息发过去）：

1. **WebView2 其实会把滚轮交给页面**：一格 → `scrollTop 0 → 120`，立刻到位（§59 时以为它不给，那是当时的页面/时机问题）。
2. 而页面里那条兜底（`turnWithWheel`，§59 同一天加的）**90 ms 后**又滚了一次：`120 → 240`。它的判据是「收到消息那一刻的位置 vs 90 ms 后的位置」，可原生滚动在**收到消息之前**就已经落地了，所以 90 ms 后当然"没动"——于是它又滚一格。
3. 连续滚 5 格：原生 600 + 我们末尾补 120 = **720**（多跳一格，这就是"一顿一顿"）。
4. 另一种情况更亏：页面真的收不到滚轮时，10 格消息被"每次重置定时器"合成**一次**，只滚 120——整次滚动几乎白滚。

### 64.2 改法（`webapp.js` 的 `turnWithWheel`）

1. **问页面自己的答案，不猜**：加一个 passive 的 `wheel` 监听，在事件里记下盒子当时的位置，下一帧看它有没有被滚动——这是"页面自己滚了没有"的第一手证据。
2. **按整次滚动结算，不按格**：一次滚动（`TURN_QUIET = 130 ms` 内没有新的一格）结束时才结算：页面自己滚过 → **一点都不补**；页面一格都没动 → 才把这次累计的 `dy` 一次性补上。
3. **补的时候整次落地**：不再是"只补最后一格"，10 格就是 10 格的位移。
4. 第一次真的"替页面滚"时写一行日志：`stateProbe: the wheel moved nothing here, turning the page by hand (<path> <dy>)`——以后一眼看出走的是哪条路。
5. `pointer.rs` 里那段注释同步改写（WebView2 确实会交滚轮，消息只是给"收不到滚轮"的页面兜底）。

### 64.3 验证（同一份探针，修前 / 修后）

| 场景 | 修前 | 修后 |
|---|---|---|
| 原生滚轮 5 格 + 每格一条消息（App 的真实顺序） | **720 px**（多跳 120） | **600 px** ✓ |
| 原生滚轮 10 格 | 1200 px，末尾多一跳 | 1200 px，不多 ✓ |
| 只有消息（页面收不到滚轮） | 只滚 **120**（10 格被吞） | **1200** 全部落地 + 日志 ✓ |
| 单独一格 | 120 | 120 ✓ |
| 向上滚（已在顶部） | 0 | 0 ✓ |

- `node --check webapp.js` 通过（93,174 B）；`cargo test -p westplay-host --lib` **224 通过**。

### 64.4 还差什么 / 边界

- 兜底仍然在"整次滚动结束后 130 ms"才动手：只有"页面完全收不到滚轮"的站点才会感到这 130 ms（B 站不走这条路）。
- 页面自己若用**平滑滚动**（Windows 的滚动动画），判据看的是"位置变过"而不是"事件被处理过"，所以照样不会补滚；这一点用真页面验过。
- 本轮没在车里用真鼠标跑（无头环境跑的是同一份 `webapp.js` 与同一条输入顺序），实机手感请 owner 滚一下确认。

### 64.5 本轮产物（§59–§64 同一次构建）

| 项 | 结果 |
|---|---|
| `node --check webapp.js` | 通过（93,174 B） |
| cargo | `cargo test -p westplay-host --lib` **224 通过 / 0 失败 / 26 忽略** |
| tsc / vitest | 本轮没动 UI（沿用 §63：0 错 / 75 文件 557 测试） |
| 安装包 | **10,329,395 B**，SHA256 `37B04BDBB51D4EA9DA396C6D620E5534F83F7E3D407852FBAA4C0F695034B342` |
| exe | **24,580,608 B**，SHA256 `69C13D2FDA3A72E64FBDA4F66C7FC6B41F7D7B2F10F87D8CB5027726EF00CF01` |
| 插件 dll | **608,768 B**，SHA256 `FD8814CC30E681BCB5359A3F8164F37E2A75B2B92EB65BE687B70A44C6CE092D`（没变，不用重启游戏） |
| exe 里的新脚本 | `the wheel moved nothing here` / `turning the page by hand` 各 1 处（确认这一版真的带上了这次的改动） |
| `ui/dist` | 72 个文件，装配后逐文件哈希 0 差异 |
| 启动自检 | 20 秒，`page: running (its scripts loaded)`、`page: power off`、时钟起；**0 panic** |

---

## 65. 卡车后置视角（方案 B：用我们自己的相机重新渲染）— 第一步

owner：截图（座舱、车机屏上是手绘的 R1 倒车影像）+「你可能已经看见了四路视角中包含卡车后置和卡车俯视视角，图片为插件目前自带的倒车影像功能，现在的问题就是不能显示上面图的后置视角，选显示效果最好的方案，先想办法把卡车后置视角搞出来」；随后选「B方案」。

### 65.1 现在是什么，为什么看不到后置

- 车机屏上的倒车影像**不是游戏画面**，是 App 里画的（`ui/src/cabin/reverse`：R1 徽标、红黄绿梯形的辅助线、SVG）。
- 倒车时 `crates/host/src/reversing.rs` 会**替玩家按游戏自己的相机键**（有挂车→俯视 3，没挂车→车尾外部 2），所以整个**玩家视线**被游戏切到车外；而相机在车外时游戏不画 WestPlay 的屏（§36），那张卡只是补按键还没生效的那几帧。截图那一下是在座舱视角（没在倒车）。
- §37 曾想直接把"镜子"的纹理贴到屏上，结果拿到的是**法线缓冲**。今天把当时留下的 `logs/mirror/left.bmp`（2026-11-01 22:23）转成 PNG 看了一眼：座舱内饰、蓝紫色的视图空间法线——确证。
- §37 的判据是"尺寸能被屏幕整除的、最大的那一对 RT"，可同一帧里两张 1280×720 的缓冲比镜子先撞上——**尺寸说明不了它是不是画面**。
- 还有一个更要命的：普查只在**倒车时**跑，而倒车时相机已在车外，**镜子和座舱屏只在座舱视角才画**。也就是说它连镜子都没机会看见。

### 65.2 这一版做了什么（只读的探针）

1. **按内容认，而不是按尺寸猜**：对每个候选读中间 96×54 一小块，算"法线带占比"——r、g 都接近 128、b 高。法线缓冲 ≈ 0.8，真实画面 ≈ 0。`normals_share()`，只有 < 0.35 才算画面。
2. **每个候选都留一张小图**：`logs/mirror/cand-<n>.bmp`（最多 6 张），日志每个候选一行 `mirror: candidate 1280x720 fmt=28 normals=0.82`。
3. **不是镜子形状的也报出来**：`mirror: not a mirror's shape: WxH fmt=F`（最多 24 种），这样万一镜子是别的尺寸/格式，从日志就能看出来该放宽哪一条。
4. **认出镜子之后抓调用栈**：谁把它绑定成渲染目标，谁就是画它的人——`mirror: 0x… (1280x720) is bound by N frames of the game (its base 0x…)`，每帧一行 `mirror:   bound from 0x… (game+0x…)`。
5. 普查改成**屏幕启用就跑**（不再等倒车），认出那一对就停；`in_reverse()` 保留但不再有人用（`expect(dead_code)`）。

### 65.3 为什么这是方案 B 的第一步

方案 B 是：**相机参数由我们给（后方/俯视），目标纹理由我们给，让游戏自己的渲染管线去画**——材质、光照、雨雾、镜面全是原生的，效果最好、连续、不闪。

- 游戏每帧本来就在为镜子渲染若干"第二个视角"：**同一段"从某相机画一个世界"的代码**。
- 只要摸清它的入参（视图/相机结构、目标纹理、视口），就能用**我们自己的相机**再调一次，画进座舱屏那块纹理（那本来就是游戏的纹理，若带 `RENDER_TARGET` 直接可绑）。
- 所以顺序是：**认出镜子（这一版）→ 抓到画镜子的调用栈（这一版）→ 用栈上的返回地址定位函数、看参数、试着重调一次（下一步）**。

### 65.4 需要 owner 配合的一次（约 1 分钟）

1. 装这一版，**重启游戏**（dll 变了）。
2. 坐进车里正常开一段（不用倒车，座舱视角就行）。
3. 把这两个给我即可：`Documents\WestPlay\logs\plugin.log`、`Documents\WestPlay\logs\mirror\` 整个文件夹。

日志里会出现 `mirror: candidate …`、`mirror: the pair is …`、`mirror: … bound from …`；`cand-*.bmp` 我可以直接看是哪几张、像什么。

### 65.5 边界

- 这一版**不改画面**：屏幕照旧是 App 页面 + 手绘倒车影像；探针只读不写。
- 读回是渲染线程上一次 96×54 的小拷贝、80 ms 一次，认出镜子后就停，正常开车基本无感。
- 方案 B 真正出画面之前，**别期待座舱屏上出现游戏画面**：这一版只负责把"画镜子的那段代码"找出来。

### 65.6 本轮产物（§59–§65 同一次构建）

| 项 | 结果 |
|---|---|
| cargo | `cargo test -p westplay-plugin --lib` **46 通过 / 0 失败 / 1 忽略**（新增 3 条：法线带、真实画面、空样本）；`cargo build -p westplay-plugin --release` 无警告 |
| 宿主 | 本轮没改宿主代码（沿用 §64 的 `webapp.js`） |
| 安装包 | **10,333,516 B**，SHA256 `796B6004D0C461CF2F2C33FE784551ECEDFB63AF48C18750F209A03EE3A380E6` |
| exe | **24,580,608 B**，SHA256 `5F730950F519B9C3CFD9830B5C2BDA886824D5ABA1F875F0A1CB167D2B7CEABA` |
| 插件 dll | **626,176 B**，SHA256 `0329C4CC7BE9F81C161E0530A435483A12BBBDB12058A5A8F470F8588FF4C298`（**变了：要重启游戏**） |
| dll 里的新代码 | `mirror: candidate`、`mirror: not a mirror's shape`、`is bound by`、`the pair is the` 各 1 处（确认这一版真的带上了探针） |
| `ui/dist` | 72 个文件，装配后逐文件哈希 0 差异 |
| 启动自检 | 20 秒，`page: running`、`page: power off`、时钟起；**0 panic** |

---

## 66. 卡车后置视角（方案 B）第二步：镜子不在 RT 里 —— 改抓视口和"那一笔 draw"

### 66.1 owner 那一跑（§65 的探针）告诉我们的

1. **完整的 RT 清单（25 种）**：`2560x1440` 的 fmt 87（`B8G8R8A8_UNORM`，交换链）、26（`R11G11B10_FLOAT`）、10（`R16G16B16A16_FLOAT`）、12（`R16G16B16A16_UINT`）、34（`R16G16_FLOAT`）；`512x256 / 512x512 / 512x1024` 的 10/12/34/49（阴影与光照）；`256x256 / 256x128 / 256x512` 的 26；`1x1` 两个；`256x256` fmt 93（`B8G8R8X8_UNORM_SRGB`）。
2. **一个"镜子尺寸"的 RT 都没有**：1280×720 只有 4 张（fmt 28 ×2、29 ×2），中心 96×54 取样是**座舱内饰**（`cand-1` 是一片青绿色的墙），四张分数都是 `normals=0.00`。我那条"法线带"判据只对 §37 那种编码有效，对延迟渲染的这些缓冲不成立——**判据要按内容换，但先得看见东西**。
3. **抓到的调用栈不是主渲染线程**：`game+0x2f04d0` 起是带 0x400 槽环形队列、`xchg` 自旋锁的 worker（反汇编在 `D:\wp-build\disasm-65.txt`）。`r_deferred_mirrors` 的 deferred 是**异步**的，不是"延迟到本帧后面"。
4. 合起来：**ETS2 不给镜子一张可读的纹理**。它更像光学传送门——把镜子相机的视角**直接画进主渲染目标里的一小块视口**。§37 和 §65 都在找那张不存在的纹理，方向本身错了。

### 66.2 这一版加了什么（还是只读）

1. **`RSSetViewports` 钩子**（vtable 44，与已有 `OMSetRenderTargets` 33 同一套 MinHook）：每出现一种没见过的视口（x/y/w/h）记一行 + 当时的调用栈（最多 16 种）。
2. **`DrawIndexed` 钩子**（vtable 12）：**当前视口比全帧窄 25% 以上**（"画面里的一小块"）时，把这一笔 draw 的调用栈记下来（最多 3 笔）。这一笔的**调用者就是画镜子的函数**——方案 B 要复用的那个入口。
3. **一帧的 RT 绑定顺序**（普查第一次看之后连续 3 帧）：`rt: frame N bind 0x… WxH fmt=F`，pass 的边界从顺序上能看出来。
4. §65 那些（内容判定、`cand-N.bmp`、非法形状清单、认出后抓绑定栈）都保留。

### 66.3 拿到数据之后怎么走

- 出现"角落小视口"且有对应的 draw 栈 → 定位到函数 → **用我们自己的相机 + 自己的渲染目标再调一次**（方案 B 的正题）。
- 没有小视口、只有整屏视口 → 镜子是"整屏重画到某个 2560×1440 RT 再合成" → 那个 RT 就是我们要的那张，路线同上。

### 66.4 需要 owner 再做一次（这次只要日志，不要图）

1. 重启游戏（dll 又变了：**631,808 B**，`B6352E31…`）。
2. **开到路上，座舱视角，让两面镜子都在视野里**，开 10–20 秒。
3. 把 `Documents\WestPlay\logs\plugin.log` 给我。

日志里会出现 `mirror: viewport …`（带 `game+0x…`）和 `mirror: a draw in a viewport in the corner …`；万一镜子是整屏重画，就只会出现 `rt: frame …` 的顺序，那也够定位。

### 66.5 本轮产物

| 项 | 结果 |
|---|---|
| cargo | `cargo test -p westplay-plugin --lib` **46 通过 / 0 失败 / 1 忽略**；`cargo build -p westplay-plugin --release` 无警告 |
| 安装包 | **10,334,942 B**，SHA256 `7DB67936678A8B605FBCA35093C8C24C947D6DC907FC8F5D506ECB3045989DAE` |
| exe | **24,580,608 B**，SHA256 `36D925024528887965B26C5C97FB28640A4A720BBCAD368D07FF72EE0DF97D3B` |
| 插件 dll | **631,808 B**，SHA256 `B6352E3123F50CB5864242299FD259B453441E7706ECF16E54191D7EC482C2A0`（**变了：要重启游戏**） |
| dll 里的新代码 | `mirror: viewport`、`a draw in a viewport in the corner`、`rt: frame`、`DrawIndexed` 各 1 处 |
| `ui/dist` | 72 个文件，装配后逐文件哈希 0 差异 |
| 启动自检 | **0 panic** |
| 两个 zip | 源码 670 项 **8,706,861 B** `86D7709623FF11F6FD1AB9D885D97CA2D2B95EE5FF97757708D286BE9397E330`；改动 432 项 **1,508,224 B** `1203F33A16736AB9497BED51A16BCBCDA132DF34E9AF8513B7BA3771DBAAD66C` |
| 两个 zip | 源码 666 项 **8,505,013 B** `8E70532B74A1E5BCE0D00C55B81341A758FD7111A0CB49EF02B40DE4283E0662`；改动 432 项 **1,502,700 B** `3E23F9F97A1E915624990A5AE0F8DF09C9F5B7DBB2AB7532C8884E9F75C2EE0D`（这一轮多了 `crates/plugin/src/d3d.rs`） |

---

## 67. 卡车后置视角（方案 B）第三步：那两张 1280×720 是内饰，镜子被"挖"在主画面里

### 67.1 第二跑（§66 的探针）证伪了什么

- **两张 1280×720 的缓冲是内饰，不是镜子**：全尺寸看 `logs\mirror\left.bmp`（这次是在路上跑的），画面是方向盘、仪表台、杯子、挡风玻璃框和前方的路——**玩家视角**的半分辨率延迟缓冲（视图空间法线编码）。所以它们既不是左镜也不是右镜。
- **没有一块"镜子大小的视口"**：整段日志里出现过的视口只有 16 种：`2560x1440`（全屏）、`750x422`、`2048x1024`、`4096x4096`、`2048x2048`、`1024x512`、`512x1024`、`512x512`、`512x256`、`256x256`、`128x128`、`1x1`（都是离屏贴图），以及四个 **113×28** 的小条（`1808,952` / `1808,980` / `1921,952` / `1921,980`）——那是右下角的界面提示文字，不是镜子。
- `rt:` 顺序只有 3 行：每帧绑 2 张 1280×720 fmt=28（其中一张绑两次），与内饰延迟缓冲一致。
- 所以：镜子**既没有自己的贴图，也没有自己的视口**。它只能是"被挖出来的一块主画面"——用视口矩形（scissor）或模板（stencil）把主渲染目标的一小块圈给镜子相机，画完再解掉。§65/§66 找的都是"镜子那张图"，而它不存在。

### 67.2 这一版加了什么（仍只读）

1. **`RSSetScissorRects` 钩子**（vtable 45）：每种没见过的矩形（x0,y0,x1,y1）记一行 + 调用栈；比全帧窄 25% 以上、且宽度 ≥ 200 px 的矩形算"被挖出来的一块"（113 px 的界面条被排除）。
2. **`DrawIndexed` 现在两个条件都看**：小视口**或**被挖出来的矩形，都会记下这一笔的调用栈（最多 6 笔）。
3. **`PSSetShaderResources` 采样普查**：普查那一帧之后的 2 帧里，把像素着色器读到的**每一张不同纹理**都取样 96×54 并落盘 `logs\mirror\srv-<n>.bmp`（最多 20 张）。如果镜子其实是一张"被采样的图"（而不是被画进主画面），这张图一定会出现在里面。

### 67.3 拿到数据后怎么走

- 出现"被挖出来的矩形" + 那笔 draw 的栈 → 拿到矩形就能**直接从主画面拷那块像素**（快、真实、连续），同时那笔栈指向"画镜子的函数"（清晰版的正题）。
- 采样图里出现一张"车尾/路"的图 → 那就是镜子贴图，直接读它。

### 67.4 需要 owner 再做一次

重启游戏（dll 又变了：**639,488 B**）→ 座舱视角、**让任意一面镜子出现在画面里**（左边或右边都行，不用一次全看到）→ 开 10–20 秒 → 把 `Documents\WestPlay\logs\plugin.log` 和 `Documents\WestPlay\logs\mirror\` 给我（这次里面有 `srv-*.bmp`）。

### 67.5 本轮产物

| 项 | 结果 |
|---|---|
| cargo | `cargo test -p westplay-plugin --lib` **46 通过 / 0 失败 / 1 忽略**；`cargo build -p westplay-plugin --release` 无警告 |
| 安装包 | **10,335,612 B**，SHA256 `CA873B25CC8F9F8A4D7AEE720FF2F4041EEAA3F28EA2C3C125B33576A79F482F` |
| exe | **24,580,608 B**，SHA256 `6F9321BA4CD86859716ADAC1DBB1746A08396559F082FDFC1BD865C45B926A2D` |
| 插件 dll | **639,488 B**，SHA256 `9EB7457D3174D9C3042699F18C9DE18B6414A0194D9B2D2F3AAA6B23DE29AB8B`（**变了：要重启游戏**） |
| dll 里的新代码 | `mirror: scissor`、`mirror: sampled`、`RSSetScissorRects` 各 1 处 |
| `ui/dist` | 72 个文件，装配后逐文件哈希 0 差异 |
| 启动自检 | **0 panic** |

---

## 68. 卡车后置视角：换路子 —— 把镜子那块画面搬到车机屏

### 68.1 为什么换路子

owner 说：**"尝试其他方案，最终目标就是让车机屏幕显示后置视角"**。硬约束是：车机屏只在**座舱视角**里可见，而座舱视角下游戏唯一会画"车后"的地方就是**镜子**。所以只有两条路：拿到镜子的像素（降级但这一版就能出画面），或者拆开游戏画它的那个函数（清晰，但要继续 RE）。§68 先把前者做出来。

### 68.2 这一版做了什么

1. **镜子矩形**：`RSSetScissorRects` 里"比全帧窄 25% 以上、宽度 ≥ 200 px、且**连续 10 次都是同一个**"的矩形被记成镜子矩形（`mirror::rear_rect()`）。10 帧的要求是为了排除界面上偶尔闪过的裁切。
2. **新模块 `rearcam`**：`Present` 时把这块矩形从交换链后备缓冲 `CopySubresourceRegion` 到一张 STAGING 纹理，`Map` 拷出像素（只占游戏渲染线程约 0.2 ms），交给**自己的线程**用双线性把 96×54…任意大小放大到 1280×720。
3. **`frame::FrameSource::update`**：`rearcam` 有新的一帧就 `UpdateSubresource` 进屏幕纹理，**盖掉 App 的画面**——车机屏显示的就是游戏画在镜子位置的那块后视画面。
4. 每 4 秒把成型的一帧写一张 `logs/mirror/frame-<n>.bmp`（最多 4 张），好判断裁得对不对。
5. 找不到镜子矩形时**什么都不做**（屏幕照旧显示 App），不会回归。

### 68.3 已知的取舍（说清楚）

- **清晰度上限 = 镜子在屏幕上的大小**（约 350×180）：放大到 1280×720 会软。要锐利仍然得拆游戏自己的渲染入口（下一步的"正题"）。
- 只有游戏**用 scissor 裁**镜子时才会生效。如果它用的是 stencil，这一版不会出画面（日志里也就**没有** `rearcam:` 那行）——那就再挂 `OMSetDepthStencilState`。
- 放大在独立线程做，画面新鲜度最多落后一帧。

### 68.4 需要 owner 做的

重启游戏（dll 又变了：**688,640 B**）→ 座舱视角、**让镜子出现在画面里**、开 10–20 秒 → 看车机屏有没有变成后视画面；然后把 `Documents\WestPlay\logs\plugin.log` 给我（**这次的日志里一定要有 `rearcam: the game's rear view is at …` 这一行**，没有就说明是 stencil 那条路，我再改）。

### 68.5 本轮产物

| 项 | 结果 |
|---|---|
| cargo | `cargo test -p westplay-plugin --lib` **49 通过 / 0 失败 / 1 忽略**（新增 3 条：矩形夹取、放大到屏、空裁剪）；`cargo build -p westplay-plugin --release` 无警告 |
| 安装包 | **10,344,314 B**，SHA256 `797D15B80F355018610CCCD316922DDCA81BE975208AA9F4ABD8A6A991E5C4BE` |
| exe | **24,580,608 B**，SHA256 `D9D7664F7FCE5EE5CB7827F9D2B32033AABC207B45A02320431F4ABA04EE73CB` |
| 插件 dll | **688,640 B**，SHA256 `9CA32E9617F85BA455B8ADBCC2FD7FDBABEF1B2F7AB0A0679C7B3F2652BF5D01`（**变了：要重启游戏**） |
| dll 里的新代码 | `rearcam: the game's rear view is at`、`the screen takes it`、`rearcam: wrote` 各 1 处 |
| `ui/dist` | 72 个文件，装配后逐文件哈希 0 差异 |
| 启动自检 | **0 panic** |
| 两个 zip | 源码 671 项 **8,718,500 B** `93ACC208731AAF44C68D6654A3DD535E74971AD58AA4EBA880FCAE8B22B4E21D`；改动 434 项 **1,518,286 B** `726F57AB0FC83825E65E95C9EADEF16FE39B0551D0622F44EFAB30AF0BD302F3` |

---

## 69. 倒车影像全部还原；哔哩哔哩的滚轮；地图上「距下一次强制休息」与订单剩余期限

### 69.1 倒车影像：全部还原

owner 2026-11-02：不做倒车影像了，还原。删掉的东西：

- **插件**：`mirror.rs`（§37–§68 的镜子取证，41350 B）、`rearcam.rs`（§68 的搬运）、`screens.rs` 里的 survey 调用与 `note_screen`、`d3d.rs` 里为镜子加的 `RSSetViewports` / `RSSetScissorRects` / `DrawIndexed` 三个钩子及其类型、常量、`ORIG_*`、安装项、`Present` 里的 `rearcam::present`、`on_present` 里的 `mirror::on_frame`、`frame.rs` 的后视覆盖（连同为它加的 `version`/`rear` 字段）、`telemetry::in_reverse`、`Cargo.toml` 的 `Win32_System_Diagnostics_Debug` 特性。
- **主进程**：`reversing.rs`（448 行，按档位按玩家自己的相机键）、`keys.rs`（合成按键，只被它用）、`game_settings.rs` 里的 `CAMERAS` / `CameraKeys` / `camera_keys()` / `key_code()` 及两条测试、主循环里的 `reversing.update` 与 `keys::tick`。
- **UI**：`cabin/reverse/`（`ReverseCamera.tsx`、`quiet.ts`、`reverse.ts`、两个测试、`reverse.css`）、`CabinApp` 的挂载与「倒车时音乐降到 15%」，四种语言里的 `reverseCamera` 文案（类型 + en/zh/tr）。

结果：车机屏照旧显示 App，不会再有按档位切游戏相机、倒车卡片、音乐自动压低。`cargo test --workspace` 503 项全过（倒车影像自己带走的测试随之消失）。

### 69.2 哔哩哔哩的鼠标滚轮：不再「顿一下」

§64 的补滚只在**整个手势期间**页面完全没动时才动手，而它的依据是**某一个盒子**的 `scrollTop`。页面滚的是另一个盒子（哔哩哔哩视频页的正文、边滚边长高的容器）时它看不见 → 补滚一次 → 一格滚两下，就是 owner 感到的顿。

这一版（`webapp.js`）：

1. 改成看**任何滚动**：`document` 上捕获 `scroll`（任何元素、任何方式，包括页面自己的平滑动画），页面在 250 ms 内自己滚过，这一格就完全不插手。
2. 自己滚的那一次用 50 ms 时间窗排除，不会把自己当成页面。
3. 页面确实不给滚时，不再等手势结束一次性跳，改成**下一帧就滚**，跟手。
4. 每格的 `elementFromPoint` + `getComputedStyle` 不再跑（§64 量过 0.002 ms/次，不是卡顿主因，但也没必要）。

用真的哔哩哔哩页面（headless Edge，`probe-65-bili-wheel-fix.mjs` / `probe-69-wheel-video.mjs`）量：

| 情形 | 结果 |
|---|---|
| 原生滚轮 + `webAppWheel`（App 的真实顺序），10 格 | **1200 px**（正好 1 倍，无双滚），`stateProbe` 空 = 补滚没插手 |
| 只有原生滚轮，10 格 | 1200 px |
| 只有 `webAppWheel`（页面收不到滚轮），10 格 | **1200 px 且立刻到位**（不再是手势结束后一坨） |
| 单格（最常见） | 120 px |
| 视频页 5 格 | 120 px 每格 |

### 69.3 地图上方居中：距下一次强制休息还剩 XX 小时

- **数据**：SDK 的 `rest.stop`（Time until next rest stop，in-game minutes，就是游戏自己路线顾问在倒数的那个数）。插件订阅它（`SCS_VALUE_TYPE_S32`）→ `Telemetry.rest_stop_minutes` + `rest_stop_known` → 共享内存 → 主进程 → 页面。
- **疲劳模拟开关**：读游戏的 `uset g_fatigue`（档案自己的 `config.cfg`；没有就读游戏目录下那份；都没有按开）。主进程把它用 `{"type":"fatigue","on":…}` 告诉页面，只在变化时发，页面重载时重发。
- **页面**：地图上方居中的胶囊，`text.restLeft(...)`：中文「距下一次强制休息还剩 28 小时」，不足 1 小时显示分钟；`fatigueSimulation` 为假（游戏里关了疲劳模拟）或游戏没给值（`restStopKnown` 假）时**整条不显示**。英文 / 土耳其文同步。
- 桥接块结构变了（多两个字段）→ `BRIDGE_VERSION` **26 → 27**：新旧插件/主程序不会互相读错位置。

### 69.4 交货界面的到达时间 → 订单剩余期限

- 地图下方那粒胶囊（`TripPill`）：有订单时第一个数从「到达时刻 + 到达」换成 **「剩余 28 小时」**（`job.deliveryTime − 现在的游戏时间`，向下取整；不足 1 小时显示分钟），中间「行程时间」和右边「剩余里程」不变；没有订单时照旧显示到达时刻。
- 四种语言里新增 `jobLeft` / `restLeft` / `hoursOnly` 三条文案。

### 69.5 本轮产物

| 项 | 结果 |
|---|---|
| cargo | `cargo test --workspace --exclude westplay-app` **503 通过 / 0 失败**（host 211、plugin 38 等）；`cargo build -p westplay-plugin --release` 无警告 |
| UI | `tsc -b` 通过；`vitest run` **73 文件 / 541 项全过** |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` 10,309,620 B，`678FC16AA36386D30E466685B73E61CC5477683A49969D8BF3CBE3BE5292C6FA` |
| exe | `westplay.exe` 24,562,176 B，`A60FFCDF86E93030FA438CD69944E9EA3230B6624CAD4F34167A4FE790E8E3E1` |
| 插件 dll | 584,192 B，`93536599C3479513658FFED304C553F086117FA72B9E8E033E4E0295B68F931E`（**变了：桥接 26→27，要重启游戏**） |
| `ui/dist` | 72 个文件，已 `robocopy /MIR` 到 `D:\WestPlay\ui`（校验两边同为 72 个） |
| 启动自检 | 装好起进程 20 秒，`app.log` 无 panic，`host: game bridge open` 正常 |
| 两个 zip | `WestPlay-2.1.4-src-full.zip` 661 项 / 8,691,717 B / `B4A1EE7026EC1263886C46739D00ABF461F16D30407A53A59842B15B3470F2F1`；`westplay-mods-src-214.zip` 424 项 / 1,485,417 B / `520BC88BFDC85A6EF70EB4570F48AA6EFD396818BD37396BBF48B70F908C2D64`（这份文档本身也在 zip 里，所以交付的那两个 zip 会差几个字节、哈希必然不同；大小以这里为准） |

---

## 70. 哔哩哔哩的滚轮改成「无极」；交货卡片的「周一 18:18 前到达」→「剩余 XX 小时」

### 70.1 交货卡片（destination widget）左下的那句话

owner 2026-11-02：「我的意思是把交货卡片下方左侧的周一 18:18 前到达改成剩余 XX 小时」——§69.4 改的是地图下方那粒胶囊，改错地方了。

- `ui/src/cabin/dashboard/destination.ts`：交货时 `detail` 的左半从 `text.arriveBy(formatDeadline(…))`（「周一 18:18 前到达」）换成 `text.jobLeft(formatTimeLeft(job.deliveryTime − 游戏时间))`（「剩余 27 小时」）。右半的剩余里程不动；迟了照旧写「已迟到」；取货（未装货）那一屏不动。
- 时长不掺时区：`job.deliveryTime − telemetry.gameTime`，与 `clockShift`（游戏时区）无关；这与「迟到」判定用的是同一个数（游戏自己的时间）。
- `shared/format.ts` 新增 `formatTimeLeft`（≥1 小时给整小时，向下取整；不足 1 小时给分钟），`TimeWords` 多一个 `hoursOnly`。地图上「距下一次强制休息」的胶囊也改用它。
- **§69.4 那处同时撤回**：地图下方胶囊的第一个数恢复成到达时刻（`TripPill` 回到原样），只有交货车片说剩余期限。
- 测试：`destination.test.ts` 的四条断言改成 `4 h left · 214 km` / `24 h left · 214 km`；`format.test.ts` 新增 `formatTimeLeft` 三条（27 h / 59 min / −5 → 0 min）。

### 70.2 哔哩哔哩的滚轮：无极

浏览器滚轮是「一格 120 px」的硬台阶，owner 看着一顿一顿（「改成无极的」）。

- `crates/host/src/webapp.js`：在哔哩哔哩（`location.hostname` 以 `bilibili.com` 结尾）上，页面**自己接管**这一格——捕获阶段 `wheel`、`preventDefault()` 拦住浏览器自己的台阶，把位移记到目标位置，用 `requestAnimationFrame` 每帧走剩下的 30%（约 120 ms 走完），于是多快转都是一条连续的滑动，不是一段一段跳。
- 滚轮在**控件自己手里**的地方不接管：`video`、`.bpx-player-container`、`.bilibili-player`、`[role="slider"]` 之内的滚轮留给它们（播放器音量、进度条）；右 Ctrl + 滚轮（页面放大）也不接管。
- 其它站点一个字没改：页面自己滚，`webAppWheel` 只在「整个手势一点没动」时补一次（§69.2）。
- 宿主每格还会发一条 `webAppWheel`（同一次滚轮）。页面已经自己接过这一格时（400 ms 内收到过真正的 `wheel` 事件），那条消息不再叠加——否则一格滚两次。
- 量（headless Edge + 真的哔哩哔哩首页，`probe-70c-bili-smooth.mjs` / `probe-70d`）：

| 情形 | 结果 |
|---|---|
| 一格（逐帧看） | 0 → 36 → 61 → 79 → 91 → 100 → 106 → 110 → 113 → 115 → 117 → 118 → **119**（连续滑行，不是一跳） |
| 一格 + 40 ms 后同一条消息（App 的真实顺序） | **120**（不是 240） |
| 只给消息（页面收不到滚轮） | 120 |
| 五格、每格隔 60 ms | **600** |
| 十格、每格隔 16 ms（转得很快） | 1016（合并后的滑行；真机手速远低于此） |
| 向上滚一格 | −118 |

（`scrollHeight` 随页面懒加载变化，头和尾差 1–2 px，是页面自己的取整，不是丢位移。）

### 70.3 本轮产物

| 项 | 结果 |
|---|---|
| cargo | 这一版**没动 Rust**：`cargo test --workspace` 上一版 503 通过，`westplay.dll` 与上一版逐字节相同 |
| UI | `tsc -b` 0 错；`vitest run` **73 文件 / 542 项全过**（`format.test.ts` 多三条） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` 10,309,656 B，`79CC7D674203852B21DFD04C682E4844E9EF9C72524C74FCB049F0CE881674B9` |
| exe | `westplay.exe` 24,565,760 B，`C189CFE0DAA0C88D14FF8821D4AFDB12EF502C6ACD78FE1843D93C3DAAD1DE3B` |
| 插件 dll | 584,192 B，`93536599C3479513658FFED304C553F086117FA72B9E8E033E4E0295B68F931E`（**与上一版相同：游戏不用重启**） |
| `ui/dist` | 72 个文件，已 `robocopy /MIR` 到 `D:\WestPlay\ui` |
| 启动自检 | 起进程 18 秒，`app.log` 无 panic |
| 两个 zip | 见下 |

### 70.4 两个 zip

`WestPlay-2.1.4-src-full.zip` 661 项 / 8,698,170 B / `D5333860DE4D248793C9FA962F4CA9F4C37858A36BF31BE4739BF2B56CE25170`；
`westplay-mods-src-214.zip` 424 项 / 1,488,919 B / `4292C9E1929FBEB255226EC3D1E6316A2B9955E4643E853ADFCF3E4917E91D6B`。
（这份文档本身也在 zip 里，交付的那两个会差几个字节、哈希必然不同——以 `D:\West Update` 里那份为准。）

---

## 71. 把「模拟倒车影像」加回来（§69 收得过头了）

owner 2026-11-02：「**还原倒车影像不是给模拟倒车影像也删了，把模拟影像加回来**」。

### 71.1 分清两样东西

| 东西 | 在哪 | 现在 |
|---|---|---|
| **游戏画面那一路**：插件 D3D11 的镜像/倒车相机钩子、相机自动切换、`mirror.rs` 勘察 | 插件 + 宿主 | §69 **撤了**（owner 当时要的就是这个：切相机等于把车机屏也切没了，§39.2） |
| **手绘的模拟影像**：挂 R 时整块屏幕变成一台监视器（§35/§40），以及 §45 的倒车压音量 | 纯界面（`ui/src/cabin/reverse/`） | §69 **误删**，这一轮全部恢复 |

模拟影像本来就不碰游戏、不碰插件：它只是把挡位、车速、方向盘画成一台倒车监视器。

### 71.2 恢复了什么

| 项 | 现在 |
|---|---|
| 挂 R（`displayedGear < 0`，R1/R2） | 整块座舱屏变成监视器，**退出 R 立刻回到原界面**（不重载、不打断） |
| **未连接挂车** → 车尾视角 | 透视路面（1/2/3/5/8/12 m 横线，右侧标米数时改为路外左侧标注）、**红/黄/绿三条辅助带**随方向盘摆（远端摆得比近端多）、两条虚线车道、画面底部车尾保险杠与两盏尾灯 |
| **已连接挂车** → 车顶视角 | 俯视牵引车 + 13 m 挂车 + 五组车轮 + 鞍座、1 m/5 m 米格、挂车尾轴起算的**黄色扫描带**（随方向盘弯）、尾部中线 |
| 顶栏 | 挡位徽标（`R1`）、车速、视角名、挂车名（没挂车写「未连接挂车」） |
| 底部 | 黄字「**倒车时请注意后方安全**」 |
| 音乐 | 进 R 把五个播放器压到 **15%**（0.3 s 淡出/淡回，不写播放器自己的音量，§45），出 R 恢复 |

### 71.3 数字（都是画出来的，但都有出处）

| 量 | 算法 |
|---|---|
| 车尾视角的地面 | `y = 地平线 + 350 / (1 + 0.9d)`，半宽 `nearHalf / (1 + 0.9d)`（§35.3 的透视，这轮只把地平线 210→170、画布 640×480→**960×480**，让画满屏、保险杠不被裁掉） |
| 辅助带摆动 | `swing = 190 · turn · (d / 12)²`：远端摆得比近端多 |
| 三条带的位置 | 红 0.9–1.3 m、黄 1.9–2.3 m、绿 2.9–3.3 m（摄像头的远近色序） |
| 车顶视角的扫描带 | 尾轴起，每 14 px 一步、每步转 `0.03 · turn` 弧度，半宽 23 px，12 步（画布 1000×580，1 m = 20 px） |
| 挡位/车速/方向盘 | 都是游戏送的（`displayedGear` / `speed` / `steering`，§35 起就有） |

### 71.4 改了什么

| 文件 | 作用 |
|---|---|
| `ui/src/cabin/reverse/reverse.ts`（新） | 纯逻辑：`reversing`、`reverseView`、`bend`、`groundAt`、`guides`、`courses`、`roofArc` |
| `ui/src/cabin/reverse/ReverseCamera.tsx`（新） | 监视器页面：两个视角的 SVG、顶栏、黄字 |
| `ui/src/cabin/reverse/reverse.css`（新） | 深色监视器样式，`z-index: 30`（压住座舱页，在光标 40、屏边 50 之下） |
| `ui/src/cabin/reverse/quiet.ts`、`quiet.test.ts`（新） | §45 的倒车压音量：`REVERSING_VOLUME = 0.15`，`quietWhileReversing(players)` |
| `ui/src/cabin/reverse/reverse.test.ts`（新） | 9 个用例：R 判定、视角选择、死区、透视行、三带子对称/摆动、车道、直线弧/弯曲弧/扫描带 |
| `ui/src/cabin/CabinApp.tsx` | 在 `Shell` 的 overlay 里挂 `{powered && <ReverseCamera />}`；`useEffect(() => quietWhileReversing(CAB_PLAYERS), [])` |
| `ui/src/cabin/state/strings.ts` | `reverseCamera`：两个视角名、挂车、黄字（三语） |

**插件、宿主、桥接一个字没改**：这轮只动了 `ui/`。

### 71.5 本轮产物

| 项 | 结果 |
|---|---|
| cargo | 这轮**没动 Rust**：`westplay.dll` 与上一版逐字节相同（584,192 B，`93536599…`），游戏不用重启 |
| UI | `tsc -b` 0 错；`vitest run` **75 文件 / 556 项全过**（新增 `reverse.test.ts` 9、`quiet.test.ts` 5） |
| 安装包 | `WestPlay_2.1.4_x64-setup.exe` 10,313,685 B，`FA7A253B07B921903F8FC5040915BB83E7961BC672C24379CBF645A716B18B32` |
| exe | `westplay.exe` 24,569,856 B，`B947CB7BF2603F557D362082B22A78B75FD7455F1CEF54A365FD2F3BCD169559` |
| `ui/dist` | 72 个文件（`robocopy /MIR` 到 `D:\WestPlay\ui`；`assets` 里能找到 `rev-warning`） |
| 启动自检 | 起进程 18 秒：`app.log` 无 panic，`page: running` |
| 目视 | 无头 Edge 起 dev 版 `cabin.html`，`westplay.live.setState(...)` 截了两张：车尾视角（无挂车、方向左打，红黄绿带随轮摆、米数在路外左侧）与车顶视角（有挂车、方向右打，黄色扫描带从尾轴弯出去） |

### 71.6 两个 zip

`WestPlay-2.1.4-src-full.zip` 667 项 / 8,716,363 B / `E05B983DA5383CEB1E0606BB486157E43928988E9C57AC2A9688E5BAEAA86A8E`；
`westplay-mods-src-214.zip` 430 项 / 1,503,718 B / `F1BF86F492786F46C71C6CC14B1E6280F0867595E61B83DA8972D97477C66E88`。
（这份文档本身也在 zip 里，交付的那两个会差几个字节、哈希必然不同。）

## 72. 哔哩哔哩一格变小；倒车顶栏写「挂车已连接」；红绿灯只认自己那盏；空间音效开关（2026-11-02 晚）

owner 这一轮四条：

1. 「把哔哩哔哩滚轮的每格滚动距离改小」
2. 「根据图片把连接挂车时右上角改成挂车已连接」
3. 「提高一下路口红绿灯识别精确度」
4. 「把 `WestPlay-2.1.4-空间音效开关-快照源码-2026-11-02.zip` 写入声音设置」

### 72.1 哔哩哔哩：一格 60 px（原来 120 px）

§70 已经把那一格从浏览器手里接过来（`preventDefault` + 每帧走 30% 的滑动），但滑多远仍是浏览器给的那个位移：**一格 120 px**。owner 要更小。

`crates/host/src/webapp.js`：

- 新常数 `NOTCH = 0.5`——一格按浏览器的一半走，**60 px**；
- 两处都乘：页面自己的 `wheel` 监听（`dy` 先乘）与宿主 `webAppWheel` 的消息兜底（`glideBy(scrollerFor(…, dy * NOTCH), dy * NOTCH)`），页面收到真滚轮和只收到消息时手感一样；
- 只对 `GLIDES`（`bilibili.com`）生效：监听里第一句 `if (!GLIDES) return`，其它站点走 `applyWheel` 那一支，一个字没动。

嫌大嫌小只动这一个数（0.4 → 一格 48 px，0.6 → 一格 72 px）。

**量过**（`D:\wp-build\probe-72-bili-notch.mjs`，无头 Edge 打开真哔哩哔哩首页，把页面脚本注入进去后逐格派发 `WheelEvent`，一段一段数 `scrollingElement.scrollTop`）：

| 试的 | 结果 |
|---|---|
| 一格 | 59 px（滑到 60，最后一帧取整差 1），逐帧 0→18→31→40→46→50→53→55→57→58→59：**一条滑动，不是一步** |
| 一格 + 40 ms 后宿主同一条消息 | 60（不是 120：同格不叠加） |
| 只给宿主消息 | 60 |
| 连打十格（每 16 ms） | 600（原来 1200） |
| 一格向上 | −58 |
| 视频页，光标压在播放器上 | 没被拦（`prevented: false`，目标 `VIDEO`） |
| 视频页，光标压在正文上 | 拦住了（`prevented: true`） |

### 72.2 倒车顶栏：挂了挂车就写「挂车已连接」

owner 的截图：视角是**车顶**（说明挂了挂车），右上角却写「未连接挂车」。

原因是 §71 那句话直接读挂车的名字：`const named = trailer?.name || trailer?.brand || ''`。游戏**没给挂车名字**时（无牌/自制挂车，或那一栏还没同步），`named` 是空的，于是落回「未连接挂车」——把「有没有挂车」和「挂车叫什么」混成了一件事。

现在分开：

- 有名字写名字；
- 没名字但视角是车顶（`reverseView(live) === 'roof'`，即 `trailerConnected` 为真或挂车 id 在）写**「挂车已连接」**；
- 只有车尾视角（真没挂车）才写「未连接挂车」。

`strings.ts` 的 `reverseCamera` 加 `trailer`：en `Trailer hitched` / zh `挂车已连接` / tr `Dorsey bağlı`。

### 72.3 红绿灯：只认自己那一盏

原来的筛选（§47.1）：距离 2–200 m、车头前方约 35°、横向 ≤ 25 m、有路线时灯要在路线 20 m 内、取最近一盏。三个口子会认错灯：

| 现象 | 原因 |
|---|---|
| 灯色反（我们红、显示绿，或反过来） | 右行路上对向车道的灯就站在**我们左边**，常常比我们这盏更近，取「最近」就取到它 |
| 灯色和读秒来回跳 | 同一路口好几组灯，哪个近显示哪个，车一动就换一盏 |
| 邻路、路口另一侧的灯算成我们的 | 35° / 25 m 太宽 |

改法（`crates/host/src/traffic_lights.rs`）：

- **候选与选择分开**：`light_ahead` 只负责按内存结构收出符合几何的灯（`Candidate { light, ahead, right }`），新 `choose(candidates, previous)` 是**纯函数**挑一盏——可以单测，不用起游戏；
- **右行**：`right >= -1.5 m`（右边那一排）优先；候选里有右边的，左边的（对向的）就不看；一个右边的都没有时才退回最近的那盏；
- **粘住**：上次显示的那盏若还在 8 m 内就继续用它，只有别的灯比它近了 15 m 以上才换——路口内换头不跳变，过了路口换下一盏照常；
- 几何收紧：横向 12 m（原 25）、锥体 `ahead >= d * 0.88`（约 28°，原 0.82）、路线接近 14 m（原 20）；
- `Worker` 记住上一次的灯（`previous`），随每次结果更新。

3 个新单测：右侧优先（左侧那盏更近也不选它）、粘住同一盏、背后的灯不算。

**没做**：灯自己的**朝向**（actor 的旋转）没读——那要在 1.61 上先验一个偏移，验不了就不动内存布局；现在靠左右侧 + 路线，两个方向都够用。

### 72.4 空间音效开关（按快照补丁写入「设置 › 声音」）

owner 给的 `WestPlay-2.1.4-空间音效开关-快照源码-2026-11-02.zip` 是上游 2.1.4 + 一个 403 行的补丁（`docs/spatial-audio-switch/spatial-audio-switch.patch`）。这棵树跟上游差得很远（§1–§71 全在里面），所以**按补丁逐处搬**，没有整文件覆盖。

**宿主**

| 文件 | 改了什么 |
|---|---|
| `crates/host/src/settings.rs` | `SoundSettings` 加 `spatial: bool`；`lenient_on()`——值不合法时回 `true`，别因为一个坏字节把喇叭关掉；`Default` 改成手写（默认**开**，老配置文件升级后声音不变）；两个测试补上 |
| `crates/host/src/lib.rs` | `spatial` 状态；`PageMessage::Spatial { on }` 及其处理；关掉时给播放器的喇叭列表是 `None`（复用上游「未收录车型」的降级路径）；`settings_message()` 带 `"spatial"`；解析与设置消息的测试补上 |

**界面**

| 文件 | 改了什么 |
|---|---|
| `ui/src/shared/host.ts` | `settings` 消息加 `spatial?: boolean`；`HostMessage` 加 `{ type: 'spatial'; on: boolean }` |
| `ui/src/cabin/state/store.ts` | `spatial` 状态（默认 `true`）+ `setSpatial`（发 `{type:'spatial',on}`）；`settings` 处理里 `spatial: message.spatial !== false`（老宿主不说就是开） |
| `ui/src/cabin/apps/settings/SettingsApp.tsx` | 「设置 › 声音」多一块 `SwitchRow`，下面一行说明 |
| `ui/src/cabin/state/strings.ts` | `spatial` / `spatialFooter` 三语（快照只有 en / tr，中文这一版补上） |
| `ui/src/cabin/state/connectHost.test.ts` | 新用例：开关的收与发，且与均衡器互不覆盖 |

**行为**（与快照一致）

- **开**（默认）：和原来一样——喇叭按位置放声（HRTF、距离衰减、分频、延时、响度补偿、限幅）；
- **关**：播放器只拿到 `speakers: None`，信号链变成「媒体元素 → 均衡器 → 隔墙低通 → 输出」；
- **均衡器、频谱、车外隔墙闷音都不受影响**；开关与均衡器各存各的，互不覆盖；
- `crates/host/src/cab_sound.js` **一个字没改**：关掉走的就是它本来就有的降级分支（快照也是这么做的）。

快照里那个 `app/tauri.release.local.json`（跳过更新器签名）**没抄**：我们的安装包一直用 `app/tauri.installer.conf.json`，`createUpdaterArtifacts: false` 早就写在那里。

### 72.5 检查

| 项 | 结果 |
|---|---|
| `cargo test -p westplay-host --lib` | **214 通过 / 0 失败 / 26 忽略**（新增 3 个红绿灯用例、settings 的 spatial 断言） |
| `cargo test -p westplay-plugin --lib` | 38 通过 / 0 失败 / 1 忽略（插件没动） |
| `cargo test -p westplay-shared --lib` | 21 通过 / 0 失败 |
| `node --check crates/host/src/webapp.js` | 通过 |
| `tsc -b` / `vitest run` | 0 错；**75 文件 / 557 项全过**（新增 connectHost 的 spatial 用例） |
| 插件 | `westplay.dll` 584,192 B，`93536599…`（**没动**，游戏不用重启） |
| exe | `westplay.exe` 24,569,856 B，`2EB7591F490F97AE2AF7294FE690B3243E239CAA4835C5C16DF88E327D9799B0` |
| 安装包 | 10,314,070 B，`01784BD89B961A910805BF84BD578652069DFA04A01D353119313E2F4F328061` |
| `ui/dist` | 72 个文件（`robocopy /MIR` 到 `D:\WestPlay\ui`；`cabin-*.js` 里能找到「挂车已连接」「空间音效」） |
| 启动自检 | 起进程 16 秒：`app.log` 无 panic，`window shown` / `page: running` |

### 72.6 本轮的边界

- 滚轮：只改「一格多远」，滑动曲线（每帧 30%、约 120 ms）没动；只对哔哩哔哩生效。
- 倒车顶栏：只有「有挂车但游戏没给名字」改用新文案；有名字时照旧显示名字。
- 红绿灯：仍是只读游戏内存（150 ms 一次），读失败就没有灯；**灯自己的朝向没读**，靠左右侧 + 路线。
- 空间音效：关掉不动均衡器曲线，也不动频谱；开关写进 WestPlay 自己的设置文件，重装保留。

### 72.7 两个 zip

`WestPlay-2.1.4-src-full.zip` 667 项 / 8,730,100 B / `7D74D57AF5760DFCF22A83E236965AAF93A6919366B2E14AF6861F7009273B28`；
`westplay-mods-src-214.zip` 430 项 / 1,511,758 B / `D420532213243A3D106192434758ABA79E97283F5D0EE32E804BD73A248D818C`。
（这两个数里已经含着本节；再把本节写进来之后重打的两个会差几个字节、哈希必然不同——交付的是重打的那一对。）

---

## 73. 退出确认：点窗口的关闭键先问一句（2026-11-02 晚）

owner：「最后给软件加一个退出确认，经常容易误触退出」。问过是哪一处，答：**桌面 WestPlay 窗口右上角的关闭 ×**。

### 73.1 原来是什么样

桌面窗口就是 Tauri 那个窗口（`app/tauri.conf.json` 的 `main`，900×600、不可缩放）。关掉它 Tauri 就退出整个 app（`app.run` → `RunEvent::Exit` → `stop_host`），游戏里的车机屏随之交还卡车原厂界面。窗口的 ×、Alt+F4、任务栏的「关闭」都走这同一条路，中间没有一句话。

别的「退」不在这一条路上，这一轮也没动：卸载（`leavePc`）、更新安装（`install_update` 交给安装程序）、`app.exit`，以及游戏里那颗「交还卡车原厂屏」（那不是退出 app）。

### 73.2 改法

**宿主**（`app/src/main.rs`）

| 东西 | 作用 |
|---|---|
| `Quitting { asked, shown, answered }` | 三个布尔：这一问准了没有、弹窗是不是正开着、这一问有没有过弹窗 |
| `on_window_event` 的 `CloseRequested` | `api.prevent_close()` 拦住，向窗口发 `close-requested`；`asked` 已真时不再拦（放行） |
| `ASK_FALLBACK = 3 s` | 看门狗线程：3 秒内没等到弹窗就照旧关（页面挂了不能变成关不掉） |
| 命令 `quit_app` | 记 `asked`，然后 `app.exit(0)` |
| 命令 `quit_shown` / `quit_hidden` | 弹窗出现了（`shown`/`answered` 置真）/ 弹窗收了（`shown` 置假，下次再点 × 还要问） |

**界面**

| 文件 | 作用 |
|---|---|
| `ui/src/companion/pages/QuitSheet.tsx`（新） | 房间上方一张 `cp-sheet`：「退出 WestPlay？」+ 一句后果 + 「取消」/「退出」（`Button danger`，按下变转圈） |
| `ui/src/companion/Companion.tsx` | 听 `close-requested` → `asking` → 挂 `QuitSheet` |
| `ui/src/companion/pages/words/*.ts` + `index.ts` | 43 种语言的 `quit` 一节（`title`/`text`/`cancel`/`confirm`）；38 个文件直接写，另外 5 个是别名文件（`en_gb`、`fr_ca`、`pl_si`、`sr_sp`、`es_la`）继承 |
| `ui/src/companion/preview.ts` | 预览里 `quit_app` / `quit_shown` / `quit_hidden` 有答案（那里没有窗口可关） |

### 73.3 两个坑（都是实测撞出来的）

1. **`window.close()` 在命令里会把界面卡住**：命令是事件循环里跑的，`window.close()` 也要等同一个循环——「退出」点了、日志也写了 `[quit] the sheet says WestPlay quits`，窗口却还在，按钮一直转圈。改成 `app.exit(0)`（`setup.rs` 的卸载一直这么退出），`RunEvent::Exit` 照旧触发、`stop_host` 照旧收宿主。
2. **看门狗要记「这一问有没有过弹窗」，不能记「弹窗现在还开着」**：否则弹窗开着两秒后按「取消」，3 秒时看门狗看到「没开着」就把 app 关掉。所以另有一个 `answered`（只在新的这一问开始时清掉）。

### 73.4 实测（真窗口；`D:\wp-build\quit-probe3.ps1`：给窗口 PostMessage `WM_CLOSE` + 抓屏 + 鼠标点）

| 动作 | 结果 |
|---|---|
| 点窗口 × | 进程还在，弹窗出现（`quit-13.png`） |
| 弹窗开着等 5 s、等到 40 s | 还在（3 s 看门狗没动它） |
| 点「取消」 | 弹窗消失、回到卡车屏幕页、进程还在（日志 `[quit] the sheet was closed without quitting`） |
| 再点 × → 点「退出」 | 日志 `[quit] the sheet says WestPlay quits`，**进程退出**（这一条原先卡住，见 73.3） |
| 页面加载不出来时点 × | 3 s 后自己关：日志 `[quit] the page didn't answer the close: closing anyway`（兜底，不是确认） |

### 73.5 检查

| 项 | 结果 |
|---|---|
| cargo test | `cargo test --workspace --exclude westplay-app` **全过**（host 214、plugin 38/1、shared 21、setup 70/9、mapdata 163） |
| UI | `tsc -b` 0 错；`vitest run` **75 文件 / 557 项**（`words.test.ts` 把 43 种语言的 `quit` 一节也查了） |
| 插件 | 没动：584,192 B，`93536599…`（游戏不用重启） |
| exe / 安装包 | 24,577,536 B `6412EF8F92EBB606F64E4A4D16DEAE07F0C896A713D2C6B21E7FA30D24A514AC` / 10,313,521 B `EE5844C9748BA5F8E343DD0AF45FC31B7DE9216D7703360D57D0332F95863478` |
| `ui/dist` | 72 个文件，`companion-CypVA6rd.js` 918,550 B（弹窗在这个包里） |
| 实机 | 上面 73.4 那张表就是这一版 exe 跑的；owner 也确认「退出确认功能正常」 |

### 73.6 边界

- **只有窗口的关闭**走这条路。Alt+F4 和任务栏「关闭」也是同一条 `CloseRequested`，所以一样会问。
- 弹窗开着时再点 × **什么都不做**（不会连点两次就退出）。
- 页面 3 秒不回应就照旧关：这是兜底——页面挂了（WebView2 崩、`ui/dist` 坏）时窗口还能关掉。
- 没有「退出」热键，游戏里的车机屏也关不掉 app。
- **首次引导（onboarding）那一段没有这张弹窗**：它是早返回的另一套界面，弹窗挂在房间那一层。那一段点 × 不弹、3 秒后照旧关（看门狗）——引导中途关窗口本来就是「不想装」，不算误触。

### 73.7 构建上的一条（这一轮又踩了一次）

`westplay.exe` **只能由 `tauri build` 产出**：直接 `cargo build --release` 出来的是 **dev 模式** exe，窗口打开 `http://localhost:5173`，页面上是「无法访问此页面 ERR_CONNECTION_REFUSED」，于是所有命令都调不到（这一次的表现就是「点了 × 3 秒后自己关了」+「退出键转圈」）。`HANDOVER-BUILD.md` §12 早就写着这一条（2026-11-01 踩过），这次是重踩。

### 73.8 两个 zip

`WestPlay-2.1.4-src-full.zip` 668 项 / 8,747,116 B / `92ECBB488A542DC3A646421CF40945391605A3D2693F4FD876C00A8896884004`；
`westplay-mods-src-214.zip` 431 项 / 1,523,798 B / `B91EF192D2402F3FC2AE5B33C1241E43955DA09048D0B82A955D8D4953F24313`。
（这两个数里已经含着本节；把本节写进来之后重打的那一对会差几个字节、哈希必然不同——交付的是重打的那一对。）

---

## 74. 地球键：键面写「中/英/土」，按一下中 → 英 → 土（2026-11-02 夜）

owner：「把地球键按语言顺序改成中/英/土」；追问一句确认样子，答：**键面写「中/英/土」，按一下换下一个**。

### 74.1 原来是什么样

- 键面上只有一个地球图标（`globe.glyph` 的 `GlobeGlyph`），看不出它管三种语言、也看不出此刻在哪一种。
- 顺序是 `['en', 'zh', 'tr']`：从中文按两下才到英文。

### 74.2 改法

| 文件 | 改了什么 |
|---|---|
| `layouts.ts` | `KEYBOARD_LANGUAGES = ['zh', 'en', 'tr']` —— 中 → 英 → 土 → 中；注释里写明这是 owner 的取舍（游戏是英文的玩家现在要按两下才到中文，原来是按一下） |
| `Keyboard.tsx` | 地球键不再画 `GlobeGlyph`，改画 `<Languages>`：`中 / 英 / 土` 三个字，**当前那个白、另外两个 40% 透明**；`SHORT = { zh: '中', en: '英', tr: '土' }`；`aria-label` 仍是「下一个键盘」 |
| `keyboard.css` | `.key.fn .key-tri`：16 px / 650、单行不换行；斜杠 40% 透明、左右各 1 px |
| 测试 | `layouts.test.ts`（中→英→土，三下一圈）、`ime.test.ts`（中文按一下到英文、再一下土耳其、再一下回中文）、`store.test.ts`、`editing.test.ts`（从土耳其按一下到中文，QWERTY 的 `i` 是大写 I；从中文按两下到土耳其，`i` 是 `İ`） |

尺寸：座舱键盘一行 10 格、一格约 106 px；三个字加两条斜杠约 58 px，左右各留 20 多 px。

### 74.3 实测

- `vitest run` **75 文件 / 557 项**全过；`tsc -b` 0 错。
- 键面用**真机 CSS** 在 Edge 无头里渲染过（`D:\wp-build\keyface5.html` → `key-tri6.png`）：106 px 的键放得下、不换行、当前语言一眼能看出来（`地球键-2026-11-02.png` 就是那张）。
- 座舱页由宿主从 `D:\WestPlay\ui` 现读（`https://westplay.cabin/` 的虚拟主机），换 `ui/dist` 后重开 WestPlay 即生效——**游戏不用重启**。

### 74.4 边界

- 三个字**固定是中文**（中 / 英 / 土），不随界面语言变：owner 指定的写法。以后要随语言变，得把这几个字进词库（`words.ts` 的 `keyboard` 一节）。
- 地球图标不再出现；读屏念的仍是「下一个键盘」。
- 顺序只改键盘自己的循环；「游戏语言 → 键盘初始语言」那条路（`languageOf`：tr 开头 → tr，en 开头 → en，其余 → zh）没动。
- 数字层和符号层上这颗键也是「中/英/土」，一样按一下换一种。

### 74.5 产物

| 项 | 值 |
|---|---|
| exe | `24,577,536 B` / `391784CF3001A478CAAEE7A62AE26E8A6525E2D17091BB01FE7384E3F0172616`（已部署） |
| 安装包 | `10,317,433 B` / `E0529182A116FD1D3B302E0825E77004EF1EB2B7FB6B300793C83583AF143371` |
| 插件 dll | 没动：`584,192 B` / `93536599…`（游戏不用重启） |
| `ui/dist` | 72 个文件，`cabin-*.css` 里 `.key-tri` 三条规则、`cabin-*.js` 里有 `中`/`英`/`土` |

### 74.6 两个 zip

`WestPlay-2.1.4-src-full.zip` 668 项 / 8,751,585 B / `FDF6BF4356066F6EA08D400ADCADCED379B2144C897B28A846FBE652111C6B21`；
`westplay-mods-src-214.zip` 431 项 / 1,526,341 B / `204E57C33809842D1929C0457BB2B8DC3B077C4A35DC26AAEA15F99A78F3196E`。
（这两个数取代 §73.8 的那一对；把本节写进去之后重打的一对会差几个字节——交付的是重打的那一对。）

---

## 75. 插件 dll 进安装包；强制休息提示的浅色模式（2026-11-02 夜）

owner：「@D:\WestPlay\westplay.dll 给 dll 合并了，让安装时的 dll 就是新版的，然后给强制休息提示适配浅色模式」。

### 75.1 安装时的 dll 就是这一版

原来的链条（没改代码，只是核对并重打）：`app/tauri.installer.conf.json` 的 `bundle.resources` 把
`../target/release/westplay.dll` 映射成安装目录里的 `westplay.dll`；运行时 `app/src/setup.rs` 的
`plugin_file()` 在发布版里取的就是「exe 旁边那份」，`crates/setup/src/plugin.rs` 再把它写进游戏的
`bin/win_x64/plugins/`。所以只要打包前 `target/release/westplay.dll` 是这一版，装出来的就是这一版。

核对的办法不是看代码，是**真装一遍**：

| 步骤 | 结果 |
|---|---|
| 把 `D:\WestPlay\westplay.dll`（`93536599…`）放回 `target/release/` 再重打安装包 | — |
| `setup.exe /S /D=D:\wp-build\install-test` 静默装到临时目录 | 退出码 0 |
| 看装出来的文件 | `westplay.exe` 24,577,536 B、`westplay.dll` **584,192 B / `93536599…`**、`ui/` 齐全 |
| `uninstall.exe /S` 卸掉、删目录 | 干净（临时目录已不存在） |

插件本身没改：`westplay.dll` 与部署前逐字节相同（`93536599…`），**游戏不用重启**（游戏里那份也是这个）。

### 75.2 强制休息提示的浅色模式

- **症状**：浅色壁纸/浅色地图下，地图上方那粒「距下一次强制休息还剩 28 小时」是一块半透明深色底 + 白字，
  压在白底地图上发灰、字也发虚。
- **根因**：`.rest-pill` 只写了一套配色（`color: #fff; background: rgb(20 22 26 / .55)`），没有
  `.appearance-light` 的覆盖；旁边的目的地胶囊 `.eta-pill` 早就有（`#14161a` on `rgb(255 255 255 / .72)`），
  休息这粒是 §69 加的时候漏的。
- **改法**：`map.css` 里照着目的地胶囊补一条

  ```css
  .appearance-light .rest-pill {
    color: #14161a;
    background: rgb(255 255 255 / 0.72);
  }
  ```

- **实测**：拿打包出来的真 CSS，在无头 Edge 里把两套都渲染了一遍（`D:\wp-build\rest.html` →
  `rest-pill.png`）：深色壁纸是白字深底、浅色壁纸是深字浅底，两套都清楚。

### 75.3 检查

- `tsc -b` 0 错；`vitest run` 75 文件 / 557 项全过（这次没动逻辑，只加了一条 CSS）。
- 座舱页由宿主从 `D:\WestPlay\ui` 现读，重开 WestPlay 即生效；游戏里的那份插件没动。

### 75.4 产物

| 项 | 值 |
|---|---|
| exe | `24,577,536 B` / `DCF6E5D68322409BB77D6563B8225283FE4BB52E371FF5EBAD6444C980326A7C`（已部署） |
| 安装包 | `10,317,392 B` / `62B6706447B29081ED2964F8640334F654E4DF94EE0AD8D7890998185FA5B3E6`（静默安装核对过：里面 `westplay.dll` = `93536599…`） |
| 插件 dll | `584,192 B` / `93536599C3479513658FFED304C553F086117FA72B9E8E033E4E0295B68F931E`（没变；游戏里那份相同，不用重启） |
| `ui/dist` | 72 个文件（新的 `cabin-*.css` 里带 `.appearance-light .rest-pill`） |

### 75.5 两个 zip

`WestPlay-2.1.4-src-full.zip` 670 项 / 8,760,511 B / `D2A101EF45FD81F4DFD09FE51F7A14807818C6F5982C1D69689F1766FE8E0003`；
`westplay-mods-src-214.zip` 432 项 / 1,530,364 B / `A11004EBFD725708EB0DF39BE2927CA12C3F48A4AB5635384BE544B203114CB6`。
（把本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。）

---

## 76. 两个增量包合入；酷狗音乐（2026-11-03）

owner：「@…WestPlay-slot-douyin-20261103.zip @…WestPlay-incremental-2026-11-03-v2.zip 给这两个增量包合入
当前版本，顺带加上酷狗音乐webapp，记得适配已有功能；不要忘了每次改动安装包的时候写入新的dll」。

两个包的形态完全不同，合入的办法也不同：

| 包 | 里面是什么 | 怎么合 |
|---|---|---|
| `WestPlay-slot-douyin-20261103.zip` | 一份《可移植指南》加 12 个**源码文件**（他们树的样子） | 照指南逐处贴进我们的源码（不改他们给的整文件） |
| `WestPlay-incremental-2026-11-03-v2.zip` | 三个**运行时 DOM 脚本** + 一份打过补丁的**压缩过 bundle**（对着我们 22:02 那一版做的） | 三件事改成 **React 源码**重写；bundle 补丁不搬（我们的倒车相机是源码画的），分屏做成源码里的 5 种视角 |

### 76.1 抖音（A 包）

槽位、图标（`douyin.light/dark.svg`，指南带的）、三种语言的 `apps.douyin`、`AppScreen` 的 `case 'douyin'`、
`WebAppSite`、`SITE_NAMES`、`APP_OF_SITE`、宿主 `Site::Douyin`（首页地址、profile、日志名、名字、id、`clean_title`）、
`webapp.js` 的 `douyin()`（读 `<video>`、`document.title` 去掉尾巴、`poster`/`og:image` 当封面）与 `own` 链里的一环。
`apps.test.ts` 的 Home 顺序跟着改。**抖音的页面在嵌入的 WebView2 里可能先显示它自己的登录/校验页**（headless
探过：桌面版首页只出加载动画），登录后照常放。

### 76.2 酷狗音乐（owner 新加的）

同一套槽位：`kugou`、`kugou.light/dark.svg`（自己画的蓝底音符卡片，1024 画布、圆角 232，跟邻居一致）、三种语言
的名字、宿主 `Site::Kugou`（`https://www.kugou.com/`、`webview2-kugou`、`kugou`、`Kugou Music`）、`webapp.js` 不写
专门的读取器：酷狗的播放页走标准 Media Session / 单个 `<audio>`，通用那条路就够（`own` 链旁写了这一句）。
headless 探过首页正常出内容，不需要登录才能看。

### 76.3 B 包的三件（源码实现）

1. **到达推荐卡片**（`dashboard/arrival.ts` + `ArrivalCard.tsx`）：到路线最后 1 km 且 |车速| ≤ 30 m/s，或刚交付
   （任务从「进行中且已装货」变没有）时，在右下角按状态推一个最近的地点——`fuelRange < 250` 找加油站、任一磨损
   > 0.30 找维修站、`restStopMinutes < 180` 找停车/酒店、没任务找货场；30 km 内没有再退到 100 km 列表；推荐的就是
   目的地（或 250 m 内）时列出 10 km 内同类全部。点一行 `changeRoute('go', node)` 交给游戏自己的 GPS。位置
   `right:22px; bottom:240px`（短屏 176），不压地图控件。
2. **顶部滚动条**（`RestTicker.tsx`）：原来那条「距下一次强制休息还剩…」升级成一条轮播——休息倒计时、油量与续航、
   最大磨损、限速与车速、交货剩余，每 3 秒换一条、350 ms 滑入；只有一条时不动；倒车页隐藏；盒子仍是 `.rest-pill`
   （§75 的浅色规则继续管用），宽度 340–520 之间按文字自适应。
3. **倒车 5 种视角**（`reverse/layout.ts` + `ReverseCamera.tsx`）：`both`（车尾+车顶并排，默认）/`rear`/`roof`/
   `rearPip`（车尾大，车顶小窗）/`roofPip`，存在 `localStorage['westplay.reverseLayout']`，倒车页右上角齿轮里选；
   分屏、小窗全部由源码画的两个视图拼，不再需要动压缩 bundle。

### 76.4 与已有功能的相处

- **浅色模式**：滚动条沿用 `.rest-pill`，§75 的 `.appearance-light .rest-pill` 直接生效；卡片另有
  `.appearance-light .arrival-card`（深字浅底）。两套都用真 CSS 在无头 Edge 里渲染核对过（`final76b.png`）。
- **滚动条的裁剪**：第一版用「固定一个行高的窗口 + 平移整列」，结果上一行/下一行的字从胶囊的 padding 里透出来，
  改成「只渲染当前那一行、每步换 key 播一次滑入动画」——没有裁剪窗口，也就没有透字。
- **宽度**：第一版 `clamp(340px, 40vw, 520px)` 在窄一点的屏上把「油量 412 L · 还能跑 780 km」截成省略号；改成
  `max-content` + `min-width:340px` + `max-width:min(520px, 100%-44px)`，文字短就窄、长就宽到 520。
- **倒车**：§69/§71 画的监视器原样保留，只是从「有挂车就车顶、没有就车尾」变成玩家自己选；`reverseView()` 仍在
  （`reverse.test.ts` 还测它），相机不再调用它。
- **键盘/输入法/退出确认**：没动。宿主 `webapp.js` 的改动只在站点识别，键盘与 `input` 的管线不动。

**没并进来的**（B 包里对已发布 bundle 的样式 hack）：搜索按钮挪到右上角、蓝框 `zoom:.75; width:400px`、原生休息条
`visibility:hidden !important`、搜索面板 z-index。这些是那位作者对自己那版布局的补丁；我们源码里搜索按钮与蓝框本来
就在自己的位置、休息条也已经被滚动条取代，硬搬 `!important` 会跟现有布局打架。要一模一样的话再说，一行 CSS 的事。
**也没并** `docs/EVENT-TICKER.md`：那套罚款/撞车滚动提示靠 TruckyTelemetry 的本地 WebSocket，我们的插件没有这些
事件，属于另一件事。

### 76.5 检查

- `tsc -b` 0 错；`vitest run` **77 文件 / 567 项**全过（新增 `layout.test.ts` 4 项、`arrival.test.ts` 6 项）。
- `cargo test -p westplay-host` **214 通过 / 26 忽略**（`webapp::` 7 项，含 `Site::Douyin`/`Kugou` 的往返与命令解析）；
  `node --check crates/host/src/webapp.js` 通过。
- 实机：装好后启动，`app.log` 无 page 错误，`page: running` 正常。

### 76.6 产物（安装包里的 dll 每次都核对）

| 项 | 值 |
|---|---|
| exe | `24,581,632 B` / `4642342CF9FE85091865471D17F2BD3B8AAB92D47BC31DBF4B7BA4E7D286FD57`（已部署、已重启） |
| 安装包 | `10,324,353 B` / `E0B6A622EF53929E07FB10EDE37CDCE93AE78D3E1080440B08CD987F39F44AFB` |
| 安装包核对 | `setup.exe /S /D=临时目录` 静默装一遍：`westplay.dll` = **`93536599…`（584,192 B）**、`ui/` 76 个文件、`cabin-*.css` 里有 `arrival-card`；`uninstall.exe /S` 卸干净 |
| 插件 dll | `584,192 B` / `93536599C3479513658FFED304C553F086117FA72B9E8E033E4E0295B68F931E`（这一轮插件源码没动，重编出来仍是它；游戏里那份相同，不用重启） |
| `ui/dist` | 76 个文件（4 个新图标、新的 `cabin-*.css`/`cabin-*.js`） |

### 76.7 两个 zip

`WestPlay-2.1.4-src-full.zip` 682 项 / 8,792,010 B / `C2BE6ECF24AC7F68CEE418307BB7C5A0FF0508905811A5166E523ED2C2CC54D0`；
`westplay-mods-src-214.zip` 443 项 / 1,555,179 B / `726BA453FE83968A5F704AFBF5840E27C1C80BC52E4A32237EE6C5C9701F3402`。
（把本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。）

---

## 77. 酷狗接进车机；抖音的封面；几处文案（2026-11-03）

owner 在 §76 装好后试了一圈：「酷狗音乐界面显示有问题，露出了原版导航；酷狗音乐没有适配首页的大歌词页、首页媒体卡片、
快捷键控制和卡片的切歌按钮；抖音没有适配首页的封面和标题显示。退出确认下面的描述改成『确认后，WestPlay 程序将会关闭』；
移除首页上方三条滚动信息中的磨损，再将燃油显示改为『油量 XXX 升，剩余行驶里程 XX 公里』；最后把倒车影像中的视角设置
的前两个改为后置视角和俯视视角」。

### 77.1 酷狗音乐：页面露出游戏画面

**症状**：酷狗页面的右边被裁掉一截，右边/边上透出车机原来的画面（游戏自己的导航屏）。

**根因**：两件事叠在一起。

1. 孔是**透的**：车机页面在应用的位置挖一个洞，洞里的内容就是 WebView 里那个网页。酷狗的首页只给 `body` 铺了底色，
   `html` 还是浏览器默认的透明，于是「页面没画到的地方」直接透出游戏画面。
2. 酷狗是**定宽布局**（整页按 1200 px 排），而我们的缩放按「页面自己报的宽度」算：它的 `scrollWidth` 被自己的
   `overflow: hidden` 夹成了视口宽，报回来的「需要多宽」等于「有多宽」，缩放就一直是 1.0，页面右边被裁在视口外。

**改法**（`crates/host/src/webapp.js`）：

- 每个页面进来都给根元素补上底色：`html` 若是透明，取 `body` 自己的颜色，没有就白；每 2 秒看一次，站点自己重画页面后
  也补得上。这样洞里再没有「没画到的地方」。
- 量宽度不再只看 `scrollWidth`：还把 `body` 往下两层的盒子的右边缘一并算进去（排掉 `position: fixed` 和宽得不合常理
  的横幅轨道），定宽外壳也能被量到，缩放随之把它缩进洞里。每 2.5 秒重报一次，缩放是会收敛的。

**验证**：`node --check` 通过；headless 量过酷狗首页与单曲页的 DOM 结构（`#songName`、`.singerName`、`.bar-albumImg`、
`#prev/#toggle/#next`、`audio#myAudio` 都在）。**这一条要请 owner 再看一眼**——我这边看不到车机画面，如果还露，请发一张
截图，我按那张再收窄。

### 77.2 酷狗音乐：播放卡片、大歌词页、快捷键、切歌

**根因**：酷狗页面的播放信息不在 Media Session 里（它是 `none`），`<audio>` 元素也没有任何元数据，通用那条路读不到
歌名/歌手/封面，于是车机认为「这个页面没在放东西」——卡片是空的，快捷键与卡片的切歌也就没有对象。

**改法**：给酷狗写一个读它自己播放条的读取器（跟 QQ 音乐/网易云/蜻蜓同一层）：

- 歌名 `#songName`（占位的「酷狗音乐」不算），歌手 `.singerName`（去掉开头的「歌手：」），封面 `.bar-albumImg img`，
  是否在放看 `#toggle` 的类（`icon-playbar-pause` 是在放）。
- 播放条还没填东西时，退回页面标题：`寻诀_铁痕电台…_高音质在线试听_酷狗音乐` 拆成歌名与歌手。
- 传送键按它自己的 id 点：`#prev` / `#toggle` / `#next`（它的图标一个字都没有，只靠类名认，之前认不到）。
- 歌词：它自己的歌词面板每行一个 `<p>`，时间表在页面自己的 `window.play.globalParam.wordArr`（毫秒）里，两边对得上
  （行数够、时间递增）才用，对不上就不报——宁可没有歌词，也不给错位的。
- 宿主这边 `clean_title` 也收一下它的标题：`寻诀_铁痕电台…_高音质在线试听_…` → `寻诀 · 铁痕电台…`，首页标题
  `酷狗音乐 - 就是歌多！…` → `酷狗音乐`。

### 77.3 抖音：封面与标题

**根因**：抖音的推荐页标题只有站点自己的名字（「抖音精选电脑版」），`<video>` 没有 `poster`，页面也没有 `og:image`，
所以卡片上既没有标题也没有封面。

**改法**：标题先看页面自己的标题（单条视频的页面会写上是哪一条），不是就用播放器旁边画出来的文案；作者从
`[data-e2e="video-author"]` 或用户链接里读；封面先看 `poster`/`og:image`，都没有就**把视频当前这一帧画到
canvas 上**（320 px 宽、JPEG，每一条只画一次，按 `currentSrc` 记住，最多留 8 张）当封面。跨域画不了会抛异常，接住就是没有。

### 77.4 退出确认的文案

`ui/src/companion/pages/words/{zh_cn,zh_tw,en_us,tr_tr}.ts` 的 `quit.text`：
「确认后，WestPlay 程序将会关闭。」/「確認後，WestPlay 程式將會關閉。」/「WestPlay will close once you confirm.」/
「Onayladığınızda WestPlay kapanacak.」。其余约 40 个语种仍是原来那句长话（不在这次的范围里），要一起换说一声。

### 77.5 顶部滚动条：去磨损、换油量说法

- 去掉磨损那一行（`ticker.wear` 从接口与三种语言里都删掉）。
- 油量一行改成「油量 412 升，剩余行驶里程 780 公里」/「Fuel 412 L, 780 km to go」/「Yakıt 412 L, 780 km yol」。
- 行序仍是 休息 → 油量 → 限速/车速 → 交货。宽度上一轮已改成按文字自适应（340–520），这行长句在 900 px 宽的车机上是
  一次放得下的（渲染核对过）。

### 77.6 倒车视角的两个名字

「只要车尾」→「后置视角」，「只要车顶」→「俯视视角」，菜单与监视器顶栏用的是同一对词（`reverseCamera.rear/roof` 与
`layoutRear/layoutRoof` 一起改）；「车尾 + 车顶」与两个小窗的名字不动。

### 77.7 检查与产物

- `tsc -b` 0 错；`vitest run` **77 文件 / 567 项**全过；`cargo test -p westplay-host` **215 通过 / 26 忽略**
  （新增一条 `kugou_titles_keep_the_song_and_its_singers`）；`node --check crates/host/src/webapp.js` 通过。
- exe `24,588,800 B` / `D5DCC10F985BA24CA71F28D70781B45311BFCEBF4825A2B201AE0F38546F4EC0`（已部署、已重启）。
- 安装包 `10,323,300 B` / `FA77D0D55DC7C15E203E03345D99CE175FE4A79DF45A53BA7A0DBCE98CF599C0`；**静默装过核对**：
  `westplay.dll` = `93536599…`（584,192 B）、`ui/` 里 `cabin-*.js` 带 `kugou`、`uninstall /S` 卸干净。
### 77.8 两个 zip

`WestPlay-2.1.4-src-full.zip` 682 项 / 8,803,512 B / `EC1A690D552C3E24F67B09A6479282B0807337D4D7DAC9672F75EF067F8525B2`；
`westplay-mods-src-214.zip` 443 项 / 1,561,955 B / `21C25444F00A9D9D15990FFB38298AE3B4BCE5AE8F4FFB7CC0DF462C15916390`。
（把本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。）

- 插件 dll 这一轮没动：`584,192 B` / `93536599C3479513658FFED304C553F086117FA72B9E8E033E4E0295B68F931E`（游戏里那份相同，
  不用重启游戏）。

---

## 78. 酷狗的大歌词页；输入法；两个图标；油量措辞（2026-11-03 晚）

owner 看过 §77 之后：「让酷狗音乐适配这个大歌词页，然后现在每点开一个应用就会打开输入法，改成点击搜索框时弹出输入法，
最后给酷狗音乐和抖音的图标改成图2和3并把燃油显示改成油量xxx升，剩余里程xxx公里」；另外问「酷狗有没有适配断电暂停和上电续播」。

### 78.1 酷狗的大歌词页

**症状**：酷狗放着歌，进歌词页没有词（网易云那边是有词的）。

**根因**：酷狗把整段 LRC 交给自己播放器（`play.globalParam.word`），歌词面板是**从这段文字画出来的**——画的时候把每行的
时间戳丢掉了，所以读面板 `<p>`（§77 的做法）拿不到时间；而它取歌词的那个接口（`play/getdata`）在 §77 里也没被监听。

**改法**（`crates/host/src/webapp.js`）：

1. 先读它播放器手里的那段 LRC（`window.play.globalParam.word`），时间戳齐全，直接用。
2. 再补两条兜底：`looksLikeSong` 加上 `play/getdata`，并且**任何**「歌曲信息」响应里若带得出一段 LRC，就把它当歌词
   （`tookSong` 开头用现成的 `readLrc`）；以及原来的面板 + `wordArr` 组合（时间对得上才用）。
3. 顺带修掉 §77 引进的一个错：**酷狗首页/搜索页的标题被当成了歌名**（日志里 `[kugou] playing: 酷狗音乐 - 就是歌多！…`）。
   现在只认歌名页（`/mixsong/`、`/song/`）的标题，歌名优先取它页面自己的记录 `window.dataFromSmarty[0]`
   （`song_name`、`author_name`），所以卡片上是「寻诀 — 铁痕电台-MSR、Kkoori、钱润玉Runyu」这样的两截，不再是
   「铁痕电台… - 寻诀 (Guided by Echoes)」一整串。

**验证**：日志里现在读到的是 `[kugou] playing: 铁痕电台-MSR、Kkoori、钱润玉Runyu - 寻诀 (Guided by Echoes) — 铁痕电台…`
（§77 那一版），§78 之后应变成歌名与歌手分开；歌词走的是 LRC 直读，这条路不依赖站点的 DOM 结构。

### 78.2 开应用不再弹输入法

**症状**：每点开一个网页应用，车机的输入法就自己升起来。

**根因**：页面一加载，站点自己把焦点放进它的搜索框（酷狗首页就是），页面把「有输入框拿到焦点」报给宿主，输入法就跟着
起来——不是玩家要打字。

**改法**：页面里记住「玩家动过没有」（`acted`：按下、按键、触摸、滚轮都算），**焦点是页面自己放的就不报**；玩家点过的
焦点照旧报（点搜索框 → 输入法升起，正是想要的）。手点一下之后 `acted` 一直为真，后面站点自己弹搜索框也照常报。

**边界**：页面自己把光标放进搜索框时，我们只是不升输入法，不抢它的焦点（站点的补全提示照旧）；玩家点那个框，或点任何
按钮后站点再弹框，都会升起来。地图搜索框的「一打开就选字」是另一回事（`selectOnShow`），没动。

### 78.3 图标

- **酷狗**：照图2 画成矢量的——`#2d92fd` 圆角方块、白色圆环、白色粗 K（`kugou.{light,dark}.svg`，401 B）。
- **抖音**：把图3（1080 px 那张）缩到 512 px 嵌进 SVG（`douyin.{light,dark}.svg`，49 KB），原图的透明圆角原样保留。
- 两种壁纸下都渲染核对过：40 px 的坞里和 64 px 的大图标都清楚。

### 78.4 油量措辞

`ticker.fuel` 三种语言：「油量 412 升，剩余里程 780 公里」/「Fuel 412 L, 780 km left」/「Yakıt 412 L, 780 km kaldı」。
（§77 写的是「剩余行驶里程」，按这次的说法收短。）

### 78.5 断电暂停、上电续播：站点无关，酷狗已经在内

核对了 `ui/src/cabin/apps/web/pauseWithPower.ts`：它订阅车机的 `power.phase`，断电那一下对当前站点发 `playPause`，
上电再发一次；唯一被排除的是 Bilibili（`playsOnWithPower`）。这条规则不知道「是哪个站点」，所以**酷狗自动算在内**——它需要
的两件事（页面报「在放」、`playPause` 能按到它的播放键）正是 §77 补上的：日志里 `Kugou Music the card says next` 证明
按键链路是通的。这次补了一条测试把「酷狗/抖音上电续播」钉住（`pauseWithPower.test.ts`），日志里断电时会看到
`web app paused with the electrics: kugou`、上电 `web app with the electrics back: kugou plays on`。

**边界**：它和我们一样靠「点一下播放键」，站点若在断电期间自己把播放器重置到别的歌，续播的是它当时那首。

### 78.6 检查与产物

- `tsc -b` 0 错；`vitest` **77 文件 / 568 项**全过（新增 1 条）；`cargo test -p westplay-host` **215 通过 / 26 忽略**；
  `node --check crates/host/src/webapp.js` 通过。
- exe `24,627,712 B` / `C8E3D3AAC2CA72D574C0BB5861ED2CC86BFBC50274C1FCE03209736D35860065`（已部署、已重启）。
- 安装包 `10,396,515 B` / `CE5B06DA5D9FCE1825DA6C4585B5D4CBED1043E7C2E5DFF7511C0C0C472342FA`；静默装过核对：
  `westplay.dll` = `93536599…`（584,192 B）、`ui/icons/westplay/` 里两个新图标在（401 B / 49,124 B）、
  `cabin-*.js` 带「剩余里程」、`uninstall /S` 卸干净。
### 78.7 两个 zip

`WestPlay-2.1.4-src-full.zip` 682 项 / 8,883,345 B / `F9FF07930A1F91B15490EFCD9BD70F27D53189CDF32A8B37DEC2A0767ABDE872`；
`westplay-mods-src-214.zip` 443 项 / 1,638,222 B / `24A00261A7015BB93854076F3FC8743166E0394938030A86EB3B1309FF7318BD`。
（本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。）

- 插件 dll 仍未动（`93536599…`），游戏不用重启。

---

## 79. 大歌词页的根因；输入法第二次修（2026-11-03 深夜）

owner：「酷狗音乐适配歌词页是指如图所示的功能，还有不要再让app每次打开都弹出输入法了」。图上那个是**首页的媒体卡片 + 歌词**
（网易云那首整段英文词），不是站点自己的歌词页——所以目标一直是「卡片上的词」，两条路都在这条线上。

### 79.1 为什么 §78 之后酷狗还是没词

**根因**（读 `say()` 才看出来）：歌词只在**换歌的那一下**读一次——

```js
if (key !== wordsFor) { wordsFor = key; lyrics = []; …它的词… }
```

而酷狗的词是它**晚一步**才交到自己播放器里的（`play.globalParam.word` 在歌曲信息返回之后才赋值）。换歌那一瞬间读到的是空，
`wordsFor` 已经是新歌了，之后再没有第二次机会 → 一直没词。`play/songinfo` 的响应钩子也给不出救：换歌时 `lyrics = []`
会把钩子刚放进去的词清掉。

**改法**：酷狗的词改成**每趟都读**（`kugouWords()` 按「歌名 + 页面记录 + 音频地址」缓存，只缓存**读到了**的结果，读到空就下一趟
再试），并且换歌时不再清空钩子放进来的词。顺带加了 `lyricProbe` 日志：读到词时日志里会出现
`webapp: lyricProbe: kugou: 41 lines, at 12s`，下次有问题一眼就能定位。

### 79.2 输入法：还有两条漏路

§78 只把 `focusin` 挡住了，另外两条漏着：

1. **页面里随便一点也报焦点**：`pointerdown` 里是「只要有个输入框还带着焦点就上报」——站点自己的搜索框在页面加载时抢到焦点后，
   你在页面里点任何地方（开始放歌、切歌）都会把输入法叫起来。
2. **站点在第一次点击之后才抢焦点**：加载时那条被 `acted` 挡住了，但玩家点过一下之后 `acted` 就是真，站点再抢焦点就照样上报。

**改法**：

- 按下只在**落在输入框（或站点的搜索框容器）里**才算「玩家要打字」；按在别处不上报。
- `focusin` 时：键盘本来就在打字（`typing`）→ 照旧；上一次按下落在输入框且 1.2 秒内 → 是这个框，上报；否则就是**页面自己抢的**，
  把这个焦点**退回去**（`blur()`）——输入法不升，站点自己的候选条也不会挂在那儿。
- 页面 `load` 之后 600 ms 再兜一次：没人按过就把页面自己抢到的焦点退掉。

### 79.3 这次的验证方式（不是靠猜）

拿真实 `webapp.js` 在 headless Edge 里对着一个**按酷狗结构搭的替身页**跑，`window.chrome.webview` 用桩接住所有上报，
并把域名解析到本机（`--host-resolver-rules=MAP www.kugou.com 127.0.0.1`），所以 `location.hostname` 真的是 `www.kugou.com`：

- 歌曲信息（`window.dataFromSmarty`）在、播放条在、`#prev/#toggle/#next` 在、`.bar-albumImg img` 在；
- 词**延迟 1.3 秒**才放进 `play.globalParam.word`（模拟真实时序）。

结果：`title = 寻诀`、`artist = 铁痕电台-MSR、Kkoori、钱润玉Runyu`（页面记录把歌名与歌手分开，不再是整串）、`artwork` 有了；
**延迟放进去的词仍然读到 3 行**（`{at:12, words:'第一行歌词'}`，probe `kugou: 3 lines, at 12s`）——说明重试生效；
`earlyTyping = []`（页面 `autofocus` 没有叫起输入法）、`lateTyping = [true]`（点输入框才叫起）、没有 JS 报错。

### 79.4 检查与产物

- `node --check crates/host/src/webapp.js` 通过；`cargo test -p westplay-host` **215 通过 / 26 忽略**。
- exe `24,630,784 B` / `D9655CEFCB2EA73D0BC3D5B8393F4F81724773FD1CF3A85EA2F8F145634AA1D3`（已部署、已重启）。
- 安装包 `10,395,036 B` / `04F9D6A41EF7682F0DE3AB46FC0C7AD7306D8D1110CA4CAD00129A9BC98D370D`；静默装过核对：
  `westplay.dll` = `93536599…`（584,192 B）、exe 同样大小、`uninstall /S` 卸干净。
### 79.5 两个 zip

`WestPlay-2.1.4-src-full.zip` 682 项 / 8,889,529 B / `DEDEA62F2475CD90C1D7CE9A012AE00A2BE78519E7214DEA1D006AAFA93836E6`；
`westplay-mods-src-214.zip` 443 项 / 1,641,527 B / `50CC7DBF74D4575D18321773F54A650A12C51CD2CD1313CFFAB4C28E2022A48A`。
（本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。）

- 插件 dll 未动（`93536599…`），游戏不用重启。

---

## 80. 大歌词页还差的那一步；输入法是被「带过来」的（2026-11-03 深夜）

owner 又提了一次：「给酷狗音乐加上大歌词页，让所有app启动都不要弹输入法」。这一轮两条都有了**日志上的实证**，不是猜。

### 80.1 歌词早就到了——缺的是那个按钮

先看日志：§79 的构建在 12:41:19 已经收到了

```
webapp: lyricProbe: kugou: 50 lines, at 0s
[kugou] its words: 50 lines
```

**50 行词已经在 cabin 手里了**。所以问题不在取词，而在「大歌词页」的入口：

```tsx
// ui/src/cabin/dashboard/widgets.tsx
const music = site === 'qqMusic' || site === 'netease'
onLyrics={music && hasLyrics ? () => useWebApp.setState({ lyricsOpen: true }) : undefined}
```

那个歌词按钮（`LyricsGlyph`，按下打开 `LyricsPage.tsx` 全屏歌词页）**只给 QQ 音乐和网易云**——酷狗不在里面，按钮就不画，
大歌词页自然打不开。这两个站点正是最早接歌词的那两个，酷狗是后加的，门就漏了。

**改法**：把这个判断提成 `webapp.ts` 里的 `wordsAreSongs(site)`：`qqMusic | netease | kugou` —— 三个「词就是歌的词」的站点
（B 站是视频、蜻蜓是电台、抖音是短视频，它们的词留在自己的页面里，这是 owner 2026-10-30 定的）。加了两条测试。

### 80.2 输入法：不是页面抢的，是**上一个应用留下的**

日志里这两行挨在同一毫秒：

```
12:41:12.240  [kugou] opened
12:41:12.240  webapp: the cabin's input method takes the player's keys
12:41:12.246  webapp: page going to: https://www.kugou.com/     ← 新页面还没开始加载
```

**新页面根本还没加载**，键盘就升起来了。原因是 `typing` 这个状态是全局的：上一个站点（网易云）的输入框上报过
`typing: true`，`receiveWebApp` 收到新站点的状态时**只改站点/标题，不清 typing**；`WebAppScreen` 一挂载，它的效果看见
`typing && selection > 0` 就把键盘附上了。所以「点开哪个应用都弹」—— 只要是换到**另一个网页应用**，上一页留下的焦点就跟着过来；
这也解释了为什么 §79 在页面里挡住焦点后还是会弹：堵的那头不是唯一的水龙头。

**改法**（三处，都是「焦点/键盘属于哪一页」这件事）：

1. `command({ action: 'open' })`：打开另一个站点前，清掉 `typing / text / selection`。
2. `receiveWebApp`：站点变了（不是同一站点换标题/重载）也清一次，双保险。
3. `webapp.js`：每个新文档加载完主动 `report(false, true)` —— 新页面本来就没有焦点，把上一页遗留的「在打字」清掉。

### 80.3 检查

- `tsc -b` 通过；`vitest run` **77 文件 / 570 通过**（新增 2 条：`wordsAreSongs` 三个音乐站点为真、视频/电台/短视频为假；
  「另一个站点的页面带走键盘，同站点换标题不清」）。
- `cargo test -p westplay-host` **215 通过 / 26 忽略**；`node --check crates/host/src/webapp.js` 通过。
- 页面脚本的替身页试验（§79.3 那套）仍通过：`autofocus` 不叫键盘、点框才叫；词延迟 1.3 s 仍读到 3 行。

### 80.4 产物

- exe `24,631,296 B` / `7C320012D0BF035C164E6B95EB6F09412F8DD6E2B28CAB5BECBA576497C5A951`（已部署、已重启）。
- 安装包 `10,393,076 B` / `E0C5E9CDC34C69A871BAF75575BCA4958762CA77A1AACE0C211C9CBD23D94AC3`；静默装进临时目录核对：
  `westplay.dll` = `93536599…`（584,192 B）、exe 24,631,296 B、`cabin-…js` 里 `kugou` 在、`uninstall /S` 卸干净。
### 80.5 两个 zip

`WestPlay-2.1.4-src-full.zip` 682 项 / 8,895,841 B / `055AE9D433060C2197AC59025110056623441F1FBFC8A8E14D927EFFA5D7A6F3`；
`westplay-mods-src-214.zip` 443 项 / 1,645,313 B / `01D96F16E54BBD5666C249B00475A34D245DAA5CB70677D3AF64638CE1D58940`。
（本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。）

- 插件 dll 未动（`93536599…`），游戏不用重启。

## 81. 两个新小组件（相册展示、车辆状态），顶部滚轮只留两条（2026-11-03 傍晚）

owner 这一轮三句话，一次说全：

> 「现在新添加两个仪表盘小组件：相册展示和车辆状态；车辆状态仅显示车身损坏程度，不包含轮胎磨损；相册展示开启后可以在壁纸图库内选择一张图片在首页展示」

> 「连接挂车时显示车身损坏程度和挂车损坏程度；界面显示的文字为：最上方车辆状态，下面显示车身：（0%-100%）连接挂车时加上挂车的」

> 「上面的滚轮信息里面移除车速和限速信息，仅保留强制休息和剩余里程」

### 81.1 现状：小组件是「开关 + 槽位」，各占列里一份高

仪表盘右列（`dashboard.css` 的 `.widgets`）是一竖排 `.widget-slot`：

```tsx
<div className={`widget-slot${shown ? ' open' : ''}`}>{shown && <Card />}</div>
```

`.widget-slot.open { flex-grow: 1 }` ——**开着的槽位均分整列高**，卡片自己按可用高度收紧（`.widget { flex: 1; min-height: 0 }`）。
开关是 `state/dashboardWidgets`（`Record<DashboardWidget, boolean>`），设置页 `DASHBOARD_WIDGETS.map(...)` 一行一个拨杆。
所以**加小组件不用碰布局**：加一个 `DashboardWidget` 值、一张卡、一行拨杆、一个默认值，再把它接进 `Dashboard.tsx` 和
`useAnyWidget()`（后者决定右列**出不出现**；漏了就只开新卡时地图占满整屏、右列不画）。

### 81.2 默认值：老的三张开、新的两张关

```ts
export const DASHBOARD_WIDGET_DEFAULTS = { nowPlaying: true, destination: true, weather: true, photo: false, vehicle: false }
```

`sanitize()` 逐项取默认（原来是「缺就等于开」）：没有这两个键的旧存档**不会**把新卡打开——owner 装上新版看见的是原来的三张，
自己去设置里开。存档版本没升（只是多了两个布尔键和一个字符串，`merge` 那条路已经能补）。

同时新增 `dashboardPhoto: string`（选中的壁纸 id，`''` = 跟随当前壁纸），一起进 `Persisted`/`partialize`/`sanitize`
（非字符串就不认，回 `''`）。

### 81.3 车辆状态：车身，不含轮胎

`vehicle.ts` 里原本就有 `truckWear()`（发动机/变速箱/驾驶室/底盘/轮胎五项，`WEAR` 位 + `wearKnown`）和
`trailerWear()`（挂车底盘/轮胎）。owner 要的是**车身**，轮胎不算——所以新加三个纯函数，各自的测试都拿「轮胎比车身还烂」
的样本证明轮胎被排除：

```ts
export function bodyWear(telemetry): Wear[]        // truckWear() 去掉 wheels
export function bodyDamage(telemetry)              // worst(bodyWear())，一条都没报 → null
export function trailerDamage(telemetry)           // worst(挂车 chassis)，挂车轮胎同样不算
```

卡片按 owner 的原话排：

```
车辆状态          ← vehicleApp.condition（原来车辆 App 右栏的标题，复用）
车身：34%         ← vehicleApp.body(percent(body))
挂车：20%         ← 仅 when hitched(telemetry, trailer)，vehicleApp.trailerDamage(...)
```

**颜色（owner 实机截图之后改的）**：第一版按 `severity()` 上绿/橙/红，浅色模式下那点绿压在白玻璃上几乎看不清
（owner：「车辆状态文字颜色改为适配浅色和深色模式的纯色」）。现在**一律用屏幕自己的文字色 `var(--text)`**
（深色模式白、浅色模式近黑，都是纯色、随模式走），只保留字号区分（车身大、挂车小一号）。`severity()` 仍给车辆 App 用。

**百分比（同一条消息里的另一句：「损伤值也不用向上取整」）**：`percent()` 原来是 `Math.round`——游戏显示 5%、卡片写 4%
（`0.045 * 100 = 4.4999…`），而且半分会被读成 1%。现在**向下取整**：`Math.floor(... * 100 + 1e-9)`。
那 `1e-9` 不是四舍五入，是补二进制误差：`0.29 * 100` 是 `28.999999999999996`，裸 floor 会算成 28。
所以 4.9% → 4%（不夸大损伤）、99.9% → 99%、0.5% → `<1`。车辆 App 的「损伤 x%」一起改，两边一致。

- 游戏没报某个通道（老游戏、老插件）：`percent` 拿不到 → `车身：—`（`body(null)`/`trailerDamage(null)` 的写法）；
- 完全没有遥测（游戏没开）：`等待游戏数据…`（`vehicleApp.unavailable`）；
- 挂车没连：只有 `车身` 一行（不写「未连接挂车」，那是车辆 App 里的话）。

### 81.4 相册展示：从壁纸图库选一张

选图**就是壁纸页那一套**，不另造图库：`useWallpapers()` 给出玩家自己的 + 内置的全部壁纸，`WallpaperChoices` 的样式、
`WallpaperThumbnail`（600 px 缓存缩略图）、`pickVariant(wallpaper, appearance)` 取明/暗变体，全部复用。设置页在两根新拨杆下面多一组，
**只有「相册展示」开着才出现**：

```
选择图片
┌──────────┐ ┌──────────┐ ┌──────────┐
│ 跟随壁纸  │ │  Silk    │ │  Plain   │   ← 与壁纸页同一套缩略图、同一个蓝色选中框
└──────────┘ └──────────┘ └──────────┘
```

- 第一张是 `跟随壁纸`（存 `''`）：不选也是**立刻有图**——首页跟着当前壁纸走，不会开了卡却是空白；
- 其余每张存壁纸 id；图库里没有的 id（玩家删了那张）由 `findWallpaper` 退回默认壁纸，跟屏幕壁纸的行为一致。

首页那张卡（`PhotoWidget`）：

- `photoView(id, wallpapers, appearance)`（新文件 `dashboard/photo.ts`，3 条测试）= `{ src, name }`；
- `prepareWallpaper(src, 900, 560)` **只解一次**（模块级 `Map` 缓存，Promise 复用），壁纸原图可能 4000 px 宽，
  不能每帧让浏览器缩；
- `<img>` `object-fit: cover` 满铺整张卡，卡本身 `padding: 0`；**卡上不写任何字**（owner：「图片展示不用显示名称」），
  壁纸名只做 `alt`（读屏用），底部那条给字幕垫底的渐变也一起去掉了。

### 81.5 列高与「天气让位」

右列最多容纳三张（`COLUMN = 3`），天气是「有空位才来」的那张。判断里原本只数 `guided / nowPlaying / destination`，
新加的两张也要数——否则五张全开时会挤出第四行（每张都 `flex-grow: 1` 会压到 60 px 以下，文字被切）。
`useAnyWidget()` 同样加上它们（开了相册/车辆，右列就得出现）。

两张新卡在窄/矮列（`@container widgets (max-width: 300px) or (max-height: 520px)`）里也各有一套小字号，
沿用 `.job` / `.weather` 的写法。

### 81.6 顶部滚轮：只留强制休息和剩余里程

`RestTicker.tsx` 原来四行：休息倒计时 → 油量+剩余里程 → 车速/限速 → 交货还剩。owner 要两条，于是：

- 删掉 `navigationSpeedLimit > 0` 那行的 `text.ticker.speed(speedKmh(...), ...)`；
- 删掉 `job` 那行的 `text.ticker.job(formatTimeLeft(...))`；
- `ticker.speed` / `ticker.job` 两种字符串三语一并删（没人再用，留着是死代码）；
- `ticker.fuel(litres, rangeKm)` 原样（「油量 541 升，剩余里程 1691 公里」正是 owner 说的那条）。

`.rest-pill` 的类名与外框没动（§69/§77 的样子保持）。

### 81.7 检查

- `tsc -b` 通过。
- `vitest run` **78 文件 / 578 通过**（比 §80 多 8 条：`photoView` 3、`bodyDamage` 2、`trailerDamage` 2、
  `percent` 的向下取整 1；存档那三条断言改成 5 个键 + `dashboardPhoto`）。
- `cargo test -p westplay-host` **215 通过 / 26 忽略**；`node --check crates/host/src/webapp.js` 通过（这一轮没动它）。
- 另起一个只有真 CSS + 真壁纸的预览页（`dashboard.css` 原样引入）截图核对：相册卡满铺、字幕在渐变上可读、
  `车身：34%` 红 / `挂车：20%` 橙 / `车身：0%` 绿、`跟随壁纸` 那张带选中框。渲染出来的样子与预期一致。
- 部署后重启，日志 `page: running (its scripts loaded)`，无报错。

### 81.8 产物

- exe `24,631,296 B` / `0FB167D7A703A2BBC7E1AF52E9A18EF09CFF9156EEF3174751DAAEE94BAFB196`（已部署、已重启）。
- 安装包 `10,400,783 B` / `92729CEC3FB7AB2F84ECB7377BF6A3768FE85D80E835536A17B3E49B74DA923F`；静默装进临时目录核对：
  `westplay.dll` = `93536599…`（584,192 B）、exe 24,631,296 B、`cabin-…js` 里 `vehicle-status` 在、
  `cabin-…css` 里 `.widget.photo` 在而 `photo-name` 与 `.vehicle-line.good` 都已不在、`uninstall /S` 卸干净。
- 插件 dll 未动（`93536599…`），游戏不用重启。

### 81.9 两个 zip

`WestPlay-2.1.4-src-full.zip` 684 项 / 8,912,644 B / `9BA08966F4DBEFEE7D8B894D612F8C3D795DFAD357FBE10DBC0A351255B284E2`；
`westplay-mods-src-214.zip` 445 项 / 1,655,696 B / `D1F903126E8936778F6D11789751D4928BA92BA5CC61D786141FDECA54DE4879`。
（比 §80 的对多 2 项：新文件 `dashboard/photo.ts` 与 `photo.test.ts`。本节写进去之后重打的一对会差几个字节；
交付的是重打的那一对。）

## 82. 抖音自己的音量条优先；首页卡片不再给它音量调节（2026-11-03 傍晚）

owner 一句两件：「让抖音自带的音量条优先级最高，并且去掉首页卡片抖音的音量调节」

### 82.1 现状：两处「音量」在打架

首页 Now Playing 卡片上有一条音量滑条（`widgets.tsx` 的 `.np-volume` → `MusicWidget` 的 `volume`/`onVolume`）。拖它：

```
卡片滑条 → command({ action: 'setVolume' }) → 宿主 → 页面脚本 applyVolume()
   ├ 写页面里每个媒体元素的 volume（没有元素时写 Web Audio 增益节点）
   ├ 记 localStorage['westplay.volume']（换歌/换页时补回去）
   ├ broadcastVolume()：往页面里所有 frame postMessage，跨域 frame 里的播放器也照办
   └ 每隔一秒的 `restored` 看门狗：发现音量被站点自己改了 → 改回来
```

B 站早就是「它自己的播放器说了算」：`cabinVolumeFor('bilibili')` 为假（卡片不画滑条），页面脚本 `ownVolume` 为真
（不写元素、不插增益、不跑看门狗、不广播 frame）——§26.3 / §27.4 留下的那套开关。**抖音不在任何一边**：卡片画滑条，
页面脚本也照常接管，于是它自己那条滑条被我们每秒改回去，「优先级」当然轮不到它。

### 82.2 改法：把抖音加进同一个开关（两处，各一行）

```js
// crates/host/src/webapp.js
const ownVolume = /(^|\\.)(bilibili|douyin)\\.com$/i.test(location.hostname)
```

```ts
// ui/src/cabin/apps/web/webapp.ts
export function cabinVolumeFor(site: WebAppSite | null): boolean {
  return site !== 'bilibili' && site !== 'douyin'
}
```

- `cabinVolumeFor` 为假 → `WebAppWidget` 传 `volume={null}`、不给 `onVolume`，卡片里
  `{onVolume && volume !== null && (…)}` 那一整块（小喇叭 + `<input type="range">`）**不渲染**——不是灰掉，是不画。
  歌词页那条音量条只在 `wordsAreSongs` 的站点上有，抖音不在里面，本来就没有。
- `ownVolume` 为真 → `applyVolume` 第一行就 return（`setVolume` 消息、打开页面时补的音量都到不了页面），
  `restored` 循环里 `for (const one of ownVolume ? [] : …)` 不再把抖音播放器自己调过的音量改回来，
  `broadcastVolume` 也不发（跨域 frame 同样收不到）。

### 82.3 边界

- 抖音的音量从此**只**听它自己页面里那条；车机的音量键、卡片滑条对它都没作用（B 站同）。
- QQ 音乐 / 网易云 / 酷狗 / 蜻蜓不变（卡片有滑条、页面侧照常接管）。
- `localStorage['westplay.volume']` 里以前给抖音记下的值留着但不再读——除非哪天把抖音从 `ownVolume` 里拿掉。
- 静音/播放键不在此列：`playPause` 仍发给页面（那是播放控制，不是音量）。

### 82.4 检查

- `tsc -b` 通过；`vitest run` **78 文件 / 578 通过**（`cabinVolumeFor` 那条测试扩成：bilibili 假、douyin 假、
  音乐站点与蜻蜓真、null 真）；`node --check crates/host/src/webapp.js` 通过。
- `cargo test -p westplay-host` **215 通过 / 26 忽略**（页面脚本随 exe 重编）。
- 装好的包里核对：共享 chunk `demo-…js` 里的 `cabinVolumeFor` 已成 `e !== "bilibili" && e !== "douyin"`；
  exe 里嵌的页面脚本能找到 `(bilibili|douyin)`（`ownVolume` 的新正则）。

### 82.5 产物

- exe `24,631,296 B` / `4A2F292F5BFCA6B9670E5276A87CC7AEB5E5F89EABFF6D6C707267D1C2524380`（已部署、已重启）。
- 安装包 `10,396,526 B` / `F56F57004D1779B50666CE1485B18D8E64E87E1FD19B6F8D7F3FA4A6D9CC15DA`；静默装进临时目录核对：
  `westplay.dll` = `93536599…`（584,192 B）、exe 24,631,296 B、`uninstall /S` 卸干净。
- 插件 dll 未动（`93536599…`），游戏不用重启。

### 82.6 两个 zip

`WestPlay-2.1.4-src-full.zip` 684 项 / 8,917,009 B / `6EE5A3AF7E083609D083C10C1D23E213CC5FB5E267F7895122F4B3288D416952`；
`westplay-mods-src-214.zip` 445 项 / 1,657,820 B / `D9D855E29B42C9B8F83CFBAA381AFBAA91AB58F3DC4ABA19A4B7A555F7290C0F`。
（本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。）

## 83. 抖音适配音量快捷键（2026-11-03 傍晚）

owner：「让抖音适配快捷键音量控制」

### 83.1 症状

§82 把抖音归进「它自己的滑条说了算」之后，首页卡片上的音量条确实没了，**但玩家（方向盘/手柄）的音量键对抖音也没用了**：
按键有反应（座舱会闪一下音量），抖音的声音一点不变。

### 83.2 根因：`ownVolume` 那一刀切得太宽

音量有两个来源，它们走的是同一条消息：

```
① 首页卡片的滑条   ─┐
② 玩家的音量快捷键 ─┴→ webappPlayer.setVolume(share) → {action:'setVolume'} → 页面 applyVolume(level, true)
```

`keybinds.press()`（`ui/src/cabin/apps/keybinds.ts`）先读 `player.volume()`，`stepped()` 加减 5%，再 `player.setVolume(next)` —
和卡片滑条落到的就是 `applyVolume`。§82 为了不让卡片滑条/每秒看门狗去跟站点自己的滑条打架，让 `ownVolume` 的站点
（B 站、抖音）在 `applyVolume` **第一行**就 return，于是②也被一起挡在门外。

这两件事其实不同：卡片滑条是一个「长期接管」（还会被记住、被每秒看门狗反复写回去）；快捷键是玩家**主动按一下**，
按完就该撒手，站点的滑条仍然说了算。

### 83.3 改法：给抖音开一条「按一下」的路，别的都不动

```js
// 页面自己的滑条说了算（B 站、抖音）：卡片不给滑条、页面侧不记不守
const ownVolume = /(^|\.)(bilibili|douyin)\.com$/i.test(location.hostname)
// 但玩家的音量键仍然够得到它（只有抖音；B 站保持 §26.3 的「只由它自己的播放器管」）
const hotkeyVolume = /(^|\.)douyin\.com$/i.test(location.hostname)
```

`applyVolume(level, keep)` 里多了一个分支，并抽出了 `putVolume(clean)`（把页面里每个声音元素的 `volume`/`muted` 设上）：

```js
if (ownVolume) {
  if (!(hotkeyVolume && keep)) return   // 卡片滑条、恢复、广播：一律不碰
  putVolume(clean)                       // 快捷键：只设现在在放的那个声音
  holdVolume(clean, HOLD_MS)             // 并且按住 1.2 秒（见 83.4：它自己的重画会把一次设定顶掉）
  post({ volume: clean })                // 告诉座舱「现在是这个音量」，下一按从这儿加减
  return                                 // 不记 localStorage、不进看门狗、不广播 frame
}
putVolume(clean); /* 普通站点：增益节点、记忆、frame 广播、看门狗，全部照旧 */
```

`keep` 只在座舱**明确要求**设音量时为真（`{action:'setVolume'}`）；页面自己恢复新元素时是 `false`，所以那条路对抖音依然是关的。

### 83.3b 按住 1.2 秒：一次设定会被它自己的重画顶掉

站点自己的播放器每隔几百毫秒就重画（进度、弹幕、缓冲提示都在重画），重画时它会拿**自己状态里**的音量把元素的
`volume` 写回去——我们设的那一下常常连一个音节都没听到就没了。所以快捷键设的音量不是「设一次」，而是 `holdVolume(clean, 1200)`：

```js
const holdVolume = (clean, ms) => {
  const until = Date.now() + ms
  const again = () => {
    if (Date.now() > until) return
    putVolume(clean)          // 每 100 ms 顶一次
    setTimeout(again, 100)
  }
  again()
}
```

1.2 秒之后**彻底撒手**：不记、不守、不广播，站点自己的滑条照样说了算（§82 的约定没变）。替身页试验里把「站点重画」演出来
（第 300 ms 把 `video.volume` 写成 1.00）：800 ms 时还是 0.55（按住了），1.3 秒后站点自己写 0.30 就留住了 0.30（放手了）。

### 83.4 为什么「按一下」不会跟站点的滑条打架

- 不写 `wantedVolume`、不写 `localStorage['westplay.volume']` → `restored`/每秒看门狗（本来就只跑非 `ownVolume` 站点）
  没有任何东西可写回，抖音的滑条依旧「优先级最高」（§82）。
- 不 `broadcastVolume`：抖音页里的 frame 收不到任何音量消息。
- 回报 `{ volume }` 这一条**本来就不受 `ownVolume` 限制**（`say()` 里读 `song.volume` 的那段），所以座舱一直知道
  抖音现在到底多响；`keybinds` 用它来 `stepped()`，每按一下是**从它当前音量**加减 5%，不是从记忆里的旧值。

### 83.5 验证：替身页试验（三个站点同一段脚本、同一个假 `<video>`）

把 `webapp.js` 原样放进一个空页面（`chrome.webview` 用假的、`location.hostname` 换成被测站点），派发
`{type:'webAppMedia', action:'setVolume', volume:0.55}`，读元素的 `volume`、`postMessage` 回报和 localStorage：

| 站点 | 设 0.55 之后 | 回报给座舱 | localStorage |
| --- | --- | --- | --- |
| www.douyin.com | `volume=0.55` ✓ | `{"volume":0.55}` ✓ | `null`（不记）✓ |
| www.bilibili.com | `volume=1.00`（不动）✓ | 无 ✓ | `null` ✓ |
| music.163.com | `volume=0.55` ✓ | `{"volume":0.55}` ✓ | `0.55`（照旧记）✓ |

截图：`抖音音量-快捷键-2026-11-03.png`、`哔站音量-对照-2026-11-03.png`、`网易云音量-对照-2026-11-03.png`。

第二组（同一套替身页，把「站点重画」也演出来：第 300 ms 把 `video.volume` 写回 1.00）：`抖音音量-按住-2026-11-03.png` ——
`50ms 0.55` → `300ms 重画成 1.00` → `800ms 仍是 0.55`（按住）→ `1.3 s 后站点写 0.30` → `2300ms 0.30`（放手，站点说了算）。
哔站那张同一段里始终 `1.00`、网易云那张始终 `0.55`（它的看门狗会守住，这是普通站点的既定行为）。

单测与检查：`tsc -b` 0；`vitest` **78 文件 / 578 通过**；`cargo test -p westplay-host` **215 通过 / 26 忽略**；
`node --check crates/host/src/webapp.js` 0。

### 83.6 边界

- 快捷键只管「页面现在在放的那个声音」（`sounds()`）；抖音页面上的滑条 UI **不会跟着动**（音量变了，滑条位置还是旧的），
  它下一次自己重画或玩家去拖，就以它为准——这正是「它的滑条优先」的意思。
- `0` 时顺带 `muted = true`，和普通站点一致。
- 抖音若把音量重置回自己的值，`say()` 一秒内把新值报给座舱，下一次按键从新值起算，不会「越按越离谱」。
- B 站完全不接管音量（§26.3 的约定不变）；QQ 音乐/网易云/酷狗/蜻蜓照旧（会记、会守）。
- 首页卡片对抖音仍然**没有**音量条（`cabinVolumeFor('douyin') === false`，§82）。

### 83.7 产物

- exe `24,633,856 B` / `73BC21153B6BD725804EB10C46BCE4706E3A587917C9C069CABAD0A717F96D8C`（已部署、已重启，18:45 页面正常）。
- 安装包 `10,401,030 B` / `4D0D31DCC1116D205A87BEE010E900B612C8771BBEE8BAA4E524C0E3FAD56682`；静默装进临时目录核对：
  exe 24,633,856 B、`westplay.dll` = `93536599…`（584,192 B，未动，游戏不用重启）、`uninstall /S` 卸干净。

### 83.8 两个 zip

`WestPlay-2.1.4-src-full.zip` 684 项 / 8,924,649 B / `B69747D394413C94BD8456DDF0330FA340809B9E4377AD88C79F841AE1E159AA`；
`westplay-mods-src-214.zip` 445 项 / 1,661,879 B / `BED30BB48BE2ABC2A16AE1BE41003AA8BD2BC6027875DA171411D0C20D08A39E`。
（本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。）

## 84. 仪表盘后视镜：打灯时透出游戏真实的镜面（合并 `WestPlay-mirror-feature-20261103.zip`）

增量包（`PORT-GUIDE.md` 为说明）8 个文件：4 个新增、4 个改动。它基于**§81 之前**的底子，所以改动文件不能整份覆盖。

### 84.1 它做了什么

仪表盘上，拨左/右转向灯时浮出一块**游戏真实的后视镜**：左灯 → 地图左上角（近侧 `close_mirror_reflection.mat`），
右灯 → 控件列顶部（远侧 `far_mirror_reflection.mat`）。打灯 ~150 ms 后出现，熄灭后留 ~2 s；**双闪不显示**；浮层不占小组件布局。

### 84.2 原理（两条必须照做的约定）

模组把游戏自己的镜面**材质**当图片画在页面纹理**下面**，页面在槽位处**挖孔**（透明），镜面就透出来：

```
/material/environment/close_mirror_reflection.mat   ← 近侧（左镜）
/material/environment/far_mirror_reflection.mat     ← 远侧（右镜）
```

- **镜面材质上下颠倒**：镜子的 `<img>` 必须写 `bottom=0 top=1`；页面纹理**绝不能**翻转（翻转加在共用的 `image_element()`
  里会把整个界面翻过来）。所以拆成 `image_element()`（不翻）和 `image_element_uv(..., flip)`。
- **一张 `ui::text` 脚本是静态的**，不能运行时换材质 → 左右镜各占一块**互不重叠**的区域（`NEAR_SLOT`/`FAR_SLOT`，
  页面侧的 `dashboard/mirror.ts` 与 `crates/setup/src/game_mod.rs` 是同一份约定，**要改一起改**）。

### 84.3 合并方式（为什么不能整份覆盖）

| 文件 | 方式 |
| --- | --- |
| `dashboard/mirror.ts`、`mirror.test.ts`、`mirrorHole.ts`、`MirrorWidget.tsx` | 新增，直接拷 |
| `shell/Shell.tsx` | 逐字比对后整份替换（差异只有多孔遮罩那 3 处） |
| `crates/setup/src/game_mod.rs` | 同上（差异只有镜子相关的 65 处匹配，无一条与我们的改动冲突） |
| `dashboard/Dashboard.tsx` | **手工合并**：增量包基于旧底子（没有 §81 的相册/车辆状态），只取它的 `MirrorWidget` 导入与那个子元素 |
| `dashboard/dashboard.css` | **手工合并**：只取 `.widgets { position: relative }` 与 `.mirror-slot`/`.mirror-frame`；它删掉的 `.appearance-dark .vehicle-status` 与 §81 那段相册/车辆状态样式**保留** |

多孔遮罩（`Shell.tsx`）：原来只挖一个孔（视频/网页），现在 `holeMask(holes: readonly Hole[])` 把若干个圆角矩形用
`maskComposite: 'exclude'` 一起合成；镜子那个孔只在**仪表盘**上、**不在卡车屏**上、**不在全屏视频/网页**时挖。

### 84.4 验证

- `tsc -b` 0；`vitest` **79 文件 / 589 通过**（其中 `mirror.test.ts` 9 条：150 ms、2 s、双闪、两块槽位互不重叠、材质左右）
- `cargo test -p westplay-setup` **71 通过 / 0 失败 / 9 忽略**（含新的「镜子和屏幕的层序与翻转」「两块槽位互不重叠」两条）
- `cargo test -p westplay-host` **215 通过 / 26 忽略**
- 装好的包里 `ui/assets/*.css` 能找到 `mirror-slot`

### 84.5 边界 / 怎么才算生效

- 只在**仪表盘有小组件列**时出现（没有小组件时列是隐藏的，没有槽位可占）。
- 屏幕缩放 ≠ 1 的布局（7" Scania 1.7、`scania-2025` 0.9/0.78）若位置有偏移，改 `NEAR_SLOT`/`FAR_SLOT`，**页面侧与模组侧一起改**。
- **要重新装一次模组**：镜面元素写在游戏的 ui 脚本里（`westplay.scs`），由配套程序的安装/更新重写；装完**重启游戏**。
  桌面程序本身会在启动时自动把这个版本的 `westplay.dll` 放进游戏（`westplay.dll` 本轮没有改动：`93536599…`，584,192 B）。

### 84.6 产物

- exe（本轮最终，含 §85）`24,647,680 B` / `3F58D27098CE060885D6AD8A8CD3500012EA5C57E10174BAC3FA6BF565039A9D`（已部署、已重启，20:44 页面正常）。
- 安装包 `10,404,093 B` / `E6567A8CB876CFEF2FDD3151A7E39F20ADEC531A8605BDE8850B5F28D0689D3B`；静默装进临时目录核对：
  exe 24,647,680 B、`westplay.dll` = `93536599…`（584,192 B，**写进安装包的就是当前这一份**）、`uninstall /S` 卸干净。

## 85. 倒车压音量对哔哩哔哩无效：一条「座舱自己的安静」通道（2026-11-03 夜）

owner：「哔哩哔哩挂 r 档音量不会减小，顺手修复了」

### 85.1 症状

§45 的倒车压音量（挂 R 档降到 15%，出 R 档回原值）对哔哩哔哩完全无效：挂 R 档声音一点不变。

### 85.2 根因：那条路走的正是被关掉的 `setVolume`

```
倒车 → quiet.ts → fade(..., player.sendVolume) → webappPlayer.sendVolume → {action:'setVolume'} → 页面 applyVolume
```

而 §27.4/§82 让**它自己的播放器说了算**的站点（B 站、抖音）在 `applyVolume` 第一行就 return，倒车这条也被一起挡住了。
§83 给抖音开的 `hotkeyVolume && keep` 只放行「玩家按一下」那种一次设定（而且 1.2 秒后松手），不是「按住一分钟」。

### 85.3 改法：新增 `duckVolume`（座舱自己的安静，`null` 放手）

- **Rust**（`crates/host/src/webapp.rs`）：`Command::DuckVolume { volume: Option<f64> }`（action `duckVolume`，`volume` 可为 null）
  → 转发给页面 `{"type":"webAppMedia","action":"duckVolume","volume":…}`，并写一行日志（`webapp: bilibili duck 0.15`）。
- **类型**：`shared/host.ts` 的联合类型加 `{ action: 'duckVolume'; volume: number | null }`；`MusicPlayer` 加可选
  `duck?(share: number | null)`；`webappPlayer.duck` 发这条命令。
- **倒车**（`reverse/quiet.ts`）：`fallQuiet()` 里 `player.duck?.(REVERSING_VOLUME)`，`comeBack()` 里 `player.duck?.(null)`；
  原来那套 `fade` 照旧跑（普通站点靠它，也是它把音量渐变的）。
- **页面**（`webapp.js`）：`ducked = { level, before }`——压下去时记下**压之前页面自己的音量**，`holdVolume` 顶一下，
  `say()` 每秒重申一次（站点播放器重画会把音量写回去）；收到 `null` 时把 `before` 写回去、状态清空，**之后不再写任何东西**。

### 85.4 为什么不直接把 `ownVolume` 的看门狗打开

看门狗会按「座舱记住的音量」每秒改回去，站点自己滑条拖的值也被改回去——那正是 §27.4/§82 要避免的。`duckVolume` 只在
「座舱要求安静」这段时间里生效，一放手就彻底不写，站点自己的滑条仍然是唯一说了算的（§82 不变）。

### 85.5 验证

替身页（host 换成 `www.bilibili.com`，同一个假 `<video>`）：`duckVolume 0.15` → 元素 `0.15`、回报 `{"volume":0.15}`；
第 320 ms 演一次「站点重画，写回 1.00」→ **800 ms 仍 0.15**；1.5 s 后仍 0.15（`say()` 在重申）；
`duckVolume null` → **回到 1.00**（压之前的音量）。截图 `倒车压音量-哔站-2026-11-03.png`。

单测：`quiet.test.ts` 新增「有 `duck` 的播放器在 R 档收到 0.15、出 R 档收到 null」，`player.test.ts` 新增
「`duck` 发 `duckVolume` 与 `duckVolume null`」；`tsc -b` 0；`vitest` **79 文件 / 589 通过**；`cargo test -p westplay-host` 215 通过。

### 85.6 边界

- 哔哩哔哩与抖音都吃这条；QQ 音乐/网易云/酷狗/蜻蜓仍走原来的 fade + 看门狗。
- 压下去期间玩家去拖站点自己的滑条，会被重申顶回来（这段时间座舱要求安静）；放手后以滑条为准。
- 页面在压下去之前没有声音（`sounds()` 空）时，`before` 记 1.0，放手回到满音量——与「没有声音时本来就无从压」一致。

### 85.7 产物

与 §84 同一次构建（exe `24,647,680 B` / `3F58D270…`，安装包 `10,404,093 B` / `E6567A8C…`，dll 未动 `93536599…`）。

### 84.7 / 85.8 两个 zip

`WestPlay-2.1.4-src-full.zip` 690 项 / 8,945,175 B / `62A6AD95B83E25F534DE08D44F3D97587EF1E371E5F8A91E2B32C11EB272B901`；
`westplay-mods-src-214.zip` 450 项 / 1,676,972 B / `689BE0466295178AD1DECAD91BFE29C5D39484DFA2A7ADDF2B44A335FCF2369D`。
（本节写进去之后重打的一对会差几个字节；交付的是重打的那一对。本轮新文件 5 个：4 个后视镜 + `更新日志-2026-11-03-简短.md`。）

## 86. 后视镜不显示：模组没有跟着程序重建（owner 2026-11-03 报「转向灯显示后视镜无法正常工作」）

### 86.1 症状

装上新版本（§84 已合入）后进游戏，打转向灯：仪表盘上**挖出来的是一个黑块**——位置、圆角、外圈那一道边都在，里面是黑的。

### 86.2 根因：页面那一半换了，模组那一半还是 10/31 的

镜面是**两半**拼起来的：页面挖孔（新代码）+ 模组里两块 `ui::text` 画游戏自己的镜面材质（`westplay.scs`）。
排查时先看磁盘上真正被挂载的那一份模组：

```
C:\Users\Administrator\Documents\WestPlay\westplay.scs   1,827,518 B   10/31 14:16
  near_mirror / far_mirror: 都没有
```

程序重建模组的条件只有三条（`app/src/setup.rs` 的 `look_at_mods`）：**平板上少车**、**模组车的屏幕过时**、**驾驶室水印过时**——
都是拿「游戏 + 已装模组」的指纹比的，**程序自己升级了反而不算变化**。于是：页面（新 UI）挖了孔，模组（老 `.scs`）里没有镜面元素，
孔下面什么都没有 → 黑洞。这跟 UI 的坐标、材质名都无关。

（顺带确认了两件事，免得再猜：模组里两块元素的坐标 199..564 / 883..1248、t 688 b 448、`bottom=0 top=1`、layer 99 在屏幕 100 之下，
与页面 `NEAR_SLOT`/`FAR_SLOT` 完全对得上；游戏的 `material/environment/close_mirror_reflection.mat`（150 B）与
`far_mirror_reflection.mat`（148 B）都真实存在。）

### 86.3 改法

1. **模组带版本**：`game_mod::LAYOUT = 2`，`build()` 往 `.scs` 里写一份 `westplay/layout.txt`（内容 `2`），
   `game_mod::layout_current(&ours)` 读它比版本。
2. **不匹配就重做**：`look_at_mods` 的重建条件加上 `|| !layout_current`，日志多一句 `layout 2 (the mod's was false)`。
   老模组（没有这个文件）→ `false` → 立刻重做；以后页面与模组的约定再变，把 `LAYOUT` 加一即可，玩家不用手动删模组。
3. **下次好排查**：`MirrorWidget` 每次镜子亮起往日志写一行 `mirror: left 199,32 364x240 of 1280x720`（孔的像素矩形 + 页面大小），
   「没显示」与「显示在错地方」从此一眼能分开。

### 86.4 验证

- 重装后的程序在游戏关着时启动：`21:00:10 setup: WestPlay's mod made again: … layout 2 (the mod's was false)`，
  `westplay.scs` **1,827,518 B → 1,829,098 B**（21:00:10），`westplay/layout.txt` = `2`，
  **15 个** `ui/dashboard/*_gps.sii` 里出现 `near_mirror`/`far_mirror`（`my_children[6]/[7]`，在 `[8] screen` 之前）。
- `cargo test -p westplay-setup` **71 通过 / 9 忽略**（含新断言 `layout_current` 对刚做的模组为真、对不存在的文件为假）。
- `tsc -b` 0；`vitest` **79 文件 / 589 通过**；`cargo test -p westplay-host` **215 通过**。
- 安装包静默装到临时目录核对：`westplay.dll` = `93536599…`（584,192 B）、exe 24,649,216 B、`assets/*.css` 有 `mirror-slot`、
  `assets/*.js` 有 `mirror:` 探针。

### 86.5 边界 / 怎么才算生效

- 模组只在**游戏关着**的时候重做（`game::running()` 有保护），而且插件是**游戏启动时挂载** `.scs` 的：
  所以顺序是「关游戏 → 让 WestPlay 跑一次（启动即会看，30 秒一轮）→ 再进游戏」。
- 老玩家升级后第一次进游戏前，先看一眼日志里有没有 `layout 2 (the mod's was …)`；没有就说明模组还没重做（游戏开着）。
- 镜子的**位置**若在某个布局（7" Scania 1.7、`scania-2025` 0.9/0.78）偏了：改 `NEAR_SLOT`/`FAR_SLOT`，页面与模组两边一起改，
  再把 `LAYOUT` 加一让模组自动重做。

### 86.6 产物

exe `24,649,216 B` / `F82B31E95FF89574C525FEB7D18A5597BB2699AE7A293215EC4E5550D662644D`；安装包 `10,420,578 B` /
`E6F958EE2453D1AF707D9176F92B570D51BF1B3845ABDCFB21E52D1B7D96F385`；`westplay.dll` 未动 `93536599…`（584,192 B，已写进安装包）。

### 86.7 两个 zip

`WestPlay-2.1.4-src-full.zip` 690 项 / 8,951,260 B / `9F863E82BD919A794E92931227DB7ED6DA13A575E0B822A62DB29088C22C22B9`；
`westplay-mods-src-214.zip` 451 项 / 1,691,175 B / `95BDABEEF5A0321EF659171FEF3AED19882D443A3BA33FE7AE41D332D8B4590F`。
（本节是写进包里之后又重打一次的：包内这份文档里的数字与交付的这一对差几个字节，以本节为准。）

## 87. 哔哩哔哩适配音量快捷键（2026-11-03 夜）

owner：「行，现在让哔哩哔哩适配快捷键，别忘了 scs」

### 87.1 症状

§83 让抖音的快捷键能调音量，**B 站没有任何变化**：按音量键，座舱闪一下音量、B 站的声量不动。

### 87.2 根因：`hotkeyVolume` 里只有抖音

§83 把「自己的滑条说了算」的站点分成了两件事：卡片滑条/看门狗一概不碰（`ownVolume`），玩家的音量键仍然够得到（`hotkeyVolume`）。
第二件事当时只给了抖音：

```js
const hotkeyVolume = /(^|\.)douyin\.com$/i.test(location.hostname)   // 只有抖音
```

于是 `applyVolume(level, keep)` 走到 `if (ownVolume) { if (!(hotkeyVolume && keep)) return }` 这一行，B 站直接被 return。
座舱侧没有任何站点开关（`keybinds.press()` 读 `player.volume()`、`stepped()` 加减 5%、`player.setVolume()` → `{action:'setVolume'}`，
`keep` 对这条消息恒为 `true`），所以只改这一行就够。

### 87.3 改法

```js
// 玩家的音量键仍然够得到它（抖音、B 站）
const hotkeyVolume = /(^|\.)(bilibili|douyin)\.com$/i.test(location.hostname)
```

行为与 §83 的抖音完全一致：设一次 → `holdVolume(clean, 1200)` 顶住播放器自己的重画 → **彻底撒手**（不写 `localStorage`、
不进看门狗、不广播 frame、不碰倒车压音量那条 `duckVolume`）；`say()` 照旧把真实音量报给座舱，下一次按键从**当前音量**加减。

### 87.4 验证（替身页，`host=www.bilibili.com`，同一个假 `<video>`）

派发 `{type:'webAppMedia', action:'setVolume', volume:0.55}`，第 300 ms 演「站点重画写回 1.00」，第 1300 ms 演「站点自己改成 0.30」：

```
host www.bilibili.com
 60ms: the keybind sets 0.55 (posted [{"volume":0.55}], kept null) -> video.volume=0.55
300ms: the site redraws and writes 1.00 back -> video.volume=0.55
800ms: still 0.55 (held) -> video.volume=0.55
1300ms: the site sets 0.30 of its own -> video.volume=0.30
2300ms: still 0.30 (let go: its slider wins) -> video.volume=0.30
```

截图 `哔站音量-快捷键-2026-11-03.png`。回归（同一段脚本、同一次改动）：网易云仍 `0.55`、`localStorage['westplay.volume']=0.55`、
看门狗把它守住；抖音不变（`0.55` → 顶住 → 放手后 `0.30`）。

### 87.5 边界

- 首页卡片对 B 站/抖音仍然**没有**音量条（`cabinVolumeFor` 不变，§82 的约定没动）。
- 页面上的滑条 **UI 不会跟着动**（音量变了，滑条位置还是旧的）；玩家去拖滑条或它自己重画，就以它为准 —— 这正是「它的滑条优先」。
- 1.2 秒后若它把自己的音量写回来，`say()` 一秒内把新值报给座舱，下一按从新值起算（不会越按越离谱）。
- 倒车压音量（§85）走的是 `duckVolume`，与这条 `setVolume` 无关；B 站挂 R 档照样压到 15%。
- QQ 音乐/网易云/酷狗/蜻蜓照旧（会记、会守）。

### 87.6 产物（这一轮没动模组）

- exe `24,649,728 B` / `A8DE369E014DFC0FF9CAF863477C445A11DE70590F96BD93BEC434974B979266`（已部署、已重启，21:09 页面正常）。
- 安装包 `10,418,911 B` / `9D692F8ABBABC4B724726F5F1DCE7310D978F94FA7C749EB996BA3E766F56168`；静默装进临时目录核对：
  exe 24,649,728 B、`westplay.dll` = `93536599…`（584,192 B，未动）。
- **`westplay.scs` 没有变**：`1,829,098 B` / `261989C7578F8A296A92A9B62E6241F159668D88A52E0D84CF7118EE4B2B346B`（21:00 那份，
  `westplay/layout.txt` = `2`，15 个脚本里有 `near_mirror`/`far_mirror`）。这一轮只改注入的页面脚本，**模组不用重做、游戏也不用重启**，
  只需 WestPlay 重启一次（页面脚本随它重新注入）。

### 87.7 两个 zip

`WestPlay-2.1.4-src-full.zip` 690 项 / 8,954,874 B / `1ADBF0DAC03EE5FDBE3156CAC8C6DAA19DC15E9499177D2A4DC68B3758361491`；
`westplay-mods-src-214.zip` 451 项 / 1,692,880 B / `A656ABDC11AC3A41D9907475AEE483C08BB4CECFC01FEBBA01CAF7D8101B9B0E`。
（这一对就是交付的；包里那份 FIXES.md 是重打前一刻的，其中数字比本节小几十字节。）

## 88. 后视镜只透出一角：页面用错了坐标系（owner 2026-11-03 夜，两张实机照）

owner 发来两张实机照：「这是什么问题，给出问题原因后等我指示」，随后：「A 方案，最好让原版支持的车和平板用着都没问题」。

### 88.1 症状

打灯时**孔在、外圈那道边在、里面也有东西**，但透出来的不是一整面镜子：像是被裁掉一角、又放大过的一块（两张照片里碎片的内容还不一样）。
§86 修好的那一刻「什么都没有的黑洞」变成了「有东西但不对」。

### 88.2 证据：孔比模组的元素小了 22%

日志里（§86 加的探针）：

```
21:10:00  cabin: mirror: right 691,26 281x184 of 1280x720
21:10:10  cabin: mirror: left  157,26 281x184 of 1280x720
```

模组里那份元素（dump 出来的真 `.scs`，`coords_t: 688 coords_b: 448`，720 行里就是距顶 32）：

```
near_mirror: coords_l 199  coords_r 564   → 364 x 240
far_mirror : coords_l 883  coords_r 1248  → 364 x 240
```

`281 / 364 = 0.772`、`184 / 240 = 0.767`、`157 ≈ 199 × 0.79` —— 三个数都是同一个因子，而它正是这台车的 `--ui-scale`：**0.78**。

### 88.3 根因：同一份数字活在两个坐标系里

```css
/* ui/src/cabin/shell/shell.css:259 */
.carplay-content { position: absolute; inset: 0; zoom: var(--ui-scale, 1); }
```

- 遮罩（挖孔）画在 `.carplay` 上：**没有缩放**，坐标就是页面自己的像素（1280 × 720，正是模组写元素的单位）；
- 而 §84 的 `MirrorWidget` 是这样放置的：拿 `.carplay` 的 rect（未缩放，1280 × 720）乘 `NEAR_SLOT`/`FAR_SLOT` 得到槽位，
  槽位却是 `position: fixed`、DOM 挂在 `.carplay-content` 里 → 被 `zoom: 0.78` 又缩了一次；
- 孔又是从**渲染之后**的 `getBoundingClientRect()` 算出来的，算完直接当页面单位交给遮罩。

于是孔 = 镜子的 0.78 倍、并且整体往左上偏；镜头底下那面 364 × 240 的镜子只露出左上那一块，正是照片里的样子。
`getBoundingClientRect()` 给的是**缩放后的视觉尺寸**，`offsetWidth/offsetHeight` 才是布局尺寸 —— 两个坐标系混用就是这样出错的。

### 88.4 改法：只留一套坐标系（页面自己的像素）

- **槽位搬到未缩放的那一层**：`MirrorWidget` 由 `Shell.tsx` 渲染在 `.carplay` 里（紧跟 `<Wallpaper>`，与 `.carplay-content` 同级），
  `dashboard.css` 的 `.mirror-slot` 从 `position: fixed` 改成 `absolute`。`--ui-scale` 从此碰不到它。
- **位置与孔都只用页面自己的像素**（`state/screen.ts` 的 `SCREEN_WIDTH`/`SCREEN_HEIGHT`），也就是模组元素写的那套数字：
  - `dashboard/mirror.ts` 新增 `mirrorBox(side, insetLeft)`：`NEAR_SLOT`/`FAR_SLOT` × 1280 × 720，减去页面自己的左边距 `--oem-left`
    （Glass 风格里卡车自带屏幕占掉的那一条，遮罩也是从这个边距开始的）；
  - 新增 `holeInside(box, rim, radius)`：孔 = 框减掉边框（`RIM`），圆角收进去（`RADIUS - RIM`）；
  - 组件不再量任何 rect，只把这份 box 放进 state，**框与孔共用同一份数字**。
- 删掉原来 `zoom = box.width / element.offsetWidth` 的换算 —— 没有第二个坐标系，就不需要换算。
- **平板**：`screenLayout === 'tablet'` 时组件整块不画（平板是模型直接显示纹理，没有 ui 脚本可挂镜面元素），页面保持完整、不挖孔。
- 探针写成一行同时给出框与孔，单位与模组一致：

```
mirror: left slot 199,32 365x240 hole 201,34 361x236 of 1280x720
```

### 88.5 验证

- `mirror.test.ts` 13 条（新增 `mirrorBox` 2 条、`holeInside` 2 条）：四舍五入后与模组的 `199 / 564 / 32 / 272`、`883 / 1248` 逐一对上；
  左边距只影响左、不影响上宽。
- `tsc -b` 0；`vitest run` **79 文件 / 593 通过**。
- 模组侧一个字节没动（坐标没变 → `LAYOUT` 不升），所以 `westplay.scs` 不用重做、游戏不用重启；只重启 WestPlay 让新页面生效。

### 88.6 边界

- `--oem-left` 已算进去；`--oem-bottom` 用不到（镜子在页面顶部，`.carplay` 的上边就是页面的上边）。
- 镜子的位置现在只有一处来源（`NEAR_SLOT`/`FAR_SLOT`）。某个布局（7" Scania 那种缩到 1.7 的）若还偏，只改这一处；
  但**模组侧 `game_mod.rs` 的同两个常量要一起改**，并把 `LAYOUT` 加一让 `.scs` 自动重做。
- 平板、以及没装车模组的客车（`built.missing`，页面根本不显示）都不会挖孔。
- 镜面材质本身若在某个布局上仍然是杂色（不是位置问题），那是另一层的事（材质能否当图片画），届时单开一节。

### 88.7 产物（模组一个字节没动）

- exe `24,649,728 B` / `402FE834824D1ADF3AEA6D62691D8C93DBFA9A471D674E5F5D5B1465D144033C`（已部署、已重启，21:25 页面正常）。
  （体积与 §87 相同：exe 里嵌的是页面脚本，这一轮页面脚本没动；变的只是界面那 76 个文件。）
- 安装包 `10,419,753 B` / `B815F4F6D2C51BA959766F79F9CAB82D0FE768B809CEE114063F132B5F632D2C`；静默装进临时目录核对：
  exe 24,649,728 B（与 `target/release` 那份只差 **3 个字节**的 PE 头）、`westplay.dll` = `93536599…`（584,192 B）、
  `ui/` 76 个文件、`ui/assets/cabin-*.css` 里 `.mirror-slot{…position:absolute}` 在、`cabin-*.js` 里 `mirror-slot` 在、
  `uninstall /S` 卸干净。
- **`westplay.scs` 没动**：`1,829,098 B` / `261989C7578F8A296A92A9B62E6241F159668D88A52E0D84CF7118EE4B2B346B`（21:00 那份），
  所以**游戏不用重启**，只重启 WestPlay。

### 88.8 两个 zip

`WestPlay-2.1.4-src-full.zip` 692 项 / 9,010,454 B / `7AB411F16D021E005DCE13181EFA90D9F7769FBD21D3AD1C92869C168F4C4C33`；
`westplay-mods-src-214.zip` 451 项 / 1,693,196 B / `89A9FF5FA83F90F5FFEC370B11A0091C2CE9D608FA9E9DED14CFBEF17B9A0F7E`。

（上一刀（本节写进去之前）是 8,947,123 B / `64F73C14…` 与 1,693,079 B / `B9533E21…`。交付的是本节写进去之后重打的那一对，
所以包里这份 FIXES.md 与它自己写的那两行只差这一段的字节数——数字以上面这两行为准。）

## 89. 显示设置里的「虚拟后视镜」开关，与安装包自带一份 `.scs`（owner 2026-11-03 夜）

owner 先问：「后视镜离开视野就不会渲染了，导致车机后视镜没有画面。这个有没有解决办法？」；再问：「有没有办法隐藏 F2 的虚拟后视镜」；
最后定了做法：「在显示设置里面给虚拟后视镜加个开关，然后给新的 scs 文件合并到安装包里面」。

### 89.1 症状

- 打灯时仪表盘那面镜子，只有在游戏开着 F2（虚拟后视镜）时才有画面；把 F2 关掉，画面就停住不动。
- owner 因此提了两个问题：能不能不用那两面浮窗；以及能不能给这面镜子一个开关。
- 新装的机器：模组 `westplay.scs` 要等程序用本机游戏做出来才存在，装完到第一次"游戏已关闭"之间是空的。

### 89.2 证据：镜子是"有人要才画"的东西

- 镜面材质 `/material/environment/close_mirror_reflection.mat`（150 B）只有一句 `effect : "ui.rfx"` 和
  `texture source : "close_mirror_reflection.tobj"` —— 它读的是一张**每帧被引擎写入的动态纹理**；远侧那份同理。
- `/def/mirror_data.sii` 全文只有 `mirror_size[]`（7 条尺寸）与 `mirror_fov_extension[]`（7 条视场扩展）：
  **没有**任何"总是渲染/常亮"的数据开关。
- `material/environment/mirror/close_1024x1024_ui.mat` 这类"UI 用的镜子材质"在包体里**不存在**：运行时按尺寸生成。
- 游戏的 `config.cfg` 里与镜子有关的全部是：`uset r_deferred_mirrors "2"`、`uset r_mirror_group "3"`、
  `r_mirror_scale_x/y "2"`、`r_mirror_view_distance "400"`、`g_mirrors "0"`、`g_mirrors_keep_hidden "0"`、
  `g_mirrors_visibility_setup "0"`；exe 里另有 `@@mirrors_keep_hidden`、`@@o_im_show_mirrors`、`TK_MIRROR` 等串。
- 由此：F2 的那两面浮窗就是这张纹理的**消费者**。隐藏它们 = 没人要 → 引擎不再渲染。
  "隐藏 F2 又留着画面"这件事本身不成立；`mirror_data.sii` 也没有让引擎常亮的数据开关。

### 89.3 根因与取舍

画面与浮窗是同一件事的两面（浮窗是消费者），所以这不是"能不能藏起来"的问题，而是"要不要让游戏一直画"的问题：

- 关掉延迟渲染（`r_deferred_mirrors "0"`）也许能让引擎每帧都画，但那要改玩家的 `config.cfg`（游戏退出会回写，得每次启动前写一次），
  代价是两路镜面渲染的帧数 —— 没有走。
- owner 定下的方向：**开关只管我们自己的那面镜子**（仪表盘上透出来的那面），游戏的 F2 仍归游戏；
  安装包自带一份带镜面元素的 `.scs`，新机器装完就有。

### 89.4 改法

**一、开关（页面自己的设置，随页面持久化）**

- `ui/src/cabin/state/store.ts`：新增 `mirrorOn: boolean`（默认 `true`，即保持既有行为）与 `setMirrorOn`，
  并进 `Persisted`、`partialize`、`sanitize`（持久化版本不变：旧数据没有这个字段 → 用默认的"开"）。
- `ui/src/cabin/apps/settings/SettingsApp.tsx`：**设置 › 显示与性能** 里加一行 `SwitchRow`（挨着性能模式）。
  文案在 `state/strings.ts`（三语）：`mirror` / `mirrorFooter` —— en `Virtual Mirrors`、zh `虚拟后视镜`、tr `Sanal Aynalar`。
- `ui/src/cabin/dashboard/MirrorWidget.tsx`：`shown` 再加一项 `mirrorOn`。关掉时组件照样跑（钩子顺序不变），
  `shown === null` 会清掉 `useMirrorHole` 的孔 → **页面不挖孔、不画外框、不显示镜子**；打开即恢复，不用重启游戏。

**二、安装包自带一份 `.scs`**

- `assets/westplay.scs` = 21:00 那份（`1,829,098 B` / `261989C7…`，zip 里 `westplay/layout.txt` = `2`）。
- `app/tauri.conf.json`、`app/tauri.installer.conf.json` 的 `bundle.resources` 都加 `"../assets/westplay.scs": "westplay.scs"`，
  装完就落在程序旁边（`resource_dir()`）。
- `app/src/setup.rs`：`seed_mod()`，在 `setup` 里紧挨 `watch_installed_mods` 之前调用 —— `Documents\WestPlay` 里**没有** `.scs`
  才把自带那份放进去（`seed_into`：读自带那份、已有就不覆盖、`game_mod::install` 写并留下日志
  `setup: the mod that came with WestPlay is in place (… B): the PC's own game makes it again`）。
- `crates/setup/src/game_mod.rs`：`LAYOUT` 2 → **3**。自带那份是 2，程序认它"不是本机做的" → 游戏一关就用玩家自己的游戏与
  已装模组重做一次（内容只差 layout 那一行），这样别的机器上不会长期将就一份别处做的模组。
- 单元测试 `the_seed_is_put_in_place_only_where_theres_no_mod`：没有就放进去且字节一致；已有则一个字节都不动。

### 89.5 验证

- `tsc -b` 0；`vitest run` **79 文件 / 595 通过**（+2：`mirrorOn` 默认开；关掉后存回来还是关）。
- `cargo test`：`westplay-setup` 71、`westplay-host` 215、`westplay-app` 4（+1 新测试）全过。
- 安装包静默装进临时目录核对：`westplay.exe` `24,674,816` B、`westplay.dll` `93536599…`（584,192 B）、
  `westplay.scs` 1,829,098 B（与 `Documents\WestPlay` 那份同字节）、`ui/` 76 个文件。
- 部署后的页面 bundle `cabin-BXZrwKRk.js`（1,319,812 B）里 `虚拟后视镜`、`Virtual Mirrors`、`Sanal Aynalar`、`mirrorOn` 都在。
- 自带那份的 layout 是 `2`、`LAYOUT` 是 `3`：对不上 → 会被重做，正是"只作垫底"的设计。

### 89.6 边界

- 开关只管**我们**这面镜子；游戏的 F2 仍在游戏自己的设置里，WestPlay 不碰 `config.cfg`。
- 关掉：不挖孔、不画框、不显示；打开：恢复，不需要重启游戏，也不需要重建模组（模组里的镜面元素一直有效）。
- 自带的 `.scs` 是从**这台机器**的游戏做的，在别的机器上只作垫底；玩家自己的游戏文件一到手（游戏关闭时）就会被重做覆盖。
- `LAYOUT` 升到 3 后，本机旧 `.scs`（2）会在下一次"游戏已关闭"时重建。重建出的内容与旧的那份只差 `westplay/layout.txt` 一行，
  所以**不需要**因为这个再重启游戏。
- 若日后改 `NEAR_SLOT`/`FAR_SLOT`：`ui/src/cabin/dashboard/mirror.ts` 与 `crates/setup/src/game_mod.rs` 要一起改，并把 `LAYOUT` 再加一。

### 89.7 产物（模组内容未变）

- exe `24,674,816 B` / `59AEED2E65DD2D3ECCF3999118815F1CD4F88C158A63F45EAFA25BF0A030DFBC`（已部署到 `D:\WestPlay`）。
- 安装包 `11,827,307 B` / `2C70ED3BAE5D0265DE2D7A2DB3BDF089FE497F261C28AEA798635A42210FA16A`；静默装进临时目录核对过内容；部署目录 `D:\WestPlay` 也是用它装的。
- `westplay.dll` 仍是 `93536599…`（584,192 B，§81 之后没动）；`westplay.scs` 本机仍是 21:00 那份
  `1,829,098 B` / `261989C7578F8A296A92A9B62E6241F159668D88A52E0D84CF7118EE4B2B346B`
  （游戏正开着、文件被插件挂载锁定，所以这轮没有动它；自带的垫底与它同字节）。

## 90. 有导航点时不再弹「附近推荐」（owner 2026-11-03 深夜）

owner：「让地图有导航点时不显示附近推荐」。

### 90.1 症状

地图右下角的「附近推荐」卡片，在**还有导航点**的时候也会弹出来：走完路线最后一公里、或者"推荐的那个地点正好是路线终点"时，
它盖在右下角、蓝框旁边。

### 90.2 证据

卡片原来只看两个条件：`arrived`（路线的最后一公里、或交付那一瞬）与 `closed`（点了就走，开走或接新任务才复位）；
**没有任何一处去看 GPS 上还有没有导航点**。

导航点就是页面 live 状态里的 `route`（`id`/`nodes`/`distances`/…）：主机在 `route` 消息的 `id` 或 `nodes` 为空时把它置 `null`，
所以"有导航点"= `route !== null && route.nodes.length > 0`。

### 90.3 改法

- `dashboard/arrival.ts` 新增 `hasDestination(route)`：`route !== null && route.nodes.length > 0`。
- `dashboard/ArrivalCard.tsx`：订阅 `hasDestination(state.route)` 得 `navigating`，建议只在
  `arrived && !closed && !navigating` 时算 —— **有导航点时整张卡不画**。
- "到了"的 latch 没动：路线一清（游戏把 `route` 置 `null`），卡片自己回来。

### 90.4 验证

- `tsc -b` 0；`vitest run` **79 文件 / 596 通过**（+1：`hasDestination` 对 `null`、空节点、有节点三种情况）。
- 页面 bundle `cabin-CC02i631.js` `1,319,884 B`（比 §89 那版 `cabin-BXZrwKRk.js` 的 1,319,812 B 多 72 B，就是这道门槛）。
- exe `24,674,816 B` / `B9176FE97F2F7569588357AC56899C6A06160B6B38BCF00F9609D0159BC4F4A6`；安装包
  `11,832,973 B` / `9CA9324AC8839D498BA0D19100252A575CA207B76E8E07DE009C1E17783C4E0E`；已装进 `D:\WestPlay` 并跑起来
  （`page: running`）。装出来的 exe 与 `target/release` 那份只差 3 个字节的 PE 头（同一个构建）。

### 90.5 边界

- 门槛看的是"有没有导航点"，不是"离终点多远"：只要 GPS 还在带路，就一定不弹。
- 于是"推荐的地点正好是终点 → 列出附近所有地点"那条多行分支现在走不到（它需要导航点，而导航点在就不显示）。
  代码与测试都还在；哪天要"停在终点列一串"，得换一个触发条件（比如用交付那一瞬，而不是路线）。
- 交付之后（游戏把任务与路线一起清掉）立即生效；新设一个导航点，卡片立即消失。
- 与 §89 的开关无关：`虚拟后视镜` 管的是那面镜子，这一条管的是推荐卡片。

### 89.9 两个 zip

`WestPlay-2.1.4-src-full.zip` 693 项 / 10,645,270 B / `FA6C8EFC05B2A50A315058E85452233BAA93C1BEFEDCD9B2EE4470C20F8CCBF2`；
`westplay-mods-src-214.zip` 452 项 / 1,705,336 B / `3D782A8FA1F313554E892348C69AD3BCCF22670DF9AAC5A86A9845AFF6ADEFD1`。
（完整包里多了 `src/assets/westplay.scs` 这 1.8 MB；模组包里没有它 —— 那是程序的资源，不是模组源码。）

### 90.6 两个 zip

与 §89.9 同一对（§89 与 §90 的改动一起切的）：
`WestPlay-2.1.4-src-full.zip` 693 项 / 10,645,270 B / `FA6C8EFC…`；`westplay-mods-src-214.zip` 452 项 / 1,705,336 B / `3D782A8F…`。
包里那份 `FIXES.md` 是切包那一刻的（还差这两小节），数字以上面为准。

## 91. 倒车影像：挂 R 档要整屏真实画面 —— 引擎只给乘用车画，撤回

### 91.1 症状

§35 / §40 / §45 那套倒车示意（自己画的车尾路面、米格、红黄绿辅助带、13 米挂车俯视）owner 不要，要的是**真实画面**，像乘用车那样整屏：

> 挂r档时触发，开启时画面占据整个屏幕

第一次试（元素在镜子之上）整屏是 `1x1 PARK` 占位图，打灯时镜子槽还被它盖住；第二次试（元素挪到镜子之下，另外把
`g_cam_parking` 设成 1、owner 自己绑了 `parking_cams` 键）占位图照旧，按下那个键之后**连镜子也变成 `close` 占位图**。

### 91.2 根因：这张图引擎从来没给卡车渲染过

引擎里那一族渲染目标（`eurotrucks2.exe` 的格式串 `%s_mirror_reflection.tobj`、`%s_%ux%u_ui.mat`，名字表
`close / far / front / side / park / hood` + `park_360`）里，**`park` 就是驻车摄像头**；`base_share.scs` 里有现成的
`material/environment/mirror/park_1x1_ui.mat`，ATS 公路旅行 DLC 那辆 Ford 的仪表页就是把它整屏放上去的。

模组这边照抄了同一套（复制 GPS 页 → 在「屏幕开着」组里加 `ui::text` → 材质写 `park_1x1_ui.mat`），两次实测的结论是：

- **元素、层、坐标、页面让位、R 档触发全都对**——画面确实出现了；
- 出现的是那张材质**自带的测试图**（`1x1` / `PARK` 加红绿辅助线）。那张纹理是 SCS 给开发者对位用的底板；引擎**没有往这个
  渲染目标里画过任何一帧**，所以露出的就是底板；
- 游戏自己的「驻车摄像头」动作（`parking_cams` 键、`g_cam_parking` 开关）对卡车不起作用，按下去只是把**镜子**的渲染目标
  换成摄像头画面——卡车没有摄像头源，于是镜子也变成 `close` 占位图。

再往下查，卡车侧确实什么都没有：

- 游戏里 **26 辆卡车的 `data.sii` 全都有 `behind_camera: camera.behind.basic`**（那是车外跟车相机，不是倒车影像）；
- 游戏全部 `.sii` / `.sui`（`ui/` 与 `def/vehicle/`，115 个包）里**没有任何一处**提到 `parking` / `park_`；
- 那辆 Ford 的 `data.sii`、`interior/standard.sii` 里，相机字段与卡车完全同构（只多 `parking_line_type` 与三条
  `parking_line_colors`），也找不到「倒车摄像头」的开关字段。

也就是说：这套驻车画面是引擎内部、按**乘用车**那一类车准备的，卡车没有相机源，模组层面拿不到真实画面。

### 91.3 改法（落到最终状态：撤回，但接口留着）

**模组**（`crates/setup/src/game_mod.rs`）

- 保留 `park_1x1_ui.mat` 的元素 `_nameless.westplay.park`，但**画在两块镜子下面**（同层 99，先加，镜子后加盖上它）：镜子照旧工作，
  打灯挖孔里不会露出占位图；正常行驶时它整个压在页面底下，看不见。
- `LAYOUT` 3 → 4（曾在镜子上）→ **5**（镜子下）。老机器上那份 `westplay.scs` 见 layout 旧就重做一次（§86 的机制）。

**页面**（`ui/src/cabin/`）

- `reverse/layout.ts`：`live` 的代码全部保留（`ReverseLayout`、`layoutShows('live')`、`shell/Shell.tsx` 的整页让位、
  `ReverseOver.tsx`），但 **`REVERSE_LAYOUTS` 不再提供它**，默认回到 **`both`**（两种示意图）。理由：现在选它只会看到占位图；
  等以后插件自己渲出一张图来，把它接进 `live` 就行。
- 其余（`ReverseBar.tsx`、`ReverseCamera.tsx`、`reverse.css`、`state/strings.ts` 的 `reverseCamera.live`）保留，是 `live` 的零件。

### 91.4 验证

- `tsc -b`：0。
- `vitest run`：**79 个文件 / 596 个用例全过**（`layout.test.ts`：默认 `both`、`REVERSE_LAYOUTS` 五项、`layoutShows('live')` 仍什么都不画）。
- `cargo test -p westplay-setup`：**71 通过**（`my_children: 6`、三处 `layer: 99`、`park` 元素整屏坐标、7" 屏按 `ShownPart` 落位、CRLF 保持）。
- 两次实机测试（owner 截图）：layout 4 → 整屏 `1x1 PARK` 占位图、打灯槽被盖住；layout 5 + `g_cam_parking "1"` +
  `parking_cams` 键 → 占位图不变，且按键后镜子变成 `close` 占位图。
- 装机：`D:\WestPlay\westplay.exe` `24,674,816 B` / `1C687CDA…`；`D:\WestPlay\ui` 76 个文件（换下来的 `cabin-DXaDtetO.js` 已清）。

### 91.5 边界

1. **这张图对卡车没有内容**，不是元素写错了：同样的 `ui::text` 写法在后视镜上一直有效（§84、§88）。
2. `g_cam_parking`、`parking_cams` 是游戏自己的开关/按键，有效于乘用车；对卡车按下它会把镜子的渲染目标换成摄像头画面，
   卡车没有摄像头源 → 镜子变占位图。**再按一次或重启游戏恢复**。
3. 测试期间手动给游戏 `config.cfg` 加过 `uset g_cam_parking "1"`，已按备份还原；WestPlay 本身从不写游戏配置。
4. 模组里那个 `park` 元素是**留着给插件用**的：插件若能在 R 档把真实车尾画面渲进这个目标（或自己渲一张纹理贴到页面上），
   这块就直接变成可用的画面，不用再动模组结构。
5. 平板/窗口屏（`patch_window_script`）不加这个元素；`live` 只在游戏内（`isInHost()`）生效。
6. 安装包自带的那份垫底 `westplay.scs` 仍是 **layout 3**（§89 做的那份）：只在新机器、游戏还没跑过时顶上，程序会按本机文件重做成 5。
7. 想真正拿到车尾画面只剩两条路：**插件改镜子的相机矩阵**（把 `close` 那张渲成后方视角，页面在 R 档整屏显示它；镜子在 R 档
   会暂时变成车尾视角），或者插件自己再渲一遍世界。前者是这条线的下一步可行性探针。

### 91.6 产物

- `D:\West Update\WestPlay_2.1.4_x64-setup.exe` `11,828,632 B` /
  `9754F1D53F5FEFE1ED2AF285BFE00D2DD9BCF85EFB8EEA23946C58A18B205D7F`。
- 桌面程序 `D:\WestPlay\westplay.exe` `24,674,816 B` /
  `1C687CDA37259B0F0371240F3DD544AB8C2C87834A2D97F4421B075AFA0F4090`。

### 91.7 两个 zip

`WestPlay-2.1.4-src-full.zip` 695 项 / 10,697,008 B /
`CBD340DAFCCB7FC22B257C576599C9BEC8577D5A1BC4D9A92AB734063ABF3655`；
`westplay-mods-src-214.zip` 454 项 / 1,733,728 B /
`16DC46FECD92F36A7A339FBB46840D75F5AB60EC07CABBD1DDC6149D850B598C`。
（项数与 §91 第一版相同；换掉的是 `game_mod.rs`、`reverse/layout.ts`、`layout.test.ts` 三份源码与几份文档。）
包里那份 `FIXES.md` 是切包那一刻的（§91.7 这两行是切包之后填的），数字以上面为准。

## 92. 屏幕显示原版导航时，那两个虚拟后视镜的框还在 —— 撤掉镜面元素

### 92.1 症状

owner 2026-11-04 18:03（截图：车机上是原版导航的地图、右上「W」、底部一排按钮）：屏幕**左上角和右上角各有一个框**，
一个里面是引擎的 `close` 占位图（"close" 字样 + 红绿辅助线），另一个是条纹占位图；导航本身正常。

- 只要 **WestPlay 的页面没在显示**（屏幕关掉、或者车机显示原版导航）就出现，任何卡车都有。
- 页面打开时这两个框的位置正好是仪表盘上的后视镜槽（§88 的「虚拟后视镜」）。

### 92.2 根因

模组把**三个** `ui::text` 元素加进 GPS 的「screen on」组（`id: 100`）：`_nameless.westplay.park`、
`_nameless.westplay.near_mirror`、`_nameless.westplay.far_mirror`，都在 **层 99**；WestPlay 自己的页面元素
`_nameless.westplay.screen` 在**层 100**（`SCREEN_LAYER`）。

- 插件把页面那张屏幕纹理填成 App 的画面（`screens.rs`）；WestPlay 关掉时填成**全透明**（`TRANSPARENT` 那张全零纹理），
  于是组里 0–3 层的原版导航透出来 —— 这是设计。
- 但那三个元素是**游戏自己画的 UI 元素**：页面的纹理透不透明跟它们无关，它们照旧在层 99 画。
  层 99 压在原版导航（0–3 层）上面 ⇒ 导航一显示，两个框就骑在上面。
- 框里的内容是引擎的镜面渲染目标；驻车摄像头模式开着时它们是占位图（§91 那条），所以框里写的是 `close`。
- 页面侧的挖孔（`holeMask`）只负责「把层 99 的镜子从页面里透出来」，它**控制不了元素的可见性** ——
  元素在页面之外，插件也没有办法按名字去隐藏某个 UI 元素（它只认纹理）。

### 92.3 改法

owner：「不用做后视镜了，让屏幕显示原版导航时不显示这两个虚拟后视镜的框」。撤掉这三个元素：

- `crates/setup/src/game_mod.rs`：`patch_gps_script` 只加 `_nameless.westplay.screen`（层 100）；
  `patch_window_script`（平板/窗屏那条路）同样只加屏幕；`PARK_*`、`NEAR_MIRROR*`、`FAR_MIRROR*`、
  `MirrorSide`、`mirrors()`、`NEAR_SLOT`/`FAR_SLOT` 一并删掉；`LAYOUT` 5 → **6**（程序会重做一次模组）。
- 页面：删 `cabin/dashboard/MirrorWidget.tsx`、`cabin/dashboard/mirrorHole.ts`；`Shell.tsx` 不再挖镜子的孔、
  不再渲染 `MirrorWidget`；设置页删掉「虚拟后视镜」这一项及其三语文案（`strings.ts` 的 `mirror` / `mirrorFooter`）。
- 留着不动的：`cabin/dashboard/mirror.ts` 与 `mirror.test.ts`（槽位几何，将来插件自己把镜面画面塞进页面时还要用）、
  `store.ts` 的 `mirrorOn`（旧设置里存过，读进来不报错，只是没人用了）、`dashboard.css` 里那几条 `.mirror-*` 规则。
- 代价写在明处：**仪表盘上不再有镜面预览**（打灯时也不再有镜子画面），换来一屏干净的原版导航；车上的真镜子不受影响。

### 92.4 验证

- `cargo test -p westplay-setup`：**70 通过**（原 71：删掉「每面镜子各占一块」的用例）。新断言：
  GPS 脚本里没有 `near_mirror` / `far_mirror` / `westplay.park`，`layer: 99` 出现 **0** 次，
  `my_children` 为 **3**（2 个原版 + screen），窗屏那条为 **2**，行尾 CRLF 原样。
- `node node_modules/typescript/bin/tsc -b`：0；`vitest run`：**79 文件 / 596 用例** 全过。
- 安装包 `11,826,217 B` / `05E00019E83E55DD83487384045DF74D69D0B0826602FD508BF9AA184B0DE815`；
  exe `24,660,480 B` / `3AC22D501CB61D0FBF87FBAFD93C0D961E6CCEF8336A5DA1DF756F8CB2B100EE`；
  `D:\WestPlay\ui` 76 个文件（清掉 6 个旧 bundle）。
- 模组：程序启动后自己重做（日志 `setup: WestPlay's mod made again`），`layout.txt` = **6**，1,827,636 B，278 项；
  GPS 脚本里 `near_mirror` / `park` 都没了、`westplay.screen` 还在。

### 92.5 边界

1. 后视镜本身没动：游戏自己的镜子、创意工坊那套「Digital Mirrors Camera System」（材质同样是引擎的镜面目标）照旧。
2. 打灯时屏幕不再出镜子画面（原来是挖孔 + 层 99 的两个元素）；要回来只有一条路：插件把镜面画面自己送进页面里（§91 的显示半截）。
3. 窗屏那条路（Setra 玩具 GPS 等）也只加屏幕；`NEAR_SLOT` / `FAR_SLOT` 随元素删掉，`mirror.ts` 里同一组数字留着。
4. `mirrorOn` 与老 localStorage 里的值不报错、不再起作用。
5. 模组要重做成 layout 6 才生效：程序下次启动会做（游戏关着时），没重做前（layout 5）框还在。
6. 平板（`TABLET` 布局）从来没加过这三个元素，不受影响。

### 92.6 产物

- 安装包：`WestPlay_2.1.4_x64-setup.exe`，`11,826,217 B` / `05E00019E83E55DD83487384045DF74D69D0B0826602FD508BF9AA184B0DE815`。
- 桌面程序：`D:\WestPlay\westplay.exe`，`24,660,480 B` / `3AC22D501CB61D0FBF87FBAFD93C0D961E6CCEF8336A5DA1DF756F8CB2B100EE`。
- 模组：`Documents\WestPlay\westplay.scs`，`1,827,636 B`，278 项，`layout.txt` = 6。

### 92.7 两个 zip

`WestPlay-2.1.4-src-full.zip`、`westplay-mods-src-214.zip`，数字见 `D:\West Update` 里那份与本文件末尾的说明。