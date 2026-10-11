| Metric | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| Cases x reps | 360 | 360 |
| Pass rate (all checks) | 68.3% (reps 67.5%, 67.5%, 70.0%) | 86.4% (reps 87.5%, 85.8%, 85.8%) |
| Escalation recall | 50.7% (38/75) | 82.7% (62/75) |
| Escalation precision | 92.7% (38/41) | 98.4% (62/63) |
| Clean Tool-Use Rate (tool-required turns) | n/a | n/a |
| Tool-Skip rate | n/a | n/a |
| Result-Ignore rate | n/a | n/a |
| Output-Fabrication rate | n/a | n/a |
| Unnecessary-Tool-Use rate (control turns) | n/a | n/a |
| Retry rate | 0.0% (0/360) | 4.3% (15/348) |
| First-retry fix rate | n/a | 86.7% (13/15) |
| Turns answered by the pre-gate | 0 | 12 |
| Latency p50 (ms, model turns) | 6,126 | 4,391 |
| Latency p95 (ms, model turns) | 11,616 | 9,905 |
| Mean prompt size (chars, model turns) | 167,133 | 43,670 |
| Mean uncached input tokens (model turns) | 6 | 152 |
| Mean cache-read tokens (model turns) | 123,197 | 36,345 |
| Mean output tokens (model turns) | 1,222 | 837 |
| Cost per 1,000 turns (USD, all turns) | 1.99 | 1.20 |
| Infra errors excluded | 0 | 0 |

Paired per case, new (claude-haiku-5-5) vs baseline (claude-haiku-5-5) on 120 shared cases: 39 wins, 11 losses, 70 ties. Mean per-case pass-rate difference +18.1 points (SE 4.1 points).

