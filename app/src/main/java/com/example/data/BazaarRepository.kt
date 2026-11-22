package com.example.data

import android.content.Context
import com.example.R
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class BazaarRepository(
    private val db: FirebaseFirestore,
    private val auth: FirebaseAuth = Firebase.auth
) {
    constructor(context: Context) : this(
        FirebaseFirestore.getInstance(
            context.applicationContext.getString(R.string.firestore_database_id)
        )
    )

    private fun requireUserId(): String {
        return auth.currentUser?.uid?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("User must be signed in with Google before accessing Firestore.")
    }

    suspend fun syncSignedInUserProfile(user: FirebaseUser): Result<Unit> {
        val path = "users/${user.uid}"
        return try {
            val uid = requireUserId()
            check(uid == user.uid) { "Authenticated user mismatch." }
            val docRef = db.collection("users").document(uid)
            val existing = docRef.get().await()
            val safeName = user.displayName?.trim()?.take(100).orEmpty().ifBlank { "Bazaar Shopper" }
            val safeEmail = user.email?.trim()?.take(160).orEmpty().ifBlank { "shopper@bazaar.app" }
            val safePhoto = user.photoUrl?.toString()?.take(500)?.takeIf { it.isNotBlank() }

            if (!existing.exists()) {
                val payload = buildMap<String, Any> {
                    put("userId", uid)
                    put("displayName", safeName)
                    put("email", safeEmail)
                    if (safePhoto != null) put("photoUrl", safePhoto)
                    put("createdAt", FieldValue.serverTimestamp())
                    put("updatedAt", FieldValue.serverTimestamp())
                }
                docRef.set(payload).await()
            } else {
                val updatePayload = buildMap<String, Any> {
                    put("displayName", safeName)
                    put("email", safeEmail)
                    if (safePhoto != null) put("photoUrl", safePhoto)
                    put("updatedAt", FieldValue.serverTimestamp())
                }
                docRef.update(updatePayload).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, path)
            Result.failure(e)
        }
    }

    fun observeIsFirestoreAdmin(uid: String, email: String?, isEmailVerified: Boolean): Flow<Boolean> {
        if (uid.isBlank()) return flowOf(false)
        if (isEmailVerified && email.equals(BOOTSTRAPPED_ADMIN_EMAIL, ignoreCase = true)) {
            return flowOf(true)
        }
        val path = "admins/$uid"
        return db.collection("admins").document(uid)
            .snapshots()
            .map { it.exists() }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val ex = firestoreError ?: (error as? Exception)
                if (ex != null && auth.currentUser?.uid == uid) {
                    handleFirestoreError(ex, OperationType.GET, path)
                }
                emit(false)
            }
    }

    fun observeActiveProducts(): Flow<List<Product>> = flow {
        val uid = requireUserId()
        val path = "products"
        emitAll(
            db.collection("products")
                .whereEqualTo("active", true)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(Product::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedByDescending { it.featured }
                }
                .catch { error ->
                    handleFlowError(error, OperationType.LIST, path, uid)
                    throw error
                }
        )
    }

    fun observeAllProductsAdmin(): Flow<List<Product>> = flow {
        val uid = requireUserId()
        val path = "products"
        emitAll(
            db.collection("products")
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(Product::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedByDescending { it.updatedAt ?: it.createdAt }
                }
                .catch { error ->
                    handleFlowError(error, OperationType.LIST, path, uid)
                    throw error
                }
        )
    }

    fun observeCart(userId: String): Flow<List<CartItem>> = flow {
        val uid = requireUserId()
        check(uid == userId) { "Signed-in user mismatch." }
        val path = "users/$uid/cart"
        emitAll(
            db.collection("users").document(uid).collection("cart")
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(CartItem::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedBy { it.title }
                }
                .catch { error ->
                    handleFlowError(error, OperationType.LIST, path, uid)
                    throw error
                }
        )
    }

    suspend fun addToCart(product: Product, deltaQty: Long = 1L): Result<Unit> {
        val uid = auth.currentUser?.uid ?: "unauthenticated"
        val docPath = "users/$uid/cart/${product.id}"
        return try {
            val activeUid = requireUserId()
            require(product.id.isNotBlank()) { "Product ID must not be blank." }
            require(product.active && product.stockCount > 0L) { "Product is currently unavailable." }

            val cartRef = db.collection("users").document(activeUid).collection("cart").document(product.id)
            val existing = cartRef.get().await()
            val safeTitle = product.title.trim().take(120).ifEmpty { "Product" }
            val safeImage = product.imageKey.trim().take(500).ifEmpty { "electronics" }
            val safePrice = product.priceCents.coerceIn(1L, 100_000_000L)

            if (existing.exists()) {
                val currentQty = existing.getLong("quantity") ?: 0L
                val targetQty = (currentQty + deltaQty).coerceIn(1L, minOf(50L, product.stockCount))
                cartRef.update(
                    mapOf(
                        "title" to safeTitle,
                        "priceCents" to safePrice,
                        "imageKey" to safeImage,
                        "quantity" to targetQty,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            } else {
                val targetQty = deltaQty.coerceIn(1L, minOf(50L, product.stockCount))
                cartRef.set(
                    mapOf(
                        "productId" to product.id,
                        "title" to safeTitle,
                        "priceCents" to safePrice,
                        "imageKey" to safeImage,
                        "quantity" to targetQty,
                        "createdAt" to FieldValue.serverTimestamp(),
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, docPath)
            Result.failure(e)
        }
    }

    suspend fun updateCartQuantity(productId: String, newQuantity: Long, maxStock: Long): Result<Unit> {
        val uid = auth.currentUser?.uid ?: "unauthenticated"
        val docPath = "users/$uid/cart/$productId"
        return try {
            val activeUid = requireUserId()
            require(productId.isNotBlank()) { "Product ID required." }
            val cartRef = db.collection("users").document(activeUid).collection("cart").document(productId)
            if (newQuantity <= 0L) {
                cartRef.delete().await()
            } else {
                val clamped = newQuantity.coerceIn(1L, minOf(50L, maxOf(1L, maxStock)))
                cartRef.update(
                    mapOf(
                        "quantity" to clamped,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun removeFromCart(productId: String): Result<Unit> {
        val uid = auth.currentUser?.uid ?: "unauthenticated"
        val docPath = "users/$uid/cart/$productId"
        return try {
            val activeUid = requireUserId()
            require(productId.isNotBlank()) { "Product ID required." }
            db.collection("users").document(activeUid).collection("cart").document(productId)
                .delete().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, docPath)
            Result.failure(e)
        }
    }

    suspend fun placeOrder(
        customerName: String,
        customerEmail: String,
        shippingAddress: String,
        customerPhone: String,
        paymentMethod: PaymentMethod,
        cartItems: List<CartItem>,
        productsById: Map<String, Product>
    ): Result<String> {
        val docPath = "orders"
        return try {
            val uid = requireUserId()
            val trimmedName = customerName.trim()
            val trimmedEmail = customerEmail.trim().ifBlank { "customer@bazaar.app" }
            val trimmedAddress = shippingAddress.trim()
            val trimmedPhone = customerPhone.trim()

            require(trimmedName.length in 2..100) { "Please enter a valid recipient name (2–100 chars)." }
            require(trimmedAddress.length in 5..300) { "Please enter a complete shipping address (min 5 chars)." }
            require(trimmedPhone.length in 5..30) { "Please enter a valid contact phone number." }
            require(cartItems.isNotEmpty() && cartItems.size <= 50) { "Your cart is empty." }

            val lineItems = cartItems.map { item ->
                OrderLineItem(
                    productId = item.productId,
                    title = item.title.take(120),
                    priceCents = item.priceCents,
                    quantity = item.quantity
                )
            }
            val totalCents = lineItems.sumOf { it.priceCents * it.quantity }
            val itemCount = lineItems.sumOf { it.quantity }
            require(totalCents in 1L..500_000_000L) { "Order total out of valid range." }
            require(itemCount in 1L..200L) { "Item count out of valid range." }

            val orderRef = db.collection("orders").document()
            val batch = db.batch()

            val orderPayload = mapOf(
                "userId" to uid,
                "customerName" to trimmedName,
                "customerEmail" to trimmedEmail.take(160),
                "shippingAddress" to trimmedAddress,
                "customerPhone" to trimmedPhone,
                "paymentMethod" to paymentMethod.label,
                "status" to OrderStatus.PENDING.name,
                "totalCents" to totalCents,
                "itemCount" to itemCount,
                "items" to lineItems.map { it.toMap() },
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp()
            )
            batch.set(orderRef, orderPayload)

            for (item in cartItems) {
                val product = productsById[item.productId]
                if (product != null && product.active && product.stockCount >= item.quantity) {
                    val newStock = (product.stockCount - item.quantity).coerceAtLeast(0L)
                    if (newStock < product.stockCount) {
                        batch.update(
                            db.collection("products").document(product.id),
                            mapOf(
                                "stockCount" to newStock,
                                "updatedAt" to FieldValue.serverTimestamp()
                            )
                        )
                    }
                }
                batch.delete(
                    db.collection("users").document(uid).collection("cart").document(item.productId)
                )
            }

            batch.commit().await()
            Result.success(orderRef.id)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, docPath)
            Result.failure(e)
        }
    }

    fun observeUserOrders(userId: String): Flow<List<Order>> = flow {
        val uid = requireUserId()
        check(uid == userId) { "Signed-in user mismatch." }
        val path = "orders"
        emitAll(
            db.collection("orders")
                .whereEqualTo("userId", uid)
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(Order::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedByDescending { it.createdAt }
                }
                .catch { error ->
                    handleFlowError(error, OperationType.LIST, path, uid)
                    throw error
                }
        )
    }

    fun observeAllOrdersAdmin(): Flow<List<Order>> = flow {
        val uid = requireUserId()
        val path = "orders"
        emitAll(
            db.collection("orders")
                .snapshots()
                .map { snapshot ->
                    snapshot.toObjects(Order::class.java, DocumentSnapshot.ServerTimestampBehavior.ESTIMATE)
                        .sortedByDescending { it.createdAt }
                }
                .catch { error ->
                    handleFlowError(error, OperationType.LIST, path, uid)
                    throw error
                }
        )
    }

    suspend fun cancelOwnPendingOrder(orderId: String): Result<Unit> {
        val docPath = "orders/$orderId"
        return try {
            requireUserId()
            require(orderId.isNotBlank()) { "Order ID required." }
            db.collection("orders").document(orderId).update(
                mapOf(
                    "status" to OrderStatus.CANCELLED.name,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
            ).await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun upsertProduct(product: Product): Result<Unit> {
        val isCreate = product.id.isBlank()
        val docPath = if (isCreate) "products" else "products/${product.id}"
        return try {
            val uid = requireUserId()
            val cleanTitle = product.title.trim()
            val cleanDesc = product.description.trim()
            require(cleanTitle.length in 2..120) { "Title must be 2–120 characters." }
            require(cleanDesc.length in 2..1000) { "Description must be 2–1000 characters." }
            require(product.priceCents in 1L..100_000_000L) { "Price must be greater than $0.00." }
            require(product.stockCount in 0L..100_000L) { "Stock must be 0–100,000." }

            val normalized = product.copy(title = cleanTitle, description = cleanDesc)
            if (isCreate) {
                val docRef = db.collection("products").document()
                docRef.set(normalized.toCreateMap(uid)).await()
            } else {
                db.collection("products").document(product.id)
                    .update(normalized.toAdminUpdateMap())
                    .await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, if (isCreate) OperationType.CREATE else OperationType.UPDATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun deleteProduct(productId: String): Result<Unit> {
        val docPath = "products/$productId"
        return try {
            requireUserId()
            require(productId.isNotBlank()) { "Product ID required." }
            db.collection("products").document(productId).delete().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, docPath)
            Result.failure(e)
        }
    }

    suspend fun updateOrderStatus(orderId: String, newStatus: OrderStatus): Result<Unit> {
        val docPath = "orders/$orderId"
        return try {
            requireUserId()
            require(orderId.isNotBlank()) { "Order ID required." }
            db.collection("orders").document(orderId).update(
                mapOf(
                    "status" to newStatus.name,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
            ).await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun seedStarterCatalog(): Result<Unit> {
        val path = "products"
        return try {
            val uid = requireUserId()
            val starters = listOf(
                "starter_anc_headphones" to Product(
                    title = "Obsidian ANC Studio Headphones",
                    description = "Active noise-canceling wireless over-ear headphones with 40-hour battery, plush memory foam earcups, and lossless USB-C audio.",
                    category = ProductCategory.ELECTRONICS.label,
                    priceCents = 18900L,
                    stockCount = 18L,
                    imageKey = "electronics",
                    active = true,
                    featured = true
                ),
                "starter_cognac_tote" to Product(
                    title = "Artisan Cognac Leather Tote",
                    description = "Hand-stitched full-grain vegetable-tanned leather tote with brass hardware and a padded 14-inch laptop sleeve.",
                    category = ProductCategory.FASHION.label,
                    priceCents = 14500L,
                    stockCount = 12L,
                    imageKey = "fashion",
                    active = true,
                    featured = true
                ),
                "starter_sage_carafe" to Product(
                    title = "Matte Sage Ceramic Pour-Over Set",
                    description = "Stoneware coffee dripper and insulated serving carafe with natural oak collar for clean, aromatic morning brews.",
                    category = ProductCategory.HOME.label,
                    priceCents = 6400L,
                    stockCount = 24L,
                    imageKey = "home",
                    active = true,
                    featured = true
                ),
                "starter_titanium_watch" to Product(
                    title = "Minimalist Titanium Smartwatch",
                    description = "Sapphire crystal AMOLED display, 10-day endurance battery, heart-rate & sleep telemetry, and 5ATM water resistance.",
                    category = ProductCategory.ELECTRONICS.label,
                    priceCents = 22900L,
                    stockCount = 9L,
                    imageKey = "electronics",
                    active = true,
                    featured = false
                ),
                "starter_tortoise_shades" to Product(
                    title = "Heritage Tortoise Sunglasses",
                    description = "Polarized UV400 green-tint mineral lenses set in hand-finished Italian acetate and brushed gold temples.",
                    category = ProductCategory.ACCESSORIES.label,
                    priceCents = 8800L,
                    stockCount = 15L,
                    imageKey = "fashion",
                    active = true,
                    featured = false
                ),
                "starter_brass_lamp" to Product(
                    title = "Arc Brushed Brass Desk Lamp",
                    description = "Sculptural curved reading lamp in warm satin brass with stepless touch dimming and flicker-free warm LED.",
                    category = ProductCategory.HOME.label,
                    priceCents = 11900L,
                    stockCount = 7L,
                    imageKey = "home",
                    active = true,
                    featured = false
                )
            )
            val batch = db.batch()
            for ((docId, prod) in starters) {
                batch.set(db.collection("products").document(docId), prod.toCreateMap(uid))
            }
            batch.commit().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, path)
            Result.failure(e)
        }
    }

    private fun handleFlowError(
        error: Throwable,
        operationType: OperationType,
        path: String,
        uid: String
    ) {
        val firestoreError = generateSequence(error) { it.cause }
            .filterIsInstance<FirebaseFirestoreException>()
            .firstOrNull()
        if (firestoreError == null && error is CancellationException) return
        val exceptionToLog = firestoreError ?: (error as? Exception)
        if (exceptionToLog != null && auth.currentUser?.uid == uid) {
            handleFirestoreError(exceptionToLog, operationType, path)
        }
    }

    companion object {
        const val BOOTSTRAPPED_ADMIN_EMAIL = "abdulmanan304000@gmail.com"
    }
}
