# LAB - PantherEyes iOS Demo (SwiftUI + XCTest)

## 1. Visão geral do sample

Este sample demonstra um app iOS (SwiftUI) com configurações intencionalmente inseguras para validar o PantherEyes de ponta a ponta:

- CLI (`scan`, `config validate`, `policy preview`)
- Policy Engine / SDK (preview de policy por ambiente + geração de testes unitários determinística)
- Agent Server (planner determinístico `generate_policy_tests`)
- Extensão VS Code (painel `/chat`, se estiver habilitada)

### Cenários didáticos intencionais

- `ATS` relaxado no `Info.plist` (`NSAllowsArbitraryLoads=true`)
- valor sensível **fake** hardcoded no app (apenas para demo, sem segredo real)
- diferenças de policy entre `dev`, `staging` e `prod` em `.panthereyes/policy.yaml`

### Findings que o PantherEyes deve detectar (estado inicial)

No scanner mobile atual, o finding real esperado para este sample é:

- `mobile.ios.ats.arbitrary-loads-enabled`

Observação: o sample também contém um valor fake hardcoded para demonstração, mas o scanner Rust atual ainda não implementa esse check específico.

## 2. Pré-requisitos

### Ferramentas necessárias

- macOS
- Xcode 15+
- Tuist (`tuist`)
- Rust (stable)
- Node.js 20+
- `pnpm` 9+
- `jq` (opcional, mas recomendado)

### Instalação de dependências do monorepo (uma vez)

```bash
corepack pnpm install
```

### Como iniciar o Agent Server

```bash
corepack pnpm --filter @panthereyes/agent-server build
node apps/agent-server/dist/index.js
```

Healthcheck (opcional):

```bash
curl -s http://localhost:4711/health
```

### Como confirmar que o CLI está disponível

Sem instalar globalmente, use pela raiz do monorepo:

```bash
cargo run -p panthereyes-cli -- doctor --verbose
```

Se você instalou globalmente (`cargo install --path crates/panthereyes-cli`), pode testar:

```bash
panthereyes doctor --verbose
```

### Como confirmar que a extensão VS Code está instalada (se aplicável)

- Abra o VS Code
- Abra o `Command Palette`
- Procure por comandos `PantherEyes:`
- Esperado (se a extensão estiver instalada/rodando via F5):
  - `PantherEyes: Ask Agent`
  - `PantherEyes: Validate Security Config`
  - `PantherEyes: Run Scan`
  - `PantherEyes: Set LLM Provider`

## 3. Estrutura do sample

### Arquivos principais

- App iOS (SwiftUI)
  - `samples/ios-panthereyes-demo/ios/Sources/PantherEyesIOSDemoApp.swift`
  - `samples/ios-panthereyes-demo/ios/Sources/ContentView.swift`
  - `samples/ios-panthereyes-demo/ios/Sources/DemoSecurityViewModel.swift`
- Configuração PantherEyes
  - `samples/ios-panthereyes-demo/.panthereyes/policy.yaml`
  - `samples/ios-panthereyes-demo/.panthereyes/rules.yaml`
  - `samples/ios-panthereyes-demo/.panthereyes/exceptions.yaml`
- Configuração insegura didática (scanner)
  - `samples/ios-panthereyes-demo/ios/Resources/Info.plist`
- Testes e helpers
  - `samples/ios-panthereyes-demo/ios/Tests/PantherEyesPolicyTests/SecurityPolicyLoader.swift`
  - `samples/ios-panthereyes-demo/ios/Tests/PantherEyesPolicyTests/SecurityPolicyLoaderTests.swift`
  - `samples/ios-panthereyes-demo/ios/Tests/PantherEyesPolicyTests/PantherEyesPolicy*Tests.swift`
- Script de geração de testes via SDK
  - `samples/ios-panthereyes-demo/scripts/generate-policy-tests.mjs`

### Onde estão os pontos inseguros didáticos

- ATS relaxado: `samples/ios-panthereyes-demo/ios/Resources/Info.plist`
- Token fake hardcoded: `samples/ios-panthereyes-demo/ios/Sources/DemoSecurityViewModel.swift`

## 4. Executar o app sample

### Gerar projeto Xcode (Tuist)

```bash
tuist generate --path samples/ios-panthereyes-demo
```

### Abrir no Xcode

```bash
open samples/ios-panthereyes-demo/PantherEyesIOSDemo.xcworkspace
```

### Rodar o app

