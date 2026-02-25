import SwiftUI

struct CopyToastView: View {
    let message: String
    @State private var pulse = false
    @State private var progress: CGFloat = 0

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .scaleEffect(pulse ? 1.04 : 0.94)
            Text(message)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.thinMaterial, in: Capsule())
        .overlay(
            Capsule()
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .overlay(alignment: .bottomLeading) {
            Capsule()
                .fill(Color.green.opacity(0.25))
                .frame(width: max(12, progress * 220), height: 3)
                .padding(.horizontal, 10)
                .padding(.bottom, 4)
                .animation(.linear(duration: 1.1), value: progress)
        }
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
        .padding(.top, 8)
        .onAppear {
            pulse = false
            progress = 0
            withAnimation(.spring(response: 0.28, dampingFraction: 0.65)) {
                pulse = true
            }
            withAnimation(.linear(duration: 1.1)) {
                progress = 1
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                withAnimation(.easeOut(duration: 0.2)) {
                    pulse = false
                }
            }
        }
    }
}
