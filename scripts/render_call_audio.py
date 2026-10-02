"""Renders scripted calls to audio so they can be listened to and replayed.

Both sides are synthesised with espeak-ng (bundled by the espeakng-loader
wheel; pip install espeakng-loader). This is SYNTHETIC TEST AUDIO: robotic
voices, no real speaker, no accent. It exists so the Q4 pipeline has a real
audio file to stream at real-time speed and so reviewers can hear the flow.
Live calls through the browser use the browser's own voices instead.

For each transcript in evidence/q1|q3/transcripts/*.json this writes
  evidence/audio/<call>.wav            mono 16 kHz, bot and customer voices
  evidence/audio/<call>.timeline.json  start/end ms, speaker, text per turn
The timeline is what a diarised streaming ASR would emit for this audio;
the Q4 simulated-ASR adapter releases each segment only when the replay
clock passes its end time.

Q4 human-agent calls (data/q4/calls/*.json) use the same renderer and add
three fields: "spoken" (what the audio says when it differs from the
recogniser output in "text"), "barge_in_ms" (this turn starts that many ms
before the previous one ends, mixed on top: an interruption) and a per-call
"noise_snr_db" (background noise mixed in at that signal-to-noise ratio).

Usage:
  python3 scripts/render_call_audio.py [call-id-prefix]     scripted Q1/Q3 calls
  python3 scripts/render_call_audio.py data/q4/calls/*.json  explicit files
"""
import ctypes
import json
import sys
import wave
from pathlib import Path

import espeakng_loader
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "evidence" / "audio"
SAMPLE_RATE = 16000
TURN_GAP_MS = 450

# espeak-ng has no Tagalog voice. Tagalog spelling is close to phonetic and
# shares most phonemes with Indonesian, so the Indonesian voice reads it far
# better than the English one. A documented compromise for test audio only.
VOICES = {
    "in_health": {"bot": "en+f3", "customer": "en-gb-x-rp+m3"},
    "ph_life": {"bot": "id+f3", "customer": "id+m3"},
    "id_finance": {"bot": "id+f3", "customer": "id+m3"},
}
ENGLISH_REGISTER_VOICE = {"bot": "en+f3", "customer": "en+m3"}

ACCOUNTS = json.loads((ROOT / "config" / "mock-accounts.json").read_text())
# Transcripts on disk are redacted; the rendered audio speaks the fictional
# account names back in, so the recording sounds like a call.
SPOKEN_PLACEHOLDERS = {
    "ph_life": {"[CUSTOMER_NAME] [CUSTOMER_NAME]": "Ana Reyes", "[CUSTOMER_NAME]": "Reyes"},
    "id_finance": {"[CUSTOMER_NAME]": ACCOUNTS["id_finance"]["full_name"]},
    "in_health": {"[PERSON_NAME]": "Rohan"},
}

_lib = ctypes.cdll.LoadLibrary(espeakng_loader.get_library_path())
_SYNTH_CALLBACK = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
_buffer: list[bytes] = []


@_SYNTH_CALLBACK
def _collect(samples, count, _events):
    if count > 0:
        _buffer.append(ctypes.string_at(samples, count * 2))
    return 0


ESPEAK_RATE = _lib.espeak_Initialize(0x02, 0, espeakng_loader.get_data_path().encode(), 0)
_lib.espeak_SetSynthCallback(_collect)
ESPEAK_CHARS_UTF8 = 1


def synthesise(text: str, voice: str) -> np.ndarray:
    _buffer.clear()
    if _lib.espeak_SetVoiceByName(voice.encode()) != 0:
        raise RuntimeError(f"espeak-ng has no voice {voice!r}")
    encoded = text.encode("utf-8")
    _lib.espeak_Synth(encoded, len(encoded) + 1, 0, 0, 0, ESPEAK_CHARS_UTF8, None, None)
    _lib.espeak_Synchronize()
    pcm = np.frombuffer(b"".join(_buffer), dtype=np.int16).astype(np.float32)
    # espeak renders at 22.05 kHz; linear resampling to 16 kHz is plenty for speech.
    target = int(len(pcm) * SAMPLE_RATE / ESPEAK_RATE)
    return np.interp(np.linspace(0, len(pcm) - 1, target), np.arange(len(pcm)), pcm)


