"""KuGou Music's own service, asked the way `MakcRe/KuGouMusicApi` asks it.

The same layer that answers NetEase Cloud Music (server.py) also answers this, under `/kugou/`, so
both cabins' music apps share one process and no extra runtime ships. Everything here is Python's
standard library: no `requests`, no Node.

What is asked, and of whom:

    网易云 goes to `music.163.com`.  KuGou spreads its service over a few hosts, and this file uses the
    same ones the Android client does:

    * `gateway.kugou.com` — the signed (x-router) API: search, the playlist square, a playlist's songs.
    * `mobilecdn.kugou.com/api/v3` — the older open catalog: charts, chart songs, singers, a singer's songs.
    * `lyrics.kugou.com` — lyric search and download (plain LRC).
    * `trackercdn.kugou.com` — where a song's audio is (the open `kgcloudv2` key, no account needed).

Signing is MD5 over the sorted parameters, with the salt the Android build uses (`OIlwieks…`), plus
the `key` the play url wants (`57ae12eb…`). A song's mid and its device's are the client's own: the
`mid` is the first half of a GUID's MD5, and `dfid` is left as the guest's `-`, which the service
accepts for the catalog.

The songs come back flattened (server.py's `_song` shape): the page never has to know that a chart
song calls its title `songname` and its length `duration` while a playlist's calls them `name` and
`timelen`, or that a song's picture is `{size}` in some answers and `{size}` in others.
"""

import base64
import hashlib
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

# The Android build's own names, which the service checks.
ANDROID_UA = "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi"
WEB_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

APPID = 1005
CLIENTVER = 20489
ANDROID_SALT = "OIlwieks28dk2k092lksi2UIkp"
SIGNKEY_SALT = "57ae12eb6890223e355ccfcb74edf70d"
WEB_SALT = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt"

TIMEOUT = 20

# The device this layer is, for the run: a GUID's MD5 (the client's own way of making a `mid`).
_GUID = str(uuid.uuid4())
_MID = str(int(hashlib.md5(_GUID.encode()).hexdigest(), 16))

# The account, once there is one (`token`, `userid`, `nickname`): empty for a guest.
_lock = threading.Lock()
_account = {"token": "", "userid": 0, "nickname": "", "avatar": ""}


class KuGouError(Exception):
    """What went wrong, as the page says it: the service's own words where it has them."""

    def __init__(self, message: str, code=None):
        super().__init__(message)
        self.code = code


def md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _sign(params: dict, data: str = "") -> str:
    """The Android signature: salt, the sorted `key=value` pairs, the body, salt."""
    parts = []
    for key in sorted(params):
        value = params[key]
        if isinstance(value, (dict, list)):
            value = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        parts.append(f"{key}={value}")
    return md5(ANDROID_SALT + "".join(parts) + data + ANDROID_SALT)


def _web_sign(params: dict, data: str = "") -> str:
    """The web signature: the H5 client's, for the login service."""
    parts = "".join(sorted(f"{key}={params[key]}" for key in params))
    return md5(WEB_SALT + parts + data + WEB_SALT)


def _open(request: urllib.request.Request, timeout: int = TIMEOUT):
    """One request, its JSON answer; the service's own refusal said as an error."""
    try:
        with urllib.request.urlopen(request, timeout=timeout) as answer:
            raw = answer.read()
    except urllib.error.HTTPError as error:
        raise KuGouError(f"KuGou: {error.code}", error.code) from error
    except urllib.error.URLError as error:
        raise KuGouError(f"KuGou: {error.reason}") from error
    try:
        return json.loads(raw.decode("utf-8", "replace"))
    except json.JSONDecodeError as error:
        raise KuGouError("KuGou: not JSON") from error


