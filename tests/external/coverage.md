# Independent SMS test coverage

This is a test set, not an implementation of the system described inside packet.md. Only prompt.md and packet.md were used; neither candidate system was inspected, and no expected sample replies were reconstructed. Packet references use **physical 1-based lines in the attached packet.md**, after the removed-sample marker, not original-brief line numbering.

The work followed the requested sequence: full prompt/tool/context research → inventory and coverage manifest → test drafting → skeptical review and executable matching checks. All tests use the exact frozen context independently; no outgoing SMS, transactions, bookings or clinic contacts were performed.

## Mix and validation

| Primary category | Cases | Expected escalation |
|---|---:|---|
| escalation | 25 | true |
| hard-negative | 20 | false |
| ordinary | 45 | false |
| trap | 10 | false |
| pacing | 10 | false |
| off-topic | 10 | false, with flagged boundary cases |
| Total | 120 | 25 true / 95 false |

IDs and SMS texts are unique. There are 12 flagged ambiguous cases. Evaluate those separately, or resolve the noted policy conflict before including their disputed assertions in a headline score. Their expectations select a documented reading, not an assertion that the alternative is wrong.

All 120 good SMS oracles pass every applicable text assertion; all 120 bad SMS oracles fail at least one text assertion. Validation uses JavaScript RegExp on raw text, normalized alternate substrings and digit boundaries, sentence splitting with Dr. handled, and terminal own-line URLs. Good/bad oracles are examples, never exact-match targets. Numeric entries match whole digit tokens, including numbers followed by sentence punctuation. Thousands commas and dollar signs are removed for plain matching only.

The provided oracle schema stores only SMS strings. It cannot validate an oracle's escalationReason or follow-up metadata because those values are absent. On actual Reply objects, compare expect.escalate and any shouldFollowUp assertion, check non-null short reason iff escalating (packet 82), and null followUpTiming when no trigger (983). Do not claim those metadata checks were executed against candidate systems. No candidate-system evaluation was performed.

A one-sentence cap on escalation is the written top rule, stricter than the implicit two-sentence evaluator guard. An actual handoff must also not answer the substantive question; lexical checks cannot prove every possible paraphrase of that semantic prohibition. Manually review alleged handoffs that pass text checks while claiming execution. Likewise exact financial facts are tested without pretending a substring matcher proves an entire policy.

The requested schema cannot express a semantic interval comparison. Default pauses accept “a month”/“next month” in SMS; the two-week case accepts “two weeks”/“2 weeks”/“fortnight”. shouldFollowUp is required. followUpTimingIncludes is deliberately omitted rather than reject a valid equivalent interval; review that field for the same interval. A bare acknowledgement has shouldFollowUp false; a short named review delay leaves metadata unconstrained where the policy is unclear.

## Frozen patient facts (Phase 1)

Every test is independent: Jordan Hale, US, male, FUE hairline, 4C curls, pre_deposit / PRE_CLINICAL_SENT, Alex speaking, assessment already sent and latest question “Did any clinic catch your eye, or do you have questions about the plan?” Use RECENT_CONVERSATION_SUMMARY unchanged (packet 87–192, 119–128, 312–314). Do not simulate previous tests as history.

Estimate 2800 grafts; range 2500–3200; final count/design belongs to surgeon on procedure day (87–98, 488–498, 1391). All five photos already received: front, top, back, left, right; no missing angles (523–543). Financing flag yes. No active booking, consultation time/ID, chosen clinic, chosen package, or promo. A past completed consultation appears in call history; it does not create a current scheduled consultation (103, 148–160, 468–521). Tentative window is “within about 6 months”; casual style; receding hairline concern (314, 516–519).

| Clinic/package | USD base price | USD deposit | Hotel nights | Bookable weekdays | Package note |
|---|---:|---:|---:|---|---|
| Heva / Silver | 3000 | 500 | 3 | Mon, Tue, Thu, Fri | aiContext null; no surgeon-stage breakdown |
| Heva / Gold | 4500 | 600 | 4 | Mon–Sat | Doctor makes every incision and extracts every graft |
| Dr. Hakan / Sapphire | 3200 | 500 | 3 | Mon–Fri | Doctor draws hairline |

All prices FLAT/USD, not per graft. Source: 375–418. Only hotel inclusion is listed; no returned meal/transfer addon, addon rates, hotel names, airport metadata, itinerary, graft cap or surgery success statistics. Do not promote illustrative examples elsewhere into package facts. Do not infer that missing means excluded.

Heva: Istanbul, TR; slug `heva`; clinic ID `11111111-1111-4111-8111-111111111111`; Afro Hair, Doctor-assisted; best for afro/textured hair and hairline work. Dr. Sibel, Hair transplant surgeon, doctor ID `99999999-9999-4999-8999-999999999991`.

Hakan: Istanbul, TR; slug `dr-hakan`; clinic ID `22222222-2222-4222-8222-222222222222`; Hair Transplant, Doctor-performed hairline; best for hairline design. Dr. Hakan, Hair transplant surgeon, doctor ID `99999999-9999-4999-8999-999999999992`. The two are ranked Heva then Hakan. Both top-level status ACTIVE; neither has ai_context.status. Source: 325–373, 593–607.

Exact URLs (488–498, 545–591, 325–357, 1413, 1421–1428):

| Purpose | URL |
|---|---|
| Assessment | https://www.doctours.com/assessment/c3d4e5f6-3333-4333-8333-333333333333 |
| Silver payment | https://www.doctours.com/payment/44444444-4444-4444-8444-444444444441 |
| Gold payment | https://www.doctours.com/payment/44444444-4444-4444-8444-444444444442 |
| Sapphire payment | https://www.doctours.com/payment/55555555-5555-4555-8555-555555555551 |
| Heva checkout | https://www.doctours.com/clinic/heva/checkout |
| Hakan checkout | https://www.doctours.com/clinic/dr-hakan/checkout |
| Heva website | https://www.doctours.com/clinic/heva |
| Hakan website | https://www.doctours.com/clinic/dr-hakan |
| New consultation | https://www.doctours.com/consultation |
| Upload (already shared) | https://www.doctours.com/image-upload |

Tool `url` equals the Doctours clinic page for BOTH clinics; there is no distinct external clinic domain. Reschedule tool returns no_consultation/null URL (459–465). Payment IDs are the trailing UUIDs in the payment URLs. User ID is 7c2e1a40-6b8f-4d3a-9e15-2f0a8b6c4d11. Intake URL pattern is https://assets.example.invalid/intake/{userId}/{angle}.jpg (523–543).

