package com.example.ui.screens

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.R
import com.example.data.Order
import com.example.data.OrderStatus
import com.example.data.Product
import com.example.data.ProductCategory
import com.example.data.formatCents
import com.example.ui.UiState
import com.example.ui.components.ProductImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboard(
    userEmail: String,
    isFirestoreAdmin: Boolean,
    encryptionSummary: String,
    adminProductsState: UiState<List<Product>>,
    adminOrdersState: UiState<List<Order>>,
    isBusy: Boolean,
    onLockAdmin: () -> Unit,
    onChangeAdminPasscode: (String, String) -> Unit,
    onSaveProduct: (Product, () -> Unit) -> Unit,
    onDeleteProduct: (String) -> Unit,
    onUpdateOrderStatus: (String, OrderStatus) -> Unit,
    onSeedStarterCatalog: () -> Unit
) {
    BackHandler { onLockAdmin() }

    var selectedTab by remember { mutableIntStateOf(0) }
    var editingProduct by remember { mutableStateOf<Product?>(null) }

    val products = (adminProductsState as? UiState.Success)?.data.orEmpty()
    val orders = (adminOrdersState as? UiState.Success)?.data.orEmpty()
    val revenueCents = orders
        .filter { OrderStatus.fromRaw(it.status) != OrderStatus.CANCELLED }
        .sumOf { it.totalCents }
    val pendingCount = orders.count { OrderStatus.fromRaw(it.status) == OrderStatus.PENDING }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 840.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = stringResource(R.string.admin_panel_title),
                        style = MaterialTheme.typography.headlineMedium
                    )
                    Text(
                        text = if (isFirestoreAdmin) "Live Cloud Control · $userEmail" else "Local Key Verified · Read-Only ($userEmail)",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (isFirestoreAdmin) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
                    )
                }
                OutlinedButton(
                    onClick = onLockAdmin,
                    modifier = Modifier
                        .height(48.dp)
                        .testTag("admin_lock_button")
                ) {
                    Icon(Icons.Filled.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(stringResource(R.string.admin_lock_session))
                }
            }

            if (!isFirestoreAdmin) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer
                    )
                ) {
                    Text(
                        text = "Signed in as $userEmail. Cloud Firestore write permissions are restricted to the store owner account (abdulmanan304000@gmail.com).",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            // KPI Summary Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                KpiCard("Products", products.size.toString(), Modifier.weight(1f))
                KpiCard("Pending", pendingCount.toString(), Modifier.weight(1f))
                KpiCard("Revenue", formatCents(revenueCents), Modifier.weight(1.4f))
            }

            PrimaryTabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Products") }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Orders (${orders.size})") }
                )
                Tab(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    text = { Text("Security") }
                )
            }

            when (selectedTab) {
                0 -> AdminProductsTab(
                    productsState = adminProductsState,
                    isFirestoreAdmin = isFirestoreAdmin,
                    isBusy = isBusy,
                    onAddProduct = { editingProduct = Product() },
                    onEditProduct = { editingProduct = it },
                    onToggleActive = { product ->
                        onSaveProduct(product.copy(active = !product.active)) {}
                    },
                    onDeleteProduct = onDeleteProduct,
                    onSeedStarterCatalog = onSeedStarterCatalog
                )
                1 -> AdminOrdersTab(
                    ordersState = adminOrdersState,
                    isFirestoreAdmin = isFirestoreAdmin,
                    isBusy = isBusy,
                    onUpdateOrderStatus = onUpdateOrderStatus
                )
                2 -> AdminSecurityTab(
                    encryptionSummary = encryptionSummary,
                    onChangePasscode = onChangeAdminPasscode
                )
            }
        }
    }

    editingProduct?.let { target ->
        ProductEditorSheet(
            initial = target,
            isBusy = isBusy,
            onDismiss = { editingProduct = null },
            onSave = { updated ->
                onSaveProduct(updated) { editingProduct = null }
            }
        )
    }
}

