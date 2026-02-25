import SwiftUI

struct EditableCopyRow: View {
    @Binding var item: LabTextItem
    let onCopy: () -> Void
    let onReset: () -> Void

    private var editorMinHeight: CGFloat {
        let lineCount = item.value.split(separator: "\n", omittingEmptySubsequences: false).count
        if lineCount >= 3 || item.value.count > 140 {
            return 110
        }
        return 72
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                    if let helper = item.helperText, !helper.isEmpty {
                        Text(helper)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                if item.isModified {
                    Text("Editado")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color.orange.opacity(0.15)))
                        .foregroundStyle(.orange)
                }
            }

            TextEditor(text: $item.value)
                .font(item.isMonospaced ? .system(.footnote, design: .monospaced) : .footnote)
                .scrollContentBackground(.hidden)
                .padding(8)
                .frame(minHeight: editorMinHeight)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(uiColor: .tertiarySystemBackground))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.primary.opacity(0.07), lineWidth: 1)
                )

            HStack(spacing: 10) {
                Button("Copiar", action: onCopy)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)

                Button("Resetar", action: onReset)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(!item.isModified)

                Spacer()
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(uiColor: .systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.primary.opacity(0.04), lineWidth: 1)
        )
    }
}
