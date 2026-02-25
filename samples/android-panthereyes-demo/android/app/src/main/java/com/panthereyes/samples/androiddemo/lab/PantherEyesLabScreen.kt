package com.panthereyes.samples.androiddemo.lab

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun PantherEyesLabRoute(
    viewModel: PantherEyesLabViewModel = viewModel(),
) {
    val clipboard = LocalClipboardManager.current
    PantherEyesLabScreen(
        viewModel = viewModel,
        onCopy = { payload ->
            copyText(clipboard, payload)
            viewModel.onCopied(payload.toastMessage)
        },
    )
}

@Composable
fun PantherEyesLabScreen(
    viewModel: PantherEyesLabViewModel,
    onCopy: (LabCopyPayload) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                HeaderCard()
            }

            item {
                QuickDemoCard { action ->
                    viewModel.quickDemoPayload(action)?.let(onCopy)
                }
            }

            item {
                EnvironmentPolicyCard(
                    environment = viewModel.environment,
                    onEnvironmentSelected = viewModel::setEnvironment,
                    apiBaseUrl = viewModel.apiBaseUrl,
                    fakeToken = viewModel.fakeToken,
                )
            }

            item {
                CommandSectionCard(
                    title = "Comandos CLI (PantherEyes CLI)",
                    subtitle = viewModel.cliSectionHint,
                    items = viewModel.filteredCliCommands,
                    searchText = viewModel.commandSearchText,
                    onSearchChange = viewModel::updateCommandSearch,
                    onClearSearch = viewModel::clearCommandSearch,
                    onResetAll = viewModel::resetCliCommands,
                    onCopyAll = { onCopy(viewModel.copyAllCliPayload()) },
                    emptyMessage = "Nenhum comando encontrado para esse filtro.",
                    accent = Color(0xFF1E8E3E),
                    icon = LabSectionMeta.CLI.icon,
                    onItemChange = { id, value -> viewModel.updateItem(LabTextCategory.CLI_COMMAND, id, value) },
                    onItemCopy = { item -> onCopy(viewModel.copyItemPayload(item)) },
                    onItemReset = { id -> viewModel.resetItem(LabTextCategory.CLI_COMMAND, id) },
                )
            }

            item {
                CommandSectionCard(
                    title = "Prompts do Agente (PantherEyes Agent)",
                    subtitle = "Prompts editaveis para demo tecnica/comercial. Alguns sao roadmap/TODO no agent atual.",
                    items = viewModel.filteredAgentPrompts,
                    searchText = viewModel.promptSearchText,
                    onSearchChange = viewModel::updatePromptSearch,
                    onClearSearch = viewModel::clearPromptSearch,
                    onResetAll = viewModel::resetAgentPrompts,
                    onCopyAll = { onCopy(viewModel.copyAllPromptsPayload()) },
                    emptyMessage = "Nenhum prompt encontrado para esse filtro.",
                    accent = Color(0xFF7E57C2),
                    icon = LabSectionMeta.AGENT.icon,
                    onItemChange = { id, value -> viewModel.updateItem(LabTextCategory.AGENT_PROMPT, id, value) },
                    onItemCopy = { item -> onCopy(viewModel.copyItemPayload(item)) },
                    onItemReset = { id -> viewModel.resetItem(LabTextCategory.AGENT_PROMPT, id) },
                )
            }

            item {
                QuickLabChecklistCard(
                    steps = viewModel.quickLabSteps,
                    onToggle = viewModel::toggleStep,
                    onReset = viewModel::resetQuickLabChecklist,
                )
            }

            item {
                NotesCard(notes = viewModel.sampleNotes)
            }
        }

        CopyToastBanner(
            message = viewModel.copyToastMessage,
            token = viewModel.copyToastToken,
            onDismiss = viewModel::dismissToast,
            modifier = Modifier.align(Alignment.TopCenter),
        )
    }
}

@Composable
private fun HeaderCard() {
    LabSectionCard(
        title = "PantherEyes Android Demo",
        subtitle = "Lab Console para validar CLI, agente, policy e geracao de testes",
        icon = LabSectionMeta.HEADER.icon,
        accent = Color(0xFF00897B),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "Edite comandos e prompts antes de copiar. Os exemplos refletem o formato real do codebase atual (com adaptacoes documentadas para policy por ambiente).",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = {}, label = { Text("Android 7+") }, enabled = false)
                AssistChip(onClick = {}, label = { Text("Compose") }, enabled = false)
                AssistChip(onClick = {}, label = { Text("Cleartext demo") }, enabled = false)
            }
        }
    }
}

