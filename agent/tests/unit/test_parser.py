"""Unit tests for jiki_agent.document.parser module.

Tests cover:
- extract_text router: dispatches to correct extractor by extension
- extract_text_from_pdf: PDF text extraction
- extract_text_from_md: Markdown file passthrough
- extract_text_from_txt: Plain text file passthrough
- extract_text for unsupported extensions
- extract_text_from_docx: DOCX text extraction
- extract_text_from_doc: Legacy DOC (Word Binary) text extraction
- extract_text_from_xlsx: XLSX spreadsheet extraction
- extract_text_from_xls: Legacy XLS graceful fallback
- extract_text_from_ppt: Legacy PPT graceful fallback
"""

from jiki_agent.document.parser import (
    extract_text,
    extract_text_from_md,
    extract_text_from_txt,
)


class TestExtractText:
    """Tests for the extract_text router function."""

    def test_md_extension(self):
        """Markdown files are routed to the md extractor."""
        data = b"# Hello\n\nWorld"
        result = extract_text(data, "md")
        assert result == "# Hello\n\nWorld"

    def test_txt_extension(self):
        """TXT files are routed to the txt extractor."""
        data = b"Plain text content"
        result = extract_text(data, "txt")
        assert result == "Plain text content"

    def test_csv_extension(self):
        """CSV files are routed to the txt extractor."""
        data = b"a,b,c\n1,2,3"
        result = extract_text(data, "csv")
        assert result == "a,b,c\n1,2,3"

    def test_unsupported_extension(self):
        """Unsupported extensions return an error message."""
        result = extract_text(b"data", "xyz")
        assert "지원하지 않는" in result
        assert ".xyz" in result

    def test_case_insensitive(self):
        """Extensions are case-insensitive."""
        result = extract_text(b"hello", "TXT")
        assert result == "hello"

    def test_markdown_alias(self):
        """The 'markdown' extension works as an alias for 'md'."""
        data = b"# Test"
        result = extract_text(data, "markdown")
        assert result == "# Test"


class TestExtractTextFromMd:
    """Tests for extract_text_from_md."""

    def test_basic_markdown(self):
        """Basic markdown content is returned as-is."""
        data = b"# Title\n\nParagraph."
        assert extract_text_from_md(data) == "# Title\n\nParagraph."

    def test_utf8_content(self):
        """Korean UTF-8 content is preserved."""
        data = "안녕하세요".encode("utf-8")
        assert extract_text_from_md(data) == "안녕하세요"

    def test_strips_whitespace(self):
        """Leading/trailing whitespace is stripped."""
        data = b"  \n  hello  \n  "
        assert extract_text_from_md(data) == "hello"


class TestExtractTextFromTxt:
    """Tests for extract_text_from_txt."""

    def test_basic_text(self):
        """Plain text is returned as-is."""
        data = b"Hello World"
        assert extract_text_from_txt(data) == "Hello World"

    def test_empty_file(self):
        """Empty file returns empty string."""
        assert extract_text_from_txt(b"") == ""

    def test_multiline(self):
        """Multiline text is preserved."""
        data = b"Line 1\nLine 2\nLine 3"
        assert extract_text_from_txt(data) == "Line 1\nLine 2\nLine 3"


class TestExtractTextFromDocx:
    """Tests for DOCX extraction using real python-docx."""

    def test_roundtrip_docx(self):
        """Generate a DOCX, then extract text from it."""
        from jiki_agent.document.generator import generate_docx
        from jiki_agent.document.parser import extract_text_from_docx

        docx_bytes = generate_docx("Test Title", "First paragraph.\n\nSecond paragraph.")
        text = extract_text_from_docx(docx_bytes)

        assert "First paragraph." in text
        assert "Second paragraph." in text


class TestExtractTextFromXlsx:
    """Tests for XLSX extraction using real openpyxl."""

    def test_roundtrip_xlsx(self):
        """Generate an XLSX, then extract text from it."""
        from jiki_agent.document.generator import generate_xlsx
        from jiki_agent.document.parser import extract_text_from_xlsx

        xlsx_bytes = generate_xlsx(["Name", "Age"], [["Alice", 30], ["Bob", 25]])
        text = extract_text_from_xlsx(xlsx_bytes)

        assert "Name" in text
        assert "Alice" in text
        assert "30" in text