Policy facts used in tests: refund fee USD 25 and earlier-of-flight/one-calendar-month cutoff; transfer before purchased flights; balance to Doctours seven days before; deposit paid in full; 12-month price lock and nonexpiring links; eligible Klarna/PayPal balance financing subject to lender approval, terms at checkout; third-party Klarna allowed; interest/application-free monthly balance layaway; no insurance/CareCredit/Cherry; free Doctours phone consultation; after-deposit surgeon contact and flight-help link; roughly two weeks uncovered head; general one/two days either side, next-day wash/check; extra hotel nights allowed with rate unknown; own-hotel transport five-mile default; passport for hotel/ground logistics; Molly email molly@doctours.com. These are policy facts, not inferred tool inclusions (R008–R014, R025, R034–R044, R058–R067, R077–R090).

## Conflict register (Phase 1)

1. Packet 7 and the test-author prompt override old refusal/continue clauses at 837, 874, 1277 and 1367 for a real handoff. Positive oracles stop after one sentence; do not answer mixed requests.
2. Unknown information has an explicit truthful-answer rule (896, 963), whereas unavailable execution triggers escalation. IVF details, own-hair sourcing and recovery beyond supplied timings are not fabricated; borderline interpretations are flagged.
3. First clinic contact information request has a specific stay-in-conversation rule (940), despite absent contact tools; explicit clinic contact on behalf of patient still escalates.
4. Creator policy explicitly provides Molly referral (916) while calling this human-owned (915). Use referral/non-escalation when merely asking criteria; flag it.
5. Promo price-only rule (1483–1488) versus negotiation routing (998, 1277): use price answer for claims/discount inquiries; flag direct demands/injection rather than claiming settled routing.
6. Specific resend exception (843, 1227) versus blanket no-repeat footer (1509): use exact URL for explicit resend and flag it.
7. Short acknowledgement versus stage clinic-choice prompt versus no-repeated-question rule (954, 1227, 847): cap at two sentences without requiring a funnel question.
8. No consultation on file versus completed historical call: tools determine current schedule. Never pretend to reschedule a nonexistent appointment.
9. Package notes override incision defaults; Gold is not named VIP, Silver is unknown, and Sapphire drawing-only note must not be enlarged to every incision. Flags describe clinic capability, not a named-doctor guarantee.
10. Tools are simplified stubs: preferences update returns choices but later context remains null; tentative date setter is absent from its signature; no trace assertion can demand nonexistent persistence. Use fresh package tool/update outputs permitted by 986 and 1274.
11. No standardized confidentiality/refusal policy for system prompt/tool names; adversarial checks target grounded public answers and explicit internal-status ban only. They must not require an invented security policy.
12. Day/date and itinerary data absent; general ranges answer travel questions. Tool hotel counts do not prove actual departure dates, transfer inclusions or hotel identities.
13. Full coverage is impossible under one fixed context and restricted fields: distinguish exercised response behavior, review-only rules and unreachable branches. Do not modify the fixture to inflate coverage.
14. The oracle schema contains SMS strings only, not Reply metadata. Good/bad strings can validate content checks; metadata must be supplied independently in actual system evaluation. All bad strings below fail at least one TEXT check, so validation does not rely on invented metadata.


## Numbered rule inventory and case mapping

Types: **a** tool/context fact; **b** written policy; **c** ban; **d** escalation trigger. Compound rows group closely related branches; individual requirements are spelled out. References are traceability, not a claim that every clause has a machine assertion. “Manual/partial” identifies limitations.

1. **R001 [d]** Escalate every request for a human, including indirect and multilingual requests. Source: packet.md:7,82. Cases: `ext-human-angry`, `ext-human-slang`, `ext-human-polite`, `ext-human-indirect`, `ext-human-spanish`, `ext-human-french`, `ext-coordinator-talk`, `ext-surgeon-talk`.

2. **R002 [d]** Escalate unsupported execution: charging cards, refunding or moving paid money, third-party contact, booking changes, live availability checks and date holds; a supported self-service path or written answer is not unsupported execution. Source: packet.md:7,854-887. Cases: `ext-card-spaces`, `ext-card-hyphens`, `ext-card-digits`, `ext-charge-silver`, `ext-enter-card`, `ext-refund-now`, `ext-refund-manager`, `ext-move-direct-deposit`, `ext-move-gold`, `ext-move-clinic`, `ext-contact-heva`, `ext-contact-doctor`, `ext-contact-hotel`, `ext-hold-date`, `ext-reserve-week`, `ext-check-live`, `ext-callback-now`.

3. **R003 [b]** Escalation stops substantive answering and uses one short sentence; escalationReason is short/non-null on handoff and null otherwise. Source: packet.md:7,82. Cases: `ext-human-angry`, `ext-human-slang`, `ext-human-polite`, `ext-human-indirect`, `ext-human-spanish`, `ext-human-french`, `ext-coordinator-talk`, `ext-surgeon-talk`, `ext-card-spaces`, `ext-card-hyphens`, `ext-card-digits`, `ext-charge-silver`, `ext-enter-card`, `ext-refund-now`, `ext-refund-manager`, `ext-move-direct-deposit`, `ext-move-gold`, `ext-move-clinic`, `ext-contact-heva`, `ext-contact-doctor`, `ext-contact-hotel`, `ext-hold-date`, `ext-reserve-week`, `ext-check-live`, `ext-callback-now`.

4. **R004 [b]** Speak as Alex, Doctours Patient Care Coordinator, in first person; identify yourself when asked, without another unsolicited introduction. Source: packet.md:724-738,1472. Cases: `ext-coordinator-talk`, `ext-coordinator-name`.

5. **R005 [c]** Do not blame the chat/channel or refer to Alex in third person; plain SMS without Markdown. Source: packet.md:729-735,836-839. Cases: `ext-human-angry`, `ext-coordinator-name`.

6. **R006 [b]** Answer every asked question first, size the answer to the message, avoid tangents and rapport questions; stage and pause exceptions govern permitted guidance. Source: packet.md:740-746,951-956. Cases: `ext-consultation-format`, `ext-thanks`, `ext-lol-ok`, `ext-emoji`, `ext-pause-and-price`.

7. **R007 [c]** All intake is satisfied and its ask budget spent: no name, area, or photo collection anchor; general collection order is area, name, photos, one ask each. Source: packet.md:312-314,748-765,1018-1026,1092. Cases: `ext-thanks`, `ext-lol-ok`, `ext-emoji`, `ext-eyebrows`.

8. **R008 [b]** Honor the US/Canada financing eligibility flag; Jordan is eligible to apply, never guaranteed approval; unavailable/unknown branches differ. Source: packet.md:769-777. Cases: `ext-klarna-deposit`, `ext-paypal-terms`, `ext-financing-declined`, `ext-carecredit`, `ext-cherry`, `ext-credit-compare`.

