"""
Monitor check engine. Mirrors the logic that used to live in the Next.js app
(lib/monitor-runner.ts) but runs as a standalone Python process so checks
aren't coupled to the web app's request/response lifecycle or its deploy
target's cron support.
"""

from __future__ import annotations

import ipaddress
import json
import socket
import ssl
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx


@dataclass
class CheckResult:
    ok: bool
    latency_ms: Optional[int]
    status_code: Optional[int]
    error: Optional[str]


def _is_disallowed_ip(addr: str) -> bool:
    """Blocks SSRF: loopback, RFC1918, link-local (incl. cloud metadata), unique-local."""
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return True  # unparseable address -> treat as disallowed
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return bool(
        ip.is_loopback
        or ip.is_link_local  # covers 169.254.0.0/16, incl. 169.254.169.254 metadata endpoint
        or ip.is_private
        or ip.is_unspecified
    )


def assert_public_host(hostname: str) -> Optional[str]:
    """Resolves hostname and rejects if any resolved address is private/loopback/link-local."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return f'could not resolve host "{hostname}"'
    addresses = {info[4][0] for info in infos}
    for addr in addresses:
        if _is_disallowed_ip(addr):
            return f"target resolves to a disallowed address ({addr})"
    return None


def _parse_status_range(range_str: str) -> tuple[int, int]:
    try:
        lo_s, hi_s = range_str.split("-", 1)
        return int(lo_s), int(hi_s)
    except (ValueError, AttributeError):
        return 200, 299


def _build_headers(monitor: dict) -> dict[str, str]:
    headers: dict[str, str] = {}
    raw = monitor.get("requestHeaders")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                headers = {str(k): str(v) for k, v in parsed.items()}
        except (json.JSONDecodeError, TypeError):
            pass  # malformed custom headers are ignored rather than failing the check

    auth_type = monitor.get("authType")
    if auth_type == "BASIC" and monitor.get("authUsername"):
        import base64

        token = base64.b64encode(
            f"{monitor['authUsername']}:{monitor.get('authSecret') or ''}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {token}"
    elif auth_type == "BEARER" and monitor.get("authSecret"):
        headers["Authorization"] = f"Bearer {monitor['authSecret']}"
    elif auth_type == "HEADER" and monitor.get("authHeaderName") and monitor.get("authSecret"):
        headers[monitor["authHeaderName"]] = monitor["authSecret"]

    return headers


def check_http(monitor: dict) -> CheckResult:
    target = monitor.get("target", "")
    started = time.monotonic()
    try:
        parsed = urlparse(target)
    except ValueError:
        return CheckResult(False, 0, None, "invalid target URL")
    if not parsed.hostname:
        return CheckResult(False, 0, None, "invalid target URL")
    if parsed.scheme not in ("http", "https"):
        return CheckResult(False, 0, None, f'unsupported scheme "{parsed.scheme}"')

    block_reason = assert_public_host(parsed.hostname)
    if block_reason:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, block_reason)

    timeout_s = monitor.get("timeoutMs", 10000) / 1000
    method = monitor.get("method") or "GET"
    body = monitor.get("requestBody") if method == "POST" else None
    verify_tls = monitor.get("verifyTls", True)

    try:
        with httpx.Client(
            timeout=timeout_s,
            verify=verify_tls,
            follow_redirects=False,  # don't follow redirects to an unvalidated host (SSRF)
        ) as client:
            res = client.request(method, target, headers=_build_headers(monitor), content=body)
        latency_ms = int((time.monotonic() - started) * 1000)

        lo, hi = _parse_status_range(monitor.get("expectedStatusRange", "200-299"))
        ok = lo <= res.status_code <= hi
        error = None if ok else f"unexpected status {res.status_code}"

        keyword_match = monitor.get("keywordMatch")
        keyword_absent = monitor.get("keywordAbsent")
        if ok and (keyword_match or keyword_absent):
            text = res.text
            if keyword_match and keyword_match not in text:
                ok = False
                error = f'keyword "{keyword_match}" not found'
            elif keyword_absent and keyword_absent in text:
                ok = False
                error = f'forbidden keyword "{keyword_absent}" found'

        return CheckResult(ok, latency_ms, res.status_code, error)
    except httpx.TimeoutException:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, "request timed out")
    except httpx.HTTPError as err:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, str(err) or "request failed")


def check_tcp(monitor: dict) -> CheckResult:
    target = monitor.get("target", "")
    port = monitor.get("port") or 0
    started = time.monotonic()

    block_reason = assert_public_host(target)
    if block_reason:
        return CheckResult(False, 0, None, block_reason)

    timeout_s = monitor.get("timeoutMs", 10000) / 1000
    try:
        with socket.create_connection((target, port), timeout=timeout_s):
            return CheckResult(True, int((time.monotonic() - started) * 1000), None, None)
    except OSError as err:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, err.strerror or str(err) or "connection failed")


def check_ping(monitor: dict) -> CheckResult:
    target = monitor.get("target", "")
    started = time.monotonic()

    block_reason = assert_public_host(target)
    if block_reason:
        return CheckResult(False, 0, None, block_reason)

    timeout_ms = monitor.get("timeoutMs", 10000)
    timeout_s = max(1, round(timeout_ms / 1000))
    try:
        # "--" stops ping from parsing `target` as a flag (argument injection guard).
        subprocess.run(
            ["ping", "-c", "1", "-W", str(timeout_s), "--", target],
            check=True,
            capture_output=True,
            timeout=(timeout_ms / 1000) + 1,
        )
        return CheckResult(True, int((time.monotonic() - started) * 1000), None, None)
    except subprocess.CalledProcessError:
        return CheckResult(
            False,
            int((time.monotonic() - started) * 1000),
            None,
            "ping failed (host unreachable or ICMP may be blocked in this environment)",
        )
    except subprocess.TimeoutExpired:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, "ping timed out")
    except OSError as err:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, str(err))


def check_ssl(monitor: dict) -> CheckResult:
    target = monitor.get("target", "")
    started = time.monotonic()
    try:
        parsed = urlparse(target)
    except ValueError:
        return CheckResult(False, 0, None, "invalid target URL")
    if not parsed.hostname:
        return CheckResult(False, 0, None, "invalid target URL")

    host = parsed.hostname
    port = parsed.port or 443
    warn_days = monitor.get("sslWarnDays") or 14
    verify_tls = monitor.get("verifyTls", True)

    block_reason = assert_public_host(host)
    if block_reason:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, block_reason)

    timeout_s = monitor.get("timeoutMs", 10000) / 1000
    ctx = ssl.create_default_context()
    if not verify_tls:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    try:
        with socket.create_connection((host, port), timeout=timeout_s) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as tls_sock:
                cert = tls_sock.getpeercert()
    except ssl.SSLCertVerificationError as err:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, str(err))
    except (socket.timeout, TimeoutError):
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, "connection timed out")
    except OSError as err:
        return CheckResult(False, int((time.monotonic() - started) * 1000), None, str(err))

    latency_ms = int((time.monotonic() - started) * 1000)
    if not cert or "notAfter" not in cert:
        return CheckResult(False, latency_ms, None, "no certificate returned")

    expires_at = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    days_left = (expires_at - datetime.now(timezone.utc)).total_seconds() / 86400

    if days_left <= 0:
        return CheckResult(False, latency_ms, None, "certificate has expired")
    if days_left <= warn_days:
        return CheckResult(False, latency_ms, None, f"certificate expires in {int(days_left)} days")
    return CheckResult(True, latency_ms, None, None)


def run_check(monitor: dict) -> CheckResult:
    monitor_type = monitor.get("type")
    if monitor_type in ("HTTP", "KEYWORD"):
        return check_http(monitor)
    if monitor_type == "TCP":
        return check_tcp(monitor)
    if monitor_type == "PING":
        return check_ping(monitor)
    if monitor_type == "SSL":
        return check_ssl(monitor)
    return CheckResult(False, None, None, f"unknown monitor type {monitor_type}")
