import email
import html
import imaplib
import json
import re
import time
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 17373
LIVE_TOKEN_URL = "https://login.live.com/oauth20_token.srf"
ENTRA_COMMON_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
ENTRA_CONSUMERS_TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
GRAPH_API_ORIGIN = "https://graph.microsoft.com"
OUTLOOK_API_ORIGIN = "https://outlook.office.com"
GRAPH_SCOPES = "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read"
GRAPH_DEFAULT_SCOPE = "https://graph.microsoft.com/.default"
TOKEN_ENDPOINTS = {
    "live": {
        "name": "live",
        "url": LIVE_TOKEN_URL,
        "extra_data": {},
    },
    "entra-consumers-delegated": {
        "name": "entra-consumers-delegated",
        "url": ENTRA_CONSUMERS_TOKEN_URL,
        "extra_data": {
            "scope": GRAPH_SCOPES,
        },
    },
    "entra-common-delegated": {
        "name": "entra-common-delegated",
        "url": ENTRA_COMMON_TOKEN_URL,
        "extra_data": {
            "scope": GRAPH_SCOPES,
        },
    },
    "entra-common-default": {
        "name": "entra-common-default",
        "url": ENTRA_COMMON_TOKEN_URL,
        "extra_data": {
            "scope": GRAPH_DEFAULT_SCOPE,
        },
    },
    "entra-common-outlook": {
        "name": "entra-common-outlook",
        "url": ENTRA_COMMON_TOKEN_URL,
        "extra_data": {},
    },
}
IMAP_HOST = "outlook.office365.com"
IMAP_PORT = 993
REQUEST_TIMEOUT_SECONDS = 45
FETCH_LIMIT_DEFAULT = 5


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


def read_json_payload(handler):
    length = int(handler.headers.get("Content-Length", "0") or 0)
    raw = handler.rfile.read(length) if length > 0 else b"{}"
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Invalid JSON payload: {exc}") from exc


def post_form(url, data):
    encoded = urlencode(data).encode("utf-8")
    request = Request(url, data=encoded, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def get_json(url, headers=None):
    request = Request(url, headers=headers or {})
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.getcode(), json.loads(response.read().decode("utf-8"))


def mask_secret(value, keep=6):
    raw = str(value or "")
    if not raw:
        return ""
    if len(raw) <= keep:
        return "*" * len(raw)
    return raw[:keep] + "..." + raw[-keep:]


def compact_text(value, limit=400):
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    return text[:limit]


def log_info(message):
    print(f"[HotmailHelper] {message}", flush=True)


def try_refresh_access_token(endpoint, client_id, refresh_token):
    request_data = {
        "client_id": client_id,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        **(endpoint.get("extra_data") or {}),
    }
    started_at = time.monotonic()
    try:
        payload = post_form(endpoint["url"], request_data)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return {
            "ok": False,
            "endpoint": endpoint["name"],
            "url": endpoint["url"],
            "status": getattr(exc, "code", None),
            "error": compact_text(detail or str(exc)),
            "elapsed_ms": int((time.monotonic() - started_at) * 1000),
        }
    except URLError as exc:
        return {
            "ok": False,
            "endpoint": endpoint["name"],
            "url": endpoint["url"],
            "status": None,
            "error": compact_text(f"Token request failed: {exc}"),
            "elapsed_ms": int((time.monotonic() - started_at) * 1000),
        }

    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        return {
            "ok": False,
            "endpoint": endpoint["name"],
            "url": endpoint["url"],
            "status": 200,
            "error": compact_text(payload.get("error_description") or payload.get("error") or json.dumps(payload, ensure_ascii=False)),
            "elapsed_ms": int((time.monotonic() - started_at) * 1000),
        }

    return {
        "ok": True,
        "endpoint": endpoint["name"],
        "url": endpoint["url"],
        "elapsed_ms": int((time.monotonic() - started_at) * 1000),
        "payload": {
            "access_token": access_token,
            "next_refresh_token": str(payload.get("refresh_token") or "").strip(),
        },
    }


def refresh_access_token(client_id, refresh_token, strategy_names=None):
    errors = []
    selected_endpoints = [
        TOKEN_ENDPOINTS[name]
        for name in (strategy_names or ["live", "entra-consumers-delegated", "entra-common-delegated"])
        if name in TOKEN_ENDPOINTS
    ]
    log_info(
        "token refresh start "
        f"clientId={mask_secret(client_id)} "
        f"refreshToken={mask_secret(refresh_token)} "
        f"strategies={[item['name'] for item in selected_endpoints]}"
    )

    for endpoint in selected_endpoints:
        result = try_refresh_access_token(endpoint, client_id, refresh_token)
        if result["ok"]:
            log_info(
                "token refresh success "
                f"endpoint={result['endpoint']} "
                f"elapsedMs={result['elapsed_ms']}"
            )
            return {
                "access_token": result["payload"]["access_token"],
                "next_refresh_token": result["payload"]["next_refresh_token"],
                "token_endpoint": result["endpoint"],
                "token_url": result["url"],
            }

        errors.append(result)
        log_info(
            "token refresh failed "
            f"endpoint={result['endpoint']} "
            f"status={result['status']} "
            f"elapsedMs={result['elapsed_ms']} "
            f"detail={result['error']}"
        )

    details = " | ".join(
        f"{item['endpoint']}({item['status']}): {item['error']}"
        for item in errors
    )
    raise RuntimeError(f"Token refresh failed on all endpoints: {details}")


def build_xoauth2(email_addr, access_token):
    return f"user={email_addr}\x01auth=Bearer {access_token}\x01\x01".encode("utf-8")


def open_mailbox(email_addr, access_token):
    client = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, timeout=REQUEST_TIMEOUT_SECONDS)
    client.authenticate("XOAUTH2", lambda _: build_xoauth2(email_addr, access_token))
    return client


