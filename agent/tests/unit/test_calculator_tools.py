"""Unit tests for starpion_agent.skills.calculator.tools module.

Tests cover:
- ``CalculateInput``: Pydantic input schema
- ``_safe_eval``: AST-based safe expression evaluator
- ``_format_result``: Number formatting
- ``calculate`` tool: Full tool integration
"""

from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from starpion_agent.skills.calculator.tools import (
    CalculateInput,
    _format_result,
    _safe_eval,
    calculate,
)


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestCalculateInput:
    def test_valid_input(self):
        model = CalculateInput(expression="2+3")
        assert model.expression == "2+3"

    def test_missing_expression_raises(self):
        with pytest.raises(ValidationError):
            CalculateInput()  # type: ignore[call-arg]


# =========================================================================
# _safe_eval
# =========================================================================
class TestSafeEval:
    def _eval(self, expr: str):
        import ast
        tree = ast.parse(expr, mode="eval")
        return _safe_eval(tree)

    def test_addition(self):
        assert self._eval("2+3") == 5

    def test_multiplication_precedence(self):
        assert self._eval("2+3*4") == 14

    def test_division(self):
        assert self._eval("10/3") == pytest.approx(3.333, rel=1e-2)

    def test_floor_division(self):
        assert self._eval("10//3") == 3

    def test_modulo(self):
        assert self._eval("10%3") == 1

    def test_power(self):
        assert self._eval("2**10") == 1024

    def test_negative(self):
        assert self._eval("-5") == -5

    def test_nested_parentheses(self):
        assert self._eval("(2+3)*(4+5)") == 45

    def test_sqrt(self):
        assert self._eval("sqrt(144)") == 12.0

    def test_sin_pi(self):
        assert self._eval("sin(pi/2)") == pytest.approx(1.0)

    def test_cos_zero(self):
        assert self._eval("cos(0)") == 1.0

    def test_log(self):
        assert self._eval("log(e)") == pytest.approx(1.0)

    def test_abs(self):
        assert self._eval("abs(-42)") == 42

    def test_ceil(self):
        assert self._eval("ceil(3.2)") == 4

    def test_floor(self):
        assert self._eval("floor(3.8)") == 3

    def test_round(self):
        assert self._eval("round(3.7)") == 4

    def test_pi_constant(self):
        assert self._eval("pi") == pytest.approx(math.pi)

    def test_e_constant(self):
        assert self._eval("e") == pytest.approx(math.e)

    def test_large_exponent_rejected(self):
        with pytest.raises(ValueError, match="지수가 너무"):
            self._eval("2**10000")

    def test_unknown_name_rejected(self):
        with pytest.raises(ValueError, match="알 수 없는 이름"):
            self._eval("foo")

    def test_unknown_function_rejected(self):
        with pytest.raises(ValueError, match="알 수 없는 함수"):
            self._eval("eval(1)")

    def test_string_constant_rejected(self):
        with pytest.raises(ValueError, match="허용되지 않는 상수"):
            self._eval("'hello'")


# =========================================================================
# _format_result
# =========================================================================
class TestFormatResult:
    def test_integer(self):
        assert _format_result(1234) == "1,234"

    def test_float_whole(self):
        assert _format_result(5.0) == "5"

    def test_float_decimal(self):
        result = _format_result(3.14159)
        assert "3.14159" in result

    def test_large_number(self):
        assert _format_result(1000000) == "1,000,000"

    def test_negative(self):
        assert _format_result(-42) == "-42"


# =========================================================================
# calculate tool
# =========================================================================
class TestCalculate:
    @pytest.mark.asyncio
    async def test_empty_expression(self):
        result = await calculate.ainvoke({"expression": ""})
        assert "수식을 입력" in result

    @pytest.mark.asyncio
    async def test_whitespace_only(self):
        result = await calculate.ainvoke({"expression": "   "})
        assert "수식을 입력" in result

    @pytest.mark.asyncio
    async def test_too_long(self):
        result = await calculate.ainvoke({"expression": "1+" * 300})
        assert "너무 길어요" in result

    @pytest.mark.asyncio
    async def test_invalid_syntax(self):
        result = await calculate.ainvoke({"expression": "2++"})
        assert "올바르지 않" in result

    @pytest.mark.asyncio
    async def test_division_by_zero(self):
        result = await calculate.ainvoke({"expression": "1/0"})
        assert "0으로 나눌 수 없" in result

    @pytest.mark.asyncio
    async def test_successful_calculation(self):
        result = await calculate.ainvoke({"expression": "2+3*4"})
        assert "14" in result
        assert "계산 결과" in result

    @pytest.mark.asyncio
    async def test_sqrt(self):
        result = await calculate.ainvoke({"expression": "sqrt(16)"})
        assert "4" in result

    @pytest.mark.asyncio
    async def test_sin_pi_half(self):
        result = await calculate.ainvoke({"expression": "sin(pi/2)"})
        assert "1" in result

    @pytest.mark.asyncio
    async def test_complex_expression(self):
        result = await calculate.ainvoke({"expression": "(100+200)*0.15"})
        assert "45" in result

    @pytest.mark.asyncio
    async def test_large_exponent_rejected(self):
        result = await calculate.ainvoke({"expression": "2**10000"})
        assert "지수" in result

    @pytest.mark.asyncio
    async def test_forbidden_function(self):
        result = await calculate.ainvoke({"expression": "eval(1)"})
        assert "알 수 없는 함수" in result
