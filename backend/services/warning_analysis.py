import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List

from services import ai_service


def _clean_json_text(text: str) -> str:
    """Remove common Markdown code fences so json.loads can read the AI response."""
    text = (text or "").strip()
    if text.startswith("```json"):
        text = text.split("```json", 1)[1]
    elif text.startswith("```"):
        text = text.split("```", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _symbols_from_text(text: str) -> List[str]:
    """
    Pull likely stock tickers out of the article text.

    This is a fallback for when the news API does not send a symbol list. It is
    intentionally simple: real tickers are usually 1-5 uppercase letters.
    """
    ignore = {"A", "AI", "CEO", "CFO", "ETF", "IPO", "SEC", "USA", "USD"}
    symbols = set(re.findall(r"\b[A-Z]{1,5}\b", text or ""))
    return sorted(symbol for symbol in symbols if symbol not in ignore)


def _normalize_warning(raw: Dict[str, Any], source_event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert one AI warning into the exact shape MongoDB and the frontend expect.

    Keeping one normalized schema is important because Kafka messages, AI model
    output, and UI cards can otherwise drift into slightly different formats.
    """
    sentiment = str(raw.get("sentiment", "neutral")).lower()
    if sentiment not in {"positive", "negative", "neutral"}:
        sentiment = "neutral"

    symbol = str(raw.get("symbol") or "").strip().upper()
    impact_score = raw.get("impact_score", raw.get("impactScore", 50))
    try:
        impact_score = max(0, min(100, int(impact_score)))
    except (TypeError, ValueError):
        impact_score = 50

    return {
        "source_event_id": source_event.get("id"),
        "symbol": symbol,
        "company_name": raw.get("company_name") or raw.get("companyName") or symbol,
        "sentiment": sentiment,
        "impact_score": impact_score,
        "headline": source_event.get("title", ""),
        "article_url": source_event.get("link", ""),
        "reasoning": raw.get("reasoning") or raw.get("reason") or "No reasoning was provided.",
        "accepted": bool(raw.get("accepted", True)),
        "accepted_reason": raw.get("accepted_reason") or raw.get("acceptedReason") or "Accepted by the warning analyzer.",
        "time_horizon": raw.get("time_horizon") or raw.get("timeHorizon") or "near-term",
        "created_at": datetime.now(timezone.utc),
        "raw_warning": raw,
    }


def _fallback_analysis(news_event: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Create useful warnings even when no AI key is configured or the model fails.

    This keeps the streamer testable during development. The heuristic reads
    negative and positive words from the headline/article and marks mentioned
    symbols as affected.
    """
    text = " ".join(
        [
            news_event.get("title", ""),
            news_event.get("description", ""),
            news_event.get("article", {}).get("text", ""),
        ]
    )
    symbols = news_event.get("symbols") or _symbols_from_text(text)
    if not symbols:
        return []

    negative_words = {"miss", "falls", "drop", "cuts", "lawsuit", "probe", "warning", "recall", "loss", "down"}
    positive_words = {"beats", "rises", "surge", "growth", "upgrade", "record", "profit", "deal", "up"}

    lowered = text.lower()
    negative_hits = sum(1 for word in negative_words if word in lowered)
    positive_hits = sum(1 for word in positive_words if word in lowered)

    if negative_hits > positive_hits:
        sentiment = "negative"
        score = min(90, 55 + negative_hits * 8)
    elif positive_hits > negative_hits:
        sentiment = "positive"
        score = min(90, 55 + positive_hits * 8)
    else:
        sentiment = "neutral"
        score = 45

    raw_warnings = []
    for symbol in symbols:
        raw_warnings.append(
            {
                "symbol": symbol,
                "company_name": symbol,
                "sentiment": sentiment,
                "impact_score": score,
                "reasoning": (
                    f"The article mentions {symbol}. The fallback analyzer found "
                    f"{positive_hits} positive signal(s) and {negative_hits} negative signal(s)."
                ),
                "accepted": sentiment != "neutral",
                "accepted_reason": "Fallback accepted the warning because the article had a directional signal.",
                "time_horizon": "near-term",
            }
        )
    return [_normalize_warning(item, news_event) for item in raw_warnings]


def analyze_news_event(news_event: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Ask the AI which stocks are affected by one enriched market-news event.

    The output is a list because one article can affect many stocks. Only
    warnings where accepted=true are saved by the streamer.
    """
    article_text = (news_event.get("article") or {}).get("text", "")
    symbols = news_event.get("symbols") or []

    system_prompt = (
        "You are a market-news risk analyst. Read one news article and identify stocks "
        "that are meaningfully affected. Return ONLY valid JSON, with no Markdown."
    )

    user_prompt = f"""
    News headline: {news_event.get("title", "")}
    Description: {news_event.get("description", "")}
    Link: {news_event.get("link", "")}
    Symbols provided by market API: {symbols}
    Article text:
    {article_text[:8000]}

    Return this exact JSON shape:
    {{
      "warnings": [
        {{
          "symbol": "AAPL",
          "company_name": "Apple Inc.",
          "sentiment": "positive" | "negative" | "neutral",
          "impact_score": 0-100,
          "reasoning": "Explain why this article affects this stock.",
          "accepted": true | false,
          "accepted_reason": "Explain why this warning should or should not be shown.",
          "time_horizon": "intraday" | "near-term" | "long-term"
        }}
      ]
    }}

    Rules:
    - accepted must be true only when the article gives a concrete investment warning or opportunity.
    - negative means risk/downside warning.
    - positive means opportunity/upside warning.
    - neutral warnings should usually be accepted=false.
    """

    response_text = ai_service._call_multiple_models(system_prompt, user_prompt)
    if response_text:
        try:
            parsed = json.loads(_clean_json_text(response_text))
            raw_warnings = parsed.get("warnings", [])
            return [_normalize_warning(item, news_event) for item in raw_warnings if item.get("accepted")]
        except Exception as exc:
            print(f"[warning-analyzer] Could not parse AI response, using fallback: {exc}")

    return [warning for warning in _fallback_analysis(news_event) if warning.get("accepted")]
