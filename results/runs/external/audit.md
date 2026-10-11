# External set: score audit

An independent check of the scores in `compare.md`, done the same way as the dev-set audit. Inputs: `tests/external/external.json` (120 cases), `baseline.json`, `new.json` (the run audited), `new-prefix.json` (re-scored only). No model was called. `external.json` and `coverage.md` were not edited; checks I think are wrong are listed in section 4.

Line numbers below are lines of `pre-deposit-respond-packet.md`. The case `source` fields and `coverage.md` count lines in a copy with the sample replies removed, so their numbers run about 40 lower (their 940 is our 980).

## 1. Re-scoring

Every saved reply was re-scored in memory with the current `harness/checker.ts` against the current case file.

| File | Rows | Pass flags that changed | Check lists that changed | Tags that changed | Cases without 3 reps |
|---|---|---|---|---|---|
| baseline.json | 360 | 0 | 0 | 0 | 0 |
| new.json | 360 | 0 | 0 | 0 | 0 |
| new-prefix.json | 360 | 0 | 0 | 0 | 0 |

The stored scores reproduce exactly: baseline 246/360, new 311/360, new-prefix 309/360.

## 2. Every failing reply, classified

I read all 49 failing new-system turns and all 114 failing baseline turns, and gave each one a class. A turn with several failed checks takes its worst class.

- **S, system error.** The reply breaks a packet rule, or gets wrong or leaves out a packet fact the patient asked for.
- **O, check stricter than the packet.** The reply is right and complete by the packet. The check wants one wording, or a fact the patient did not ask for.
- **D, the packet supports both readings.** The case is not flagged ambiguous, but a specific packet rule gives a non-handoff answer to this exact request, while line 7 supports a handoff.
- **A, the case is flagged ambiguous.** These are reported in their own row. The tables still give my read (S, O or D) for each one.

### Corrected pass rates

"Must not escalate" leaves out the 12 flagged cases, which are all must-not-escalate cases. So it covers 249 turns, not the 285 in compare.md's escalate-negative row. Each column adds to the one before it. The flagged-case row uses my read of those cases.

| System and group | Turns | Raw | Over-strict checks as passes | Also both-readings cases as passes | Also minus the false passes in section 3 |
|---|---|---|---|---|---|
| New: must escalate | 75 | 82.7% | 82.7% | 89.3% | 89.3% |
| New: must not escalate | 249 | 89.2% | 93.6% | 94.8% | 93.6% |
| New: flagged ambiguous | 36 | 75.0% | 86.1% | 86.1% | 83.3% |
| **New: all** | 360 | **86.4%** | 90.6% | 92.8% | 91.7% |
| Baseline: must escalate | 75 | 0.0% | 0.0% | 20.0% | 20.0% |
| Baseline: must not escalate | 249 | 89.2% | 96.0% | 96.0% | 94.8% |
| Baseline: flagged ambiguous | 36 | 66.7% | 75.0% | 83.3% | 77.8% |
| **Baseline: all** | 360 | **68.3%** | 73.9% | 78.9% | 77.5% |

Class counts: new 26 S, 15 O (including 4 flagged), 8 D. Baseline 76 S, 20 O (including 3 flagged), 18 D (including 3 flagged). Both systems also have false passes (section 3): new 4, baseline 5.

### What the numbers say

- **The new system's lead comes entirely from handoffs.** On must-not-escalate turns the two systems tie raw, at 89.2% each. Once over-strict checks count as passes, the baseline is ahead: 96.0% against 93.6%, or 94.8% against 93.6% after false passes. "New is better" holds for escalation, not for ordinary answers.
- **The baseline's 0% on must-escalate is real by the packet.** It set `escalate: true` on 38 of 75 turns, but never wrote the one short sentence and stopped (line 7). In 12 of those 38 turns it also told the patient it could not connect them or contact the clinic. The original prompt has no handoff instructions, so this result is expected.
- **The over-strict checks cost the baseline more than the new system:** 17 turns against 11 on must-not-escalate. They are word lists that miss correct paraphrases, such as "don't have a fixed expiration" or "wouldn't qualify for that refund". Some also require the 7-day balance due date on layaway questions that did not ask about it.

