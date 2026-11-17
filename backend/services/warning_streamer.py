import json
import os
import signal
from typing import Any, Dict

from confluent_kafka import Consumer, Producer, KafkaException, KafkaError

from services.warning_analysis import analyze_news_event
from services.warning_store import save_accepted_warnings


KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_NEWS_TOPIC = os.environ.get("KAFKA_TOPIC", "atlas.market.news")
KAFKA_WARNINGS_TOPIC = os.environ.get("KAFKA_WARNINGS_TOPIC", "atlas.market.warnings")
KAFKA_GROUP_ID = os.environ.get("WARNING_STREAM_GROUP_ID", "atlas-warning-streamer")

SHOULD_STOP = False


def _stop_streamer(signum, frame) -> None:
    """
    Flip a flag when Docker asks the container to stop.

    This lets the loop close the Kafka consumer cleanly instead of cutting the
    process off in the middle of a message.
    """
    global SHOULD_STOP
    SHOULD_STOP = True


def create_consumer() -> Consumer:
    """
    Build the Kafka consumer that reads article events from Redpanda.

    earliest means a brand-new consumer group will replay old messages, which is
    useful while developing because you can restart the streamer and still test.
    """
    return Consumer(
        {
            "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
            "group.id": KAFKA_GROUP_ID,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        }
    )


def create_producer() -> Producer:
    return Producer({
        "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
        "acks": "all", "retries": 5, "linger.ms": 100,
    })


def _delivery_report(error, message):
    if error:
        print(f"[warning-streamer] Failed to publish warning: {error}")


def publish_accepted_warnings(producer, warnings) -> int:
    published = 0
    for warning in warnings:
        if not warning.get("accepted"):
            continue
        try:
            payload = {key: value for key, value in warning.items() if key != "_id"}
            producer.produce(
                KAFKA_WARNINGS_TOPIC, key=warning.get("symbol"),
                value=json.dumps(payload, default=lambda value: value.isoformat()),
                callback=_delivery_report,
            )
            producer.poll(0)
            published += 1
        except Exception as exc:
            print(f"[warning-streamer] Failed to publish warning: {exc}")
    try:
        remaining = producer.flush(timeout=10)
        if remaining:
            print(f"[warning-streamer] Failed to publish {remaining} warning(s) before timeout")
    except Exception as exc:
        print(f"[warning-streamer] Failed to publish warnings: {exc}")
    print(f"[warning-streamer] Published {published} warning(s) to {KAFKA_WARNINGS_TOPIC}")
    return published


def process_news_event(news_event: Dict[str, Any], producer=None) -> int:
    """
    Convert one news event into accepted warnings and store them in MongoDB.

    The function is small on purpose: consume, analyze, save, commit. That is
    the basic mental model for many production stream processors.
    """
    warnings = analyze_news_event(news_event)
    saved_count = save_accepted_warnings(warnings)
    print(f"[warning-streamer] Saved {saved_count} warning(s) from event {news_event.get('id')}")
    if producer is not None:
        publish_accepted_warnings(producer, warnings)
    return saved_count


def run_forever() -> None:
    """Run the Redpanda -> AI -> MongoDB warning pipeline forever."""
    signal.signal(signal.SIGTERM, _stop_streamer)
    signal.signal(signal.SIGINT, _stop_streamer)

    producer = create_producer()
    consumer = create_consumer()
    consumer.subscribe([KAFKA_NEWS_TOPIC])
    print(f"[warning-streamer] Listening to {KAFKA_NEWS_TOPIC} on {KAFKA_BOOTSTRAP_SERVERS}")

    try:
        while not SHOULD_STOP:
            message = consumer.poll(1.0)
            if message is None:
                continue

            if message.error():
                # This can happen for a few seconds during startup if the topic
                # exists in Docker Compose but Redpanda has not fully advertised
                # it to this consumer yet. Treat it as "wait and retry" instead
                # of crashing the container.
                if message.error().code() == KafkaError.UNKNOWN_TOPIC_OR_PART:
                    print(f"[warning-streamer] Waiting for topic {KAFKA_NEWS_TOPIC} to become available...")
                    continue
                raise KafkaException(message.error())

            try:
                news_event = json.loads(message.value().decode("utf-8"))
                process_news_event(news_event, producer)
                consumer.commit(message=message)
            except Exception as exc:
                print(f"[warning-streamer] Failed to process message: {exc}")
    finally:
        consumer.close()
        try:
            producer.flush(timeout=10)
        except Exception as exc:
            print(f"[warning-streamer] Failed to publish warnings on shutdown: {exc}")
        print("[warning-streamer] Stopped cleanly.")


if __name__ == "__main__":
    run_forever()
