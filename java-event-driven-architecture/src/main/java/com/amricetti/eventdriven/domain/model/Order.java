package com.amricetti.eventdriven.domain.model;

import java.time.LocalDateTime;

public class Order {
    private final OrderId id;
    private final String customerId;
    private final Money totalAmount;
    private OrderStatus status;
    private final LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Order(OrderId id, String customerId, Money totalAmount, OrderStatus status, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.customerId = customerId;
        this.totalAmount = totalAmount;
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static Order create(String customerId, Money totalAmount) {
        LocalDateTime now = LocalDateTime.now();
        return new Order(
            OrderId.generate(),
            customerId,
            totalAmount,
            OrderStatus.CREATED,
            now,
            now
        );
    }

    public void markAsPaid() {
        if (this.status != OrderStatus.CREATED && this.status != OrderStatus.PAYMENT_PENDING) {
            throw new IllegalStateException("Order cannot be marked as paid from status: " + this.status);
        }
        this.status = OrderStatus.PAID;
        this.updatedAt = LocalDateTime.now();
    }

    public void cancel(String reason) {
        if (this.status == OrderStatus.COMPLETED) {
            throw new IllegalStateException("Completed order cannot be cancelled");
        }
        this.status = OrderStatus.CANCELLED;
        this.updatedAt = LocalDateTime.now();
    }

    public OrderId getId() {
        return id;
    }

    public String getCustomerId() {
        return customerId;
    }

    public Money getTotalAmount() {
        return totalAmount;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