- Scheme recomendado: `PantherEyesIOSDemo`
- Destino: um simulador iOS (ex.: iPhone 15)

### Observações importantes

- O `Info.plist` do app contém `NSAllowsArbitraryLoads=true` de propósito para o scan encontrar um finding.
- O app é seguro apenas para **demonstração**; não use esse setup como baseline de produção.

## 5. Validar configuração PantherEyes

### Comandos (`config validate`)

```bash
cargo run -p panthereyes-cli -- config validate samples/ios-panthereyes-demo/.panthereyes/policy.yaml
cargo run -p panthereyes-cli -- config validate samples/ios-panthereyes-demo/.panthereyes/rules.yaml
cargo run -p panthereyes-cli -- config validate samples/ios-panthereyes-demo/.panthereyes/exceptions.yaml
```

### Resultado esperado

- `valid: true`
- `format: yaml`
- notas informando que o `config validate` do CLI ainda é scaffold

### O que fazer se falhar

- confirme o path do sample (`samples/ios-panthereyes-demo/...`)
- confirme que você está executando os comandos na **raiz do monorepo**
- valide YAML manualmente (indentação/encoding)
- rode `cargo run -p panthereyes-cli -- doctor --verbose`

## 6. Preview de policy por ambiente

### 6.1 Validar o comando CLI `policy preview` (scaffold atual)

O CLI já possui `policy preview`, mas hoje ele é um preview de pipeline (não resolve policy real por `env`).

```bash
cargo run -p panthereyes-cli -- policy preview \
  --target mobile \
  --strict \
  --config samples/ios-panthereyes-demo/.panthereyes/policy.yaml \
  --rules samples/ios-panthereyes-demo/.panthereyes/rules.yaml
```

### 6.2 Preview efetivo por ambiente (Policy Engine real)

Para validar `dev/staging/prod`, use o `policy-engine` (API real atual):

```bash
corepack pnpm --filter @panthereyes/policy-engine build
```

```bash
node -e "const p=require('./packages/policy-engine/dist/index.js'); console.log(p.previewEffectivePolicy('dev','mobile',{rootDir:'samples/ios-panthereyes-demo'}));"
node -e "const p=require('./packages/policy-engine/dist/index.js'); console.log(p.previewEffectivePolicy('staging','mobile',{rootDir:'samples/ios-panthereyes-demo'}));"
node -e "const p=require('./packages/policy-engine/dist/index.js'); console.log(p.previewEffectivePolicy('prod','mobile',{rootDir:'samples/ios-panthereyes-demo'}));"
```

### Diferença esperada entre ambientes

- `dev`: `mode=audit`, `failOnSeverity=critical`, `allowDemoCleartext=true`, `minScore=60`
- `staging`: `mode=warn`, `failOnSeverity=high`, `allowDemoCleartext=false`, `minScore=80`
- `prod`: `mode=enforce`, `failOnSeverity=medium`, `allowDemoCleartext=false`, `minScore=95`

Observação importante: o target atual do `policy-engine` é `mobile` (não `ios`). O sample iOS usa policy `mobile` e o script converte isso para geração de testes XCTest (`ios`).

## 7. Rodar scan estático

### Comando do CLI

```bash
cargo run -p panthereyes-cli -- --json scan --phase static --target mobile samples/ios-panthereyes-demo | jq .
```

### Resultado esperado (estado inicial)

- `summary.status`: `block`
- finding principal:
  - `mobile.ios.ats.arbitrary-loads-enabled`

### Arquivo onde o finding aparece

- `samples/ios-panthereyes-demo/ios/Resources/Info.plist`

### Fixture de referência

- `samples/shared-fixtures/expected-findings/ios-static-prod.json`

## 8. Testar o agente (prompts prontos)

### Como testar hoje (estado atual do agent-server)

O Agent Server atual possui um planner determinístico para o intent:

- `generate_policy_tests`

Prompts de explicação/remediação/alteração de regra ainda podem ser usados em demos, mas hoje devem ser tratados como **roteiro / TODO de intents futuros**, a menos que você force `generate_policy_tests` explicitamente.

### Request pronto (funciona hoje)

```bash
curl -s http://localhost:4711/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "gere testes XCTest para policy de ios em dev e prod",
    "intent": "generate_policy_tests",
    "context": {
      "env": "prod",
      "target": "mobile",
      "rootDir": "samples/ios-panthereyes-demo"
    }
  }' | jq .
```

### Resultado esperado (estado atual do agente)

