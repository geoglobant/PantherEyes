import SwiftUI

struct LabSectionCard<Content: View>: View {
    let title: String
    let subtitle: String?
    let systemImage: String?
    let accentColor: Color
    let trailingActions: AnyView?
    let content: Content

    init(
        title: String,
        subtitle: String? = nil,
        systemImage: String? = nil,
        accentColor: Color = .accentColor,
        trailingActions: AnyView? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.accentColor = accentColor
        self.trailingActions = trailingActions
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        if let systemImage {
                            Image(systemName: systemImage)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(accentColor)
                                .frame(width: 22, height: 22)
                                .background(
                                    Circle()
                                        .fill(accentColor.opacity(0.12))
                                )
                        }
                        Text(title)
                            .font(.headline)
                    }
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                if let trailingActions {
                    trailingActions
                }
            }

            content
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(uiColor: .secondarySystemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.primary.opacity(0.06), lineWidth: 1)
        )
    }
}