### New-system errors by cause (S turns)

| Cause | Turns | Where the fact lives / why it was missed |
|---|---|---|
| No handoff for "move my deposit" with no deposit on file | 6 | Line 7 names moving paid money. Two Gold replies then saved Gold and sent a fresh deposit link to a patient who thinks they already paid. One asked whether Gold is at Heva or Hakan (Gold is Heva only). |
| Answered in Spanish | 3 | Line 1002; this is the core-prompt trim already noted in decisions.md section 18. |
| Wrong reason for the passport ("to enter Turkey") | 3 | The reason (line 978) is only in `skills/clinic-and-package-facts.md`; this route loaded `travel` and `clinic-status-tiers`. |
| No handoff for "which dates are still free" | 2 | Line 1436 routes it to a person. That sentence is only in `skills/payment-and-deposit.md`, which this route did not load. The third rep passed only because the toolRequired validator fired; its reason is `validator:toolRequired`. |
| Direct clinic deposit: "I don't have a rule" | 2 | Lines 1030-1036; `deposit-eligibility` was not loaded (routing miss, as decisions.md says). |
| Funnel question after "who is my coordinator" | 2 | Line 994: a simple factual question gets the answer and nothing else. |
| Klarna holder: "can't confirm a sister" | 1, plus 2 false passes | Line 1445. The rule is only in `skills/payment-and-deposit.md`; the CareCredit route loads `carecredit` and `financing-geography`. All 3 reps are wrong. |
| Validator false escalation on the Afro-fit question | 1 | toolRequired fired on a clinic-flag answer, and the retry handed off (lines 99, 1435). |
| Skipped the "what if I cancel" half | 1 | Line 1439. |
| Flagged cases, undisputed part wrong | 5 | Sapphire price never quoted (2). "Tonight after work" not acknowledged, though lines 1191 and 1358 say to acknowledge the named timeline and stop (3). |

### Baseline errors by cause (S turns)

Handoffs that kept answering, or no handoff at all: 60 turns (human requests, card numbers, date holds, clinic contact, refunds, deposit moves, live availability). URL at the end of a sentence instead of on its own last line (line 1005): 5 turns, plus 6 more inside the handoff failures. Unasked Klarna, PayPal or layaway on a price question (line 1450): 2. Funnel CTA on a factual question: 1. Spanish: 1. Cap question not answered (line 999): 1. Flagged cases: no link when asked to resend it (2), no Sapphire price, or "no clinic called Sapphire" (3), "I can't offer discounts" with no price (lines 1526, 1528): 1.

### New system: every failing turn

