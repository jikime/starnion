"""Unit tests for jiki_agent.skills.file_context module.

Tests cover:
- add_pending_file: Adding files to the context-local queue
- pop_pending_files: Retrieving and clearing the queue
- Isolation between add/pop cycles
"""

from jiki_agent.skills.file_context import add_pending_file, pop_pending_files


class TestAddPendingFile:
    """Tests for the add_pending_file function."""

    def test_add_single_file(self):
        """Adding a single file makes it retrievable."""
        pop_pending_files()  # clear any leftovers

        add_pending_file(b"hello", "test.txt", "text/plain")
        files = pop_pending_files()

        assert len(files) == 1
        assert files[0]["data"] == b"hello"
        assert files[0]["name"] == "test.txt"
        assert files[0]["mime"] == "text/plain"

    def test_add_multiple_files(self):
        """Multiple files are returned in order."""
        pop_pending_files()

        add_pending_file(b"img", "a.png", "image/png")
        add_pending_file(b"doc", "b.pdf", "application/pdf")
        files = pop_pending_files()

        assert len(files) == 2
        assert files[0]["name"] == "a.png"
        assert files[1]["name"] == "b.pdf"

    def test_pop_clears_queue(self):
        """After pop, the queue is empty."""
        pop_pending_files()

        add_pending_file(b"data", "file.bin", "application/octet-stream")
        pop_pending_files()

        files = pop_pending_files()
        assert files == []

    def test_pop_empty_returns_empty_list(self):
        """Popping from an empty queue returns an empty list."""
        pop_pending_files()

        files = pop_pending_files()
        assert files == []

    def test_binary_data_preserved(self):
        """Binary data is preserved exactly as provided."""
        pop_pending_files()

        binary = bytes(range(256))
        add_pending_file(binary, "data.bin", "application/octet-stream")
        files = pop_pending_files()

        assert files[0]["data"] == binary
