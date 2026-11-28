"""The layer's HTTP face: what the app's hidden page asks, on the loopback.

Deliberately small and local. It binds `127.0.0.1` only, answers JSON, and its one rule is that the
account's cookie never appears in an answer — the app gets songs, never credentials.

Routes (all `GET` or `POST` with a JSON body, all under `/api/`):

    GET  /api/health              {"ok": true, "port": 8788, "signedIn": bool, "nickname": str}
    GET  /api/search?s=&type=&limit=&offset=
    GET  /api/song?id=            one song's detail
    POST /api/songs               {"ids": [..]} several at once
    GET  /api/lyric?id=
    GET  /api/url?id=&br=         where the audio is
    GET  /api/toplists
    GET  /api/playlist?id=
    GET  /api/album?id=
    GET  /api/artist?id=
    GET  /api/recommend/songs
    GET  /api/recommend/playlists
    GET  /api/account
    POST /api/signin/start        {"key","url"}: the QR to show
    POST /api/signin/poll         {"key"}: whether it's been confirmed
    POST /api/signin/cookie       {"cookie"}: take an account's cookie (from the sign-in page)
    POST /api/signout
"""

import json
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import kugou
from .api import Client, NeteaseError

# The account, as this layer holds it. One at a time, like a phone's own player.
_lock = threading.Lock()
_state = {"cookie": "", "nickname": "", "userId": 0}

# The sign-in in flight: the client that asked for the code, kept so its cookie jar outlives a poll. `None`
# between sign-ins. A fresh client per poll threw the session away, and with it the account's token.
_signin: "Client | None" = None
_signin_key = ""

# The songs 我喜欢的音乐 holds, as last read: `uid` whose they are, and their ids. Read once and kept (a song's
# page asks as it opens, and the list is the account's own until a heart changes it).
_liked = {"uid": 0, "ids": []}


def _signed_in() -> bool:
    with _lock:
        return _account_cookie(_state["cookie"])


def _client() -> Client:
    with _lock:
        return Client(_state["cookie"])


def _userId() -> int:
    """The signed-in account's id, or 0: the layer's state, or the account route's answer when it has none.

    A cookie restored from disk carries no id (only the cookie itself is kept there), and the playlists route
    needs one; so it's asked of the service once, and kept from then on.
    """
    global _state
    with _lock:
        if _state["cookie"] and int(_state["userId"] or 0) > 0:
            return int(_state["userId"])
        cookie = _state["cookie"]
    if not _account_cookie(cookie):
        return 0
    try:
        profile = (Client(cookie).account().get("profile") or {})
    except NeteaseError:
        return 0
    uid = int(profile.get("userId") or 0)
    if uid:
        with _lock:
            _state["userId"] = uid
            if not _state["nickname"]:
                _state["nickname"] = str(profile.get("nickname") or "")
    return uid


def _account_cookie(cookie: str) -> bool:
    """Whether `cookie` is a signed-in account's, by the token only an account has.

    A QR check sets `NMTID` for a guest the moment a code is asked for, so a cookie's presence says nothing.
    `MUSIC_U` is the account's own (`MUSIC_R_U` on the regional build); with neither, nobody has signed in.
    """
    names = {part.split("=", 1)[0].strip() for part in cookie.split(";") if "=" in part}
    return bool(names & {"MUSIC_U", "MUSIC_R_U"})


def _remember(cookie: str) -> None:
    """Take a cookie, and sign in only if it is an account's.

    A guest's cookie (the device's `NMTID`, which every QR check sets) is kept as what it is and forgotten:
    taking it for an account is what made the page say 登录成功 while `/api/account` said nobody was there.
    """
    if not _account_cookie(cookie):
        with _lock:
            _state["cookie"] = ""
            _state["nickname"] = ""
            _state["userId"] = 0
        return
    with _lock:
        _state["cookie"] = cookie
    try:
        who = Client(cookie).account()
    except NeteaseError:
        # The service didn't answer: the cookie stays (it may work when it does), the name waits.
        return
    profile = who.get("profile") or {}
    with _lock:
        _state["nickname"] = str(profile.get("nickname") or "")
        _state["userId"] = int(profile.get("userId") or 0)


