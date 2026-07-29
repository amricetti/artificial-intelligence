package com.amricetti.eventdriven.domain.ports;

import com.amricetti.eventdriven.domain.model.Order;
import com.amricetti.eventdriven.domain.model.OrderId;

import java.util.Optional;

public interface OrderRepositoryPort {
    Order save(Order order);
    Optional<Order> findById(OrderId id);
}
