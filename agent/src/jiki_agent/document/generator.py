"""Document generation: create documents in various formats."""

from io import BytesIO


def generate_pdf(title: str, content: str) -> bytes:
    """Generate a PDF document from text content."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    # Use built-in Helvetica (no Korean support, but functional for basic text).
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.set_font("Helvetica", "", 11)
    # fpdf2 multi_cell handles line wrapping.
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
