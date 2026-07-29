package com.amricetti.eventdriven.application.dto;

import com.amricetti.eventdriven.domain.model.Order;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record OrderResponseDTO(
    String orderId,
    String customerId,
    BigDecimal totalAmount,
    String currency,
    String status,
    LocalDateTime createdAt
) {
    public static OrderResponseDTO fromDomain(Order order) {
        return new OrderResponseDTO(
            order.getId().getValue(),
            order.getCustomerId(),
            order.getTotalAmount().getAmount(),
            order.getTotalAmount().getCurrency(),
            order.getStatus().name(),
            order.getCreatedAt()
        );
    }
}
