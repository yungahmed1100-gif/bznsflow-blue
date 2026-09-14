# Blue multi-tenant RAG architecture

```text
WhatsApp Cloud webhook
        |
        v
signature + account/integration gate -> Convex durable inbox
        |
        +-- 3s per-conversation debounce -> rolling 6-turn context
        |
        +-- Tier 0: normalized tenant/revision cache (Convex/KV adapter)
        |       \
        |        +-- hit -> reply
        |
        +-- Tier 1: pinned small-model/deterministic intent router -> SQL/API adapter
        |       \
        |        +-- known fact/action -> reply or handoff
        |
        +-- Tier 2: tenant-filtered Convex BM25 + vector retrieval -> RRF -> grounded model
                \
                 +-- similarity < .72 / FALLBACK_TRIGGER -> human handoff
```

The implementation is intentionally additive to Blue's existing Vercel + Convex runtime. Convex supplies durable tenant-scoped tables, full-text search and vector search; the engine accepts adapters so a Redis or Postgres deployment can be introduced later without changing routing policy. No knowledge is imported from a public corpus: only reviewed website/signup facts and tenant-approved FAQs are publishable.

The durable knowledge table is `blueKnowledgeChunks` (`tenantId`, `revision`, `locale`, approval flag, source, document type, effective date, section path, original text, and optional 1536-dimension embedding). Every retrieval call must constrain tenant and revision before search. The cache namespace is `blue:rag:blue-rag-v1:<tenantId>:<revision>:<locale>:<sha256(normalized query)>`, with a seven-day TTL and revision invalidation.

The 22 sectors are in `config/layla-sectors.json`, grouped into booking, catalog, and project/lead workflows. Each tenant must use a validated six-to-ten-intent configuration based on `config/tenant-retrieval.schema.json`. Regex and tenant kNN classification, slot extraction, FAQ answers, and structured templates are deterministic. Unknown or regulated requests hand off after one clarification. Generation is restricted to qualification behind `BLUE_RAG_ENABLED` and shadow-mode/evaluation gates.

Operational targets are measured per tenant: p95 under 500 ms for cache/router paths and under 1.2 s for retrieval/generation, with a 100-tenant synthetic load gate. Fine-tuning is deferred until a reviewed holdout set demonstrates a material routing or tone improvement; retrieval grounding and fallback metrics are the release gates.
