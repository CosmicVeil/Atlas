import csv
import json
import os
import re
from hashlib import sha256
from datetime import datetime, timezone
from typing import Any, Dict, List

from services import ai_service


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOCK_INFO_CSV = os.path.join(BASE_DIR, "data", "stock_info.csv")


def _load_known_symbols() -> set:
    """Load app-supported stock symbols so generic article acronyms are ignored."""
    symbols = set()
    if not os.path.exists(STOCK_INFO_CSV):
        return symbols

    with open(STOCK_INFO_CSV, newline="", encoding="utf-8") as csv_file:
        for row in csv.DictReader(csv_file):
            symbol = str(row.get("symbol") or "").strip().upper()
            if symbol:
                symbols.add(symbol)
    return symbols


KNOWN_SYMBOLS = _load_known_symbols()
COMMON_NON_TICKERS = {
    "A", "AI", "AP", "CEO", "CFO", "ETF", "GDP", "IMD", "IPO", "SEC", "UN", "USA", "USD", "WFH",
}
FALLBACK_MARKET_DRIVER_PATTERN = re.compile(
    r"\b(?:acquir(?:e|es|ed|ing|ition)|approval|bankruptcy|breach|buyback|contract|cyberattack|debt|"
    r"dividend|downgrade|earnings?|fda|forecast|guidance|invest(?:ment|or|ors)|investigation|lawsuit|"
    r"layoffs?|merger|orders?|outlook|partnership|price\s+target|production|profit|rating|recall|"
    r"regulat(?:e|es|ed|ion|ory)|revenue|sales|settlement|shares?|stock|supply|tariff|upgrade)\b",
    re.IGNORECASE,
)


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
    symbols = set(re.findall(r"\b[A-Z]{1,5}\b", text or ""))
    return sorted(symbol for symbol in symbols if _is_valid_symbol(symbol))


def _is_valid_symbol(symbol: str) -> bool:
    """Reject article acronyms, numbers, and symbols outside the app stock universe."""
    symbol = str(symbol or "").strip().upper()
    # A missing stock universe is a deployment problem, not permission to accept
    # arbitrary uppercase words from an article as market tickers.
    if not KNOWN_SYMBOLS:
        return False
    if not re.fullmatch(r"[A-Z][A-Z.\-]{0,5}", symbol):
        return False
    if symbol in COMMON_NON_TICKERS:
        return False
    if symbol not in KNOWN_SYMBOLS:
        return False
    return True


def _short_text(value: Any, max_chars: int = 700) -> str:
    """Keep AI-facing text compact and readable."""
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars].rstrip()}..."


def _warning_key(symbol: str, sentiment: str, source_event: Dict[str, Any]) -> str:
    """
    Create a stable duplicate key for the same stock/sentiment/news story.

    Kafka can replay messages, and news APIs can return the same article again.
    This key lets MongoDB update the existing warning instead of making another
    visually identical card.
    """
    raw = "|".join(
        [
            symbol.upper(),
            sentiment.lower(),
            str(source_event.get("link") or ""),
            str(source_event.get("title") or "").lower().strip(),
        ]
    )
    return sha256(raw.encode("utf-8")).hexdigest()