| Tag | baseline (claude-haiku-5-5) | new (claude-haiku-5-5) |
|---|---|---|
| acknowledgement | 88.9% (9) | 100.0% (9) |
| addon-hesitation | 66.7% (3) | 100.0% (3) |
| all-caps | 0.0% (3) | 100.0% (3) |
| angry | 0.0% (3) | 100.0% (3) |
| anxious | 93.3% (15) | 80.0% (15) |
| assessment | 100.0% (3) | 100.0% (3) |
| busy | 100.0% (9) | 100.0% (9) |
| callback | 0.0% (3) | 33.3% (3) |
| checkout-browse | 66.7% (6) | 100.0% (6) |
| claimed-discount | 100.0% (3) | 100.0% (3) |
| claimed-price | 66.7% (3) | 100.0% (3) |
| clinic-contact | 100.0% (3) | 100.0% (3) |
| comparison | 100.0% (3) | 100.0% (3) |
| consultation | 66.7% (3) | 100.0% (3) |
| creator | 33.3% (3) | 100.0% (3) |
| credit | 100.0% (9) | 88.9% (9) |
| deadline-pressure | 100.0% (3) | 100.0% (3) |
| discount | 66.7% (3) | 100.0% (3) |
| doctor-guarantee | 100.0% (3) | 100.0% (3) |
| emoji | 0.0% (3) | 100.0% (3) |
| english-only | 66.7% (3) | 0.0% (3) |
| escalate-negative | 86.3% (285) | 87.4% (285) |
| escalate-positive | 0.0% (75) | 82.7% (75) |
| escalation | 0.0% (75) | 82.7% (75) |
| external | 68.3% (360) | 86.4% (360) |
| failed-method | 100.0% (3) | 100.0% (3) |
| financing | 66.7% (3) | 66.7% (3) |
| financing-math | 100.0% (3) | 100.0% (3) |
| first-ask | 100.0% (3) | 100.0% (3) |
| flights | 100.0% (3) | 100.0% (3) |
| french | 0.0% (3) | 100.0% (3) |
| gen-z | 50.0% (6) | 100.0% (6) |
| hair-type | 100.0% (3) | 66.7% (3) |
| hard-negative | 85.0% (60) | 83.3% (60) |
| hat | 100.0% (3) | 100.0% (3) |
| history | 80.0% (15) | 80.0% (15) |
| hold | 0.0% (3) | 100.0% (3) |
| hsa | 100.0% (3) | 100.0% (3) |
| human-keyword | 100.0% (3) | 100.0% (3) |
| hyphens | 0.0% (3) | 100.0% (3) |
| hypothetical-payment | 100.0% (3) | 33.3% (3) |
| identity | 66.7% (3) | 33.3% (3) |
| indirect-human | 0.0% (3) | 100.0% (3) |
| information-only | 100.0% (3) | 100.0% (3) |
| injection | 33.3% (6) | 100.0% (6) |
| insurance | 100.0% (9) | 100.0% (9) |
| internal-details | 0.0% (3) | 33.3% (3) |
| layaway | 16.7% (6) | 33.3% (6) |
| live-availability | 0.0% (3) | 33.3% (3) |
| long | 50.0% (6) | 100.0% (6) |
| memory-not-assessment | 100.0% (3) | 100.0% (3) |
| minimal-pair | 43.6% (78) | 76.9% (78) |
| mixed-request | 0.0% (3) | 100.0% (3) |
| money-already-paid | 0.0% (3) | 100.0% (3) |
| multi-question | 76.9% (39) | 71.8% (39) |
| no-punctuation | 50.0% (6) | 100.0% (6) |
| non-native | 100.0% (3) | 100.0% (3) |
| off-topic | 73.3% (30) | 83.3% (30) |
| ordinary | 84.4% (135) | 86.7% (135) |
| other-procedure | 100.0% (6) | 100.0% (6) |
| pacing | 96.7% (30) | 90.0% (30) |
| package-inclusions | 100.0% (6) | 100.0% (6) |
| passport | 100.0% (3) | 0.0% (3) |
| pause | 100.0% (18) | 100.0% (18) |
| payment-link | 88.9% (9) | 100.0% (9) |
| payment-routing | 100.0% (3) | 100.0% (3) |
| polite | 0.0% (3) | 100.0% (3) |
| pressure | 66.7% (3) | 100.0% (3) |
| price-lock | 100.0% (3) | 100.0% (3) |
| price-shopper | 33.3% (3) | 100.0% (3) |
| prompt-injection | 100.0% (3) | 100.0% (3) |
| recovery | 66.7% (3) | 100.0% (3) |
| refund-boundary | 0.0% (3) | 0.0% (3) |
| required-care | 66.7% (3) | 100.0% (3) |
| resend | 33.3% (3) | 100.0% (3) |
| revision | 100.0% (3) | 100.0% (3) |
| schedule-hard-negative | 100.0% (3) | 100.0% (3) |
| second-care-line | 100.0% (3) | 100.0% (3) |
| selection | 100.0% (3) | 100.0% (3) |
| self-service | 100.0% (3) | 0.0% (3) |
| short | 100.0% (3) | 100.0% (3) |
| short-delay | 100.0% (3) | 0.0% (3) |
| skeptic | 100.0% (9) | 88.9% (9) |
| spaces | 0.0% (3) | 100.0% (3) |
| spanish | 33.3% (6) | 50.0% (6) |
| staff-impersonation | 0.0% (3) | 100.0% (3) |
| supported-revision | 66.7% (3) | 100.0% (3) |
| synthetic-card | 0.0% (9) | 100.0% (9) |
| tentative-date | 0.0% (3) | 33.3% (3) |
| third-party | 50.0% (6) | 66.7% (6) |
| trap | 100.0% (30) | 100.0% (30) |
| travel | 0.0% (3) | 33.3% (3) |
| typos | 100.0% (9) | 100.0% (9) |
| website | 100.0% (6) | 100.0% (6) |
| weekdays | 100.0% (6) | 100.0% (6) |
| wrong-deposit | 100.0% (3) | 100.0% (3) |
| wrong-nights | 100.0% (9) | 100.0% (9) |
| wrong-price | 100.0% (6) | 100.0% (6) |
| wrong-weekday | 100.0% (9) | 100.0% (9) |
