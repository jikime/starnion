"""Document generation: create documents in various formats."""

from io import BytesIO
from pathlib import Path

# Bundled Noto Sans KR font for Korean/CJK PDF support.
_FONT_DIR = Path(__file__).parent / "fonts"
_NOTO_SANS_KR = _FONT_DIR / "NotoSansKR.ttf"


def generate_pdf(title: str, content: str) -> bytes:
    """Generate a PDF document with full Korean/CJK support."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()

    if _NOTO_SANS_KR.exists():
        pdf.add_font("NotoSansKR", "", str(_NOTO_SANS_KR))
        title_font = ("NotoSansKR", "", 16)
        body_font = ("NotoSansKR", "", 11)
    else:
        title_font = ("Helvetica", "B", 16)
        body_font = ("Helvetica", "", 11)

    pdf.set_font(*title_font)
    pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.set_font(*body_font)
    pdf.multi_cell(0, 6, content)
    return bytes(pdf.output())


def generate_docx(title: str, content: str) -> bytes:
    """Generate a DOCX document from text content."""
    from docx import Document

    doc = Document()
    doc.add_heading(title, level=1)
    for paragraph in content.split("\n\n"):
        if paragraph.strip():
            doc.add_paragraph(paragraph.strip())
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def generate_xlsx(headers: list[str], rows: list[list]) -> bytes:
    """Generate an XLSX spreadsheet from tabular data."""
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def generate_md(title: str, content: str) -> bytes:
    """Generate a Markdown document."""
    text = f"# {title}\n\n{content}"
    return text.encode("utf-8")


def generate_txt(content: str) -> bytes:
    """Generate a plain text document."""
    return content.encode("utf-8")
