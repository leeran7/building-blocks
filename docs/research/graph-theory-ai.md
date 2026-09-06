# Graph Theory × AI — Research Brief

**Date:** 2026-09-06  
**Scope:** How graph theory shows up in modern AI systems, and what that implies for agentic / RAG-style products.

---

## 1. Why graphs matter for AI

A **graph** is a set of nodes (entities) and edges (relations). That matches how much real-world knowledge is structured: people ↔ orgs, documents ↔ concepts, code ↔ deps, agents ↔ stages.

LLMs are strong at language but weak at:

- multi-hop relational reasoning over large corpora
- precise topology (paths, connectivity, cycles)
- global sensemaking (“what themes dominate this dataset?”)
- staying faithful to structure without hallucinating links

Graphs supply an **inductive bias**: structure is explicit, traversable, and inspectable. AI systems use that bias in three main layers:

| Layer | Role of the graph |
|-------|-------------------|
| **Representation** | Encode entities/relations (KGs, text-attributed graphs) |
| **Learning** | Message-passing / GNNs, or LLM tools that walk the graph |
| **Control** | Agent workflows as DAGs; retrieval as graph search |

---

## 2. Core graph ideas used in AI

These classical notions keep reappearing in AI systems:

| Concept | AI use |
|---------|--------|
| **Neighborhood / k-hop** | Local context for a node; multi-hop QA |
| **Path / shortest path** | Provenance chains; “how are A and B related?” |
| **Degree / centrality** | Ranking important entities; PageRank-style retrieval |
| **Community detection** (Louvain, Leiden, k-core) | Theme clusters; hierarchical GraphRAG summaries |
| **DAG / topological order** | Pipelines, agent stage graphs, dependency resolution |
| **Hypergraphs** | Relations that bind >2 entities (facts, events) |
| **Heterogeneous graphs** | Mixed node/edge types (user, doc, code, ticket) |

Practical rule: **vector RAG** finds similar chunks; **graph RAG / search** finds *connected* evidence.

---

## 3. Graph Neural Networks (GNNs)

**Idea:** each node updates its embedding by aggregating messages from neighbors (message passing).

Common families:

- **GCN / GraphSAGE / GAT** — node classification, link prediction, recommendation
- **Text-attributed graphs (TAGs)** — nodes carry text; combine GNN structure with language models
- **Graph Transformers** — attention over graph structure or sampled subgraphs

**Strengths:** strong on fixed-topology prediction tasks; efficient at scale with sampling.  
**Limits:** often need labeled graphs; less natural for open-ended NL Q&A than LLM+graph hybrids.

**2026 shift:** less “train a GNN end-to-end on everything,” more “give an LLM *graph-native tools* and let it explore.”

---

## 4. Knowledge graphs + GraphRAG

### Baseline RAG vs GraphRAG

- **Baseline RAG:** embed chunks → nearest-neighbor retrieve → generate.
- **GraphRAG:** extract entities/relations → build a KG → community hierarchy + summaries → retrieve structure-aware context.