def _gateway(
    path: str,
    params: dict | None = None,
    body: dict | None = None,
    router: str = "",
    extra: dict | None = None,
) -> dict:
    """The signed API on the gateway (`x-router` names the service behind it)."""
    asked = {
        "dfid": "-",
        "mid": _MID,
        "uuid": "-",
        "appid": APPID,
        "clientver": CLIENTVER,
        "clienttime": int(time.time()),
    }
    if params:
        asked.update(params)
    data = ""
    if body is not None:
        data = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    asked["signature"] = _sign(asked, data)
    headers = {
        "User-Agent": ANDROID_UA,
        "dfid": str(asked["dfid"]),
        "mid": str(asked["mid"]),
        "clienttime": str(asked["clienttime"]),
        "kg-rc": "1",
        "kg-thash": "5d816a0",
        "kg-rec": "1",
        "kg-rf": "B9EDA08A64250DEFFBCADDEE00F8F25F",
    }
    if router:
        headers["x-router"] = router
    if extra:
        headers.update(extra)
    if body is not None:
        headers["Content-Type"] = "application/json"
    url = f"https://gateway.kugou.com{path}?{urllib.parse.urlencode(asked)}"
    request = urllib.request.Request(
        url, data=data.encode("utf-8") if data else None, headers=headers, method="POST" if data else "GET"
    )
    answer = _open(request)
    status = answer.get("status")
    if status not in (1, None) and answer.get("error_code"):
        raise KuGouError(str(answer.get("error") or answer.get("errmsg") or "KuGou refused"), answer.get("error_code"))
    return answer


def _mobile(path: str, params: dict | None = None) -> dict:
    """The open catalog (`mobilecdn.kugou.com/api/v3`): charts, singers, search."""
    asked = {"format": "json"}
    if params:
        asked.update(params)
    url = f"http://mobilecdn.kugou.com/api/v3/{path}?{urllib.parse.urlencode(asked)}"
    answer = _open(urllib.request.Request(url, headers={"User-Agent": WEB_UA}))
    if answer.get("status") not in (1, None):
        raise KuGouError(str(answer.get("error") or "KuGou refused"))
    return answer


def _cover(value) -> str:
    """A picture at the size the screen draws it (KuGou writes `{size}` into its own urls).

    Its hosts answer `https` too, and the page is a secure one: an `http` picture there is mixed content,
    so the scheme is raised once, here, rather than at every use.
    """
    if not isinstance(value, str) or not value:
        return ""
    value = value.replace("{size}", "240")
    if value.startswith("http://"):
        value = "https://" + value[len("http://") :]
    return value


def _song(raw: dict) -> dict:
    """One song, however the endpoint that gave it names things."""
    if not isinstance(raw, dict):
        return {}
    title = str(
        raw.get("songname")
        or raw.get("SongName")
        or raw.get("name")
        or raw.get("filename")
        or raw.get("FileName")
        or ""
    )
    # A playlist's and a singer's songs are "artist - title", the artist not in a field of its own.
    prefix = ""
    if " - " in title:
        before, after = title.rsplit(" - ", 1)
        prefix, title = before, after
    singers = raw.get("authors") or raw.get("Singers") or raw.get("singerinfo") or []
    named = []
    for each in singers if isinstance(singers, list) else []:
        if isinstance(each, dict):
            name = str(each.get("author_name") or each.get("name") or each.get("singername") or "")
            if name:
                named.append(name)
    artist = str(raw.get("singername") or raw.get("SingerName") or "") or "、".join(named) or prefix
    album = raw.get("album_name") or raw.get("AlbumName") or (raw.get("albuminfo") or {}).get("album_name") or ""
    hashes = raw.get("hash") or raw.get("FileHash") or ""
    length = raw.get("duration") or raw.get("timelen") or raw.get("Duration") or 0
    # A playlist's `timelen` is milliseconds; a chart's and a search's `duration` is seconds.
    seconds = int(length) // 1000 if int(length) > 36_000 else int(length)
    return {
        # The 128k file's own hash is the song's identity here (it's what a url is asked with).
        "id": str(hashes),
        "name": title.strip(),
        "artists": [artist] if artist else [],
        "album": album,
        "albumId": str(raw.get("album_id") or raw.get("AlbumID") or (raw.get("albuminfo") or {}).get("album_id") or ""),
        "albumAudioId": str(
            raw.get("album_audio_id") or raw.get("MixSongID") or raw.get("mixsongid") or raw.get("audio_id") or ""
        ),
        "picture": _cover(
            raw.get("album_sizable_cover")
            or raw.get("Image")
            or raw.get("cover")
            or (raw.get("albuminfo") or {}).get("album_cover")
        ),
        # KuGou counts in seconds.
        "duration": seconds,
        "privilege": int(raw.get("privilege") or raw.get("Privilege") or 0),
    }


