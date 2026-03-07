"""Unit tests for starnion_agent.skills.unitconv.tools module.

Tests cover:
- ``ConvertUnitInput``: Pydantic schema
- ``convert_unit`` tool: All conversion categories (length, weight, temperature,
  volume, area, data)
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from starnion_agent.skills.unitconv.tools import ConvertUnitInput, convert_unit


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestConvertUnitInput:
    def test_valid_input(self):
        model = ConvertUnitInput(value=10, from_unit="km", to_unit="mi")
        assert model.value == 10
        assert model.from_unit == "km"
        assert model.to_unit == "mi"

    def test_missing_value_raises(self):
        with pytest.raises(ValidationError):
            ConvertUnitInput(from_unit="km", to_unit="mi")  # type: ignore[call-arg]

    def test_missing_from_unit_raises(self):
        with pytest.raises(ValidationError):
            ConvertUnitInput(value=10, to_unit="mi")  # type: ignore[call-arg]


# =========================================================================
# convert_unit: validation
# =========================================================================
class TestConvertUnitValidation:
    @pytest.mark.asyncio
    async def test_unknown_from_unit(self):
        result = await convert_unit.ainvoke(
            {"value": 10, "from_unit": "xyz", "to_unit": "km"}
        )
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    async def test_unknown_to_unit(self):
        result = await convert_unit.ainvoke(
            {"value": 10, "from_unit": "km", "to_unit": "xyz"}
        )
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    async def test_different_categories(self):
        result = await convert_unit.ainvoke(
            {"value": 10, "from_unit": "km", "to_unit": "kg"}
        )
        assert "같은 카테고리가 아니" in result

    @pytest.mark.asyncio
    async def test_same_unit(self):
        result = await convert_unit.ainvoke(
            {"value": 10, "from_unit": "km", "to_unit": "km"}
        )
        assert "10" in result


# =========================================================================
# convert_unit: length
# =========================================================================
class TestConvertUnitLength:
    @pytest.mark.asyncio
    async def test_km_to_mi(self):
        result = await convert_unit.ainvoke(
            {"value": 10, "from_unit": "km", "to_unit": "mi"}
        )
        assert "mi" in result
        assert "6.2137" in result

    @pytest.mark.asyncio
    async def test_ft_to_m(self):
        result = await convert_unit.ainvoke(
            {"value": 100, "from_unit": "ft", "to_unit": "m"}
        )
        assert "m" in result
        assert "30.48" in result

    @pytest.mark.asyncio
    async def test_cm_to_in(self):
        result = await convert_unit.ainvoke(
            {"value": 2.54, "from_unit": "cm", "to_unit": "in"}
        )
        assert "in" in result
        # 2.54 cm = 1 inch
        assert "1" in result


# =========================================================================
# convert_unit: weight
# =========================================================================
class TestConvertUnitWeight:
    @pytest.mark.asyncio
    async def test_kg_to_lb(self):
        result = await convert_unit.ainvoke(
            {"value": 1, "from_unit": "kg", "to_unit": "lb"}
        )
        assert "lb" in result
        assert "2.20" in result

    @pytest.mark.asyncio
    async def test_oz_to_g(self):
        result = await convert_unit.ainvoke(
            {"value": 1, "from_unit": "oz", "to_unit": "g"}
        )
        assert "g" in result
        assert "28.3495" in result


# =========================================================================
# convert_unit: temperature
# =========================================================================
class TestConvertUnitTemperature:
    @pytest.mark.asyncio
    async def test_c_to_f(self):
        result = await convert_unit.ainvoke(
            {"value": 0, "from_unit": "C", "to_unit": "F"}
        )
        assert "32" in result

    @pytest.mark.asyncio
    async def test_f_to_c(self):
        result = await convert_unit.ainvoke(
            {"value": 212, "from_unit": "F", "to_unit": "C"}
        )
        assert "100" in result

    @pytest.mark.asyncio
    async def test_c_to_k(self):
        result = await convert_unit.ainvoke(
            {"value": 0, "from_unit": "C", "to_unit": "K"}
        )
        assert "273.15" in result

    @pytest.mark.asyncio
    async def test_k_to_c(self):
        result = await convert_unit.ainvoke(
            {"value": 273.15, "from_unit": "K", "to_unit": "C"}
        )
        assert "0" in result


# =========================================================================
# convert_unit: volume
# =========================================================================
class TestConvertUnitVolume:
    @pytest.mark.asyncio
    async def test_l_to_gal(self):
        result = await convert_unit.ainvoke(
            {"value": 3.78541, "from_unit": "l", "to_unit": "gal"}
        )
        assert "gal" in result
        assert "1" in result

    @pytest.mark.asyncio
    async def test_ml_to_l(self):
        result = await convert_unit.ainvoke(
            {"value": 1000, "from_unit": "ml", "to_unit": "l"}
        )
        assert "1" in result


# =========================================================================
# convert_unit: area
# =========================================================================
class TestConvertUnitArea:
    @pytest.mark.asyncio
    async def test_pyeong_to_sqm(self):
        result = await convert_unit.ainvoke(
            {"value": 30, "from_unit": "pyeong", "to_unit": "sqm"}
        )
        assert "sqm" in result
        assert "99" in result  # 30 * 3.30579 ≈ 99.17

    @pytest.mark.asyncio
    async def test_sqm_to_pyeong(self):
        result = await convert_unit.ainvoke(
            {"value": 100, "from_unit": "sqm", "to_unit": "pyeong"}
        )
        assert "pyeong" in result
        assert "30" in result  # 100 / 3.30579 ≈ 30.25


# =========================================================================
# convert_unit: data
# =========================================================================
class TestConvertUnitData:
    @pytest.mark.asyncio
    async def test_gb_to_mb(self):
        result = await convert_unit.ainvoke(
            {"value": 2, "from_unit": "GB", "to_unit": "MB"}
        )
        assert "2,048" in result

    @pytest.mark.asyncio
    async def test_kb_to_b(self):
        result = await convert_unit.ainvoke(
            {"value": 1, "from_unit": "KB", "to_unit": "B"}
        )
        assert "1,024" in result

    @pytest.mark.asyncio
    async def test_tb_to_gb(self):
        result = await convert_unit.ainvoke(
            {"value": 1, "from_unit": "TB", "to_unit": "GB"}
        )
        assert "1,024" in result
