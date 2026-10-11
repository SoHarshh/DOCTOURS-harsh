| Metric | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| Cases x reps | 180 | 180 |
| Pass rate (all checks) | 78.3% (reps 76.7%, 80.0%, 78.3%) | 90.6% (reps 88.3%, 93.3%, 90.0%) |
| Escalation recall | n/a | n/a |
| Escalation precision | 0.0% (0/22) | 0.0% (0/28) |
| False escalations (must-not-escalate turns) | 22 of 180 (pregate 0, model 22, validator 0, refusal 0) | 28 of 180 (pregate 6, model 22, validator 0, refusal 0) |
| Missed escalations (must-escalate turns) | n/a | n/a |
| Clean Tool-Use Rate (tool-required turns) | n/a | n/a |
| Tool-Skip rate | n/a | n/a |
| Result-Ignore rate | n/a | n/a |
| Output-Fabrication rate | n/a | n/a |
| Unnecessary-Tool-Use rate (control turns) | n/a | n/a |
| Retry rate | 0.0% (0/180) | 1.1% (2/174) |
| First-retry fix rate | n/a | 100.0% (2/2) |
| Turns answered by the pre-gate | 0 | 6 |
| Latency p50 (ms, model turns) | 6,853 | 4,889 |
| Latency p95 (ms, model turns) | 12,152 | 9,009 |
| Mean prompt size (chars, model turns) | 167,133 | 44,069 |
| Mean uncached input tokens (model turns) | 6 | 13 |
| Mean cache-read tokens (model turns) | 123,015 | 37,425 |
| Mean output tokens (model turns) | 1,288 | 899 |
| Cost per 1,000 turns (USD, all turns) | 2.03 | 1.18 |
| Infra errors excluded | 0 | 0 |

Paired per case, new (claude-haiku-5-5) vs baseline (claude-haiku-5-5) on 60 shared cases: 13 wins, 5 losses, 42 ties. Mean per-case pass-rate difference +12.2 points (SE 5.4 points).

| Tag | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| heldout2 | 78.3% (180) | 90.6% (180) |
| heldout2:adversarial | 55.6% (18) | 72.2% (18) |
| heldout2:conversation-ref | 83.3% (18) | 83.3% (18) |
| heldout2:emotional | 72.2% (18) | 100.0% (18) |
| heldout2:escalate | 7.4% (27) | 100.0% (27) |
| heldout2:messy | 91.7% (24) | 100.0% (24) |
| heldout2:multi-intent | 50.0% (30) | 80.0% (30) |
| heldout2:no-escalate | 90.8% (153) | 88.9% (153) |
| heldout2:non-english | 77.8% (18) | 100.0% (18) |
| heldout2:not-in-data | 100.0% (18) | 83.3% (18) |
| heldout2:straightforward | 94.4% (36) | 100.0% (36) |
