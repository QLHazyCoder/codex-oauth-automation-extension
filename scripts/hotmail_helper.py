import email
import imaplib
import json
import re
import threading
import traceback
from datetime import datetime
from email.header import decode_header
from email.utils import parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests


HOST = "127.0.0.1"
PORT = 17373
TOKEN_URL = "https://login.live.com/oauth20_token.srf"
IMAP_HOST = "outlook.office365.com"
IMAP_PORT = 993
MESSAGE_CACHE = {}
MESSAGE_CACHE_LOCK = threading.Lock()
MESSAGE_CACHE_LIMIT = 200


def _now_text():
    return datetime.now().strftime("%H:%M:%S")


def log_event(level, message):
    print(f"[{_now_text()}] [{level}] {message}")


def log_info(message):
    log_event("INFO", message)


def log_warn(message):
    log_event("WARN", message)


def log_error(message):
    log_event("ERROR", message)


def json_response(handler, status_code, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


def mask_secret(value, keep=6):
    text = str(value or "")
    if not text:
        return ""
    if len(text) <= keep:
        return text
    return f"...{text[-keep:]}"


def mask_email(value):
    text = str(value or "").strip()
    if "@" not in text:
        return text
    local, domain = text.split("@", 1)
    if len(local) <= 4:
        masked_local = local[:1] + "***"
    else:
        masked_local = f"{local[:2]}***{local[-2:]}"
    return f"{masked_local}@{domain}"


def decode_mime_header(value):
    if not value:
        return ""
    parts = decode_header(value)
    decoded = []
    for chunk, encoding in parts:
        if isinstance(chunk, bytes):
            decoded.append(chunk.decode(encoding or "utf-8", errors="ignore"))
        else:
            decoded.append(chunk)
    return "".join(decoded)


def strip_html(html_text):
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", html_text or "")
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_mail_datetime_to_epoch_ms(raw_value):
    text = str(raw_value or "").strip()
    if not text:
        return 0
    try:
        dt = parsedate_to_datetime(text)
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def format_timestamp_ms(timestamp_ms):
    try:
        ts = int(timestamp_ms or 0)
    except Exception:
        ts = 0
    if ts <= 0:
        return "unknown"
    return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")


def extract_verification_code(text):
    normalized = str(text or "")

    match_cn = re.search(r"(?:验证码|代码|code)[^0-9]{0,20}(\d{6})", normalized, re.I)
    if match_cn:
        return match_cn.group(1)

    match_en = re.search(r"code[:\s]+is[:\s]+(\d{6})|code[:\s]+(\d{6})", normalized, re.I)
    if match_en:
        return match_en.group(1) or match_en.group(2)

    match_6 = re.search(r"\b(\d{6})\b", normalized)
    if match_6:
        return match_6.group(1)

    return None


def message_matches_filters(message, sender_filters=None, subject_filters=None):
    sender_filters = [str(item).lower() for item in (sender_filters or []) if str(item).strip()]
    subject_filters = [str(item).lower() for item in (subject_filters or []) if str(item).strip()]

    subject = str(message.get("subject") or "").lower()
    from_addr = str(((message.get("from") or {}).get("emailAddress") or {}).get("address") or "").lower()
    from_name = str(((message.get("from") or {}).get("emailAddress") or {}).get("name") or "").lower()
    body_preview = str(message.get("bodyPreview") or "").lower()
    body = str(message.get("body") or "").lower()
    combined = " ".join([subject, from_addr, from_name, body_preview, body]).strip()

    sender_match = any(f in from_addr or f in from_name or f in combined for f in sender_filters)
    subject_match = any(f in subject or f in combined for f in subject_filters)
    code = extract_verification_code(combined)
    keyword_match = bool(re.search(r"openai|chatgpt|verify|verification|confirm|login|楠岃瘉鐮亅浠ｇ爜", combined, re.I))

    return sender_match or subject_match or bool(code and keyword_match)


def summarize_message(message):
    sender = str(((message.get("from") or {}).get("emailAddress") or {}).get("address") or "").strip()
    subject = str(message.get("subject") or "").strip()
    timestamp = format_timestamp_ms(message.get("receivedTimestamp"))
    mailbox = str(message.get("mailbox") or "INBOX").strip()
    return f"id={message.get('id') or '-'} mailbox={mailbox} time={timestamp} from={sender or '-'} subject={subject or '-'}"


def abbreviate_text(value, max_length=56):
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 3]}..."


