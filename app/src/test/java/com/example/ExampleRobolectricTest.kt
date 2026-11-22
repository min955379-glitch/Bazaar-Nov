package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.security.SecureAdminKeyStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

    @Test
    fun `read string from context`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val appName = context.getString(R.string.app_name)
        assertEquals("Bazaar", appName)
    }

    @Test
    fun `admin key store verifies passcode using encrypted storage without plaintext leak`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val keyStore = SecureAdminKeyStore(context)

        assertTrue(keyStore.verifyPasscode("larkana"))
        assertFalse(keyStore.verifyPasscode("wrong_pass"))
        assertFalse(keyStore.verifyPasscode(""))

        val prefs = context.getSharedPreferences("bazaar_secure_admin_prefs", Context.MODE_PRIVATE)
        val rawValues = prefs.all.values.joinToString("|")
        assertFalse("Passcode must never be stored in plaintext", rawValues.contains("larkana"))

        assertTrue(keyStore.updatePasscode("larkana", "newSecure99").isSuccess)
        assertFalse(keyStore.verifyPasscode("larkana"))
        assertTrue(keyStore.verifyPasscode("newSecure99"))
    }
}
