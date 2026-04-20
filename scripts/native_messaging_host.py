#!/usr/bin/env python3

import json
import os
import shutil
import struct
import sys
import traceback
from datetime import datetime, timezone

from hotmail_helper import ICLOUD_CREATE_SWIFT_SCRIPT, create_icloud_hide_my_email_alias


HOST_NAME = "com.qlhazycoder.codex_oauth_automation_extension"
HOST_PROTOCOL_VERSION = 1
COMMAND_PING = "host.ping"
COMMAND_CREATE_ICLOUD_ALIAS = "icloud.createHideMyEmail"
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
LOG_PATH = os.path.join(DATA_DIR, "native-messaging-host.log")
MANIFEST_PATH = os.path.join(BASE_DIR, "manifest.json")


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_manifest_version():
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return "0.0.0-local"

    version_name = str(payload.get("version_name") or "").strip()
    if version_name:
        return version_name

    version = str(payload.get("version") or "").strip()
    return f"v{version}" if version else "0.0.0-local"


HOST_VERSION = read_manifest_version()


def append_log(message):
    os.makedirs(DATA_DIR, exist_ok=True)
    line = f"[{utc_now()}] {message}\n"
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line)


def build_error(code, message, details=None):
    payload = {
        "code": str(code or "INTERNAL_ERROR"),
        "message": str(message or "未知错误"),
    }
    if details:
        payload["details"] = details
    return payload


def classify_runtime_error(exc):
    message = str(exc or "").strip() or "未知错误"
    lowered = message.lower()
    if "仅支持 macos" in message:
        return build_error("PLATFORM_UNSUPPORTED", message)
    if "未安装 swift" in message:
        return build_error("SWIFT_UNAVAILABLE", message)
    if "未找到 icloud 本地创建脚本" in message:
        return build_error("SWIFT_SCRIPT_MISSING", message)
    if "未配置 apple id 密码" in message:
        return build_error("APPLE_ID_PASSWORD_NOT_CONFIGURED", message)
    if "超时" in message or "timeout" in lowered:
        return build_error("HOST_TIMEOUT", message)
    return build_error("INTERNAL_ERROR", message)


def build_response(request_id, ok, result=None, error=None):
    payload = {
        "requestId": request_id,
        "ok": bool(ok),
        "protocolVersion": HOST_PROTOCOL_VERSION,
        "hostName": HOST_NAME,
        "hostVersion": HOST_VERSION,
        "timestamp": utc_now(),
    }
    if result is not None:
        payload["result"] = result
    if error is not None:
        payload["error"] = error
    return payload


def read_native_message():
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise RuntimeError("Native host header length is invalid.")
    message_length = struct.unpack("<I", header)[0]
    if message_length <= 0:
        raise RuntimeError("Native host payload length is invalid.")
    body = sys.stdin.buffer.read(message_length)
    if len(body) != message_length:
        raise RuntimeError("Native host payload is truncated.")
    return json.loads(body.decode("utf-8"))


def write_native_message(payload):
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def self_check_payload():
    return {
        "ok": True,
        "hostName": HOST_NAME,
        "hostVersion": HOST_VERSION,
        "protocolVersion": HOST_PROTOCOL_VERSION,
        "platform": sys.platform,
        "pythonExecutable": sys.executable,
        "swiftAvailable": bool(shutil.which("swift")),
        "swiftScriptPath": ICLOUD_CREATE_SWIFT_SCRIPT,
        "swiftScriptExists": os.path.isfile(ICLOUD_CREATE_SWIFT_SCRIPT),
        "logPath": LOG_PATH,
    }


def handle_message(message):
    if not isinstance(message, dict):
        raise RuntimeError("Native host request must be a JSON object.")

    request_id = str(message.get("requestId") or "")
    protocol_version = int(message.get("protocolVersion") or 0)
    if protocol_version != HOST_PROTOCOL_VERSION:
        return build_response(
            request_id,
            False,
            error=build_error(
                "UNSUPPORTED_PROTOCOL",
                f"宿主协议版本不匹配：当前仅支持 {HOST_PROTOCOL_VERSION}，收到 {protocol_version}。",
                details={"expectedProtocolVersion": HOST_PROTOCOL_VERSION},
            ),
        )

    command = str(message.get("type") or "").strip()
    if command == COMMAND_PING:
        return build_response(
            request_id,
            True,
            result={
                "capabilities": [COMMAND_PING, COMMAND_CREATE_ICLOUD_ALIAS],
            },
        )

    if command == COMMAND_CREATE_ICLOUD_ALIAS:
        payload = message.get("payload") if isinstance(message.get("payload"), dict) else {}
        created = create_icloud_hide_my_email_alias(
            label=payload.get("label"),
            apple_id_password=payload.get("appleIdPassword"),
        )
        return build_response(request_id, True, result=created)

    return build_response(
        request_id,
        False,
        error=build_error("UNSUPPORTED_COMMAND", f"不支持的宿主命令：{command or '<empty>'}"),
    )


def run_self_check():
    print(json.dumps(self_check_payload(), ensure_ascii=False, indent=2))


def run_host_loop():
    while True:
        try:
            message = read_native_message()
            if message is None:
                break
            response = handle_message(message)
        except Exception as exc:
            append_log(f"native host request failed: {exc}\n{traceback.format_exc()}")
            request_id = ""
            if "message" in locals() and isinstance(message, dict):
                request_id = str(message.get("requestId") or "")
            response = build_response(request_id, False, error=classify_runtime_error(exc))
        write_native_message(response)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        run_self_check()
        return
    run_host_loop()


if __name__ == "__main__":
    main()