def _answer_health() -> dict:
    with _lock:
        # The same rule as the account route: an account's token or nobody.
        signed_in = _account_cookie(_state["cookie"])
        return {
            "ok": True,
            "signedIn": signed_in,
            "nickname": _state["nickname"] if signed_in else "",
            "userId": _state["userId"] if signed_in else 0,
        }


# --- the shape the app wants ---------------------------------------------------------------
#
# NetEase's own JSON is deep and every endpoint names things differently. These flatten it once so
# the page doesn't have to know four spellings of "the album's picture".


def _picture(value) -> str:
    """An album or artist picture, at the size the screen shows."""
    if isinstance(value, str):
        return value + "?param=300y300" if value else ""
    return ""


def _song(raw: dict) -> dict:
    album = raw.get("al") or raw.get("album") or {}
    artists = raw.get("ar") or raw.get("artists") or []
    return {
        "id": raw.get("id"),
        "name": raw.get("name") or "",
        "artists": [a.get("name", "") for a in artists if isinstance(a, dict)],
        "artistIds": [a.get("id") for a in artists if isinstance(a, dict) and a.get("id")],
        "album": album.get("name") or "",
        "albumId": album.get("id"),
        "picture": _picture(album.get("picUrl")),
        # Milliseconds everywhere: the page counts in seconds and divides.
        "duration": raw.get("dt") or raw.get("duration") or 0,
        "fee": raw.get("fee"),
    }


def _collection(raw: dict, kind: str) -> dict:
    """A playlist or album, flattened the same way."""
    return {
        "id": raw.get("id"),
        "kind": kind,
        "name": raw.get("name") or "",
        "picture": _picture(raw.get("coverImgUrl") or raw.get("picUrl")),
        "description": raw.get("description") or "",
        "trackCount": raw.get("trackCount") or 0,
        "creator": (raw.get("creator") or {}).get("nickname") or "",
    }


def _artist(raw: dict) -> dict:
    return {
        "id": raw.get("id"),
        "kind": "artist",
        "name": raw.get("name") or "",
        "picture": _picture(raw.get("picUrl") or raw.get("img1v1Url")),
    }


