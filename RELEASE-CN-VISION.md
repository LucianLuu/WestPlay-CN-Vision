# WestPlay CN Vision — 发布流程

本文件记录 WestPlay CN Vision 的构建、签名与发布步骤。原版 WestPlay 的更新机制由
`app/src/update.rs` 与 `app/tauri.conf.json` 的 `plugins.updater` 实现：每次启动后 30 秒查一次
GitHub Releases 的 `latest.json`，用**公钥**验签，通过才下载安装。

## 仓库与密钥

| 项目 | 值 |
|---|---|
| GitHub 仓库 | https://github.com/LucianLuu/WestPlay-CN-Vision |
| 更新地址 | `https://github.com/LucianLuu/WestPlay-CN-Vision/releases/latest/download/latest.json` |
| 公钥 | `D:\WestPlay-dev\keys\westplay-cn.key.pub`（已写进 `app/tauri.conf.json`）|
| 私钥 | `D:\WestPlay-dev\keys\westplay-cn.key`（**不要提交，不要外传**）|

> **私钥丢失 = 永远无法再发更新**（玩家端公钥已固定，换钥要让所有玩家重装）。
> 请把 `westplay-cn.key` 备份到离线介质（U 盘 / 密码管理器）。

## 一、构建并签名

Tauri 在 `tauri build` 时用环境变量里的私钥自动签名，并生成 `latest.json` 里的 `signature` 字段。

```powershell
# 密钥（每次构建都要设）
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "D:\WestPlay-dev\keys\westplay-cn.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

# 构建环境
$env:CARGO_HOME   = "D:\WestPlay-dev\toolchain\rust\cargo"
$env:RUSTUP_HOME  = "D:\WestPlay-dev\toolchain\rust\rustup"
$env:PATH         = "D:\WestPlay-dev\toolchain\rust\cargo\bin;" + $env:PATH
$env:CARGO_TARGET_DIR = "D:\WestPlay-dev\target-240"
$env:CARGO_BUILD_JOBS = "8"

cd D:\WestPlay-dev\src-240-clean
cargo build --release --workspace
# 拷插件与辅助程序（bundle 配置从这里取）
Copy-Item "$env:CARGO_TARGET_DIR\release\deps\westplay.dll"        app\dist-plugin\ -Force
Copy-Item "$env:CARGO_TARGET_DIR\release\westplay-maps.exe"        app\dist-plugin\ -Force
Copy-Item "$env:CARGO_TARGET_DIR\release\westplay-probe.exe"       app\dist-plugin\ -Force
# 清掉 dev 版 exe，让 tauri 重新打
cargo clean -p westplay-app
node node_modules\@tauri-apps\cli\tauri.js build --bundles nsis --config D:\WestPlay-dev\tools\scripts\bundle-240.json
```

产物在 `D:\WestPlay-dev\target-240\release\bundle\nsis\`：

```
WestPlay_<版本>_x64-setup.exe          安装包（已签名）
WestPlay_<版本>_x64-setup.exe.sig      安装包的签名
latest.json                            更新清单（含 signature 字段）
```

## 二、发版到 GitHub

1. 改 `app/tauri.conf.json` 的 `version`（如 `2.4.0` → `2.5.0`）
2. 按上面重新构建（**必须带 TAURI_SIGNING_PRIVATE_KEY**，否则没有签名
   —— `requireSignedVersion: true` 会让没签名的包装不上）
3. 到 https://github.com/LucianLuu/WestPlay-CN-Vision/releases/new 建 release：
   - Tag：`v<版本>`（如 `v2.5.0`）
   - 附件上传：`WestPlay_<版本>_x64-setup.exe`、`WestPlay_<版本>_x64-setup.exe.sig`、`latest.json`
   - **不要**勾选 draft / pre-release（玩家端查的是 `releases/latest`）
4. 发布

## 三、验证

玩家端（或本机）装上后看日志：

```
[update] WestPlay <新版本> is available
```

若出现 `[update] couldn't look for an update`，检查：
- 仓库是否 public
- release 是否**不是** draft / prerelease
- 三个附件是否都传了

## 四、签名自检（不依赖 Tauri 构建）

```powershell
$key = Get-Content "D:\WestPlay-dev\keys\westplay-cn.key" -Raw
node node_modules\@tauri-apps\cli\tauri.js signer sign -k $key --password "" <文件>
```

会生成 `<文件>.sig`，其内容就是 `latest.json` 里那个 `signature`。

## 五、不要做的事

- ❌ 不要提交私钥到仓库
- ❌ 不要用别的密钥签名（玩家端会验签失败，拒绝更新）
- ❌ 不要改 `identifier`（`app.westplay`）：改了玩家会装成新软件，数据不继承