def summarize_message_brief(message):
    sender = str(((message.get("from") or {}).get("emailAddress") or {}).get("address") or "").strip()
    subject = str(message.get("subject") or "").strip()
    timestamp = format_timestamp_ms(message.get("receivedTimestamp"))
    mailbox = str(message.get("mailbox") or "INBOX").strip()
    return (
        f"mailbox={mailbox} "
        f"time={timestamp} "
        f"from={abbreviate_text(sender or '-', 28)} "
        f"subject={abbreviate_text(subject or '-', 64)}"
    )


def log_message_list(prefix, messages, max_items=5):
    count = len(messages or [])
    log_info(f"{prefix} count={count}")
    for index, message in enumerate((messages or [])[:max_items], start=1):
        log_info(f"{prefix} sample[{index}] {summarize_message_brief(message)}")
    if count > max_items:
        log_info(f"{prefix} omitted={count - max_items}")


def summarize_diagnostics(diagnostics):
    counts = {}
    for line in diagnostics or []:
        match = re.search(r"skip=([a-z_]+)", str(line))
        if match:
            reason = match.group(1)
            counts[reason] = counts.get(reason, 0) + 1
    if not counts:
        return "no_skip_reasons"
    ordered = sorted(counts.items(), key=lambda item: item[0])
    return ", ".join(f"{reason}={count}" for reason, count in ordered)


def normalize_mailbox_name(mailbox):
    normalized = str(mailbox or "INBOX").strip().lower()
    if normalized in {"junk", "junk email", "junkemail", "spam", "bulk mail"}:
        return "Junk"
    return "INBOX"


def get_mailbox_candidates(mailbox):
    normalized = normalize_mailbox_name(mailbox)
    if normalized == "Junk":
        return ["Junk", "Junk Email", "Junk E-Mail", "Bulk Mail", "Spam"]
    return ["INBOX"]


def select_mailbox(mail, mailbox):
    candidates = get_mailbox_candidates(mailbox)
    for candidate in candidates:
        try:
            status, _ = mail.select(candidate, readonly=True)
        except Exception:
            status = "NO"
        if status == "OK":
            return candidate

    if normalize_mailbox_name(mailbox) == "INBOX":
        raise RuntimeError(f"Mailbox not found: {mailbox}")

    log_warn(f"mailbox not found mailbox={mailbox} candidates={candidates}")
    return ""


def build_message_signature(message):
    return "|".join([
        str(message.get("mailbox") or "").strip(),
        str(message.get("id") or "").strip(),
        str(message.get("receivedTimestamp") or 0),
        str(message.get("subject") or "").strip(),
        str(((message.get("from") or {}).get("emailAddress") or {}).get("address") or "").strip(),
    ])


def get_cached_message_signatures(email_addr, mailbox):
    cache_key = f"{str(email_addr or '').strip().lower()}::{normalize_mailbox_name(mailbox)}"
    with MESSAGE_CACHE_LOCK:
        cached = MESSAGE_CACHE.get(cache_key) or {}
        return set(cached.get("signatures") or [])


def update_message_cache(email_addr, mailbox, messages):
    cache_key = f"{str(email_addr or '').strip().lower()}::{normalize_mailbox_name(mailbox)}"
    entries = []
    local_seen = set()

    for message in messages or []:
        signature = build_message_signature(message)
        if not signature or signature in local_seen:
            continue
        local_seen.add(signature)
        entries.append({
            "signature": signature,
            "receivedTimestamp": int(message.get("receivedTimestamp") or 0),
        })

    with MESSAGE_CACHE_LOCK:
        previous = MESSAGE_CACHE.get(cache_key) or {"entries": []}
        merged = list(previous.get("entries") or []) + entries
        deduped = []
        merged_seen = set()
        for entry in sorted(merged, key=lambda item: int(item.get("receivedTimestamp") or 0), reverse=True):
            signature = str(entry.get("signature") or "").strip()
            if not signature or signature in merged_seen:
                continue
            merged_seen.add(signature)
            deduped.append({
                "signature": signature,
                "receivedTimestamp": int(entry.get("receivedTimestamp") or 0),
            })
            if len(deduped) >= MESSAGE_CACHE_LIMIT:
                break
        MESSAGE_CACHE[cache_key] = {
            "entries": deduped,
            "signatures": [entry["signature"] for entry in deduped],
        }