Microsoft Research GraphRAG ([docs](https://microsoft.github.io/graphrag/)) popularized:

1. LLM extraction of a knowledge graph from a corpus  
2. Community detection (historically Leiden)  
3. Community summaries for **global** questions  
4. Local / DRIFT-style search for entity-centric questions  

**When GraphRAG helps**

- Multi-hop / relational questions  
- “Theme / overview of the whole corpus” questions  
- Need for path-level provenance  

**When it may not**

- Simple fact lookup (dense RAG often wins on cost/latency)  
- High graph-construction cost vs query volume  
- Noisy extraction → hallucinated edges  

Recent evaluations (e.g. RAG vs GraphRAG surveys, agentic-search benchmarks) emphasize: **match structure cost to query complexity**; agentic search can sometimes substitute for a heavy static graph by discovering structure at inference time.

---

## 5. Frontier (2025–2026): agentic graph learning

The live research trend is **agents that navigate graphs**, often trained with RL, instead of one-shot retrieval over a frozen index.

### Patterns

1. **Graph as environment** — nodes/edges are the world; actions = retrieve neighbor, traverse, edit, answer.  
2. **Graph-native tools** — local neighborhood, multi-hop walk, global structural probes, semantic retrieval.  
3. **Hypergraphs** — higher-order facts as hyperedges; better fit for multi-entity statements.  
4. **Self-evolving graphs** — agent can expand/correct the graph during reasoning (search → edit → re-retrieve).  
5. **Plane separation** — LLM plans in natural language; deterministic engines execute graph ops (analytics, code interpreter).

### Notable systems (pointers)

| System | Idea |
|--------|------|
| **AgentGL** (ACL 2026) | RL agent for text-attributed graph tasks; topology-aware tools + curriculum RL |
| **GRASP** | Neighbor probing + code interpreter; staged RL for structural awareness |
| **Graph-R1** | Agentic GraphRAG via end-to-end RL over a knowledge hypergraph |
| **Youtu-GraphRAG** | Schema-guided construction + community tree + agentic IRCoT retrieval |
| **EvoGraph-R1** | Self-evolving multimodal hypergraphs (retrieve / web / edit / answer) |
| **GraphSeek** | Semantic catalog + plan/execute split for industry-scale graph analytics |

Common result claims: better multi-hop accuracy, lower wasted tokens when search is constrained, and better generalization when the agent must *discover* topology rather than dump the whole graph into context.

---

## 6. How this maps to agent / product systems

Even without a formal KG product, agent stacks already *are* graphs:

| Product concern | Graph view |
|-----------------|------------|
| Closed-loop stages (`product-spec → … → release`) | DAG with loop-back edges |
| Specialist delegation | Bipartite / hierarchical task graph |
| Code + docs + issues | Heterogeneous dependency / citation graph |
| Learnings / memory | Temporal knowledge graph (fact, source, validity) |
| Multi-agent handoffs | Message edges with typed payloads |

### Design takeaways for agent orchestration

1. **Prefer explicit topology over giant prompts** — give tools to walk a stage/dep/knowledge graph.  
2. **Separate plan vs execute** — LLM chooses *which* edge/node; code/DB does the traversal.  
3. **Budget search** — unconstrained graph walking burns tokens; constrain with curriculum, rewards, or hard hop limits.  
4. **Schema before extraction** — seed entity/relation types; expand from feedback (Youtu-style).  
5. **Use communities for “global” questions**, local neighborhoods for “entity” questions.  
6. **Treat memory as a graph** — facts linked to sources beat a flat vector store for “why did we decide X?”

---

## 7. Suggested learning path

1. **Graphs 101:** adjacency, BFS/DFS, shortest paths, DAGs, centrality.  
2. **GNNs:** one pass over GCN / GraphSAGE / GAT intuition (message passing).  
3. **KGs:** RDF/property graphs; entity–relation extraction quality problems.  
4. **GraphRAG:** Microsoft GraphRAG pipeline; community summaries.  
5. **Agentic graphs:** Graph-R1 / AgentGL-style tool-using agents over graphs.  
6. **Apply locally:** model your workflow, docs, or domain entities as a small typed graph and add retrieval tools before training anything.

---

## 8. Open questions worth tracking

- When does a **static GraphRAG index** beat **agentic search without a prebuilt graph**?  
- How to keep extracted graphs **fresh** under streaming docs?  
- Best **reward signals** for RL graph agents (accuracy vs hops vs token cost)?  
- Evaluation that blocks **structural hallucination** (fake edges / wrong paths).  
- Hypergraphs vs simple graphs for enterprise RAG cost/quality.

---

## 9. Sources

- Microsoft GraphRAG — https://microsoft.github.io/graphrag/  
- AgentGL — https://github.com/sunyuanfu/AgentGL (ACL 2026)  
- GRASP — https://github.com/PKU-ML/GRASP  
- Graph-R1 — https://arxiv.org/abs/2507.21892  
- Youtu-GraphRAG — https://arxiv.org/html/2508.19855  
- EvoGraph-R1 — https://arxiv.org/html/2607.12764  
- GraphSeek — https://arxiv.org/html/2602.11052  
- RAG vs GraphRAG survey — https://arxiv.org/html/2502.11371  
- “Do We Still Need GraphRAG?” (agentic search benchmarks) — https://arxiv.org/pdf/2604.09666  

---

## 10. Relevance to this repo

`building-blocks` already encodes a **stage DAG** in the closed-loop skill (`skills/closed-loop/stages.md`): ordered stages, parallel quality gates, and failure loop-backs. That is graph control flow.

---

## 11. GraphRAG — mechanics (deeper)

### Indexing pipeline

```
corpus chunks
  → LLM entity/relation extraction (schema-bounded if possible)
  → property graph (entities, relations, claims, sources)
  → community detection (Leiden / Louvain / k-core)
  → community summaries (bottom-up hierarchy)
  → optional embeddings on nodes + community reports
```

### Query modes

| Mode | Question shape | Mechanism |
|------|----------------|-----------|
| **Local** | “What do we know about X?” | Seed entity → neighborhood / DRIFT fan-out |
| **Global** | “What themes dominate?” | Map-reduce over community summaries |
| **Multi-hop** | “How does A connect to B?” | Path search + evidence assembly |
| **Agentic** | Open-ended / adaptive | Tool loop: think → traverse → reflect → answer |

### Cost / quality trade-offs

- **Construction** is the expensive part (LLM extraction over the whole corpus).
- **Query** can be cheaper than stuffing large retrieved chunks if communities compress well.
- Extraction noise creates **false edges**; schema seeds + human review of high-degree nodes help.
- Dense RAG still wins for single-fact lookups — use GraphRAG when relations matter.

### Design rule of thumb

Prefer GraphRAG when answers require **join-like** reasoning across documents. Prefer dense RAG when answers are **lookup-like**. Prefer agentic graph walk when the graph is huge and one-shot context injection is impossible.

---

## 12. GNNs — mechanics (deeper)

### Message passing (one layer)

For node \(v\) at layer \(\ell\):

1. **Gather** messages from neighbors \(u \in N(v)\)  
2. **Aggregate** (sum / mean / max / attention)  
3. **Update** \(h_v^{(\ell+1)} = \mathrm{Update}(h_v^{(\ell)}, m_v)\)

Stacking \(L\) layers ≈ \(L\)-hop receptive field. Too deep → over-smoothing (all nodes look alike).

### Why LLMs + tools are eating pure GNN Q&A

| Pure GNN | LLM + graph tools |
|----------|-------------------|
| Needs labels / task head | Works with NL goals |
| Fixed graph at train time | Can edit / expand graph |
| Great at structural prediction | Great at explanation + open tasks |
| Hard to inject new docs | Tools re-query live graph |

Keep GNNs where they shine: recommendations, fraud rings, molecule property prediction, link prediction at scale. For agent memory and codebase reasoning, **typed graphs + traversal tools** are the pragmatic default.

---

## 13. Prototype in this repo (shipped)

### What we built

A **GraphRAG-lite memory graph** over `loop/learnings.jsonl`:

| Piece | Path |
|-------|------|
| Graph core | `orchestrator/src/memory-graph.ts` |
| Tests | `orchestrator/src/memory-graph.test.ts` |
| CLI | `yarn memory` → `orchestrator/src/memory-cli.ts` |
| Loop wiring | `loadLearningsForStage` in `retro.ts`, used by `loop.ts` |

### Schema

**Nodes:** `learning`, `agent`, `topic`, `kind`, `file`, `status`  
**Edges:** `authored_by`, `about_topic`, `of_kind`, `targets_agent`, `cites`, `has_status`

### Queries

```bash
yarn --cwd orchestrator memory stats
yarn --cwd orchestrator memory agent implementer
yarn --cwd orchestrator memory topic Security
yarn --cwd orchestrator memory file antiCheat
yarn --cwd orchestrator memory path "grepping" "quality gate"
```

### How the loop uses it

Each dispatched stage now gets:

1. Standing rules + recently applied (markdown excerpt), **plus**
2. A **graph-scoped** excerpt ranked for that agent and its default topics

So `security-reviewer` sees Security-community + agent-targeted learnings instead of a flat dump of the whole ledger.

### Snapshot on current ledger

Against the committed `loop/learnings.jsonl` (~279 entries): on the order of **~20 agents**, **~38 topics**, **~117 files**, **~1.9k edges**. That is enough topology for neighborhood / path queries without a vector DB.

### Next increments (not in this change)

1. Add handoff nodes (`stage` → `handoff` → `learning`) for temporal provenance.  
2. Optional embeddings on learning nodes for hybrid vector+graph retrieval.  
3. Expose `neighbors` / `path` as agent tools (agentic GraphRAG), not only precomputed excerpts.  
4. Community summaries for standing-rule clusters (true global GraphRAG).