def decode_mime_header(value):
    if not value:
        return ""
    parts = []
    for chunk, charset in decode_header(value):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(charset or "utf-8", errors="ignore"))
        else:
            parts.append(str(chunk))
    return "".join(parts).strip()


def extract_text_part(message):
    if message.is_multipart():
        for part in message.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if "attachment" in str(part.get("Content-Disposition") or "").lower():
                continue
            payload = part.get_payload(decode=True) or b""
            charset = part.get_content_charset() or "utf-8"
            text = payload.decode(charset, errors="ignore").strip()
            if part.get_content_type() == "text/plain" and text:
                return text
            if part.get_content_type() == "text/html" and text:
                return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(text))).strip()
        return ""

    payload = message.get_payload(decode=True) or b""
    charset = message.get_content_charset() or "utf-8"
    text = payload.decode(charset, errors="ignore").strip()
    if message.get_content_type() == "text/html":
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(text))).strip()
    return text


def mailbox_candidates(mailbox):
    normalized = str(mailbox or "INBOX").strip().lower()
    if normalized in {"junk", "junk email", "junk e-mail", "junkemail"}:
        return ["Junk", "Junk Email", "Junk E-Mail"]
    return ["INBOX"]


def normalize_mailbox_label(mailbox):
    normalized = str(mailbox or "INBOX").strip().lower()
    if normalized in {"junk", "junk email", "junk e-mail", "junkemail"}:
        return "Junk"
    return "INBOX"


def normalize_mailbox_id(mailbox):
    normalized = str(mailbox or "INBOX").strip().lower()
    if normalized in {"junk", "junk email", "junk e-mail", "junkemail"}:
        return "junkemail"
    return "inbox"


def select_mailbox(client, mailbox):
    for candidate in mailbox_candidates(mailbox):
        status, _ = client.select(candidate)
        if status == "OK":
            return candidate
    raise RuntimeError(f"Mailbox not found: {mailbox}")


def to_timestamp_ms(raw_date):
    if not raw_date:
        return 0
    try:
        parsed = parsedate_to_datetime(raw_date)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp() * 1000)
    except Exception:
        return 0


def to_iso_string(timestamp_ms):
    if not timestamp_ms:
        return ""
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_message(message_id, raw_bytes, mailbox):
    parsed = email.message_from_bytes(raw_bytes)
    sender_name, sender_addr = parseaddr(parsed.get("From", ""))
    subject = decode_mime_header(parsed.get("Subject", ""))
    body = extract_text_part(parsed)
    timestamp_ms = to_timestamp_ms(parsed.get("Date"))
    return {
        "id": str(message_id),
        "mailbox": mailbox,
        "subject": subject,
        "from": {
            "emailAddress": {
                "address": sender_addr.strip(),
                "name": sender_name.strip(),
            }
        },
        "bodyPreview": body[:500],
        "receivedDateTime": to_iso_string(timestamp_ms),
        "receivedTimestamp": timestamp_ms,
    }


