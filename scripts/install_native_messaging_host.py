#!/usr/bin/env python3

import argparse
import json
import os
import re
import stat
import subprocess
import sys


HOST_NAME = "com.qlhazycoder.codex_oauth_automation_extension"
HOST_PROTOCOL_VERSION = 1
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HOST_SCRIPT_PATH = os.path.join(BASE_DIR, "scripts", "native_messaging_host.py")
TARGET_DIRECTORIES = {
    "chrome": os.path.expanduser("~/Library/Application Support/Google/Chrome/NativeMessagingHosts"),
    "chrome-beta": os.path.expanduser("~/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"),
    "chrome-canary": os.path.expanduser("~/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"),
    "chromium": os.path.expanduser("~/Library/Application Support/Chromium/NativeMessagingHosts"),
}


def parse_args():
    parser = argparse.ArgumentParser(description="Install the Chrome Native Messaging host for codex-oauth-automation-extension.")
    parser.add_argument("--extension-id", required=True, help="Chrome extension ID (32 chars, a-p).")
    parser.add_argument(
        "--target",
        action="append",
        choices=sorted(TARGET_DIRECTORIES),
        help="Browser target to install into. Defaults to chrome.",
    )
    parser.add_argument(
        "--output-dir",
        help="Override manifest output directory for testing.",
    )
    parser.add_argument(
        "--skip-self-check",
        action="store_true",
        help="Skip running the native host self-check before writing the manifest.",
    )
    return parser.parse_args()


def validate_extension_id(extension_id):
    value = str(extension_id or "").strip()
    if not re.fullmatch(r"[a-p]{32}", value):
        raise RuntimeError("Chrome 扩展 ID 格式无效，应为 32 位 a-p 字符。")
    return value


def ensure_executable(path):
    mode = os.stat(path).st_mode
    os.chmod(
        path,
        mode
        | stat.S_IXUSR
        | stat.S_IXGRP
        | stat.S_IXOTH,
    )


def run_self_check():
    completed = subprocess.run(
        [HOST_SCRIPT_PATH, "--self-check"],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"Native host self-check failed: {completed.stderr.strip() or completed.stdout.strip() or completed.returncode}")
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Native host self-check returned invalid JSON: {exc}") from exc
    if not payload.get("ok"):
        raise RuntimeError("Native host self-check did not report success.")
    return payload


def build_manifest(extension_id):
    return {
        "name": HOST_NAME,
        "description": "Codex OAuth Automation local Native Messaging host",
        "path": HOST_SCRIPT_PATH,
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{extension_id}/",
        ],
        "protocol_version": HOST_PROTOCOL_VERSION,
    }


def write_manifest(output_dir, manifest):
    os.makedirs(output_dir, exist_ok=True)
    manifest_path = os.path.join(output_dir, f"{HOST_NAME}.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return manifest_path


def main():
    args = parse_args()
    extension_id = validate_extension_id(args.extension_id)
    ensure_executable(HOST_SCRIPT_PATH)
    self_check = None if args.skip_self_check else run_self_check()

    targets = args.target or ["chrome"]
    output_directories = [os.path.abspath(args.output_dir)] if args.output_dir else [TARGET_DIRECTORIES[target] for target in targets]
    manifest = build_manifest(extension_id)

    manifest_paths = [write_manifest(output_dir, manifest) for output_dir in output_directories]
    summary = {
        "ok": True,
        "hostName": HOST_NAME,
        "hostScriptPath": HOST_SCRIPT_PATH,
        "manifestPaths": manifest_paths,
        "extensionOrigin": manifest["allowed_origins"][0],
        "protocolVersion": HOST_PROTOCOL_VERSION,
    }
    if self_check is not None:
        summary["selfCheck"] = self_check
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