def _clean_reasoning(raw_reasoning: Any, symbol: str, sentiment: str, headline: str) -> str:
    """
    Turn model output into a concise message that reads well in the UI.

    The card should explain the market signal, why the stock is affected, and
    what the user should watch. Long model paragraphs get trimmed because they
    make the portfolio screen noisy.
    """
    reasoning = _short_text(raw_reasoning, 520)
    if not reasoning:
        direction = "upside signal" if sentiment == "positive" else "risk signal"
        reasoning = (
            f"{symbol} has a {direction} from this news item. "
            f"Review the article details before making any portfolio changes."
        )

    if headline and symbol not in reasoning:
        reasoning = f"{symbol}: {reasoning}"

    return reasoning


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
    headline = source_event.get("title", "")
    impact_score = raw.get("impact_score", raw.get("impactScore", 50))
    try:
        impact_score = max(0, min(100, int(impact_score)))
    except (TypeError, ValueError):
        impact_score = 50

    accepted = bool(raw.get("accepted", True))
    accepted_reason = raw.get("accepted_reason") or raw.get("acceptedReason") or "Accepted by the warning analyzer."
    if not _is_valid_symbol(symbol):
        accepted = False
        accepted_reason = "Rejected because the extracted symbol is not a supported stock ticker."

    return {
        "source_event_id": source_event.get("id"),
        "source_validated": bool(source_event.get("source_validated")),
        "warning_key": _warning_key(symbol, sentiment, source_event),
        "symbol": symbol,
        "company_name": raw.get("company_name") or raw.get("companyName") or symbol,
        "sentiment": sentiment,
        "impact_score": impact_score,
        "headline": headline,
        "article_url": source_event.get("link", ""),
        "reasoning": _clean_reasoning(raw.get("reasoning") or raw.get("reason"), symbol, sentiment, headline),
        "accepted": accepted,
        "accepted_reason": accepted_reason,
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
    if not FALLBACK_MARKET_DRIVER_PATTERN.search(text):
        print(f"[warning-analyzer] Fallback skipped event {news_event.get('id')}: no market driver.")
        return []

    symbols = [symbol for symbol in (news_event.get("symbols") or _symbols_from_text(text)) if _is_valid_symbol(symbol)]
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
        direction = "positive" if sentiment == "positive" else "negative"
        action = (
            "This may support upside momentum, but compare it with valuation and earnings risk."
            if sentiment == "positive"
            else "This may increase near-term downside risk, so review position size and upcoming catalysts."
        )
        raw_warnings.append(
            {
                "symbol": symbol,
                "company_name": symbol,
                "sentiment": sentiment,
                "impact_score": score,
                "reasoning": (
                    f"The article creates a {direction} signal for {symbol}: "
                    f"it contains {positive_hits} positive cue(s) and {negative_hits} negative cue(s). "
                    f"{action}"
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
    # Messages produced before the validated producer had no reliable admission
    # checks. Ignore them instead of letting the fallback heuristic create noise.
    if not news_event.get("source_validated"):
        print(f"[warning-analyzer] Skipped unvalidated event {news_event.get('id')}")
        return []

    article_text = (news_event.get("article") or {}).get("text", "")
    symbols = news_event.get("symbols") or []

    system_prompt = (
        "You are a careful market-news analyst for a portfolio app. Your job is to identify "
        "stocks with a concrete news-driven risk or opportunity, avoid hype, and write concise "
        "messages a retail investor can understand. Return ONLY valid JSON, with no Markdown."
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
          "reasoning": "2 short sentences: what happened, why it matters for this stock, and what the user should watch next.",
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
    - Do not repeat the headline as the whole reasoning.
    - Do not say generic phrases like "could affect the stock" without naming the specific driver.
    - Prefer one useful warning per affected ticker. If the article is vague, return accepted=false.
    - Impact score guide: 70-100 major earnings/regulatory/product/customer impact, 40-69 meaningful but limited impact, below 40 usually accepted=false.
    """

    # Despite its legacy name, this helper tries Claude, then OpenAI, then NVIDIA.
    # That makes the streamer use any configured AI provider instead of a
    # NVIDIA-only consensus workflow.
    response_text = ai_service._call_multiple_models(system_prompt, user_prompt)
    if response_text:
        try:
            parsed = json.loads(_clean_json_text(response_text))
            raw_warnings = parsed.get("warnings", [])
            return [_normalize_warning(item, news_event) for item in raw_warnings if item.get("accepted")]
        except Exception as exc:
            print(f"[warning-analyzer] Could not parse AI response, using fallback: {exc}")

    return [warning for warning in _fallback_analysis(news_event) if warning.get("accepted")]
