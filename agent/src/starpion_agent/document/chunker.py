"""Text chunking and embedding storage for documents."""

from starpion_agent.db.pool import get_pool
from starpion_agent.db.repositories import document as document_repo
from starpion_agent.embedding.service import embed_texts


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
            metadata={"chunk_index": idx, "chunk_size": chunk_size, "overlap": overlap},
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
