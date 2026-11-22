package com.example.data

import androidx.annotation.Keep
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.IgnoreExtraProperties
import java.text.NumberFormat
import java.util.Locale

enum class ProductCategory(val label: String) {
    ELECTRONICS("Electronics"),
    FASHION("Fashion"),
    HOME("Home"),
    ACCESSORIES("Accessories");

    companion object {
        fun fromRaw(raw: String?): ProductCategory =
            entries.firstOrNull { it.label.equals(raw, ignoreCase = true) || it.name.equals(raw, ignoreCase = true) }
                ?: ELECTRONICS
    }
}

enum class OrderStatus(val label: String) {
    PENDING("PENDING"),
    PROCESSING("PROCESSING"),
    SHIPPED("SHIPPED"),
    DELIVERED("DELIVERED"),
    CANCELLED("CANCELLED");

    companion object {
        fun fromRaw(raw: String?): OrderStatus =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: PENDING
    }
}

enum class PaymentMethod(val label: String) {
    CASH_ON_DELIVERY("Cash on Delivery"),
    CARD_ON_DELIVERY("Card on Delivery"),
    DIGITAL_WALLET("Digital Wallet");

    companion object {
        fun fromRaw(raw: String?): PaymentMethod =
            entries.firstOrNull { it.label.equals(raw, ignoreCase = true) } ?: CASH_ON_DELIVERY
    }
}

@Keep
@IgnoreExtraProperties
data class UserProfile(
    @DocumentId val id: String = "",
    val userId: String = "",
    val displayName: String = "",
    val email: String = "",
    val photoUrl: String? = null,
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class AdminRecord(
    @DocumentId val id: String = "",
    val adminId: String = "",
    val email: String = "",
    val grantedBy: String = "",
    val createdAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class Product(
    @DocumentId val id: String = "",
    val title: String = "",
    val description: String = "",
    val category: String = ProductCategory.ELECTRONICS.label,
    val priceCents: Long = 0L,
    val stockCount: Long = 0L,
    val imageKey: String = "electronics",
    val active: Boolean = true,
    val featured: Boolean = false,
    val createdBy: String = "",
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
) {
    fun toCreateMap(adminUid: String): Map<String, Any> = mapOf(
        "title" to title.trim(),
        "description" to description.trim(),
        "category" to ProductCategory.fromRaw(category).label,
        "priceCents" to priceCents,
        "stockCount" to stockCount,
        "imageKey" to imageKey.trim().ifEmpty { "electronics" },
        "active" to active,
        "featured" to featured,
        "createdBy" to adminUid,
        "createdAt" to FieldValue.serverTimestamp(),
        "updatedAt" to FieldValue.serverTimestamp()
    )

    fun toAdminUpdateMap(): Map<String, Any> = mapOf(
        "title" to title.trim(),
        "description" to description.trim(),
        "category" to ProductCategory.fromRaw(category).label,
        "priceCents" to priceCents,
        "stockCount" to stockCount,
        "imageKey" to imageKey.trim().ifEmpty { "electronics" },
        "active" to active,
        "featured" to featured,
        "updatedAt" to FieldValue.serverTimestamp()
    )
}

@Keep
@IgnoreExtraProperties
data class CartItem(
    @DocumentId val id: String = "",
    val productId: String = "",
    val title: String = "",
    val priceCents: Long = 0L,
    val imageKey: String = "electronics",
    val quantity: Long = 1L,
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
)

@Keep
@IgnoreExtraProperties
data class OrderLineItem(
    val productId: String = "",
    val title: String = "",
    val priceCents: Long = 0L,
    val quantity: Long = 1L
) {
    fun toMap(): Map<String, Any> = mapOf(
        "productId" to productId,
        "title" to title,
        "priceCents" to priceCents,
        "quantity" to quantity
    )
}

@Keep
@IgnoreExtraProperties
data class Order(
    @DocumentId val id: String = "",
    val userId: String = "",
    val customerName: String = "",
    val customerEmail: String = "",
    val shippingAddress: String = "",
    val customerPhone: String = "",
    val paymentMethod: String = PaymentMethod.CASH_ON_DELIVERY.label,
    val status: String = OrderStatus.PENDING.name,
    val totalCents: Long = 0L,
    val itemCount: Long = 0L,
    val items: List<OrderLineItem> = emptyList(),
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
)

fun formatCents(cents: Long): String {
    val formatter = NumberFormat.getCurrencyInstance(Locale.US)
    return formatter.format(cents / 100.0)
}
