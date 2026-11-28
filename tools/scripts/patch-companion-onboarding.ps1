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
$marker = 'let r=e?.webLogins?.bilibili?.signedIn??!1'

if ($text.Contains($marker)) {
  Write-Output "已修补，跳过：$Path"
  return
}

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

$edits = @(
  @{ what = '引导步 YouTube → 哔哩哔哩'; before = $krBefore; after = $krAfter },
  @{ what = '引导步的 row 名 YouTube → 哔哩哔哩'; before = $rowBefore; after = $rowAfter },
  @{ what = '引导步的登录动作 → bilibili_sign_in'; before = $krSignInBefore; after = $krSignInAfter },
  @{ what = '引导两步 Spotify/Apple Music → 网易云音乐/QQ 音乐'; before = $stepsBefore; after = $stepsAfter },
  @{ what = '两步的文案取 accounts.netease / accounts.qqMusic'; before = $wordsBefore; after = $wordsAfter },
  @{ what = '服务登录步的按钮兜底文案'; before = $notNowSiteBefore; after = $notNowSiteAfter },
  @{ what = '哔哩哔哩登录步的按钮兜底文案'; before = $notNowAccountBefore; after = $notNowAccountAfter },
  @{ what = '账号页 Bilibili → 哔哩哔哩'; before = $nameBefore; after = $nameAfter },
  @{ what = '账号页词条 Bilibili → 哔哩哔哩'; before = $wordNameBefore; after = $wordNameAfter }
)

foreach ($edit in $edits) {
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
