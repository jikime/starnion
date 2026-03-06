"""Safe math expression calculator tool."""

import ast
import logging
import math
import operator

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starpion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_MAX_EXPRESSION_LENGTH = 500

# Safe binary/unary operators.
_SAFE_BIN_OPS: dict[type, object] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_SAFE_UNARY_OPS: dict[type, object] = {
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

# Safe functions and constants.
_SAFE_NAMES: dict[str, object] = {
    "sqrt": math.sqrt,
    "abs": abs,
    "round": round,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "log2": math.log2,
    "ceil": math.ceil,
    "floor": math.floor,
    "pi": math.pi,
    "e": math.e,
}


class CalculateInput(BaseModel):
    """Input schema for calculate tool."""

    expression: str = Field(
        description="계산할 수식 (예: 2+3*4, sqrt(16), sin(pi/2))",
    )


def _safe_eval(node: ast.AST) -> float | int:
    """Recursively evaluate an AST node with only safe operations."""
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f"허용되지 않는 상수: {node.value!r}")

    if isinstance(node, ast.Name):
        if node.id in _SAFE_NAMES:
            val = _SAFE_NAMES[node.id]
            if isinstance(val, (int, float)):
                return val
            raise ValueError(f"'{node.id}'는 함수입니다. {node.id}(값) 형태로 사용하세요.")
        raise ValueError(f"알 수 없는 이름: '{node.id}'")

    if isinstance(node, ast.BinOp):
        op_func = _SAFE_BIN_OPS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"허용되지 않는 연산자: {type(node.op).__name__}")
        left = _safe_eval(node.left)
        right = _safe_eval(node.right)
        # Guard against excessively large exponents.
        if isinstance(node.op, ast.Pow) and isinstance(right, (int, float)) and right > 1000:
            raise ValueError("지수가 너무 커요. 1000 이하로 입력해 주세요.")
        return op_func(left, right)

    if isinstance(node, ast.UnaryOp):
        op_func = _SAFE_UNARY_OPS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"허용되지 않는 단항 연산자: {type(node.op).__name__}")
        return op_func(_safe_eval(node.operand))

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("허용되지 않는 함수 호출이에요.")
        func_name = node.func.id
        if func_name not in _SAFE_NAMES:
            raise ValueError(f"알 수 없는 함수: '{func_name}'")
        func = _SAFE_NAMES[func_name]
        if not callable(func):
            raise ValueError(f"'{func_name}'는 함수가 아니에요.")
        args = [_safe_eval(arg) for arg in node.args]
        return func(*args)

    raise ValueError("허용되지 않는 수식이에요.")


def _format_result(value: float | int) -> str:
    """Format a numeric result for display."""
    if isinstance(value, float):
        if value == int(value) and abs(value) < 1e15:
            return f"{int(value):,}"
        return f"{value:,.6g}"
    return f"{value:,}"


@tool(args_schema=CalculateInput)
@skill_guard("calculator")
async def calculate(expression: str) -> str:
    """수학 수식을 계산합니다. 사칙연산, 거듭제곱, 수학 함수(sqrt, sin, cos 등)를 지원합니다."""
    if not expression or not expression.strip():
        return "계산할 수식을 입력해 주세요."

    expression = expression.strip()

    if len(expression) > _MAX_EXPRESSION_LENGTH:
        return f"수식이 너무 길어요. {_MAX_EXPRESSION_LENGTH}자 이하로 입력해 주세요."

    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError:
        return "수식 형식이 올바르지 않아요. 예: 2+3*4, sqrt(16)"

    try:
        result = _safe_eval(tree)
    except ZeroDivisionError:
        return "0으로 나눌 수 없어요."
    except ValueError as e:
        return str(e)
    except OverflowError:
        return "계산 결과가 너무 커요."
    except Exception:
        logger.debug("Calculator error", exc_info=True)
        return "계산 중 오류가 발생했어요."

    return f"계산 결과: {_format_result(result)}"
