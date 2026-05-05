#!/usr/bin/env python3
"""Local macOS SMS OTP helper for GPC GoPay flows.

Only macOS can read the Messages database used here. Before starting this helper,
make sure the iPhone receiving GoPay SMS codes is signed in to the same Apple ID
and SMS forwarding is enabled so the codes appear in the Mac Messages app.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import platform
import re
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 18767
DEFAULT_DB = "~/Library/Messages/chat.db"
MAC_ABSOLUTE_EPOCH = dt.datetime(2001, 1, 1, tzinfo=dt.timezone.utc)

OTP_PATTERNS = [
    re.compile(r"(?i)\bOTP\s*[:：]?\s*([0-9]{4,8})\b"),
    re.compile(r"#([0-9]{4,8})\b"),
    re.compile(r"(?<!\d)([0-9]{6})(?!\d)"),
]
KEYWORDS = ("gojek", "gopay", "openai llc", "openai")

STATE_LOCK = threading.Lock()
STATE = {
    "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "db_path": "",
    "last_scan_at": "",
    "last_error": "",
    "last_rowid": 0,
    "last_otp": None,
    "otps": [],
}


def is_macos() -> bool:
    override = os.environ.get("GPC_SMS_HELPER_ALLOW_NON_MAC", "").strip().lower()
    return platform.system() == "Darwin" or override in {"1", "true", "yes"}


def require_macos() -> None:
    if not is_macos():
        raise RuntimeError("GPC 本地 SMS Helper 仅支持 macOS：需要读取 ~/Library/Messages/chat.db。")


def extract_gopay_otp(text: str, require_keywords: bool = True) -> Optional[str]:
    raw = text or ""
    lowered = raw.lower()
    if require_keywords and not any(keyword in lowered for keyword in KEYWORDS):
        return None
    for pattern in OTP_PATTERNS:
        match = pattern.search(raw)
        if match:
            return match.group(1)
    return None


def mac_message_time_to_datetime(value: int | float | None) -> dt.datetime:
    if not value:
        return dt.datetime.now(dt.timezone.utc)
    seconds = float(value)
    if seconds > 10_000_000_000:
        seconds = seconds / 1_000_000_000
    return MAC_ABSOLUTE_EPOCH + dt.timedelta(seconds=seconds)


def copy_messages_db(source: Path) -> Path:
    tmpdir = Path(tempfile.mkdtemp(prefix="gpc_messages_"))
    target = tmpdir / "chat.db"
    shutil.copy2(source, target)
    for suffix in ("-wal", "-shm"):
        sidecar = Path(str(source) + suffix)
        if sidecar.exists():
            shutil.copy2(sidecar, Path(str(target) + suffix))
    return target


def latest_rowid(db_path: Path) -> int:
    snapshot = copy_messages_db(db_path)
    try:
        conn = sqlite3.connect(str(snapshot))
        try:
            value = conn.execute("SELECT COALESCE(MAX(ROWID), 0) FROM message").fetchone()[0]
            return int(value or 0)
        finally:
            conn.close()
    finally:
        shutil.rmtree(snapshot.parent, ignore_errors=True)


def read_messages(db_path: Path, after_rowid: int) -> Iterable[dict]:
    snapshot = copy_messages_db(db_path)
    try:
        conn = sqlite3.connect(str(snapshot))
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT message.ROWID AS rowid, message.guid AS guid, message.text AS text,
                       message.date AS message_date, handle.id AS handle_id
                FROM message
                LEFT JOIN handle ON handle.ROWID = message.handle_id
                WHERE message.ROWID > ? AND message.text IS NOT NULL
                ORDER BY message.ROWID ASC
                """,
                (after_rowid,),
            ).fetchall()
            for row in rows:
                yield dict(row)
        finally:
            conn.close()
    finally:
        shutil.rmtree(snapshot.parent, ignore_errors=True)


def make_otp_record(row: dict, otp: str) -> dict:
    received_at = mac_message_time_to_datetime(row.get("message_date")).astimezone(dt.timezone.utc).isoformat()
    return {
        "otp": otp,
        "code": otp,
        "message_id": str(row.get("guid") or row.get("rowid") or ""),
        "rowid": int(row.get("rowid") or 0),
        "received_at": received_at,
        "source": str(row.get("handle_id") or "macos_messages"),
        "message_text": row.get("text") or "",
    }


def update_state(**updates: object) -> None:
    with STATE_LOCK:
        STATE.update(updates)


def append_otp(record: dict, max_records: int = 30) -> None:
    with STATE_LOCK:
        records = [item for item in STATE.get("otps", []) if item.get("message_id") != record.get("message_id")]
        records.append(record)
        records = records[-max_records:]
        STATE["otps"] = records
        STATE["last_otp"] = record


