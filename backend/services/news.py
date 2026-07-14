import csv
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from confluent_kafka import KafkaException, Producer

from services.market_data import get_quote


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOCK_INFO_CSV = os.path.join(BASE_DIR, "data", "stock_info.csv")
NEWS_API_KEY = os.environ.get("NEWS_API_KEY", "")
NEWS_API_URL = os.environ.get("NEWS_API_URL", "https://newsdata.io/api/1/market")
NEWS_API_LANGUAGE = os.environ.get("NEWS_API_LANGUAGE", "en")
NEWS_API_SIZE = int(os.environ.get("NEWS_API_SIZE", "10"))
NEWS_API_SYMBOLS = os.environ.get("NEWS_API_SYMBOLS", "")

KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC = os.environ.get("KAFKA_TOPIC", "atlas.market.news")
STREAM_INTERVAL_SECONDS = int(os.environ.get("STREAM_INTERVAL_SECONDS", "86400"))
ARTICLE_TIMEOUT_SECONDS = int(os.environ.get("ARTICLE_TIMEOUT_SECONDS", "12"))
MAX_ARTICLE_CHARS = int(os.environ.get("MAX_ARTICLE_CHARS", "12000"))
MAX_NEWS_PAGES = int(os.environ.get("MAX_NEWS_PAGES", "1"))

USER_AGENT = os.environ.get(
    "NEWS_USER_AGENT",
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
)

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
    }
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_text(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_clean_text(str(item)) for item in value if _clean_text(str(item))]
    if isinstance(value, str):
        return [_clean_text(item) for item in re.split(r"[,|]", value) if _clean_text(item)]
    return [_clean_text(str(value))]


def _load_supported_stocks() -> Dict[str, str]:
    """Load the Atlas ticker universe and its company names from the CSV."""
    if not os.path.exists(STOCK_INFO_CSV):
        return {}

    with open(STOCK_INFO_CSV, newline="", encoding="utf-8") as csv_file:
        return {
            symbol: _clean_text(row.get("name"))
            for row in csv.DictReader(csv_file)
            if (symbol := str(row.get("symbol") or "").strip().upper())
        }


SUPPORTED_STOCKS = _load_supported_stocks()
SUPPORTED_SYMBOLS = set(SUPPORTED_STOCKS)
COMPANY_SUFFIX_PATTERN = re.compile(
    r"\b(?:incorporated|inc|corporation|corp|plc|ltd|limited|company|co|class\s+[a-z]|common\s+stock)\b\.?,?",
    re.IGNORECASE,
)
EXCHANGE_TICKER_PATTERN = re.compile(
    r"\b(?:NASDAQ|NYSE|NYSEAMERICAN|NYSEARCA|OTC(?:MKTS)?)\s*:\s*[A-Z][A-Z.\-]{0,5}\b",
    re.IGNORECASE,
)
def _normalize_match_text(value: str) -> str:
    """Normalize company punctuation so CSV names match ordinary article prose."""
    return _clean_text(re.sub(r"[^A-Za-z0-9]+", " ", value or ""))


def _company_aliases(symbol: str) -> List[str]:
    """Return punctuation-safe full and simplified company names for matching."""
    company_name = _clean_text(SUPPORTED_STOCKS.get(symbol))
    simplified_name = _clean_text(COMPANY_SUFFIX_PATTERN.sub(" ", company_name))
    return list(
        {
            normalized_name
            for name in [company_name, simplified_name]
            if len(normalized_name := _normalize_match_text(name)) >= 3
        }
    )


def _symbol_matches_story(symbol: str, story_text: str) -> bool:
    """Check that a provider ticker actually refers to its supported company."""
    text_without_exchange_labels = EXCHANGE_TICKER_PATTERN.sub(" ", story_text)
    normalized_story_text = _normalize_match_text(text_without_exchange_labels)

    # Mentions such as "ex-Amazon executive" do not describe Amazon itself.
    for company_name in _company_aliases(symbol):
        normalized_story_text = re.sub(
            rf"\b(?:ex|former)\s*-?\s*{re.escape(company_name)}\b",
            " ",
            normalized_story_text,
            flags=re.IGNORECASE,
        )

    # Three-or-more-letter ticker mentions are specific enough to use directly.
    if len(symbol) >= 3 and re.search(rf"\b{re.escape(symbol)}\b", text_without_exchange_labels, re.IGNORECASE):
        return True

    return any(
        re.search(rf"\b{re.escape(company_name)}\b", normalized_story_text, re.IGNORECASE)
        for company_name in _company_aliases(symbol)
    )


