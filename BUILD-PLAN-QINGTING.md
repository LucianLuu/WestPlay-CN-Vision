# 蜻蜓FM WebApp —— 编译与部署计划

> 这份源码树 = WestPlay 2.1.2 + 第 1/2 批修复 + 第 3 批“蜻蜓FM WebApp” + 第 4 批“地名/公司汉化”。
> 第 4 批是纯界面改动（`ui/src/cabin/dashboard/placeNames.ts`、`destination.ts`），会随 `tauri build` 自动进 `ui/dist`，不需要额外的宿主改动。
> 编译机按 `BUILD-GUIDE.md` 的前提准备：Windows x64、Rust（**MSVC** 工具链）、Node 20+、VS 的 C++ 生成工具（`link.exe`）、WebView2 Runtime。
> 相关文档：`_docs-after-market/SERVER-BRIEF-QINGTING.md`（改动与实测）、`_docs-after-market/PLAN.md`（总计划）、`_docs-after-market/FIXES.md`（缺陷记录）。

---

## 0. 先记住一句

**本批改了宿主（Rust + `include_str!` 的 `webapp.js`），必须重编 `westplay.exe`；只换 `ui/dist` 不够。**
`westplay.dll`（游戏插件）没有改，不用重编、游戏不用退。

---

## 1. 这次加了什么

| 项 | 内容 |
|---|---|
| App 槽位 | 上游未发布的 `podcasts` 提前放出，显示**蜻蜓FM**；Home 顺序：地图 · QQ音乐 · 网易云 · AppleMusic · 哔哩哔哩 · **蜻蜓FM** · 天气 · 设置 |
| 站点 | `https://www.qtfm.cn/`（`qingting.fm` 会 302 过去）；WebView2 profile `webview2-qingting` |
| 媒体控件 | 封面、节目名、主播、播放/暂停、上一集/下一集；后台播放同样有效 |
| 站点特性 | **没有 MediaSession**、`<audio>` 不在 DOM 里（脚本自建）；`webapp.js` 读 `.player-wrapper` 播放条，并识别 `.prev/.play-pause/.next` 三个无文字按钮 |
| 歌词 | 蜻蜓FM 没有；同时修掉了“拿 B 站标题去网易云搜歌词”的噪音 |

改动文件全表见 `_docs-after-market/SERVER-BRIEF-QINGTING.md` §2。

---

## 2. 编译（在源码树根目录）

```powershell
# 0) 前端依赖（根目录的 postinstall 会自动装 ui 的依赖）
npm ci

# 1) 插件（本批没改，但 BUILD-GUIDE 的冷启动顺序如此；只出 exe 也可跳过这步）
cargo build --release -p westplay-plugin

# 2) 出 exe：自动跑 ui 的 build:release（tsc -b + vite build），再编 host/app
npx --no-install tauri build --no-bundle
```

产物：

```
target\release\westplay.exe
target\release\westplay.dll   （第 1 步；打安装包才必须）
ui\dist\                      （第 2 步自动生成）
```

> 如果 `C:` 空间紧张，可把 `target` 放到别的盘：`$env:CARGO_TARGET_DIR='D:\westplay-target'`，或把 `target` 做成指向 D 盘的 junction。`tauri build` 的产物路径会跟着变。

---

## 3. 验证（建议全跑）

```powershell
npm --prefix ui run build            # tsc -b + vite build；0 错误
npm --prefix ui test                 # vitest run；期望 441 passed（原 440 + webapp.js 编译测试）
cargo test -p westplay-host --lib    # 全过（本次没有删/改原有测试）
```

本次已在本机验证过的（没有 Rust/MSVC，所以宿主没编）：

- `tsc -b` 0 错误
- `vitest run` **441 passed**
- 把真实的 `webapp.js` 注入 `qtfm.cn` 节目页、真实点击播放，收到：
  ```json
  {"title":"诡吹灯续·四部合集 片花","artist":"中广影音",
   "artwork":"https://pic.qtfm.cn/device/…/1729158655999_PcBjvLh8S.jpg!200",
   "playing":true,"lyric":null}
  ```
  暂停后同一节目回报 `"playing":false`

---

## 4. 部署

```powershell
Get-Process westplay -ErrorAction SilentlyContinue | ForEach-Object { $_.Kill() }
Start-Sleep 2

Copy-Item target\release\westplay.exe <安装目录>\westplay.exe -Force
robocopy ui\dist <安装目录>\ui /MIR

Start-Process <安装目录>\westplay.exe -WorkingDirectory <安装目录>
```

**exe 和 `ui/dist` 必须一起拷**：
- 只拷 exe → 宿主认识 `qingting`，但界面没有蜻蜓FM 图标；
- 只拷 `ui/dist` → 主页出现蜻蜓FM 图标，但旧宿主不认 `qingting`，点开停在 Opening。

> 本包**没有带 `ui/dist`**（它是构建产物，`tauri build` 会生成），所以第 2 步不能省。

---

## 5. 实机验收

- [ ] Home 里“蜻蜓FM”在“哔哩哔哩”和“天气”之间
- [ ] 点开 → `www.qtfm.cn` 首页，右侧完整、打开不跳变
- [ ] 点任意节目 → 播放条出现 → 主页 Now Playing 显示**封面 + 节目名 + 主播**
- [ ] 主页三键：播放/暂停、上一集、下一集都作用在页面上
- [ ] 退出 App（回主页）后声音继续，Now Playing 仍在
- [ ] 页面搜索框 → 座舱键盘升起，能输入、回车
- [ ] 换站点再回来：`webview2-qingting` 登录态还在
- [ ] 回归：B站封面正常（上一批的 `no-referrer`）、QQ音乐/网易云媒体控件正常、拖音量条不卡
- [ ] 第 4 批：天气页城市显示中文（Paris→巴黎）；交货公司/城市显示中文（Transportes Caballeria→卡瓦列里亚运输，Valladolid→巴利亚多利德）

---

## 6. 可能踩的坑（对应 BUILD-GUIDE §8）

| 现象 | 处理 |
|---|---|
| `link.exe not found` | 装 VS Build Tools「使用 C++ 的桌面开发」，必须 MSVC，不要 GNU |
| `Release build blocked: public/… placeholders` | 这棵树里 `public/placeholder-*`、`public/dev-map` 不存在，正常；若你合并了别的东西，清空它们 |
| 换了界面但 App 还是旧的 | 只拷了 exe；`ui\dist\*` 也要拷，然后重启 App |
| 蜻蜓FM 点开一直 Opening | 用了旧 exe（`qingting` 解析失败）；确认 `westplay.exe` 的时间戳是这次编的 |
| 改了 `webapp.js` 没生效 | 它是 `include_str!` 进 exe 的，必须重编 |
| 插件没更新 / 还是旧行为 | 本批没改插件；若你动过 `crates/plugin` 或 `crates/shared`，退游戏后重开 App |
| Rust 下载超时（国内） | 用 rsproxy：`RUSTUP_DIST_SERVER=https://rsproxy.cn`、`RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup`；crates 可用 rsproxy sparse 镜像 |

---

## 7. 已知限制

- 蜻蜓FM 没有歌词；主页第二行显示主播/频道。
- 播放条 DOM（`.player-wrapper`、`.program-title` 等）是站点自己的 class，改版可能失效；日志里的 `[qingting] playing: …` 能看出是否还在读。
- 列表第一集/最后一集时，上一集/下一集会没有变化（站点自己不动），不会报错。
- 用的 `podcasts` 槽位是上游留给播客的；上游以后真发布 Podcasts 时需要决定是否让位。