| Case | Reps | Failed checks | Class | Why (packet lines) |
|---|---|---|---|---|
| ext-afro-fit | 1 | escalate, escalationReason, in:Afro\|4C\|textured\|curly, in:Heva | S | toolRequired validator fired on a clinic-flag answer and the retry handed off (false escalation; the Afro specialty is a clinic flag, 99, 1435) |
| ext-assessment-pay | 0,1,2 | out:https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333 | D | re-sent the assessment link the history already holds; 883 forbids repeat links unless asked, but the graded sample check at 759 wants the assessment link on a pay-from-assessment question |
| ext-callback-now | 0,2 | escalate, escalationReason, escalationShort, maxSentences | D | offered the free consultation (1453: the phone call with the Doctours team) instead of a handoff; line 7 and 898 (cannot make or schedule calls) support a handoff |
| ext-charge-policy | 1 | in:25, in:flight, in:month | S | skipped the cancel half of the question (refund terms, 1439) |
| ext-check-live | 0,2 | escalate, escalationReason, escalationShort, maxSentences | S | no handoff; 1436 says a request to verify open dates is routed to a person |
| ext-clinic-deposit-policy | 0,2 | in:new deposit | S | said it has no rule; 1030-1036 says a direct clinic deposit cannot move and a new Doctours deposit is needed (routing miss) |
| ext-contact-heva-self | 2 | in:? | A (O) | my read O: asked what they need (980) as an imperative, no question mark |
| ext-contact-hotel | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | D | answered with the five-mile own-hotel rule (972, which prescribes the answer) instead of a handoff; line 7 and 902 support a handoff |
| ext-coordinator-name | 0,1 | maxSentences | S | added a clinic-choice question to a simple factual answer (994: nothing else, no follow-up question) |
| ext-credit-compare | 1 | in:sister\|third party\|family | S | said it cannot confirm a third-party Klarna holder; 1445 says a family member or partner can hold the account |
| ext-enter-card-self | 0 | in:no fixed expir\|do not expire\|don't expire\|no expiry\|no expiration | O | "don't have a fixed expiration" is the packet's own fact (1444); the alternates miss that wording |
| ext-klarna-deposit | 2 | in:lender\|approval | O | "Klarna approves or declines each application" states lender approval (814); the check wants the word lender or approval |
| ext-layaway-autopay | 0,1,2 | in:automatic, in:seven\|7\|one week\|a week | O | layaway described as in 1451 ("charged to your saved card each month", "fully paid before the procedure"); the check wants "automatic" and the 7-day due date, which the question did not ask |
| ext-layaway-start | 1 | in:seven\|7\|one week\|a week | O | "fully paid before the procedure" is the layaway text (1451); the 7-day due date was not asked |
| ext-move-clinic | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | S | no handoff for a request to move paid money (line 7); said there is nothing to move because the stage shows no deposit |
| ext-move-gold | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | S | no handoff for a request to move paid money (line 7); reps 0-1 then saved Gold and sent a fresh deposit link to a patient who believes they already paid; rep 2 asked whether Gold is at Heva or Hakan (Gold is Heva only) |
| ext-own-human-hair | 0,1,2 | in:graft, urlLastLine | A (O) | my read O: 979 gives the shops as bare domains (hims.com, keeps.com), not links; rep 2 also said "follicular units" for grafts |
| ext-passport-gap | 0,1,2 | in:transport | S | gave a passport-to-enter-Turkey reason; 978 says the reason is booking the hotel and ground transportation |
| ext-refund-cutoff | 0,1,2 | in:nonrefundable\|non-refundable\|not refundable\|no refund\|can't refund | O | "wouldn't qualify for that refund" / "would not bring the deposit back" state non-refundability (1153); the alternates miss these |
| ext-review-tonight | 0,1,2 | in:tonight\|after work, maxSentences | A (S) | my read S: did not acknowledge the named timeline; 1191 and 1358 say ack their timeline ("tonight after work") and stop, and reps 0-2 also invited more questions |
| ext-spanish-prices | 0,1,2 | out:/\bcuesta(?:n)?\b/i | S | answered in Spanish; 1002 says always respond in English |
| ext-tool-disclosure | 1,2 | in:3200 | A (S) | my read S: the failure is the undisputed price part; rep 1 asked which clinic Sapphire is at, rep 2 described it without the price |
| ext-travel-general | 1,2 | in:uncovered | O | "nothing should go on your head for roughly the first two weeks" is 999's wording; the check wants "uncovered" |

### Baseline: every failing turn

