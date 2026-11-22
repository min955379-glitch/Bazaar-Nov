package com.example.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.BazaarRepository
import com.example.data.CartItem
import com.example.data.Order
import com.example.data.OrderStatus
import com.example.data.PaymentMethod
import com.example.data.Product
import com.example.security.SecureAdminKeyStore
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
}

class BazaarViewModel(
    private val repository: BazaarRepository,
    private val keyStore: SecureAdminKeyStore,
    private val currentUserId: String,
    private val userEmail: String?,
    private val isEmailVerified: Boolean
) : ViewModel() {

    val isFirestoreAdmin: StateFlow<Boolean> = repository
        .observeIsFirestoreAdmin(currentUserId, userEmail, isEmailVerified)
        .catch { error ->
            if (error is CancellationException) throw error
            emit(false)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
            initialValue = isEmailVerified && userEmail.equals(
                BazaarRepository.BOOTSTRAPPED_ADMIN_EMAIL,
                ignoreCase = true
            )
        )

    val productsState: StateFlow<UiState<List<Product>>> = repository.observeActiveProducts()
        .toUiStateFlow("observeActiveProducts")

    val cartState: StateFlow<UiState<List<CartItem>>> = repository.observeCart(currentUserId)
        .toUiStateFlow("observeCart")

    val ordersState: StateFlow<UiState<List<Order>>> = repository.observeUserOrders(currentUserId)
        .toUiStateFlow("observeUserOrders")

    private val _adminUnlocked = MutableStateFlow(false)
    val adminUnlocked: StateFlow<Boolean> = _adminUnlocked.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    val adminProductsState: StateFlow<UiState<List<Product>>> = isFirestoreAdmin
        .flatMapLatest { isAdmin ->
            if (isAdmin) {
                repository.observeAllProductsAdmin().toRawUiStateFlow("observeAllProductsAdmin")
            } else {
                flowOf(UiState.Success(emptyList()))
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
            initialValue = UiState.Loading
        )

    @OptIn(ExperimentalCoroutinesApi::class)
    val adminOrdersState: StateFlow<UiState<List<Order>>> = isFirestoreAdmin
        .flatMapLatest { isAdmin ->
            if (isAdmin) {
                repository.observeAllOrdersAdmin().toRawUiStateFlow("observeAllOrdersAdmin")
            } else {
                flowOf(UiState.Success(emptyList()))
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
            initialValue = UiState.Loading
        )

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedCategory = MutableStateFlow<String?>(null)
    val selectedCategory: StateFlow<String?> = _selectedCategory.asStateFlow()

    private val _isBusy = MutableStateFlow(false)
    val isBusy: StateFlow<Boolean> = _isBusy.asStateFlow()

    private val _feedbackMessage = MutableStateFlow<String?>(null)
    val feedbackMessage: StateFlow<String?> = _feedbackMessage.asStateFlow()

    private val _adminAuthError = MutableStateFlow<String?>(null)
    val adminAuthError: StateFlow<String?> = _adminAuthError.asStateFlow()

    fun syncUserProfile(user: FirebaseUser) {
        viewModelScope.launch {
            repository.syncSignedInUserProfile(user)
        }
    }

    fun updateSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun selectCategory(category: String?) {
        _selectedCategory.value = category
    }

    fun clearFeedback() {
        _feedbackMessage.value = null
    }

    fun clearAdminAuthError() {
        _adminAuthError.value = null
    }

    fun encryptionMethodSummary(): String = keyStore.encryptionMethodSummary()

    fun hasAdminPasscode(): Boolean = keyStore.hasPasscode()

    /**
     * First-run setup: create the encrypted admin verifier. No default
     * passcode is ever seeded, so the first-run experience is always
     * "set your own" — never a known one.
     */
    fun createAdminPasscode(newPasscode: String) {
        val result = keyStore.storeInitialPasscode(newPasscode)
        result.fold(
            onSuccess = {
                _adminUnlocked.value = true
                _adminAuthError.value = null
                _feedbackMessage.value = "Admin passcode created and sealed with Android Keystore."
            },
            onFailure = {
                _adminAuthError.value = it.localizedMessage ?: "Failed to create admin passcode."
            }
        )
    }

    fun unlockAdminPanel(passcode: String) {
        if (!keyStore.hasPasscode()) {
            _adminAuthError.value = "No admin passcode is set yet. Create one first."
            _feedbackMessage.value = null
            return
        }
        if (keyStore.verifyPasscode(passcode)) {
            _adminUnlocked.value = true
            _adminAuthError.value = null
            _feedbackMessage.value = "Admin Panel unlocked via encrypted key verifier."
        } else {
            _adminAuthError.value = "Invalid passcode. Please check and try again."
        }
    }

    fun lockAdminPanel() {
        _adminUnlocked.value = false
    }

    fun changeAdminPasscode(currentPasscode: String, newPasscode: String) {
        val result = keyStore.updatePasscode(currentPasscode, newPasscode)
        _feedbackMessage.value = result.fold(
            onSuccess = { "Admin passcode re-encrypted and updated in Android Keystore." },
            onFailure = { it.localizedMessage ?: "Failed to update passcode." }
        )
    }

    fun addToCart(product: Product, quantity: Long = 1L) {
        viewModelScope.launch {
            _isBusy.value = true
            val result = repository.addToCart(product, quantity)
            _isBusy.value = false
            _feedbackMessage.value = result.fold(
                onSuccess = { "Added ${product.title} to cart." },
                onFailure = { it.localizedMessage ?: "Could not add item to cart." }
            )
        }
    }

    fun updateCartQuantity(productId: String, newQty: Long, maxStock: Long) {
        viewModelScope.launch {
            val result = repository.updateCartQuantity(productId, newQty, maxStock)
            result.onFailure {
                _feedbackMessage.value = it.localizedMessage ?: "Could not update cart quantity."
            }
        }
    }

    fun removeFromCart(productId: String) {
        viewModelScope.launch {
            val result = repository.removeFromCart(productId)
            result.onFailure {
                _feedbackMessage.value = it.localizedMessage ?: "Could not remove item."
            }
        }
    }

    fun placeOrder(
        customerName: String,
        shippingAddress: String,
        customerPhone: String,
        paymentMethod: PaymentMethod,
        cartItems: List<CartItem>,
        products: List<Product>,
        onOrderPlaced: () -> Unit
    ) {
        viewModelScope.launch {
            _isBusy.value = true
            val productsById = products.associateBy { it.id }
            val result = repository.placeOrder(
                customerName = customerName,
                customerEmail = userEmail ?: "shopper@bazaar.app",
                shippingAddress = shippingAddress,
                customerPhone = customerPhone,
                paymentMethod = paymentMethod,
                cartItems = cartItems,
                productsById = productsById
            )
            _isBusy.value = false
            result.fold(
                onSuccess = { orderId ->
                    _feedbackMessage.value = "Order #${orderId.take(6).uppercase()} placed live!"
                    onOrderPlaced()
                },
                onFailure = {
                    _feedbackMessage.value = it.localizedMessage ?: "Order submission failed."
                }
            )
        }
    }

    fun cancelOrder(orderId: String) {
        viewModelScope.launch {
            _isBusy.value = true
            val result = repository.cancelOwnPendingOrder(orderId)
            _isBusy.value = false
            _feedbackMessage.value = result.fold(
                onSuccess = { "Order cancelled." },
                onFailure = { it.localizedMessage ?: "Could not cancel order." }
            )
        }
    }

    fun saveProduct(product: Product, onSaved: () -> Unit) {
        viewModelScope.launch {
            _isBusy.value = true
            val result = repository.upsertProduct(product)
            _isBusy.value = false
            result.fold(
                onSuccess = {
                    _feedbackMessage.value = if (product.id.isBlank()) {
                        "Product published live to Firestore."
                    } else {
                        "Product updated live."
                    }
                    onSaved()
                },
                onFailure = {
                    _feedbackMessage.value = it.localizedMessage ?: "Failed to save product."
                }
            )
        }
    }

    fun deleteProduct(productId: String) {
        viewModelScope.launch {
            _isBusy.value = true
            val result = repository.deleteProduct(productId)
            _isBusy.value = false
            _feedbackMessage.value = result.fold(
                onSuccess = { "Product removed from catalog." },
                onFailure = { it.localizedMessage ?: "Failed to delete product." }
            )
        }
    }

    fun updateOrderStatus(orderId: String, status: OrderStatus) {
        viewModelScope.launch {
            _isBusy.value = true
            val result = repository.updateOrderStatus(orderId, status)
            _isBusy.value = false
            _feedbackMessage.value = result.fold(
                onSuccess = { "Order updated to ${status.label}." },
                onFailure = { it.localizedMessage ?: "Failed to update order status." }
            )
        }
    }

    fun seedStarterCatalog() {
        viewModelScope.launch {
            _isBusy.value = true
            val result = repository.seedStarterCatalog()
            _isBusy.value = false
            _feedbackMessage.value = result.fold(
                onSuccess = { "6 starter products published live to Firestore!" },
                onFailure = { it.localizedMessage ?: "Could not load starter catalog." }
            )
        }
    }

    private fun <T> Flow<T>.toRawUiStateFlow(opName: String): Flow<UiState<T>> =
        this.map<T, UiState<T>> { UiState.Success(it) }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val rootError = firestoreError ?: error
                Log.w(TAG, "Error in $opName", rootError)
                emit(UiState.Error(rootError.message ?: "Failed to load data"))
            }

    private fun <T> Flow<T>.toUiStateFlow(opName: String): StateFlow<UiState<T>> =
        toRawUiStateFlow(opName)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
                initialValue = UiState.Loading
            )

    private companion object {
        const val TAG = "BazaarVM"
        const val STOP_TIMEOUT_MILLIS = 5000L
    }
}