- intent resolvido: `generate_policy_tests`
- `planner.changeSet.dryRun = true`
- `planner.changeSet.changes` com **3 arquivos TypeScript/JSON/README** em `tests/policy/prod/`
- Observação: mesmo com prompt pedindo XCTest, o planner atual ainda gera um `ChangeSet` genérico (TS) no `agent-server`

### Prompts copy/paste (roteiro de demo)

Obrigatórios (incluídos para demo/comercial + técnico):

- `explique o finding IOS-ATS-001`
- `crie testes unitarios validando as diretivas de seguranca validas para cada ambiente`
- `gere testes XCTest para policy de ios em dev e prod`
- `altere a regra de ATS para bloquear em prod e alertar em dev`
- `sugira remediacao para ATS relaxado no Info.plist`
- `crie uma excecao temporaria para ATS em dev com expiracao`

Mapeamento útil para a demo (estado atual):

- alias de demo `IOS-ATS-001` -> finding real do scanner: `mobile.ios.ats.arbitrary-loads-enabled`

## 9. Validar SDK / geração de testes unitários

### 9.1 Via script direto (sem LLM, recomendado para validação)

```bash
corepack pnpm --filter @panthereyes/policy-engine build
corepack pnpm --filter @panthereyes/sdk-ts build
```

Dry-run (`ChangeSet` no stdout):

```bash
node samples/ios-panthereyes-demo/scripts/generate-policy-tests.mjs
```

Aplicar (write) os arquivos gerados:

```bash
node samples/ios-panthereyes-demo/scripts/generate-policy-tests.mjs --write
```

### 9.2 Via agente (`generate_policy_tests`)

- O endpoint `/chat` retorna `ChangeSet` em modo dry-run
- Útil para validar planner + tools + adapters
- Estado atual: o planner do `agent-server` gera um `ChangeSet` genérico em `tests/policy/<env>/...` (TypeScript + snapshot + README), não arquivos XCTest diretamente

### Onde o ChangeSet aparece

- stdout do script (`changeset`)
- `samples/ios-panthereyes-demo/artifacts/ios-policy-test-changesets.json` (quando usar `--write`)
- resposta JSON do `agent-server` (`planner.changeSet`)
- no agente atual, o primeiro arquivo costuma ser `tests/policy/prod/mobile.effective-policy.test.ts`

### Como aplicar o ChangeSet (ou simular aplicação)

- Hoje, o script do sample já suporta `outputMode=changeset` e `outputMode=write`
- Fluxo sugerido:
  1. revisar `ChangeSet`
  2. rodar com `--write`
  3. executar os testes gerados

### Arquivos de teste esperados

- `samples/ios-panthereyes-demo/ios/Tests/PantherEyesPolicyTests/PantherEyesPolicyDevTests.swift`
- `samples/ios-panthereyes-demo/ios/Tests/PantherEyesPolicyTests/PantherEyesPolicyStagingTests.swift`
- `samples/ios-panthereyes-demo/ios/Tests/PantherEyesPolicyTests/PantherEyesPolicyProdTests.swift`

## 10. Rodar os testes gerados

### XCTest (linha de comando)

```bash
xcodebuild test \
  -workspace samples/ios-panthereyes-demo/PantherEyesIOSDemo.xcworkspace \
  -scheme PantherEyesIOSDemo \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

Se esse simulador não existir na sua máquina, troque o nome (`iPhone 14`, `iPhone 16`, etc.).
Se o scheme não incluir os testes automaticamente na sua versão do Tuist/Xcode, rode pelo target/scheme de testes correspondente.

### Resultado esperado

- `SmokeTests` passa
- `SecurityPolicyLoaderTests` passa
- `PantherEyesPolicy*Tests` (gerados) passam

### Observações sobre `SecurityPolicyLoader`

- Helper mínimo para os testes carregarem fixtures de policy (`dev/staging/prod`)
- Não depende de LLM
- Facilita demo de regressão por ambiente

## 11. Validar correção / rerodar scan

### Exercício de remediação (ATS)

1. Abra `samples/ios-panthereyes-demo/ios/Resources/Info.plist`
2. Altere `NSAllowsArbitraryLoads` para `false`
3. Rerode o scan

```bash
cargo run -p panthereyes-cli -- --json scan --phase static --target mobile samples/ios-panthereyes-demo | jq '.summary'
```

### Mudança esperada

- o finding `mobile.ios.ats.arbitrary-loads-enabled` desaparece
- `summary.status` tende a sair de `block` (dependendo de novos checks adicionados no futuro)

## 12. Testar CI/CD (local ou por referência)

### Relação com os workflows do repositório

- PR CI: `.github/workflows/ci.yml`
- Release CI: `.github/workflows/release.yml`

### Gate local (simulando CI)

```bash
mkdir -p artifacts/scans
cargo run -p panthereyes-cli -- --json scan --phase static --target mobile samples/ios-panthereyes-demo > artifacts/scans/ios-demo-static.json
jq -r '.summary.status' artifacts/scans/ios-demo-static.json
```

Se retornar `block`, o gate de PR (como modelado no workflow) deve falhar.

### Fixtures úteis

- findings esperados: `samples/shared-fixtures/expected-findings/ios-static-prod.json`
- changeset esperado (SDK): `samples/shared-fixtures/expected-changesets/ios-policy-tests.changeset.json`

## 13. Troubleshooting (muito importante)

### `agent-server` não responde

- confirme se está rodando em `http://localhost:4711`
- rode `curl -s http://localhost:4711/health`
- reconstrua o app se mudou código:
  - `corepack pnpm --filter @panthereyes/agent-server build`