def fetch_messages(email_addr, access_token, mailbox="INBOX", top=FETCH_LIMIT_DEFAULT):
    client = None
    logical_mailbox = normalize_mailbox_label(mailbox)
    try:
        client = open_mailbox(email_addr, access_token)
        select_mailbox(client, mailbox)
        status, data = client.search(None, "ALL")
        if status != "OK" or not data or not data[0]:
            return {"mailbox": logical_mailbox, "messages": [], "count": 0}

        message_ids = data[0].split()
        selected_ids = list(reversed(message_ids[-max(1, min(int(top or FETCH_LIMIT_DEFAULT), 30)):]))
        messages = []
        for message_id in selected_ids:
            fetch_status, fetch_data = client.fetch(message_id, "(RFC822)")
            if fetch_status != "OK" or not fetch_data:
                continue
            raw_bytes = b""
            for item in fetch_data:
                if isinstance(item, tuple) and len(item) >= 2:
                    raw_bytes = item[1]
                    break
            if not raw_bytes:
                continue
            messages.append(normalize_message(message_id.decode("utf-8", errors="ignore"), raw_bytes, logical_mailbox))
        return {"mailbox": logical_mailbox, "messages": messages, "count": len(messages)}
    finally:
        if client is not None:
            try:
                client.logout()
            except Exception:
                pass


def fetch_messages_for_mailboxes(email_addr, access_token, mailboxes, top):
    mailbox_results = []
    all_messages = []
    for mailbox in mailboxes or ["INBOX"]:
        result = fetch_messages(email_addr, access_token, mailbox=mailbox, top=top)
        mailbox_results.append(result)
        all_messages.extend(result["messages"])
    all_messages.sort(key=lambda item: int(item.get("receivedTimestamp") or 0), reverse=True)
    return {"mailboxResults": mailbox_results, "messages": all_messages}


def normalize_graph_message(message, mailbox):
    sender = message.get("from", {}) or {}
    email_addr = sender.get("emailAddress", {}) if isinstance(sender, dict) else {}
    received = str(message.get("receivedDateTime") or "").strip()
    return {
        "id": str(message.get("id") or message.get("internetMessageId") or "").strip(),
        "mailbox": mailbox,
        "subject": str(message.get("subject") or "").strip(),
        "from": {
            "emailAddress": {
                "address": str(email_addr.get("address") or "").strip(),
                "name": str(email_addr.get("name") or "").strip(),
            }
        },
        "bodyPreview": str(message.get("bodyPreview") or "").strip(),
        "receivedDateTime": received,
        "receivedTimestamp": int(datetime.fromisoformat(received.replace("Z", "+00:00")).timestamp() * 1000) if received else 0,
    }


def normalize_outlook_message(message, mailbox):
    sender = message.get("From", {}) or message.get("from", {}) or {}
    email_addr = sender.get("EmailAddress", {}) if isinstance(sender, dict) else {}
    if isinstance(sender, dict) and not email_addr:
        email_addr = sender.get("emailAddress", {}) if isinstance(sender, dict) else {}
    received = str(message.get("ReceivedDateTime") or message.get("receivedDateTime") or "").strip()
    return {
        "id": str(message.get("Id") or message.get("id") or "").strip(),
        "mailbox": mailbox,
        "subject": str(message.get("Subject") or message.get("subject") or "").strip(),
        "from": {
            "emailAddress": {
                "address": str(email_addr.get("Address") or email_addr.get("address") or "").strip(),
                "name": str(email_addr.get("Name") or email_addr.get("name") or "").strip(),
            }
        },
        "bodyPreview": str(message.get("BodyPreview") or message.get("bodyPreview") or "").strip(),
        "receivedDateTime": received,
        "receivedTimestamp": int(datetime.fromisoformat(received.replace("Z", "+00:00")).timestamp() * 1000) if received else 0,
    }