def analyze_code_selection(messages, sender_filters=None, subject_filters=None, exclude_codes=None, filter_after_timestamp=0):
    exclude_codes = set(str(code) for code in (exclude_codes or []) if str(code).strip())
    threshold = int(filter_after_timestamp or 0)
    sorted_messages = sorted(messages or [], key=lambda item: int(item.get("receivedTimestamp") or 0), reverse=True)
    diagnostics = []

    for index, message in enumerate(sorted_messages, start=1):
        received_ts = int(message.get("receivedTimestamp") or 0)
        summary = summarize_message(message)

        if not message_matches_filters(message, sender_filters=sender_filters, subject_filters=subject_filters):
            diagnostics.append(f"[{index}] skip=filter_mismatch {summary}")
            continue

        text = " ".join([
            str(message.get("subject") or ""),
            str(message.get("bodyPreview") or ""),
            str(message.get("body") or ""),
        ])
        code = extract_verification_code(text)
        if not code:
            diagnostics.append(f"[{index}] skip=no_code {summary}")
            continue

        if code in exclude_codes:
            diagnostics.append(f"[{index}] skip=excluded_code code={code} {summary}")
            continue

        if threshold and (not received_ts or received_ts <= threshold):
            diagnostics.append(f"[{index}] skip=older_than_threshold code={code} threshold={format_timestamp_ms(threshold)} {summary}")
            continue

        diagnostics.append(f"[{index}] select code={code} {summary}")
        return {
            "code": code,
            "message": message,
            "diagnostics": diagnostics,
            "used_time_fallback": False,
        }

    diagnostics.append("no_usable_code_found")
    return {
        "code": None,
        "message": None,
        "diagnostics": diagnostics,
        "used_time_fallback": False,
    }


def find_new_code_from_cache_delta(messages, cached_signatures=None, exclude_codes=None, start_timestamp=0):
    cached_signatures = set(cached_signatures or [])
    exclude_codes = set(str(code) for code in (exclude_codes or []) if str(code).strip())
    threshold = int(start_timestamp or 0)
    candidates = []

    for message in messages or []:
        signature = build_message_signature(message)
        if not signature or signature in cached_signatures:
            continue

        received_ts = int(message.get("receivedTimestamp") or 0)
        if threshold > 0 and received_ts <= threshold:
            continue

        text = " ".join([
            str(message.get("subject") or ""),
            str(message.get("bodyPreview") or ""),
            str(message.get("body") or ""),
        ])
        code = extract_verification_code(text)
        if not code or code in exclude_codes:
            continue

        candidates.append({
            "code": code,
            "message": message,
            "receivedTimestamp": received_ts,
        })

    candidates.sort(key=lambda item: int(item.get("receivedTimestamp") or 0), reverse=True)
    return candidates[0] if candidates else None


def select_latest_usable_code(messages, sender_filters=None, subject_filters=None, exclude_codes=None, filter_after_timestamp=0):
    analyzed = analyze_code_selection(
        messages,
        sender_filters=sender_filters,
        subject_filters=subject_filters,
        exclude_codes=exclude_codes,
        filter_after_timestamp=filter_after_timestamp,
    )
    if not analyzed.get("code"):
        return None
    return {
        "code": analyzed["code"],
        "message": analyzed["message"],
    }


