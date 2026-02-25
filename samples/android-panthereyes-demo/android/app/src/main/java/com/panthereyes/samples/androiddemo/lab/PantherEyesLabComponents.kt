package com.panthereyes.samples.androiddemo.lab

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

@Composable
fun LabSectionCard(
    title: String,
    subtitle: String?,
    icon: ImageVector,
    accent: Color,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(accent.copy(alpha = 0.14f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(16.dp))
                    }
                    Column {
                        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        if (!subtitle.isNullOrBlank()) {
                            Text(
                                subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                trailing?.invoke()
            }
            content()
        }
    }
}

@Composable
fun EditableCopyRow(
    item: LabTextItem,
    onValueChange: (String) -> Unit,
    onCopy: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(item.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    item.helperText?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(2.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (item.isModified) {
                    AssistChip(
                        onClick = {},
                        enabled = false,
                        label = { Text("Editado") },
                        colors = AssistChipDefaults.assistChipColors(
                            disabledContainerColor = MaterialTheme.colorScheme.tertiaryContainer,
                            disabledLabelColor = MaterialTheme.colorScheme.onTertiaryContainer,
                        ),
                    )
                }
            }

            OutlinedTextField(
                value = item.value,
                onValueChange = onValueChange,
                modifier = Modifier.fillMaxWidth(),
                minLines = if (item.value.length > 140 || item.value.contains("\n")) 4 else 2,
                maxLines = 8,
                textStyle = if (item.monospaced) {
                    MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)
                } else {
                    MaterialTheme.typography.bodySmall
                },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onCopy) {
                    Icon(Icons.Filled.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Copiar")
                }
                OutlinedButton(onClick = onReset, enabled = item.isModified) {
                    Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Resetar")
                }
            }
        }
    }
}

@Composable
fun SectionSearchField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
        label = { Text(label) },
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
        trailingIcon = {
            if (value.isNotBlank()) {
                IconButton(onClick = onClear) {
                    Icon(Icons.Filled.Close, contentDescription = "Limpar")
                }
            }
        },
        textStyle = MaterialTheme.typography.bodyMedium,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
    )
}

@Composable
fun SectionFooterActionBar(
    itemCount: Int,
    onCopyAll: () -> Unit,
    onResetAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "$itemCount item(ns)",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Button(onClick = onCopyAll) { Text("Copiar tudo") }
            OutlinedButton(onClick = onResetAll) { Text("Resetar todos") }
        }
    }
}

@Composable
fun CopyToastBanner(
    message: String?,
    token: Int,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val visible = message != null
    var progressTarget by remember(token) { mutableFloatStateOf(0f) }
    val progress by animateFloatAsState(
        targetValue = progressTarget,
        animationSpec = tween(durationMillis = 1100, easing = LinearEasing),
        label = "copy-toast-progress",
    )
    val scale by animateFloatAsState(
        targetValue = if (visible) 1f else 0.96f,
        animationSpec = tween(durationMillis = 220, easing = FastOutSlowInEasing),
        label = "copy-toast-scale",
    )

    LaunchedEffect(token, visible) {
        if (!visible) return@LaunchedEffect
        progressTarget = 0f
        progressTarget = 1f
        delay(1350)
        onDismiss()
    }

    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically { -it / 2 } + fadeIn(),
        exit = slideOutVertically { -it / 2 } + fadeOut(),
        modifier = modifier,
    ) {
        Surface(
            shape = RoundedCornerShape(999.dp),
            tonalElevation = 4.dp,
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .scale(scale),
        ) {
            Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(message.orEmpty(), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = progress.coerceIn(0f, 1f),
                    modifier = Modifier.fillMaxWidth(),
                    trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                )
            }
        }
    }
}

@Composable
fun EmptyFilterState(message: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Text(
            message,
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun FooterPreview() {
    MaterialTheme {
        Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState())) {
            SectionFooterActionBar(itemCount = 5, onCopyAll = {}, onResetAll = {})
        }
    }
}
