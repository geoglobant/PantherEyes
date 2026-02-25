import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class PantherEyesLabViewModel: ObservableObject {
    enum Environment: String, CaseIterable, Identifiable {
        case dev
        case staging
        case prod

        var id: String { rawValue }

        var displayName: String {
            rawValue.uppercased()
        }
    }

    @Published var environment: Environment = .dev {
        didSet {
            refreshLabContentForEnvironment()
        }
    }

    @Published var cliCommands: [LabTextItem] = []
    @Published var agentPrompts: [LabTextItem] = []
    @Published var quickLabSteps: [QuickLabStep] = []
    @Published var copyToast: CopyToastState?
    @Published var commandSearchText: String = ""
    @Published var promptSearchText: String = ""

    private let sampleRelativePath = "samples/ios-panthereyes-demo"
    private let labRelativePath = "samples/ios-panthereyes-demo/LAB.md"

    init() {
        refreshLabContentForEnvironment()
        quickLabSteps = Self.defaultQuickLabSteps()
    }

    var apiBaseURL: URL {
        switch environment {
        case .dev:
            return URL(string: "http://dev-api.panthereyes-demo.local")!
        case .staging:
            return URL(string: "https://staging-api.panthereyes-demo.local")!
        case .prod:
            return URL(string: "https://api.panthereyes-demo.local")!
        }
    }

    var fakeEmbeddedToken: String {
        "PE_DEMO_FAKE_IOS_TOKEN_DO_NOT_USE"
    }

    var sampleNotes: [String] {
        [
            "Este app e intencionalmente inseguro para demonstracao (ATS relaxado e token fake hardcoded).",
            "O scanner mobile atual detecta ATS (Info.plist / NSAllowsArbitraryLoads=true) neste sample.",
            "O Policy Engine atual resolve target como 'mobile' (nao 'ios').",
            "Consulte o roteiro completo em \(labRelativePath)."
        ]
    }

    var cliSectionHint: String {
        "Comandos reais do codebase atual. O CLI ainda nao suporta '--repo' nem '--env' para policy preview; para policy efetiva por ambiente usamos o policy-engine via Node."
    }

    func copyItem(_ item: LabTextItem) {
        copyToClipboard(item.value, toast: "Copiado: \(item.title)")
    }

    func copyAllCLICommands() {
        copyToClipboard(joinValues(filteredCLICommands), toast: "Copiados comandos visiveis")
    }

    func copyAllPrompts() {
        copyToClipboard(joinValues(filteredAgentPrompts), toast: "Copiados prompts visiveis")
    }

    func resetCLICommands() {
        cliCommands = Self.makeCLICommands(for: environment, samplePath: sampleRelativePath)
        commandSearchText = ""
        showToast("Comandos resetados")
    }

    func resetAgentPrompts() {
        agentPrompts = Self.makeAgentPrompts(for: environment)
        promptSearchText = ""
        showToast("Prompts resetados")
    }

    func resetItem(in category: LabTextCategory, id: UUID) {
        switch category {
        case .cliCommand:
            guard let index = cliCommands.firstIndex(where: { $0.id == id }) else { return }
            cliCommands[index].reset()
        case .agentPrompt:
            guard let index = agentPrompts.firstIndex(where: { $0.id == id }) else { return }
            agentPrompts[index].reset()
        }
        showToast("Item resetado")
    }

    func bindingForCLICommand(id: UUID) -> Binding<LabTextItem> {
        Binding(
            get: { self.cliCommands.first(where: { $0.id == id }) ?? Self.fallbackItem(category: .cliCommand) },
            set: { updated in
                guard let index = self.cliCommands.firstIndex(where: { $0.id == id }) else { return }
                self.cliCommands[index] = updated
            }
        )
    }

    func bindingForAgentPrompt(id: UUID) -> Binding<LabTextItem> {
        Binding(
            get: { self.agentPrompts.first(where: { $0.id == id }) ?? Self.fallbackItem(category: .agentPrompt) },
            set: { updated in
                guard let index = self.agentPrompts.firstIndex(where: { $0.id == id }) else { return }
                self.agentPrompts[index] = updated
            }
        )
    }

    func toggleStep(_ stepID: UUID) {
        guard let index = quickLabSteps.firstIndex(where: { $0.id == stepID }) else { return }
        quickLabSteps[index].isDone.toggle()
    }

    func resetQuickLabChecklist() {
        quickLabSteps = Self.defaultQuickLabSteps()
        showToast("Checklist resetado")
    }

    var filteredCLICommands: [LabTextItem] {
        filter(items: cliCommands, query: commandSearchText)
    }

    var filteredAgentPrompts: [LabTextItem] {
        filter(items: agentPrompts, query: promptSearchText)
    }

    var filteredCLICommandIDs: [UUID] {
        filteredCLICommands.map(\.id)
    }

    var filteredAgentPromptIDs: [UUID] {
        filteredAgentPrompts.map(\.id)
    }

    func clearCommandSearch() {
        commandSearchText = ""
    }

    func clearPromptSearch() {
        promptSearchText = ""
    }

    func performQuickDemoAction(_ action: QuickDemoAction) {
        switch action {
        case .validateConfig:
            if let item = cliCommands.first(where: { $0.title.contains("Validar config (policy)") }) {
                copyToClipboard(item.value, toast: "Demo rapida: comando de config copiado")
                markQuickStepDone(containing: "Validar config")
            }
        case .runStaticScan:
            if let item = cliCommands.first(where: { $0.title.contains("Scan estatico") }) {
                copyToClipboard(item.value, toast: "Demo rapida: comando de scan copiado")
                markQuickStepDone(containing: "Rodar scan")
            }
        case .copyAgentPrompt:
            if let item = agentPrompts.first(where: { $0.title.contains("Explicar finding ATS") }) {
                copyToClipboard(item.value, toast: "Demo rapida: prompt do agente copiado")
                markQuickStepDone(containing: "Pedir explicacao ao agente")
            }
        }
    }

    private func refreshLabContentForEnvironment() {
        cliCommands = Self.makeCLICommands(for: environment, samplePath: sampleRelativePath)
        agentPrompts = Self.makeAgentPrompts(for: environment)
    }

    private func joinValues(_ items: [LabTextItem]) -> String {
        items.map(\.value).joined(separator: "\n\n")
    }

    private func filter(items: [LabTextItem], query: String) -> [LabTextItem] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return items }

        return items.filter { item in
            item.title.localizedCaseInsensitiveContains(trimmed)
                || item.value.localizedCaseInsensitiveContains(trimmed)
                || (item.helperText?.localizedCaseInsensitiveContains(trimmed) ?? false)
        }
    }

    private func copyToClipboard(_ text: String, toast: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #endif
        showToast(toast)
    }

    private func showToast(_ message: String) {
        copyToast = CopyToastState(message: message)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.35) { [weak self] in
            guard self?.copyToast?.message == message else { return }
            self?.copyToast = nil
        }
    }

    private func markQuickStepDone(containing text: String) {
        guard let index = quickLabSteps.firstIndex(where: { $0.title.localizedCaseInsensitiveContains(text) }) else {
            return
        }
        quickLabSteps[index].isDone = true
    }

    private static func makeCLICommands(for environment: Environment, samplePath: String) -> [LabTextItem] {
        let policyPath = "\(samplePath)/.panthereyes/policy.yaml"
        let rulesPath = "\(samplePath)/.panthereyes/rules.yaml"
        let exceptionsPath = "\(samplePath)/.panthereyes/exceptions.yaml"

        return [
            LabTextItem(
                title: "Validar config (policy)",
                value: "cargo run -p panthereyes-cli -- config validate \(policyPath)",
                category: .cliCommand,
                helperText: "Valida leitura/extensao do arquivo de policy (CLI scaffold atual)."
            ),
            LabTextItem(
                title: "Validar config (rules)",
                value: "cargo run -p panthereyes-cli -- config validate \(rulesPath)",
                category: .cliCommand
            ),
            LabTextItem(
                title: "Validar config (exceptions)",
                value: "cargo run -p panthereyes-cli -- config validate \(exceptionsPath)",
                category: .cliCommand
            ),
            LabTextItem(
                title: "Policy preview (CLI scaffold)",
                value: "cargo run -p panthereyes-cli -- policy preview --target mobile --strict --config \(policyPath) --rules \(rulesPath)",
                category: .cliCommand,
                helperText: "Preview do pipeline do CLI. O preview efetivo por ambiente esta no comando abaixo (policy-engine)."
            ),
            LabTextItem(
                title: "Policy efetiva por ambiente (policy-engine)",
                value: "node -e \"const p=require('./packages/policy-engine/dist/index.js'); console.log(p.previewEffectivePolicy('\\(environment.rawValue)','mobile',{rootDir:'\\(samplePath)'}));\"",
                category: .cliCommand,
                helperText: "Comando de apoio (Node) para policy por ambiente real, usado nos LABs."
            ),
            LabTextItem(
                title: "Scan estatico (JSON)",
                value: "cargo run -p panthereyes-cli -- --json scan --phase static --target mobile \(samplePath) | jq .summary",
                category: .cliCommand,
                helperText: "Expected initial finding: mobile.ios.ats.arbitrary-loads-enabled."
            ),
            LabTextItem(
                title: "Agent chat (cURL / generate_policy_tests)",
                value: "curl -s http://localhost:4711/chat -H 'content-type: application/json' -d '{\"message\":\"gere testes XCTest para policy de ios em dev e prod\",\"intent\":\"generate_policy_tests\",\"context\":{\"env\":\"\\(environment.rawValue)\",\"target\":\"mobile\",\"rootDir\":\"\\(samplePath)\"}}' | jq .",
                category: .cliCommand,
                helperText: "Agent atual retorna ChangeSet generico (TS), nao XCTest diretamente."
            )
        ]
    }

    private static func makeAgentPrompts(for environment: Environment) -> [LabTextItem] {
        [
            LabTextItem(
                title: "Explicar finding ATS (demo)",
                value: "explique o finding IOS-ATS-001",
                category: .agentPrompt,
                helperText: "Alias de demo. O finding real atual do scanner e 'mobile.ios.ats.arbitrary-loads-enabled'.",
                isMonospaced: false
            ),
            LabTextItem(
                title: "Validar diretivas por ambiente",
                value: "crie testes unitarios validando as diretivas de seguranca validas para cada ambiente",
                category: .agentPrompt,
                isMonospaced: false
            ),
            LabTextItem(
                title: "Gerar testes XCTest (demo)",
                value: "gere testes XCTest para policy de ios em dev e prod",
                category: .agentPrompt,
                helperText: "No agent atual, o planner responde com ChangeSet generico. Use o script do SDK para gerar XCTest real.",
                isMonospaced: false
            ),
            LabTextItem(
                title: "Sugerir remediacao mantendo dev menos restritivo",
                value: "sugira uma remediacao para IOS-ATS-001 mantendo dev como warn e prod como enforce",
                category: .agentPrompt,
                isMonospaced: false
            ),
            LabTextItem(
                title: "Ajustar regra por ambiente",
                value: "altere a regra de ATS para bloquear em prod e alertar em dev (env atual: \(environment.rawValue))",
                category: .agentPrompt,
                isMonospaced: false
            ),
            LabTextItem(
                title: "Criar excecao temporaria (demo)",
                value: "crie uma excecao temporaria para ATS em dev com expiracao e owner mobile-platform-team",
                category: .agentPrompt,
                isMonospaced: false
            )
        ]
    }

    private static func defaultQuickLabSteps() -> [QuickLabStep] {
        [
            QuickLabStep(title: "Validar config", detail: "Rodar config validate para policy/rules/exceptions"),
            QuickLabStep(title: "Rodar scan", detail: "Executar scan estatico e confirmar finding ATS"),
            QuickLabStep(title: "Pedir explicacao ao agente", detail: "Usar prompt de finding IOS-ATS-001"),
            QuickLabStep(title: "Gerar testes", detail: "Usar script do SDK ou agent generate_policy_tests"),
            QuickLabStep(title: "Aplicar ChangeSet", detail: "Revisar e aplicar arquivos gerados (ou simular)"),
            QuickLabStep(title: "Rerodar scan", detail: "Corrigir ATS e validar reducao de findings")
        ]
    }

    private static func fallbackItem(category: LabTextCategory) -> LabTextItem {
        LabTextItem(title: "", value: "", category: category)
    }
}
