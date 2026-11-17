"""Turn accepted market warnings into one current prediction per ticker."""
import json
import os
import signal
from datetime import datetime, timedelta, timezone

from confluent_kafka import Consumer, KafkaError, KafkaException
from services import ai_service, market_data, prediction_store, warning_store

KAFKA_BOOTSTRAP_SERVERS = os.environ.get('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
KAFKA_WARNINGS_TOPIC = os.environ.get('KAFKA_WARNINGS_TOPIC', 'atlas.market.warnings')
KAFKA_GROUP_ID = os.environ.get('PREDICTION_STREAM_GROUP_ID', 'atlas-prediction-streamer')
RECENT_WARNING_LIMIT = 10
RECENT_WARNING_DAYS = 14
SHOULD_STOP = False


def _stop_streamer(signum, frame):
    global SHOULD_STOP
    SHOULD_STOP = True


def create_consumer():
    return Consumer({
        'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS,
        'group.id': KAFKA_GROUP_ID,
        'auto.offset.reset': 'earliest',
        'enable.auto.commit': False,
    })


def load_stock_info(symbol):
    for row in market_data._load_cache():
        if row.get('symbol', '').upper() == symbol:
            return row
    print(f'[prediction-streamer] Unknown symbol {symbol}; skipping')
    return None


def _positive_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def live_stock_info(symbol, info):
    """Overlay live Yahoo values on the CSV row: price, 52-week range, and P/E at the live price."""
    live = dict(info)
    quote = market_data.get_quote(symbol)
    if not quote:
        return live
    live['price'] = quote['price']
    for field in ('week_52_high', 'week_52_low'):
        if _positive_float(quote.get(field)):
            live[field] = quote[field]
    price, eps = _positive_float(live['price']), _positive_float(live.get('eps'))
    if price and eps:
        live['pe_ratio'] = round(price / eps, 2)
    return live


def target_matches_recommendation(prediction, price):
    """A buy needs a target above the price and a sell one below it; hold accepts any positive target."""
    target, price = _positive_float(prediction.get('targetPrice')), _positive_float(price)
    if not target or not price:
        return False
    if prediction['recommendation'] in ('buy', 'strong_buy'):
        return target > price
    if prediction['recommendation'] in ('sell', 'strong_sell'):
        return target < price
    return True


def load_recent_warnings(symbol):
    return list(warning_store.get_warnings_collection().find({
        'symbol': symbol, 'accepted': True,
        'created_at': {'$gte': datetime.now(timezone.utc) - timedelta(days=RECENT_WARNING_DAYS)},
    }).sort('created_at', -1).limit(RECENT_WARNING_LIMIT))


def build_prediction_prompt(stock_info, price, warnings):
    system = (
        'You are an expert financial analysis AI. Analyze fundamentals and recent news. '
        'Return only a JSON object. Recommendation must be strong_buy, buy, hold, sell or strong_sell.'
    )
    fundamentals = {key: stock_info.get(key) for key in (
        'symbol', 'name', 'pe_ratio', 'sector', 'industry', 'market_cap',
        'dividend_yield', 'eps', 'week_52_high', 'week_52_low', 'description')}
    fundamentals['price'] = price
    news = [{key: warning.get(key) for key in (
        'headline', 'sentiment', 'impact_score', 'reasoning', 'time_horizon')}
        for warning in warnings]
    user = f'''Stock fundamentals: {json.dumps(fundamentals)}
Recent accepted news warnings (most recent first): {json.dumps(news)}
Return this exact JSON shape:
{{"recommendation": "strong_buy" | "buy" | "hold" | "sell" | "strong_sell",
"prediction": "bullish" | "bearish" | "neutral", "confidence": <integer 0-100>,
"targetPrice": <number>, "summary": "Explain how the news changes the outlook.",
"pros": ["Strength"], "cons": ["Weakness"], "riskFactors": ["Risk"]}}
The current price is ${price}. targetPrice is your 12-month price projection in dollars for this stock,
based on the current price; do not copy any placeholder number.
A buy or strong_buy needs a targetPrice above ${price}; a sell or strong_sell needs one below it.
The summary must explain how the news changes the outlook.
'''
    return system, user


def parse_prediction(text):
    try:
        result = json.loads(text)
    except (ValueError, TypeError):
        return None
    if not isinstance(result, dict) or result.get('recommendation') not in (
        'strong_buy', 'buy', 'hold', 'sell', 'strong_sell'
    ):
        return None
    return result


def process_warning(warning):
    symbol = str(warning.get('symbol') or '').strip().upper()
    if not symbol:
        return False
    key = warning.get('warning_key')
    if key and prediction_store.get_predictions_collection().find_one(
        {'symbol': symbol, 'source_warning_keys': key}
    ):
        return False
    info = load_stock_info(symbol)
    if info is None:
        return False
    info = live_stock_info(symbol, info)
    price = info.get('price', 0)
    warnings = load_recent_warnings(symbol)
    if not key or not any(item.get('warning_key') == key for item in warnings):
        warnings = [warning, *warnings][:RECENT_WARNING_LIMIT]
    prediction = parse_prediction(ai_service._call_multiple_models(*build_prediction_prompt(info, price, warnings)))
    if prediction is None:
        print(f'[prediction-streamer] Invalid or empty model prediction for {symbol}; skipping')
        return False
    if not target_matches_recommendation(prediction, price):
        print(f'[prediction-streamer] Target {prediction.get("targetPrice")} contradicts '
              f'{prediction["recommendation"]} at price {price} for {symbol}; skipping')
        return False
    doc = {field: prediction.get(field) for field in (
        'recommendation', 'prediction', 'confidence', 'targetPrice', 'summary', 'pros', 'cons', 'riskFactors')}
    doc.update({
        'symbol': symbol, 'name': info.get('name', symbol), 'price': price,
        'potentialReturn': ai_service.calc_potential_return(prediction.get('targetPrice'), price),
        'source_warning_keys': [item['warning_key'] for item in warnings if item.get('warning_key')],
        'model_provider': ai_service.NVIDIA_MODEL,
    })
    prediction_store.upsert_prediction(doc)
    print(f'[prediction-streamer] Saved prediction for {symbol}')
    return True


def run_forever():
    signal.signal(signal.SIGTERM, _stop_streamer)
    signal.signal(signal.SIGINT, _stop_streamer)
    consumer = create_consumer()
    consumer.subscribe([KAFKA_WARNINGS_TOPIC])
    print(f'[prediction-streamer] Listening to {KAFKA_WARNINGS_TOPIC} on {KAFKA_BOOTSTRAP_SERVERS}')
    try:
        while not SHOULD_STOP:
            message = consumer.poll(1.0)
            if message is None:
                continue
            if message.error():
                if message.error().code() == KafkaError.UNKNOWN_TOPIC_OR_PART:
                    print(f'[prediction-streamer] Waiting for topic {KAFKA_WARNINGS_TOPIC} to become available...')
                    continue
                raise KafkaException(message.error())
            try:
                process_warning(json.loads(message.value().decode('utf-8')))
                consumer.commit(message=message)
            except Exception as exc:
                print(f'[prediction-streamer] Failed to process message: {exc}')
    finally:
        consumer.close()
        print('[prediction-streamer] Stopped cleanly.')


if __name__ == '__main__':
    run_forever()
