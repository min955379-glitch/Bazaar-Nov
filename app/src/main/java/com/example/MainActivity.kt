package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.data.BazaarRepository
import com.example.data.signOutUser
import com.example.security.SecureAdminKeyStore
import com.example.ui.BazaarViewModel
import com.example.ui.UiState
import com.example.ui.screens.AccountScreen
import com.example.ui.screens.AuthScreen
import com.example.ui.screens.CartScreen
import com.example.ui.screens.OrdersScreen
import com.example.ui.screens.ShopScreen
import com.example.ui.theme.BazaarTheme
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FirebaseFirestore

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BazaarTheme {
                AppContent()
            }
        }
    }
}

@Composable
fun AppContent() {
    var currentUser by remember { mutableStateOf(Firebase.auth.currentUser) }

    DisposableEffect(Unit) {
        val listener = FirebaseAuth.AuthStateListener { auth ->
            currentUser = auth.currentUser
        }
        Firebase.auth.addAuthStateListener(listener)
        onDispose { Firebase.auth.removeAuthStateListener(listener) }
    }

    val user = currentUser
    if (user == null) {
        AuthScreen(
            onAuthSuccess = { currentUser = Firebase.auth.currentUser }
        )
    } else {
        val uid = user.uid
        key(uid) {
            BazaarMainShell(user = user)
        }
    }
}

private data class NavDestination(
    val index: Int,
    val labelRes: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
    val tag: String
)