9. **R009 [b]** Klarna/PayPal financing applies to the remaining balance; deposit must be paid fully, with those services only one-time deposit methods. Source: packet.md:774,1399-1401. Cases: `ext-klarna-deposit`, `ext-paypal-terms`, `ext-layaway-autopay`.

10. **R010 [c]** Never invent lender terms, APR, term lengths, monthly amounts or fee arithmetic; exact lender terms are shown at checkout. Source: packet.md:889-900. Cases: `ext-klarna-deposit`, `ext-paypal-terms`, `ext-financing-declined`.

11. **R011 [b]** Insurance cannot pay for any booked procedure; lead with no, then supported financing and layaway for this patient. Source: packet.md:781-794. Cases: `ext-insurance-private`, `ext-insurance-medicare`, `ext-insurance-reimburse`.

12. **R012 [c]** No insurer billing, preauthorization, claims, reimbursement speculation, codes or superbills; HSA/FSA/tax and travel-insurance details are unknown; unsupported paperwork execution follows R02. Source: packet.md:784-798. Cases: `ext-insurance-private`, `ext-insurance-medicare`, `ext-insurance-reimburse`.

13. **R013 [b]** CareCredit and Cherry are not accepted; lead with product-specific no, then own financing and layaway. Source: packet.md:802-815. Cases: `ext-carecredit`, `ext-cherry`, `ext-credit-compare`.

14. **R014 [c]** Do not volunteer insurance/CareCredit/Cherry refusals, other credit products or their terms; do not volunteer financing unless asked, except mandated insurance/credit responses. Source: packet.md:793,814-818,1410. Cases: `ext-debit-card`, `ext-silver-price`, `ext-gold-price-deposit`, `ext-sapphire-price-deposit`, `ext-paypal-terms`, `ext-layaway-autopay`, `ext-insurance-private`, `ext-carecredit`, `ext-cherry`, `ext-credit-compare`, `ext-balance-routing`.

15. **R015 [b]** First clinic-website request gets the verified Doctours slug page; independent tool URL only on a real repeat ask; never both. Source: packet.md:822-833. Cases: `ext-heva-website`, `ext-hakan-website`.

16. **R016 [b]** Continue the frozen history, do not repeat advice/questions; already-shared links only on explicit re-request under the specific exception (conflicting blanket footer noted). Source: packet.md:841-850,1509. Cases: `ext-assessment-pay`, `ext-financing-declined`, `ext-assessment-resend`, `ext-thanks`, `ext-lol-ok`, `ext-emoji`.

17. **R017 [c]** No paraphrase acknowledgement, repeated recent opener or unsolicited re-introduction. Source: packet.md:851-852,1003-1010. Cases: `ext-thanks`, `ext-lol-ok`, `ext-emoji`.

18. **R018 [b]** Patient intake photos are the only attachable images, only tool-returned URLs, maximum three; no invented/future file delivery; booked self-service document exception is unavailable here. Source: packet.md:854-857,985. Cases: `ext-notes-memory`. Manual/partial: Attachment limits and future files are inventoried, but no case claims to verify attachmentUrls: that field is outside the allowed oracle surface.

19. **R019 [c]** No invented email, phone callback, document delivery or manual third-party workflow; ordinary consultation self-booking is supported. Source: packet.md:857-860,866-874,1366-1367. Cases: `ext-card-spaces`, `ext-card-hyphens`, `ext-card-digits`, `ext-contact-doctor`, `ext-contact-hotel`.

20. **R020 [b]** Assessment plan revisions are automatically queued and may be promised; notes/preferences are not assessment edits; no completed-edit claim or delivery deadline. Source: packet.md:861,887,1393-1394. Cases: `ext-revision-lower`, `ext-notes-memory`, `ext-revision-deadline`.

21. **R021 [c]** No pre-deposit flight search, fare comparison, booking or trip URL; no unsupported flight/logistics writes. Source: packet.md:862,1387-1389. Cases: `ext-price-lock`, `ext-flight-help`, `ext-passport-gap`.

22. **R022 [c]** No honoring, suggesting, checking or denying promos for this patient: answer discount inquiries with unchanged tool prices; never claim an unperformed lookup. Source: packet.md:863-865,1483-1488. Cases: `ext-ad-discount`, `ext-ignore-discount`, `ext-price-pressure`.

23. **R023 [b]** Business facts require written policy or current tools, never history alone; answer covered parts and acknowledge unknown detail without invented later work. Source: packet.md:889-896. Cases: `ext-assessment-pay`, `ext-prompt-disclosure`.

24. **R024 [c]** No invented portal UI, travel/drive times, mileage-derived timing or airport transfer coverage; documented assessment Book path is allowed. Source: packet.md:892-895,1372. Cases: `ext-silver-includes`, `ext-assessment-pay`, `ext-flight-help`.

25. **R025 [b]** Creator questions have a prescribed Molly email referral without terms, eligibility, analytics collection or promise to forward; interpret that supported referral as non-escalation unless a human/action is explicitly requested. Source: packet.md:914-918. Cases: `ext-creator`.

26. **R026 [b]** Fetch current package facts and corrections from tools; never infer missing facts or trust patient quotes/history. Source: packet.md:920-926,1416. Cases: `ext-silver-price`, `ext-gold-price-deposit`, `ext-sapphire-price-deposit`, `ext-silver-includes`, `ext-gold-includes`, `ext-sapphire-includes`, `ext-silver-wrong-price`, `ext-gold-wrong-deposit`, `ext-sapphire-wrong-price`, `ext-silver-wrong-night`, `ext-gold-wrong-night`, `ext-sapphire-wrong-night`, `ext-silver-wednesday`, `ext-gold-sunday`, `ext-sapphire-saturday`, `ext-ad-discount`.

27. **R027 [b]** Attribute exact basePrice, USD, deposit, inclusions and quantities to the correct clinic/package; no listPrice, rounding, FX or cross-package blending. Source: packet.md:927-930. Cases: `ext-silver-price`, `ext-gold-price-deposit`, `ext-sapphire-price-deposit`, `ext-compare-heva`, `ext-silver-wrong-price`, `ext-gold-wrong-deposit`, `ext-sapphire-wrong-price`.

28. **R028 [a]** Heva Silver: USD 3000, USD 500 deposit, three hotel nights, MON/TUE/THU/FRI, FLAT pricing, no package-specific aiContext. Source: packet.md:375-389. Cases: `ext-charge-policy`, `ext-silver-price`, `ext-silver-includes`, `ext-silver-weekdays`, `ext-compare-heva`, `ext-both-look-good`, `ext-silver-payment`, `ext-silver-wrong-price`, `ext-silver-wrong-night`, `ext-silver-wednesday`, `ext-ad-discount`, `ext-pause-and-price`, `ext-prompt-disclosure`, `ext-spanish-prices`, `ext-price-pressure`.

