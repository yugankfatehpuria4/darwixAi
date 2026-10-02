# GAPS

This file lists everything the build needed but did not have. Every placeholder or substitution in the repo traces back to a line here. To check that no hidden placeholder is left in code paths, run `grep -rn "GAP-" src config data`.

```text
GAP-001 | Q1,Q2,Q3 | Business source material (web pages, PDFs, forms, tables, FAQs, policies)
Needed for: the whole knowledge base
Searched:   the assessment PDF and the build directive; no business material was attached
Status:     NOT PROVIDED
Substitute: a synthetic corpus for three fictional companies (Suraksha Health, Kalinga Life with
            Bayanihan Bank, Danamaju Finance) in data/raw. Every file is marked SYNTHETIC and every
            KB record carries metadata.synthetic=true. No real company's terms are claimed.
Need:       Darwix's material; drop it into data/raw, list it in sources.json, run npm run ingest

GAP-002 | Q1 | "The provided script and business rules"
Status:     NOT PROVIDED
Substitute: synthetic script (lead-qualification-script.md) and rules (qualification-rules.md);
            config/health-rules.json reads its values from them and a test enforces that

GAP-003 | Q4 | Required compliance disclosures for each market
Status:     NOT PROVIDED
Substitute: recording notice, waiting-period-before-price, identity before account details,
            no guaranteed approval, no threats; all written into the synthetic scripts and policies

GAP-004 | Q1 | Family floater premium pricing
Status:     NOT IN MATERIAL (the synthetic premium chart is per member)
Behaviour:  no floater price is quoted; lead detail says "floater premium not in provided material;
            advisor sends written quote" (src/agent/markets/health.ts)

GAP-005 | Q3 | Native-speaker review of Taglish and Indonesian lines, FAQs and lexicons
Status:     NOT DONE (written by us)
Risk:       unnatural phrasing; wrong register; missing regional vocabulary
Need:       one reviewer per market, about 2 hours, against evidence/q3/localization_examples.md and the market packs

GAP-006 | Q1 | List of serviceable cities (Rule Q4: cities with a network hospital)
Status:     NOT IN MATERIAL
Behaviour:  every lead is marked city_verification=manual_verification_required

GAP-007 | Q3 | Kalinga Life and Danamaju advisor desk hours
Status:     NOT IN MATERIAL
Behaviour:  escalation outcome is "advisor_transfer_or_callback"; the bot does not claim a live transfer

GAP-008 | Q3,Q4 | Real speech: native Filipino and Indonesian speakers, including a non-Jakarta accent
Status:     NOT AVAILABLE in the build environment (no microphone, no speakers)
Impact:     ASR quality, code-switch recognition and accent performance are UNTESTED; the
            protocol for the live test is in evidence/q3/asr_tts_report.md

GAP-009 | Q1,Q4 | Provider credentials and network route (Gemini, Deepgram)
Status:     NO KEYS; the build sandbox's egress allowlist blocks both hosts
Impact:     LLM answer latency, real streaming ASR latency and the Deepgram adapter are UNTESTED.
            The failure path (provider unreachable) IS tested: evidence/q1/llm_unavailable_fallback.log,
            evidence/q4/llm_unavailable_fallback.log

GAP-010 | Q3 | Customer time zone for Indonesia
Status:     NOT IN MATERIAL
Behaviour:  the greeting assumes WIB (UTC+7); callers in WITA/WIT would hear a greeting 1-2 hours off
```
