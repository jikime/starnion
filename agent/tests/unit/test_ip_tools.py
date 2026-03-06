"""Unit tests for starpion_agent.skills.ip.tools module.

Tests cover:
- ``LookupIpInput``: Pydantic schema
- ``lookup_ip`` tool: IP geolocation lookup (mocked)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from starpion_agent.skills.ip.tools import LookupIpInput, lookup_ip


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestLookupIpInput:
    def test_default_empty(self):
        model = LookupIpInput()
        assert model.ip == ""

    def test_with_ip(self):
        model = LookupIpInput(ip="8.8.8.8")
        assert model.ip == "8.8.8.8"


# =========================================================================
# lookup_ip: success with specific IP (mocked)
# =========================================================================
class TestLookupIpSuccess:
    @pytest.mark.asyncio
    async def test_ipv4_lookup(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "status": "success",
            "query": "8.8.8.8",
            "country": "United States",
            "regionName": "California",
            "city": "Mountain View",
            "zip": "94035",
            "lat": 37.386,
            "lon": -122.0838,
            "timezone": "America/Los_Angeles",
            "isp": "Google LLC",
            "org": "Google Public DNS",
            "as": "AS15169 Google LLC",
        }
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starpion_agent.skills.ip.tools.httpx.AsyncClient", return_value=mock_client):
            result = await lookup_ip.ainvoke({"ip": "8.8.8.8"})

        assert "8.8.8.8" in result
        assert "United States" in result
        assert "Google" in result
        assert "📡" in result

    @pytest.mark.asyncio
    async def test_result_contains_location(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "status": "success",
            "query": "1.1.1.1",
            "country": "Australia",
            "regionName": "Queensland",
            "city": "South Brisbane",
            "zip": "4101",
            "lat": -27.4766,
            "lon": 153.0166,
            "timezone": "Australia/Brisbane",
            "isp": "Cloudflare, Inc.",
            "org": "APNIC and Cloudflare DNS Resolver project",
            "as": "AS13335 Cloudflare, Inc.",
        }
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starpion_agent.skills.ip.tools.httpx.AsyncClient", return_value=mock_client):
            result = await lookup_ip.ainvoke({"ip": "1.1.1.1"})

        assert "Australia" in result
        assert "Cloudflare" in result
        assert "시간대" in result or "Australia/Brisbane" in result


# =========================================================================
# lookup_ip: domain lookup (mocked)
# =========================================================================
class TestLookupIpDomain:
    @pytest.mark.asyncio
    async def test_domain_lookup(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "status": "success",
            "query": "142.250.196.110",
            "country": "United States",
            "regionName": "California",
            "city": "Los Angeles",
            "zip": "90009",
            "lat": 34.0544,
            "lon": -118.2441,
            "timezone": "America/Los_Angeles",
            "isp": "Google LLC",
            "org": "Google LLC",
            "as": "AS15169 Google LLC",
        }
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starpion_agent.skills.ip.tools.httpx.AsyncClient", return_value=mock_client):
            result = await lookup_ip.ainvoke({"ip": "google.com"})

        assert "United States" in result
        assert "Google" in result
        assert "📡" in result


# =========================================================================
# lookup_ip: public IP lookup (no IP provided)
# =========================================================================
class TestLookupIpPublic:
    @pytest.mark.asyncio
    async def test_no_ip_fetches_public(self):
        # First call: ipify returns public IP.
        ipify_resp = MagicMock()
        ipify_resp.json.return_value = {"ip": "203.0.113.1"}
        ipify_resp.raise_for_status = MagicMock()

        # Second call: ip-api returns geo info.
        geo_resp = MagicMock()
        geo_resp.json.return_value = {
            "status": "success",
            "query": "203.0.113.1",
            "country": "South Korea",
            "regionName": "Seoul",
            "city": "Seoul",
            "zip": "03141",
            "lat": 37.5665,
            "lon": 126.978,
            "timezone": "Asia/Seoul",
            "isp": "Korea Telecom",
            "org": "Korea Telecom",
            "as": "AS4766 Korea Telecom",
        }
        geo_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[ipify_resp, geo_resp])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starpion_agent.skills.ip.tools.httpx.AsyncClient", return_value=mock_client):
            result = await lookup_ip.ainvoke({"ip": ""})

        assert "203.0.113.1" in result
        assert "South Korea" in result


# =========================================================================
# lookup_ip: API errors (mocked)
# =========================================================================
class TestLookupIpErrors:
    @pytest.mark.asyncio
    async def test_timeout(self):
        import httpx as httpx_mod

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx_mod.TimeoutException("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starpion_agent.skills.ip.tools.httpx.AsyncClient", return_value=mock_client):
            result = await lookup_ip.ainvoke({"ip": "8.8.8.8"})

        assert "느려요" in result or "다시 시도" in result

    @pytest.mark.asyncio
    async def test_http_error(self):
        import httpx as httpx_mod

        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = httpx_mod.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock()
        )

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starpion_agent.skills.ip.tools.httpx.AsyncClient", return_value=mock_client):
            result = await lookup_ip.ainvoke({"ip": "8.8.8.8"})

        assert "접속할 수 없" in result

    @pytest.mark.asyncio
    async def test_api_fail_status(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "status": "fail",
            "message": "invalid query",
        }
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starpion_agent.skills.ip.tools.httpx.AsyncClient", return_value=mock_client):
            result = await lookup_ip.ainvoke({"ip": "invalid"})

        assert "실패" in result

    @pytest.mark.asyncio
    async def test_ipify_failure_returns_error(self):
        """When ipify fails and no IP provided, return error message."""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("network error"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starpion_agent.skills.ip.tools.httpx.AsyncClient", return_value=mock_client):
            result = await lookup_ip.ainvoke({"ip": ""})

        assert "공인 IP" in result or "조회할 수 없" in result
