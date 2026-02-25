# PantherEyes Agent: Usage Guide and MCP Distribution (pt-BR)

Este guia mostra **todas as formas de uso do PantherEyes Agent** no monorepo e como **distribuir o MCP** para outros devs no time.

## 1. Visão geral: formas de usar o agente

O PantherEyes Agent pode ser usado por múltiplas interfaces (sem conflito entre si):

1. `HTTP /chat`
   - uso humano/conversacional
   - intents/planners (ex.: `generate_policy_tests`, `explain_finding`)
2. `HTTP /tools/*`
   - uso determinístico e estruturado (CI/CD, scripts, automações)
   - endpoints: `/tools/list`, `/tools/schema`, `/tools/call`
3. `MCP (stdio)`
   - integração com Codex / Claude / clientes MCP
   - expõe tools PantherEyes de forma nativa
4. `VS Code Extension`
   - UX no editor (chat + tools bridge + preview de ChangeSet)

Arquitetura (resumo):

- **Core de tools/planners** = lógica única
- **HTTP bridge** = adapter para CI/scripts
- **MCP** = adapter para assistentes
- **VS Code extension** = UI de desenvolvimento

## 2. Pré-requisitos

- Node.js 20+
- `corepack` habilitado
- `pnpm` (via corepack)
- Rust (para CLI/checks quando necessário)
- `jq` (recomendado para scripts/CI local)

Instalar dependências:

```bash
corepack pnpm install
```

## 3. Subir o Agent Server (HTTP)

Da raiz do monorepo:

```bash
corepack pnpm agent:up
```

Por padrão (script da raiz), o agent sobe em:

- `http://localhost:4711`

Validar healthcheck:

```bash
curl -s http://localhost:4711/health
```

## 4. Usar via `/chat` (conversacional)

Uso recomendado para:
- prompts humanos
- planners/intents
- geração/explicação com contexto

Exemplo (`compare_policy_envs`):

```bash
curl -s http://localhost:4711/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "compare policy dev vs prod for mobile",
    "intent": "compare_policy_envs",
    "context": {
      "rootDir": "samples/ios-panthereyes-demo",
      "target": "mobile"
    }
  }' | jq .
```

Exemplo (`create_policy_exception` -> `ChangeSet` dry-run):

```bash
curl -s http://localhost:4711/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "criar excecao para IOS-ATS-001 em dev com aprovacao security-team",
    "intent": "create_policy_exception",
    "context": {
      "rootDir": "samples/ios-panthereyes-demo",
      "env": "dev",
      "target": "mobile"
    }
  }' | jq .
```

## 5. Usar via `/tools/*` (determinístico / CI / automação)

Uso recomendado para:
- CI/CD
- scripts shell
- automações previsíveis
- integrações internas sem MCP

### Listar tools

```bash
curl -s http://localhost:4711/tools/list | jq .
```

### Ver schema das tools

```bash
curl -s http://localhost:4711/tools/schema | jq .
```

### Chamar uma tool

Exemplo: `scan_gate_report`

```bash
curl -s http://localhost:4711/tools/call \
  -H 'content-type: application/json' \
  -d '{
    "name": "panthereyes.scan_gate_report",
    "arguments": {
      "rootDir": "samples/ios-panthereyes-demo",
      "target": "mobile",
      "phase": "static",
      "failOn": ["block"],
      "format": "both"
    }
  }' | jq .
```

### Wrapper de CI/CD local (recomendado)

Script já incluído:

- `scripts/ci/panthereyes-gate.sh`

Executar:

```bash
# terminal 1
corepack pnpm agent:up

# terminal 2
./scripts/ci/panthereyes-gate.sh --root-dir . --target web --phase static
```

Também disponível via script da raiz:

```bash
corepack pnpm agent:ci:gate -- --root-dir . --target web --phase static
```

Artefatos gerados (JSON):

- `artifacts/panthereyes/config-validation.json`
- `artifacts/panthereyes/scan-gate.json`
- `artifacts/panthereyes/scan-gate-report.json`
- `artifacts/panthereyes/policy-diff-report.json` (se não usar `--skip-policy-diff`)

## 6. Usar via extensão VS Code (UX no editor)

Fluxo recomendado para dev:

1. Instale a extensão PantherEyes (`.vsix`) ou rode em dev (`F5`)
2. Garanta que o agent está disponível (a extensão também tenta auto-start local)
3. Abra o Command Palette:
   - `PantherEyes: Ask Agent`
   - `PantherEyes: Run Scan`
   - `PantherEyes: Preview Policy Diff`
   - `PantherEyes: Show Tools Schema`

O painel webview suporta:
- chat (`/chat`)
- tools bridge (`/tools/call`)
- preview de `ChangeSet`
- `Apply ChangeSet`
- `Review & Apply` por arquivo
- form helper baseado em `/tools/schema`

## 7. Usar via MCP (Codex / VS Code / outros clientes MCP)