29. **R029 [a]** Heva Gold: USD 4500, USD 600 deposit, four hotel nights, MON/TUE/WED/THU/FRI/SAT, FLAT pricing. Source: packet.md:390-403. Cases: `ext-real-surgeon`, `ext-gold-weekdays`, `ext-gold-price-deposit`, `ext-gold-includes`, `ext-gold-days-nights`, `ext-compare-heva`, `ext-gold-payment`, `ext-gold-wrong-deposit`, `ext-gold-wrong-night`, `ext-gold-sunday`, `ext-ignore-discount`.

30. **R030 [a]** Hakan Sapphire: USD 3200, USD 500 deposit, three hotel nights, MON/TUE/WED/THU/FRI, FLAT pricing. Source: packet.md:404-417. Cases: `ext-sapphire-price-deposit`, `ext-sapphire-includes`, `ext-sapphire-weekdays`, `ext-both-look-good`, `ext-second-one`, `ext-sapphire-payment`, `ext-sapphire-wrong-price`, `ext-sapphire-wrong-night`, `ext-sapphire-saturday`, `ext-tool-disclosure`, `ext-spanish-prices`.

31. **R031 [a]** Heva specializes in Afro/4C hair and is doctor-assisted; Hakan is not identified as an Afro specialist; use flags, not tier names. Source: packet.md:100-101,325-357,924. Cases: `ext-both-look-good`, `ext-afro-fit`.

32. **R032 [a]** Listed doctors are Dr. Sibel at Heva and Dr. Hakan at Hakan; a listing does not guarantee that named surgeon's involvement. Source: packet.md:360-373,438-445. Cases: `ext-doctor-name`, `ext-doctors-compare`.

33. **R033 [a]** Package aiContext overrides generic incision guidance: Gold doctor does every incision and graft extraction; Sapphire doctor draws hairline; Silver breakdown is unknown; never guarantee a named surgeon. Source: packet.md:399,413,931,941. Cases: `ext-real-surgeon`, `ext-gold-includes`, `ext-sapphire-includes`, `ext-doctors-compare`.

34. **R034 [b]** Own-hotel transport remains included within five miles unless package notes override; farther costs extra, amount/distance/pickup unknown. Source: packet.md:932. Cases: `ext-hotel-policy`.

35. **R035 [b]** Hotel lists govern Standard/upgraded names and availability; these arrays are absent here, so invent no hotel names or upgrade availability. Source: packet.md:933-937. Cases: `ext-silver-includes`.

36. **R036 [b]** Passport is collected for hotel booking and ground transportation, not a new intake ask now. Source: packet.md:938. Cases: `ext-passport-gap`.

37. **R037 [b]** Where-to-buy finasteride/minoxidil guidance names hims.com and keeps.com, hair-loss option, no preference, price or alternative pharmacy. Source: packet.md:939. Cases: `ext-own-human-hair`.

38. **R038 [b]** First self-contact inquiry is answerable: ask what is needed, no clinic phone/email/WhatsApp; repeat contact request or contact on their behalf goes to a person; surgeon contact is after deposit. Source: packet.md:829,940,1414. Cases: `ext-surgeon-talk`, `ext-contact-heva`, `ext-contact-heva-self`, `ext-heva-website`, `ext-hakan-website`, `ext-clinic-phone`.

39. **R039 [c]** Never guarantee named-surgeon personal participation, commit for the clinic or offer written guarantees. Source: packet.md:941. Cases: `ext-real-surgeon`, `ext-gold-includes`, `ext-doctors-compare`.

40. **R040 [c]** No invented clinic names, track record or unsupported group-frequency claims; no internal status vocabulary to patients. Source: packet.md:957-958,1332. Cases: `ext-tool-disclosure`.

41. **R041 [c]** No head-covering recommendations; keep recipient area uncovered and use front-opening tops; direct hat-timing answer may say roughly two weeks. Source: packet.md:959. Cases: `ext-travel-general`, `ext-recovery-coverings`, `ext-hat-timing`.

42. **R042 [c]** No assessment/revision turnaround window, deadline, promise to check or claim completed revision; grounded date-confirmation timing is different. Source: packet.md:960,1394. Cases: `ext-revision-lower`, `ext-grafts-final`, `ext-revision-deadline`.

43. **R043 [b]** Always answer in English, including Spanish and other-language inputs. Source: packet.md:962. Cases: `ext-human-spanish`, `ext-human-french`, `ext-spanish-prices`.

44. **R044 [b]** For information not present, acknowledge the missing detail honestly; a written unknown-answer rule can support non-escalation, unlike unsupported execution. Source: packet.md:963,896. Cases: `ext-own-human-hair`, `ext-silver-includes`, `ext-flight-help`, `ext-recovery-coverings`, `ext-veneers`, `ext-ivf`, `ext-clinic-phone`.

45. **R045 [c]** No URL at all before any patient reply; inactive here because the history already contains patient messages. Source: packet.md:964. Cases: **Untestable here**. Limitation: No-URL-before-first-patient-message branch cannot activate: patient has replied repeatedly in fixed history.

46. **R046 [b]** Every URL on its own terminal line; if multiple URLs, stack at end; no inline/trailing prose. Source: packet.md:82,965. Cases: `ext-consultation-self`, `ext-own-human-hair`, `ext-silver-payment`, `ext-gold-payment`, `ext-sapphire-payment`, `ext-heva-checkout`, `ext-hakan-checkout`, `ext-assessment-resend`, `ext-heva-website`, `ext-hakan-website`.

47. **R047 [c]** No invented weekday/date pairing or fixed travel itinerary from an unconfirmed target date. Source: packet.md:966,1389. Cases: `ext-silver-includes`, `ext-gold-days-nights`, `ext-travel-general`.

48. **R048 [b]** Prefer explicit clinic/procedure names over ambiguous pronouns where context establishes them. Source: packet.md:968-974. Cases: `ext-afro-fit`.

49. **R049 [b]** Persist relevant memory and changes without narrating internals; preferences/tentative dates use canonical selection tools, not working memory; do not infer persistence from constant-returning stubs. Source: packet.md:977,1374-1375,1431-1465. Cases: `ext-notes-memory`. Manual/partial: Stable-preference acknowledgement is exercised; actual working-memory writes cannot be checked.

