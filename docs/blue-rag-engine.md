# Blue RAG engine

The RAG layer is an additive module over Blue’s existing Convex and WhatsApp
pipeline. It does not introduce PostgreSQL, Redis, LangChain or a second
runtime for the MVP. Convex remains the authority; the injected cache/search
adapters can later be backed by Convex text/vector indexes or another approved
store without changing routing policy.

## Flow

```text
verified WABA binding → durable message → 3s burst debounce
  → tenant/revision cache → deterministic intent router
  → approved profile facts → lexical + dense retrieval → RRF
  → evidence threshold → grounded generator → outbound safety gates
```

`answerMessage` is tenant and revision scoped. Tier 0 serves only a cache entry
whose tenant and knowledge revision match. Tier 1 handles known intents with
the existing deterministic answer engine. Tier 2 requires both search adapters,
filters every result by tenant, rejects dense similarity below 0.72, and accepts
only bounded generated text. `FALLBACK_TRIGGER` or missing evidence returns a
human-safe fallback.

`createDebouncer` aggregates messages per conversation after three seconds of
inactivity, capped at ten seconds from the first fragment. `buildContext` keeps
six turns and records when older turns were compacted; summaries are context,
never business facts.

The sector taxonomy lives in `config/layla-sectors.json`. It maps all 22 sectors
to booking, catalog or project archetypes and defines shared and archetype
intents. It does not invent services, prices, inventory, appointments or lead
facts for a tenant.

## Model and evaluation policy

The MVP default is pinned `gpt-4o-mini-2024-07-18` only for unresolved routing or
unstructured evidence synthesis. Most traffic must remain deterministic. Use
`text-embedding-3-small` only for indexed approved content and measure actual
usage. Fine-tune only a shared routing/response behavior after a held-out eval
set proves improvement; tenant facts remain retrieval data.

Required evaluation sets include Arabic, English, mixed-language and Arabizi
queries for every sector, missing facts, prompt injection, duplicate bursts,
cross-tenant attempts and stale revisions. Release gates are intent macro-F1
≥0.90 per sector, retrieval recall@4 ≥0.90, 98% evidence-supported reviewed
answers, zero cross-tenant disclosures and zero opt-out violations.

The requested sub-500ms Tier 0/1 and sub-1200ms Tier 2 budgets exclude the
intentional three-second debounce and WhatsApp provider delivery. Report both
processing latency and end-to-end customer-visible latency.
