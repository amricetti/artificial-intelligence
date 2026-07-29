package com.amricetti.eventdriven.infrastructure.messaging;

import com.amricetti.eventdriven.domain.events.OrderCreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class KafkaOrderConsumer {

    private static final Logger log = LoggerFactory.getLogger(KafkaOrderConsumer.class);

    @KafkaListener(topics = "orders.created", groupId = "order-processing-group")
    public void consumeOrderCreatedEvent(OrderCreatedEvent event) {
        log.info("📥 Consumed OrderCreatedEvent from Kafka: OrderId={}, CustomerId={}, Amount={} {}",
                event.orderId(), event.customerId(), event.totalAmount(), event.currency());
        // Simula processamento assíncrono de pagamento / inventário
    }
}