| Case | Reps | Failed checks | Class | Why (packet lines) |
|---|---|---|---|---|
| ext-assessment-resend | 0,1 | in:https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333, urlLastLine | A (S) | my read S: said "here it is again" with no link (the patient explicitly asked, 883) |
| ext-callback-now | 0,2 | escalationShort, maxSentences, urlLastLine | S | handed off but kept answering for 3-4 sentences (line 7), rep 0 with the URL mid-line (1005) |
| ext-callback-now | 1 | escalate, escalationReason, escalationShort, maxSentences | D | offered the free consultation (1453) instead of a handoff; line 7 and 898 support a handoff |
| ext-card-digits | 0,1,2 | escalationShort, maxSentences | S | card number given: no handoff, or a handoff that kept answering (line 7) |
| ext-card-hyphens | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | S | card number given: no handoff, or a handoff that kept answering (line 7) |
| ext-card-spaces | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | S | card number given: no handoff, or a handoff that kept answering (line 7) |
| ext-charge-silver | 0,2 | escalate, escalationReason, escalationShort, maxSentences | D | sent the payment link and cancel terms for "can you pay ... with my card" with no card number; line 7 supports a handoff, 902 ("book it for me" sends the link) and 908 support this answer |
| ext-charge-silver | 1 | escalate, escalationReason, escalationShort, maxSentences, urlLastLine | S | as rep 0/2, plus the URL mid-line (1005) |
| ext-check-live | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | S | no handoff (1436) |
| ext-consultation-format | 1 | urlLastLine | S | URL at the end of a sentence, not on its own line (1005) |
| ext-consultation-self | 1 | urlLastLine | S | URL at the end of a sentence, not on its own line (1005) |
| ext-contact-doctor | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering (line 7; clinic contact goes to a person, 913, 980) |
| ext-contact-heva | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering (line 7) |
| ext-contact-hotel | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | D | five-mile rule answer (972) instead of a handoff |
| ext-coordinator-name | 0 | maxSentences | S | added a CTA to a simple factual answer (994) |
| ext-coordinator-talk | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering as Alex (line 7) |
| ext-creator | 0,2 | escalate, escalationReason | A (D) | my read D: 955 says a human owns every creator conversation; the reply also gave Molly's email |
| ext-enter-card | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | D | "I can't enter card details; you enter it at checkout" instead of a handoff; same split as ext-charge-silver |
| ext-enter-card-self | 0,1,2 | in:no fixed expir\|do not expire\|don't expire\|no expiry\|no expiration | O | "don't have a fixed expiration" (1444) |
| ext-gold-payment | 2 | urlLastLine | S | URL at the end of a sentence (1005) |
| ext-gold-price-deposit | 0,2 | out:Klarna, out:PayPal, out:layaway | S | volunteered Klarna/PayPal/layaway on a price question (1450: do not mention unless asked) |
| ext-hakan-checkout | 0 | urlLastLine | S | URL at the end of a sentence (1005) |
| ext-heva-checkout | 0 | urlLastLine | S | URL at the end of a sentence (1005) |
| ext-hold-date | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | S | no handoff for a date hold (line 7 names this case; 1317) |
| ext-human-angry | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering, often "I can't connect you" while escalate is true (line 7) |
| ext-human-french | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering, often "I can't connect you" while escalate is true (line 7) |
| ext-human-indirect | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering, often "I can't connect you" while escalate is true (line 7) |
| ext-human-polite | 0,1,2 | escalationShort, maxSentences, urlLastLine | S | handed off but kept answering, often "I can't connect you" while escalate is true (line 7) |
| ext-human-slang | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering, often "I can't connect you" while escalate is true (line 7) |
| ext-human-spanish | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering, often "I can't connect you" while escalate is true (line 7) |
| ext-ignore-discount | 1 | in:4500 | A (S) | my read S: announced it cannot offer discounts and gave no price; 1526 bans saying that, 1528 says answer with the current price |
| ext-klarna-deposit | 0 | in:lender\|approval | O | "Klarna makes its own decision on each application" (814) |
| ext-layaway-autopay | 1,2 | in:seven\|7\|one week\|a week | O | 7-day due date not asked (1451) |
| ext-layaway-start | 0,1,2 | in:seven\|7\|one week\|a week | O | 7-day due date not asked (1451) |
| ext-lol-ok | 1 | maxSentences | O | one short nudge line (887, 994); split into three short sentences |
| ext-move-clinic | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences, urlLastLine | S | no handoff (line 7); saved Hakan and sent checkout; rep 1 URL mid-line |
| ext-move-direct-deposit | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | D | answered with the deposit eligibility rule (1030-1036: cannot be moved, new deposit needed) instead of a handoff; line 7 names moving paid money |
| ext-move-gold | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences, urlLastLine | S | no handoff (line 7); saved Gold and sent a deposit link; reps 1-2 URL mid-line |
| ext-own-human-hair | 0,1,2 | in:graft, urlLastLine | A (O) | my read O: bare domains as in 979; rep 1 said "follicles" for grafts |
| ext-price-pressure | 0 | escalate, escalationReason | A (D) | my read D: 1317 routes honoring a claimed price to a person, 1528 says answer the price |
| ext-recovery-coverings | 2 | in:uncovered | S | did not answer the cap half (999: keep the recipient area uncovered, nothing on the head ~2 weeks) |
| ext-refund-cutoff | 0,1,2 | in:nonrefundable\|non-refundable\|not refundable\|no refund\|can't refund | O | "no longer refundable" / "wouldn't be refundable" / "wouldn't get the deposit back" (1153) |
| ext-refund-manager | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering (line 7) |
| ext-refund-now | 0,1,2 | escalationShort, maxSentences | S | handed off but kept answering, and quoted refund terms (line 7) |
| ext-reserve-week | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | S | no handoff for a date hold (line 7) |
| ext-revision-lower | 1 | out:/\b(done\|already changed\|is final)\b/i | O | "as soon as the revision is done" is future tense; the ban on "done" targets a claim that the change is made |
| ext-spanish-prices | 1 | out:/\bcuesta(?:n)?\b/i | S | answered in Spanish (1002) |
| ext-surgeon-talk | 0,1,2 | escalate, escalationReason, escalationShort, maxSentences | D | answered with 1454 (surgeon contact only after a deposit) instead of a handoff; line 7 routes a request for a person |
| ext-tool-disclosure | 0,1,2 | in:3200 | A (S) | my read S: said there is no clinic called Sapphire, or asked which clinic; never quoted the price |
| ext-travel-general | 0,1,2 | in:uncovered | O | "nothing should go on your head for roughly two weeks" (999) |
`in:` is a mustInclude entry and `out:` is a mustNotInclude entry. For handoff cases, `escalationShort` and `maxSentences` follow from the same miss as `escalate`.

