import sys
import os
import numpy as np
import ffmpeg
import librosa
from scipy.io import wavfile
from scipy import signal


def convert_to_wav(input_path, output_path):
	print(f"[sync_audio] ffmpeg input: {input_path}")
	print(f"[sync_audio] ffmpeg output: {output_path}")
	(
		ffmpeg.input(input_path)
		.output(output_path, ac=1, ar=48000, format="wav")
		.overwrite_output()
		.run(quiet=False)
	)


def load_wav(path):
	rate, data = wavfile.read(path)
	if data.ndim > 1:
		data = data.mean(axis=1)
	return rate, data.astype(np.float32)


def bandpass_filter(data, rate, low=2500, high=3500):
	nyquist = rate / 2
	b, a = signal.butter(4, [low / nyquist, high / nyquist], btype="band")
	return signal.filtfilt(b, a, data)


def find_offset(laptop_data, mobile_data, sample_rate=48000):
	# We only need the first 30 seconds of audio to find the sync beep.
	# This prevents massive OOM (Out of Memory) crashes on long recordings.
	max_samples = sample_rate * 30
	lap_crop = laptop_data[:max_samples]
	mob_crop = mobile_data[:max_samples]

	# Explicitly use method="fft" for maximum speed on the cropped arrays
	correlation = signal.correlate(lap_crop, mob_crop, mode="full", method="fft")
	
	# The mathematical lag is identical whether we correlate the cropped or full arrays
	lag = int(np.argmax(correlation) - (len(mob_crop) - 1))
	return lag


def align_streams(laptop_data, mobile_data, lag):
	if lag > 0:
		laptop_data = laptop_data[lag:]
	elif lag < 0:
		mobile_data = mobile_data[-lag:]

	min_len = min(len(laptop_data), len(mobile_data))
	return laptop_data[:min_len], mobile_data[:min_len]


def to_int16(data):
	if data.size == 0:
		return data.astype(np.int16)
	normalized = librosa.util.normalize(data)
	scaled = np.clip(normalized, -1.0, 1.0)
	return (scaled * 32767).astype(np.int16)


def main():
	if len(sys.argv) < 5:
		raise RuntimeError(
			"Usage: sync_audio.py <session_dir> <session_id> <laptop_input> <mobile_input>"
		)

	session_dir = sys.argv[1]
	session_id = sys.argv[2]
	laptop_input = sys.argv[3]
	mobile_input = sys.argv[4]

	laptop_wav = os.path.join(session_dir, "laptop_raw.wav")
	mobile_wav = os.path.join(session_dir, "mobile_raw.wav")

	convert_to_wav(laptop_input, laptop_wav)
	convert_to_wav(mobile_input, mobile_wav)

	print("[sync_audio] Loading wav files")
	rate_lap, lap_data = load_wav(laptop_wav)
	rate_mob, mob_data = load_wav(mobile_wav)

	if rate_lap != 48000 or rate_mob != 48000:
		raise RuntimeError("Unexpected sample rate after conversion")

	print("[sync_audio] Applying bandpass filter")
	lap_filtered = bandpass_filter(lap_data, rate_lap)
	mob_filtered = bandpass_filter(mob_data, rate_mob)

	lag = find_offset(lap_filtered, mob_filtered)
	print(f"[sync_audio] Detected lag: {lag} samples")
	aligned_lap, aligned_mob = align_streams(lap_data, mob_data, lag)
	print(
		f"[sync_audio] Aligned lengths: {len(aligned_lap)} / {len(aligned_mob)}"
	)

	synced_lap_path = os.path.join(session_dir, f"{session_id}_laptop_synced.wav")
	synced_mob_path = os.path.join(session_dir, f"{session_id}_mobile_synced.wav")

	print("[sync_audio] Writing synced wav files")
	wavfile.write(synced_lap_path, rate_lap, to_int16(aligned_lap))
	wavfile.write(synced_mob_path, rate_mob, to_int16(aligned_mob))
	print("[sync_audio] Done")


if __name__ == "__main__":
	main()
