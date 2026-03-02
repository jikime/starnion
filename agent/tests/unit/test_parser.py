"""Unit tests for jiki_agent.document.parser module.

Tests cover:
- extract_text router: dispatches to correct extractor by extension
- extract_text_from_pdf: PDF text extraction
- extract_text_from_md: Markdown file passthrough
- extract_text_from_txt: Plain text file passthrough
- extract_text for unsupported extensions
- extract_text_from_docx: DOCX text extraction
- extract_text_from_xlsx: XLSX spreadsheet extraction
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