def spoken(text: str, market: str) -> str:
    for placeholder, replacement in SPOKEN_PLACEHOLDERS.get(market, {}).items():
        text = text.replace(placeholder, replacement)
    return text


def render(transcript_path: Path) -> None:
    call = json.loads(transcript_path.read_text())
    market = call["market"]
    name = transcript_path.stem
    clips: list[tuple[int, np.ndarray]] = []
    timeline = []
    cursor = 0
    previous_end = 0
    for position, turn in enumerate(call["turns"]):
        speaker = "bot" if turn["speaker"] in ("bot", "agent") else "customer"
        voices = ENGLISH_REGISTER_VOICE if turn.get("register") == "en" and market == "ph_life" else VOICES[market]
        if turn.get("event") == "silence":
            audio = np.zeros(int(SAMPLE_RATE * 4))
            text = ""
        elif turn.get("event") == "asr_error" or not (turn.get("spoken") or turn["text"]):
            audio = np.random.default_rng(position).normal(0, 900, int(SAMPLE_RATE * 1.5))
            text = ""
        else:
            text = spoken(turn["text"], market)
            audio = synthesise(spoken(turn.get("spoken") or turn["text"], market), voices[speaker])
        overlap = int(turn.get("barge_in_ms", 0))
        start = max(0, previous_end - overlap) if overlap else cursor
        end = start + int(len(audio) * 1000 / SAMPLE_RATE)
        clips.append((start, audio))
        timeline.append({
            "index": turn.get("index", position),
            "speaker": "agent" if speaker == "bot" else "customer",
            "start_ms": start,
            "end_ms": end,
            "text": text,
            "event": turn.get("event"),
            "asr_confidence": turn.get("asr_confidence"),
            "interrupted_previous": bool(overlap),
        })
        previous_end = max(previous_end, end) if overlap else end
        cursor = previous_end + TURN_GAP_MS

    total = int(cursor * SAMPLE_RATE / 1000)
    signal = np.zeros(total)
    for start_ms, audio in clips:
        offset = int(start_ms * SAMPLE_RATE / 1000)
        signal[offset:offset + len(audio)] += audio[: total - offset]
    if call.get("noise_snr_db") is not None:
        speech_power = np.mean(signal[signal != 0] ** 2) if np.any(signal) else 1.0
        noise_power = speech_power / (10 ** (call["noise_snr_db"] / 10))
        signal = signal + np.random.default_rng(7).normal(0, np.sqrt(noise_power), len(signal))
    peak = np.max(np.abs(signal)) or 1
    pcm = (signal / peak * 0.8 * 32767).astype(np.int16)
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())
    meta = {
        "call": name,
        "market": market,
        "synthetic_audio": True,
        "voices": VOICES[market],
        "noise_snr_db": call.get("noise_snr_db"),
        "sample_rate": SAMPLE_RATE,
        "duration_ms": int(len(pcm) * 1000 / SAMPLE_RATE),
        "turns": timeline,
    }
    (OUT / f"{name}.timeline.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"{name}: {meta['duration_ms'] / 1000:.1f}s, {len(timeline)} turns")


if __name__ == "__main__":
    arguments = sys.argv[1:]
    if arguments and all(argument.endswith(".json") for argument in arguments):
        for argument in arguments:
            render(Path(argument))
    else:
        prefix = arguments[0] if arguments else ""
        for folder in ("q1", "q3"):
            for path in sorted((ROOT / "evidence" / folder / "transcripts").glob(f"{prefix}*.json")):
                render(path)
