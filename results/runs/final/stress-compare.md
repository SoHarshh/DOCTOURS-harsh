| Metric | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| Cases x reps | 180 | 180 |
| Pass rate (all checks) | 67.8% (reps 68.3%, 66.7%, 68.3%) | 96.7% (reps 96.7%, 96.7%, 96.7%) |
| Escalation recall | 56.7% (34/60) | 100.0% (60/60) |
| Escalation precision | 100.0% (34/34) | 92.3% (60/65) |
| False escalations (must-not-escalate turns) | 0 of 120 (pregate 0, model 0, validator 0, refusal 0) | 5 of 120 (pregate 3, model 2, validator 0, refusal 0) |
| Missed escalations (must-escalate turns) | 26 of 60 | 0 of 60 |
| Clean Tool-Use Rate (tool-required turns) | n/a | n/a |
| Tool-Skip rate | n/a | n/a |
| Result-Ignore rate | n/a | n/a |
| Output-Fabrication rate | n/a | n/a |
| Unnecessary-Tool-Use rate (control turns) | n/a | n/a |
| Retry rate | 0.0% (0/180) | 0.6% (1/165) |
| First-retry fix rate | n/a | 100.0% (1/1) |
| Turns answered by the pre-gate | 0 | 15 |
| Latency p50 (ms, model turns) | 6,204 | 4,226 |
| Latency p95 (ms, model turns) | 12,428 | 8,557 |
| Mean prompt size (chars, model turns) | 167,133 | 47,542 |
| Mean uncached input tokens (model turns) | 5 | 10 |
| Mean cache-read tokens (model turns) | 104,479 | 30,446 |
| Mean output tokens (model turns) | 1,294 | 756 |
| Cost per 1,000 turns (USD, all turns) | 1.81 | 1.01 |
| Infra errors excluded | 0 | 0 |

Paired per case, new (claude-haiku-5-5) vs baseline (claude-haiku-5-5) on 60 shared cases: 20 wins, 2 losses, 38 ties. Mean per-case pass-rate difference +28.9 points (SE 6.5 points).

| Tag | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| availability-check | 0.0% (3) | 100.0% (3) |
| calls | 77.8% (9) | 100.0% (9) |
| card | 100.0% (15) | 100.0% (15) |
| card-charge | 0.0% (9) | 100.0% (9) |
| card-share | 0.0% (3) | 100.0% (3) |
| clinic | 100.0% (12) | 100.0% (12) |
| clinic-contact | 0.0% (6) | 100.0% (6) |
| contact-repeat | 66.7% (3) | 100.0% (3) |
| date-hold | 0.0% (6) | 100.0% (6) |
| dates | 100.0% (18) | 100.0% (18) |
| escalate-negative | 97.5% (120) | 95.0% (120) |
| escalate-positive | 8.3% (60) | 100.0% (60) |
| frustration | 100.0% (12) | 100.0% (12) |
| hard-negative | 97.5% (120) | 95.0% (120) |
| hotel | 100.0% (3) | 100.0% (3) |
| hotel-contact | 0.0% (3) | 100.0% (3) |
| human-mention | 93.3% (15) | 93.3% (15) |
| human-request | 16.7% (18) | 100.0% (18) |
| logistics | 0.0% (3) | 100.0% (3) |
| money-move | 0.0% (6) | 100.0% (6) |
| own-people | 100.0% (6) | 50.0% (6) |
| pair-1 | 50.0% (6) | 100.0% (6) |
| pair-10 | 50.0% (6) | 66.7% (6) |
| pair-11 | 50.0% (6) | 100.0% (6) |
| pair-12 | 50.0% (6) | 100.0% (6) |
| pair-13 | 50.0% (6) | 100.0% (6) |
| pair-14 | 50.0% (6) | 100.0% (6) |
| pair-15 | 50.0% (6) | 100.0% (6) |
| pair-16 | 50.0% (6) | 100.0% (6) |
| pair-17 | 50.0% (6) | 100.0% (6) |
| pair-18 | 83.3% (6) | 100.0% (6) |
| pair-19 | 100.0% (6) | 100.0% (6) |
| pair-2 | 50.0% (6) | 100.0% (6) |
| pair-3 | 50.0% (6) | 100.0% (6) |
| pair-4 | 50.0% (6) | 100.0% (6) |
| pair-5 | 50.0% (6) | 100.0% (6) |
| pair-6 | 50.0% (6) | 100.0% (6) |
| pair-7 | 50.0% (6) | 100.0% (6) |
| pair-8 | 50.0% (6) | 100.0% (6) |
| pair-9 | 50.0% (6) | 100.0% (6) |
| photos | 100.0% (3) | 100.0% (3) |
| refund-transfer | 100.0% (15) | 86.7% (15) |
| revision | 100.0% (3) | 100.0% (3) |
| self-serve | 100.0% (3) | 100.0% (3) |
| stress | 67.8% (180) | 96.7% (180) |
| transport | 100.0% (6) | 100.0% (6) |
