#!/usr/bin/env python3

import argparse
import json
import os
import sys


HOST_NAME = "com.qlhazycoder.codex_oauth_automation_extension"
TARGET_DIRECTORIES = {
    "chrome": os.path.expanduser("~/Library/Application Support/Google/Chrome/NativeMessagingHosts"),
    "chrome-beta": os.path.expanduser("~/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"),
    "chrome-canary": os.path.expanduser("~/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"),
    "chromium": os.path.expanduser("~/Library/Application Support/Chromium/NativeMessagingHosts"),
}


def parse_args():
    parser = argparse.ArgumentParser(description="Uninstall the Chrome Native Messaging host for codex-oauth-automation-extension.")
    parser.add_argument(
        "--target",
        action="append",
        choices=sorted(TARGET_DIRECTORIES),
        help="Browser target to uninstall from. Defaults to chrome.",
    )
    parser.add_argument(
        "--output-dir",
        help="Override manifest directory for testing.",
    )
    return parser.parse_args()


def manifest_paths(args):
    if args.output_dir:
        return [os.path.join(os.path.abspath(args.output_dir), f"{HOST_NAME}.json")]
    targets = args.target or ["chrome"]
    return [os.path.join(TARGET_DIRECTORIES[target], f"{HOST_NAME}.json") for target in targets]


def main():
    args = parse_args()
    removed = []
    missing = []
    for path in manifest_paths(args):
        if os.path.exists(path):
            os.remove(path)
            removed.append(path)
        else:
            missing.append(path)

    print(json.dumps({
        "ok": True,
        "removed": removed,
        "missing": missing,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
