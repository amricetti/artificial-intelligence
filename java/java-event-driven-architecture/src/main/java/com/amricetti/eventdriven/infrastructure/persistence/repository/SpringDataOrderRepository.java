package com.amricetti.eventdriven.infrastructure.persistence.repository;

import com.amricetti.eventdriven.infrastructure.persistence.entity.OrderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SpringDataOrderRepository extends JpaRepository<OrderEntity, String> {
}
