| Metric | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| Cases x reps | 75 | 75 |
| Pass rate (all checks) | 74.7% (reps 76.0%, 76.0%, 72.0%) | 89.3% (reps 88.0%, 88.0%, 92.0%) |
| Escalation recall | 83.3% (15/18) | 100.0% (18/18) |
| Escalation precision | 100.0% (15/15) | 90.0% (18/20) |
| Clean Tool-Use Rate (tool-required turns) | n/a | n/a |
| Tool-Skip rate | n/a | n/a |
| Result-Ignore rate | n/a | n/a |
| Output-Fabrication rate | n/a | n/a |
| Unnecessary-Tool-Use rate (control turns) | n/a | n/a |
| Retry rate | 0.0% (0/75) | 5.6% (4/72) |
| First-retry fix rate | n/a | 50.0% (2/4) |
| Turns answered by the pre-gate | 0 | 3 |
| Latency p50 (ms, model turns) | 6,277 | 3,756 |
| Latency p95 (ms, model turns) | 9,920 | 9,174 |
| Mean prompt size (chars, model turns) | 167,133 | 41,112 |
| Mean uncached input tokens (model turns) | 6 | 6 |
| Mean cache-read tokens (model turns) | 111,146 | 33,550 |
| Mean output tokens (model turns) | 1,215 | 740 |
| Cost per 1,000 turns (USD, all turns) | 1.84 | 1.05 |
| Infra errors excluded | 0 | 0 |

Paired per case, new (claude-haiku-5-5) vs baseline (claude-haiku-5-5) on 25 shared cases: 7 wins, 3 losses, 15 ties. Mean per-case pass-rate difference +14.7 points (SE 11.4 points).

| Tag | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| ack | 100.0% (3) | 100.0% (3) |
| bookable-days | 100.0% (3) | 100.0% (3) |
| clinic-doctors | 100.0% (3) | 100.0% (3) |
| deposit | 100.0% (3) | 100.0% (3) |
| escalate-negative | 96.5% (57) | 86.0% (57) |
| escalate-positive | 5.6% (18) | 100.0% (18) |
| financing | 100.0% (3) | 100.0% (3) |
| hair-type | 100.0% (3) | 100.0% (3) |
| hard-negative | 100.0% (15) | 86.7% (15) |
| heldout | 74.7% (75) | 89.3% (75) |
| insurance | 100.0% (3) | 0.0% (3) |
| off-topic | 100.0% (3) | 100.0% (3) |
| package-includes | 100.0% (3) | 100.0% (3) |
| pause | 100.0% (3) | 0.0% (3) |
| pay-from-assessment | 100.0% (3) | 100.0% (3) |
| payment-link | 33.3% (3) | 100.0% (3) |
| pricing | 100.0% (3) | 100.0% (3) |
| trap | 100.0% (3) | 100.0% (3) |
| travel-length | 100.0% (3) | 100.0% (3) |
