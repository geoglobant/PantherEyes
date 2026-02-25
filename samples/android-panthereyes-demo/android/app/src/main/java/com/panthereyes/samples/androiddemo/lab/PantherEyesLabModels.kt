package com.panthereyes.samples.androiddemo.lab

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.ui.graphics.vector.ImageVector

enum class LabTextCategory {
    CLI_COMMAND,
    AGENT_PROMPT,
}

data class LabTextItem(
    val id: String,
    val title: String,
    val value: String,
    val originalValue: String,
    val category: LabTextCategory,
    val helperText: String? = null,
    val monospaced: Boolean = true,
) {
    val isModified: Boolean
        get() = value != originalValue
}

data class QuickLabStep(
    val id: String,
    val title: String,
    val detail: String,
    val isDone: Boolean = false,
)

enum class LabEnvironment {
    DEV,
    STAGING,
    PROD,
    ;

    val rawValue: String
        get() = name.lowercase()

    val displayName: String
        get() = name
}

enum class QuickDemoAction(
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
) {
    VALIDATE_CONFIG(
        title = "Validar Config",
        subtitle = "Copia comando de config validate",
        icon = Icons.Filled.Settings,
    ),
    RUN_STATIC_SCAN(
        title = "Rodar Scan",
        subtitle = "Copia comando de scan estatico",
        icon = Icons.Filled.FlashOn,
    ),
    COPY_AGENT_PROMPT(
        title = "Copiar Prompt",
        subtitle = "Copia prompt do agente",
        icon = Icons.Filled.Chat,
    ),
}

data class LabCopyPayload(
    val text: String,
    val toastMessage: String,
)

enum class LabSectionMeta(
    val title: String,
    val icon: ImageVector,
) {
    HEADER("PantherEyes Android Demo", Icons.Filled.Star),
    DEMO("Demo Rapida", Icons.Filled.FlashOn),
    POLICY("Ambiente e Policy", Icons.Filled.Settings),
    CLI("Comandos CLI", Icons.Filled.Build),
    AGENT("Prompts do Agente", Icons.Filled.Chat),
    QUICK_LAB("Quick Lab", Icons.Filled.CheckCircle),
    NOTES("Notas do Sample", Icons.Filled.Info),
    COPY("Copiar", Icons.Filled.ContentCopy),
}
