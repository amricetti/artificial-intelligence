package com.amricetti.eventdriven.infrastructure.persistence;

import com.amricetti.eventdriven.domain.model.Money;
import com.amricetti.eventdriven.domain.model.Order;
import com.amricetti.eventdriven.domain.model.OrderId;
import com.amricetti.eventdriven.domain.model.OrderStatus;
import com.amricetti.eventdriven.domain.ports.OrderRepositoryPort;
import com.amricetti.eventdriven.infrastructure.persistence.entity.OrderEntity;
import com.amricetti.eventdriven.infrastructure.persistence.repository.SpringDataOrderRepository;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class OrderRepositoryAdapter implements OrderRepositoryPort {

    private final SpringDataOrderRepository repository;

    public OrderRepositoryAdapter(SpringDataOrderRepository repository) {
        this.repository = repository;
    }

    @Override
    public Order save(Order order) {
        OrderEntity entity = toEntity(order);
        OrderEntity savedEntity = repository.save(entity);
        return toDomain(savedEntity);
    }

    @Override
    public Optional<Order> findById(OrderId id) {
        return repository.findById(id.getValue()).map(this::toDomain);
    }

    private OrderEntity toEntity(Order order) {
        return new OrderEntity(
            order.getId().getValue(),
            order.getCustomerId(),
            order.getTotalAmount().getAmount(),
            order.getTotalAmount().getCurrency(),
            order.getStatus().name(),
            order.getCreatedAt(),
            order.getUpdatedAt()
        );
    }

    private Order toDomain(OrderEntity entity) {
        return new Order(
            new OrderId(entity.getId()),
            entity.getCustomerId(),
            new Money(entity.getTotalAmount(), entity.getCurrency()),
            OrderStatus.valueOf(entity.getStatus()),
            entity.getCreatedAt(),
            entity.getUpdatedAt()
        );
    }
}