def fetch_graph_messages(access_token, mailbox="INBOX", top=FETCH_LIMIT_DEFAULT):
    mailbox_id = normalize_mailbox_id(mailbox)
    url = (
        f"{GRAPH_API_ORIGIN}/v1.0/me/mailFolders/{mailbox_id}/messages"
        f"?$top={max(1, min(int(top or FETCH_LIMIT_DEFAULT), 30))}"
        f"&$select=id,internetMessageId,subject,from,bodyPreview,receivedDateTime"
        f"&$orderby=receivedDateTime desc"
    )
    try:
        _, payload = get_json(url, headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
        })
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Graph request failed: {detail or exc}") from exc
    except URLError as exc:
        raise RuntimeError(f"Graph request failed: {exc}") from exc

    messages = [normalize_graph_message(item, normalize_mailbox_label(mailbox)) for item in (payload.get("value") or [])]
    return {"mailbox": normalize_mailbox_label(mailbox), "messages": messages, "count": len(messages)}


def fetch_outlook_api_messages(access_token, mailbox="INBOX", top=FETCH_LIMIT_DEFAULT):
    mailbox_id = normalize_mailbox_id(mailbox)
    url = (
        f"{OUTLOOK_API_ORIGIN}/api/v2.0/me/mailfolders/{mailbox_id}/messages"
        f"?$top={max(1, min(int(top or FETCH_LIMIT_DEFAULT), 30))}"
        f"&$select=Id,Subject,From,BodyPreview,ReceivedDateTime"
        f"&$orderby=ReceivedDateTime desc"
    )
    try:
        _, payload = get_json(url, headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
        })
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Outlook API request failed: {detail or exc}") from exc
    except URLError as exc:
        raise RuntimeError(f"Outlook API request failed: {exc}") from exc

    messages = [normalize_outlook_message(item, normalize_mailbox_label(mailbox)) for item in (payload.get("value") or [])]
    return {"mailbox": normalize_mailbox_label(mailbox), "messages": messages, "count": len(messages)}


def collect_imap_messages(email_addr, client_id, refresh_token, mailboxes, top):
    token_payload = refresh_access_token(client_id, refresh_token, [
        "live",
        "entra-consumers-delegated",
        "entra-common-delegated",
    ])
    result = fetch_messages_for_mailboxes(email_addr, token_payload["access_token"], mailboxes, top)
    result["transport"] = "imap"
    result["token_payload"] = token_payload
    return result


def collect_graph_messages(email_addr, client_id, refresh_token, mailboxes, top):
    token_payload = refresh_access_token(client_id, refresh_token, [
        "entra-common-delegated",
        "entra-consumers-delegated",
        "entra-common-default",
    ])
    mailbox_results = [fetch_graph_messages(token_payload["access_token"], mailbox=mailbox, top=top) for mailbox in mailboxes]
    messages = []
    for item in mailbox_results:
        messages.extend(item["messages"])
    messages.sort(key=lambda item: int(item.get("receivedTimestamp") or 0), reverse=True)
    return {
        "transport": "graph",
        "token_payload": token_payload,
        "mailboxResults": mailbox_results,
        "messages": messages,
    }


def collect_outlook_messages(email_addr, client_id, refresh_token, mailboxes, top):
    token_payload = refresh_access_token(client_id, refresh_token, [
        "entra-common-outlook",
        "entra-common-delegated",
    ])
    mailbox_results = [fetch_outlook_api_messages(token_payload["access_token"], mailbox=mailbox, top=top) for mailbox in mailboxes]
    messages = []
    for item in mailbox_results:
        messages.extend(item["messages"])
    messages.sort(key=lambda item: int(item.get("receivedTimestamp") or 0), reverse=True)
    return {
        "transport": "outlook",
        "token_payload": token_payload,
        "mailboxResults": mailbox_results,
        "messages": messages,
    }


def collect_messages(email_addr, client_id, refresh_token, mailboxes, top):
    errors = []
    collectors = [
        ("imap", collect_imap_messages),
        ("graph", collect_graph_messages),
        ("outlook", collect_outlook_messages),
    ]

    for transport_name, collector in collectors:
        try:
            log_info(f"message collection start transport={transport_name}")
            result = collector(email_addr, client_id, refresh_token, mailboxes, top)
            log_info(
                f"message collection success transport={transport_name} "
                f"tokenEndpoint={result['token_payload'].get('token_endpoint', '')}"
            )
            return result
        except Exception as exc:
            message = compact_text(str(exc), 600)
            errors.append(f"{transport_name}: {message}")
            log_info(f"message collection failed transport={transport_name} detail={message}")

    raise RuntimeError(f"Message collection failed on all transports: {' | '.join(errors)}")


