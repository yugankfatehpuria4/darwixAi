# Q3 speech recognition and synthesis: configuration and what has actually been tested

Short version: the speech configuration below is implemented and wired into the web calling page. However, it has **not been tested with real Filipino or Indonesian speakers**, so this file reports no ASR accuracy number. What has been tested is everything after the transcript: register detection, code-switch understanding, retrieval and business rules. Those results are in `language_eval.md`, `../q2/retrieval_results.md` and `transcripts/`.

## Configuration

| | Philippines | Indonesia |
|---|---|---|
| ASR provider | Browser Web Speech API. In Chrome this sends audio to Google's cloud recogniser; Edge uses Microsoft's. | same |
| ASR locale | `fil-PH` for the whole call, including turns where the caller speaks English | `id-ID` |
| Why one locale | The Web Speech API takes one language per recogniser. Taglish is one conversation, not two languages taking turns, so we keep the Filipino model and rely on it to carry English loanwords. Switching the recogniser on our own register guess would risk sending a Tagalog speaker to an English model. | Indonesian with English finance loanwords (DP, tenor, transfer, m-banking) is normal Indonesian speech |
| TTS | Browser `speechSynthesis`, `fil-PH` voice in Taglish register, `en-PH` in English register | `id-ID` voice |
| TTS fallback | If the OS has no Filipino voice, the page says so in the Speech panel and uses the default voice | same for `id-ID` |
| Test audio (this repo) | espeak-ng **Indonesian** voice reading Tagalog (there is no espeak Tagalog voice); English voice for English turns | espeak-ng Indonesian voice |

## What we observed

- Without a microphone, every Q3 call in this repo was run with text injected at the ASR output (`npm run scenarios`), and in headless Chromium with typed turns (`npm run ui:smoke`, screenshot `web_call_id_ui.png`).
- Headless Chromium has no installed voices, so the page fell back to the default voice and reported "no id-ID voice installed". This confirms the fallback path, not voice quality.
- The rendered audio in `../audio/q3-*.ogg` is robotic synthetic speech. It is there so the call flow can be heard and so Q4 has audio to stream. It is not evidence of TTS quality and must not be presented as such.

## Not tested, and why

| Requirement from the brief | Status | What it needs |
|---|---|---|
| ASR quality per market (approximate WER) | UNTESTED | Real recordings from native speakers. Synthetic TTS audio fed into an ASR would measure the TTS, not real speech. |
| Code-switching behaviour of the recogniser | UNTESTED at audio level. At text level, Taglish and Indonesian+English utterances are understood correctly (26/26 in `language_eval.md` after two fixes; 24/26 on first run). | A Taglish speaker reading the test utterances |
| Indonesian regional accent (outside Jakarta) | UNTESTED at audio level. At text level, Javanese krama and Sundanese lemes vocabulary is handled (`q3-id-03`, `q3-id-04`). | A Javanese- or Sundanese-accented speaker. Accent affects the recogniser; our lexicon only helps once words are transcribed. |
| Native TTS quality | UNTESTED | A listener panel per market |

## Test protocol for the live run

This takes about 30 minutes per market with one native speaker:

1. Run `npm start`, open `http://localhost:3000/call.html` in Chrome on desktop, and pick the market.
2. The speaker reads the customer turns of `data/scenarios/calls.json` for that market (5 PH, 4 ID scenarios), plus the utterances in `data/eval/q3-language-eval.json`.
3. Each call is stored with the recogniser's transcript and confidence in `runtime/calls/`. Compare the transcript against the script text to get a word error rate per utterance. Mark the code-switched words separately (premium, due, grace period, DP, tenor, m-banking).
4. For Indonesia, repeat steps 2 and 3 with a speaker from outside Jakarta (Javanese or Sundanese first language). Report the WER difference.
5. Record the call with a screen recorder (system audio on). The page uploads only the caller's microphone side to `runtime/recordings/`.

## Expected weak spots, to check first in the live run

- `fil-PH` recognition of English insurance terms said with Filipino pronunciation ("pri-myum", "grays piryod").
- Indonesian numbers said as words ("dua belas tiga sembilan belas sembilan puluh"). Our date-of-birth parser reads digits and Indonesian month names, but not Indonesian number words, so a recogniser that writes words would fail verification. This is a known parser gap: `parseBirthDate`.
- Javanese words the glossary does not know. The glossary only covers about 20 common krama and ngoko words.
