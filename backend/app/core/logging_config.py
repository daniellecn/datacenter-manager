"""
Structured JSON logging for production.

In production (ENVIRONMENT != "development"), all log records are emitted as
single-line JSON objects to stdout so that log aggregators (ELK, Grafana Loki,
Splunk, etc.) can parse them without fragile regex.

In development, a human-readable format is used instead.

Call configure_logging() once at process start (in main.py) BEFORE the FastAPI
app is constructed so that all subsequent loggers inherit the configuration.
"""
from __future__ import annotations

import json
import logging
import sys
import traceback
from datetime import datetime, timezone


# Fields emitted by LogRecord that we reconstruct ourselves — skip them to
# avoid duplication in the JSON output.
_SKIP_FIELDS = frozenset(
    {
        "args",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
    }
)


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        # Build the base record
        output: dict = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Source location (useful for debugging; omit if not needed)
        output["location"] = f"{record.pathname}:{record.lineno}"

        # Exception info
        if record.exc_info:
            output["exception"] = "".join(traceback.format_exception(*record.exc_info))
        elif record.exc_text:
            output["exception"] = record.exc_text

        if record.stack_info:
            output["stack_info"] = self.formatStack(record.stack_info)

        # Extra fields added via logger.info("msg", extra={...})
        for key, value in record.__dict__.items():
            if key not in _SKIP_FIELDS and not key.startswith("_"):
                try:
                    json.dumps(value)  # probe — only include JSON-serialisable values
                    output[key] = value
                except (TypeError, ValueError):
                    output[key] = str(value)

        return json.dumps(output, default=str, ensure_ascii=False)


class DevFormatter(logging.Formatter):
    """Human-readable formatter for local development."""

    _FMT = "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s"

    def __init__(self) -> None:
        super().__init__(fmt=self._FMT, datefmt="%H:%M:%S")


def configure_logging(log_level: str = "INFO", *, json_logs: bool = True) -> None:
    """
    Configure the root logger.

    Parameters
    ----------
    log_level:
        Minimum severity to emit (DEBUG / INFO / WARNING / ERROR / CRITICAL).
    json_logs:
        If True (production), emit JSON. If False (development), emit
        human-readable text.
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter() if json_logs else DevFormatter())

    root = logging.getLogger()
    root.setLevel(level)
    # Replace any handlers installed by previous basicConfig calls
    root.handlers.clear()
    root.addHandler(handler)

    # ── Quieten noisy third-party loggers ─────────────────────────────────────
    # uvicorn.access logs every HTTP request at INFO; the proxy/load-balancer
    # already captures these — suppress duplicates unless debugging.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    # SQLAlchemy engine echoes SQL only in dev (controlled by database.py echo=)
    # but also emits INFO noise when a pool connection is checked out.
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    # APScheduler logs every job tick at DEBUG; keep WARNING in prod.
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
