import Foundation

enum LabTextCategory: String {
    case cliCommand
    case agentPrompt
}

struct LabTextItem: Identifiable, Equatable {
    let id: UUID
    let title: String
    var value: String
    let originalValue: String
    let category: LabTextCategory
    let helperText: String?
    let isMonospaced: Bool

    init(
        id: UUID = UUID(),
        title: String,
        value: String,
        category: LabTextCategory,
        helperText: String? = nil,
        isMonospaced: Bool = true
    ) {
        self.id = id
        self.title = title
        self.value = value
        self.originalValue = value
        self.category = category
        self.helperText = helperText
        self.isMonospaced = isMonospaced
    }

    var isModified: Bool {
        value != originalValue
    }

    mutating func reset() {
        value = originalValue
    }
}

struct QuickLabStep: Identifiable, Equatable {
    let id: UUID
    let title: String
    let detail: String
    var isDone: Bool

    init(id: UUID = UUID(), title: String, detail: String, isDone: Bool = false) {
        self.id = id
        self.title = title
        self.detail = detail
        self.isDone = isDone
    }
}

struct CopyToastState: Equatable {
    let message: String
}

enum QuickDemoAction: String, CaseIterable, Identifiable {
    case validateConfig
    case runStaticScan
    case copyAgentPrompt

    var id: String { rawValue }

    var title: String {
        switch self {
        case .validateConfig:
            return "Validar Config"
        case .runStaticScan:
            return "Rodar Scan"
        case .copyAgentPrompt:
            return "Copiar Prompt"
        }
    }

    var subtitle: String {
        switch self {
        case .validateConfig:
            return "Copia comando de config validate"
        case .runStaticScan:
            return "Copia comando de scan estatico"
        case .copyAgentPrompt:
            return "Copia prompt do agente"
        }
    }

    var icon: String {
        switch self {
        case .validateConfig:
            return "checkmark.shield"
        case .runStaticScan:
            return "play.circle"
        case .copyAgentPrompt:
            return "bubble.left.and.text.bubble.right"
        }
    }
}
