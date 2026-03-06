"""IP lookup tools (httpx + ip-api.com)."""

import logging

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starpion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_IP_API_URL = "http://ip-api.com/json"
_IPIFY_URL = "https://api.ipify.org"

_IP_API_FIELDS = (
    "status,message,query,country,regionName,city,zip,"
    "lat,lon,timezone,isp,org,as"
)


class LookupIpInput(BaseModel):
    """Input schema for lookup_ip tool."""

    ip: str = Field(
        default="",
        description="조회할 IP 주소 또는 도메인 (예: 8.8.8.8, google.com). 비어있으면 서버 공인 IP 조회",
    )


@tool(args_schema=LookupIpInput)
@skill_guard("ip")
async def lookup_ip(ip: str = "") -> str:
    """IP 주소 또는 도메인의 위치, ISP 등 정보를 조회합니다. 비어있으면 서버의 공인 IP를 조회합니다."""
    ip = ip.strip()

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            # No IP provided → get server's public IP first.
            if not ip:
                try:
                    resp = await client.get(
                        _IPIFY_URL, params={"format": "json"}
                    )
                    resp.raise_for_status()
                    ip = resp.json().get("ip", "")
                except Exception:
                    return "공인 IP를 조회할 수 없어요. 잠시 후 다시 시도해 주세요."

            if not ip:
                return "조회할 IP 주소 또는 도메인을 입력해 주세요."

            # Lookup IP geolocation info.
            resp = await client.get(
                f"{_IP_API_URL}/{ip}",
                params={"fields": _IP_API_FIELDS},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        return "IP 조회 서비스 응답이 느려요. 잠시 후 다시 시도해 주세요."
    except httpx.HTTPStatusError:
        return "IP 조회 서비스에 접속할 수 없어요. 잠시 후 다시 시도해 주세요."
    except Exception:
        logger.debug("IP lookup API error", exc_info=True)
        return "IP 조회 중 오류가 발생했어요."

    if data.get("status") == "fail":
        msg = data.get("message", "알 수 없는 오류")
        return f"IP 조회 실패: {msg}"

    query = data.get("query", ip)
    country = data.get("country", "—")
    region = data.get("regionName", "—")
    city = data.get("city", "—")
    zipcode = data.get("zip", "—")
    lat = data.get("lat", "—")
    lon = data.get("lon", "—")
    tz = data.get("timezone", "—")
    isp = data.get("isp", "—")
    org = data.get("org", "—")
    as_info = data.get("as", "—")

    return (
        f"📡 IP 조회 결과: {query}\n\n"
        f"📍 위치: {country}, {region}, {city} ({zipcode})\n"
        f"🗺️ 좌표: {lat}, {lon}\n"
        f"🕐 시간대: {tz}\n"
        f"🏢 ISP: {isp}\n"
        f"🏷️ 조직: {org}\n"
        f"🔗 AS: {as_info}"
    )
