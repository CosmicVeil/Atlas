"""MongoDB predictions shared by the stream processor and read-only API."""
import os
from datetime import datetime, timezone

from pymongo import MongoClient

MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://localhost:27017')
MONGO_DATABASE = os.environ.get('MONGO_DATABASE', 'atlas')
MONGO_PREDICTIONS_COLLECTION = os.environ.get('MONGO_PREDICTIONS_COLLECTION', 'stock_predictions')


def get_predictions_collection():
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=1000,
                         connectTimeoutMS=1000, socketTimeoutMS=1000, tz_aware=True)
    collection = client[MONGO_DATABASE][MONGO_PREDICTIONS_COLLECTION]
    collection.create_index('symbol', unique=True)
    collection.create_index([('updated_at', -1)])
    return collection


def upsert_prediction(doc):
    now = datetime.now(timezone.utc)
    get_predictions_collection().update_one(
        {'symbol': doc['symbol']},
        {'$set': {**doc, 'updated_at': now}, '$setOnInsert': {'created_at': now}},
        upsert=True,
    )


def get_predictions_by_symbol(symbols=None):
    try:
        query = {} if symbols is None else {'symbol': {'$in': [s.upper() for s in symbols]}}
        return {doc['symbol']: doc for doc in get_predictions_collection().find(query)}
    except Exception as exc:
        print(f'[prediction-store] Failed to read predictions: {exc}')
        return {}


def get_prediction(symbol):
    try:
        return get_predictions_collection().find_one({'symbol': symbol.upper()})
    except Exception as exc:
        print(f'[prediction-store] Failed to read prediction: {exc}')
        return None


def get_latest_prediction_time():
    try:
        doc = get_predictions_collection().find_one({}, sort=[('updated_at', -1)])
        return doc.get('updated_at') if doc else None
    except Exception as exc:
        print(f'[prediction-store] Failed to read latest prediction: {exc}')
        return None


def get_prediction_symbols_since(since):
    try:
        docs = get_predictions_collection().find({'updated_at': {'$gt': since}}).sort('updated_at', -1)
        return [doc['symbol'] for doc in docs]
    except Exception as exc:
        print(f'[prediction-store] Failed to read updated predictions: {exc}')
        return []


def serialize_time(value):
    return value.isoformat() if value else None
