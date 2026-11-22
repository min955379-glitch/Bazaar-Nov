package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val LightColorScheme = lightColorScheme(
    primary = ForestEmerald,
    onPrimary = ElevatedCream,
    primaryContainer = ForestEmeraldContainer,
    onPrimaryContainer = OnForestEmeraldContainer,
    secondary = ChampagneGold,
    onSecondary = EspressoInk,
    secondaryContainer = WarmGoldContainer,
    onSecondaryContainer = OnWarmGoldContainer,
    tertiary = TerracottaAccent,
    onTertiary = ElevatedCream,
    tertiaryContainer = TerracottaContainer,
    onTertiaryContainer = OnTerracottaContainer,
    background = WarmIvory,
    onBackground = EspressoInk,
    surface = WarmIvory,
    onSurface = EspressoInk,
    surfaceVariant = SoftLimestone,
    onSurfaceVariant = WarmSlate,
    surfaceContainerLowest = ElevatedCream,
    surfaceContainerLow = SoftLimestone,
    surfaceContainer = SoftLimestone,
    outline = HairlineSand
)

private val DarkColorScheme = darkColorScheme(
    primary = MintEmerald,
    onPrimary = DeepEmerald,
    primaryContainer = ForestEmerald,
    onPrimaryContainer = ForestEmeraldContainer,
    secondary = SoftChampagne,
    onSecondary = DarkObsidian,
    secondaryContainer = OnWarmGoldContainer,
    onSecondaryContainer = WarmGoldContainer,
    tertiary = SoftTerracotta,
    onTertiary = DarkObsidian,
    tertiaryContainer = OnTerracottaContainer,
    onTertiaryContainer = TerracottaContainer,
    background = DarkObsidian,
    onBackground = LightSageText,
    surface = DarkEmeraldSurface,
    onSurface = LightSageText,
    surfaceVariant = DarkCardSurface,
    onSurfaceVariant = MutedSageText,
    surfaceContainerLowest = DarkEmeraldSurface,
    surfaceContainerLow = DarkCardSurface,
    surfaceContainer = DarkCardSurface,
    outline = DarkCardSurface
)

val BazaarShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

@Composable
fun BazaarTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = BazaarTypography,
        shapes = BazaarShapes,
        content = content
    )
}
