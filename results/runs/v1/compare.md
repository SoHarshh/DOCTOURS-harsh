| Metric | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| Cases x reps | 321 | 321 |
| Pass rate (all checks) | 70.7% (reps 72.9%, 70.1%, 69.2%) | 88.5% (reps 87.9%, 88.8%, 88.8%) |
| Escalation recall | 58.8% (30/51) | 98.0% (50/51) |
| Escalation precision | 90.9% (30/33) | 89.3% (50/56) |
| Clean Tool-Use Rate (tool-required turns) | 72.4% (63/87) | 81.6% (71/87) |
| Tool-Skip rate | 6.9% (6/87) | 6.9% (6/87) |
| Result-Ignore rate | 11.5% (10/87) | 3.4% (3/87) |
| Output-Fabrication rate | 9.2% (8/87) | 2.3% (2/87) |
| Unnecessary-Tool-Use rate (control turns) | 2.7% (n=111) | 2.7% (n=111) |
| Retry rate | 0.0% (0/321) | 2.8% (8/321) |
| First-retry fix rate | n/a | 37.5% (3/8) |
| Latency p50 (ms) | 5,284 | 3,386 |
| Latency p95 (ms) | 9,765 | 7,405 |
| Mean prompt size (chars) | 167,046 | 35,246 |
| Mean uncached input tokens | 5 | 5 |
| Mean cache-read tokens | 95,546 | 22,865 |
| Mean output tokens | 1,032 | 583 |
| Cost per 1,000 turns (USD) | 1.72 | 0.90 |
| Infra errors excluded | 0 | 0 |

Paired per case, new (claude-haiku-5-5) vs baseline (claude-haiku-5-5) on 107 shared cases: 35 wins, 11 losses, 61 ties. Mean per-case pass-rate difference +17.8 points (SE 4.5 points).

| Tag | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| assessment | 93.3% (15) | 100.0% (15) |
| balance | 0.0% (3) | 0.0% (3) |
| card | 20.0% (15) | 100.0% (15) |
| carecredit | 100.0% (6) | 100.0% (6) |
| clinic | 85.5% (69) | 89.9% (69) |
| clinic-contact | 8.3% (12) | 91.7% (12) |
| collection | 71.4% (21) | 71.4% (21) |
| conceptual | 100.0% (6) | 100.0% (6) |
| concern | 0.0% (6) | 0.0% (6) |
| consultation | 11.1% (9) | 100.0% (9) |
| control | 88.3% (111) | 86.5% (111) |
| creator | 66.7% (3) | 100.0% (3) |
| dates | 66.7% (3) | 100.0% (3) |
| deposit | 100.0% (12) | 75.0% (12) |
| deposit-eligibility | 66.7% (3) | 100.0% (3) |
| doctors | 100.0% (3) | 100.0% (3) |
| documents | 100.0% (3) | 100.0% (3) |
| escalate-negative | 83.3% (270) | 86.7% (270) |
| escalate-positive | 3.9% (51) | 98.0% (51) |
| escalation | 31.9% (72) | 94.4% (72) |
| fertility | 100.0% (3) | 33.3% (3) |
| financing | 100.0% (9) | 100.0% (9) |
| fixture-mutation | 100.0% (3) | 100.0% (3) |
| funnel | 100.0% (3) | 100.0% (3) |
| hard-negative | 100.0% (21) | 85.7% (21) |
| identity | 100.0% (9) | 100.0% (9) |
| image-delay | 100.0% (3) | 100.0% (3) |
| images | 100.0% (6) | 100.0% (6) |
| insurance | 100.0% (6) | 83.3% (6) |
| language | 100.0% (3) | 100.0% (3) |
| layaway | 66.7% (3) | 100.0% (3) |
| lead | 33.3% (9) | 33.3% (9) |
| links | 66.7% (6) | 100.0% (6) |
| meds | 100.0% (3) | 100.0% (3) |
| null-return | 50.0% (6) | 100.0% (6) |
| overbuy | 100.0% (3) | 100.0% (3) |
| pacing | 82.2% (45) | 88.9% (45) |
| packages | 57.1% (21) | 76.2% (21) |
| packet | 20.0% (15) | 100.0% (15) |
| paid-money | 11.1% (9) | 100.0% (9) |
| pause | 100.0% (9) | 100.0% (9) |
| payment | 87.0% (54) | 87.0% (54) |
| phone | 33.3% (3) | 33.3% (3) |
| pricing | 85.2% (27) | 77.8% (27) |
| promo | 100.0% (9) | 55.6% (9) |
| recovery | 100.0% (3) | 33.3% (3) |
| reversibility | 100.0% (6) | 100.0% (6) |
| scope | 100.0% (3) | 100.0% (3) |
| short | 88.9% (9) | 88.9% (9) |
| skip-bait | 50.0% (6) | 100.0% (6) |
| speciality | 100.0% (3) | 100.0% (3) |
| subagent | 66.7% (3) | 100.0% (3) |
| tool-required | 73.6% (87) | 83.9% (87) |
| trap | 92.3% (39) | 76.9% (39) |
| trap-history | 100.0% (6) | 16.7% (6) |
| trap-patient | 100.0% (15) | 73.3% (15) |
| trap-prompt | 83.3% (18) | 100.0% (18) |
| travel | 100.0% (12) | 100.0% (12) |
| website | 66.7% (6) | 100.0% (6) |
| weekdays | 100.0% (3) | 100.0% (3) |
| why | 100.0% (3) | 100.0% (3) |
