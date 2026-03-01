"""Memory store for conversation history and user context."""


class MemoryStore:
    """Placeholder for persistent memory storage.

    TODO: Implement with PostgreSQL checkpointer for LangGraph.
    """

    def __init__(self) -> None:
        self._store: dict[str, list[dict]] = {}

    async def save_message(self, thread_id: str, message: dict) -> None:
        """Save a message to the conversation history."""
        if thread_id not in self._store:
            self._store[thread_id] = []
        self._store[thread_id].append(message)

    async def get_history(self, thread_id: str, limit: int = 20) -> list[dict]:
        """Retrieve recent conversation history for a thread."""
        messages = self._store.get(thread_id, [])
        return messages[-limit:]

    async def clear(self, thread_id: str) -> None:
        """Clear conversation history for a thread."""
        self._store.pop(thread_id, None)