def _collection(raw: dict) -> dict:
    tags = [str(each.get("tag_name")) for each in (raw.get("tags") or []) if isinstance(each, dict)]
    return {
        "id": str(raw.get("global_collection_id") or raw.get("specialid") or ""),
        "kind": "playlist",
        "name": str(raw.get("specialname") or raw.get("name") or "歌单"),
        "picture": _cover(raw.get("imgurl") or raw.get("pic") or raw.get("flexible_cover")),
        "description": str(raw.get("intro") or ""),
        "trackCount": int(raw.get("percount") or raw.get("count") or 0),
        "creator": str(raw.get("nickname") or raw.get("singername") or ""),
        "plays": int(raw.get("play_count") or 0),
        "tag": tags[0] if tags else "",
    }


# --- asking -----------------------------------------------------------------------------------


def search(words: str, page: int = 1, pagesize: int = 20) -> dict:
    """Songs for `words`."""
    answer = _gateway(
        "/v2/search/song",
        {
            "keyword": words,
            "page": max(1, page),
            "pagesize": min(max(pagesize, 1), 50),
            "platform": "AndroidFilter",
            "iscorrection": 1,
            "privilegefilter": 0,
            "area_code": 1,
            "dopicfull": 1,
        },
        router="complexsearch.kugou.com",
    )
    data = answer.get("data") or {}
    songs = [_song(each) for each in (data.get("lists") or [])]
    total = int(data.get("total") or 0)
    return {"songs": songs, "total": total}


def ranks() -> dict:
    """Every chart KuGou lists (56 of them, TOP500 and the rest), as the app's own list asks them.

    The open catalog (`mobilecdn` rank/list) still names the charts but its ids are the old ones, and a
    chart asked by one of those answers a single song (TOP500) or nothing at all; the signed list carries
    the ids the app itself uses (`rankid` 8888 for TOP500), and those answer their songs.
    """
    answer = _gateway("/ocean/v6/rank/list", {"plat": 2, "withsong": 1, "parentid": 0})
    entries = []
    for raw in ((answer.get("data") or {}).get("info") or []):
        if not raw.get("rankid"):
            continue
        entries.append(
            {
                "id": str(raw.get("rankid")),
                "name": str(raw.get("rankname") or ""),
                "picture": _cover(raw.get("img_9") or raw.get("imgurl") or raw.get("banner_9")),
                "note": str(raw.get("update_frequency") or ""),
                "issue": str(raw.get("issue") or ""),
            }
        )
    return {"ranks": entries}


def rank_songs(rankid: str, page: int = 1, pagesize: int = 30) -> dict:
    """One chart's songs."""
    answer = _mobile("rank/song", {"rankid": rankid, "page": max(1, page), "pagesize": min(pagesize, 50)})
    data = answer.get("data") or {}
    return {
        "songs": [_song(each) for each in (data.get("info") or [])],
        "total": int(data.get("total") or 0),
    }


def playlists(page: int = 1, pagesize: int = 12) -> dict:
    """The playlist square's own picks (`special_recommend`, as the home screen asks it)."""
    clienttime = str(int(time.time()))
    body = {
        "appid": APPID,
        "mid": _MID,
        "clientver": CLIENTVER,
        "platform": "android",
        "clienttime": clienttime,
        "userid": 0,
        "module_id": 1,
        "page": max(1, page),
        "pagesize": min(max(pagesize, 1), 30),
        "key": md5(f"{APPID}{ANDROID_SALT}{CLIENTVER}{clienttime}"),
        "special_recommend": {
            "withtag": 1,
            "withsong": 1,
            "sort": 1,
            "ugc": 1,
            "is_selected": 0,
            "withrecommend": 1,
            "area_code": 1,
            "categoryid": 0,
        },
        "req_multi": 1,
        "retrun_min": 5,
        "return_special_falg": 1,
    }
    answer = _gateway("/v2/special_recommend", body=body, router="specialrec.service.kugou.com")
    data = answer.get("data") or {}
    entries = [_collection(each) for each in (data.get("special_list") or [])]
    return {"playlists": entries, "more": bool(data.get("has_next"))}


