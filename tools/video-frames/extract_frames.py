#!/usr/bin/env python3
"""Extract still frames from a video at fixed time intervals."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2

EXIT_SUCCESS = 0
EXIT_INVALID_INPUT = 2
EXIT_VIDEO_DECODE_FAILED = 3


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract video frames into images at fixed intervals."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to source video file.",
    )
    parser.add_argument(
        "--output",
        default="tmp/video-frames",
        help="Output root directory (default: tmp/video-frames).",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Frame extraction interval in seconds (default: 2).",
    )
    parser.add_argument(
        "--format",
        dest="image_format",
        choices=("png", "jpg", "jpeg"),
        default="png",
        help="Image format (default: png).",
    )
    parser.add_argument(
        "--start",
        type=float,
        default=0.0,
        help="Start time in seconds (default: 0).",
    )
    parser.add_argument(
        "--end",
        type=float,
        default=None,
        help="Optional end time in seconds.",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=None,
        help="Optional hard limit for number of extracted frames.",
    )
    parser.add_argument(
        "--every-frame",
        action="store_true",
        help="Extract every decodable frame (ignores --interval).",
    )
    return parser.parse_args(argv)


def sanitize_stem(stem: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip(".-")
    return sanitized or "video"


def make_run_dir(output_root: Path, input_stem: str) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    base = output_root / sanitize_stem(input_stem)
    base.mkdir(parents=True, exist_ok=True)

    candidate = base / timestamp
    counter = 1
    while candidate.exists():
        candidate = base / f"{timestamp}-{counter:02d}"
        counter += 1

    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def format_time_for_name(seconds: float) -> str:
    whole = int(max(seconds, 0))
    integer_digits = max(4, len(str(whole)))
    return f"{seconds:0{integer_digits + 4}.3f}"


def validate_args(args: argparse.Namespace) -> None:
    input_path = Path(args.input).expanduser()
    if not input_path.exists():
        raise ValueError(f"Input file not found: {input_path}")
    if not input_path.is_file():
        raise ValueError(f"Input path is not a file: {input_path}")
    if not args.every_frame and args.interval <= 0:
        raise ValueError("--interval must be > 0.")
    if args.start < 0:
        raise ValueError("--start must be >= 0.")
    if args.end is not None and args.end < args.start:
        raise ValueError("--end must be >= --start.")
    if args.max_frames is not None and args.max_frames <= 0:
        raise ValueError("--max-frames must be > 0.")


def release_capture(capture: cv2.VideoCapture) -> None:
    if capture is not None:
        capture.release()


def run(args: argparse.Namespace) -> int:
    input_path = Path(args.input).expanduser().resolve()
    output_root = Path(args.output).expanduser()

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        release_capture(capture)
        print(
            "Video decode failed: unable to open source video file.",
            file=sys.stderr,
        )
        return EXIT_VIDEO_DECODE_FAILED

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frame_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    frame_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration_seconds = None
    if fps > 0 and frame_count > 0 and math.isfinite(fps):
        duration_seconds = frame_count / fps

    effective_end = args.end
    if effective_end is None and duration_seconds is not None:
        effective_end = max(duration_seconds - 0.000001, args.start)

    run_dir = make_run_dir(output_root, input_path.stem)
    extracted: list[dict[str, Any]] = []
    next_time = float(args.start)
    image_format = args.image_format
    eps = 1e-9
    sequential_frame_idx = 0
    if args.every_frame and args.start > 0:
        capture.set(cv2.CAP_PROP_POS_MSEC, args.start * 1000.0)

    while True:
        if args.max_frames is not None and len(extracted) >= args.max_frames:
            break

        if args.every_frame:
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            sequential_frame_idx += 1
            ts_from_decoder = float(capture.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000.0
            if ts_from_decoder > 0:
                current_time = max(ts_from_decoder, args.start)
            elif fps > 0:
                current_time = args.start + (sequential_frame_idx / fps)
            else:
                current_time = args.start
            if effective_end is not None and current_time > effective_end + eps:
                break
        else:
            if effective_end is not None and next_time > effective_end + eps:
                break
            capture.set(cv2.CAP_PROP_POS_MSEC, next_time * 1000.0)
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            current_time = next_time

        file_name = (
            f"frame_{len(extracted) + 1:04d}_t"
            f"{format_time_for_name(current_time)}.{image_format}"
        )
        output_file = run_dir / file_name

        if image_format in ("jpg", "jpeg"):
            write_ok = cv2.imwrite(
                str(output_file),
                frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), 95],
            )
        else:
            write_ok = cv2.imwrite(str(output_file), frame)

        if not write_ok:
            release_capture(capture)
            print(
                f"Video decode failed: unable to write frame to {output_file}.",
                file=sys.stderr,
            )
            return EXIT_VIDEO_DECODE_FAILED

        extracted.append(
            {
                "index": len(extracted) + 1,
                "timestamp_seconds": round(current_time, 3),
                "file_name": file_name,
                "relative_path": file_name,
            }
        )

        if not args.every_frame:
            next_time += args.interval

    release_capture(capture)

    if not extracted:
        try:
            run_dir.rmdir()
        except OSError:
            pass
        print(
            "Video decode failed: no frames were extracted.",
            file=sys.stderr,
        )
        return EXIT_VIDEO_DECODE_FAILED

    manifest = {
        "source_video": str(input_path),
        "run_generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "parameters": {
            "interval": args.interval,
            "every_frame": args.every_frame,
            "start": args.start,
            "end": args.end,
            "max_frames": args.max_frames,
            "format": args.image_format,
            "output_root": str(output_root),
        },
        "video_metadata": {
            "fps": fps if fps > 0 else None,
            "frame_count": frame_count if frame_count > 0 else None,
            "duration_seconds": round(duration_seconds, 3)
            if duration_seconds is not None
            else None,
            "width": frame_width if frame_width > 0 else None,
            "height": frame_height if frame_height > 0 else None,
        },
        "output_directory": str(run_dir.resolve()),
        "frame_total": len(extracted),
        "frames": extracted,
    }

    manifest_path = run_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    print(f"Extracted {len(extracted)} frame(s).")
    print(f"Output directory: {run_dir.resolve()}")
    print(f"Manifest: {manifest_path.resolve()}")
    return EXIT_SUCCESS


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        validate_args(args)
        return run(args)
    except ValueError as error:
        print(f"Input error: {error}", file=sys.stderr)
        return EXIT_INVALID_INPUT
    except OSError as error:
        print(f"Input error: {error}", file=sys.stderr)
        return EXIT_INVALID_INPUT


if __name__ == "__main__":
    raise SystemExit(main())