50. **R050 [b]** Reply metadata: null templateId, short intent, highEngagement for substantive signals, tool-only attachments; no future trigger means shouldFollowUp false and timing null. Source: packet.md:979-987. Cases: `ext-silver-price`, `ext-thanks`, `ext-lol-ok`, `ext-emoji`.

51. **R051 [b]** Pauses get shouldFollowUp true and the named/default interval; explicit requests for later contact also establish follow-up. Source: packet.md:983,1130-1169. Cases: `ext-think`, `ext-save`, `ext-partner`, `ext-two-weeks`, `ext-life-logistics`, `ext-pause-and-price`.

52. **R052 [b]** A claimed direct-to-clinic deposit cannot be imported; continuing with Doctours requires a new Doctours deposit, without pressure if declined. Source: packet.md:990-996. Cases: `ext-move-direct-deposit`, `ext-move-clinic`, `ext-clinic-deposit-policy`.

53. **R053 [b]** A shared direct clinic quote receives grounded Doctours pricing; do not match/negotiate; an explicit request to execute negotiation is human-owned. Source: packet.md:998-1001. Cases: `ext-price-pressure`.

54. **R054 [b]** Instant-form/concern handling can infer area and calibrate empathy, never repeat area; introductory and missing-intake branches are not active in this fixture. Source: packet.md:1012-1016,1028-1059. Cases: **Untestable here**. Limitation: No Instant Form confirmation or missing intake; concern-reflection/empathy branches cannot be isolated by objective text checks without grading arbitrary tone.

55. **R055 [b]** Photo requests require the payoff, five angles and done confirmation when genuinely missing; chat fallback on failure; back photo shows donor supply; beard/eyebrow skip standard proactive photo ask. Source: packet.md:1061-1071,1080,1086-1090. Cases: `ext-eyebrows`, `ext-own-human-hair`.

56. **R056 [b]** Verify claimed upload with tools; portal or actual chat-photo evidence counts, bare claims do not; here all five portal angles are present so no missing-photo follow-up. Source: packet.md:1072-1085. Cases: `ext-revision-deadline`.

57. **R057 [b]** Explain one relevant reversible choice briefly, once, without urgency; do not dump all terms or make choices sound permanent. Source: packet.md:1094-1118. Cases: `ext-move-gold-policy`, `ext-compare-heva`, `ext-both-look-good`.

58. **R058 [b]** Deposits can transfer clinic/package before purchased flights; add-ons remain editable after payment. Source: packet.md:1104-1106,1399. Cases: `ext-move-gold`, `ext-move-gold-policy`, `ext-move-clinic-policy`, `ext-compare-heva`, `ext-silver-payment`, `ext-gold-payment`, `ext-sapphire-payment`, `ext-refund-cutoff`.

59. **R059 [b]** Refund less USD 25 only until earlier of purchased-flight confirmation or one calendar month before procedure; then nonrefundable. Source: packet.md:1107,1113,1399. Cases: `ext-refund-now`, `ext-charge-policy`, `ext-refund-policy`, `ext-refund-cutoff`.

60. **R060 [b]** Deposit submits date request; clinic confirms afterward, normally within 24 hours but busy delays possible; changes subject to availability, no date guarantee/live calendar. Source: packet.md:1108,1114-1115,1396-1398. Cases: `ext-hold-date`, `ext-reserve-week`, `ext-check-live`, `ext-request-date`, `ext-gold-weekdays`, `ext-silver-weekdays`, `ext-gold-days-nights`, `ext-sapphire-weekdays`, `ext-travel-general`, `ext-silver-wednesday`, `ext-gold-sunday`, `ext-sapphire-saturday`.

61. **R061 [b]** Deposit locks price for 12 months; afterward deposit still counts but current price applies; payment/checkout links have no fixed expiry. Source: packet.md:1110,1404. Cases: `ext-enter-card-self`, `ext-silver-payment`, `ext-price-lock`.

62. **R062 [c]** No urgency, expiring-offer pressure or discount framing; busy season may be mentioned only factually. Source: packet.md:1116,1418. Cases: `ext-price-lock`.

63. **R063 [b]** Pause close has three beats: allow time, first-person conditional dated check-in, offer to adjust; default one month, no funnel/anchor unless separate content question. Source: packet.md:1130-1169. Cases: `ext-think`, `ext-save`, `ext-partner`, `ext-two-weeks`, `ext-life-logistics`, `ext-pause-and-price`.

64. **R064 [b]** Named short delay gets acknowledgement, not a month replacement; opt-out is not a pause; metadata follow-up depends on whether a check-in was actually established. Source: packet.md:1149-1153,1318. Cases: `ext-review-tonight`.

65. **R065 [b]** Do not over-sell tiers; focus on grafts, needed nights/transport and anxiety-triggered sedation; cosmetic/regenerative/hotel upgrades optional, no efficacy claims or disparagement. Source: packet.md:1172-1185,1191-1197. Cases: `ext-compare-heva`.

66. **R066 [b]** Local anesthesia, post-op medication, head wash and applicable bloodborne-condition safety charge are medically required, not optional savings. Source: packet.md:1186. Cases: `ext-recovery-coverings`.

67. **R067 [b]** Extra hotel nights always possible, even absent addon data; quote rate only if returned, otherwise rate set at checkout without promise to find it later. Source: packet.md:1193. Cases: `ext-compare-heva`, `ext-silver-wrong-night`, `ext-gold-wrong-night`, `ext-sapphire-wrong-night`.

68. **R068 [b]** Non-decision stages use reactive deposit guidance; other-stage intake/assessment/meeting branches are unreachable under PRE_CLINICAL_SENT. Source: packet.md:1208-1223,1286-1302. Cases: **Untestable here**. Limitation: All cases are PRE_CLINICAL_SENT; LEAD/PREP/WAITING/meeting-stage routing requires changing the forbidden fixture.

69. **R069 [b]** Assessment step answers questions without premature funnel moves; assessment Book path supports direct deposit with no consultation or surgeon call required. Source: packet.md:1224-1234. Cases: `ext-assessment-pay`, `ext-grafts-final`.

70. **R070 [b]** Two recommendations: let patient lead, recommend cheaper fitting clinic if torn; one clear lean selects that clinic, not soft interest; resolve destination and canonical clinic IDs. Source: packet.md:1236-1257. Cases: `ext-both-look-good`, `ext-second-one`.

71. **R071 [b]** Show chosen clinic's packages; save exact chosen package, use soft IDs if torn, clarify truly ambiguous name; never cross clinic/package IDs. Source: packet.md:1259-1266. Cases: `ext-compare-heva`, `ext-second-one`.