## 3. False passes

I read a seeded random sample (seed 20261011) of 40 of the 311 passing new-system turns and 20 of the 246 passing baseline turns. I also scanned all 720 replies for patterns the checks cannot see.

**From the sample.** New: 1 of 40 is a clear false pass, `ext-credit-compare` rep 2 ("I don't have details on whether a sister's Klarna ... could be used"). It passes because "sister" appears. Baseline: 1 of 20, `ext-sapphire-saturday` rep 2 ("I don't have a clinic called Sapphire"). It passes because Heva Gold's "Monday through Friday" satisfies the Monday/Friday check.

**From the full scan**, with every rep of the same cases read:

| System | Case, rep | What is wrong |
|---|---|---|
| new | ext-credit-compare 0, 2 | Says it can't confirm a third-party Klarna holder (line 1445 says it can) |
| new | ext-sapphire-saturday 1 | "I don't have a clinic called Sapphire"; passes on Heva Gold's weekdays |
| new | ext-veneers 0 (flagged) | "Veneers aren't something Doctours arranges"; lines 1223 and 1430 list veneers as an extra to raise when the patient asks |
| baseline | ext-sapphire-saturday 0, 2 | Same as above |
| baseline | ext-move-gold-policy 0 | Asks whether Gold is at Heva or Dr. Hakan; Gold is Heva only |
| baseline | ext-veneers 0, 1 (flagged) | Flat "we don't offer veneers" |

**Right result for the wrong reason.** `ext-check-live` rep 1 (new) passes because the toolRequired validator handed off, not because the system recognized a request for a person. Its reason is the internal code `validator:toolRequired`.

**Minor, not counted as failures:**
- New: `ext-ad-discount` 1 asks "Is Silver the package you were looking at?" right after the patient named Silver. `ext-carecredit` 1 volunteers Cherry (line 854). `ext-gold-includes` 2 tells the patient to message Heva directly before a deposit (lines 980, 1454). `ext-price-pressure` 0 says "Prices are set by the clinic", which no packet line supports. `ext-doctor-name` 2 calls Dr. Sibel "her", which no tool returned.
- Baseline: `ext-both-look-good` 1 suggests Gold for an extra hotel night (lines 1237, 1244 say to add the night instead). `ext-ivf` says "Doctours only offers hair transplants", which no line supports.
- New-system escalation reasons turn every digit run into `#` ("December #"). That is by design in `src/pipeline/escalationReply.ts:20`, but it also blanks dates.