def _supported_symbols(news_item: Dict[str, Any]) -> List[str]:
    """
    Keep only provider tickers that Atlas recognizes, in a stable order.

    NewsData's market feed also contains exchange codes and global instruments
    that are not stocks this application supports. Filtering before scraping
    keeps unrelated articles out of Kafka and avoids unnecessary web requests.
    """
    supported = []
    seen = set()
    story_text = _clean_text(f"{news_item.get('title', '')} {news_item.get('description', '')}")
    raw_symbols = news_item.get("symbol") or news_item.get("symbols") or news_item.get("ticker")
    for candidate in _as_list(raw_symbols):
        symbol = candidate.upper()
        if symbol in SUPPORTED_SYMBOLS and symbol not in seen and _symbol_matches_story(symbol, story_text):
            supported.append(symbol)
            seen.add(symbol)
    return supported


def _message_id(article: Dict[str, Any]) -> str:
    raw = "|".join(
        [
            article.get("link", ""),
            article.get("title", ""),
            article.get("published_at", ""),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _extract_article_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "noscript", "svg", "iframe", "form", "nav", "footer", "header"]):
        tag.decompose()

    candidates = []
    for selector in ["article", "main", '[role="main"]']:
        candidates.extend(soup.select(selector))
    if not candidates:
        candidates = [soup.body or soup]

    best_text = ""
    for candidate in candidates:
        paragraphs = [_clean_text(p.get_text(" ")) for p in candidate.find_all("p")]
        text = "\n\n".join(p for p in paragraphs if len(p) > 40)
        if len(text) > len(best_text):
            best_text = text

    if not best_text:
        best_text = _clean_text((soup.body or soup).get_text(" "))

    return best_text[:MAX_ARTICLE_CHARS]


def scrape_article(link: str) -> Dict[str, Any]:
    if not link:
        return {"url": "", "domain": "", "text": "", "scrape_error": "missing article link"}

    domain = urlparse(link).netloc
    try:
        response = SESSION.get(link, timeout=ARTICLE_TIMEOUT_SECONDS)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            return {
                "url": link,
                "domain": domain,
                "text": "",
                "scrape_error": f"unsupported content type: {content_type}",
            }

        return {
            "url": response.url,
            "domain": urlparse(response.url).netloc or domain,
            "text": _extract_article_text(response.text),
            "scrape_error": "",
        }
    except requests.RequestException as exc:
        return {"url": link, "domain": domain, "text": "", "scrape_error": str(exc)}


def fetch_market_news() -> Iterable[Dict[str, Any]]:
    if not NEWS_API_KEY:
        raise RuntimeError("NEWS_API_KEY is required to fetch market news.")

    params = {
        "apikey": NEWS_API_KEY,
        "language": NEWS_API_LANGUAGE,
        "size": NEWS_API_SIZE,
    }
    if NEWS_API_SYMBOLS:
        params["symbol"] = NEWS_API_SYMBOLS

    next_page = None
    pages_read = 0

    while pages_read < MAX_NEWS_PAGES:
        page_params = dict(params)
        if next_page:
            page_params["page"] = next_page

        response = SESSION.get(NEWS_API_URL, params=page_params, timeout=20)
        response.raise_for_status()
        payload = response.json()

        if payload.get("status") == "error":
            raise RuntimeError(payload.get("results", {}).get("message") or json.dumps(payload))

        for item in payload.get("results", []):
            yield item

        next_page = payload.get("nextPage")
        pages_read += 1
        if not next_page:
            break


