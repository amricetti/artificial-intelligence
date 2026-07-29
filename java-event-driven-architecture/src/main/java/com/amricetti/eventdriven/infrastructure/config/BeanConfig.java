package com.amricetti.eventdriven.infrastructure.config;

import com.amricetti.eventdriven.application.usecase.CreateOrderUseCase;
import com.amricetti.eventdriven.domain.ports.EventPublisherPort;
import com.amricetti.eventdriven.domain.ports.OrderRepositoryPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BeanConfig {

    @Bean
    public CreateOrderUseCase createOrderUseCase(OrderRepositoryPort orderRepository, EventPublisherPort eventPublisher) {
        return new CreateOrderUseCase(orderRepository, eventPublisher);
    }
}
