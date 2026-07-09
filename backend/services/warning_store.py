import csv
import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

try:
    from pymongo import MongoClient, UpdateOne
    from pymongo.collection import Collection
except ImportError:
    MongoClient = None
    UpdateOne = None
    Collection = Any


MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DATABASE = os.environ.get("MONGO_DATABASE", "atlas")
MONGO_WARNINGS_COLLECTION = os.environ.get("MONGO_WARNINGS_COLLECTION", "market_warnings")
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOCK_INFO_CSV = os.path.join(BASE_DIR, "data", "stock_info.csv")


def _load_known_symbols() -> List[str]:
    """Load app-supported stock symbols for filtering noisy fallback records."""
    if not os.path.exists(STOCK_INFO_CSV):
        return []

    symbols = []
    with open(STOCK_INFO_CSV, newline="", encoding="utf-8") as csv_file:
        for row in csv.DictReader(csv_file):
            symbol = str(row.get("symbol") or "").strip().upper()
            if symbol:
                symbols.append(symbol)
    return symbols


KNOWN_SYMBOLS = _load_known_symbols()


def get_warnings_collection() -> Collection:
    """
    Open the MongoDB collection that stores accepted AI warnings.

    PyMongo manages connection pooling internally, so creating a client here is
    fine for a small Flask app and a single streamer process.
    """
    if MongoClient is None:
        raise RuntimeError("pymongo is not installed. Run pip install -r backend/requirements.txt.")

    # Keep the website responsive even if MongoDB is not running locally.
    # Without these timeouts, a warning-card request can wait a long time before
    # failing, which makes unrelated portfolio actions feel broken.
    client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=1000,
        connectTimeoutMS=1000,
        socketTimeoutMS=1000,
    )
    database = client[MONGO_DATABASE]
    collection = database[MONGO_WARNINGS_COLLECTION]

    # Indexes make common lookups fast and also prevent duplicate warnings from
    # being inserted when the streamer sees the same Kafka event more than once.
    collection.create_index(
        [("source_event_id", 1), ("symbol", 1), ("sentiment", 1)],
        unique=True,
        name="unique_event_symbol_sentiment",
    )
    collection.create_index("warning_key", unique=True, sparse=True, name="unique_warning_key")
    collection.create_index([("symbol", 1), ("sentiment", 1), ("accepted", 1)])
    collection.create_index([("created_at", -1)])
    return collection


def save_accepted_warnings(warnings: Iterable[Dict[str, Any]]) -> int:
    """
    Upsert accepted warnings into MongoDB and return how many writes were sent.

    Upsert means "update if it exists, insert if it does not". This is perfect
    for stream processing because Kafka can deliver a message more than once.
    """
    operations = []
    now = datetime.now(timezone.utc)

    for warning in warnings:
        if not warning.get("accepted"):
            continue

        warning["updated_at"] = now
        warning_key = warning.get("warning_key") or "|".join(
            [
                str(warning.get("source_event_id") or ""),
                str(warning.get("symbol") or ""),
                str(warning.get("sentiment") or ""),
            ]
        )
        operations.append(
            UpdateOne(
                {
                    "$or": [
                        {"warning_key": warning_key},
                        {
                            "source_event_id": warning.get("source_event_id"),
                            "symbol": warning.get("symbol"),
                            "sentiment": warning.get("sentiment"),
                        },
                    ]
                },
                {
                    "$set": {**warning, "warning_key": warning_key},
                    "$setOnInsert": {"first_seen_at": now},
                },
                upsert=True,
            )
        )

    if not operations:
        return 0

    collection = get_warnings_collection()
    collection.bulk_write(operations, ordered=False)
    return len(operations)


def get_portfolio_warnings(symbols: List[str], limit: int = 50) -> Dict[str, List[Dict[str, Any]]]:
    """
    Return the warning groups required by the frontend.

    Negative warnings are shown only for symbols the user owns. Positive
    warnings are shown for every stock, even when it is not in the portfolio.
    """
    collection = get_warnings_collection()
    owned_symbols = [symbol.upper() for symbol in symbols]
    known_owned_symbols = [symbol for symbol in owned_symbols if not KNOWN_SYMBOLS or symbol in KNOWN_SYMBOLS]

    negative_filter = {
        "accepted": True,
        "sentiment": "negative",
        "symbol": {"$in": known_owned_symbols},
    }
    positive_filter = {
        "accepted": True,
        "sentiment": "positive",
    }
    if KNOWN_SYMBOLS:
        positive_filter["symbol"] = {"$in": KNOWN_SYMBOLS}

    negative = _latest_unique_warnings(collection, negative_filter, limit)
    positive = _latest_unique_warnings(collection, positive_filter, limit)

    return {
        "negative": [_serialize_warning(item) for item in negative],
        "positive": [_serialize_warning(item) for item in positive],
    }


def get_market_warnings(limit: int = 50) -> Dict[str, List[Dict[str, Any]]]:
    """
    Return latest accepted warnings for the standalone Market News page.

    This intentionally does not look at portfolios or holdings. It is read-only
    and separate from portfolio creation/add-stock flows.
    """
    collection = get_warnings_collection()

    base_filter = {"accepted": True}
    if KNOWN_SYMBOLS:
        base_filter["symbol"] = {"$in": KNOWN_SYMBOLS}
    negative = _latest_unique_warnings(collection, {**base_filter, "sentiment": "negative"}, limit)
    positive = _latest_unique_warnings(collection, {**base_filter, "sentiment": "positive"}, limit)

    return {
        "negative": [_serialize_warning(item) for item in negative],
        "positive": [_serialize_warning(item) for item in positive],
    }


def _latest_unique_warnings(collection: Collection, filter_query: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
    """
    Return the newest warning per symbol/sentiment pair.

    This keeps the UI from showing a stack of near-identical cards when several
    articles repeat the same message about one ticker.
    """
    pipeline = [
        {"$match": filter_query},
        {"$sort": {"created_at": -1, "updated_at": -1}},
        {
            "$group": {
                "_id": {"symbol": "$symbol", "sentiment": "$sentiment"},
                "warning": {"$first": "$$ROOT"},
            }
        },
        {"$replaceRoot": {"newRoot": "$warning"}},
        {"$sort": {"created_at": -1, "updated_at": -1}},
        {"$limit": limit},
    ]
    return list(collection.aggregate(pipeline))


def _serialize_warning(warning: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB-only types into JSON-safe strings for Flask responses."""
    warning = dict(warning)
    warning["id"] = str(warning.pop("_id"))
    for key in ["created_at", "updated_at", "first_seen_at"]:
        if hasattr(warning.get(key), "isoformat"):
            warning[key] = warning[key].isoformat()
    return warning
