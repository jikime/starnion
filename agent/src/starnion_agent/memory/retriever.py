"""Hybrid memory retriever: Vector + Full-Text Search with RRF merge.

Searches across 6 sources (daily_logs, knowledge_base, diary_entries,
memos, document_sections, finances) using both vector similarity and
full-text search, then merges results via Reciprocal Rank Fusion (RRF).
"""

import asyncio
import logging
from typing import Any

from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import daily_log as daily_log_repo
from starnion_agent.db.repositories import diary_entry as diary_entry_repo
from starnion_agent.db.repositories import document as document_repo
from starnion_agent.db.repositories import finance as finance_repo
from starnion_agent.db.repositories import knowledge as knowledge_repo
from starnion_agent.db.repositories import memo_db as memo_db_repo
from starnion_agent.db.repositories import user_search_db as user_search_db_repo
from starnion_agent.embedding.service import embed_text

logger = logging.getLogger(__name__)

# RRF constant from the original paper (Cormack et al., 2009).
RRF_K = 60


def _rrf_merge(
    vector_results: list[dict[str, Any]],
    fulltext_results: list[dict[str, Any]],
    id_key: str = "id",
    k: int = RRF_K,
) -> list[dict[str, Any]]:
    """Merge vector and full-text results using Reciprocal Rank Fusion.

    For each result list, the RRF score contribution is 1 / (k + rank + 1)
    where rank is the 0-based position in the list.  Results appearing in
    both lists get summed scores.

    Args:
        vector_results: Results from vector similarity search.
        fulltext_results: Results from full-text search.
        id_key: Dictionary key used to identify unique results.
        k: RRF constant (default 60).

    Returns:
        Deduplicated results sorted by RRF score descending, with a
        normalised ``similarity`` field in [0, 1].
    """
    scores: dict[Any, float] = {}
    entries: dict[Any, dict[str, Any]] = {}

    for rank, r in enumerate(vector_results):
        rid = r[id_key]
        scores[rid] = scores.get(rid, 0.0) + 1.0 / (k + rank + 1)
        entries.setdefault(rid, r)

    for rank, r in enumerate(fulltext_results):
        rid = r[id_key]
        scores[rid] = scores.get(rid, 0.0) + 1.0 / (k + rank + 1)
        entries.setdefault(rid, r)

    if not scores:
        return []

    # Normalise scores to [0, 1].
    max_score = max(scores.values())
    merged = []
    for rid, score in scores.items():
        entry = dict(entries[rid])
        entry["similarity"] = score / max_score if max_score > 0 else 0.0
        merged.append(entry)

    merged.sort(key=lambda x: x["similarity"], reverse=True)
    return merged


async def search(
    query: str,
    user_id: str,
    top_k: int = 5,
    threshold: float = 0.3,
) -> list[dict[str, Any]]:
    """Search across all memory layers using hybrid vector + full-text search.

    Runs 11 queries in parallel (5 vector + 5 full-text + 1 finance),
    merges per-source results via RRF, tags sources, and returns the
    top_k results.

    Args:
        query: The search query text.
        user_id: Filter results to this user.
        top_k: Maximum total results to return.
        threshold: Minimum cosine similarity for vector search.

    Returns:
        Merged and ranked list of memory entries.
    """
    pool = get_pool()
    query_embedding = await embed_text(query)

    # Run all searches in parallel.
    (
        log_vec,
        log_ft,
        kb_vec,
        kb_ft,
        diary_vec,
        diary_ft,
        memo_vec,
        memo_ft,
        doc_vec,
        doc_ft,
        finance_results,
        search_vec,
        search_ft,
    ) = await asyncio.gather(
        daily_log_repo.search_similar(
            pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
        ),
        daily_log_repo.search_fulltext(pool, user_id, query, top_k=top_k),
        knowledge_repo.search_similar(
            pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
        ),
        knowledge_repo.search_fulltext(pool, user_id, query, top_k=top_k),
        diary_entry_repo.search_similar(
            pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
        ),
        diary_entry_repo.search_fulltext(pool, user_id, query, top_k=top_k),
        memo_db_repo.search_similar(
            pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
        ),
        memo_db_repo.search_fulltext(pool, user_id, query, top_k=top_k),
        document_repo.search_by_user(
            pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
        ),
        document_repo.search_fulltext_by_user(pool, user_id, query, top_k=top_k),
        finance_repo.get_recent(pool, user_id=user_id, limit=top_k),
        user_search_db_repo.search_similar(
            pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
        ),
        user_search_db_repo.search_fulltext(pool, user_id, query, top_k=top_k),
    )

    # Per-source RRF merge.
    log_merged = _rrf_merge(log_vec, log_ft)
    kb_merged = _rrf_merge(kb_vec, kb_ft)
    diary_merged = _rrf_merge(diary_vec, diary_ft)
    memo_merged = _rrf_merge(memo_vec, memo_ft)
    doc_merged = _rrf_merge(doc_vec, doc_ft)
    search_merged = _rrf_merge(search_vec, search_ft)

    # Tag sources and normalise content field.
    for r in log_merged:
        r["source"] = "daily_log"
    for r in kb_merged:
        r["source"] = "knowledge"
    for r in diary_merged:
        r["source"] = "diary"
        # Prepend mood/date context for better LLM grounding.
        mood = r.get("mood", "")
        entry_date = r.get("entry_date", "")
        prefix = f"[일기 {entry_date}" + (f", 기분: {mood}" if mood else "") + "] "
        r.setdefault("content", "")
        r["content"] = prefix + r["content"]
    for r in memo_merged:
        r["source"] = "memo"
        title = r.get("title", "")
        if title:
            r["content"] = f"[메모: {title}] " + r.get("content", "")
    for r in doc_merged:
        r["source"] = "document"
    for r in finance_results:
        r["source"] = "finance"
        desc = f" ({r['description']})" if r.get("description") else ""
        r["content"] = f"{r['category']} {r['amount']:,}원{desc}"
        r["similarity"] = 0.5
    for r in search_merged:
        r["source"] = "web_search"
        r["content"] = f"[웹검색: {r.get('query', '')}] {r.get('result', '')[:200]}"

    all_results = (
        log_merged + kb_merged + diary_merged + memo_merged
        + doc_merged + finance_results + search_merged
    )
    all_results.sort(key=lambda x: x.get("similarity", 0), reverse=True)

    return all_results[:top_k]
