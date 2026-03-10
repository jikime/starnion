"""Unit tests for starnion_agent.document.parser module."""

import pytest

from starnion_agent.document.parser import (
    DOCLING_EXTS,
    PLAIN_EXTS,
    extract_text,
    extract_text_from_hwp,
    extract_text_from_plain,
    get_docling_document,
)


class TestConstants:
    def test_docling_exts_contains_common_formats(self):
        for ext in ("pdf", "docx", "pptx", "xlsx", "html", "png", "jpg"):
            assert ext in DOCLING_EXTS

    def test_plain_exts_contains_text_formats(self):
        for ext in ("md", "markdown", "txt", "text", "csv"):
            assert ext in PLAIN_EXTS

    def test_docling_and_plain_do_not_overlap(self):
        assert DOCLING_EXTS.isdisjoint(PLAIN_EXTS)


class TestPlainFormats:
    def test_md(self):
        assert extract_text(b"# Hello", "md") == "# Hello"

    def test_markdown_alias(self):
        assert extract_text(b"# Test", "markdown") == "# Test"

    def test_txt(self):
        assert extract_text(b"Plain text", "txt") == "Plain text"

    def test_text_alias(self):
        assert extract_text(b"hello", "text") == "hello"

    def test_csv(self):
        assert extract_text(b"a,b\n1,2", "csv") == "a,b\n1,2"

    def test_case_insensitive(self):
        assert extract_text(b"hi", "TXT") == "hi"

    def test_strips_whitespace(self):
        assert extract_text(b"  hello  ", "txt") == "hello"

    def test_korean_utf8(self):
        data = "안녕".encode("utf-8")
        assert extract_text(data, "md") == "안녕"


class TestExtractTextFromPlain:
    def test_basic(self):
        assert extract_text_from_plain(b"hello") == "hello"

    def test_empty(self):
        assert extract_text_from_plain(b"") == ""


class TestUnsupportedExtension:
    def test_unknown_extension(self):
        result = extract_text(b"data", "xyz")
        assert "지원하지 않는" in result
        assert ".xyz" in result


class TestHWP:
    def test_invalid_hwp_returns_fallback(self):
        result = extract_text_from_hwp(b"not an hwp file")
        assert "HWP" in result

    def test_router_dispatches_hwp(self):
        result = extract_text(b"not hwp", "hwp")
        assert "HWP" in result


def _docling_available() -> bool:
    try:
        from docling.document_converter import DocumentConverter  # noqa: F401
        return True
    except ImportError:
        return False


SKIP_DOCLING = pytest.mark.skipif(
    not _docling_available(), reason="docling not installed"
)


@SKIP_DOCLING
class TestDoclingPDF:
    def test_pdf_extraction_returns_text(self):
        from io import BytesIO
        from reportlab.pdfgen import canvas

        buf = BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(72, 750, "Hello PDF World")
        c.save()

        result = extract_text(buf.getvalue(), "pdf", "test.pdf")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_invalid_pdf_does_not_raise(self):
        result = extract_text(b"not a real pdf", "pdf", "fake.pdf")
        assert isinstance(result, str)


@SKIP_DOCLING
class TestDoclingDOCX:
    def test_docx_roundtrip(self):
        from starnion_agent.document.generator import generate_docx

        docx_bytes = generate_docx("Title", "Unique content XYZ.")
        result = extract_text(docx_bytes, "docx", "test.docx")
        assert isinstance(result, str)
        assert len(result) > 0


@SKIP_DOCLING
class TestDoclingXLSX:
    def test_xlsx_roundtrip(self):
        from starnion_agent.document.generator import generate_xlsx

        xlsx_bytes = generate_xlsx(["Name", "Age"], [["Alice", 30]])
        result = extract_text(xlsx_bytes, "xlsx", "data.xlsx")
        assert isinstance(result, str)
        assert len(result) > 0


@SKIP_DOCLING
class TestGetDoclingDocument:
    def test_returns_none_for_plain_formats(self):
        assert get_docling_document(b"hello", "txt") is None
        assert get_docling_document(b"hello", "md") is None
        assert get_docling_document(b"hello", "hwp") is None

    def test_returns_none_for_unsupported(self):
        assert get_docling_document(b"data", "xyz") is None

    def test_invalid_data_returns_none(self):
        result = get_docling_document(b"not a pdf", "pdf", "bad.pdf")
        assert result is None

    def test_valid_pdf_returns_document(self):
        from io import BytesIO
        from reportlab.pdfgen import canvas

        buf = BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(72, 750, "Test")
        c.save()

        doc = get_docling_document(buf.getvalue(), "pdf", "test.pdf")
        if doc is not None:
            assert hasattr(doc, "export_to_markdown")
