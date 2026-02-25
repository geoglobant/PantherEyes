package com.panthereyes.samples.androiddemo.lab

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import com.panthereyes.samples.androiddemo.DemoSecurityConfig

class PantherEyesLabViewModel : ViewModel() {
    var environment by mutableStateOf(LabEnvironment.DEV)
        private set

    var cliCommands by mutableStateOf(makeCliCommands(LabEnvironment.DEV))
        private set

    var agentPrompts by mutableStateOf(makeAgentPrompts(LabEnvironment.DEV))
        private set

    var quickLabSteps by mutableStateOf(defaultQuickLabSteps())
        private set

    var commandSearchText by mutableStateOf("")
        private set

    var promptSearchText by mutableStateOf("")
        private set

    var copyToastMessage by mutableStateOf<String?>(null)
        private set

    var copyToastToken by mutableIntStateOf(0)
        private set

    private val sampleRelativePath = "samples/android-panthereyes-demo"

    val sampleNotes: List<String>
        get() = listOf(
            "Este app e intencionalmente inseguro para demonstracao (cleartext/debuggable/allowBackup + token fake).",
            "O scanner mobile atual detecta cleartext e debuggable neste sample.",
            "O check de allowBackup=true e deteccao de hardcoded secret ainda sao evolucoes futuras do scanner Rust.",
            "Consulte o roteiro completo em samples/android-panthereyes-demo/LAB.md.",
        )

    val cliSectionHint: String
        get() = "Comandos reais do codebase atual. Policy efetiva por ambiente usa o policy-engine via Node (target atual: mobile)."

    val apiBaseUrl: String
        get() = when (environment) {
            LabEnvironment.DEV -> "http://dev-api.panthereyes-demo.local"
            LabEnvironment.STAGING -> "https://staging-api.panthereyes-demo.local"
            LabEnvironment.PROD -> "https://api.panthereyes-demo.local"
        }

    val fakeToken: String
        get() = DemoSecurityConfig.fakeEmbeddedApiToken

    val filteredCliCommands: List<LabTextItem>
        get() = filterItems(cliCommands, commandSearchText)

    val filteredAgentPrompts: List<LabTextItem>
        get() = filterItems(agentPrompts, promptSearchText)

    fun setEnvironment(next: LabEnvironment) {
        environment = next
        cliCommands = makeCliCommands(next)
        agentPrompts = makeAgentPrompts(next)
    }

    fun updateCommandSearch(value: String) {
        commandSearchText = value
    }

    fun updatePromptSearch(value: String) {
        promptSearchText = value
    }

    fun clearCommandSearch() {
        commandSearchText = ""
    }

    fun clearPromptSearch() {
        promptSearchText = ""
    }

    fun updateItem(category: LabTextCategory, id: String, newValue: String) {
        when (category) {
            LabTextCategory.CLI_COMMAND -> {
                cliCommands = cliCommands.map { if (it.id == id) it.copy(value = newValue) else it }
            }
            LabTextCategory.AGENT_PROMPT -> {
                agentPrompts = agentPrompts.map { if (it.id == id) it.copy(value = newValue) else it }
            }
        }
    }

    fun resetItem(category: LabTextCategory, id: String) {
        when (category) {
            LabTextCategory.CLI_COMMAND -> {
                cliCommands = cliCommands.map { if (it.id == id) it.copy(value = it.originalValue) else it }
            }
            LabTextCategory.AGENT_PROMPT -> {
                agentPrompts = agentPrompts.map { if (it.id == id) it.copy(value = it.originalValue) else it }
            }
        }
        onCopied("Item resetado")
    }

    fun resetCliCommands() {
        cliCommands = makeCliCommands(environment)
        commandSearchText = ""
        onCopied("Comandos resetados")
    }

    fun resetAgentPrompts() {
        agentPrompts = makeAgentPrompts(environment)
        promptSearchText = ""
        onCopied("Prompts resetados")
    }

    fun resetQuickLabChecklist() {
        quickLabSteps = defaultQuickLabSteps()
        onCopied("Checklist resetado")
    }

