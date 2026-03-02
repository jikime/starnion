"""Unit tests for jiki_agent.skills.currency.tools module.

Tests cover:
- ``ConvertCurrencyInput`` / ``GetExchangeRateInput``: Pydantic schemas
- ``convert_currency`` tool: Currency conversion with API mocking
- ``get_exchange_rate`` tool: Exchange rate lookup with API mocking
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from jiki_agent.skills.currency.tools import (
    ConvertCurrencyInput,
    GetExchangeRateInput,
    convert_currency,
    get_exchange_rate,
)


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestConvertCurrencyInput:
    def test_valid_input(self):
        model = ConvertCurrencyInput(amount=100, from_currency="USD", to_currency="KRW")
        assert model.amount == 100
        assert model.from_currency == "USD"
        assert model.to_currency == "KRW"

    def test_defaults(self):
        model = ConvertCurrencyInput(amount=50)
        assert model.from_currency == "USD"
        assert model.to_currency == "KRW"

    def test_missing_amount_raises(self):
        with pytest.raises(ValidationError):
            ConvertCurrencyInput()  # type: ignore[call-arg]


class TestGetExchangeRateInput:
    def test_defaults(self):
        model = GetExchangeRateInput()
        assert model.base == "USD"
        assert model.targets == "KRW,EUR,JPY"

    def test_custom(self):
        model = GetExchangeRateInput(base="EUR", targets="USD,GBP")
        assert model.base == "EUR"


# =========================================================================
# Helper: mock httpx response
# =========================================================================
def _mock_httpx_response(json_data: dict, status_code: int = 200):
    """Create a mock httpx response."""
    resp = MagicMock()
    resp.json.return_value = json_data
    resp.status_code = status_code
    if status_code >= 400:
        import httpx

        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=resp
        )
    else:
        resp.raise_for_status.return_value = None
    return resp


def _mock_client(response):
    """Create a mock httpx.AsyncClient context manager."""
    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


# =========================================================================
# convert_currency tool
# =========================================================================
class TestConvertCurrency:
    @pytest.mark.asyncio
    async def test_negative_amount(self):
        result = await convert_currency.ainvoke(
            {"amount": -10, "from_currency": "USD", "to_currency": "KRW"}
        )
        assert "0보다 커야" in result

    @pytest.mark.asyncio
    async def test_same_currency(self):
        result = await convert_currency.ainvoke(
            {"amount": 100, "from_currency": "USD", "to_currency": "USD"}
        )
        assert "같은 통화" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.currency.tools.httpx.AsyncClient")
    async def test_successful_conversion(self, mock_client_cls):
        resp = _mock_httpx_response({
            "amount": 100,
            "base": "USD",
            "date": "2026-03-01",
            "rates": {"KRW": 135000.0},
        })
        mock_client_cls.return_value = _mock_client(resp)
        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=AsyncMock(get=AsyncMock(return_value=resp))
        )

        result = await convert_currency.ainvoke(
            {"amount": 100, "from_currency": "USD", "to_currency": "KRW"}
        )
        assert "135,000" in result
        assert "환율" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.currency.tools.httpx.AsyncClient")
    async def test_unknown_target_currency(self, mock_client_cls):
        resp = _mock_httpx_response({
            "amount": 100,
            "base": "USD",
            "date": "2026-03-01",
            "rates": {},
        })
        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=AsyncMock(get=AsyncMock(return_value=resp))
        )

        result = await convert_currency.ainvoke(
            {"amount": 100, "from_currency": "USD", "to_currency": "XYZ"}
        )
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.currency.tools.httpx.AsyncClient")
    async def test_api_404_error(self, mock_client_cls):
        resp = _mock_httpx_response({}, status_code=404)
        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=AsyncMock(get=AsyncMock(return_value=resp))
        )

        result = await convert_currency.ainvoke(
            {"amount": 100, "from_currency": "INVALID", "to_currency": "KRW"}
        )
        assert "지원하지 않는" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.currency.tools.httpx.AsyncClient")
    async def test_api_network_error(self, mock_client_cls):
        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=AsyncMock(get=AsyncMock(side_effect=Exception("timeout")))
        )

        result = await convert_currency.ainvoke(
            {"amount": 100, "from_currency": "USD", "to_currency": "KRW"}
        )
        assert "오류" in result


# =========================================================================
# get_exchange_rate tool
# =========================================================================
class TestGetExchangeRate:
    @pytest.mark.asyncio
    async def test_empty_targets(self):
        result = await get_exchange_rate.ainvoke({"base": "USD", "targets": ""})
        assert "입력해주세요" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.currency.tools.httpx.AsyncClient")
    async def test_successful_rate_lookup(self, mock_client_cls):
        resp = _mock_httpx_response({
            "base": "USD",
            "date": "2026-03-01",
            "rates": {"KRW": 1350.5, "EUR": 0.92, "JPY": 150.3},
        })
        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=AsyncMock(get=AsyncMock(return_value=resp))
        )

        result = await get_exchange_rate.ainvoke(
            {"base": "USD", "targets": "KRW,EUR,JPY"}
        )
        assert "USD" in result
        assert "KRW" in result
        assert "기준일" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.currency.tools.httpx.AsyncClient")
    async def test_empty_rates_response(self, mock_client_cls):
        resp = _mock_httpx_response({
            "base": "USD",
            "date": "2026-03-01",
            "rates": {},
        })
        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=AsyncMock(get=AsyncMock(return_value=resp))
        )

        result = await get_exchange_rate.ainvoke(
            {"base": "USD", "targets": "XYZ"}
        )
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.currency.tools.httpx.AsyncClient")
    async def test_api_error(self, mock_client_cls):
        mock_client_cls.return_value.__aenter__ = AsyncMock(
            return_value=AsyncMock(get=AsyncMock(side_effect=Exception("fail")))
        )

        result = await get_exchange_rate.ainvoke(
            {"base": "USD", "targets": "KRW"}
        )
        assert "오류" in result
