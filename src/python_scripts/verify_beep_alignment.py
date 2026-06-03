#!/usr/bin/env python3
import argparse
import csv
import math
import os
from typing import List, Tuple

import librosa
import numpy as np


def read_keystroke_timestamps(csv_path: str) -> List[int]:
    timestamps = []
    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        rows = list(reader)

    header_index = None
    for idx, row in enumerate(rows):
        if row and row[0].strip() == "action" and len(row) >= 3:
            header_index = idx
            break

    if header_index is None:
        return timestamps

    for row in rows[header_index + 1 :]:
        if not row or len(row) < 3:
            continue
        try:
            timestamps.append(int(row[2]))
        except ValueError:
            continue

    return timestamps


def detect_beep_time(audio_path: str, target_freq_hz: float = 3000.0) -> float:
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    if y.size == 0:
        raise ValueError("Audio file is empty")

    n_fft = 2048
    hop_length = 512
    stft = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
    magnitude = np.abs(stft)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    freq_idx = int(np.argmin(np.abs(freqs - target_freq_hz)))

    band_energy = magnitude[freq_idx]
    if band_energy.size == 0:
        raise ValueError("Failed to compute band energy")

    mean = float(np.mean(band_energy))
    std = float(np.std(band_energy))
    threshold = mean + 5.0 * std

    onset_frame = None
    for idx, value in enumerate(band_energy):
        if value >= threshold:
            onset_frame = idx
            break

    if onset_frame is None:
        # Fall back to max energy frame
        onset_frame = int(np.argmax(band_energy))

    return librosa.frames_to_time(onset_frame, sr=sr, hop_length=hop_length)


def summarize_alignment(audio_path: str, csv_path: str) -> Tuple[float, float, float]:
    beep_time = detect_beep_time(audio_path)
    timestamps = read_keystroke_timestamps(csv_path)
    if not timestamps:
        raise ValueError("No keystroke timestamps found in CSV")

    first_key_ms = min(timestamps)
    first_key_sec = first_key_ms / 1000.0
    offset_sec = beep_time - 0.0

    return beep_time, first_key_sec, offset_sec


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify that keystroke timestamps are aligned to the laptop beep."
    )
    parser.add_argument("--audio", required=True, help="Path to synced laptop WAV")
    parser.add_argument("--csv", required=True, help="Path to metadata CSV")
    args = parser.parse_args()

    audio_path = os.path.expanduser(args.audio)
    csv_path = os.path.expanduser(args.csv)

    beep_time, first_key_sec, offset_sec = summarize_alignment(audio_path, csv_path)

    print("Beep time in audio (sec):", f"{beep_time:.4f}")
    print("First keystroke (sec from CSV):", f"{first_key_sec:.4f}")
    print("CSV zero reference (sec): 0.0000")
    print("Audio beep offset from CSV zero (sec):", f"{offset_sec:.4f}")
    if math.isfinite(first_key_sec):
        print("Expected: first keystroke should be shortly after beep.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
