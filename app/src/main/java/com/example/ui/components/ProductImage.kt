package com.example.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import coil.compose.AsyncImage
import com.example.R

@Composable
fun ProductImage(
    imageKey: String,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop
) {
    val trimmed = imageKey.trim()
    Box(
        modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        when {
            trimmed.startsWith("http://") ||
                trimmed.startsWith("https://") ||
                trimmed.startsWith("content://") -> {
                AsyncImage(
                    model = trimmed,
                    contentDescription = contentDescription,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = contentScale,
                    placeholder = painterResource(id = R.drawable.img_prod_electronics),
                    error = painterResource(id = R.drawable.img_prod_electronics)
                )
            }
            trimmed.equals("fashion", ignoreCase = true) ||
                trimmed.equals("accessories", ignoreCase = true) -> {
                Image(
                    painter = painterResource(id = R.drawable.img_prod_fashion),
                    contentDescription = contentDescription,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = contentScale
                )
            }
            trimmed.equals("home", ignoreCase = true) -> {
                Image(
                    painter = painterResource(id = R.drawable.img_prod_home),
                    contentDescription = contentDescription,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = contentScale
                )
            }
            trimmed.equals("hero", ignoreCase = true) -> {
                Image(
                    painter = painterResource(id = R.drawable.img_hero_banner),
                    contentDescription = contentDescription,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = contentScale
                )
            }
            else -> {
                Image(
                    painter = painterResource(id = R.drawable.img_prod_electronics),
                    contentDescription = contentDescription,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = contentScale
                )
            }
        }
    }
}
