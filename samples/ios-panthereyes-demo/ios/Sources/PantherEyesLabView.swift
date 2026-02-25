import SwiftUI

struct PantherEyesLabView: View {
    @ObservedObject var viewModel: PantherEyesLabViewModel

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Color(uiColor: .systemGroupedBackground)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        headerCard
                        quickDemoCard
                        environmentCard
                        cliCommandsCard
                        agentPromptsCard
                        quickLabCard
                        notesCard
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }

                if let toast = viewModel.copyToast {
                    CopyToastView(message: toast.message)
                        .id(toast.message)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .navigationTitle("PantherEyes Lab Console")
            .navigationBarTitleDisplayMode(.inline)
            .animation(.easeInOut(duration: 0.22), value: viewModel.copyToast)
        }
    }

    private var headerCard: some View {
        LabSectionCard(
            title: "PantherEyes iOS Demo",
            subtitle: "Console de laboratorio para validar CLI, agente, policy e geracao de testes",
            systemImage: "sparkles.rectangle.stack",
            accentColor: .teal
        ) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Edite comandos e prompts antes de copiar. Os exemplos refletem o formato real do codebase atual (com adaptacoes documentadas para policy por ambiente).")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    Label("iOS 16+", systemImage: "iphone")
                    Label("SwiftUI", systemImage: "swift")
                    Label("ATS demo", systemImage: "shield.lefthalf.filled")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            }
        }
    }

    private var quickDemoCard: some View {
        LabSectionCard(
            title: "Demo Rapida",
            subtitle: "3 atalhos para iniciar a demonstracao em segundos",
            systemImage: "bolt.fill",
            accentColor: .orange
        ) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(QuickDemoAction.allCases) { action in
                    Button {
                        viewModel.performQuickDemoAction(action)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: action.icon)
                                .foregroundStyle(.orange)
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(Color.orange.opacity(0.12)))

                            VStack(alignment: .leading, spacing: 2) {
                                Text(action.title)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                Text(action.subtitle)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()
                            Image(systemName: "doc.on.doc")
                                .foregroundStyle(.secondary)
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Color(uiColor: .systemBackground))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(Color.primary.opacity(0.05), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var environmentCard: some View {
        LabSectionCard(
            title: "Ambiente e Policy",
            subtitle: "Altere o ambiente para atualizar comandos, prompts e contexto de policy",
            systemImage: "shield.checkered",
            accentColor: .blue
        ) {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Environment", selection: $viewModel.environment) {
                    ForEach(PantherEyesLabViewModel.Environment.allCases) { env in
                        Text(env.displayName).tag(env)
                    }
                }
                .pickerStyle(.segmented)

                infoRow(label: "Current env", value: viewModel.environment.rawValue)
                infoRow(label: "API base URL", value: viewModel.apiBaseURL.absoluteString, monospaced: true)
                infoRow(label: "Fake token (didatico)", value: viewModel.fakeEmbeddedToken, monospaced: true)
                infoRow(label: "Target de policy (codebase atual)", value: "mobile", monospaced: true)
            }
        }
    }

    private var cliCommandsCard: some View {
        LabSectionCard(
            title: "Comandos CLI (PantherEyes CLI)",
            subtitle: viewModel.cliSectionHint,
            systemImage: "terminal",
            accentColor: .green,
            trailingActions: AnyView(
                Button("Resetar") { viewModel.resetCLICommands() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            )
        ) {
            VStack(alignment: .leading, spacing: 10) {
                searchField(
                    title: "Buscar comandos",
                    text: $viewModel.commandSearchText,
                    onClear: viewModel.clearCommandSearch
                )

                if viewModel.filteredCLICommandIDs.isEmpty {
                    emptyStateRow("Nenhum comando encontrado para esse filtro.")
                }

                ForEach(viewModel.filteredCLICommandIDs, id: \.self) { id in
                    EditableCopyRow(
                        item: viewModel.bindingForCLICommand(id: id),
                        onCopy: { if let item = viewModel.cliCommands.first(where: { $0.id == id }) { viewModel.copyItem(item) } },
                        onReset: { viewModel.resetItem(in: .cliCommand, id: id) }
                    )
                }

                SectionFooterActionBar(
                    itemCount: viewModel.filteredCLICommands.count,
                    copyAllTitle: "Copiar tudo",
                    onCopyAll: viewModel.copyAllCLICommands,
                    onResetAll: viewModel.resetCLICommands
                )
            }
        }
    }

    private var agentPromptsCard: some View {
        LabSectionCard(
            title: "Prompts do Agente (PantherEyes Agent)",
            subtitle: "Prompts editaveis para demo tecnica/comercial. Alguns sao roadmap/TODO no agent atual.",
            systemImage: "bubble.left.and.bubble.right.fill",
            accentColor: .purple,
            trailingActions: AnyView(
                Button("Resetar") { viewModel.resetAgentPrompts() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            )
        ) {
            VStack(alignment: .leading, spacing: 10) {
                searchField(
                    title: "Buscar prompts",
                    text: $viewModel.promptSearchText,
                    onClear: viewModel.clearPromptSearch
                )

                if viewModel.filteredAgentPromptIDs.isEmpty {
                    emptyStateRow("Nenhum prompt encontrado para esse filtro.")
                }

                ForEach(viewModel.filteredAgentPromptIDs, id: \.self) { id in
                    EditableCopyRow(
                        item: viewModel.bindingForAgentPrompt(id: id),
                        onCopy: { if let item = viewModel.agentPrompts.first(where: { $0.id == id }) { viewModel.copyItem(item) } },
                        onReset: { viewModel.resetItem(in: .agentPrompt, id: id) }
                    )
                }

                SectionFooterActionBar(
                    itemCount: viewModel.filteredAgentPrompts.count,
                    copyAllTitle: "Copiar tudo",
                    onCopyAll: viewModel.copyAllPrompts,
                    onResetAll: viewModel.resetAgentPrompts
                )
            }
        }
    }

    private var quickLabCard: some View {
        LabSectionCard(
            title: "Passos de Teste (Quick Lab)",
            subtitle: "Checklist local para conduzir a demo",
            systemImage: "checklist",
            accentColor: .mint,
            trailingActions: AnyView(
                Button("Resetar checklist") {
                    viewModel.resetQuickLabChecklist()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            )
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(viewModel.quickLabSteps) { step in
                    Button {
                        viewModel.toggleStep(step.id)
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: step.isDone ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(step.isDone ? .green : .secondary)
                                .font(.title3)
                                .padding(.top, 1)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(step.title)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                Text(step.detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(10)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Color(uiColor: .systemBackground))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var notesCard: some View {
        LabSectionCard(
            title: "Notas do Sample",
            subtitle: "Contexto didatico e referencias",
            systemImage: "note.text",
            accentColor: .indigo
        ) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(viewModel.sampleNotes.enumerated()), id: \.offset) { index, note in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "info.circle")
                            .foregroundStyle(index == 0 ? .orange : .secondary)
                            .padding(.top, 1)
                        Text(note)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                    }
                }

                Divider().padding(.vertical, 2)

                Text("Dica: consulte o arquivo `samples/ios-panthereyes-demo/LAB.md` para o roteiro completo (CLI, agent, SDK, testes e troubleshooting).")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func infoRow(label: String, value: String, monospaced: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(monospaced ? .system(.footnote, design: .monospaced) : .footnote)
                .textSelection(.enabled)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(uiColor: .tertiarySystemBackground))
                )
        }
    }

    private func searchField(title: String, text: Binding<String>, onClear: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Filtrar por titulo, texto ou dica", text: text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .font(.subheadline)

                if !text.wrappedValue.isEmpty {
                    Button {
                        onClear()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(uiColor: .systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.primary.opacity(0.05), lineWidth: 1)
            )
        }
    }

    private func emptyStateRow(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .foregroundStyle(.secondary)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(uiColor: .systemBackground))
        )
    }
}

struct PantherEyesLabView_Previews: PreviewProvider {
    static var previews: some View {
        PantherEyesLabView(viewModel: PantherEyesLabViewModel())
    }
}
