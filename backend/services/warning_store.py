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
        operations.append(
            UpdateOne(
                {
                    "source_event_id": warning.get("source_event_id"),
                    "symbol": warning.get("symbol"),
                    "sentiment": warning.get("sentiment"),
                },
                {
                    "$set": warning,
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

    negative_filter = {
        "accepted": True,
        "sentiment": "negative",
        "symbol": {"$in": owned_symbols},
    }
    positive_filter = {
        "accepted": True,
        "sentiment": "positive",
    }

    negative = list(collection.find(negative_filter).sort("created_at", -1).limit(limit))
    positive = list(collection.find(positive_filter).sort("created_at", -1).limit(limit))

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
    negative = list(
        collection.find({**base_filter, "sentiment": "negative"})
        .sort("created_at", -1)
        .limit(limit)
    )
    positive = list(
        collection.find({**base_filter, "sentiment": "positive"})
        .sort("created_at", -1)
        .limit(limit)
    )

    return {
        "negative": [_serialize_warning(item) for item in negative],
        "positive": [_serialize_warning(item) for item in positive],
    }


def _serialize_warning(warning: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB-only types into JSON-safe strings for Flask responses."""
    warning = dict(warning)
    warning["id"] = str(warning.pop("_id"))
    for key in ["created_at", "updated_at", "first_seen_at"]:
        if hasattr(warning.get(key), "isoformat"):
            warning[key] = warning[key].isoformat()
    return warning
