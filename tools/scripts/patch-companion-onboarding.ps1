<#
  预编译 3.0 companion（`ui/dist/index.html` + `assets/companion-*.js`）的新手引导与账号页修补。

  这份 companion 是 3.0 的 dist，源码不在本仓、`ui/dist` 也不进 git，改不了它的组件，
  所以只能在打包好的 bundle 上做**定点的字符串替换**：每一条替换都要求目标串在文件里
  唯一出现，命中数不对就整体失败、不落盘（避免半修状态）。

  修四件事（owner 2026-11-28）：
  1. 新手引导里的三个登录步，全部换成本产品的站点：
     - 「YouTube」步 → 「哔哩哔哩」（`kr`）：登录态、登录/退出都走宿主的 `bilibili_*`；
     - 「登录 Spotify」步 → 「登录网易云音乐」（`Ar.spotify`）：走 `netease_*`；
     - 「登录 Apple Music」步 → 「登录 QQ 音乐」（`Ar.appleMusic`）：走 `qq_music_*`。
     原来走的是 3.0 的 `youtube_*` / `spotify_*` / `apple_music_*` 命令，我们宿主没有，
     按了没反应；演示屏的路由本来就给了这三个槽位（`youtube` → 哔哩哔哩、
     `spotify` → 网易云音乐、`youtubeMusic` → QQ 音乐），跟着一起就对了。
  2. 这几步底部按钮的文案：3.0 那份词条里 `accounts` 少了 `notNow`（CN 版新增三个站点时
     漏掉的），`a?l.continue:u.notNow` 取到 undefined，按钮就是个空白的灰圆 —— 这就是
     用户截图二圈出来的那个。兜底成「跳过」（signedIn 时仍用词条里的「继续」）。
  3. 账号页第一行 `Bilibili` → `哔哩哔哩`。
  4. 引导步里 row 名硬编码的 `YouTube` → `哔哩哔哩`。
  5. 账号页补上两行（owner 2026-11-28 那天接着说）：`酷狗音乐`（`kugou_*`，登录是在
     车机屏幕上开酷狗自己的扫码）和 `Apple Music`（`apple_music_*`，宿主本来就有这几个命令，
     3.0 的账号页去掉过）。它们的登录态：酷狗来自宿主状态里的 `kugouSignedIn`（层的
     `/kugou/health`），Apple Music 还是 `appleMusicSignedIn`。

  用法：
    pwsh -File tools/scripts/patch-companion-onboarding.ps1                    # 改仓库 ui/dist
    pwsh -File tools/scripts/patch-companion-onboarding.ps1 -Path <file>       # 改指定 bundle
    pwsh -File tools/scripts/patch-companion-onboarding.ps1 -Restore           # 从 .before-cn-guide 还原
  重复跑是安全的：已经打过补丁的文件会以「已修补」直接退出。
#>
param(
  [string]$Path = (Join-Path $PSScriptRoot '..\..\ui\dist\assets\companion-BB_QWF30.js'),
  [switch]$Restore
)

$ErrorActionPreference = 'Stop'
$Path = (Resolve-Path -LiteralPath $Path).Path
$backup = "$Path.before-cn-guide"

if ($Restore) {
  if (-not (Test-Path -LiteralPath $backup)) { throw "没有备份可还原：$backup" }
  Copy-Item -LiteralPath $backup -Destination $Path -Force
  Write-Output "已还原 $Path（$((Get-Item -LiteralPath $Path).Length) 字节）"
  return
}

$text = [IO.File]::ReadAllText($Path)

# 1. YouTube 引导步 → 哔哩哔哩（`kr`）
$krBefore = 'function kr({status:e,next:t,back:n}){let r=e?.youtubeSignedIn??!1,i=e?.youtubeSigningIn??!1,a=zn(e?.youtubeSignedIn!=null,me),o=Ln(r,pe),s=H(),c=s.accounts;'
$krAfter = 'function kr({status:e,next:t,back:n}){let r=e?.webLogins?.bilibili?.signedIn??!1,i=e?.webLogins?.bilibili?.signingIn??!1,a=zn(e?.webLogins?.bilibili?.signedIn!=null,()=>k(`bilibili_check`)),o=Ln(r,()=>k(`bilibili_sign_out`)),s=H(),c=s.accounts.bilibili;'
$rowBefore = 'title:`YouTube`'
$rowAfter = 'title:`哔哩哔哩`'
$krSignInBefore = 'onClick:()=>fe()'
$krSignInAfter = 'onClick:()=>k(`bilibili_sign_in`)'

