package com.amricetti.eventdriven.infrastructure.messaging;

import com.amricetti.eventdriven.domain.events.OrderCreatedEvent;
import com.amricetti.eventdriven.domain.ports.EventPublisherPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class KafkaEventPublisher implements EventPublisherPort {

    private static final Logger log = LoggerFactory.getLogger(KafkaEventPublisher.class);
    private static final String TOPIC_ORDERS_CREATED = "orders.created";

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public KafkaEventPublisher(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    @Override
    public void publishOrderCreatedEvent(OrderCreatedEvent event) {
        log.info("🚀 Publishing OrderCreatedEvent to Kafka topic '{}': {}", TOPIC_ORDERS_CREATED, event);
        kafkaTemplate.send(TOPIC_ORDERS_CREATED, event.orderId(), event);
    }
}