    fun toggleStep(stepId: String) {
        quickLabSteps = quickLabSteps.map { step ->
            if (step.id == stepId) step.copy(isDone = !step.isDone) else step
        }
    }

    fun copyItemPayload(item: LabTextItem): LabCopyPayload =
        LabCopyPayload(item.value, "Copiado: ${item.title}")

    fun copyAllCliPayload(): LabCopyPayload =
        LabCopyPayload(filteredCliCommands.joinToString("\n\n") { it.value }, "Copiados comandos visiveis")

    fun copyAllPromptsPayload(): LabCopyPayload =
        LabCopyPayload(filteredAgentPrompts.joinToString("\n\n") { it.value }, "Copiados prompts visiveis")

    fun quickDemoPayload(action: QuickDemoAction): LabCopyPayload? {
        return when (action) {
            QuickDemoAction.VALIDATE_CONFIG -> {
                markQuickStepDone("Validar config")
                cliCommands.firstOrNull { it.title.contains("Validar config (policy)") }
                    ?.let { LabCopyPayload(it.value, "Demo rapida: comando de config copiado") }
            }
            QuickDemoAction.RUN_STATIC_SCAN -> {
                markQuickStepDone("Rodar scan")
                cliCommands.firstOrNull { it.title.contains("Scan estatico") }
                    ?.let { LabCopyPayload(it.value, "Demo rapida: comando de scan copiado") }
            }
            QuickDemoAction.COPY_AGENT_PROMPT -> {
                markQuickStepDone("Pedir explicacao ao agente")
                agentPrompts.firstOrNull { it.title.contains("Explicar finding cleartext") }
                    ?.let { LabCopyPayload(it.value, "Demo rapida: prompt do agente copiado") }
            }
        }
    }

    fun onCopied(message: String) {
        copyToastMessage = message
        copyToastToken += 1
    }

    fun dismissToast() {
        copyToastMessage = null
    }

    private fun markQuickStepDone(titleContains: String) {
        quickLabSteps = quickLabSteps.map { step ->
            if (step.title.contains(titleContains, ignoreCase = true)) step.copy(isDone = true) else step
        }
    }

    private fun filterItems(items: List<LabTextItem>, query: String): List<LabTextItem> {
        val q = query.trim()
        if (q.isEmpty()) return items
        return items.filter { item ->
            item.title.contains(q, ignoreCase = true) ||
                item.value.contains(q, ignoreCase = true) ||
                (item.helperText?.contains(q, ignoreCase = true) == true)
        }
    }

    private fun makeCliCommands(environment: LabEnvironment): List<LabTextItem> {
        val policyPath = "$sampleRelativePath/.panthereyes/policy.yaml"
        val rulesPath = "$sampleRelativePath/.panthereyes/rules.yaml"
        val exceptionsPath = "$sampleRelativePath/.panthereyes/exceptions.yaml"

        return listOf(
            labCommand(
                id = "cli-config-policy",
                title = "Validar config (policy)",
                value = "cargo run -p panthereyes-cli -- config validate $policyPath",
                helper = "Valida leitura/extensao do arquivo (CLI scaffold atual).",
            ),
            labCommand(
                id = "cli-config-rules",
                title = "Validar config (rules)",
                value = "cargo run -p panthereyes-cli -- config validate $rulesPath",
            ),
            labCommand(
                id = "cli-config-exceptions",
                title = "Validar config (exceptions)",
                value = "cargo run -p panthereyes-cli -- config validate $exceptionsPath",
            ),
            labCommand(
                id = "cli-policy-preview-scaffold",
                title = "Policy preview (CLI scaffold)",
                value = "cargo run -p panthereyes-cli -- policy preview --target mobile --strict --config $policyPath --rules $rulesPath",
                helper = "Preview do pipeline do CLI. O preview efetivo por ambiente esta no comando abaixo.",
            ),
            labCommand(
                id = "cli-policy-effective",
                title = "Policy efetiva por ambiente (policy-engine)",
                value = "node -e \"const p=require('./packages/policy-engine/dist/index.js'); console.log(p.previewEffectivePolicy('${environment.rawValue}','mobile',{rootDir:'$sampleRelativePath'}));\"",
                helper = "Comando de apoio (Node) para policy por ambiente real.",
            ),
            labCommand(
                id = "cli-static-scan",
                title = "Scan estatico (JSON)",
                value = "cargo run -p panthereyes-cli -- --json scan --phase static --target mobile $sampleRelativePath | jq .summary",
                helper = "Findings iniciais: mobile.android.cleartext-traffic-enabled + mobile.android.debuggable-enabled.",
            ),
            labCommand(
                id = "cli-agent-curl",
                title = "Agent chat (cURL / generate_policy_tests)",
                value = "curl -s http://localhost:4711/chat -H 'content-type: application/json' -d '{\"message\":\"gere testes JUnit para policy android em dev e prod\",\"intent\":\"generate_policy_tests\",\"context\":{\"env\":\"${environment.rawValue}\",\"target\":\"mobile\",\"rootDir\":\"$sampleRelativePath\"}}' | jq .",
                helper = "Agent atual retorna ChangeSet generico (TS), nao JUnit diretamente.",
            ),
        )
    }