# 2. Spotify / Apple Music 两步 → 网易云音乐 / QQ 音乐（`Ar`）
$stepsBefore = 'var Ar={spotify:{name:`Spotify`,app:`spotify`,glow:W.spotify,signedIn:e=>e?.spotifySignedIn,signingIn:e=>e?.spotifySigningIn??!1,check:_e,signIn:he,signOut:ge},appleMusic:{name:`Apple Music`,app:`music`,glow:W.music,signedIn:e=>e?.appleMusicSignedIn,signingIn:e=>e?.appleMusicSigningIn??!1,check:Se,signIn:P,signOut:ve}}'
$stepsAfter = 'var Ar={spotify:{name:`网易云音乐`,app:`spotify`,glow:W.spotify,signedIn:e=>e?.webLogins?.netease?.signedIn??null,signingIn:e=>e?.webLogins?.netease?.signingIn??!1,check:()=>k(`netease_check`),signIn:()=>k(`netease_sign_in`),signOut:()=>k(`netease_sign_out`)},appleMusic:{name:`QQ 音乐`,app:`youtubeMusic`,glow:W.spotify,signedIn:e=>e?.webLogins?.qqMusic?.signedIn??null,signingIn:e=>e?.webLogins?.qqMusic?.signingIn??!1,check:()=>k(`qq_music_check`),signIn:()=>k(`qq_music_sign_in`),signOut:()=>k(`qq_music_sign_out`)}}'

# 这两步的文案跟着服务走：`d=l[e]` 取的是词条里以服务 id 命名的块，
# 而我们要的是 `accounts.netease` / `accounts.qqMusic`。
$wordsBefore = 'u=l.accounts,d=l[e];'
$wordsAfter = 'u=l.accounts,d=l.accounts[e===`spotify`?`netease`:`qqMusic`];'

# 3. 底部那颗按钮：词条里 accounts 没有 notNow，取不到就成了空按钮。
$notNowSiteBefore = 'children:a?l.continue:u.notNow}'
$notNowSiteAfter = 'children:a?l.continue:u.notNow||`跳过`}'
$notNowAccountBefore = 'children:r?s.continue:c.notNow}'
$notNowAccountAfter = 'children:r?s.continue:c.notNow||`跳过`}'

# 4. 名字
$nameBefore = 'ni={bilibili:{name:`Bilibili`,'
$nameAfter = 'ni={bilibili:{name:`哔哩哔哩`,'
$wordNameBefore = 'bilibili:{title:`Bilibili`,sub:`登录后'
$wordNameAfter = 'bilibili:{title:`哔哩哔哩`,sub:`登录后'

# 5. 账号页补「酷狗音乐」「Apple Music」两行。服务的登录态取自宿主状态：酷狗是 `kugouSignedIn`
#    （层的 `/kugou/health`），Apple Music 还是 `appleMusicSignedIn`（宿主本来就有这几个命令）。
#    酷狗没有网页登录页（层的 `/kugou/qr` 只答 JSON），所以它的「登录」是让车机屏幕把酷狗应用
#    开起来、用它自己的二维码（宿主收到 `kugou_sign_in` 后通知车机，`state/store.ts` 的 `case 'kugou'`）。
$servicesBefore = 'words:e=>e.accounts.qqMusic}},ri=[`bilibili`,`netease`,`qqMusic`];'
$servicesAfter = 'words:e=>e.accounts.qqMusic},kugou:{name:`酷狗音乐`,app:`kugou`,glow:W.spotify,signIn:()=>k(`kugou_sign_in`),signOut:()=>k(`kugou_sign_out`),signingIn:e=>e?.webLogins?.kugou?.signingIn??!1,words:e=>e.accounts.kugou},appleMusic:{name:`Apple Music`,app:`music`,glow:W.music,signIn:()=>k(`apple_music_sign_in`),signOut:()=>k(`apple_music_sign_out`),signingIn:e=>e?.appleMusicSigningIn??!1,words:e=>e.appleMusic}},ri=[`bilibili`,`netease`,`qqMusic`,`kugou`,`appleMusic`];'