class Handler(BaseHTTPRequestHandler):
    """One request. Parsed, routed, answered; nothing kept between calls but the account."""

    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # noqa: D401 - the base class's signature
        # Quiet: the app talks to this constantly and the console is a game's.
        pass

    # --- plumbing ---------------------------------------------------------------------------

    def _send(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # The page runs on `https://westplay.cabin`, so this is a cross-origin call.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _fail(self, error: Exception, status: int = 502) -> None:
        code = getattr(error, "code", None)
        self._send({"error": str(error), "code": code}, status)

    def _kugou_url(self, hash_: str, album: str, name: str) -> dict:
        """Where a KuGou song's audio is, through this layer's own stream route.

        The page is on `https://westplay.cabin` and KuGou's CDN is plain `http`, which a browser refuses
        from a secure page; the layer is on the loopback (which that page may reach), so the audio is
        played through it. `code` 0 means playable, -1 that the service keeps it for its paid listeners.
        """
        found = kugou.audio(hash_, album)
        if not found.get("url"):
            return {
                "url": "",
                "bitrate": found.get("bitrate") or 0,
                "size": 0,
                "code": -1,
                "reason": found.get("reason") or "本次请求需要验证",
            }
        port = self.server.server_address[1]
        quoted = urllib.parse.quote(found["url"], safe="")
        return {
            "url": f"http://127.0.0.1:{port}/kugou/stream?u={quoted}",
            "direct": found["url"],
            "bitrate": found.get("bitrate") or 0,
            "size": found.get("size") or 0,
            "code": 0,
            "name": name,
        }

    def _kugou_stream(self, url: str) -> None:
        """A song's audio: the upstream's own bytes, ranges and all (the page's `<audio>` seeks with them)."""
        status, headers, stream = kugou.open_stream(url, self.headers.get("Range") or "")
        try:
            body = stream.read()
        finally:
            stream.close()
        self.send_response(status)
        self.send_header("Content-Type", headers.get("Content-Type") or "audio/mpeg")
        self.send_header("Content-Length", str(len(body)))
        if headers.get("Content-Range"):
            self.send_header("Content-Range", headers["Content-Range"])
        self.send_header("Accept-Ranges", headers.get("Accept-Ranges") or "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802 - the base class's name
        self._send({})

    def do_GET(self) -> None:  # noqa: N802
        self._route("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._route("POST")

    # --- routing ----------------------------------------------------------------------------

    def _route(self, method: str) -> None:
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        body = {}
        if method == "POST":
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                except json.JSONDecodeError:
                    return self._send({"error": "bad body"}, 400)

        def one(name: str, default: str = "") -> str:
            if name in body:
                return str(body[name])
            values = query.get(name)
            return values[0] if values else default

        def number(name: str, default: int = 0) -> int:
            try:
                return int(one(name, str(default)))
            except ValueError:
                return default

        try:
            path = parsed.path
            if path == "/api/health":
                return self._send(_answer_health())
            if path == "/api/search":
                answer = _client().search(one("s"), number("type", 1), number("limit", 30), number("offset", 0))
                return self._send(_search_answer(answer))
            if path == "/api/song":
                answer = _client().song_detail([number("id")])
                songs = [_song(s) for s in (answer.get("songs") or [])]
                return self._send({"songs": songs})
            if path == "/api/songs":
                ids = [int(i) for i in (body.get("ids") or [])][:200]
                answer = _client().song_detail(ids)
                return self._send({"songs": [_song(s) for s in (answer.get("songs") or [])]})
            if path == "/api/lyric":
                return self._send(_lyric_answer(_client().lyric(number("id"))))
            if path == "/api/url":
                return self._send(_url_answer(_client().song_url([number("id")], number("br", 320000))))
            if path == "/api/toplists":
                return self._send(_toplists_answer(_client().toplists()))
            if path == "/api/playlist":
                answer = _client().playlist(number("id"))
                return self._send(_playlist_answer(answer))
            if path == "/api/album":
                answer = _client().album(number("id"))
                return self._send(_album_answer(answer))
            if path == "/api/artist":
                answer = _client().artist_songs(number("id"))
                return self._send(_artist_answer(answer))
            if path == "/api/recommend/songs":
                answer = _client().recommend_songs()
                return self._send(_recommend_songs(answer))
            if path == "/api/recommend/playlists":
                answer = _client().recommend_playlists()
                return self._send(_recommend_playlists(answer))
            if path == "/api/account":
                return self._send(_account_answer(_client().account()))
            if path == "/api/mine/playlists":
                # The account's own playlists and the ones it collected. Without an account there are none to
                # name: the route says so rather than asking the service for uid 0's (a guest's).
                uid = _userId()
                if not uid:
                    return self._send({"playlists": [], "signedIn": False})
                answer = _client().user_playlists(uid, min(number("limit", 200), 500))
                return self._send(_mine_playlists(answer, uid))
            if path == "/api/mine/liked":
                # Which songs 我喜欢的音乐 holds: what the heart on a song's page reads.
                return self._send(_answer_liked())
            if path == "/api/mine/like":
                # 收藏 a song (or take it back): the account's own heart, adding it to 我喜欢的音乐.
                return self._send(_set_liked(number("id"), one("liked", "true") in ("true", "1", "yes")))
            if path == "/api/signin/start":
                return self._send(_begin_sign_in())
            if path == "/api/signin/poll":
                return self._send(_poll_sign_in(one("key")))
            if path == "/api/signin/cookie":
                _remember(one("cookie"))
                return self._send(_answer_health())
            if path == "/api/signout":
                with _lock:
                    _state["cookie"] = ""
                    _state["nickname"] = ""
                    _state["userId"] = 0
                return self._send({"ok": True})

            # KuGou Music, in this same layer (`kugou.py`): the app's own routes, the same shapes.
            if path == "/kugou/health":
                return self._send({"ok": True, **kugou.account_public()})
            if path == "/kugou/qr":
                return self._send(kugou.qr_start())
            if path == "/kugou/qr/check":
                return self._send(kugou.qr_state(one("key")))
            if path == "/kugou/signout":
                kugou.forget()
                return self._send({"ok": True})
            if path == "/kugou/audiobook/tags":
                return self._send(kugou.audiobook_tags())
            if path == "/kugou/audiobooks":
                return self._send(
                    kugou.audiobooks(one("tag", "906"), number("gender"), number("sort"), number("status"), number("page", 1), number("size", 20))
                )
            if path == "/kugou/audiobook":
                return self._send(kugou.audiobook(one("id")))
            if path == "/kugou/audiobook/chapters":
                return self._send(
                    kugou.audiobook_chapters(one("id"), one("name"), one("cover"), number("page", 1), number("size", 30))
                )
            if path == "/kugou/favorites":
                if not kugou.signed_in():
                    # Not a failure: the page shows the QR itself when it hears "signin".
                    return self._send({"playlists": [], "more": False, "note": "signin"})
                return self._send(kugou.favourites(number("page", 1), number("size", 30)))
            if path == "/kugou/search":
                return self._send(kugou.search(one("q"), number("page", 1), number("size", 20)))
            if path == "/kugou/ranks":
                return self._send(kugou.ranks())
            if path == "/kugou/rank":
                return self._send(kugou.rank_songs(one("id"), number("page", 1), number("size", 30)))
            if path == "/kugou/playlists":
                return self._send(kugou.playlists(number("page", 1), number("size", 12)))
            if path == "/kugou/playlist":
                return self._send(kugou.playlist_songs(one("id"), number("page", 1), number("size", 30)))
            if path == "/kugou/singers":
                return self._send(kugou.singers(number("page", 1), number("size", 20)))
            if path == "/kugou/singer":
                return self._send(kugou.singer_songs(one("id"), number("page", 1), number("size", 30)))
            if path == "/kugou/lyric":
                return self._send(
                    kugou.lyric(one("hash"), number("duration", 0), one("name"), one("artist"))
                )
            if path == "/kugou/url":
                return self._send(self._kugou_url(one("hash"), one("album"), one("name")))
            if path == "/kugou/stream":
                return self._kugou_stream(one("u"))
            return self._send({"error": "no such route", "path": path}, 404)
        except NeteaseError as error:
            return self._fail(error)
        except Exception as error:  # noqa: BLE001 - one bad call must not stop the layer
            return self._fail(error, 500)


# --- the flatter answers --------------------------------------------------------------------


def _search_answer(answer: dict) -> dict:
    result = answer.get("result") or {}
    songs = [_song(s) for s in (result.get("songs") or [])]
    playlists = [_collection(p, "playlist") for p in (result.get("playlists") or [])]
    artists = [_artist(a) for a in (result.get("artists") or [])]
    albums = [_collection(a, "album") for a in (result.get("albums") or [])]
    return {
        "songs": songs,
        "playlists": playlists,
        "artists": artists,
        "albums": albums,
        "total": result.get("songCount") or 0,
    }


def _lyric_answer(answer: dict) -> dict:
    return {
        "lrc": (answer.get("lrc") or {}).get("lyric") or "",
        "translation": (answer.get("tlyric") or {}).get("lyric") or "",
    }


def _url_answer(answer: dict) -> dict:
    entries = answer.get("data") or []
    if not entries:
        return {"url": "", "bitrate": 0}
    first = entries[0]
    return {
        "url": first.get("url") or "",
        "bitrate": first.get("br") or 0,
        "size": first.get("size") or 0,
        # -110 is "no right to this one": the page says so rather than playing silence.
        "code": first.get("code"),
    }


def _toplists_answer(answer: dict) -> dict:
    charts = []
    for raw in answer.get("list") or []:
        entry = _collection(raw, "playlist")
        entry["tracks"] = [_song(s) for s in (raw.get("tracks") or [])]
        charts.append(entry)
    return {"toplists": charts}


def _playlist_answer(answer: dict) -> dict:
    playlist = answer.get("playlist") or {}
    collection = _collection(playlist, "playlist")
    tracks = [_song(s) for s in (playlist.get("tracks") or [])]
    return {"collection": collection, "tracks": tracks}


def _album_answer(answer: dict) -> dict:
    album = answer.get("album") or {}
    collection = _collection(album, "album")
    collection["artist"] = (album.get("artist") or {}).get("name") or ""
    tracks = [_song(s) for s in (answer.get("songs") or [])]
    return {"collection": collection, "tracks": tracks}


def _artist_answer(answer: dict) -> dict:
    artist = answer.get("artist") or {}
    entry = _artist(artist)
    tracks = [_song(s) for s in (answer.get("hotSongs") or [])]
    return {"artist": entry, "tracks": tracks}


def _recommend_songs(answer: dict) -> dict:
    daily = answer.get("data") or {}
    songs = [_song(s) for s in (daily.get("dailySongs") or [])]
    return {"songs": songs}


def _recommend_playlists(answer: dict) -> dict:
    playlists = [_collection(p, "playlist") for p in (answer.get("result") or [])]
    return {"playlists": playlists}


def _liked_now() -> list[int]:
    """The kept liked ids, as they stand (no service call: the list a heart just changed)."""
    with _lock:
        return list(_liked["ids"])


def _answer_liked() -> dict:
    """The songs 我喜欢的音乐 holds: the kept list for this account, else read from the service once."""
    uid = _userId()
    if not uid:
        return {"liked": [], "signedIn": False}
    with _lock:
        if _liked["uid"] == uid:
            return {"liked": list(_liked["ids"]), "signedIn": True}
    ids = _client().liked_ids(uid)
    with _lock:
        _liked["uid"] = uid
        _liked["ids"] = ids
    return {"liked": list(ids), "signedIn": True}


def _set_liked(song_id: int, liked: bool) -> dict:
    """Adds a song to 我喜欢的音乐 (or takes it back out), as NetEase's own heart does.

    Nothing is sent without an account: being liked is the account's own, and a guest has nowhere to put a
    song. The answer says which way it went, so the page's heart can follow it rather than guess.
    """
    if song_id <= 0:
        return {"ok": False, "liked": False, "reason": "no-song"}
    uid = _userId()
    if not uid:
        return {"ok": False, "liked": False, "reason": "signed-out"}
    try:
        result = _client().set_liked(uid, song_id, liked)
    except NeteaseError as error:
        return {"ok": False, "liked": not liked, "reason": str(error)}
    if not result.get("ok"):
        return {"ok": False, "liked": not liked, "reason": result.get("reason") or "refused"}
    # The heart went through: the kept list follows it, so the next read says what the service now holds.
    _note_liked(song_id, liked)
    return {"ok": True, "liked": liked}


def _forget_liked() -> None:
    """Drops the cached liked ids (`_liked`), so the next look asks the service again."""
    with _lock:
        _liked["uid"] = 0
        _liked["ids"] = []


def _note_liked(song_id: int, liked: bool) -> None:
    """Keeps a heart's change in the cached list, so the next read doesn't need the service."""
    with _lock:
        ids = list(_liked["ids"])
        if liked and song_id not in ids:
            ids.append(song_id)
        elif not liked:
            ids = [each for each in ids if each != song_id]
        _liked["ids"] = ids


def _mine_playlists(answer: dict, uid: int) -> dict:
    """The account's playlists, flattened, each saying whether it's the account's own or one it collected.

    `specialType` 5 (我喜欢的音乐) is left in with a flag of its own: it's the one every account has, and the
    app gives it its own heading rather than a card among the rest. An empty one is dropped (an account that
    never liked anything has it all the same, and a card counting nought songs is nothing to open).
    """
    entries = []
    for raw in answer.get("playlist") or []:
        if not isinstance(raw, dict):
            continue
        creator = raw.get("creator") or {}
        mine = int(creator.get("userId") or 0) == uid
        loved = raw.get("specialType") == 5
        count = int(raw.get("trackCount") or 0)
        if loved and count == 0:
            continue
        entry = _collection(raw, "playlist")
        entry["mine"] = mine and not loved
        entry["collected"] = bool(raw.get("subscribed")) or not mine
        entry["loved"] = loved
        entries.append(entry)
    return {"playlists": entries, "signedIn": True}


def _account_answer(answer: dict) -> dict:
    profile = answer.get("profile") or {}
    return {
        "signedIn": bool(answer.get("account")),
        "nickname": profile.get("nickname") or "",
        "userId": profile.get("userId") or 0,
        "picture": _picture(profile.get("avatarUrl")),
        "vip": bool((answer.get("account") or {}).get("vipType")),
    }


def _begin_sign_in() -> dict:
    """Ask the service for a QR key, on a client kept for the whole sign-in.

    Asked on its own client so the session's cookie jar is the same one the confirmation will arrive on: a new
    client per call is what made a confirmed sign-in leave the layer with nothing.
    """
    global _signin, _signin_key
    with _lock:
        _signin = Client(_state["cookie"])
        _signin_key = ""
    started = _signin.sign_in_cookie()
    with _lock:
        _signin_key = str(started.get("key") or "")
    return started


def _poll_sign_in(key: str) -> dict:
    """One look at the code, on the client that asked for it.

    A key this layer didn't ask for (the page reloaded and asked again, or a stale card) gets a fresh client:
    there's no jar to keep, and the answer is the service's to give.
    """
    global _signin
    with _lock:
        client = _signin
        mine = _signin_key == key and key != ""
    if client is None or not mine:
        client = Client(_state["cookie"])
    return _signin_poll(client, key)


def _signin_poll(client: Client, key: str) -> dict:
    """How the code stands: 800 gone, 801 waiting, 802 scanned, 803 confirmed.

    The service's four numbers were read shifted by one here, which is the fault behind the owner's report
    that the QR sign-in never carried the account over. 802 (scanned, waiting for the phone's confirm) was
    taken for the confirmation, so the page showed the signed-in card the moment the phone *scanned* -- before
    any token existed. And 803 (authorized), the one reply that carries `MUSIC_U`, was taken for an expired
    code, so the sign-in was torn down on the spot. The account was therefore never signed in at all.

    A reply that hands over an account's token counts as the confirmation whatever number it came with: the
    token is the thing the layer actually needs, and the service's numbering is not ours to depend on.
    """
    global _signin, _signin_key
    answer = client.sign_in_check(key)
    code = answer.get("code")
    cookie = answer.get("cookie") or ""

    if _account_cookie(cookie):
        # The account's own token arrived: this is a finished sign-in, and the jar isn't needed again.
        _remember(cookie)
        with _lock:
            _signin = None
            _signin_key = ""
        return {"state": "confirmed", "code": code}

    if code == 803:
        # Authorized. The token rides this reply's `Set-Cookie`, and the jar the check ran on holds it by
        # now -- so take whatever the session has, not only this one reply's header. That is what makes the
        # sign-in land: `MUSIC_U` is in the jar, and nothing has to arrive a later poll.
        account = cookie or client.cookie_for_account()
        with _lock:
            _signin = None
            _signin_key = ""
        if _account_cookie(account):
            _remember(account)
            return {"state": "confirmed", "code": code}
        # Authorized, and no token ever came: the session's jar was lost, say. Tell the truth rather than show
        # the signed-in card over an account that isn't there -- the page then offers a fresh code, which is
        # the only way on.
        return {"state": "expired", "code": code}

    if code == 800:
        # Gone (or never was): a fresh code is the only way on.
        with _lock:
            _signin = None
            _signin_key = ""
        return {"state": "expired", "code": code}

    if code == 802:
        # Scanned on the phone, waiting for the player to confirm there. Nothing to sign in with yet.
        return {"state": "scanned", "code": code}

    # 801, and any number not foreseen: still waiting. An unknown number is never read as a dead code -- that
    # would end a sign-in that is very likely still going.
    return {"state": "waiting", "code": code}


def serve(port: int) -> ThreadingHTTPServer:
    """A server on `port`, its request loop already running on a thread of its own."""
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, name="netease-layer", daemon=True).start()
    return server
