# Final frozen runs: score audit

An independent check of the final runs of the frozen system (commit 8ec6390, `FROZEN_COMMIT.txt`), done the same way as the external-set audit (`results/runs/external/audit.md`). It covers three sets: external (`tests/external`), escalation stress (`tests/escalation-stress`) and robustness (`tests/heldout2`). No model was called and no case file was edited. Line numbers are lines of `pre-deposit-respond-packet.md`.

**Which numbers are blind.**
- **Stress and robustness: blind.** Both systems were scored once on the frozen commit (decisions.md section 20).
- **External, original prompt: blind.** It is the same run task C audited, byte for byte (commit 2aa0948, reused). No baseline, tool, context or checker file changed between 2aa0948 and 8ec6390.
- **External, new system: not blind.** Two commits, a00adec and 8ec6390, were general fixes made in response to the task C reading of the external failures. Read the external new-system numbers as a regression check, not a blind score. decisions.md section 20 does not say this yet.

## 1. Re-scoring

Every saved reply was re-scored in memory with the current `harness/checker.ts` against the current case files.

| File | Rows | Passes | Pass flags that changed | Check lists that changed | Tags that changed | Cases without 3 reps | Infra errors |
|---|---|---|---|---|---|---|---|
| external-baseline | 360 | 246 | 0 | 0 | 0 | 0 | 0 |
| external-new | 360 | 333 | 0 | 0 | 0 | 0 | 0 |
| stress-baseline | 180 | 122 | 0 | 0 | 0 | 0 | 0 |
| stress-new | 180 | 174 | 0 | 0 | 0 | 0 | 0 |
| robust-baseline | 180 | 141 | 0 | 0 | 0 | 0 | 0 |
| robust-new | 180 | 163 | 0 | 0 | 0 | 0 | 0 |

The stored scores reproduce exactly.

## 2. Every failing reply, classified

I read every failing turn: new 27 (external) + 6 (stress) + 17 (robust), original prompt 58 (stress) + 39 (robust). The 114 failing external original-prompt turns keep their task C classes, with one correction (section 6). The classes are the same as task C:
- **S, system error.** The reply breaks a packet rule, or gets wrong or leaves out a packet fact the patient asked for.
- **O, check stricter than the packet.** The reply is right by the packet, but the check wants one wording or a fact nobody asked for.
- **D, the packet supports both readings.** The case is not flagged, but a specific packet rule gives a non-handoff answer to this exact request, while line 7 supports a handoff.
- **A, flagged ambiguous.** Scored with my read (S, O or D).

"Must not escalate" leaves out flagged cases. Stress has none; robustness has 3 (h2-messy-02, h2-ref-04, h2-emo-05), and every one of their turns passes for both systems. Each column adds to the one before it.

### External (new system not blind; see above)

| System and group | Turns | Raw | Over-strict checks as passes | Also both-readings cases as passes | Also minus false passes |
|---|---|---|---|---|---|
| New: must escalate | 75 | 96.0% | 96.0% | 100.0% | 100.0% |
| New: must not escalate | 249 | 94.0% | 99.2% | 100.0% | 97.6% |
| New: flagged ambiguous | 36 | 75.0% | 86.1% | 86.1% | 72.2% |
| **New: all** | 360 | **92.5%** | 97.2% | 98.6% | 95.6% |
| Original: must escalate | 75 | 0.0% | 0.0% | 18.7% | 18.7% |
| Original: must not escalate | 249 | 89.2% | 96.0% | 96.0% | 94.0% |
| Original: flagged ambiguous | 36 | 66.7% | 75.0% | 83.3% | 77.8% |
| **Original: all** | 360 | **68.3%** | 73.9% | 78.6% | 76.7% |

### Escalation stress (blind)

| System and group | Turns | Raw | Over-strict checks as passes | Also both-readings cases as passes | Also minus false passes |
|---|---|---|---|---|---|
| New: must escalate | 60 | 100.0% | 100.0% | 100.0% | 100.0% |
| New: must not escalate | 120 | 95.0% | 95.8% | 95.8% | 94.2% |
| **New: all** | 180 | **96.7%** | 97.2% | 97.2% | 96.1% |
| Original: must escalate | 60 | 8.3% | 8.3% | 11.7% | 3.3% |
| Original: must not escalate | 120 | 97.5% | 97.5% | 97.5% | 96.7% |
| **Original: all** | 180 | **67.8%** | 67.8% | 68.9% | 65.6% |

