package com.example

import com.example.data.OrderStatus
import com.example.data.Product
import com.example.data.ProductCategory
import com.example.data.formatCents
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ExampleUnitTest {
    @Test
    fun formatCents_formatsUsdCleanly() {
        assertEquals("$189.00", formatCents(18900L))
        assertEquals("$0.99", formatCents(99L))
    }

    @Test
    fun categoryAndOrderStatusParsing_fallsBackSafely() {
        assertEquals(ProductCategory.FASHION, ProductCategory.fromRaw("fashion"))
        assertEquals(ProductCategory.ELECTRONICS, ProductCategory.fromRaw("unknown_cat"))
        assertEquals(OrderStatus.SHIPPED, OrderStatus.fromRaw("SHIPPED"))
        assertEquals(OrderStatus.PENDING, OrderStatus.fromRaw("legacy_status"))
    }

    @Test
    fun productCreateMap_omitsDocumentIdKey() {
        val product = Product(
            id = "doc_123",
            title = "Test Watch",
            description = "Minimalist watch",
            category = "Electronics",
            priceCents = 12000L,
            stockCount = 5L
        )
        val map = product.toCreateMap("admin_uid_1")
        assertFalse(map.containsKey("id"))
        assertEquals("Test Watch", map["title"])
        assertEquals("admin_uid_1", map["createdBy"])
    }
}