def fetch_market_quotes(symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    quotes = {}
    for symbol in symbols:
        try:
            quote = get_quote(symbol)
            if quote:
                quotes[symbol.upper()] = quote
        except Exception as exc:
            quotes[symbol.upper()] = {"symbol": symbol.upper(), "error": str(exc)}
    return quotes


def build_news_message(news_item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Build a Kafka event when a provider item names an Atlas-supported company."""
    link = news_item.get("link") or news_item.get("url") or ""
    symbols = _supported_symbols(news_item)
    if not symbols:
        return None

    article = scrape_article(link)

    message = {
        "id": "",
        "source": "newsdata.io",
        "title": _clean_text(news_item.get("title")),
        "description": _clean_text(news_item.get("description")),
        "link": link,
        "published_at": news_item.get("pubDate") or news_item.get("pub_date") or news_item.get("published_at") or "",
        "author": _as_list(news_item.get("creator") or news_item.get("author")),
        "symbols": symbols,
        "market_quotes": fetch_market_quotes(symbols),
        "category": _as_list(news_item.get("category")),
        "country": _as_list(news_item.get("country")),
        "market_metadata": news_item,
        # The consumer uses this flag to reject older or untrusted Kafka events.
        "source_validated": True,
        "article": article,
        "scraped_at": _utc_now(),
    }
    message["id"] = _message_id(message)
    return message


def create_producer() -> Producer:
    brokers = [server.strip() for server in KAFKA_BOOTSTRAP_SERVERS.split(",") if server.strip()]
    return Producer(
        {
            "bootstrap.servers": ",".join(brokers),
            "acks": "all",
            "retries": 5,
            "linger.ms": 100,
        }
    )


def wait_for_redpanda() -> Producer:
    while True:
        try:
            producer = create_producer()
            metadata = producer.list_topics(timeout=5)
            if metadata.brokers:
                return producer
        except KafkaException:
            pass
        print(f"[news-streamer] Waiting for Kafka broker at {KAFKA_BOOTSTRAP_SERVERS}...")
        time.sleep(3)


def _delivery_report(error, message) -> None:
    if error is not None:
        print(f"[news-streamer] Delivery failed: {error}")
    else:
        print(
            "[news-streamer] Delivered to "
            f"{message.topic()} [{message.partition()}] at offset {message.offset()}"
        )


def publish_market_news(producer: Producer) -> int:
    published = 0
    for raw_item in fetch_market_news():
        message = build_news_message(raw_item)
        if message is None:
            print(f"[news-streamer] Skipped unsupported item: {_clean_text(raw_item.get('title'))}")
            continue
        try:
            producer.produce(
                KAFKA_TOPIC,
                key=message["id"],
                value=json.dumps(message, ensure_ascii=False).encode("utf-8"),
                callback=_delivery_report,
            )
            producer.poll(0)
            published += 1
            print(f"[news-streamer] Queued {message['id']} - {message['title']}")
        except BufferError:
            producer.flush()
            producer.produce(
                KAFKA_TOPIC,
                key=message["id"],
                value=json.dumps(message, ensure_ascii=False).encode("utf-8"),
                callback=_delivery_report,
            )
            published += 1
        except Exception as exc:
            print(f"[news-streamer] Failed to queue article {message['id']}: {exc}")

    remaining = producer.flush(timeout=30)
    if remaining:
        print(f"[news-streamer] {remaining} message(s) were not delivered before timeout.")
    return published


def run_once() -> int:
    producer = wait_for_redpanda()
    return publish_market_news(producer)


def run_forever() -> None:
    producer = wait_for_redpanda()
    while True:
        try:
            count = publish_market_news(producer)
            print(f"[news-streamer] Published {count} article(s). Sleeping {STREAM_INTERVAL_SECONDS}s.")
        except Exception as exc:
            print(f"[news-streamer] Poll failed: {exc}")
        time.sleep(STREAM_INTERVAL_SECONDS)


if __name__ == "__main__":
    mode = os.environ.get("NEWS_STREAM_MODE", "forever").lower()
    if mode in {"once", "one-shot", "oneshot"}:
        print(f"[news-streamer] Published {run_once()} article(s).")
    else:
        run_forever()
