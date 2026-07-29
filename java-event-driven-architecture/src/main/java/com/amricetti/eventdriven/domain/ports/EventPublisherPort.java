package com.amricetti.eventdriven.domain.ports;

import com.amricetti.eventdriven.domain.events.OrderCreatedEvent;

public interface EventPublisherPort {
    void publishOrderCreatedEvent(OrderCreatedEvent event);
}