def snapshot_state() -> dict:
    with STATE_LOCK:
        return json.loads(json.dumps(STATE, ensure_ascii=False))


def scan_once(db_path: Path, after_rowid: int, require_keywords: bool) -> int:
    max_seen = after_rowid
    for row in read_messages(db_path, after_rowid):
        max_seen = max(max_seen, int(row.get("rowid") or 0))
        otp = extract_gopay_otp(row.get("text") or "", require_keywords=require_keywords)
        if not otp:
            continue
        record = make_otp_record(row, otp)
        append_otp(record)
        print(f"captured OTP {otp} from message {record['message_id']} at {record['received_at']}", flush=True)
    update_state(last_rowid=max_seen, last_scan_at=dt.datetime.now(dt.timezone.utc).isoformat(), last_error="")
    return max_seen


def poll_loop(db_path: Path, after_rowid: int, interval: float, require_keywords: bool) -> None:
    cursor = after_rowid
    while True:
        try:
            cursor = scan_once(db_path, cursor, require_keywords=require_keywords)
        except Exception as exc:  # noqa: BLE001 - keep local helper alive and visible.
            update_state(last_error=str(exc), last_scan_at=dt.datetime.now(dt.timezone.utc).isoformat())
            print(f"scan error: {exc}", file=sys.stderr, flush=True)
        time.sleep(max(interval, 0.5))


def write_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


class GpcSmsHelperHandler(BaseHTTPRequestHandler):
    server_version = "GpcSmsHelper/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[GpcSmsHelper] {self.address_string()} {fmt % args}", flush=True)

    def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming.
        write_json(self, 200, {"ok": True})

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming.
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            state = snapshot_state()
            write_json(self, 200, {
                "ok": True,
                "platform": platform.system(),
                "db_path": state.get("db_path"),
                "last_scan_at": state.get("last_scan_at"),
                "last_error": state.get("last_error"),
                "last_rowid": state.get("last_rowid"),
                "has_otp": bool(state.get("last_otp")),
            })
            return

        if parsed.path in ("/otp", "/latest-otp"):
            query = parse_qs(parsed.query or "")
            consume = str((query.get("consume") or [""])[0]).strip().lower() in {"1", "true", "yes"}
            state = snapshot_state()
            record = state.get("last_otp") or None
            if not record:
                write_json(self, 200, {"ok": True, "otp": "", "code": "", "status": "waiting", "message": "未查询到验证码"})
                return
            if consume:
                update_state(last_otp=None)
            write_json(self, 200, {"ok": True, "status": "ok", **record})
            return

        write_json(self, 404, {"ok": False, "error": f"unsupported path: {parsed.path}"})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a local macOS Messages HTTP helper for GPC SMS OTP.")
    parser.add_argument("--host", default=HOST, help="HTTP listen host")
    parser.add_argument("--port", type=int, default=PORT, help="HTTP listen port")
    parser.add_argument("--db", default=DEFAULT_DB, help="Messages chat.db path")
    parser.add_argument("--interval", type=float, default=2.0, help="poll interval seconds")
    parser.add_argument("--send-latest-on-start", action="store_true", help="scan existing recent messages on startup")
    parser.add_argument("--no-keyword-filter", action="store_true", help="accept any 6 digit SMS code, not only GoPay/OpenAI messages")
    return parser.parse_args()


def main() -> int:
    try:
        require_macos()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        print("请在 macOS 上运行，并确保 iPhone 短信已转发到这台 Mac 的 Messages/信息 app。", file=sys.stderr)
        return 2

    args = parse_args()
    db_path = Path(os.path.expanduser(args.db))
    if not db_path.exists():
        print(f"Messages DB not found: {db_path}", file=sys.stderr)
        print("请确认这台 Mac 已打开 Messages/信息 app，并且 iPhone 短信能同步到电脑。", file=sys.stderr)
        return 2

    after_rowid = 0 if args.send_latest_on_start else latest_rowid(db_path)
    update_state(db_path=str(db_path), last_rowid=after_rowid)

    print("GPC 本地 SMS Helper 仅支持 macOS。", flush=True)
    print("启动前请确认：接收 GoPay SMS 的 iPhone 已开启短信转发，并且短信能在这台 Mac 的 Messages/信息 app 收到。", flush=True)
    print(f"listening on http://{args.host}:{args.port}; db={db_path}; after_rowid={after_rowid}", flush=True)

    thread = threading.Thread(
        target=poll_loop,
        args=(db_path, after_rowid, args.interval, not args.no_keyword_filter),
        daemon=True,
    )
    thread.start()

    server = ThreadingHTTPServer((args.host, args.port), GpcSmsHelperHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("stopping", flush=True)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