- em ambientes sandboxados (CI local restrito/runner de ferramenta), pode ocorrer `EPERM` ao abrir porta (`listen 0.0.0.0:4711`)

### CLI não encontrado

- use `cargo run -p panthereyes-cli -- ...` na raiz do monorepo
- confirme Rust instalado: `rustc --version`

### config inválida / erro ao carregar policy

- confira se o YAML está bem indentado
- valide paths em `.panthereyes/`
- execute `config validate` para checar leitura/extensão
- para schema real de policy, rode `previewEffectivePolicy(...)` pelo `policy-engine`
- observação: `panthereyes config validate` do CLI atual é scaffold (valida leitura/extensão, não schema completo)

### teste gerado não compila

- rode novamente o script com `--write`
- confira se os arquivos foram gerados em `ios/Tests/PantherEyesPolicyTests/`
- confirme que o projeto foi regenerado via Tuist (`tuist generate --path ...`) se você alterou estrutura de pastas

### path errado do projeto no agente

- no `/chat`, use `rootDir` relativo à raiz do monorepo (`samples/ios-panthereyes-demo`) ou caminho absoluto

### problemas de Xcode / simulador

- troque o destino do `xcodebuild test`
- abra no Xcode e rode uma vez pelo UI para baixar componentes do simulador
- regenere o projeto com Tuist se necessário
- se aparecer `Multiple commands produce ... Info.plist`, regenere o projeto após atualizar `samples/ios-panthereyes-demo/Project.swift` e limpe `DerivedData`

### `curl`/testes Node falham com `EPERM` em ambiente restrito

- Em alguns sandboxes, `curl` para `localhost` e `tsx --test` podem falhar por restrições de socket/IPC (`EPERM`)
- Valide localmente no terminal da sua máquina (fora do sandbox) para confirmar o comportamento real

## 14. Roteiro de demo rápida (5 minutos)

### Objetivo

Mostrar em poucos passos que o PantherEyes:
- entende config
- encontra problema real
- ajuda a explicar/remediar
- gera testes de policy por ambiente

### Roteiro sugerido

1. Validar config

```bash
cargo run -p panthereyes-cli -- config validate samples/ios-panthereyes-demo/.panthereyes/policy.yaml
```

2. Rodar scan e mostrar finding

```bash
cargo run -p panthereyes-cli -- --json scan --phase static --target mobile samples/ios-panthereyes-demo | jq '.summary'
```

3. Mostrar prompt de explicação (agent / demo)

- `explique o finding IOS-ATS-001`

4. Gerar testes de policy (SDK sem LLM)

```bash
node samples/ios-panthereyes-demo/scripts/generate-policy-tests.mjs --env=prod | jq .
```

5. Mostrar resultado final

- `ChangeSet` com teste XCTest gerado
- policy `prod` mais rígida que `dev`
- finding de ATS bloqueando até remediação

## 15. Próximos passos

- Implementar intent de agente para `explain_finding` (hoje: TODO/placeholder)
- Implementar check Rust para detectar valor sensível fake hardcoded (se desejado para demo)
- Integrar aplicação automática de `ChangeSet` no agent-server
- Adaptar o sample para seu app real:
  - copiar `.panthereyes/`
  - ajustar `rules.yaml` e `policy.yaml`
  - substituir `SecurityPolicyLoader` por leitura real da policy efetiva no seu pipeline de build/teste