@Composable
private fun BazaarMainShell(user: FirebaseUser) {
    val uid = user.uid
    val viewModel: BazaarViewModel = viewModel(
        key = uid,
        factory = viewModelFactory {
            initializer {
                val app = checkNotNull(this[APPLICATION_KEY])
                val databaseId = app.getString(R.string.firestore_database_id)
                val db = FirebaseFirestore.getInstance(databaseId)
                BazaarViewModel(
                    repository = BazaarRepository(db),
                    keyStore = SecureAdminKeyStore(app),
                    currentUserId = uid,
                    userEmail = user.email,
                    isEmailVerified = user.isEmailVerified
                )
            }
        }
    )

    LaunchedEffect(uid) {
        viewModel.syncUserProfile(user)
    }

    val productsState by viewModel.productsState.collectAsStateWithLifecycle()
    val cartState by viewModel.cartState.collectAsStateWithLifecycle()
    val ordersState by viewModel.ordersState.collectAsStateWithLifecycle()
    val isFirestoreAdmin by viewModel.isFirestoreAdmin.collectAsStateWithLifecycle()
    val adminUnlocked by viewModel.adminUnlocked.collectAsStateWithLifecycle()
    val adminProductsState by viewModel.adminProductsState.collectAsStateWithLifecycle()
    val adminOrdersState by viewModel.adminOrdersState.collectAsStateWithLifecycle()
    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val selectedCategory by viewModel.selectedCategory.collectAsStateWithLifecycle()
    val isBusy by viewModel.isBusy.collectAsStateWithLifecycle()
    val feedbackMessage by viewModel.feedbackMessage.collectAsStateWithLifecycle()
    val adminAuthError by viewModel.adminAuthError.collectAsStateWithLifecycle()

    val cartBadgeCount = (cartState as? UiState.Success)?.data?.sumOf { it.quantity }?.toInt() ?: 0
    val activeProductsList = (productsState as? UiState.Success)?.data.orEmpty()

    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val credentialManager = remember(context) { CredentialManager.create(context) }

    LaunchedEffect(feedbackMessage) {
        val msg = feedbackMessage
        if (!msg.isNullOrBlank()) {
            snackbarHostState.showSnackbar(msg)
            viewModel.clearFeedback()
        }
    }

    val destinations = remember {
        listOf(
            NavDestination(0, R.string.nav_shop, Icons.Filled.Storefront, Icons.Outlined.Storefront, "nav_shop"),
            NavDestination(1, R.string.nav_cart, Icons.Filled.ShoppingBag, Icons.Outlined.ShoppingBag, "nav_cart"),
            NavDestination(2, R.string.nav_orders, Icons.AutoMirrored.Filled.ReceiptLong, Icons.AutoMirrored.Outlined.ReceiptLong, "nav_orders"),
            NavDestination(3, R.string.nav_account, Icons.Filled.Person, Icons.Outlined.Person, "nav_account")
        )
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val useRail = maxWidth >= 720.dp

        Scaffold(
            modifier = Modifier.fillMaxSize(),
            contentWindowInsets = WindowInsets.safeDrawing,
            snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
            bottomBar = {
                if (!useRail) {
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
                        destinations.forEach { dest ->
                            NavigationBarItem(
                                selected = selectedTab == dest.index,
                                onClick = { selectedTab = dest.index },
                                icon = {
                                    NavItemIcon(
                                        dest = dest,
                                        selected = selectedTab == dest.index,
                                        cartBadgeCount = cartBadgeCount
                                    )
                                },
                                label = { Text(stringResource(dest.labelRes)) },
                                modifier = Modifier.testTag(dest.tag)
                            )
                        }
                    }
                }
            }
        ) { innerPadding ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                if (useRail) {
                    NavigationRail(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest) {
                        destinations.forEach { dest ->
                            NavigationRailItem(
                                selected = selectedTab == dest.index,
                                onClick = { selectedTab = dest.index },
                                icon = {
                                    NavItemIcon(
                                        dest = dest,
                                        selected = selectedTab == dest.index,
                                        cartBadgeCount = cartBadgeCount
                                    )
                                },
                                label = { Text(stringResource(dest.labelRes)) },
                                modifier = Modifier.testTag(dest.tag)
                            )
                        }
                    }
                }

                when (selectedTab) {
                    0 -> ShopScreen(
                        productsState = productsState,
                        searchQuery = searchQuery,
                        selectedCategory = selectedCategory,
                        isFirestoreAdmin = isFirestoreAdmin,
                        isBusy = isBusy,
                        onSearchChange = viewModel::updateSearchQuery,
                        onSelectCategory = viewModel::selectCategory,
                        onAddToCart = { product -> viewModel.addToCart(product) },
                        onSeedStarterCatalog = viewModel::seedStarterCatalog,
                        onOpenAdminTab = { selectedTab = 3 }
                    )
                    1 -> CartScreen(
                        cartState = cartState,
                        products = activeProductsList,
                        defaultCustomerName = user.displayName ?: "",
                        isBusy = isBusy,
                        onUpdateQuantity = viewModel::updateCartQuantity,
                        onRemoveItem = viewModel::removeFromCart,
                        onPlaceOrder = { name, address, phone, method, items, done ->
                            viewModel.placeOrder(
                                customerName = name,
                                shippingAddress = address,
                                customerPhone = phone,
                                paymentMethod = method,
                                cartItems = items,
                                products = activeProductsList,
                                onOrderPlaced = {
                                    done()
                                    selectedTab = 2
                                }
                            )
                        },
                        onBrowseShop = { selectedTab = 0 }
                    )
                    2 -> OrdersScreen(
                        ordersState = ordersState,
                        isBusy = isBusy,
                        onCancelOrder = viewModel::cancelOrder,
                        onBrowseShop = { selectedTab = 0 }
                    )
                    else -> AccountScreen(
                        displayName = user.displayName ?: "Bazaar Shopper",
                        email = user.email ?: "",
                        isFirestoreAdmin = isFirestoreAdmin,
                        adminUnlocked = adminUnlocked,
                        adminAuthError = adminAuthError,
                        encryptionSummary = viewModel.encryptionMethodSummary(),
                        adminProductsState = adminProductsState,
                        adminOrdersState = adminOrdersState,
                        isBusy = isBusy,
                        onUnlockAdmin = viewModel::unlockAdminPanel,
                        onClearAdminAuthError = viewModel::clearAdminAuthError,
                        onLockAdmin = viewModel::lockAdminPanel,
                        onChangeAdminPasscode = viewModel::changeAdminPasscode,
                        onSaveProduct = viewModel::saveProduct,
                        onDeleteProduct = viewModel::deleteProduct,
                        onUpdateOrderStatus = viewModel::updateOrderStatus,
                        onSeedStarterCatalog = viewModel::seedStarterCatalog,
                        onSignOut = {
                            signOutUser(
                                credentialManager = credentialManager,
                                scope = scope
                            )
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun NavItemIcon(
    dest: NavDestination,
    selected: Boolean,
    cartBadgeCount: Int
) {
    val icon = if (selected) dest.selectedIcon else dest.unselectedIcon
    if (dest.index == 1 && cartBadgeCount > 0) {
        BadgedBox(badge = { Badge { Text(cartBadgeCount.toString()) } }) {
            Icon(imageVector = icon, contentDescription = stringResource(dest.labelRes))
        }
    } else {
        Icon(imageVector = icon, contentDescription = stringResource(dest.labelRes))
    }
}