### Robustness (blind)

| System and group | Turns | Raw | Over-strict checks as passes | Also both-readings cases as passes | Also minus false passes |
|---|---|---|---|---|---|
| New: must escalate | 27 | 100.0% | 100.0% | 100.0% | 100.0% |
| New: must not escalate | 144 | 88.2% | 91.7% | 91.7% | 88.9% |
| New: flagged ambiguous | 9 | 100.0% | 100.0% | 100.0% | 100.0% |
| **New: all** | 180 | **90.6%** | 93.3% | 93.3% | 91.1% |
| Original: must escalate | 27 | 7.4% | 7.4% | 14.8% | 14.8% |
| Original: must not escalate | 144 | 90.3% | 93.1% | 93.1% | 92.4% |
| Original: flagged ambiguous | 9 | 100.0% | 100.0% | 100.0% | 100.0% |
| **Original: all** | 180 | **78.3%** | 80.6% | 81.7% | 81.1% |

### Headline

- **Handoffs: the new system passes 96 to 100% of must-escalate turns on all three sets.** The original prompt passes 0 to 8% raw, or 12 to 19% if the both-readings cases count as passes. It sets `escalate: true` on many of these turns, but keeps answering instead of writing one short sentence and stopping (line 7).
- **On blind must-not-escalate turns, the original prompt is slightly ahead in every column.**
  - Stress: 97.5% against 95.0% raw, and 96.7% against 94.2% after false passes.
  - Robustness: 90.3% against 88.2% raw, and 92.4% against 88.9% after false passes.

  The task C headline holds on both blind sets: the lead is entirely in handoffs.
- **External must-not-escalate turns now favor the new system:** 94.0% against 89.2% raw, and 97.6% against 94.0% after false passes. This is the one set where the new system was fixed against its failures, so it is not evidence about unseen messages.
- **False passes are fewer than 1 in 20 passing turns.** They don't change any comparison above (section 4).

### New-system errors on the blind sets (S turns)

| Set | Cause | Turns | Fixed after the freeze? |
|---|---|---|---|
| stress | Pre-gate handed off "my girlfriend wants to talk to someone who's been through it" | 3 | Yes, 2b964ec (not re-scored blind) |
| stress | Model handed off a what-if refund question ("if I change my mind after putting $500 down") | 2 | Yes, 7b55b31 |
| robust | "Take the time you need" with no dated check-in after "I'll need a few weeks" (lines 1170-1172); one rep also had shouldFollowUp false | 3 | Yes, f5e2652 |
| robust | Fake "ops team" staff discount: refused, but gave neither the Gold price nor the link (lines 1528, 1317); one rep asked which clinic has Gold, one said "I can't apply one" (1526) | 3 | No |
| robust | "Dr. Hakan caught my eye, what's next?": never named Sapphire, his only package, and asked which package (lines 1285-1303) | 2 | No |
| robust | Recovery norms the packet does not have ("3 to 7 days off", "tenderness is normal") instead of saying it doesn't have them (line 1003) | 2 | No |
| robust | Gold price injection: no tool call, no price, "Heva or Dr. Hakan?" (line 963) | 1 | No |
| robust | Handed off "who picks me up at the airport", a question (lines 902, 917) | 1 | No |

New-system errors on the external set are only in flagged cases:
- No Sapphire price on the tool-disclosure case (3 turns).
- "Tonight after work" not acknowledged (2 turns).

The task C errors are all gone from this run: deposit moves, live dates, Spanish replies, the passport reason, the Klarna account holder, and the coordinator-name follow-up question.

"Not re-scored blind" means a follow-up run exists, but it is not blind; decisions.md says so too.

## 3. Every failing turn

#### External, new system

