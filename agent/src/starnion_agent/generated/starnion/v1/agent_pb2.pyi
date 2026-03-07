from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ResponseType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    RESPONSE_TYPE_UNSPECIFIED: _ClassVar[ResponseType]
    TEXT: _ClassVar[ResponseType]
    TOOL_CALL: _ClassVar[ResponseType]
    TOOL_RESULT: _ClassVar[ResponseType]
    ERROR: _ClassVar[ResponseType]
    STREAM_END: _ClassVar[ResponseType]
    FILE: _ClassVar[ResponseType]
RESPONSE_TYPE_UNSPECIFIED: ResponseType
TEXT: ResponseType
TOOL_CALL: ResponseType
TOOL_RESULT: ResponseType
ERROR: ResponseType
STREAM_END: ResponseType
FILE: ResponseType

class ChatRequest(_message.Message):
    __slots__ = ("user_id", "message", "model", "file", "thread_id")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    FILE_FIELD_NUMBER: _ClassVar[int]
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    message: str
    model: str
    file: FileInput
    thread_id: str
    def __init__(self, user_id: _Optional[str] = ..., message: _Optional[str] = ..., model: _Optional[str] = ..., file: _Optional[_Union[FileInput, _Mapping]] = ..., thread_id: _Optional[str] = ...) -> None: ...

class ChatResponse(_message.Message):
    __slots__ = ("content", "type", "tool_name", "tool_result", "file_data", "file_name", "file_mime")
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    TOOL_NAME_FIELD_NUMBER: _ClassVar[int]
    TOOL_RESULT_FIELD_NUMBER: _ClassVar[int]
    FILE_DATA_FIELD_NUMBER: _ClassVar[int]
    FILE_NAME_FIELD_NUMBER: _ClassVar[int]
    FILE_MIME_FIELD_NUMBER: _ClassVar[int]
    content: str
    type: ResponseType
    tool_name: str
    tool_result: str
    file_data: bytes
    file_name: str
    file_mime: str
    def __init__(self, content: _Optional[str] = ..., type: _Optional[_Union[ResponseType, str]] = ..., tool_name: _Optional[str] = ..., tool_result: _Optional[str] = ..., file_data: _Optional[bytes] = ..., file_name: _Optional[str] = ..., file_mime: _Optional[str] = ...) -> None: ...

class FileInput(_message.Message):
    __slots__ = ("file_type", "file_url", "file_name")
    FILE_TYPE_FIELD_NUMBER: _ClassVar[int]
    FILE_URL_FIELD_NUMBER: _ClassVar[int]
    FILE_NAME_FIELD_NUMBER: _ClassVar[int]
    file_type: str
    file_url: str
    file_name: str
    def __init__(self, file_type: _Optional[str] = ..., file_url: _Optional[str] = ..., file_name: _Optional[str] = ...) -> None: ...

class HistoryRequest(_message.Message):
    __slots__ = ("thread_id",)
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    thread_id: str
    def __init__(self, thread_id: _Optional[str] = ...) -> None: ...

class HistoryMessage(_message.Message):
    __slots__ = ("role", "content")
    ROLE_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    role: str
    content: str
    def __init__(self, role: _Optional[str] = ..., content: _Optional[str] = ...) -> None: ...

class HistoryResponse(_message.Message):
    __slots__ = ("messages",)
    MESSAGES_FIELD_NUMBER: _ClassVar[int]
    messages: _containers.RepeatedCompositeFieldContainer[HistoryMessage]
    def __init__(self, messages: _Optional[_Iterable[_Union[HistoryMessage, _Mapping]]] = ...) -> None: ...

class ReportRequest(_message.Message):
    __slots__ = ("user_id", "report_type")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    REPORT_TYPE_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    report_type: str
    def __init__(self, user_id: _Optional[str] = ..., report_type: _Optional[str] = ...) -> None: ...

class ReportResponse(_message.Message):
    __slots__ = ("content", "report_type")
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    REPORT_TYPE_FIELD_NUMBER: _ClassVar[int]
    content: str
    report_type: str
    def __init__(self, content: _Optional[str] = ..., report_type: _Optional[str] = ...) -> None: ...