Uso recomendado para:
- Codex
- Claude Desktop
- assistentes com suporte a MCP

### Wrapper MCP local (recomendado)

Script já incluído:

- `scripts/mcp/panthereyes-mcp.sh`

Executar manualmente (teste):

```bash
./scripts/mcp/panthereyes-mcp.sh
```

Ou via script da raiz:

```bash
corepack pnpm mcp:up:local
```

### Configuração do cliente MCP (exemplo genérico)

Template no repo:

- `docs/examples/codex-vscode-mcp.example.json`

Exemplo (ajuste o caminho absoluto):

```json
{
  "mcpServers": {
    "panthereyes": {
      "command": "/ABSOLUTE/PATH/TO/PantherEyes/scripts/mcp/panthereyes-mcp.sh",
      "args": [],
      "cwd": "/ABSOLUTE/PATH/TO/PantherEyes",
      "env": {
        "PANTHEREYES_ENABLE_LLM_ROUTER": "0"
      }
    }
  }
}
```

Depois:
1. salve a configuração MCP no cliente
2. reinicie o Codex/VS Code
3. peça para chamar uma tool PantherEyes (ex.: `panthereyes.scan_gate_report`)

## 8. Como distribuir o MCP para outros devs (time)

Existem 3 níveis de maturidade. Recomendo começar pelo **Nível 1** e evoluir.

### Nível 1 (rápido e prático): distribuir via repo + wrapper script

Cada dev:
1. clona o repo `PantherEyes`
2. roda `corepack pnpm install`
3. configura o cliente MCP apontando para:
   - `scripts/mcp/panthereyes-mcp.sh`

Vantagens:
- simples
- reaproveita scripts versionados
- funciona hoje

Cuidados:
- caminho absoluto muda por máquina
- cada dev precisa dependências locais

### Nível 2 (recomendado para time): config template + onboarding script

Padronize:
- um template MCP versionado (já começamos com `docs/examples/codex-vscode-mcp.example.json`)
- um script de onboarding interno que:
  - valida `node/corepack/pnpm`
  - roda `pnpm install`
  - imprime o snippet com o caminho local do dev

Isso reduz erro de configuração e onboarding manual.

### Nível 3 (mais profissional): distribuição como pacote/binário interno

Opções:

1. **Pacote interno (npm)**
   - publicar um package que expose um launcher MCP (`panthereyes-mcp`)
   - cliente MCP usa `command: "panthereyes-mcp"`

2. **Binário/container**
   - empacotar o MCP num binário ou Docker image
   - útil para ambientes padronizados/CI

3. **Release interna versionada**
   - zip/tar com `dist` + wrapper + docs
   - dev baixa uma versão pinada

Vantagens:
- menos dependência do monorepo completo
- versionamento mais controlado
- onboarding mais previsível

### Recomendação de governança (importante)

Para evitar “funciona na máquina A mas não na B”:

1. **Pinar versão**
   - use tag/branch/release estável do PantherEyes para o time
2. **Congelar contrato**
   - `/tools/schema` deve refletir o que o MCP expõe
3. **Documentar mudanças**
   - changelog curto para tools adicionadas/alteradas
4. **Fornecer template por cliente**
   - Codex VS Code
   - Claude Desktop
   - outros MCP clients usados no time

## 9. Qual interface usar em cada cenário?

Use este guia:

1. **Dev quer conversar e iterar** -> extensão VS Code (`/chat` + `/tools/*`)
2. **CI/CD / GitHub Actions** -> `/tools/*` (HTTP bridge)
3. **Codex/Claude como copiloto com tools** -> MCP
4. **Scan local rápido sem agent** -> CLI Rust (`panthereyes`)

## 10. Troubleshooting rápido

### Agent HTTP não responde (`/health`)
- confirme `corepack pnpm agent:up`
- valide porta `4711`
- confira logs no terminal do agent

### `/tools/call` retorna erro de schema/args
- consulte `GET /tools/schema`
- valide JSON enviado em `arguments`

### Cliente MCP não “vê” as tools
- confira caminho absoluto do wrapper `scripts/mcp/panthereyes-mcp.sh`
- reinicie o cliente após alterar config MCP
- teste o wrapper manualmente no terminal

### VS Code extensão não mostra comandos PantherEyes
- confirmar extensão instalada (ou `F5` em modo dev)
- `Developer: Reload Window`
- `PantherEyes: Agent Status`

### CI wrapper falha mesmo com agent rodando
- testar `curl http://localhost:4711/health`
- verificar `jq`
- revisar `--target` (`web|mobile`) e `--phase` (`static|non-static`)

## 11. Próximos passos sugeridos para o time

1. Publicar um guia MCP específico do cliente Codex adotado internamente
2. Criar workflow reusable (`workflow_call`) baseado em `.github/actions/panthereyes-gate`
3. Empacotar MCP em distribuição interna (package/binário) para onboarding simplificado

