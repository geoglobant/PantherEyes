import SwiftUI

struct SectionFooterActionBar: View {
    let itemCount: Int
    let copyAllTitle: String
    let onCopyAll: () -> Void
    let onResetAll: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Label("\(itemCount) item(ns)", systemImage: "tray.full")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Spacer()

            Button(copyAllTitle, action: onCopyAll)
                .buttonStyle(.borderedProminent)
                .controlSize(.small)

            Button("Resetar todos", action: onResetAll)
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(uiColor: .systemBackground).opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.05), lineWidth: 1)
        )
    }
}