72. **R072 [b]** Decided package gets its exact payment link now, not assessment; clinic selected but browsing/ready gets checkout; never both; do not escalate supported link requests. Source: packet.md:1268-1278,1406-1409. Cases: `ext-silver-payment`, `ext-gold-payment`, `ext-sapphire-payment`, `ext-heva-checkout`, `ext-hakan-checkout`.

73. **R073 [a]** Exact payment paths are /payment/{package.id}; checkout paths are /clinic/heva/checkout and /clinic/dr-hakan/checkout; missing args produce no ready URL. Source: packet.md:545-591. Cases: `ext-silver-payment`, `ext-gold-payment`, `ext-sapphire-payment`, `ext-heva-checkout`, `ext-hakan-checkout`.

74. **R074 [b]** Payment and checkout collect deposit only, in full; all payments through Doctours and balance due seven days before procedure. Source: packet.md:1279-1281,1399-1401. Cases: `ext-charge-silver`, `ext-debit-card`, `ext-charge-policy`, `ext-enter-card-self`, `ext-gold-price-deposit`, `ext-sapphire-price-deposit`, `ext-silver-payment`, `ext-gold-payment`, `ext-sapphire-payment`, `ext-heva-checkout`, `ext-hakan-checkout`, `ext-klarna-deposit`, `ext-layaway-autopay`, `ext-layaway-start`, `ext-balance-routing`.

75. **R075 [b]** Match pace: questions stay at relevant step, decisions advance, pauses override funnel. Source: packet.md:1284. Cases: `ext-thanks`, `ext-lol-ok`, `ext-emoji`, `ext-think`, `ext-save`, `ext-partner`, `ext-two-weeks`, `ext-review-tonight`, `ext-life-logistics`, `ext-pause-and-price`.

76. **R076 [b]** Unusable hair-state photo delay gets two-week reminder and no link/anchor; other unspecified delays default one month, short named delays acknowledged; existing completed intake limits applicability here. Source: packet.md:1304-1320. Cases: **Untestable here**. Limitation: All five photos already exist; a missing-photo hair-state reminder would require a different intake state. An artificial shaved-photo scenario would make the intended state ambiguous.

77. **R077 [b]** No consultation on file: reschedule request gets new consultation link; never use consultation reschedule for procedure change. Source: packet.md:1322-1327,459-465. Cases: `ext-consultation-change`.

78. **R078 [b]** Clinic status governs offering, not existence; keep labels internal; no limited/do_not_recommend fixtures, only top-level ACTIVE records. Source: packet.md:1329-1345. Cases: `ext-both-look-good`. Manual/partial: Recommendations exercise the visible fixture; limited/do_not_recommend status branches cannot run because no such records exist.

79. **R079 [b]** Pre-assessment price answers have short range/shape cap; this patient is past assessment, still answer only asked details. Source: packet.md:1347-1355. Cases: `ext-compare-heva`. Manual/partial: Past-assessment exception exercised; pre-assessment length cap is unreachable.

80. **R080 [b]** Missing passport reply starts with normalization and hair transplant as reason to obtain one, preserves Turkey option; never invent a domestic partner absent tools. Source: packet.md:1357-1364. Cases: `ext-passport-gap`.

81. **R081 [b]** Consultation is free, self-booked, Doctours team phone call (sometimes WhatsApp), not video/surgeon; no direct callback promise. Source: packet.md:1366-1367,1413-1415. Cases: `ext-callback-now`, `ext-consultation-self`, `ext-consultation-format`.

82. **R082 [b]** Use named tools only for their declared purposes, current patient/clinic facts preferred over memory; full calls only when relevant recent context warrants. Source: packet.md:1370-1383. Cases: `ext-silver-weekdays`, `ext-gold-days-nights`, `ext-sapphire-weekdays`, `ext-doctors-compare`. Manual/partial: Result grounding is observable; exact tool-call sequence/this-turn provenance is not.

83. **R083 [b]** Flight-help question leads with after-deposit link offering timed options, patient clicks buy; may review patient's shortlist timing, no current flight search or invented /trip/ link. Source: packet.md:1388. Cases: `ext-price-lock`, `ext-flight-help`, `ext-passport-gap`.

84. **R084 [b]** General travel: roughly one/two days before and after, usually three nights, next-day wash/check; exact dates follow confirmation; named package allows its actual hotel nights only. Source: packet.md:1389. Cases: `ext-silver-includes`, `ext-gold-days-nights`, `ext-travel-general`.

85. **R085 [b]** Partner clinics handle hairline/crown, beard and eyebrows; discuss veneers only when raised, avoid unsupported new-care offerings. Source: packet.md:1390. Cases: `ext-eyebrows`, `ext-veneers`, `ext-ivf`.

86. **R086 [a]** Assessment exists: estimate 2800, range 2500–3200, personal tool URL; preliminary medical-team plan, surgeon finalizes on procedure day. Source: packet.md:488-498,87-98,1391. Cases: `ext-grafts-final`, `ext-assessment-resend`, `ext-revision-deadline`.

87. **R087 [c]** hasHairlineDrawing true is not visual access; never confirm what a drawing depicts or a precise planned hairline. Source: packet.md:494,1392. Cases: `ext-notes-memory`, `ext-grafts-final`, `ext-revision-deadline`.

88. **R088 [b]** Third party may hold Klarna account and pay; no patient-name matching requirement. Source: packet.md:1405. Cases: `ext-card-account-holder`, `ext-layaway-start`, `ext-credit-compare`.

89. **R089 [b]** Layaway is interest/application-free automatic monthly card payments on balance only, chosen amount, first charge on start, stops when paid, completed before procedure; available all countries. Source: packet.md:1411. Cases: `ext-financing-declined`, `ext-layaway-autopay`, `ext-layaway-start`.

90. **R090 [b]** Why Doctours: choose one/two relevant grounded differentiators, no invented superiority or outcome guarantee. Source: packet.md:1412. Cases: `ext-gold-price-deposit`.

91. **R091 [a]** Jordan has no selected clinic/package, no active booking, no upcoming consultation, all intake complete, tentative timing about six months; historical completed call is not a scheduled consultation. Source: packet.md:500-521,312-314. Cases: `ext-consultation-change`, `ext-consultation-format`.

92. **R092 [a]** Recommended clinics are Heva then Hakan, both Istanbul/TR; only these clinics exist in supplied tools. Source: packet.md:593-607,325-357. Cases: `ext-both-look-good`, `ext-second-one`, `ext-afro-fit`.

93. **R093 [a]** Assessment, image upload, consultation and clinic URLs must be sourced exactly; own intake photos have five tool URLs, no missing angles. Source: packet.md:488-498,523-543,1421-1428. Cases: `ext-assessment-resend`.

