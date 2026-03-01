"""Document parsing: extract text from images (OCR) and PDF files."""

from io import BytesIO

import httpx
from pypdf import PdfReader


async def fetch_file(url: str) -> bytes:
    """Download a file from *url* and return its bytes."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def extract_text_from_pdf(data: bytes) -> str:
    """Extract text from all pages of a PDF byte-string."""
    reader = PdfReader(BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return "\n\n".join(pages)
