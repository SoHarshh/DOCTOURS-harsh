| Metric | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| Cases x reps | 75 | 75 |
| Pass rate (all checks) | 74.7% (reps 76.0%, 76.0%, 72.0%) | 100.0% (reps 100.0%, 100.0%, 100.0%) |
| Escalation recall | 83.3% (15/18) | 100.0% (18/18) |
| Escalation precision | 100.0% (15/15) | 100.0% (18/18) |
| False escalations (must-not-escalate turns) | 0 of 57 (pregate 0, model 0, validator 0, refusal 0) | 0 of 57 (pregate 0, model 0, validator 0, refusal 0) |
| Missed escalations (must-escalate turns) | 3 of 18 | 0 of 18 |
| Clean Tool-Use Rate (tool-required turns) | n/a | n/a |
| Tool-Skip rate | n/a | n/a |
| Result-Ignore rate | n/a | n/a |
| Output-Fabrication rate | n/a | n/a |
| Unnecessary-Tool-Use rate (control turns) | n/a | n/a |
| Retry rate | 0.0% (0/75) | 0.0% (0/72) |
| First-retry fix rate | n/a | n/a |
| Turns answered by the pre-gate | 0 | 3 |
| Latency p50 (ms, model turns) | 6,277 | 3,940 |
| Latency p95 (ms, model turns) | 9,920 | 6,792 |
| Mean prompt size (chars, model turns) | 167,133 | 41,607 |
| Mean uncached input tokens (model turns) | 6 | 13 |
| Mean cache-read tokens (model turns) | 111,146 | 31,448 |
| Mean output tokens (model turns) | 1,215 | 662 |
| Cost per 1,000 turns (USD, all turns) | 1.84 | 0.96 |
| Infra errors excluded | 0 | 0 |

Paired per case, new (claude-haiku-5-5) vs baseline (claude-haiku-5-5) on 25 shared cases: 7 wins, 0 losses, 18 ties. Mean per-case pass-rate difference +25.3 points (SE 8.5 points).

| Tag | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| ack | 100.0% (3) | 100.0% (3) |
| bookable-days | 100.0% (3) | 100.0% (3) |
| clinic-doctors | 100.0% (3) | 100.0% (3) |
| deposit | 100.0% (3) | 100.0% (3) |
| escalate-negative | 96.5% (57) | 100.0% (57) |
| escalate-positive | 5.6% (18) | 100.0% (18) |
| financing | 100.0% (3) | 100.0% (3) |
| hair-type | 100.0% (3) | 100.0% (3) |
| hard-negative | 100.0% (15) | 100.0% (15) |
| heldout | 74.7% (75) | 100.0% (75) |
| insurance | 100.0% (3) | 100.0% (3) |
| off-topic | 100.0% (3) | 100.0% (3) |
| package-includes | 100.0% (3) | 100.0% (3) |
| pause | 100.0% (3) | 100.0% (3) |
| pay-from-assessment | 100.0% (3) | 100.0% (3) |
| payment-link | 33.3% (3) | 100.0% (3) |
| pricing | 100.0% (3) | 100.0% (3) |
| trap | 100.0% (3) | 100.0% (3) |
| travel-length | 100.0% (3) | 100.0% (3) |