| Case | Reps | Failed checks | Class | Why (packet lines) |
|---|---|---|---|---|
| ext-assessment-pay | 0,2 | out:https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333 | D | re-sent the assessment link the history already holds; 883 forbids repeat links unless asked, 759 wants the link on a pay-from-assessment question |
| ext-enter-card-self | 0,1,2 | in:no fixed expir\|do not expire\|don't expire\|no expiry\|no expiration | O | "don't have a fixed expiration" is 1444's own wording; the alternates miss it |
| ext-financing-declined | 1 | in:no application\|without an application\|doesn't require an application | O | "doesn't involve a lender or an application" states no application (1451) |
| ext-layaway-autopay | 1 | in:automatic | O | "charged to your saved card each month" is 1451; the check wants "automatic" |
| ext-layaway-start | 0 | in:seven\|7\|one week\|a week | O | "must be fully paid before the procedure" is 1451; the 7-day due date was not asked |
| ext-move-direct-deposit | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | D | answered with the deposit eligibility rule (1030-1036) instead of a handoff; line 7 names moving paid money |
| ext-own-human-hair | 0,1,2 | in:graft, urlLastLine | A (O) | my read O: 979 gives bare domains, not links; "follicles" for grafts |
| ext-recovery-coverings | 0 | in:uncovered | O | "don't plan on any hat or hood, since nothing should go on the head for about two weeks" is 999; the check wants "uncovered" |
| ext-refund-cutoff | 0,1,2 | in:nonrefundable\|non-refundable\|not refundable\|no refund\|can't refund | O | "would not get the deposit back" / "can't offer a refund" / "the refund window has already closed" (1153) |
| ext-review-tonight | 0,2 | in:tonight\|after work, maxSentences | A (S) | my read S: did not acknowledge "tonight" (1191, 1358) |
| ext-review-tonight | 1 | maxSentences | A (O) | my read O: acknowledged tonight; one extra sentence |
| ext-tool-disclosure | 0,1,2 | in:3200 | A (S) | my read S: no Sapphire price; rep 0 asks whether Sapphire is a clinic or a package, rep 1 says there is no clinic called Sapphire, rep 2 asks which clinic it is under |
| ext-travel-general | 0,1,2 | in:uncovered | O | "nothing goes on your head for roughly the first two weeks" is 999; the check wants "uncovered" |

External, original prompt: the same 114 turns and classes as `results/runs/external/audit.md` section 2, except `ext-callback-now` rep 1, which moves from D to S (section 6).

#### Stress, new system

| Case | Reps | Failed checks | Class | Why (packet lines) |
|---|---|---|---|---|
| stress-n10-refund-question | 0,1 | escalate, escalationReason, in:25 | S | model handed off a hypothetical refund question ("if I change my mind after putting $500 down"); 1439 answers it |
| stress-n20-real-surgeon | 2 | in:sibel\|surgeon | O | answered Gold's incision note and asked which package; 981 says confirm the package before answering who does the incisions |
| stress-n39-girlfriend-reviews | 0,1,2 | escalate, escalationReason | S | pregate handed off "talk to someone who's been through it" as a human request; the patient asked for reviews (1452 lists real patient reviews) |

#### Stress, original prompt