def get_access_token_payload(client_id, refresh_token):
    log_info(
        f"token refresh start clientId={mask_secret(client_id)} "
        f"refreshToken={mask_secret(refresh_token)}"
    )
    response = requests.post(
        TOKEN_URL,
        data={
            "client_id": client_id,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise RuntimeError(payload.get("error_description") or payload.get("error") or "Failed to get access token")
    log_info("token refresh success")
    return {
        "accessToken": access_token,
        "nextRefreshToken": str(payload.get("refresh_token") or "").strip(),
    }


def build_oauth2_string(email_addr, access_token):
    return f"user={email_addr}\x01auth=Bearer {access_token}\x01\x01".encode("utf-8")


def fetch_messages(email_addr, access_token, top=3, mailbox="INBOX"):
    normalized_mailbox = normalize_mailbox_name(mailbox)
    log_info(f"fetch mailbox start email={mask_email(email_addr)} mailbox={normalized_mailbox} top={top}")
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    auth_string = build_oauth2_string(email_addr, access_token)
    mail.authenticate("XOAUTH2", lambda _: auth_string)
    selected_mailbox = select_mailbox(mail, normalized_mailbox)
    if not selected_mailbox:
        mail.logout()
        return []

    status, data = mail.search(None, "ALL")
    if status != "OK" or not data or not data[0]:
        log_warn(
            f"fetch mailbox empty_or_failed email={mask_email(email_addr)} "
            f"mailbox={normalized_mailbox} status={status}"
        )
        mail.logout()
        return []

    email_ids = data[0].split()
    selected_ids = email_ids[-top:]
    messages = []

    for message_id in reversed(selected_ids):
        fetch_status, msg_data = mail.fetch(message_id, "(RFC822 INTERNALDATE)")
        if fetch_status != "OK":
            log_warn(f"fetch mailbox skip message_id={message_id!r} status={fetch_status}")
            continue

        internal_date_raw = ""
        for part in msg_data:
            if not isinstance(part, tuple):
                continue

            if isinstance(part[0], bytes):
                internal_date_raw = part[0].decode("utf-8", errors="ignore")

            msg = email.message_from_bytes(part[1])
            subject = decode_mime_header(msg.get("Subject"))
            from_header = decode_mime_header(msg.get("From"))
            date_header = decode_mime_header(msg.get("Date"))

            body_text = ""
            body_preview = ""
            if msg.is_multipart():
                for subpart in msg.walk():
                    content_type = subpart.get_content_type()
                    content_disposition = str(subpart.get("Content-Disposition") or "")
                    if "attachment" in content_disposition.lower():
                        continue
                    payload = subpart.get_payload(decode=True)
                    if not payload:
                        continue
                    decoded = payload.decode(subpart.get_content_charset() or "utf-8", errors="ignore")
                    if content_type == "text/plain" and not body_text:
                        body_text = decoded
                    elif content_type == "text/html" and not body_preview:
                        body_preview = strip_html(decoded)
            else:
                payload = msg.get_payload(decode=True) or b""
                decoded = payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")
                if msg.get_content_type() == "text/html":
                    body_preview = strip_html(decoded)
                else:
                    body_text = decoded

            body = body_text or body_preview
            messages.append({
                "id": message_id.decode("utf-8", errors="ignore"),
                "subject": subject,
                "bodyPreview": (body_preview or body_text)[:500],
                "body": body,
                "from": {
                    "emailAddress": {
                        "address": from_header,
                        "name": from_header,
                    }
                },
                "receivedDateTime": date_header,
                "receivedTimestamp": parse_mail_datetime_to_epoch_ms(date_header) or parse_mail_datetime_to_epoch_ms(internal_date_raw),
                "mailbox": normalized_mailbox,
            })
            break

    mail.logout()
    log_info(
        f"fetch mailbox done email={mask_email(email_addr)} "
        f"mailbox={normalized_mailbox} fetched={len(messages)}"
    )
    return messages


def fetch_messages_for_mailboxes(email_addr, access_token, top=3, mailboxes=None):
    mailbox_list = mailboxes if isinstance(mailboxes, list) and mailboxes else ["INBOX"]
    mailbox_results = []
    all_messages = []

    for mailbox in mailbox_list:
        messages = fetch_messages(email_addr, access_token, top=top, mailbox=mailbox)
        mailbox_name = normalize_mailbox_name(mailbox)
        update_message_cache(email_addr, mailbox_name, messages)
        mailbox_results.append({
            "mailbox": mailbox_name,
            "messages": messages,
            "count": len(messages),
        })
        all_messages.extend(messages)

    return {
        "mailboxResults": mailbox_results,
        "messages": all_messages,
    }


def delete_all_messages(email_addr, access_token):
    log_info(f"clear inbox start email={mask_email(email_addr)}")
    mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    auth_string = build_oauth2_string(email_addr, access_token)
    mail.authenticate("XOAUTH2", lambda _: auth_string)
    mail.select("INBOX")

    status, data = mail.search(None, "ALL")
    if status != "OK" or not data or not data[0]:
        log_info(f"clear inbox nothing_to_delete email={mask_email(email_addr)} status={status}")
        mail.logout()
        return 0

    email_ids = data[0].split()
    deleted_count = 0

    for message_id in email_ids:
        store_status, _ = mail.store(message_id, "+FLAGS", "\\Deleted")
        if store_status == "OK":
            deleted_count += 1

    if deleted_count:
        mail.expunge()

    mail.logout()
    log_info(f"clear inbox done email={mask_email(email_addr)} deleted={deleted_count}")
    return deleted_count


class HotmailHelperHandler(BaseHTTPRequestHandler):
    server_version = "HotmailHelper/1.0"

    def log_message(self, fmt, *args):
        return

    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True})

    def do_GET(self):
        if self.path == "/health":
            json_response(self, 200, {"ok": True, "service": "hotmail-helper"})
            return
        json_response(self, 404, {"error": "Not found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length") or "0")
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            payload = {}

        try:
            log_info(f"request {self.path}")

            if self.path == "/token":
                client_id = str(payload.get("clientId") or "").strip()
                refresh_token = str(payload.get("refreshToken") or "").strip()
                if not client_id or not refresh_token:
                    raise RuntimeError("Missing clientId or refreshToken")
                token_payload = get_access_token_payload(client_id, refresh_token)
                json_response(self, 200, {"ok": True, **token_payload})
                return

            if self.path == "/messages":
                email_addr = str(payload.get("email") or "").strip()
                client_id = str(payload.get("clientId") or "").strip()
                refresh_token = str(payload.get("refreshToken") or "").strip()
                top = int(payload.get("top") or 15)
                mailboxes = payload.get("mailboxes")
                mailbox = payload.get("mailbox")
                if not email_addr or not client_id or not refresh_token:
                    raise RuntimeError("Missing email/clientId/refreshToken")
                if not isinstance(mailboxes, list) or not mailboxes:
                    mailboxes = [mailbox or "INBOX"]

                log_info(
                    f"messages request email={mask_email(email_addr)} "
                    f"clientId={mask_secret(client_id)} top={top} mailboxes={mailboxes}"
                )
                token_payload = get_access_token_payload(client_id, refresh_token)
                fetch_result = fetch_messages_for_mailboxes(
                    email_addr,
                    token_payload["accessToken"],
                    top=max(1, min(top, 30)),
                    mailboxes=mailboxes,
                )
                log_message_list(f"messages {mask_email(email_addr)}", fetch_result["messages"])
                json_response(self, 200, {
                    "ok": True,
                    "messages": fetch_result["messages"],
                    "mailboxResults": fetch_result["mailboxResults"],
                    "nextRefreshToken": token_payload.get("nextRefreshToken") or "",
                })
                return

            if self.path == "/code":
                email_addr = str(payload.get("email") or "").strip()
                client_id = str(payload.get("clientId") or "").strip()
                refresh_token = str(payload.get("refreshToken") or "").strip()
                top = int(payload.get("top") or 15)
                mailboxes = payload.get("mailboxes")
                mailbox = payload.get("mailbox")
                sender_filters = payload.get("senderFilters") or []
                subject_filters = payload.get("subjectFilters") or []
                exclude_codes = payload.get("excludeCodes") or []
                filter_after_timestamp = int(payload.get("filterAfterTimestamp") or 0)
                if not email_addr or not client_id or not refresh_token:
                    raise RuntimeError("Missing email/clientId/refreshToken")
                if not isinstance(mailboxes, list) or not mailboxes:
                    mailboxes = [mailbox or "INBOX"]

                log_info(
                    "code request "
                    f"email={mask_email(email_addr)} top={top} "
                    f"threshold={format_timestamp_ms(filter_after_timestamp)} "
                    f"mailboxes={mailboxes} exclude={len(exclude_codes)}"
                )

                cached_signatures = set()
                for mailbox_name in mailboxes:
                    cached_signatures.update(get_cached_message_signatures(email_addr, mailbox_name))

                token_payload = get_access_token_payload(client_id, refresh_token)
                fetch_result = fetch_messages_for_mailboxes(
                    email_addr,
                    token_payload["accessToken"],
                    top=max(1, min(top, 30)),
                    mailboxes=mailboxes,
                )
                messages = fetch_result["messages"]
                log_message_list(f"code {mask_email(email_addr)}", messages)

                cached_match = find_new_code_from_cache_delta(
                    messages,
                    cached_signatures=cached_signatures,
                    exclude_codes=exclude_codes,
                    start_timestamp=filter_after_timestamp,
                )
                if cached_match is not None:
                    selected = {
                        "code": cached_match["code"],
                        "message": cached_match["message"],
                    }
                    log_info(
                        f"cache_select email={mask_email(email_addr)} code={selected['code']} "
                        f"time={format_timestamp_ms(selected['message'].get('receivedTimestamp'))} "
                        f"subject={abbreviate_text(selected['message'].get('subject') or '', 72)}"
                    )
                    json_response(self, 200, {
                        "ok": True,
                        "code": selected["code"],
                        "message": selected["message"],
                        "messages": messages,
                        "mailboxResults": fetch_result["mailboxResults"],
                        "usedTimeFallback": False,
                        "selectionSource": "cache_new_message",
                        "nextRefreshToken": token_payload.get("nextRefreshToken") or "",
                    })
                    return

                analyzed = analyze_code_selection(
                    messages,
                    sender_filters=sender_filters,
                    subject_filters=subject_filters,
                    exclude_codes=exclude_codes,
                    filter_after_timestamp=filter_after_timestamp,
                )
                if not analyzed.get("code"):
                    log_warn(
                        f"code_not_found email={mask_email(email_addr)} "
                        f"reasons={summarize_diagnostics(analyzed.get('diagnostics'))}"
                    )
                    json_response(self, 200, {
                        "ok": True,
                        "code": None,
                        "message": None,
                        "messages": messages,
                        "mailboxResults": fetch_result["mailboxResults"],
                        "usedTimeFallback": False,
                        "selectionSource": "",
                        "nextRefreshToken": token_payload.get("nextRefreshToken") or "",
                    })
                    return

                selected = {
                    "code": analyzed["code"],
                    "message": analyzed["message"],
                }
                log_info(
                    f"code_select email={mask_email(email_addr)} code={selected['code']} "
                    f"time={format_timestamp_ms(selected['message'].get('receivedTimestamp'))} "
                    f"subject={abbreviate_text(selected['message'].get('subject') or '', 72)}"
                )
                json_response(self, 200, {
                    "ok": True,
                    "code": selected["code"],
                    "message": selected["message"],
                    "messages": messages,
                    "mailboxResults": fetch_result["mailboxResults"],
                    "usedTimeFallback": bool(analyzed.get("used_time_fallback")),
                    "selectionSource": "time_fallback" if analyzed.get("used_time_fallback") else "filter_match",
                    "nextRefreshToken": token_payload.get("nextRefreshToken") or "",
                })
                return

            if self.path == "/clear":
                email_addr = str(payload.get("email") or "").strip()
                client_id = str(payload.get("clientId") or "").strip()
                refresh_token = str(payload.get("refreshToken") or "").strip()
                if not email_addr or not client_id or not refresh_token:
                    raise RuntimeError("Missing email/clientId/refreshToken")

                log_info(
                    f"clear request email={mask_email(email_addr)} "
                    f"clientId={mask_secret(client_id)}"
                )
                token_payload = get_access_token_payload(client_id, refresh_token)
                deleted_count = delete_all_messages(email_addr, token_payload["accessToken"])
                json_response(self, 200, {
                    "ok": True,
                    "deletedCount": deleted_count,
                    "nextRefreshToken": token_payload.get("nextRefreshToken") or "",
                })
                return

            json_response(self, 404, {"error": "Not found"})
        except requests.HTTPError as exc:
            response_text = exc.response.text if exc.response is not None else str(exc)
            log_error(f"http_error path={self.path} detail={response_text}")
            json_response(self, 500, {"error": response_text})
        except Exception as exc:
            log_error(f"exception path={self.path} detail={exc}")
            traceback.print_exc()
            json_response(self, 500, {"error": str(exc)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), HotmailHelperHandler)
    log_info(f"Hotmail helper listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