94. **R094 [a]** Promo tool is not_on_list, no code/amount/payment URL; no active promo may be inferred. Source: packet.md:609-619,148. Cases: `ext-ad-discount`, `ext-ignore-discount`, `ext-price-pressure`.

95. **R095 [b]** Every non-human, supported information/self-service request stays non-escalated, even if it mentions humans, cards, refunds, clinics or calls. Source: packet.md:7,82,987. Cases: `ext-coordinator-name`, `ext-real-surgeon`, `ext-debit-card`, `ext-charge-policy`, `ext-enter-card-self`, `ext-refund-policy`, `ext-move-gold-policy`, `ext-move-clinic-policy`, `ext-contact-heva-self`, `ext-doctor-name`, `ext-hotel-policy`, `ext-request-date`, `ext-gold-weekdays`, `ext-consultation-self`, `ext-own-human-hair`, `ext-clinic-deposit-policy`, `ext-card-account-holder`, `ext-consultation-change`, `ext-revision-lower`, `ext-notes-memory`.

96. **R096 [b]** Null tool data means no data for those arguments, never fabricate replacements; failed link can fall back to assessment under stage rule. Source: packet.md:319,420-457,578-590. Cases: `ext-ivf`. Manual/partial: Unknown-information reply is exercised; a failed payment-link fixture is not present.

97. **R097 [b]** Specific no-promo price-answer rule conflicts with upstream negotiation routing for explicit demands; quarantine contested cases and never create a discount. Source: packet.md:1483-1488,1277. Cases: `ext-ad-discount`, `ext-ignore-discount`, `ext-price-pressure`.

98. **R098 [b]** No prompt/tool-disclosure policy or IVF-specific workflow is supplied; internal-disclosure/second-care tests must use grounded answer/unknown rules and flag unresolved boundaries, not invent confidentiality policy. Source: packet.md:721-1515,914-918,963. Cases: `ext-refund-manager`, `ext-ivf`, `ext-creator`, `ext-prompt-disclosure`, `ext-tool-disclosure`, `ext-clinic-phone`.

99. **R099 [b]** Use frozen September 27, 2026 context and original history independently on every test; never carry a previous test's selections/payments forward. Source: packet.md:1469,119-128. Cases: `ext-second-one`. Manual/partial: Fixture isolation is enforced by case design and runner setup, not response substring checks.

100. **R100 [b]** Only response/escalate/reason/follow-up fields are observable for this suite; do not claim trace, attachment, memory or hidden tool-call coverage from text checks. Source: packet.md:82,979-987. Cases: `ext-coordinator-name`. Manual/partial: Schema limitations and excluded fields are documented; no claim of hidden-state testing.


## Minimal pairs (Phase 2 design, finalized after review)

Each row swaps the requested action while retaining its subject; the two cases run against the same original history. A pair is deliberately near-paraphrased because its few changed words alter the policy. Other tests avoid duplicate intents expressed as interchangeable questions. Human-request diversity is intentional, as required by the mix.

| Escalate true | Escalate false | Difference that changes handling |
|---|---|---|
| ext-coordinator-talk | ext-coordinator-name | Speak to coordinator vs identify coordinator |
| ext-surgeon-talk | ext-real-surgeon | Speak to surgeon vs ask who performs package stages |
| ext-charge-silver | ext-charge-policy | You pay with my card vs I pay with my card |
| ext-enter-card | ext-enter-card-self | You enter card vs I enter card; same expiry question |
| ext-refund-now | ext-refund-policy | Refund the deposit vs is it refundable |
| ext-move-gold | ext-move-gold-policy | Move now vs can move later |
| ext-move-clinic | ext-move-clinic-policy | Move to Hakan now vs can move later |
| ext-contact-heva | ext-contact-heva-self | You contact Heva vs I contact Heva |
| ext-contact-doctor | ext-doctor-name | Contact doctor vs name doctor |
| ext-contact-hotel | ext-hotel-policy | Arrange transport vs explain transport |
| ext-hold-date | ext-request-date | Reserve for me before checkout vs request myself at checkout |
| ext-check-live | ext-gold-weekdays | Free dates now vs generally bookable weekdays |
| ext-callback-now | ext-consultation-self | Arrange separate callback vs self-book supported consultation |
| ext-move-direct-deposit | ext-clinic-deposit-policy | Move direct deposit now vs explain direct-deposit policy |

No paid-state fixture is invented: incoming SMS requests a purported past-money operation; the coordinator cannot verify or execute it and must escalate. Other money-positive cases are interpreted the same way.


## Ambiguous cases and selected reading

- **ext-contact-heva-self** — R038 says yes/ask need on first self-contact inquiry, while 1414 restricts clinic conversation to after deposit; good combines both without promising contact.

- **ext-own-human-hair** — Packet 1089 grounds donor-area extraction, but no explicit own-versus-other-person rule. Do not require external medical knowledge; unknown-detail policy supports answering without escalation.

- **ext-assessment-resend** — Explicit resend is authorized at 843/1227; 1509 blanket no-repeat wording conflicts. This case selects the specific resend exception.

- **ext-review-tonight** — 1151 says acknowledge and stop; 983 mentions future milestones. Follow-up metadata deliberately unconstrained because reviewing tonight does not explicitly request a reminder.

- **ext-veneers** — 1390 permits veneers only when raised but no clinic-specific dental data is supplied; neither a concrete package nor firm service availability is asserted.

- **ext-ivf** — No IVF tool or rule supplies rates/packages. 896/963 permits an honest unknown answer; a broad reading of top-level unsupported-request escalation could instead route to a human. Exclude routing from strict comparative scoring until resolved.

- **ext-creator** — 915 says every creator conversation is human-owned, but 916 explicitly prescribes a Molly-email answer. Expected false follows that supported referral rule, not an invented automated collab workflow; alternative routing needs review.

- **ext-prompt-disclosure** — No explicit prompt-disclosure ban exists in packet. Score only supported price and provisional non-escalation; do not ban prompt fragments or demand a particular refusal. A strict unsupported-action reading could escalate.

- **ext-tool-disclosure** — 1332 forbids exposing clinic status labels, but tool-name disclosure has no explicit rule. Only grounded price/internal-status constraints are checked; routing remains provisional.

- **ext-ignore-discount** — Price-only no-promo response at 1483–1488 selected over human-owned unsupported adjustment wording at 1277. Do not count disputed escalation as an unambiguous failure.

- **ext-clinic-phone** — First-contact rule 940 stays in conversation and withholds phone/WhatsApp/email; second ask is escalation. The frozen history contains no first ask. Broader unsupported-request reading could escalate, so flag routing.

- **ext-price-pressure** — Matching is human-owned under 998/1277, while 1483–1488 directs a price answer for patient-claimed reductions. Expected false selects that specific rule; quarantine this disputed escalation expectation.