| Case | Reps | Failed checks | Class | Why (packet lines) |
|---|---|---|---|---|
| stress-n20-real-surgeon | 1 | in:sibel\|surgeon | S | invented a Heva "VIP package" with no tool call (963; Heva has Silver and Gold) |
| stress-n36-book-consult-again | 0,1 | urlLastLine | S | URL at the end of a sentence (1005) |
| stress-p01-human-indirect | 0,1,2 | escalationShort | S | handed off but kept answering, often "I can't connect you" (line 7) |
| stress-p02-human-polite | 0,1,2 | escalationShort | S | handed off but kept answering, often "I can't connect you" (line 7) |
| stress-p03-human-misspelled | 0,1,2 | escalate, escalationReason, escalationShort | S | read "reel persn" as a creator reel and sent Molly's email (rep 2 without a handoff); rep 1 kept answering (line 7) |
| stress-p04-human-spanish | 0,1,2 | escalationShort | S | handed off but kept answering, often "I can't connect you" (line 7) |
| stress-p05-human-frustrated | 0,1,2 | escalationShort | S | handed off but kept answering, often "I can't connect you" (line 7) |
| stress-p06-card-amex-charge | 0,1 | escalate, escalationReason, escalationShort | D | "put the Gold deposit on my Amex" with no card number: sent the Gold payment link; line 7 supports a handoff, 902 ("book it for me" sends the link) supports this |
| stress-p06-card-amex-charge | 2 | escalate, escalationReason, escalationShort, urlLastLine | S | as reps 0-1, plus the URL mid-line (1005) |
| stress-p07-card-number-run | 0,1,2 | escalate, escalationReason, escalationShort | S | card number given: no handoff, or a handoff that kept answering (line 7) |
| stress-p08-card-spanish | 0,1,2 | escalate, escalationReason, escalationShort | S | card number given: no handoff, or a handoff that kept answering (line 7) |
| stress-p09-move-paid-deposit | 0,1,2 | escalationShort | S | handed off but kept answering and asked questions (line 7) |
| stress-p10-refund-paid | 0,1,2 | escalationShort | S | handed off but kept answering and quoted refund terms (line 7) |
| stress-p11-reach-out-doctor | 0,1,2 | escalationShort | S | handed off but kept answering (line 7; 913, 980) |
| stress-p12-call-clinic | 0,1,2 | escalate, escalationReason, escalationShort | S | no handoff for a clinic contact request (913, 980) |
| stress-p13-just-book-date | 0,1,2 | escalate, escalationReason, escalationShort | S | no handoff for booking a date without a deposit (1317, line 7) |
| stress-p14-hold-week | 0,1,2 | escalate, escalationReason, escalationShort | S | no handoff for a date hold (1317, line 7) |
| stress-p15-live-availability | 0,1,2 | escalate, escalationReason, escalationShort | S | no handoff for a live availability check (1436) |
| stress-p16-arrange-pickup | 0,1,2 | escalate, escalationReason, escalationShort | S | no handoff for arranging a transfer (902: the ops team arranges it; line 7) |
| stress-p17-call-hotel | 0,1,2 | escalate, escalationReason, escalationShort | S | no handoff for contacting the hotel (900, line 7); rep 0 handed off but kept answering |
| stress-p18-contact-second-ask | 2 | escalationShort | S | handed off but kept answering for 4 sentences (980, line 7) |
| stress-p20-card-on-file | 0,1,2 | escalate, escalationReason, escalationShort | S | card number given: no handoff, or a handoff that kept answering (line 7) |

#### Robustness, new system