def playlist_songs(gid: str, page: int = 1, pagesize: int = 30) -> dict:
    """A playlist's songs, a page at a time."""
    begin = (max(1, page) - 1) * pagesize
    answer = _gateway(
        "/pubsongs/v2/get_other_list_file_nofilt",
        {
            "area_code": 1,
            "begin_idx": begin,
            "plat": 1,
            "type": 1,
            "mode": 1,
            "personal_switch": 1,
            "extend_fields": "abtags,hot_cmt,popularization",
            "pagesize": min(pagesize, 50),
            "global_collection_id": gid,
        },
    )
    data = answer.get("data") or {}
    info = data.get("list_info") or {}
    songs = [_song(each) for each in (data.get("songs") or [])]
    return {
        "songs": songs,
        "total": int(data.get("count") or 0),
        "name": str(info.get("listname") or info.get("specialname") or ""),
        "more": begin + len(songs) < int(data.get("count") or 0),
    }


def singers(page: int = 1, pagesize: int = 20) -> dict:
    """Singers, the ones KuGou lists first."""
    answer = _mobile("singer/list", {"classid": 0, "page": max(1, page), "pagesize": min(pagesize, 30)})
    data = answer.get("data") or {}
    entries = [
        {
            "id": str(raw.get("singerid") or ""),
            "name": str(raw.get("singername") or ""),
            "picture": _cover(raw.get("imgurl") or raw.get("banner_url")),
            "songs": int(raw.get("songcount") or 0),
            "fans": int(raw.get("fanscount") or 0),
        }
        for raw in (data.get("info") or [])
    ]
    return {"singers": entries, "more": len(entries) >= pagesize}


def singer_songs(singerid: str, page: int = 1, pagesize: int = 30) -> dict:
    """A singer's songs."""
    answer = _mobile("singer/song", {"singerid": singerid, "page": max(1, page), "pagesize": min(pagesize, 50)})
    data = answer.get("data") or {}
    return {
        "songs": [_song(each) for each in (data.get("info") or [])],
        "total": int(data.get("total") or 0),
    }


def lyric(hash_: str, duration: int = 0, name: str = "", artist: str = "") -> dict:
    """A song's words, as plain LRC.

    KuGou's lyric service is searched by the song itself: its hash and length pick the exact file out of
    the candidates for the words, and the words alone are the fallback when it has none for that file.
    """
    asked = {"ver": "1", "man": "yes", "client": "pc", "keyword": (f"{name} {artist}" if artist else name).strip()}
    if hash_:
        asked["hash"] = hash_.lower()
    if duration:
        asked["duration"] = str(int(duration) * 1000)
    found = {"status": 0}
    try:
        found = _open(
            urllib.request.Request(
                "http://lyrics.kugou.com/search?" + urllib.parse.urlencode(asked),
                headers={"User-Agent": WEB_UA},
            )
        )
    except KuGouError:
        found = {"status": 0}
    candidates = found.get("candidates") or []
    if not candidates and hash_:
        # The hash was too strict for this one (a remaster, a different file of the same song): ask by words.
        asked.pop("hash", None)
        asked.pop("duration", None)
        try:
            found = _open(
                urllib.request.Request(
                    "http://lyrics.kugou.com/search?" + urllib.parse.urlencode(asked),
                    headers={"User-Agent": WEB_UA},
                )
            )
        except KuGouError:
            found = {"status": 0}
        candidates = found.get("candidates") or []
    if not candidates:
        return {"lrc": "", "translation": ""}
    chosen = candidates[0]
    for each in candidates:
        if hash_ and str(each.get("hash") or "").lower() == hash_.lower():
            chosen = each
            break
    download = {
        "ver": "1",
        "client": "pc",
        "id": chosen.get("id"),
        "accesskey": chosen.get("accesskey"),
        "fmt": "lrc",
        "charset": "utf8",
    }
    try:
        got = _open(
            urllib.request.Request(
                "http://lyrics.kugou.com/download?" + urllib.parse.urlencode(download),
                headers={"User-Agent": WEB_UA},
            )
        )
    except KuGouError:
        return {"lrc": "", "translation": ""}
    try:
        text = base64.b64decode(got.get("content") or "").decode("utf-8", "replace")
    except (ValueError, TypeError):
        text = ""
    return {"lrc": text.lstrip("\ufeff"), "translation": ""}


