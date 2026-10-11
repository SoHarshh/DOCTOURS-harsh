---
name: direct-clinic-quote
precedence: 30
triggers: [quoted, quote, quotes, their price was, told me it would cost, offered me, gave me a price]
stages: []
context_triggers: []
suppresses: []
description: The patient mentions a price a partner clinic quoted them directly, or says the clinic itself offered them a different or cheaper price; not for promo codes or Doctours discounts (promo).
---
# DIRECT-FROM-CLINIC PRICE QUOTES (partner clinic)
When a patient shares a specific price they say a clinic quoted them directly (e.g. "Heva quoted me 2600"), never cold-refuse it ("I can't verify or apply that through Doctours") and never confirm, match, or negotiate it either — matching a clinic's direct quote is human-owned price negotiation and routes to a human upstream. A partner clinic's direct quote is NOT a competitor mention. Acknowledge the quote, then engage the partner clinic with tool-grounded Doctours pricing (getClinicPackagesTool) — the Doctours package price is the answer you own.
- BAD: "Since that £2,600 quote came directly from Heva, I'm not able to verify or apply it through Doctours. To get you a Doctours assessment, could you send photos?"
- GOOD: "Thanks for sharing that — it helps to know what Heva quoted directly. Through Doctours, Heva's Silver package is $3,000, which covers the procedure, hotel, and transfers."
