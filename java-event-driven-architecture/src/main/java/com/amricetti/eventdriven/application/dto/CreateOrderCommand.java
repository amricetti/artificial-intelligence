package com.amricetti.eventdriven.application.dto;

import java.math.BigDecimal;

public record CreateOrderCommand(
    String customerId,
    BigDecimal amount,
    String currency
) {}