@Composable
private fun QuickDemoCard(onAction: (QuickDemoAction) -> Unit) {
    LabSectionCard(
        title = "Demo Rapida",
        subtitle = "3 atalhos para iniciar a demonstracao em segundos",
        icon = LabSectionMeta.DEMO.icon,
        accent = Color(0xFFEF6C00),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickDemoAction.entries.forEach { action ->
                Surface(
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 1.dp,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    TextButton(
                        onClick = { onAction(action) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .background(Color(0xFFEF6C00).copy(alpha = 0.14f), androidx.compose.foundation.shape.CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(action.icon, contentDescription = null, tint = Color(0xFFEF6C00))
                            }
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(action.title, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                                Text(action.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Icon(LabSectionMeta.COPY.icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EnvironmentPolicyCard(
    environment: LabEnvironment,
    onEnvironmentSelected: (LabEnvironment) -> Unit,
    apiBaseUrl: String,
    fakeToken: String,
) {
    LabSectionCard(
        title = "Ambiente e Policy",
        subtitle = "Altere o ambiente para atualizar comandos, prompts e contexto de policy",
        icon = LabSectionMeta.POLICY.icon,
        accent = Color(0xFF1565C0),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                LabEnvironment.entries.forEach { env ->
                    FilterChip(
                        selected = environment == env,
                        onClick = { onEnvironmentSelected(env) },
                        label = { Text(env.displayName) },
                    )
                }
            }
            InfoRow(label = "Current env", value = environment.rawValue, monospaced = false)
            InfoRow(label = "API base URL", value = apiBaseUrl, monospaced = true)
            InfoRow(label = "Fake token (didatico)", value = fakeToken, monospaced = true)
            InfoRow(label = "Target de policy (codebase atual)", value = "mobile", monospaced = true)
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String, monospaced: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface) {
            Text(
                value,
                modifier = Modifier.fillMaxWidth().padding(10.dp),
                style = if (monospaced) MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace) else MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun CommandSectionCard(
    title: String,
    subtitle: String,
    items: List<LabTextItem>,
    searchText: String,
    onSearchChange: (String) -> Unit,
    onClearSearch: () -> Unit,
    onResetAll: () -> Unit,
    onCopyAll: () -> Unit,
    emptyMessage: String,
    accent: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onItemChange: (String, String) -> Unit,
    onItemCopy: (LabTextItem) -> Unit,
    onItemReset: (String) -> Unit,
) {
    LabSectionCard(
        title = title,
        subtitle = subtitle,
        icon = icon,
        accent = accent,
        trailing = {
            OutlinedButton(onClick = onResetAll) { Text("Resetar") }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionSearchField(
                label = "Buscar",
                value = searchText,
                onValueChange = onSearchChange,
                onClear = onClearSearch,
            )

            if (items.isEmpty()) {
                EmptyFilterState(emptyMessage)
            }

            items.forEach { item ->
                EditableCopyRow(
                    item = item,
                    onValueChange = { onItemChange(item.id, it) },
                    onCopy = { onItemCopy(item) },
                    onReset = { onItemReset(item.id) },
                )
            }

            androidx.compose.material3.HorizontalDivider()

            SectionFooterActionBar(
                itemCount = items.size,
                onCopyAll = onCopyAll,
                onResetAll = onResetAll,
            )
        }
    }
}

@Composable
private fun QuickLabChecklistCard(
    steps: List<QuickLabStep>,
    onToggle: (String) -> Unit,
    onReset: () -> Unit,
) {
    LabSectionCard(
        title = "Passos de Teste (Quick Lab)",
        subtitle = "Checklist local para conduzir a demo",
        icon = LabSectionMeta.QUICK_LAB.icon,
        accent = Color(0xFF2E7D32),
        trailing = { OutlinedButton(onClick = onReset) { Text("Resetar checklist") } },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            steps.forEach { step ->
                Surface(
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    TextButton(
                        onClick = { onToggle(step.id) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                if (step.isDone) "●" else "○",
                                color = if (step.isDone) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.Bold,
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(step.title, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                                Text(step.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotesCard(notes: List<String>) {
    LabSectionCard(
        title = "Notas do Sample",
        subtitle = "Contexto didatico e referencias",
        icon = LabSectionMeta.NOTES.icon,
        accent = Color(0xFF5E35B1),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            notes.forEachIndexed { index, note ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                    Text(if (index == 0) "⚠️" else "ℹ️")
                    Text(note, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

private fun copyText(clipboard: ClipboardManager, payload: LabCopyPayload) {
    clipboard.setText(AnnotatedString(payload.text))
}

@Preview(showBackground = true, widthDp = 420, heightDp = 900)
@Composable
private fun PantherEyesLabScreenPreview() {
    val vm = remember { PantherEyesLabViewModel() }
    MaterialTheme {
        PantherEyesLabScreen(
            viewModel = vm,
            onCopy = { payload -> vm.onCopied(payload.toastMessage) },
        )
    }
}