$accountsListBefore = 'function De(e){return{bilibili:e?.webLogins?.bilibili?.signedIn??null,netease:e?.webLogins?.netease?.signedIn??null,qqMusic:e?.webLogins?.qqMusic?.signedIn??null}}'
$accountsListAfter = 'function De(e){return{bilibili:e?.webLogins?.bilibili?.signedIn??null,netease:e?.webLogins?.netease?.signedIn??null,qqMusic:e?.webLogins?.qqMusic?.signedIn??null,kugou:e?.kugouSignedIn??null,appleMusic:e?.appleMusicSignedIn??null}}'

$checksBefore = 'k(`qq_music_check`).catch(()=>{})},[])'
$checksAfter = 'k(`qq_music_check`).catch(()=>{}),k(`kugou_check`).catch(()=>{})},[])'

# 账号页词条：zh-CN 的 `accounts` 跟着补一块 `kugou`，文案与 `qqMusic` 那块同形。
$kugouWordsBefore = 'text:`请在浏览器窗口中继续`}}},spotify:{title:`登录 Spotify`'
$kugouWordsAfter = 'text:`请在浏览器窗口中继续`}},kugou:{title:`酷狗音乐`,sub:`登录后在卡车屏幕上播放自己的歌单和收藏。`,signIn:`登录`,signOut:`退出登录`,signedIn:`已登录`,notSignedIn:`未登录`,finishInWindow:`请在车机屏幕上用酷狗音乐 App 扫码登录`,signingIn:{title:`登录`,text:`请在车机屏幕上的酷狗音乐里扫码`}}},spotify:{title:`登录 Spotify`'

$edits = @(
  @{ what = '引导步 YouTube → 哔哩哔哩'; before = $krBefore; after = $krAfter },
  @{ what = '引导步的 row 名 YouTube → 哔哩哔哩'; before = $rowBefore; after = $rowAfter },
  @{ what = '引导步的登录动作 → bilibili_sign_in'; before = $krSignInBefore; after = $krSignInAfter },
  @{ what = '引导两步 Spotify/Apple Music → 网易云音乐/QQ 音乐'; before = $stepsBefore; after = $stepsAfter },
  @{ what = '两步的文案取 accounts.netease / accounts.qqMusic'; before = $wordsBefore; after = $wordsAfter },
  @{ what = '服务登录步的按钮兜底文案'; before = $notNowSiteBefore; after = $notNowSiteAfter },
  @{ what = '哔哩哔哩登录步的按钮兜底文案'; before = $notNowAccountBefore; after = $notNowAccountAfter },
  @{ what = '账号页 Bilibili → 哔哩哔哩'; before = $nameBefore; after = $nameAfter },
  @{ what = '账号页词条 Bilibili → 哔哩哔哩'; before = $wordNameBefore; after = $wordNameAfter },
  @{ what = '账号页补酷狗音乐与 Apple Music 两行'; before = $servicesBefore; after = $servicesAfter },
  @{ what = '账号页两行的登录态（kugouSignedIn / appleMusicSignedIn）'; before = $accountsListBefore; after = $accountsListAfter },
  @{ what = '账号页挂载时问酷狗的登录态'; before = $checksBefore; after = $checksAfter },
  @{ what = 'zh-CN 词条补 accounts.kugou'; before = $kugouWordsBefore; after = $kugouWordsAfter }
)

foreach ($edit in $edits) {
  # 已经打过的（`after` 就在文件里）跳过，所以从原版或者打了一半的都能接着打。
  if ($text.Contains($edit.after)) {
    Write-Output "已是：$($edit.what)"
    continue
  }
  $hits = ([regex]::Matches($text, [regex]::Escape($edit.before))).Count
  if ($hits -ne 1) {
    throw "「$($edit.what)」的目标串命中 $hits 次（应为 1），补丁未写入。bundle 可能换过版本。"
  }
  $text = $text.Replace($edit.before, $edit.after)
  Write-Output "改好：$($edit.what)"
}

if (-not (Test-Path -LiteralPath $backup)) {
  Copy-Item -LiteralPath $Path -Destination $backup
}
[IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "写入 $Path（$((Get-Item -LiteralPath $Path).Length) 字节，备份 $backup）"
