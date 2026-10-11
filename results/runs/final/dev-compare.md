| Metric | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| Cases x reps | 321 | 321 |
| Pass rate (all checks) | 78.5% (reps 78.5%, 78.5%, 78.5%) | 98.8% (reps 99.1%, 99.1%, 98.1%) |
| Escalation recall | 66.7% (34/51) | 100.0% (51/51) |
| Escalation precision | 91.9% (34/37) | 94.4% (51/54) |
| False escalations (must-not-escalate turns) | 3 of 270 (pregate 0, model 3, validator 0, refusal 0) | 3 of 270 (pregate 0, model 3, validator 0, refusal 0) |
| Missed escalations (must-escalate turns) | 17 of 51 | 0 of 51 |
| Clean Tool-Use Rate (tool-required turns) | 91.1% (82/90) | 97.8% (88/90) |
| Tool-Skip rate | 1.1% (1/90) | 1.1% (1/90) |
| Result-Ignore rate | 4.4% (4/90) | 0.0% (0/90) |
| Output-Fabrication rate | 3.3% (3/90) | 1.1% (1/90) |
| Unnecessary-Tool-Use rate (control turns) | 3.5% (n=114) | 2.6% (n=114) |
| Retry rate | 0.0% (0/321) | 0.7% (2/288) |
| First-retry fix rate | n/a | 100.0% (2/2) |
| Turns answered by the pre-gate | 0 | 33 |
| Latency p50 (ms, model turns) | 5,214 | 3,620 |
| Latency p95 (ms, model turns) | 9,397 | 6,953 |
| Mean prompt size (chars, model turns) | 167,048 | 39,923 |
| Mean uncached input tokens (model turns) | 5 | 6 |
| Mean cache-read tokens (model turns) | 95,138 | 26,944 |
| Mean output tokens (model turns) | 1,014 | 640 |
| Cost per 1,000 turns (USD, all turns) | 1.78 | 0.81 |
| Infra errors excluded | 0 | 0 |

Paired per case, new (claude-haiku-5-5) vs baseline (claude-haiku-5-5) on 107 shared cases: 29 wins, 1 losses, 77 ties. Mean per-case pass-rate difference +20.2 points (SE 3.8 points).

| Tag | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| assessment | 93.3% (15) | 100.0% (15) |
| balance | 100.0% (3) | 100.0% (3) |
| card | 20.0% (15) | 100.0% (15) |
| carecredit | 100.0% (6) | 100.0% (6) |
| clinic | 97.1% (69) | 100.0% (69) |
| clinic-contact | 25.0% (12) | 100.0% (12) |
| collection | 85.7% (21) | 95.2% (21) |
| conceptual | 100.0% (6) | 100.0% (6) |
| concern | 50.0% (6) | 83.3% (6) |
| consultation | 22.2% (9) | 100.0% (9) |
| control | 93.0% (114) | 97.4% (114) |
| creator | 0.0% (3) | 100.0% (3) |
| dates | 100.0% (3) | 100.0% (3) |
| deposit | 100.0% (12) | 100.0% (12) |
| deposit-eligibility | 100.0% (3) | 100.0% (3) |
| doctors | 100.0% (3) | 100.0% (3) |
| documents | 100.0% (3) | 100.0% (3) |
| escalate-negative | 91.5% (270) | 98.5% (270) |
| escalate-positive | 9.8% (51) | 100.0% (51) |
| escalation | 36.1% (72) | 100.0% (72) |
| fertility | 100.0% (3) | 100.0% (3) |
| financing | 100.0% (9) | 100.0% (9) |
| fixture-mutation | 100.0% (3) | 100.0% (3) |
| funnel | 100.0% (3) | 100.0% (3) |
| hard-negative | 100.0% (21) | 100.0% (21) |
| identity | 100.0% (9) | 100.0% (9) |
| image-delay | 100.0% (3) | 100.0% (3) |
| images | 100.0% (6) | 100.0% (6) |
| insurance | 100.0% (6) | 100.0% (6) |
| language | 100.0% (3) | 100.0% (3) |
| layaway | 100.0% (3) | 100.0% (3) |
| lead | 66.7% (9) | 88.9% (9) |
| links | 66.7% (6) | 100.0% (6) |
| meds | 100.0% (3) | 100.0% (3) |
| null-return | 66.7% (6) | 100.0% (6) |
| overbuy | 100.0% (3) | 100.0% (3) |
| pacing | 86.7% (45) | 93.3% (45) |
| packages | 100.0% (21) | 100.0% (21) |
| packet | 20.0% (15) | 100.0% (15) |
| paid-money | 11.1% (9) | 100.0% (9) |
| pause | 100.0% (9) | 100.0% (9) |
| payment | 96.3% (54) | 100.0% (54) |
| phone | 100.0% (3) | 0.0% (3) |
| pricing | 85.2% (27) | 100.0% (27) |
| promo | 100.0% (9) | 100.0% (9) |
| recovery | 100.0% (3) | 100.0% (3) |
| reversibility | 100.0% (6) | 100.0% (6) |
| scope | 100.0% (3) | 100.0% (3) |
| short | 88.9% (9) | 100.0% (9) |
| skip-bait | 83.3% (6) | 100.0% (6) |
| speciality | 100.0% (3) | 100.0% (3) |
| subagent | 66.7% (3) | 100.0% (3) |
| tool-required | 87.8% (90) | 100.0% (90) |
| trap | 100.0% (39) | 100.0% (39) |
| trap-history | 100.0% (6) | 100.0% (6) |
| trap-patient | 100.0% (15) | 100.0% (15) |
| trap-prompt | 100.0% (18) | 100.0% (18) |
| travel | 91.7% (12) | 100.0% (12) |
| website | 100.0% (6) | 100.0% (6) |
| weekdays | 100.0% (3) | 100.0% (3) |
| why | 100.0% (3) | 100.0% (3) |