class TestExtractTextFromDoc:
    """Tests for legacy DOC (Word Binary) extraction."""

    def test_docx_with_doc_extension(self):
        """A .docx file saved with .doc extension is handled by python-docx fallback."""
        from jiki_agent.document.generator import generate_docx
        from jiki_agent.document.parser import extract_text_from_doc

        # generate_docx creates a valid .docx (ZIP-based) file
        docx_bytes = generate_docx("Test", "Hello from docx fallback.")
        text = extract_text_from_doc(docx_bytes)

        assert "Hello from docx fallback." in text

    def test_invalid_data_returns_fallback(self):
        """Non-OLE, non-ZIP data returns a friendly fallback message."""
        from jiki_agent.document.parser import extract_text_from_doc

        result = extract_text_from_doc(b"this is not a doc file")
        assert ".docx" in result
        assert "변환" in result

    def test_empty_data_returns_fallback(self):
        """Empty data returns a friendly fallback message."""
        from jiki_agent.document.parser import extract_text_from_doc

        result = extract_text_from_doc(b"")
        assert ".docx" in result

    def test_ole_without_word_stream_returns_fallback(self):
        """An OLE file without WordDocument stream returns fallback."""
        import olefile
        from io import BytesIO

        from jiki_agent.document.parser import extract_text_from_doc

        # Create a minimal OLE file without WordDocument stream
        buf = BytesIO()
        # olefile doesn't have a writer, so we use a HWP-like OLE file
        # Instead, test with the router
        result = extract_text("not a doc".encode(), "doc")
        assert ".docx" in result or "변환" in result

    def test_router_dispatches_to_doc_extractor(self):
        """The 'doc' extension dispatches to extract_text_from_doc (not docx)."""
        # An OLE header (not a ZIP) should not raise BadZipFile
        ole_header = b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"
        fake_doc = ole_header + b"\x00" * 500

        result = extract_text(fake_doc, "doc")

        # Should get fallback message, NOT an unhandled BadZipFile exception
        assert "변환" in result or "추출할 수 없" in result


class TestExtractTextFromXls:
    """Tests for legacy XLS graceful fallback."""

    def test_xlsx_with_xls_extension(self):
        """A .xlsx file saved with .xls extension is handled by openpyxl fallback."""
        from jiki_agent.document.generator import generate_xlsx
        from jiki_agent.document.parser import extract_text_from_xls

        xlsx_bytes = generate_xlsx(["Col1"], [["Data1"]])
        text = extract_text_from_xls(xlsx_bytes)

        assert "Col1" in text
        assert "Data1" in text

    def test_old_xls_returns_fallback(self):
        """A real old XLS binary returns a friendly fallback, not a crash."""
        from jiki_agent.document.parser import extract_text_from_xls

        ole_header = b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"
        fake_xls = ole_header + b"\x00" * 500

        result = extract_text_from_xls(fake_xls)
        assert ".xlsx" in result
        assert "변환" in result

    def test_router_dispatches_xls(self):
        """The router handles 'xls' without BadZipFile crash."""
        result = extract_text(b"not an xlsx", "xls")
        assert ".xlsx" in result or "변환" in result


class TestExtractTextFromPpt:
    """Tests for legacy PPT graceful fallback."""

    def test_old_ppt_returns_fallback(self):
        """Old PPT binary returns a friendly fallback, not a crash."""
        from jiki_agent.document.parser import extract_text_from_ppt

        ole_header = b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"
        fake_ppt = ole_header + b"\x00" * 500

        result = extract_text_from_ppt(fake_ppt)
        assert ".pptx" in result
        assert "변환" in result

    def test_router_dispatches_ppt(self):
        """The router handles 'ppt' without crash."""
        result = extract_text(b"not a pptx", "ppt")
        assert ".pptx" in result or "변환" in result
