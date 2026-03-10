"""Text chunking and embedding storage for documents.

Two strategies:
1. Docling-aware chunking  — uses HierarchicalChunker on a DoclingDocument.
   Preserves document structure (headings, tables, page numbers).
2. Plain-text chunking     — character-count sliding window (legacy fallback).
"""

from __future__ import annotations

import asyncio
import logging

from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import document as document_repo
from starnion_agent.embedding.service import embed_texts

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Docling-aware chunking
# ---------------------------------------------------------------------------

async def chunk_and_store_docling(
    user_id: str,  # reserved for future per-user ACL filtering
    doc_id: int,
    docling_doc,
    max_tokens: int = 512,  # noqa: ARG001 — reserved for future HybridChunker
) -> int:
    """Chunk a DoclingDocument with HierarchicalChunker and store in DB.

    Each chunk carries rich metadata: headings, page number, doc label.

    Returns the number of sections created.
    """
    from docling.chunking import HierarchicalChunker

    chunker = HierarchicalChunker()
    # Run CPU-bound chunking in thread pool to avoid blocking the event loop
    chunks = await asyncio.get_event_loop().run_in_executor(
        None, lambda: list(chunker.chunk(docling_doc))
    )

    if not chunks:
        return 0

    texts = [c.text for c in chunks]
    embeddings = await embed_texts(texts)
    pool = get_pool()

    for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        # Extract structural metadata from Docling chunk
        meta = chunk.meta if hasattr(chunk, "meta") else None
        headings: list[str] = []
        page_no: int | None = None

        if meta:
            if hasattr(meta, "headings") and meta.headings:
                headings = list(meta.headings)
            if hasattr(meta, "origin") and meta.origin and hasattr(meta.origin, "page_no"):
                page_no = meta.origin.page_no

        await document_repo.create_section(
            pool,
            document_id=doc_id,
            content=chunk.text,
            embedding=emb,
            metadata={
                "chunk_index": idx,
                "parser": "docling",
                "headings": headings,
                "page_no": page_no,
            },
        )

    logger.info("docling chunking: doc_id=%s → %d chunks", doc_id, len(chunks))
    return len(chunks)


# ---------------------------------------------------------------------------
# Plain-text chunking (legacy / fallback)
# ---------------------------------------------------------------------------

async def chunk_and_store(
    user_id: str,
    doc_id: int,
    text: str,
    chunk_size: int = 500,
    overlap: int = 100,
) -> int:
    """Split *text* into overlapping chunks, embed, and store in DB.

    Returns the number of sections created.
    """
    chunks = _split_text(text, chunk_size=chunk_size, overlap=overlap)
    if not chunks:
        return 0

    embeddings = await embed_texts(chunks)
    pool = get_pool()

    for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        await document_repo.create_section(
            pool,
            document_id=doc_id,
            content=chunk,
            embedding=emb,
            metadata={
                "chunk_index": idx,
                "parser": "text",
                "chunk_size": chunk_size,
                "overlap": overlap,
            },
        )

    return len(chunks)


def _split_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    """Split text into chunks by character count with overlap."""
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end].strip())
        start += chunk_size - overlap

    return [c for c in chunks if c]


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

async def process_and_store(
    user_id: str,
    doc_id: int,
    data: bytes,
    ext: str,
    filename: str | None = None,
) -> tuple[str, int]:
    """Parse *data* and store chunks in DB. Returns (extracted_text, section_count).

    Uses Docling for rich formats (PDF, DOCX, PPTX, XLSX, images).
    Falls back to plain-text chunking for HWP, MD, TXT, CSV.
    """
    from starnion_agent.document.parser import (
        DOCLING_EXTS,
        extract_text,
        get_docling_document,
    )

    ext = ext.lower()

    if ext in DOCLING_EXTS:
        # Try Docling structure-aware path
        docling_doc = await asyncio.get_event_loop().run_in_executor(
            None, lambda: get_docling_document(data, ext, filename)
        )
        if docling_doc is not None:
            text = docling_doc.export_to_markdown()
            section_count = await chunk_and_store_docling(user_id, doc_id, docling_doc)
            return text, section_count

    # Fallback: plain text extraction + character chunking
    text = extract_text(data, ext, filename)
    if not text or text.startswith("("):
        return text, 0

    section_count = await chunk_and_store(user_id, doc_id, text)
    return text, section_count
