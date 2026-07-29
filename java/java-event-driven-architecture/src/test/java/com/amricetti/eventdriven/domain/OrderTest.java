package com.amricetti.eventdriven.domain;

import com.amricetti.eventdriven.domain.model.Money;
import com.amricetti.eventdriven.domain.model.Order;
import com.amricetti.eventdriven.domain.model.OrderStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class OrderTest {

    @Test
    @DisplayName("Should create order with CREATED status successfully")
    void shouldCreateOrderSuccessfully() {
        Money money = Money.of(150.00, "BRL");
        Order order = Order.create("cust-123", money);

        assertNotNull(order.getId());
        assertEquals("cust-123", order.getCustomerId());
        assertEquals(money, order.getTotalAmount());
        assertEquals(OrderStatus.CREATED, order.getStatus());
        assertNotNull(order.getCreatedAt());
    }

    @Test
    @DisplayName("Should transition order status to PAID when markAsPaid is called")
    void shouldMarkOrderAsPaid() {
        Money money = Money.of(99.90, "BRL");
        Order order = Order.create("cust-456", money);

        order.markAsPaid();

        assertEquals(OrderStatus.PAID, order.getStatus());
    }
}
