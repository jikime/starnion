#!/usr/bin/env python3
"""extract_text.py — Extract text from documents using Docling.

Reads file bytes from stdin, outputs extracted text to stdout.

Usage:
    python3 extract_text.py --ext <extension> [--filename <name>]

Stdin:  raw file bytes
Stdout: extracted text (UTF-8)
Stderr: error messages
Exit:   0 on success, 1 on failure
"""
import argparse
import sys

# Formats handled by Docling (rich structure-aware parsing)
DOCLING_EXTS = frozenset(
    {"pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls",
     "html", "png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif"}
)

# Formats decoded as plain text
PLAIN_EXTS = frozenset({"md", "markdown", "txt", "text", "csv"})


def extract_with_docling(data: bytes, filename: str) -> str:
    try:
        from io import BytesIO
        from docling.datamodel.base_models import DocumentStream
        from docling.document_converter import DocumentConverter

        stream = DocumentStream(name=filename, stream=BytesIO(data))
        converter = DocumentConverter()
        result = converter.convert(stream)
        return result.document.export_to_markdown()
    except Exception as exc:
        print(f"Docling conversion failed: {exc}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Extract text from a document")
    parser.add_argument("--ext", required=True, help="File extension without dot (e.g. pdf, docx)")
    parser.add_argument("--filename", default=None, help="Original filename for format detection")
    args = parser.parse_args()

    ext = args.ext.lower().lstrip(".")
    filename = args.filename or f"document.{ext}"

    data = sys.stdin.buffer.read()
    if not data:
        print("No input data received", file=sys.stderr)
        sys.exit(1)

    if ext in PLAIN_EXTS:
        print(data.decode("utf-8", errors="replace").strip())
        return

    if ext == "hwp":
        try:
            import olefile
            from io import BytesIO
            ole = olefile.OleFileIO(BytesIO(data))
            if ole.exists("PrvText"):
                raw = ole.openstream("PrvText").read()
                text = raw.decode("utf-16-le", errors="replace")
                ole.close()
                print(text.strip())
                return
            ole.close()
            print("(Could not extract text from HWP file: PrvText stream not found.)")
            return
        except Exception as exc:
            print(f"HWP extraction failed: {exc}", file=sys.stderr)
            sys.exit(1)

    if ext == "hwpx":
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            from io import BytesIO

            texts = []
            with zipfile.ZipFile(BytesIO(data)) as zf:
                section_files = sorted(
                    n for n in zf.namelist()
                    if n.startswith("Contents/section") and n.endswith(".xml")
                )
                for name in section_files:
                    root = ET.fromstring(zf.read(name))
                    for elem in root.iter():
                        if elem.text and elem.text.strip():
                            texts.append(elem.text.strip())

            if texts:
                print("\n".join(texts))
            else:
                print("(Could not extract text from HWPX file.)")
            return
        except Exception as exc:
            print(f"HWPX extraction failed: {exc}", file=sys.stderr)
            sys.exit(1)

    if ext in DOCLING_EXTS:
        print(extract_with_docling(data, filename))
        return

    print(f"(Unsupported file format: .{ext})", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
