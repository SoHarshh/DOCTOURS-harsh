| Metric | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| Cases x reps | 321 | 321 |
| Pass rate (all checks) | 76.0% (reps 79.4%, 75.7%, 72.9%) | 93.5% (reps 93.5%, 93.5%, 93.5%) |
| Escalation recall | 58.8% (30/51) | 98.0% (50/51) |
| Escalation precision | 90.9% (30/33) | 89.3% (50/56) |
| Clean Tool-Use Rate (tool-required turns) | 88.9% (80/90) | 86.7% (78/90) |
| Tool-Skip rate | 3.3% (3/90) | 4.4% (4/90) |
| Result-Ignore rate | 4.4% (4/90) | 0.0% (0/90) |
| Output-Fabrication rate | 3.3% (3/90) | 3.3% (3/90) |
| Unnecessary-Tool-Use rate (control turns) | 2.6% (n=114) | 2.6% (n=114) |
| Retry rate | 0.0% (0/321) | 2.8% (8/288) |
| First-retry fix rate | n/a | 37.5% (3/8) |
| Turns answered by the pre-gate | 0 | 33 |
| Latency p50 (ms, model turns) | 5,284 | 3,521 |
| Latency p95 (ms, model turns) | 9,765 | 7,921 |
| Mean prompt size (chars, model turns) | 167,046 | 39,285 |
| Mean uncached input tokens (model turns) | 5 | 5 |
| Mean cache-read tokens (model turns) | 95,546 | 25,485 |
| Mean output tokens (model turns) | 1,032 | 650 |
| Cost per 1,000 turns (USD, all turns) | 1.72 | 0.90 |
| Infra errors excluded | 0 | 0 |

Paired per case, new (claude-haiku-5-5) vs baseline (claude-haiku-5-5) on 107 shared cases: 31 wins, 7 losses, 69 ties. Mean per-case pass-rate difference +17.4 points (SE 4.3 points).

| Tag | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| assessment | 93.3% (15) | 100.0% (15) |
| balance | 100.0% (3) | 100.0% (3) |
| card | 20.0% (15) | 100.0% (15) |
| carecredit | 100.0% (6) | 100.0% (6) |
| clinic | 94.2% (69) | 100.0% (69) |
| clinic-contact | 25.0% (12) | 91.7% (12) |
| collection | 76.2% (21) | 76.2% (21) |
| conceptual | 100.0% (6) | 100.0% (6) |
| concern | 16.7% (6) | 16.7% (6) |
| consultation | 11.1% (9) | 100.0% (9) |
| control | 93.9% (114) | 95.6% (114) |
| creator | 66.7% (3) | 100.0% (3) |
| dates | 66.7% (3) | 100.0% (3) |
| deposit | 100.0% (12) | 83.3% (12) |
| deposit-eligibility | 100.0% (3) | 100.0% (3) |
| doctors | 100.0% (3) | 100.0% (3) |
| documents | 100.0% (3) | 100.0% (3) |
| escalate-negative | 89.6% (270) | 92.6% (270) |
| escalate-positive | 3.9% (51) | 98.0% (51) |
| escalation | 31.9% (72) | 94.4% (72) |
| fertility | 100.0% (3) | 100.0% (3) |
| financing | 100.0% (9) | 100.0% (9) |
| fixture-mutation | 100.0% (3) | 100.0% (3) |
| funnel | 100.0% (3) | 100.0% (3) |
| hard-negative | 100.0% (21) | 85.7% (21) |
| identity | 100.0% (9) | 100.0% (9) |
| image-delay | 100.0% (3) | 100.0% (3) |
| images | 100.0% (6) | 100.0% (6) |
| insurance | 100.0% (6) | 100.0% (6) |
| language | 100.0% (3) | 100.0% (3) |
| layaway | 100.0% (3) | 100.0% (3) |
| lead | 44.4% (9) | 44.4% (9) |
| links | 66.7% (6) | 100.0% (6) |
| meds | 100.0% (3) | 100.0% (3) |
| null-return | 50.0% (6) | 100.0% (6) |
| overbuy | 100.0% (3) | 100.0% (3) |
| pacing | 86.7% (45) | 95.6% (45) |
| packages | 100.0% (21) | 100.0% (21) |
| packet | 20.0% (15) | 100.0% (15) |
| paid-money | 11.1% (9) | 100.0% (9) |
| pause | 100.0% (9) | 100.0% (9) |
| payment | 96.3% (54) | 96.3% (54) |
| phone | 33.3% (3) | 66.7% (3) |
| pricing | 85.2% (27) | 77.8% (27) |
| promo | 100.0% (9) | 55.6% (9) |
| recovery | 100.0% (3) | 100.0% (3) |
| reversibility | 100.0% (6) | 100.0% (6) |
| scope | 100.0% (3) | 100.0% (3) |
| short | 88.9% (9) | 88.9% (9) |
| skip-bait | 50.0% (6) | 100.0% (6) |
| speciality | 100.0% (3) | 100.0% (3) |
| subagent | 66.7% (3) | 100.0% (3) |
| tool-required | 84.4% (90) | 90.0% (90) |
| trap | 100.0% (39) | 76.9% (39) |
| trap-history | 100.0% (6) | 16.7% (6) |
| trap-patient | 100.0% (15) | 73.3% (15) |
| trap-prompt | 100.0% (18) | 100.0% (18) |
| travel | 100.0% (12) | 100.0% (12) |
| website | 66.7% (6) | 100.0% (6) |
| weekdays | 100.0% (3) | 100.0% (3) |
| why | 100.0% (3) | 100.0% (3) |
