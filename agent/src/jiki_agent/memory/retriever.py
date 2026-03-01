"""3-layer memory retriever: short-term + long-term (daily_logs) + entity (knowledge_base) + finance."""

import logging
from typing import Any

from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import daily_log as daily_log_repo
from jiki_agent.db.repositories import document as document_repo
from jiki_agent.db.repositories import finance as finance_repo
from jiki_agent.db.repositories import knowledge as knowledge_repo
from jiki_agent.embedding.service import embed_text

logger = logging.getLogger(__name__)


async def search(
    query: str,
    user_id: str,
    top_k: int = 5,
    threshold: float = 0.3,
) -> list[dict[str, Any]]:
    """Search across all memory layers for relevant context.

    Combines results from:
    - daily_logs (long-term, vector search)
    - knowledge_base (entity, vector search)
    - finances (recent records, text match)

    Short-term memory (current conversation) is handled by the LangGraph
    checkpointer and does not need explicit retrieval here.

    Args:
        query: The search query text.
        user_id: Filter results to this user.
        top_k: Maximum total results to return.
        threshold: Minimum cosine similarity score.

    Returns:
        Merged and ranked list of memory entries.
    """
    pool = get_pool()

    # Vector-based search on daily_logs and knowledge_base.
    query_embedding = await embed_text(query)

    log_results = await daily_log_repo.search_similar(
        pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
    )
    knowledge_results = await knowledge_repo.search_similar(
        pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
    )

    # Document sections (vector search across user's uploaded documents).
    document_results = await document_repo.search_by_user(
        pool, user_id, query_embedding, top_k=top_k, threshold=threshold,
    )

    # Recent finance records (no embedding, use recent history).
    finance_results = await finance_repo.get_recent(pool, user_id=user_id, limit=top_k)

    # Tag results with their source layer.
    for r in log_results:
        r["source"] = "daily_log"
    for r in knowledge_results:
        r["source"] = "knowledge"
    for r in document_results:
        r["source"] = "document"
    for r in finance_results:
        r["source"] = "finance"
        # Synthesize a content field for display.
        desc = f" ({r['description']})" if r.get("description") else ""
        r["content"] = f"{r['category']} {r['amount']:,}원{desc}"
        r["similarity"] = 0.5  # Fixed score for recent records.

    merged = log_results + knowledge_results + document_results + finance_results
    merged.sort(key=lambda x: x.get("similarity", 0), reverse=True)

    return merged[:top_k]
