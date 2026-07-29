package com.amricetti.eventdriven.application.usecase;

import com.amricetti.eventdriven.application.dto.CreateOrderCommand;
import com.amricetti.eventdriven.application.dto.OrderResponseDTO;
import com.amricetti.eventdriven.domain.events.OrderCreatedEvent;
import com.amricetti.eventdriven.domain.model.Money;
import com.amricetti.eventdriven.domain.model.Order;
import com.amricetti.eventdriven.domain.ports.EventPublisherPort;
import com.amricetti.eventdriven.domain.ports.OrderRepositoryPort;

public class CreateOrderUseCase {

    private final OrderRepositoryPort orderRepository;
    private final EventPublisherPort eventPublisher;

    public CreateOrderUseCase(OrderRepositoryPort orderRepository, EventPublisherPort eventPublisher) {
        this.orderRepository = orderRepository;
        this.eventPublisher = eventPublisher;
    }

    public OrderResponseDTO execute(CreateOrderCommand command) {
        Money money = new Money(command.amount(), command.currency());
        Order order = Order.create(command.customerId(), money);

        Order savedOrder = orderRepository.save(order);

        OrderCreatedEvent event = new OrderCreatedEvent(
            savedOrder.getId().getValue(),
            savedOrder.getCustomerId(),
            savedOrder.getTotalAmount().getAmount(),
            savedOrder.getTotalAmount().getCurrency(),
            savedOrder.getStatus().name(),
            savedOrder.getCreatedAt()
        );

        eventPublisher.publishOrderCreatedEvent(event);

        return OrderResponseDTO.fromDomain(savedOrder);
    }
}