def audio(hash_: str, album_id: str = "") -> dict:
    """Where a song's audio is (the open `kgcloudv2` key, which needs no account).

    `status` 2 is the service saying the file isn't free (`本次请求需要验证`, a paid or VIP one): the
    page says so rather than playing silence.
    """
    key = md5(f"{hash_.lower()}kgcloudv2")
    asked = {
        "key": key,
        "hash": hash_.lower(),
        "pid": 2,
        "cmd": 25,
        "behavior": "play",
        "album_id": album_id or "",
        "vip": 1,
        "forceDown": 0,
    }
    answer = _open(
        urllib.request.Request(
            "http://trackercdn.kugou.com/i/v2/?" + urllib.parse.urlencode(asked),
            headers={"User-Agent": WEB_UA},
        )
    )
    urls = answer.get("url") or []
    if isinstance(urls, str):
        urls = [urls]
    return {
        "url": urls[0] if urls else "",
        "bitrate": int(answer.get("bitRate") or 0),
        "size": int(answer.get("fileSize") or 0),
        "status": answer.get("status"),
        "reason": str(answer.get("error") or ""),
    }


def open_stream(url: str, range_header: str = "") -> tuple:
    """A song's audio, open for the page's own `<audio>` (the layer is its proxy: KuGou's CDN is plain http).

    Answers `(status, headers, stream)`: 200 or 206, the upstream's own `Content-Type`/`Content-Length`/
    `Content-Range`, and the body to copy out.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise KuGouError("KuGou: not an audio url")
    headers = {"User-Agent": WEB_UA}
    if range_header:
        headers["Range"] = range_header
    request = urllib.request.Request(url, headers=headers)
    try:
        answer = urllib.request.urlopen(request, timeout=TIMEOUT)
    except urllib.error.HTTPError as error:
        if error.code == 416:
            raise KuGouError("KuGou: range not satisfiable", 416) from error
        raise KuGouError(f"KuGou: {error.code}", error.code) from error
    except urllib.error.URLError as error:
        raise KuGouError(f"KuGou: {error.reason}") from error
    wanted = {
        "Content-Type": answer.headers.get("Content-Type") or "audio/mpeg",
        "Content-Length": answer.headers.get("Content-Length") or "",
        "Content-Range": answer.headers.get("Content-Range") or "",
        "Accept-Ranges": answer.headers.get("Accept-Ranges") or "bytes",
    }
    return answer.status, wanted, answer


def account() -> dict:
    with _lock:
        return dict(_account)


def signed_in() -> bool:
    with _lock:
        return bool(_account["token"])


def account_public() -> dict:
    """The account as the page may see it: who, not the token it signs with."""
    with _lock:
        return {
            "signedIn": bool(_account["token"]),
            "nickname": _account["nickname"],
            "avatar": _account["avatar"],
            "userId": _account["userid"],
            "account": {
                "signedIn": bool(_account["token"]),
                "nickname": _account["nickname"],
                "avatar": _account["avatar"],
                "userId": _account["userid"],
            },
        }


def forget() -> None:
    with _lock:
        _account.update({"token": "", "userid": 0, "nickname": "", "avatar": ""})
    _keep_account()


# --- the account: a QR, scanned with KuGou's own phone app -------------------------------------

# Where the account is kept between runs (the layer is started with a state directory).
_account_file = ""
QR_HOST = "https://login-user.kugou.com"
SRCAPPID = 2919


def configure(state_dir: str) -> None:
    """Told where to keep the account (server.py hands it the layer's state directory)."""
    global _account_file
    _account_file = f"{state_dir}/kugou-account.json" if state_dir else ""
    if not _account_file:
        return
    try:
        with open(_account_file, "r", encoding="utf-8") as kept:
            saved = json.load(kept)
    except (OSError, ValueError):
        return
    if isinstance(saved, dict) and saved.get("token"):
        with _lock:
            _account.update(
                {
                    "token": str(saved.get("token") or ""),
                    "userid": int(saved.get("userid") or 0),
                    "nickname": str(saved.get("nickname") or ""),
                    "avatar": str(saved.get("avatar") or ""),
                }
            )


def _keep_account() -> None:
    if not _account_file:
        return
    try:
        with open(_account_file, "w", encoding="utf-8") as out:
            json.dump(account(), out, ensure_ascii=False)
    except OSError:
        pass


def _login_ask(path: str, extra: dict) -> dict:
    """The login service, signed the H5 way (the one it checks for a QR)."""
    asked = {
        "dfid": "-",
        "mid": _MID,
        "uuid": "-",
        "appid": APPID,
        "clientver": 1000,
        "clienttime": int(time.time()),
    }
    asked.update(extra)
    asked["signature"] = _web_sign(asked)
    url = f"{QR_HOST}{path}?{urllib.parse.urlencode(asked)}"
    return _open(urllib.request.Request(url, headers={"User-Agent": WEB_UA}))


def qr_start() -> dict:
    """A fresh login QR: KuGou's own key and the picture it drew for it."""
    answer = _login_ask(
        "/v2/qrcode",
        {
            "appid": 1001,
            "type": 1,
            "plat": 4,
            "qrcode_txt": f"https://h5.kugou.com/apps/loginQRCode/html/index.html?appid={APPID}&",
            "srcappid": SRCAPPID,
        },
    )
    data = answer.get("data") or {}
    key = str(data.get("qrcode") or "")
    if not key:
        raise KuGouError(str(answer.get("error") or "KuGou: no QR"))
    return {"key": key, "image": str(data.get("qrcode_img") or "")}


def qr_state(key: str) -> dict:
    """How the QR stands: 0 expired, 1 waiting, 2 scanned (to confirm on the phone), 4 signed in."""
    answer = _login_ask("/v2/get_userinfo_qrcode", {"plat": 4, "appid": APPID, "srcappid": SRCAPPID, "qrcode": key})
    data = answer.get("data") or {}
    status = int(data.get("status") or 0)
    if status == 4:
        token = str(data.get("token") or "")
        userid = int(data.get("userid") or 0)
        if token:
            with _lock:
                _account.update(
                    {
                        "token": token,
                        "userid": userid,
                        # The QR's own answer names who scanned it, where it does.
                        "nickname": str(data.get("nickname") or data.get("user_name") or ""),
                        "avatar": _cover(data.get("user_pic") or data.get("pic") or ""),
                    }
                )
            _keep_account()
    return {"status": status, "account": account()}


# --- 听书 (long audio: the audiobook shelf, its albums and chapters) -----------------------------


def _book(raw: dict) -> dict:
    rank = raw.get("rank_info") if isinstance(raw.get("rank_info"), dict) else {}
    return {
        "id": str(raw.get("album_id") or ""),
        "name": str(raw.get("album_name") or ""),
        "picture": _cover(raw.get("sizable_cover") or raw.get("cover")),
        "author": str(raw.get("author_name") or ""),
        "intro": str(raw.get("intro") or "").strip(),
        "chapters": int(raw.get("audio_total") or raw.get("chapter_count") or 0),
        "plays": int(raw.get("play_count") or raw.get("play_times") or 0),
        "note": str(rank.get("rank_name") or ""),
        "date": str(raw.get("publish_date") or raw.get("addtime") or ""),
    }


def audiobook_tags() -> dict:
    """听书's own tag tree (有声小说 906 and its children)."""
    answer = _gateway("/v3/list_audiobook_tags", {"platform": "android", "clientver": 20789}, router="longaudio.kugou.com")
    tops = []
    for raw in answer.get("data") or []:
        if not isinstance(raw, dict):
            continue
        children = []
        for son in raw.get("son") or []:
            if isinstance(son, dict) and son.get("tag_id"):
                children.append(
                    {
                        "id": str(son.get("tag_id")),
                        "name": str(son.get("tag_name") or ""),
                        # 1 男频, 2 女频, 0 通用 (the client's own split).
                        "channel": int(son.get("channel") or 0),
                    }
                )
        tops.append(
            {
                "id": str(raw.get("tag_id") or 906),
                "name": str(raw.get("top_tag_name") or raw.get("tag_name") or "听书"),
                "icon": _cover(raw.get("icon")),
                "children": children,
            }
        )
    return {"tags": tops}


def audiobooks(tag_id: str = "906", gender: int = 0, sort: int = 0, status: int = 0, page: int = 1, pagesize: int = 20) -> dict:
    """The free audiobook shelf, a tag at a time (`longaudio/v1/album/list`)."""
    answer = _gateway(
        "/longaudio/v1/album/list",
        {
            "api_ver": 2,
            "tag_id": int(tag_id or 906),
            "gender": max(0, gender),
            "sort": max(0, sort),
            "status": max(0, status),
            "free": 1,
            "page": max(1, page),
            "page_size": min(max(pagesize, 1), 30),
            "clientver": 20789,
        },
    )
    data = answer.get("data") or {}
    books = [_book(each) for each in (data.get("data_list") or [])]
    return {"books": books, "more": int(data.get("is_end") or 0) == 0}


def audiobook(album_id: str) -> dict:
    """One audiobook's own page (`openapi/v2/broadcast`: its name, author, cover and intro)."""
    answer = _gateway(
        "/openapi/v2/broadcast",
        body={
            "data": [{"album_id": album_id}],
            "show_album_tag": 1,
            "fields": "album_name,album_id,category,authors,sizable_cover,intro,author_name,trans_param,album_tag,mix_intro,full_intro,is_publish",
        },
        extra={"KG-TID": "78"},
    )
    rows = answer.get("data") or []
    raw = rows[0] if rows and isinstance(rows[0], dict) else {}
    if not raw:
        raise KuGouError("KuGou: no such audiobook")
    named = [str(each.get("author_name") or each.get("name") or "") for each in (raw.get("authors") or []) if isinstance(each, dict)]
    book = _book(raw)
    book["author"] = book["author"] or "、".join(each for each in named if each)
    tags = [str(each.get("tag_name")) for each in (raw.get("album_tag") or []) if isinstance(each, dict)]
    book["tags"] = [each for each in tags if each]
    return {"book": book}


def audiobook_chapters(album_id: str, name: str = "", picture: str = "", page: int = 1, pagesize: int = 30) -> dict:
    """An audiobook's chapters, as songs (each one's hash plays through the layer's stream route)."""
    answer = _gateway(
        "/longaudio/v2/album_audios",
        body={"album_id": album_id, "area_code": 1, "tagid": 0, "page": max(1, page), "pagesize": min(max(pagesize, 1), 50)},
        router="openapi.kugou.com",
        extra={"KG-TID": "78"},
    )
    songs = []
    for raw in answer.get("data") or []:
        if not isinstance(raw, dict):
            continue
        hashes = str(raw.get("hash") or "")
        if not hashes:
            continue
        params = raw.get("trans_param") if isinstance(raw.get("trans_param"), dict) else {}
        size = int(raw.get("filesize") or 0)
        title = str(raw.get("audio_name") or raw.get("audio_name_ch") or "")
        if not title:
            title = f"第 {raw.get('sort') or len(songs) + 1} 集"
        songs.append(
            {
                "id": hashes.upper(),
                "name": title,
                "artists": [str(raw.get("author_name"))] if raw.get("author_name") else ([name] if name else []),
                "album": name,
                "albumId": album_id,
                "albumAudioId": str(raw.get("album_audio_id") or ""),
                "picture": _cover(params.get("union_cover") or "") or picture,
                # KuGou leaves the length out here; the 128k file is 16,000 bytes a second.
                "duration": int(raw.get("timelen") or (size // 16000 if size else 0)),
                "privilege": 0 if raw.get("status_128") in (1, "1", None) else 10,
            }
        )
    total = int(answer.get("total") or 0)
    return {"songs": songs, "total": total, "more": max(1, page) * max(pagesize, 1) < total}


# --- 我的收藏 (the account's own shelf: what it keeps and what it made) ---------------------------


def _favourite(raw: dict) -> dict:
    return {
        "id": str(raw.get("global_collection_id") or raw.get("listid") or raw.get("specialid") or ""),
        "kind": "playlist",
        "name": str(raw.get("name") or raw.get("listname") or raw.get("specialname") or "歌单"),
        "picture": _cover(raw.get("pic") or raw.get("img") or raw.get("imgurl") or raw.get("flexible_cover")),
        "description": str(raw.get("intro") or ""),
        "trackCount": int(raw.get("songcount") or raw.get("count") or raw.get("percount") or 0),
        "creator": str(raw.get("nickname") or raw.get("list_create_username") or raw.get("username") or "我"),
        "plays": int(raw.get("play_count") or 0),
        "tag": str(raw.get("list_create_tag") or ""),
    }


def favourites(page: int = 1, pagesize: int = 30) -> dict:
    """The signed-in account's collected and self-made playlists (`/v7/get_all_list`)."""
    with _lock:
        token = _account["token"]
        userid = int(_account["userid"] or 0)
    if not token:
        raise KuGouError("请先扫码登录", 20010)
    answer = _gateway(
        "/v7/get_all_list",
        {"plat": 1, "userid": userid, "token": token},
        body={"userid": userid, "token": token, "total_ver": 979, "type": 2, "page": max(1, page), "pagesize": min(max(pagesize, 1), 50)},
        router="cloudlist.service.kugou.com",
    )
    data = answer.get("data")
    if isinstance(data, dict):
        rows = data.get("info") or data.get("list") or data.get("lists") or []
    else:
        rows = data or []
    playlists = [_favourite(each) for each in rows if isinstance(each, dict)]
    return {"playlists": [each for each in playlists if each["id"]], "more": len(playlists) >= pagesize}


# The sign-in window's page (`crates/host/src/signin.rs`, `Site::KUGOU`): the QR, and the phone that scans it.
# WestPlay opens it in a window of its own on the PC's desktop (`/kugou/login`), so signing in needs the cab's
# app no more; the page tells the window `{"signedIn": true}` once the layer is signed in (`/kugou/qr/check`
# status 4), and the window closes itself.
LOGIN_PAGE = """<!doctype html>
<meta charset="utf-8">
<title>登录酷狗音乐</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
         box-sizing: border-box; padding: 24px; font: 15px/1.7 "Microsoft YaHei", "PingFang SC", sans-serif;
         color: #f2f2f2; background: #141414; text-align: center; }
  h1 { margin: 0; font-size: 20px; font-weight: 600; }
  #code { width: 220px; height: 220px; border-radius: 12px; background: #fff; display: flex;
          align-items: center; justify-content: center; color: #666; font-size: 13px; }
  #code img { width: 100%; height: 100%; border-radius: 12px; }
  #state { margin: 0; opacity: .72; min-height: 1.7em; }
  #again { display: none; border: 0; border-radius: 9px; padding: 9px 18px; font: inherit;
           background: #fff; color: #141414; cursor: pointer; }
  #again:hover { background: #e6e6e6; }
</style>
<h1>登录酷狗音乐</h1>
<div id="code">正在取二维码…</div>
<p id="state"></p>
<button id="again">二维码过期，重新加载</button>
<script>
  const code = document.getElementById('code')
  const state = document.getElementById('state')
  const again = document.getElementById('again')
  let key = ''
  let busy = false
  const tell = (message) => { try { window.chrome.webview.postMessage(message) } catch (e) {} }
  async function deal() {
    busy = true
    again.style.display = 'none'
    state.textContent = '正在取二维码…'
    code.textContent = '正在取二维码…'
    try {
      const answer = await (await fetch('/kugou/qr')).json()
      key = answer.key
      code.innerHTML = '<img alt="酷狗音乐登录二维码" src="' + answer.image + '">'
      state.textContent = '打开酷狗音乐的“扫一扫”，扫这个二维码登录'
      busy = false
      setTimeout(tick, 900)
    } catch (e) {
      code.textContent = '二维码取不到'
      state.textContent = '连不上酷狗音乐的服务，点下面重新加载'
      again.style.display = 'inline-block'
    }
  }
  async function tick() {
    if (!key || busy) return
    try {
      const answer = await (await fetch('/kugou/qr/check?key=' + encodeURIComponent(key))).json()
      if (answer.status === 4) {
        state.textContent = '已登录，这个窗口马上关掉'
        tell({ signedIn: true })
        return
      }
      if (answer.status === 0) {
        state.textContent = '二维码过期了，点下面重新加载'
        again.style.display = 'inline-block'
        return
      }
      if (answer.status === 2) state.textContent = '已扫码，请在手机上点“确认登录”'
    } catch (e) {}
    setTimeout(tick, 1200)
  }
  again.addEventListener('click', deal)
  deal()
</script>
"""
