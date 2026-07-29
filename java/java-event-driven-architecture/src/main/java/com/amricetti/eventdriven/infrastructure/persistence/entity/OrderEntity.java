package com.amricetti.eventdriven.infrastructure.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class OrderEntity {

    @Id
    private String id;
    private String customerId;
    private BigDecimal totalAmount;
    private String currency;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