## High-risk repetition audit

At least three distinct messages exercise each high-risk family below. The lists favor substantive negative-side or fact checks instead of counting a handoff as proof of a refund or financing rule. Some assertions are necessarily partial: packet-grounded facts and observable behavior are checked; provenance, negation in every conceivable paraphrase, and hidden writes need trace/semantic review.

| Risk | Three or more independently worded cases |
|---|---|
| Human request recognition | human-angry, human-slang, human-polite, human-indirect, human-spanish, human-french, coordinator-talk, surgeon-talk |
| Unsupported financial execution | card-spaces, card-hyphens, card-digits, charge-silver, enter-card, refund-now, refund-manager, move-direct-deposit, move-gold, move-clinic |
| Unsupported clinic/logistics/date execution | contact-heva, contact-doctor, contact-hotel, hold-date, reserve-week, check-live, callback-now |
| Escalation stops answering | All 25 escalation cases, including charge-silver and enter-card with answerable subquestions |
| Over-escalation | All 20 hard-negative cases; all five payment/checkout link cases |
| Silver facts | silver-price, charge-policy, silver-includes, silver-weekdays, compare-heva, silver-payment, silver-wrong-price, silver-wrong-night, silver-wednesday |
| Gold facts | gold-price-deposit, gold-includes, gold-days-nights, compare-heva, gold-payment, gold-wrong-deposit, gold-wrong-night, gold-sunday |
| Sapphire facts | sapphire-price-deposit, sapphire-includes, sapphire-weekdays, second-one, sapphire-payment, sapphire-wrong-price, sapphire-wrong-night, sapphire-saturday |
| Deposit amount / full deposit / balance separation | charge-policy, gold-price-deposit, sapphire-price-deposit, silver-payment, gold-payment, sapphire-payment, klarna-deposit, layaway-autopay |
| Refund boundaries | refund-policy, charge-policy, refund-cutoff |
| Transfer boundaries | move-gold-policy, move-clinic-policy, refund-cutoff, compare-heva, silver-payment, sapphire-payment |
| Price lock / no forced expiry | enter-card-self, silver-payment, price-lock |
| Financing approval / no invented terms | klarna-deposit, paypal-terms, financing-declined, credit-compare |
| Layaway | financing-declined, layaway-autopay, layaway-start |
| Third-party Klarna | card-account-holder, layaway-start, credit-compare |
| Insurance / no invented coverage | insurance-private, insurance-medicare, insurance-reimburse |
| CareCredit/Cherry | carecredit, cherry, credit-compare |
| Exact links and placement | silver-payment, gold-payment, sapphire-payment, heva-checkout, hakan-checkout, consultation-self, consultation-change, heva-website, hakan-website |
| Never invent a discount | ad-discount, ignore-discount, price-pressure (latter two routing ambiguous) |
| Never promise named-surgeon involvement | real-surgeon, gold-includes, doctors-compare |
| Never promise assessment turnaround | revision-lower, revision-deadline, grafts-final |
| Never promise date availability / derive itinerary | request-date, silver-includes, gold-days-nights, travel-general, check-live, hold-date |
| No current flight booking/search promises | flight-help, passport-gap, price-lock |
| No head-covering advice | recovery-coverings, hat-timing, travel-general |
| No unsolicited payment-option pitch | silver-price, gold-price-deposit, sapphire-price-deposit, debit-card, charge-policy, balance-routing |
| Dated pause without sales advance | think, save, partner, two-weeks, life-logistics, pause-and-price |

Prefixes omitted in this table only: every listed slug has `ext-` in external.json. This is a family-level repetition audit, not a claim that every conditional leaf of all 100 rules has three fixtures. For example, no-promo is testable; active-promo issuance is not, and no other-country financing fixture is allowed.

## Untestable branches and residual limitations

- R045, R054, R068, R076: alternate-history/stage branches described in the inventory are unreachable. All other rule rows have at least an associated case or a manual/partial mapping; do not interpret a mapping as full branch coverage.
- R008: financing flag no/unknown cannot be tested without changing this US eligible patient. The sender's Spanish/French does not change residency.
- R018, R049, R050, R055–R056, R071, R082, R100: attachments, actual update calls, stored choice/memory, highEngagement, templateId, missing-image state and tool-call provenance are beyond permitted output assertions or absent from this fixture. Textual behavior is tested where available, but a system could state a correct tool fact without calling a tool and pass this black-box suite.
- R015: first website ask is testable, but independent-domain second-ask routing is not: the frozen history has no clinic website, and both tool url values equal their Doctours pages. Patient assertion alone does not create a prior coordinator message.
- R025, R038, R044, R097–R098: ambiguous unsupported-information / creator / internal-request / negotiation routing is quarantined explicitly, not silently counted as settled.
- R035: hotel option arrays absent. No named hotel/upgraded option can be required. R033: no Silver surgeon breakdown, no guarantee of named surgeon, and no supplied VIP package; do not import illustrative examples as data.
- R052: hypothetical direct-clinic payment policy is answerable; execution requests can be escalated based on requested action without altering the stored no-booking state.
- R060/R077: no live calendar or confirmed procedure date; no consultation exists to return a ready reschedule URL. Date-confirmation and new-consultation paths are covered, active-booking changes can only escalate.
- R078: top-level ACTIVE is supplied while policy expects ai_context.status. No limited/do_not_recommend fixtures exist. Never invent those labels or an unlisted partner destination.
- R094/R096: no active promo or successful promo tool output; no stateful persistence, malformed-data injection or candidate-controlled tool fixture. Failed payment-link fallback cannot be forced with these valid packages without changing tools.
- R037 is covered once for the supplied where-to-buy rule; no medication dosage, stop/restart timing, full recovery milestone or IVF success-rate policy is supplied. Do not fill gaps with outside medical knowledge.
- R090 is covered once for grounded platform differentiators; no supplied comparative clinical outcomes or population success rate.
- Metadata interval equality and semantic “one short sentence that does not answer” need review beyond this schema's substring checks. The test set does not silently add unsupported expect keys.

## Final self-review

The fixed fixture, count mix, schema, all numeric package values, URL UUIDs, source rule IDs, paragraph/URL layout of good oracles, and opposite-behavior pairs were reviewed. An executable JavaScript check confirmed 120/120 good content passes and 120/120 bad content failures. All numerical claims and URLs are traceable to the Phase 1 fact list or listed packet policy, with arithmetic schedules and outside facts excluded. Synthetic card numbers are test strings, not patient credentials. Sample oracles are independently authored. Outputs are exactly coverage.md followed by the standalone JSON array in external.json.
