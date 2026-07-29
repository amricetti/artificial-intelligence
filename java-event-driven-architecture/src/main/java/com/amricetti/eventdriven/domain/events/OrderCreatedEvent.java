package com.amricetti.eventdriven.domain.events;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record OrderCreatedEvent(
    String orderId,
    String customerId,
    BigDecimal totalAmount,
    String currency,
    String status,
    LocalDateTime timestamp
) {}
