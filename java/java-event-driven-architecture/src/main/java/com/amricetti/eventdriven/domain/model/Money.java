package com.amricetti.eventdriven.domain.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

public class Money {
    private final BigDecimal amount;
    private final String currency;

    public Money(BigDecimal amount, String currency) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Amount must be non-null and greater than or equal to zero");
        }
        if (currency == null || currency.isBlank()) {
            throw new IllegalArgumentException("Currency cannot be null or blank");
        }
        this.amount = amount.setScale(2, RoundingMode.HALF_UP);
        this.currency = currency.toUpperCase();
    }

    public static Money of(double amount, String currency) {
        return new Money(BigDecimal.valueOf(amount), currency);
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Money money = (Money) o;
        return Objects.equals(amount, money.amount) && Objects.equals(currency, money.currency);
    }

    @Override
    public int hashCode() {
        return Objects.hash(amount, currency);
    }

    @Override
    public String toString() {
        return currency + " " + amount;
    }
}