def extract_code(text):
    source = str(text or "")
    patterns = [
        r"(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})",
        r"code(?:\s+is|[\s:])+(\d{6})",
        r"\b(\d{6})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, source, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def select_latest_code(messages, sender_filters, subject_filters, exclude_codes, filter_after_timestamp):
    sender_keywords = [str(item).strip().lower() for item in sender_filters or [] if str(item).strip()]
    subject_keywords = [str(item).strip().lower() for item in subject_filters or [] if str(item).strip()]
    excluded = {str(item).strip() for item in exclude_codes or [] if str(item).strip()}

    def match_message(message, apply_time_filter):
        timestamp = int(message.get("receivedTimestamp") or 0)
        if apply_time_filter and filter_after_timestamp and timestamp and timestamp < int(filter_after_timestamp):
            return None

        sender = str(message.get("from", {}).get("emailAddress", {}).get("address", "")).lower()
        subject = str(message.get("subject", ""))
        preview = str(message.get("bodyPreview", ""))
        combined = " ".join([sender, subject.lower(), preview.lower()])
        code = extract_code(" ".join([subject, preview, sender]))
        if not code or code in excluded:
            return None

        sender_ok = not sender_keywords or any(keyword in combined for keyword in sender_keywords)
        subject_ok = not subject_keywords or any(keyword in combined for keyword in subject_keywords)
        if not sender_ok and not subject_ok:
            return None

        return {"code": code, "message": message}

    for use_time_fallback in [False, True]:
        matched = []
        for message in messages:
            result = match_message(message, apply_time_filter=not use_time_fallback)
            if result:
                matched.append(result)
        if matched:
            matched.sort(key=lambda item: int(item["message"].get("receivedTimestamp") or 0), reverse=True)
            best = matched[0]
            return {
                "code": best["code"],
                "message": best["message"],
                "usedTimeFallback": use_time_fallback,
            }
    return {"code": "", "message": None, "usedTimeFallback": False}


class HotmailHelperHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self):
        try:
            payload = read_json_payload(self)
            email_addr = str(payload.get("email") or "").strip()
            client_id = str(payload.get("clientId") or "").strip()
            refresh_token = str(payload.get("refreshToken") or "").strip()
            if not email_addr or not client_id or not refresh_token:
                raise RuntimeError("Missing email/clientId/refreshToken")

            top = max(1, min(int(payload.get("top") or FETCH_LIMIT_DEFAULT), 30))
            mailboxes = payload.get("mailboxes") if isinstance(payload.get("mailboxes"), list) else [payload.get("mailbox") or "INBOX"]

            if self.path == "/messages":
                result = collect_messages(email_addr, client_id, refresh_token, mailboxes, top)
                json_response(self, 200, {
                    "ok": True,
                    "messages": result["messages"],
                    "mailboxResults": result["mailboxResults"],
                    "nextRefreshToken": result["token_payload"].get("next_refresh_token") or "",
                    "tokenEndpoint": result["token_payload"].get("token_endpoint") or "",
                    "transport": result.get("transport") or "",
                })
                return

            if self.path == "/code":
                result = collect_messages(email_addr, client_id, refresh_token, mailboxes, top)
                selected = select_latest_code(
                    result["messages"],
                    payload.get("senderFilters") or [],
                    payload.get("subjectFilters") or [],
                    payload.get("excludeCodes") or [],
                    int(payload.get("filterAfterTimestamp") or 0),
                )
                json_response(self, 200, {
                    "ok": True,
                    "code": selected["code"],
                    "message": selected["message"],
                    "usedTimeFallback": selected["usedTimeFallback"],
                    "nextRefreshToken": result["token_payload"].get("next_refresh_token") or "",
                    "tokenEndpoint": result["token_payload"].get("token_endpoint") or "",
                    "transport": result.get("transport") or "",
                })
                return

            json_response(self, 404, {"ok": False, "error": f"Unsupported path: {self.path}"})
        except Exception as exc:
            json_response(self, 500, {"ok": False, "error": str(exc)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), HotmailHelperHandler)
    print(f"Hotmail helper listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
