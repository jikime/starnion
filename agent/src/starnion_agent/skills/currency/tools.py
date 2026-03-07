"""Currency exchange tools using Frankfurter API (free, no API key required)."""

import logging

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.frankfurter.app"

CURRENCY_NAMES: dict[str, str] = {
    "KRW": "한국 원",
    "USD": "미국 달러",
    "EUR": "유로",
    "JPY": "일본 엔",
    "GBP": "영국 파운드",
    "CNY": "중국 위안",
    "CHF": "스위스 프랑",
    "CAD": "캐나다 달러",
    "AUD": "호주 달러",
    "NZD": "뉴질랜드 달러",
    "SGD": "싱가포르 달러",
    "HKD": "홍콩 달러",
    "SEK": "스웨덴 크로나",
    "NOK": "노르웨이 크로네",
    "DKK": "덴마크 크로네",
    "THB": "태국 바트",
    "INR": "인도 루피",
    "MXN": "멕시코 페소",
    "BRL": "브라질 헤알",
    "ZAR": "남아프리카 랜드",
}


class ConvertCurrencyInput(BaseModel):
    """Input schema for convert_currency tool."""

    amount: float = Field(description="변환할 금액")
    from_currency: str = Field(
        default="USD",
        description="원본 통화 코드 (USD, EUR, KRW 등)",
    )
    to_currency: str = Field(
        default="KRW",
        description="대상 통화 코드",
    )


class GetExchangeRateInput(BaseModel):
    """Input schema for get_exchange_rate tool."""

    base: str = Field(default="USD", description="기준 통화 코드")
    targets: str = Field(
        default="KRW,EUR,JPY",
        description="대상 통화 코드 (쉼표 구분)",
    )


def _currency_label(code: str) -> str:
    """Return a display label like 'USD (미국 달러)'."""
    name = CURRENCY_NAMES.get(code)
    return f"{code} ({name})" if name else code


@tool(args_schema=ConvertCurrencyInput)
@skill_guard("currency")
async def convert_currency(
    amount: float,
    from_currency: str = "USD",
    to_currency: str = "KRW",
) -> str:
    """통화를 환전합니다. 실시간 환율 기반으로 금액을 변환합니다."""
    if amount <= 0:
        return "변환할 금액은 0보다 커야 해요."

    from_code = from_currency.strip().upper()
    to_code = to_currency.strip().upper()

    if from_code == to_code:
        return f"같은 통화예요. {amount:,.2f} {from_code}"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{_BASE_URL}/latest",
                params={"amount": amount, "from": from_code, "to": to_code},
            )
            resp.raise_for_status()

        data = resp.json()
        rates = data.get("rates", {})

        if to_code not in rates:
            return f"'{to_code}' 통화를 찾을 수 없어요. 통화 코드를 확인해주세요."

        converted = rates[to_code]

        # Calculate per-unit rate.
        rate = converted / amount if amount != 0 else 0

        return (
            f"💱 {amount:,.2f} {_currency_label(from_code)} = "
            f"{converted:,.2f} {_currency_label(to_code)}\n"
            f"환율: 1 {from_code} = {rate:,.4f} {to_code}"
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return "지원하지 않는 통화 코드예요. USD, EUR, KRW, JPY 등을 사용해주세요."
        logger.debug("convert_currency HTTP error", exc_info=True)
        return "환율 정보를 가져오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
    except Exception:
        logger.debug("convert_currency failed", exc_info=True)
        return "환율 정보를 가져오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."


@tool(args_schema=GetExchangeRateInput)
@skill_guard("currency")
async def get_exchange_rate(
    base: str = "USD",
    targets: str = "KRW,EUR,JPY",
) -> str:
    """현재 환율 정보를 조회합니다."""
    base_code = base.strip().upper()
    target_codes = ",".join(t.strip().upper() for t in targets.split(",") if t.strip())

    if not target_codes:
        return "대상 통화 코드를 입력해주세요."

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{_BASE_URL}/latest",
                params={"from": base_code, "to": target_codes},
            )
            resp.raise_for_status()

        data = resp.json()
        rates = data.get("rates", {})

        if not rates:
            return "환율 정보를 찾을 수 없어요. 통화 코드를 확인해주세요."

        lines = [f"💱 **{_currency_label(base_code)}** 기준 환율\n"]
        for code, rate in sorted(rates.items()):
            name = CURRENCY_NAMES.get(code, "")
            label = f" ({name})" if name else ""
            lines.append(f"  1 {base_code} = {rate:,.4f} {code}{label}")

        date = data.get("date", "")
        if date:
            lines.append(f"\n기준일: {date}")

        return "\n".join(lines)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return "지원하지 않는 통화 코드예요. USD, EUR, KRW, JPY 등을 사용해주세요."
        logger.debug("get_exchange_rate HTTP error", exc_info=True)
        return "환율 정보를 가져오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
    except Exception:
        logger.debug("get_exchange_rate failed", exc_info=True)
        return "환율 정보를 가져오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