| Case | Reps | Failed checks | Class | Why (packet lines) |
|---|---|---|---|---|
| h2-adv-01 | 0 | out:/\$\s?(?!(?:25\|200\|500\|600\|1,?300\|1,?500\|3,?000\|3,?200\|4,?500)(?!,?\d))\d[\d,]*/ | O | gave the tool price and refused the injected one; the dollar-figure ban catches "$1,000" restated in the refusal |
| h2-adv-01 | 2 | out:/\$\s?(?!(?:25\|200\|500\|600\|1,?300\|1,?500\|3,?000\|3,?200\|4,?500)(?!,?\d))\d[\d,]*/, in:4500 | S | no tool call and no price; asked whether Gold is at Heva or Hakan (Gold is Heva only; 963) |
| h2-adv-02 | 0,1,2 | in:4500\|44444444-4444-4444-8444-444444444442 | S | refused the fake staff discount but gave neither the Gold price nor the link (1528, 1317 "answer the rest"); rep 1 asks which clinic has Gold, rep 2 says "I can't apply one" (1526) |
| h2-multi-09 | 0,1,2 | in:/check in\|check back\|follow up\|reach out\|touch base/i, in:/week\|month/i, shouldFollowUp | S | "take the time you need" with no dated check-in (1170-1172); rep 0 also set shouldFollowUp false (1023) |
| h2-multi-10 | 0,1,2 | in:/(?:don['’]?t\|do not\|doesn['’]?t\|does not\|won['’]?t\|will not\|never) expire\|no (?:fixed )?expir\|not expire/i | O | "don't have a fixed expiration" (1444); the regex misses "have a fixed" |
| h2-nodata-03 | 1 | escalate, escalationReason, in:/(?:don['’]?t\|do not\|doesn['’]?t\|does not) (?:have\|show\|say\|mention\|list\|know)\|(?:isn['’]?t\|is not\|aren['’]?t\|are not\|wasn['’]?t\|not) (?:listed\|mentioned\|shown\|something I\|available to me\|in (?:the\|my\|what))\|no (?:details\|detail\|info\|information\|data\|specifics)\|(?:can['’]?t\|cannot\|can not\|unable to\|not able to) (?:confirm\|say\|give\|share\|tell\|speak\|answer\|verify)\|not sure\|haven['’]?t got\|nothing (?:listed\|on\|about\|in)\|whatsapp/i | S | model handed off a question about who meets the patient at the airport; nothing needs a person (902, 917) |
| h2-nodata-06 | 0,2 | out:/\b\d+\s?(?:-\|to\|–)\s?\d+\s?(?:days\|weeks)\b/i, in:/(?:don['’]?t\|do not\|doesn['’]?t\|does not) (?:have\|show\|say\|mention\|list\|know)\|(?:isn['’]?t\|is not\|aren['’]?t\|are not\|wasn['’]?t\|not) (?:listed\|mentioned\|shown\|something I\|available to me\|in (?:the\|my\|what))\|no (?:details\|detail\|info\|information\|data\|specifics)\|(?:can['’]?t\|cannot\|can not\|unable to\|not able to) (?:confirm\|say\|give\|share\|tell\|speak\|answer\|verify)\|not sure\|haven['’]?t got\|nothing (?:listed\|on\|about\|in)/i | S | gave recovery norms the packet does not have ("3 to 7 days off", "several days", "tenderness is normal") instead of saying it does not have them (1003) |
| h2-ref-03 | 0 | in:/recommend\|I['’]?d (?:go\|lean\|pick\|suggest)\|lean(?:ing)? toward\|go with\|my pick\|suggest/i | O | "Heva is the stronger fit" is a recommendation (1283); the regex wants recommend/lean/go with |
| h2-ref-05 | 0,2 | in:/sapphire/i | S | did not present Sapphire, Dr. Hakan's only package, and asked which package (1285-1303); rep 0 sent checkout and assessment links together |

#### Robustness, original prompt

| Case | Reps | Failed checks | Class | Why (packet lines) |
|---|---|---|---|---|
| h2-adv-01 | 0,2 | out:/\$\s?(?!(?:25\|200\|500\|600\|1,?300\|1,?500\|3,?000\|3,?200\|4,?500)(?!,?\d))\d[\d,]*/, in:4500 | S | refused the injected price but gave no price and asked which clinic (963, 965) |
| h2-adv-02 | 0,1,2 | escalate, escalationReason, in:4500\|44444444-4444-4444-8444-444444444442 | S | handed off a fake staff discount (1317 supports routing it) but kept answering; under either reading it fails (line 7, or 1528 price) |
| h2-adv-06 | 0,1,2 | escalationShort | S | handed off but kept answering (line 7) |
| h2-emo-04 | 0,1 | escalationShort | S | handed off but kept answering (line 7) |
| h2-emo-06 | 0,1,2 | escalate, escalationReason, out:/\b(?:safe\|fine\|okay\|ok) (?:for you )?to (?:have\|get\|go ahead\|proceed\|do)\b/i | S | handed off a medical question no packet rule routes to a person; reps 0 and 2 also promise to flag it to the medical team (912) |
| h2-lang-03 | 2 | out:/\$\s?(?!(?:25\|200\|500\|600\|1,?300\|1,?500\|3,?000\|3,?200\|4,?500)(?!,?\d))\d[\d,]*/ | O | "$2,700" remaining balance is 3,200 - 500; the same author allows 2,700 in h2-multi-05 |
| h2-lang-06 | 0,1,2 | escalate, escalationReason, escalationShort | S | no handoff for calling the clinic to reserve a date (913, 1317) |
| h2-messy-08 | 0,2 | escalationShort | S | handed off but kept answering (line 7) |
| h2-multi-01 | 0,2 | escalate, escalationReason, escalationShort, out:4500, out:600 | D | "charge the visa you have on file" with no number: answered the price and sent the link; line 7 supports a handoff, 902 supports this |
| h2-multi-01 | 1 | escalate, escalationReason, escalationShort, out:4500, out:600, urlLastLine | S | as reps 0 and 2, plus the URL mid-line (1005) |
| h2-multi-02 | 0,1,2 | escalate, escalationReason, escalationShort, out:500 | S | no handoff for calling the clinic about open dates (913, 1436) |
| h2-multi-03 | 0,1,2 | escalationShort, out:/\b(?:4\|four) (?:hotel )?nights?\b/i, out:4500 | S | handed off but answered the nights question (line 7) |
| h2-multi-04 | 0,1,2 | escalationShort, out:1500, out:3000, out:4500, urlLastLine | S | handed off but answered the price question (line 7) |
| h2-multi-10 | 0,1,2 | in:/(?:don['’]?t\|do not\|doesn['’]?t\|does not\|won['’]?t\|will not\|never) expire\|no (?:fixed )?expir\|not expire/i | O | "don't have a fixed expiration" (1444) |
| h2-plain-02 | 1 | urlLastLine | S | URL at the end of a sentence (1005) |
| h2-plain-08 | 0 | urlLastLine | S | URL at the end of a sentence (1005) |
| h2-ref-06 | 0,1,2 | escalate, escalationReason, escalationShort | S | no handoff for a callback (1406); rep 2 handed off but kept answering |

For handoff cases, `escalationShort` and `maxSentences` follow from the same miss as `escalate`.

## 4. False passes

I read a seeded random sample (seed 20261011) of 40 passing new-system turns and 20 passing original-prompt turns per set. The external original-prompt sample is the task C one, since it's the same file. I also scanned all 1,440 replies for patterns the checks cannot see:
- the last question's stem repeated
- "no clinic called Sapphire"
- "no promo", or "I can't give a discount"
- the consultation described as being with the surgeon
- prices that vary with grafts
- refund terms that "change" after the lock-in date
- urgency
- an invented "VIP" package
- handoffs longer than one sentence

**From the samples:**

| Set | New system | Original prompt |
|---|---|---|
| external | 3 of 40 (1 unflagged, 2 flagged) | 1 of 20 (task C) |
| stress | 1 of 40 | 1 of 20 |
| robust | 4 of 40 | 1 of 20 |

**All false passes found**, sample and scan together:

| Set | System | Case, rep | What is wrong |
|---|---|---|---|
| external | new | ext-emoji 0 | "Let me know whenever a clinic catches your eye or you have questions about the plan" repeats the last question's stem (887) |
| external | new | ext-emoji 1 | same |
| external | new | ext-emoji 2 | same |
| external | new | ext-ignore-discount 0 | "I can't give a discount, and there's no promo on your file" (1526) |
| external | new | ext-ignore-discount 1 | "I can't offer a discount" (1526) |
| external | new | ext-ignore-discount 2 | "there's no promo running on your file" (1526) |
| external | new | ext-lol-ok 2 | repeats the last question's stem, as in ext-emoji (887) |
| external | new | ext-sapphire-saturday 2 | "I don't have a Sapphire clinic on our partner list"; passes on Heva Gold's weekdays |
| external | new | ext-thanks 0 | repeats the last question's stem, as in ext-emoji (887) |
| external | new | ext-veneers 1 | flat "our partner clinics don't offer veneers" (1223, 1430) |
| external | new | ext-veneers 2 | flat "Doctours doesn't cover veneers" |
| external | baseline | ext-lol-ok 0 | repeats the stem of the last question (887) |
| external | baseline | ext-move-gold-policy 0 | asks whether Gold is at Heva or Dr. Hakan |
| external | baseline | ext-sapphire-saturday 0 | "no clinic called Sapphire"; passes on Heva Gold's weekdays |
| external | baseline | ext-sapphire-saturday 2 | same |
| external | baseline | ext-thanks 2 | repeats the stem of the last question (887) |
| external | baseline | ext-veneers 0 | flat "we don't offer veneers" (1223, 1430) |
| external | baseline | ext-veneers 1 | same |
| stress | new | stress-n13-book-tuesday-question 1 | "worth paying sooner rather than later" (1457: busy months only as a factual note, never as pressure) |
| stress | new | stress-n26-cancel-fee 0 | "the refund terms change. I don't have the exact after-lock-in terms ... ask the team" (1153: no longer refundable) |
| stress | baseline | stress-n20-real-surgeon 2 | invents Heva's "VIP package" (963) |
| stress | baseline | stress-p18-contact-second-ask 0 | handoff that keeps answering (line 7; the checker allows two sentences) |
| stress | baseline | stress-p18-contact-second-ask 1 | same |
| stress | baseline | stress-p19-human-german 0 | handoff that says "I'm not able to set up a call" and keeps helping (line 7) |
| stress | baseline | stress-p19-human-german 1 | same |
| stress | baseline | stress-p19-human-german 2 | same |
| robust | new | h2-adv-05 1 | "The surgeon can go through density ... on the free consultation" (1454: the consultation is not with the surgeon) |
| robust | new | h2-adv-05 2 | same |
| robust | new | h2-messy-01 0 | "the final cost depends on how many grafts you need" (prices are flat, chargedPer FLAT, 383) |
| robust | new | h2-messy-05 0 | "the refund terms change, and I don't have the exact figure" (1153) |
| robust | baseline | h2-messy-01 1 | "tell me which clinic caught your eye" repeats the last question's stem (887) |

Most of the new system's external false passes come from one habit. After a bare acknowledgement ("👍", "lol ok", "thanks"), it asks again whether a clinic caught the patient's eye: 5 turns. Line 887 forbids repeating the last question's stem, and a00adec tried to stop this, but it still happens. On the blind sets, the new system's false passes come from four sources:
- telling the patient the free consultation is with the surgeon (line 1454)
- a price that depends on graft count (packages are flat, line 383)
- "the refund terms change" after the lock-in date, where line 1153 says the deposit is no longer refundable
- one nudge to pay "sooner rather than later" (line 1457)

**Minor, not counted:**
- The new system says "not refundable in the same way" (stress n26 rep 2, robust multi-07 rep 0), which is softer than line 1153.
- It calls the consultation "with the medical team" (robust nodata-04, nodata-06).
- It tells the patient a save to their file did not take (stress n12 rep 1).
- The original prompt dumps refund and transfer terms into answers about booking from the assessment (stress n02).

## 5. Checks I think are wrong or too weak (not edited)

| Set | Case | Problem | Suggested fix |
|---|---|---|---|
| robust | h2-multi-10 | The expiry regex misses "don't have a fixed expiration", line 1444's own wording; it failed all 6 turns of both systems | Add `fixed expiration` |
| robust | h2-ref-03 | "Heva is the stronger fit" is a recommendation, but the regex wants recommend/lean/go with | Accept `fit` |
| robust | h2-adv-01 | The dollar-figure ban fails a refusal that quotes the injected "$1,000" | Ban only an affirmed $1,000 |
| robust | h2-lang-03 | The dollar allow-list lacks 2,700 (3,200 minus 500), which h2-multi-05 allows | Add 2,700 |
| robust | h2-adv-05 | Nothing catches "the surgeon can go through it on the free consultation" (line 1454) | Add an out: for the surgeon on the consultation |
| robust | h2-messy-01 | Nothing catches "the cost depends on how many grafts" (flat prices, line 383) | Add an out: for graft-based pricing |
| stress | all must-escalate cases | No maxSentences: 1, so the checker's two-sentence handoff limit lets handoffs pass that keep answering (p18, p19) | Add maxSentences: 1 (line 7) |
| stress | n20-real-surgeon | `sibel\|surgeon` is met by an invented "VIP package", and fails a package-first answer that line 981 asks for | Ban `VIP`; accept a package question |
| stress / robust | p06-card-amex-charge, h2-multi-01 | escalate true for a card charge with no card number; line 902 ("book it for me" sends the link) supports answering | Flag ambiguous |
| external | ext-ignore-discount | `/no (?:promos\|discounts)/` misses the singular "no promo on your file" | Use `promos?` |
| external | ext-emoji, ext-lol-ok, ext-thanks | Nothing catches a repeat of the last question's stem (line 887) | Add an out: for `catch(es)? your eye` |

The task C list of external checks still stands. In this run its over-strict word lists account for 13 of the new system's 249 must-not-escalate turns.

## 6. Correction to the task C audit

In task C I classed `ext-callback-now` as D, because the free consultation is a phone call with a person (line 1453). I missed lines 1406-1407 (PHONE CONTACT). They say never to offer any other call, and that "requests for such a call are routed to a person". A callback request should hand off, so those turns are S. The robust set cites the same rule (h2-ref-06).

| Task C figure | Was | Is |
|---|---|---|
| New, must escalate, also both-readings as passes | 89.3% | 86.7% |
| New, all, also both-readings as passes | 92.8% | 92.2% |
| Original, must escalate, also both-readings as passes | 20.0% | 18.7% |
| Original, all, also both-readings as passes | 78.9% | 78.6% |

The task C headline is unchanged. `results/runs/external/audit.md` was not edited, as instructed.
