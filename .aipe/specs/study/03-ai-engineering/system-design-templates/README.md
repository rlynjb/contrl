# 03 / system design templates

IK-style interview-prompt reframes for AI/LLM systems. Each file is a 9-bullet template covering the prompt, standard architecture, data model, key components, scale concerns, eval framing, common failure modes, applicability to contrl-mo, and how to make it apply.

**Generated regardless of current applicability.** These templates exist as portable interview artifacts. The `**Applies to this codebase:**` bullet is honest: most don't apply directly to contrl-mo today because contrl-mo isn't a search engine or a support chatbot. The templates still earn their place by giving the reader the IK-style framing every senior+ ML interview will ask about.

## File index

- **[01-search-ranking](./01-search-ranking.md)** — top-k retrieval + ranking system. IK Module 1.
- **[02-tech-support-chatbot](./02-tech-support-chatbot.md)** — RAG-grounded chatbot with escalation. IK Module 5.

## Applies-to-this-codebase

| Template | Applies? | Notes |
|---|---|---|
| 01-search-ranking | no | No search surface in contrl-mo. Recommender (Phase 2C) shares some eval concepts. |
| 02-tech-support-chatbot | no | No support surface. Phase 4 Path C coaching agent shares the RAG-grounded LLM shape. |

## Pattern

Each template uses the 9-labelled-bullet shape exactly:

1. The prompt
2. Standard architecture (ASCII diagram)
3. Data model
4. Key components
5. Scale concerns
6. Eval framing
7. Common failure modes
8. Applies to this codebase
9. How to make it apply
