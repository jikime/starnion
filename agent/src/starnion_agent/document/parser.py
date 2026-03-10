"""Document parsing: extract text from various document formats.

Docling is used for rich formats (PDF, DOCX, PPTX, XLSX, images).
Plain-text formats (MD, TXT, CSV) are handled directly.
HWP is handled via olefile (Docling does not support HWP).
"""

from __future__ import annotations

import logging
from io import BytesIO

import httpx

logger = logging.getLogger(__name__)

# Formats handled by Docling (rich structure-aware parsing)
DOCLING_EXTS: frozenset[str] = frozenset(
    {"pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls", "html", "png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif"}
)

# Formats handled as plain text
PLAIN_EXTS: frozenset[str] = frozenset({"md", "markdown", "txt", "text", "csv"})

_HWP_FALLBACK = "(HWP 파일에서 텍스트를 추출할 수 없었어요. 다른 포맷으로 변환해서 보내주세요.)"


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------

async def fetch_file(url: str) -> bytes:
    """Download a file from *url* and return its bytes."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


# ---------------------------------------------------------------------------
# Docling-based parsing (PDF, DOCX, PPTX, XLSX, images, …)
# ---------------------------------------------------------------------------

def _get_converter():
    """Lazy-initialise a Docling DocumentConverter (thread-safe singleton)."""
    global _converter  # noqa: PLW0603
    if _converter is None:
        from docling.document_converter import DocumentConverter
        _converter = DocumentConverter()
    return _converter


_converter = None


def parse_with_docling(data: bytes, filename: str):
    """Parse *data* with Docling and return a DoclingDocument.

    Args:
        data: Raw file bytes.
        filename: Original file name (used to detect format).

    Returns:
        docling.document_converter.ConversionResult with `.document` attribute.

    Raises:
        Exception: If Docling conversion fails.
    """
    from docling.datamodel.base_models import DocumentStream

    stream = DocumentStream(name=filename, stream=BytesIO(data))
    converter = _get_converter()
    result = converter.convert(stream)
    return result.document


def docling_to_markdown(data: bytes, filename: str) -> str:
    """Convert *data* with Docling and export as Markdown text.

    Falls back to error message on failure.
    """
    try:
        doc = parse_with_docling(data, filename)
        return doc.export_to_markdown()
    except Exception as exc:
        logger.warning("Docling conversion failed for %s: %s", filename, exc)
        return f"(문서 변환 실패: {exc})"


# ---------------------------------------------------------------------------
# HWP (legacy Korean word processor — Docling does not support this)
# ---------------------------------------------------------------------------

def extract_text_from_hwp(data: bytes) -> str:
    """Extract text from a HWP file (best-effort via olefile)."""
    try:
        import olefile

        ole = olefile.OleFileIO(BytesIO(data))
        if ole.exists("PrvText"):
            raw = ole.openstream("PrvText").read()
            text = raw.decode("utf-16-le", errors="replace")
            ole.close()
            return text.strip()
        ole.close()
        return "(HWP 파일에서 텍스트를 추출할 수 없었어요. PrvText 스트림이 없습니다.)"
    except Exception:
        logger.debug("HWP extraction failed", exc_info=True)
        return _HWP_FALLBACK


# ---------------------------------------------------------------------------
# Plain text formats
# ---------------------------------------------------------------------------

def extract_text_from_plain(data: bytes) -> str:
    """Decode bytes as UTF-8 text."""
    return data.decode("utf-8", errors="replace").strip()


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

def extract_text(data: bytes, ext: str, filename: str | None = None) -> str:
    """Extract text from *data* and return as a plain string.

    For Docling-supported formats, returns Markdown-formatted text which
    preserves tables, headings, and document structure.

    Args:
        data: Raw file bytes.
        ext:  File extension without dot (e.g. "pdf", "docx").
        filename: Original file name — used by Docling for format detection.
                  Defaults to "document.<ext>" when not provided.

    Returns:
        Extracted text, or an error message starting with "(".
    """
    ext = ext.lower()
    fname = filename or f"document.{ext}"

    if ext in DOCLING_EXTS:
        return docling_to_markdown(data, fname)
    if ext == "hwp":
        return extract_text_from_hwp(data)
    if ext in PLAIN_EXTS:
        return extract_text_from_plain(data)

    return f"(지원하지 않는 파일 형식이에요: .{ext})"


def get_docling_document(data: bytes, ext: str, filename: str | None = None):
    """Return a DoclingDocument for Docling-supported formats, or None.

    Use this when you want structure-aware chunking via HierarchicalChunker.
    """
    ext = ext.lower()
    if ext not in DOCLING_EXTS:
        return None
    fname = filename or f"document.{ext}"
    try:
        return parse_with_docling(data, fname)
    except Exception as exc:
        logger.warning("get_docling_document failed for %s: %s", fname, exc)
        return None