    private fun makeAgentPrompts(environment: LabEnvironment): List<LabTextItem> {
        return listOf(
            labPrompt(
                id = "agent-explain-cleartext",
                title = "Explicar finding cleartext (demo)",
                value = "explique o finding AND-NET-001",
                helper = "Alias de demo. Finding real do scanner: mobile.android.cleartext-traffic-enabled.",
            ),
            labPrompt(
                id = "agent-validate-directives",
                title = "Validar diretivas por ambiente",
                value = "crie testes unitarios validando as diretivas de seguranca validas para cada ambiente",
            ),
            labPrompt(
                id = "agent-generate-junit",
                title = "Gerar testes JUnit (demo)",
                value = "gere testes JUnit para policy android em dev e prod",
                helper = "Use o script do SDK para JUnit real. O agent atual retorna ChangeSet generico.",
            ),
            labPrompt(
                id = "agent-remediate-cleartext",
                title = "Sugerir remediacao",
                value = "sugira remediacao para usesCleartextTraffic=true mantendo dev como warn e prod como block",
            ),
            labPrompt(
                id = "agent-change-rule-env",
                title = "Alterar regra por ambiente",
                value = "altere a regra de cleartext para bloquear em prod e alertar em dev (env atual: ${environment.rawValue})",
            ),
            labPrompt(
                id = "agent-create-exception",
                title = "Criar excecao temporaria (demo)",
                value = "crie uma excecao temporaria para cleartext em dev com expiracao e owner mobile-platform-team",
            ),
        )
    }

    private fun defaultQuickLabSteps(): List<QuickLabStep> = listOf(
        QuickLabStep("step-validate", "Validar config", "Rodar config validate para policy/rules/exceptions"),
        QuickLabStep("step-scan", "Rodar scan", "Executar scan estatico e confirmar cleartext/debuggable"),
        QuickLabStep("step-agent", "Pedir explicacao ao agente", "Usar prompt de finding AND-NET-001"),
        QuickLabStep("step-tests", "Gerar testes", "Usar script do SDK ou agent generate_policy_tests"),
        QuickLabStep("step-apply", "Aplicar ChangeSet", "Revisar/aplicar arquivos gerados (ou simular)"),
        QuickLabStep("step-rerun", "Rerodar scan", "Corrigir manifest e validar diferenca"),
    )

    private fun labCommand(
        id: String,
        title: String,
        value: String,
        helper: String? = null,
    ): LabTextItem = LabTextItem(
        id = id,
        title = title,
        value = value,
        originalValue = value,
        category = LabTextCategory.CLI_COMMAND,
        helperText = helper,
        monospaced = true,
    )

    private fun labPrompt(
        id: String,
        title: String,
        value: String,
        helper: String? = null,
    ): LabTextItem = LabTextItem(
        id = id,
        title = title,
        value = value,
        originalValue = value,
        category = LabTextCategory.AGENT_PROMPT,
        helperText = helper,
        monospaced = false,
    )
}