@Composable
private fun KpiCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
        ),
        shape = MaterialTheme.shapes.medium
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun AdminProductsTab(
    productsState: UiState<List<Product>>,
    isFirestoreAdmin: Boolean,
    isBusy: Boolean,
    onAddProduct: () -> Unit,
    onEditProduct: (Product) -> Unit,
    onToggleActive: (Product) -> Unit,
    onDeleteProduct: (String) -> Unit,
    onSeedStarterCatalog: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = onAddProduct,
                enabled = isFirestoreAdmin && !isBusy,
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp)
                    .testTag("admin_add_product_button")
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(modifier = Modifier.width(6.dp))
                Text("Add Product")
            }
            OutlinedButton(
                onClick = onSeedStarterCatalog,
                enabled = isFirestoreAdmin && !isBusy,
                modifier = Modifier
                    .height(48.dp)
                    .testTag("admin_seed_catalog_button")
            ) {
                Text("Load 6 Starters")
            }
        }

        when (productsState) {
            is UiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            is UiState.Error -> Text(productsState.message, color = MaterialTheme.colorScheme.tertiary)
            is UiState.Success -> {
                val items = productsState.data
                if (items.isEmpty()) {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
                        )
                    ) {
                        Text(
                            text = "No products in live Firestore yet. Tap 'Add Product' or 'Load 6 Starters' above.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(18.dp)
                        )
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(bottom = 24.dp)
                    ) {
                        items(items, key = { it.id }) { product ->
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
                                ),
                                shape = MaterialTheme.shapes.medium
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    ProductImage(
                                        imageKey = product.imageKey,
                                        contentDescription = product.title,
                                        modifier = Modifier
                                            .size(64.dp)
                                            .clip(MaterialTheme.shapes.small)
                                    )
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = product.title,
                                            style = MaterialTheme.typography.titleSmall
                                        )
                                        Text(
                                            text = "${formatCents(product.priceCents)} · Stock: ${product.stockCount} · ${if (product.active) "Live" else "Hidden"}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Switch(
                                        checked = product.active,
                                        onCheckedChange = { onToggleActive(product) },
                                        enabled = isFirestoreAdmin && !isBusy
                                    )
                                    IconButton(
                                        onClick = { onEditProduct(product) },
                                        enabled = isFirestoreAdmin && !isBusy,
                                        modifier = Modifier.size(48.dp)
                                    ) {
                                        Icon(Icons.Filled.Edit, contentDescription = "Edit product")
                                    }
                                    IconButton(
                                        onClick = { onDeleteProduct(product.id) },
                                        enabled = isFirestoreAdmin && !isBusy,
                                        modifier = Modifier.size(48.dp)
                                    ) {
                                        Icon(
                                            Icons.Filled.DeleteOutline,
                                            contentDescription = "Delete product",
                                            tint = MaterialTheme.colorScheme.tertiary
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AdminOrdersTab(
    ordersState: UiState<List<Order>>,
    isFirestoreAdmin: Boolean,
    isBusy: Boolean,
    onUpdateOrderStatus: (String, OrderStatus) -> Unit
) {
    when (ordersState) {
        is UiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        is UiState.Error -> Text(ordersState.message, color = MaterialTheme.colorScheme.tertiary)
        is UiState.Success -> {
            val orders = ordersState.data
            if (orders.isEmpty()) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
                    )
                ) {
                    Text(
                        text = "No customer orders recorded yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(18.dp)
                    )
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(bottom = 24.dp)
                ) {
                    items(orders, key = { it.id }) { order ->
                        val currentStatus = OrderStatus.fromRaw(order.status)
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
                            ),
                            shape = MaterialTheme.shapes.medium
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(
                                            text = "${order.customerName} (#${order.id.take(6).uppercase()})",
                                            style = MaterialTheme.typography.titleSmall
                                        )
                                        Text(
                                            text = "${order.itemCount} items · ${formatCents(order.totalCents)}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                    OrderStatusPill(status = currentStatus)
                                }
                                Text(
                                    text = "${order.customerPhone} · ${order.shippingAddress}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                HorizontalDivider()
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    OrderStatus.entries.forEach { target ->
                                        FilterChip(
                                            selected = currentStatus == target,
                                            enabled = isFirestoreAdmin && !isBusy && currentStatus != target,
                                            onClick = { onUpdateOrderStatus(order.id, target) },
                                            label = {
                                                Text(
                                                    text = target.label.take(4),
                                                    style = MaterialTheme.typography.labelSmall
                                                )
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AdminSecurityTab(
    encryptionSummary: String,
    onChangePasscode: (String, String) -> Unit
) {
    var currentPass by remember { mutableStateOf("") }
    var newPass by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
            ),
            shape = MaterialTheme.shapes.medium
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.Shield,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = "Encrypted Key Storage Active",
                        style = MaterialTheme.typography.titleMedium
                    )
                }
                Text(
                    text = encryptionSummary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = "Passcodes are never stored in plaintext or displayed in the storefront UI. Verification runs via constant-time digest comparison against Keystore-sealed ciphertext.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
            ),
            shape = MaterialTheme.shapes.medium
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "Rotate Admin Passcode",
                    style = MaterialTheme.typography.titleMedium
                )
                OutlinedTextField(
                    value = currentPass,
                    onValueChange = { currentPass = it },
                    label = { Text("Current Passcode") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = newPass,
                    onValueChange = { newPass = it },
                    label = { Text("New Passcode (min 6 chars)") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = {
                        onChangePasscode(currentPass, newPass)
                        currentPass = ""
                        newPass = ""
                    },
                    enabled = currentPass.isNotEmpty() && newPass.length >= 6,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                ) {
                    Text("Update Encrypted Passcode")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductEditorSheet(
    initial: Product,
    isBusy: Boolean,
    onDismiss: () -> Unit,
    onSave: (Product) -> Unit
) {
    var title by remember { mutableStateOf(initial.title) }
    var description by remember { mutableStateOf(initial.description) }
    var category by remember { mutableStateOf(ProductCategory.fromRaw(initial.category)) }
    var priceDollars by remember {
        mutableStateOf(
            if (initial.priceCents > 0) String.format("%.2f", initial.priceCents / 100.0) else ""
        )
    }
    var stockText by remember { mutableStateOf(if (initial.id.isNotBlank()) initial.stockCount.toString() else "10") }
    var imageKey by remember { mutableStateOf(initial.imageKey.ifBlank { "electronics" }) }
    var featured by remember { mutableStateOf(initial.featured) }
    var active by remember { mutableStateOf(initial.active) }
    var errorText by remember { mutableStateOf<String?>(null) }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            imageKey = uri.toString()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = if (initial.id.isBlank()) "New Store Product" else "Edit Product",
                style = MaterialTheme.typography.headlineSmall
            )
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Product Name") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("admin_product_title_input")
            )
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Description") },
                minLines = 2,
                maxLines = 4,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("admin_product_desc_input")
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = priceDollars,
                    onValueChange = { priceDollars = it },
                    label = { Text("Price (USD)") },
                    singleLine = true,
                    modifier = Modifier
                        .weight(1f)
                        .testTag("admin_product_price_input")
                )
                OutlinedTextField(
                    value = stockText,
                    onValueChange = { stockText = it },
                    label = { Text("Stock") },
                    singleLine = true,
                    modifier = Modifier
                        .weight(1f)
                        .testTag("admin_product_stock_input")
                )
            }

            Text(text = "Category", style = MaterialTheme.typography.titleSmall)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                ProductCategory.entries.forEach { cat ->
                    FilterChip(
                        selected = category == cat,
                        onClick = { category = cat },
                        label = { Text(cat.label, style = MaterialTheme.typography.labelSmall) }
                    )
                }
            }

            Text(text = "Product Visual", style = MaterialTheme.typography.titleSmall)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf("electronics", "fashion", "home", "hero").forEach { preset ->
                    FilterChip(
                        selected = imageKey == preset,
                        onClick = { imageKey = preset },
                        label = { Text(preset.replaceFirstChar { it.uppercase() }) }
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = imageKey,
                    onValueChange = { imageKey = it },
                    label = { Text("Image Preset or HTTPS URL") },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                OutlinedButton(
                    onClick = {
                        photoPicker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    },
                    modifier = Modifier.height(48.dp)
                ) {
                    Icon(Icons.Filled.PhotoLibrary, contentDescription = "Pick photo")
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Featured on Home")
                Switch(checked = featured, onCheckedChange = { featured = it })
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Visible in Storefront")
                Switch(checked = active, onCheckedChange = { active = it })
            }

            if (errorText != null) {
                Text(errorText ?: "", color = MaterialTheme.colorScheme.tertiary)
            }

            Button(
                onClick = {
                    val parsedPrice = priceDollars.trim().toDoubleOrNull()
                    val parsedStock = stockText.trim().toLongOrNull()
                    when {
                        title.trim().length < 2 -> errorText = "Enter at least 2 characters for title."
                        description.trim().length < 2 -> errorText = "Enter a product description."
                        parsedPrice == null || parsedPrice <= 0.0 -> errorText = "Enter a valid price greater than 0."
                        parsedStock == null || parsedStock < 0L -> errorText = "Enter valid stock quantity (>= 0)."
                        else -> {
                            errorText = null
                            onSave(
                                initial.copy(
                                    title = title.trim(),
                                    description = description.trim(),
                                    category = category.label,
                                    priceCents = (parsedPrice * 100).toLong().coerceAtLeast(1L),
                                    stockCount = parsedStock,
                                    imageKey = imageKey.trim().ifBlank { "electronics" },
                                    featured = featured,
                                    active = active
                                )
                            )
                        }
                    }
                },
                enabled = !isBusy,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("admin_save_product_button")
            ) {
                Text(if (initial.id.isBlank()) "Publish Product Live" else "Save Changes")
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
