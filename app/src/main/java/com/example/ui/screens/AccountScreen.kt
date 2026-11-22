package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.example.R
import com.example.data.Order
import com.example.data.OrderStatus
import com.example.data.Product
import com.example.ui.UiState

@Composable
fun AccountScreen(
    displayName: String,
    email: String,
    isFirestoreAdmin: Boolean,
    adminUnlocked: Boolean,
    adminAuthError: String?,
    encryptionSummary: String,
    adminProductsState: UiState<List<Product>>,
    adminOrdersState: UiState<List<Order>>,
    isBusy: Boolean,
    adminPasscodeSet: Boolean,
    onUnlockAdmin: (String) -> Unit,
    onClearAdminAuthError: () -> Unit,
    onCreateAdminPasscode: (String) -> Unit,
    onLockAdmin: () -> Unit,
    onChangeAdminPasscode: (String, String) -> Unit,
    onSaveProduct: (Product, () -> Unit) -> Unit,
    onDeleteProduct: (String) -> Unit,
    onUpdateOrderStatus: (String, OrderStatus) -> Unit,
    onSeedStarterCatalog: () -> Unit,
    onSignOut: () -> Unit
) {
    if (adminUnlocked) {
        AdminDashboard(
            userEmail = email,
            isFirestoreAdmin = isFirestoreAdmin,
            encryptionSummary = encryptionSummary,
            adminProductsState = adminProductsState,
            adminOrdersState = adminOrdersState,
            isBusy = isBusy,
            onLockAdmin = onLockAdmin,
            onChangeAdminPasscode = onChangeAdminPasscode,
            onSaveProduct = onSaveProduct,
            onDeleteProduct = onDeleteProduct,
            onUpdateOrderStatus = onUpdateOrderStatus,
            onSeedStarterCatalog = onSeedStarterCatalog
        )
        return
    }

    var passcodeInput by remember { mutableStateOf("") }
    var maskInput by remember { mutableStateOf(true) }
    var setupPasscodeInput by remember { mutableStateOf("") }
    var setupConfirmInput by remember { mutableStateOf("") }
    var setupError by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 640.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Account & Store Admin",
                style = MaterialTheme.typography.headlineMedium
            )

            // Signed-in Google profile card
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
                ),
                shape = MaterialTheme.shapes.large,
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(52.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = displayName.take(1).uppercase().ifBlank { "B" },
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = displayName.ifBlank { "Bazaar Shopper" },
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                text = email,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = CircleShape
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.VerifiedUser,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = if (isFirestoreAdmin) "Firebase Live Admin" else "Firebase Connected",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                            }
                        }
                    }

                    OutlinedButton(
                        onClick = onSignOut,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .testTag("sign_out_button")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(stringResource(R.string.sign_out))
                    }
                }
            }

            // Encrypted Admin Panel Entry Gate (passcode is NEVER displayed anywhere in UI)
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLowest
                ),
                shape = MaterialTheme.shapes.large,
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(42.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.secondaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Filled.AdminPanelSettings,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                        }
                        Column {
                            Text(
                                text = if (adminPasscodeSet) stringResource(R.string.admin_lock_title)
                                    else stringResource(R.string.admin_setup_title),
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                text = encryptionSummary,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    if (!adminPasscodeSet) {
                        Text(
                            text = stringResource(R.string.admin_setup_subtitle),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        OutlinedTextField(
                            value = setupPasscodeInput,
                            onValueChange = {
                                setupPasscodeInput = it
                                setupError = null
                                if (adminAuthError != null) onClearAdminAuthError()
                            },
                            label = { Text(stringResource(R.string.admin_create_passcode_label)) },
                            leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                            trailingIcon = {
                                IconButton(onClick = { maskInput = !maskInput }) {
                                    Icon(
                                        imageVector = if (maskInput) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                        contentDescription = if (maskInput) "Show typed passcode" else "Hide typed passcode"
                                    )
                                }
                            },
                            visualTransformation = if (maskInput) PasswordVisualTransformation() else VisualTransformation.None,
                            singleLine = true,
                            isError = setupError != null || adminAuthError != null,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("admin_setup_passcode_input")
                        )
                        OutlinedTextField(
                            value = setupConfirmInput,
                            onValueChange = {
                                setupConfirmInput = it
                                setupError = null
                            },
                            label = { Text(stringResource(R.string.admin_confirm_passcode_label)) },
                            leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                            trailingIcon = {
                                IconButton(onClick = { maskInput = !maskInput }) {
                                    Icon(
                                        imageVector = if (maskInput) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                        contentDescription = if (maskInput) "Show typed passcode" else "Hide typed passcode"
                                    )
                                }
                            },
                            visualTransformation = if (maskInput) PasswordVisualTransformation() else VisualTransformation.None,
                            singleLine = true,
                            isError = setupError != null || adminAuthError != null,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("admin_setup_confirm_input")
                        )
                        val setupErrorMessage = setupError ?: adminAuthError
                        if (setupErrorMessage != null) {
                            Text(
                                text = setupErrorMessage,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                        Button(
                            onClick = {
                                if (setupPasscodeInput.length < 6) {
                                    setupError = "Passcode must be at least 6 characters."
                                    return@Button
                                }
                                if (setupPasscodeInput != setupConfirmInput) {
                                    setupError = "Passcodes do not match. Please re-enter."
                                    return@Button
                                }
                                onCreateAdminPasscode(setupPasscodeInput)
                                setupPasscodeInput = ""
                                setupConfirmInput = ""
                            },
                            enabled = setupPasscodeInput.isNotEmpty() && setupConfirmInput.isNotEmpty(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp)
                                .testTag("admin_setup_create_button"),
                            shape = MaterialTheme.shapes.medium
                        ) {
                            Text(stringResource(R.string.admin_setup_action))
                        }
                    } else {
                        Text(
                            text = stringResource(R.string.admin_lock_subtitle),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        OutlinedTextField(
                            value = passcodeInput,
                            onValueChange = {
                                passcodeInput = it
                                if (adminAuthError != null) onClearAdminAuthError()
                            },
                            label = { Text(stringResource(R.string.admin_passcode_label)) },
                            leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                            trailingIcon = {
                                IconButton(onClick = { maskInput = !maskInput }) {
                                    Icon(
                                        imageVector = if (maskInput) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                        contentDescription = if (maskInput) "Show typed passcode" else "Hide typed passcode"
                                    )
                                }
                            },
                            visualTransformation = if (maskInput) PasswordVisualTransformation() else VisualTransformation.None,
                            singleLine = true,
                            isError = adminAuthError != null,
                            supportingText = adminAuthError?.let { err -> { Text(err) } },
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("admin_passcode_input")
                        )

                        Button(
                            onClick = {
                                onUnlockAdmin(passcodeInput)
                                passcodeInput = ""
                            },
                            enabled = passcodeInput.isNotEmpty(),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp)
                                .testTag("admin_unlock_button"),
                            shape = MaterialTheme.shapes.medium
                        ) {
                            Text(stringResource(R.string.admin_unlock_action))
                        }
                    }
                }
            }
        }
    }
}