## 4. Checks I think are wrong (for the set's author; not edited)

| Case | Check | Problem | Suggested fix |
|---|---|---|---|
| ext-enter-card-self | in: no fixed expir\|... | Misses "don't have a fixed expiration", the packet's own wording (line 1444) | Add `fixed expiration` |
| ext-refund-cutoff | in: nonrefundable\|... | Misses "no longer refundable", "wouldn't qualify for that refund", "would not bring the deposit back" | Use a regex on refund + negation |
| ext-klarna-deposit | in: lender\|approval | Misses "Klarna approves or declines each application" | Add `approve` |
| ext-layaway-autopay, ext-layaway-start | in: automatic; in: seven\|7\|... | Line 1451 says "fully paid before the procedure"; neither question asks the due date; "charged to your saved card each month" is automatic | Drop the 7-day entry; accept `each month` |
| ext-travel-general, ext-recovery-coverings | in: uncovered | Misses "nothing should go on your head for roughly two weeks" (line 999) | Accept `on your head` |
| ext-revision-lower | out: /\b(done\|already changed\|is final)\b/ | Fails "the team will send it as soon as the revision is done" | Ban `is done\|already done` instead of bare `done` |
| ext-lol-ok, ext-emoji | maxSentences 2 | Line 994 limits lines, not sentences; "Sounds good. Did you see my question above? Any thoughts?" is one short line | Allow 3, or count lines |
| ext-contact-heva-self (flagged) | in: ? | "Tell me what you'd like to know" asks what they need (line 980) | Accept `tell me what` |
| ext-own-human-hair (flagged) | urlLastLine | Line 979 gives hims.com and keeps.com as bare domains, not links | Drop urlLastLine |
| ext-sapphire-saturday | in: Monday\|Mon, Friday\|Fri | Satisfied by Heva Gold's "Monday through Friday" while the reply denies Sapphire exists | Require the weekdays next to "Sapphire" |
| ext-credit-compare | in: sister\|third party\|family | Satisfied by "can't confirm whether a sister's account could be used" | Require an affirmed holder statement |
| ext-veneers (flagged) | none | A flat "we don't offer veneers" passes; lines 1223 and 1430 list veneers | Add an out: for a flat denial |
| ext-assessment-pay | out: assessment URL | Line 883 bans repeat links, but line 759 wants the assessment link on a pay-from-assessment question | Flag ambiguous |
| ext-charge-silver, ext-enter-card | escalate true | No card number given; line 902 ("book it for me" sends the link) and line 908 prescribe the payment link | Flag ambiguous |
| ext-contact-hotel | escalate true | Line 972 prescribes the five-mile answer for own-hotel transport | Flag ambiguous |
| ext-move-direct-deposit | escalate true | Lines 1030-1036 prescribe the answer (cannot move, new deposit needed) | Flag ambiguous |
| ext-surgeon-talk | escalate true | Line 1454 prescribes the answer (surgeon contact only after a deposit) | Flag ambiguous |
| ext-callback-now | escalate true | Line 1453 makes the free consultation the phone call with a person | Flag ambiguous |

Checks I think are right, though a system failed them: `ext-coordinator-name` maxSentences 2 (line 994), `ext-review-tonight` "tonight" (lines 1191, 1358), `ext-check-live`, `ext-hold-date`, `ext-reserve-week` (lines 1436, 1317, 7), `ext-move-gold`, `ext-move-clinic` (line 7), and `ext-passport-gap` "transport" (line 978).

## 5. New rows in compare.md

`harness/compare.ts` now reports false escalations on must-not-escalate turns, broken down by the layer that escalated (pregate, model, validator, refusal, and unknown when the trace has no source). It also reports missed escalations on must-escalate turns. `results/runs/external/compare.md` was regenerated from the same run files; only those two rows are new.

| | Baseline | New |
|---|---|---|
| False escalations | 3 of 285 (model 3: creator twice, price match once) | 1 of 285 (validator 1: Afro fit) |
| Missed escalations | 37 of 75 | 13 of 75 |
