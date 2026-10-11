#!/usr/bin/env bash
# Cuts the original monolithic prompt into policy modules under skills/.
# Usage: scripts/extract-skills.sh path/to/pre-deposit-respond-packet.md
#
# Each module body is the packet's own text, copied line for line from the ranges listed
# below (packet line numbers). Nothing is reworded. Frontmatter says when a module loads:
#   triggers          case-insensitive whole-word phrases, or /regex/ (no commas outside a regex)
#   stages            pipeline statuses the module is limited to (empty = any)
#   context_triggers  predicates in src/pipeline/router.ts
#   suppresses        modules dropped when this one also matched (conflicts settled in code)
# Precedence bands: hard rules 20, guidance 30, stage 40. Lower loads first in the prompt.
set -euo pipefail
P="${1:?packet path}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/skills"
mkdir -p "$OUT"
rm -f "$OUT"/*.md

mk() { # name precedence triggers stages context_triggers suppresses ranges...
  local name="$1" prec="$2" trig="$3" stages="$4" ctx="$5" sup="$6"; shift 6
  {
    printf -- '---\nname: %s\nprecedence: %s\ntriggers: [%s]\nstages: [%s]\ncontext_triggers: [%s]\nsuppresses: [%s]\n---\n' \
      "$name" "$prec" "$trig" "$stages" "$ctx" "$sup"
    local first=1
    for r in "$@"; do
      [ "$first" = 1 ] || echo
      first=0
      sed -n "${r}p" "$P"
    done
  } > "$OUT/$name.md"
}

# ---- stage modules (40): exactly one loads, chosen by pipeline status ----
mk stage-lead 40 "" "LEAD" "" "" 1250,1254
mk stage-prep-pre-clinical 40 "" "PREP_PRE_CLINICAL" "" "" 1256,1262
# 1317 dropped: "if one slips through, do not grant it; answer the rest" contradicts the core escalation list
mk stage-pre-clinical-sent 40 "" "PRE_CLINICAL_SENT" "" "" 1264,1316 1318,1324
mk stage-meeting-booked 40 "" "MEETING_BOOKED, MEETING_COMPLETED" "" "" 1326,1336
mk stage-meeting-missed 40 "" "MEETING_MISSED" "" "" 1338,1339
mk stage-waiting 40 "" "WAITING" "" "" 1341,1342

# ---- hard rules (20) ----
# FINANCING GEOGRAPHY
mk financing-geography 20 "financing, finance, financed, instalment, instalments, installment, installments, monthly, payment plan, payment plans, spread the cost, pay over time, klarna, paypal, affirm, afterpay, pay later, per month, credit check, credit score, bad credit" "" "" "" 809,817
# HEALTH INSURANCE
mk health-insurance 20 "insurance, insurer, insurers, insured, medicare, medicaid, hmo, ppo, hsa, fsa, superbill, reimburse, reimbursed, reimbursement, medically necessary, covered by my, cpt" "" "" "" 821,838
# CARECREDIT / CHERRY
mk carecredit 20 "carecredit, care credit, cherry, alphaeon" "" "" "" 842,858
# CLINIC WEBSITE
mk clinic-website 20 "website, websites, web site, webpage, web page, homepage, url, their site, official site, own site, the site, clinic page, /\blink (?:for|to) (?:the clinic|their|heva|hakan|dr\.? hakan)\b/" "" "" "" 862,873
# OPERATIONAL KNOWLEDGE 6 Payment & Deposits; 5 Scheduling; STRUCTURED OUTPUT FIELDS payment-link bullets
mk payment-and-deposit 20 "pay, paying, paid, payment, payments, deposit, deposits, checkout, layaway, refund, refunds, refunded, refundable, money back, cancel, cancelled, canceled, cancelling, canceling, cancellation, price lock, lock in, locked in, balance, owe, cash, wire, bank transfer, zelle, venmo, card, cards, book now, /\b(?:ready to|how (?:do|can) i|want to|i'?d like to|let'?s|can i) book\b/" "" "" "" 1439,1451 1436,1438 1026,1027
# ACTIVE PROMO OFFER (the packet's no-promo variant)
mk promo 20 "promo, promos, promotion, promotions, discount, discounts, discounted, coupon, coupons, deals, any deal, better deal, special deal, good deal, sale, price match, special offer, /\b\d+\s*%\s*off\b|\\\$\s?\d[\d,]*\s+off\b/" "" "" "" 1523,1528
# DEPOSIT ELIGIBILITY RULE
mk deposit-eligibility 20 "paid directly, paid the clinic, already paid, deposit with the clinic, deposit to the clinic, deposit directly, /\b(?:paid|put down|sent|wired|placed)\b[^.?!]{0,30}\b(?:to|with|at)\s+(?:the clinic|heva|hakan|dr\.? hakan|them directly)\b/" "" "" "" 1030,1036
# PACKAGE & CLINIC FACTS; WHAT MATTERS vs NICE TO HAVE; PRE-ASSESSMENT LENGTH CAP; OPERATIONAL KNOWLEDGE 2, 9, 10; TOOL USAGE getClinicPackages
mk clinic-and-package-facts 20 "package, packages, price, prices, pricing, priced, cost, costs, how much, silver, gold, sapphire, diamond, vip, include, included, includes, inclusion, inclusions, hotel, hotels, night, nights, addon, addons, add-on, add-ons, add on, upgrade, upgrades, afro, 4c, curly, curls, coily, textured, black hair, hair type, speciality, specialty, specialize, specializes, specialise, specialises, surgeon, surgeons, doctor, doctors, incision, incisions, technician, technicians, heva, hakan, clinic, clinics, bookable, what days, which days, worth it, difference between, compare, comparing, finasteride, minoxidil, dental, veneer, veneers, teeth, sedation, prp, stem cell, stem cells, exosomes, anesthesia, numbing, nervous, anxious, anxiety, needles, pain, hurt, hurts, painful, companion, airport, airports, cheaper, expensive, tier, tiers, /\b(?:bring|come with|travel with|join)\b[^.?!]{0,15}\bmy (?:wife|husband|partner|girlfriend|boyfriend|friend|mom|mother|dad|father|son|daughter|brother|sister)\b/, /\b(?:operate|operates|work|works|open|surgery|surgeries|procedures?)\b[^.?!]{0,20}\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|weekends?)\b/" "" "" "" 960,989 1212,1246 1387,1395 1430,1430 1456,1460 1412,1412
# CLINIC STATUS TIERS
mk clinic-status-tiers 20 "recommend, recommended, recommendation, recommendations, mexico, tijuana, cancun, cancún, turkey, istanbul, miami, colombia, bogota, medellin, costa rica, which clinics, what clinics, other clinics, another clinic, different clinic, partner clinics, /\b(?:do you|you guys) (?:have|work with)\b[^.?!]{0,20}\bclinics?\b/, /\bclinics? (?:in|near)\b/" "" "" "" 1369,1385
# OPERATIONAL KNOWLEDGE 3, 4; NO ASSESSMENT TURNAROUND PROMISES; TOOL USAGE getLatestAssessment
mk assessment 20 "assessment, assessments, graft, grafts, drawing, treatment plan, my plan, revise, revision, revisions, redraw, redrawn, lower the hairline, /\b(?:is|are)\s+(?:it|my|the|they)\b[^.?!]{0,20}\bready\b/, any update, any updates, resend, send it again, norwood, hair loss scale, donor, /\bwhen will (?:it|my|the)\b[^.?!]{0,30}\bready\b/, /\b(?:can'?t|cannot|couldn'?t)\s+open\b/" "" "" "" 1431,1435 1000,1000 1418,1418
# IMAGE DELAY HANDLING (overrides COLLECTION PERSISTENCE; hair-state waits stay two weeks, not TIME-BOUND PAUSE's month)
mk image-delay 20 "weave, weaves, sew-in, sew-ins, sew in, braids, braided, cornrows, wig, wigs, hair system, toupee, lace front, buzz cut, /\b(?:i|i've|i have|i'm|im|just|recently|freshly)\s+(?:just\s+|recently\s+)?(?:shaved|buzzed)\b|\b(?:shaved|buzzed) (?:my|it|off)\b|\b(?:head|hair|scalp) is (?:shaved|buzzed)\b/, /\b(?:can'?t|cannot|won'?t|unable to)\b[^.?!]{0,25}\b(?:take|send|upload|get|do)\b[^.?!]{0,20}\b(?:photos?|pictures?|pics|images?)\b/, /\b(?:photos?|pictures?|pics|images?)\b[^.?!]{0,30}\b(?:later|tonight|tomorrow|this weekend|after work|next week|when i can)\b/, /\b(?:later|tonight|tomorrow|this weekend|after work|next week|when i can)\b[^.?!]{0,30}\b(?:photos?|pictures?|pics|images?)\b/" "" "" "collection, time-bound-pause" 1344,1360
# TIME-BOUND PAUSE (overrides the collection anchor); GUIDELINES follow-up bullet
mk time-bound-pause 20 "need time, need some time, need more time, give me time, give me some time, think about it, thinking about it, think it over, let me think, not ready, not sure yet, still deciding, still thinking, still looking, saving up, save up, save the funds, saving for, money together, things in order, sort things out, sorting things out, let me review, look over, look it over, look this over, get back to you, be in touch, in contact when, keep you updated, keep you posted, decided to wait, hold off, wait a bit, wait until, wait till, check back, follow up with me, touch base, ping you, when i'm ready, when i am ready, when ready, not yet, take my time, when i can, dermatologist, derm, bloodwork, circle back, reach out later" "" "" "collection" 1170,1210 996,996
# OPERATIONAL KNOWLEDGE 8 Consultations; CONSULTATION RESCHEDULING; PHONE CONTACT; TOOL USAGE reschedule link
mk consultation 20 "consultation, consultations, consult, phone call, a call, the call, call me, callback, call back, ring me, reschedule, rescheduling, appointment, zoom, video call, facetime, talk to the surgeon, speak to the surgeon, speak with the surgeon, talk to the doctor, speak to the doctor, speak with the doctor" "" "" "" 1453,1455 1362,1367 1406,1407 1420,1420
# CAPABILITIES & CONSTRAINTS (921 dropped: its date-hold example answers a request the core hands to a person)
mk off-channel-requests 20 "email, e-mail, emails, letter, letters, document, documents, pdf, paperwork, form, forms, doctor's note, doctors note, work note, invoice, receipt, attach, attachment, whatsapp, phone number, their number, contact details, contact info, contact information, on my behalf, driver, pin, screenshot, reserve, availability, my photos back, /\b(?:call|contact|email|message|text|ask|tell|reach)\s+(?:the clinic|heva|hakan|dr\.? hakan|the surgeon|the hotel)\b/, /\bhold\b(?!\s+off)[^.?!]{0,25}\b(?:date|dates|week|spot|slot|day|room|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|\d{1,2})\b/, /\b(?:send|get|see)\s+(?:me\s+)?my\s+(?:photos|pictures|pics|images)\b/" "" "" "" 894,920 922,927
# BUSINESS POLICY GROUNDING
mk policy-grounding 20 "annual percentage, interest, monthly, per month, lock, locked, locks, guarantee, guaranteed, portal, dashboard, booking page, drive, driving, minutes, how far, far from, /\b(?:close|closer|closest|near|nearest)\b[^.?!]{0,20}\b(?:clinic|airport|hotel|heva|hakan)\b/, distance, miles, traffic, transfer, transfers, pickup, pick up, sabiha, ist, video, join link, how does it work, how does this work, how it works" "" "" "" 929,952
# CREATOR / PARTNERSHIP BUSINESS
mk creator-partnership 20 "influencer, influencers, creator, creators, collab, collabs, collaboration, collaborate, partnership, partnerships, sponsor, sponsored, sponsorship, followers, media kit, ugc, brand deal, ambassador, affiliate, /\bmy (?:instagram|tiktok|youtube|channel|audience|page)\b/" "" "" "" 954,958
# second care line: no packet source, body written below
mk fertility 20 "ivf, fertility, egg freezing, freeze my eggs, freezing my eggs, embryo, embryos, sperm, iui, surrogacy, surrogate, in vitro" "" "" ""

# ---- guidance (30) ----
# COLLECTION PERSISTENCE; No URL before a first reply; DATA COLLECTION; FIRST-CONTACT INTRODUCTION; INSTANT FORM AREA CONFIRMATION;
# INFORMATION COLLECTION; CONCERN REFLECTION; IMAGE GUIDANCE; TOOL USAGE getPatientImages
mk collection 30 "photo, photos, picture, pictures, pic, pics, image, images, upload, uploaded, uploading, selfie, selfies, angle, angles, my name is" "" "collection_outstanding" "" 788,805 1004,1004 1016,1017 1043,1050 1052,1056 1058,1066 1068,1099 1101,1132 1417,1417
# REVERSIBILITY
mk reversibility 30 "change my mind, changed my mind, torn, not sure, what if, is it final, is this final, is that final, final decision, set in stone, money back, locked in, commit, commitment, permanent, switch, switching, transfer my deposit, move my deposit, transferable, wrong choice, pick wrong, regret, stuck with, flexible, change later, change it later, change the date, move the date, change my date, change dates, my dates, dates yet" "" "" "" 1134,1168
# DIRECT-FROM-CLINIC PRICE QUOTES
mk direct-clinic-quote 30 "quoted, quote, quotes, their price was, told me it would cost, offered me, gave me a price" "" "" "" 1038,1041
# TRAVEL READINESS; OPERATIONAL KNOWLEDGE 1 flight help and travel timing; GUIDELINES weekday/date pairings
mk travel 30 "passport, passports, flight, flights, fly, flying, plane, airfare, ticket, tickets, travel, traveling, travelling, itinerary, arrive, arrival, arriving, depart, departure, visa, evisa, trip, /\bhow (?:long|many (?:days|nights))\b[^.?!]{0,30}\b(?:stay|there|trip|be in)\b/, /\bwhen should i (?:go|travel|fly|arrive|leave)\b/" "" "" "" 1397,1404 1427,1429 1006,1006
# TOOL USAGE clinic/package selection and tentative dates; OPERATIONAL KNOWLEDGE 5 tentative timing
mk preferences-and-dates 30 "leaning, go with, going with, decided on, let's do, is the one, prefer, interested in, torn between, thinking about going, want to go in, this year, next year, next month, holidays, christmas, spring, summer, winter, this fall, in the fall, next fall, /\b(?:january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/, /\b(?:in|by|early|late|mid|around) may\b/, /\b(?:in|within) (?:a few|the next|\d+|two|three|six) (?:weeks|months)\b/" "" "" "" 1414,1415 1437,1437
# OPERATIONAL KNOWLEDGE 7 Why Doctours
mk why-doctours 30 "why doctours, why you, why should i, why use, why go through, book directly, directly with the clinic, through the clinic, middleman, what do you offer, what does doctours do, benefit, benefits, vs booking, reviews, testimonials" "" "" "" 1452,1452
# No head-covering advice; real timings (procedure length) from the turnaround rule
mk recovery 30 "hat, hats, cap, caps, beanie, beanies, scarf, hood, hoodie, headband, hijab, durag, du-rag, bonnet, head wrap, head covering, cover my head, pack, packing, /\bwhat (?:should|do|can) i (?:bring|pack|wear)\b/, hurt, hurts, painful, recovery, recover, recovering, after surgery, after the procedure, post-op, post op, aftercare, shedding, shed, wash, washing, scab, scabs, swelling, pain, sleep, sleeping, back to work, /\bhow long (?:does|is|will) (?:the )?(?:surgery|procedure|operation|transplant)\b/" "" "" "" 999,999 1000,1000

cat >> "$OUT/fertility.md" <<'EOF'
# FERTILITY (SECOND CARE LINE — STUB)
Doctours' fertility line is not live in this system yet. If the patient asks about IVF, egg freezing, embryo transfer, IUI, or surrogacy: say plainly that you don't have fertility details here yet, and that you can keep helping with their hair transplant questions. Do not describe fertility pricing, clinics, success rates, or timelines. Do not promise a follow-up.
This module exists to show that a new line of care is a new set of modules with their own triggers and tests, not a paste into the hair-transplant rules.
EOF

echo "wrote $(ls "$OUT" | wc -l | tr -d ' ') skills to $OUT"
