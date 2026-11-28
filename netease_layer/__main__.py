"""The NetEase middle layer: a small HTTP service WestPlay starts beside itself.

Why it is a process of its own (the same reason the QQ layer is): the page WestPlay draws runs in a
browser context, which can't set a `Cookie` header, and `music.163.com` is another origin. The
account's cookie couldn't reach the service from the page at all. So the cookie lives here, the page
asks this layer over the loopback, and nothing of the account passes through WestPlay's own code.

Started with `--port`, stopped when WestPlay ends (its parent closes a pipe, or it's told to quit).
Everything is Python's standard library: the interpreter ships beside it, so a player needs no Python.

    python -m netease_layer --port 8788 --state <folder>
"""

import argparse
import json
import os
import pathlib
import signal
import sys
import threading

from . import kugou, server

# Where the account's cookie is kept between runs, under the state folder WestPlay gives.
STATE_FILE = "netease-account.json"


def _state_folder(given: str) -> pathlib.Path:
    folder = pathlib.Path(given) if given else pathlib.Path(os.environ.get("LOCALAPPDATA", ".")) / "WestPlay"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _load(folder: pathlib.Path) -> None:
    """The account from last time, if it's still there."""
    path = folder / STATE_FILE
    if not path.is_file():
        return
    try:
        kept = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    cookie = str(kept.get("cookie") or "")
    if not cookie:
        return
    # Straight in, without the account call: starting must not wait on the network.
    with server._lock:
        server._state["cookie"] = cookie
        server._state["nickname"] = str(kept.get("nickname") or "")
        server._state["userId"] = int(kept.get("userId") or 0)


def _save_forever(folder: pathlib.Path) -> None:
    """Write the account out whenever it changes, so a restart doesn't need signing in again."""
    path = folder / STATE_FILE
    last = None

    def loop() -> None:
        nonlocal last
        while True:
            with server._lock:
                current = (
                    server._state["cookie"],
                    server._state["nickname"],
                    server._state["userId"],
                )
            if current != last:
                last = current
                try:
                    path.write_text(
                        json.dumps(
                            {"cookie": current[0], "nickname": current[1], "userId": current[2]},
                            ensure_ascii=False,
                        ),
                        encoding="utf-8",
                    )
                except OSError:
                    pass
            threading.Event().wait(2.0)

    threading.Thread(target=loop, name="netease-save", daemon=True).start()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="netease_layer", description="NetEase Cloud Music's middle layer")
    parser.add_argument("--port", type=int, default=8788, help="the port to answer on (loopback only)")
    parser.add_argument("--state", default="", help="folder for the kept account")
    args = parser.parse_args(argv)

    folder = _state_folder(args.state)
    _load(folder)
    _save_forever(folder)
    # KuGou's own account (its token), kept in the same folder the NetEase one is.
    kugou.configure(str(folder))

    try:
        instance = server.serve(args.port)
    except OSError as error:
        # The port is taken: say so plainly, and stop. WestPlay reads this and tries another.
        print(json.dumps({"error": f"port {args.port}: {error}"}), flush=True)
        return 2

    print(json.dumps({"ok": True, "port": instance.server_address[1]}), flush=True)

    # Run until told to stop. WestPlay ends it by closing our stdin (we're its child), or by a signal.
    stopping = threading.Event()

    def stop(*_):
        stopping.set()

    for name in ("SIGINT", "SIGTERM"):
        if hasattr(signal, name):
            try:
                signal.signal(getattr(signal, name), stop)
            except (ValueError, OSError):
                pass

    def watch_parent() -> None:
        """End when the pipe to WestPlay closes.

        Only a pipe is watched. Started from a console by hand, stdin is the terminal (or nothing at
        all), and reading it would end the layer the moment it began — so a layer with no pipe stays
        until it's told to go, which is what a developer testing it by hand wants.
        """
        stream = sys.stdin
        if stream is None:
            return
        try:
            if stream.isatty():
                return
            # A Windows pipe reports a file type; a redirected file is no pipe to watch.
            import stat as stat_module
            mode = os.fstat(stream.fileno()).st_mode
            if not stat_module.S_ISFIFO(mode):
                return
        except (OSError, ValueError, AttributeError):
            return
        try:
            while stream.read(1):
                pass
        except (OSError, ValueError):
            pass
        stopping.set()

    threading.Thread(target=watch_parent, name="netease-parent", daemon=True).start()

    stopping.wait()
    instance.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
