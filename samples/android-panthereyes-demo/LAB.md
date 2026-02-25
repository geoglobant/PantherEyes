# LAB - PantherEyes Android Demo (Kotlin + JUnit)

## 1. Visão geral do sample

Este sample demonstra um app Android (Kotlin) com configurações intencionalmente inseguras para validar o PantherEyes de ponta a ponta:

- CLI (`scan`, `config validate`, `policy preview`)
- Policy Engine / SDK (preview de policy por ambiente + geração de testes unitários determinística)
- Agent Server (planner determinístico `generate_policy_tests`)
- Extensão VS Code (painel `/chat`, se estiver habilitada)

### Cenários didáticos intencionais

- `android:usesCleartextTraffic="true"`
- `android:debuggable="true"`
- `android:allowBackup="true"` (exercício de hardening para evolução do scanner)
- valor sensível **fake** hardcoded no app (apenas para demo, sem segredo real)
- diferenças de policy entre `dev`, `staging` e `prod` em `.panthereyes/policy.yaml`

### Findings que o PantherEyes deve detectar (estado inicial)

No scanner mobile atual, os findings reais esperados para este sample são:

- `mobile.android.cleartext-traffic-enabled`
- `mobile.android.debuggable-enabled`

Observações:

- `allowBackup=true` está presente de propósito, mas o scanner Rust atual ainda não implementa esse check.
- O valor fake hardcoded também está presente apenas para demonstração de futuras capacidades.

## 2. Pré-requisitos

### Ferramentas necessárias

- Android Studio (recomendado) ou Gradle + Android SDK configurados
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

```bash
cargo run -p panthereyes-cli -- doctor --verbose
```

Ou, se instalado globalmente:

```bash
panthereyes doctor --verbose
```

### Como confirmar que a extensão VS Code está instalada (se aplicável)

- Abra o VS Code
- Abra o `Command Palette`
- Procure por `PantherEyes:`
- Verifique se os comandos da extensão aparecem

## 3. Estrutura do sample

### Arquivos principais

- App Android (Kotlin)
  - `samples/android-panthereyes-demo/android/app/src/main/java/com/panthereyes/samples/androiddemo/MainActivity.kt`
  - `samples/android-panthereyes-demo/android/app/src/main/java/com/panthereyes/samples/androiddemo/DemoSecurityConfig.kt`
  - `samples/android-panthereyes-demo/android/app/src/main/java/com/panthereyes/samples/androiddemo/PantherEyesDemoApplication.kt`
- Manifest/configuração insegura didática (scanner)
  - `samples/android-panthereyes-demo/android/app/src/main/AndroidManifest.xml`
- Configuração PantherEyes
  - `samples/android-panthereyes-demo/.panthereyes/policy.yaml`
  - `samples/android-panthereyes-demo/.panthereyes/rules.yaml`
  - `samples/android-panthereyes-demo/.panthereyes/exceptions.yaml`
- Testes e helpers
  - `samples/android-panthereyes-demo/android/app/src/test/java/com/panthereyes/policy/SecurityPolicyLoader.kt`
  - `samples/android-panthereyes-demo/android/app/src/test/java/com/panthereyes/policy/SecurityPolicyLoaderTest.kt`
  - `samples/android-panthereyes-demo/android/app/src/test/java/com/panthereyes/policy/PantherEyesPolicy*Test.java`
- Script de geração de testes via SDK
  - `samples/android-panthereyes-demo/scripts/generate-policy-tests.mjs`

### Onde estão os pontos inseguros didáticos

- `usesCleartextTraffic`, `allowBackup`, `debuggable`: `samples/android-panthereyes-demo/android/app/src/main/AndroidManifest.xml`
- token fake hardcoded: `samples/android-panthereyes-demo/android/app/src/main/java/com/panthereyes/samples/androiddemo/DemoSecurityConfig.kt`

## 4. Executar o app sample

### Abrir no Android Studio

Abra a pasta:

- `samples/android-panthereyes-demo/android`

### Rodar o app

- Run configuration: módulo `app`
- Device: emulador Android (ou device físico)

### Observações importantes

- O `AndroidManifest.xml` contém flags inseguras de propósito para o scan encontrar findings.
- O sample foi desenhado para demo e validação de produto, não para produção.

### Build via linha de comando (opcional, se `gradle` estiver disponível)

```bash
cd samples/android-panthereyes-demo/android
gradle :app:assembleDebug
```

Observação: este sample não inclui `gradlew` no momento (TODO/placeholder se você quiser travar a versão do Gradle no sample).

## 5. Validar configuração PantherEyes

### Comandos (`config validate`)

```bash
cargo run -p panthereyes-cli -- config validate samples/android-panthereyes-demo/.panthereyes/policy.yaml
cargo run -p panthereyes-cli -- config validate samples/android-panthereyes-demo/.panthereyes/rules.yaml
cargo run -p panthereyes-cli -- config validate samples/android-panthereyes-demo/.panthereyes/exceptions.yaml
```

### Resultado esperado

- `valid: true`
- `format: yaml`
- notas indicando que o `config validate` do CLI ainda é scaffold

### O que fazer se falhar

- confirme o path do sample
- confirme execução na raiz do monorepo
- revise YAML (indentação)
- rode `cargo run -p panthereyes-cli -- doctor --verbose`

## 6. Preview de policy por ambiente

### 6.1 Validar o comando CLI `policy preview` (scaffold atual)

```bash
cargo run -p panthereyes-cli -- policy preview \
  --target mobile \
  --strict \
  --config samples/android-panthereyes-demo/.panthereyes/policy.yaml \
  --rules samples/android-panthereyes-demo/.panthereyes/rules.yaml
```

Hoje este comando mostra o pipeline de preview, mas não resolve policy real por `env`.

### 6.2 Preview efetivo por ambiente (Policy Engine real)

```bash
corepack pnpm --filter @panthereyes/policy-engine build
```

```bash
node -e "const p=require('./packages/policy-engine/dist/index.js'); console.log(p.previewEffectivePolicy('dev','mobile',{rootDir:'samples/android-panthereyes-demo'}));"
node -e "const p=require('./packages/policy-engine/dist/index.js'); console.log(p.previewEffectivePolicy('staging','mobile',{rootDir:'samples/android-panthereyes-demo'}));"
node -e "const p=require('./packages/policy-engine/dist/index.js'); console.log(p.previewEffectivePolicy('prod','mobile',{rootDir:'samples/android-panthereyes-demo'}));"
```

### Diferença esperada entre ambientes

- `dev`: `mode=audit`, `failOnSeverity=critical`, `allowDemoCleartext=true`, `minScore=60`
- `staging`: `mode=warn`, `failOnSeverity=high`, `allowDemoCleartext=false`, `minScore=80`
- `prod`: `mode=enforce`, `failOnSeverity=medium`, `allowDemoCleartext=false`, `minScore=95`

Observação importante: o target atual do `policy-engine` é `mobile` (não `android`). O sample Android usa policy `mobile` e o script converte isso para geração de testes JUnit (`android`).

## 7. Rodar scan estático

### Comando do CLI

```bash
cargo run -p panthereyes-cli -- --json scan --phase static --target mobile samples/android-panthereyes-demo | jq .
```

### Resultado esperado (estado inicial)

- `summary.status`: `block`
- findings principais:
  - `mobile.android.cleartext-traffic-enabled`
  - `mobile.android.debuggable-enabled`

### Arquivo onde os findings aparecem

- `samples/android-panthereyes-demo/android/app/src/main/AndroidManifest.xml`

### Fixture de referência

- `samples/shared-fixtures/expected-findings/android-static-prod.json`

## 8. Testar o agente (prompts prontos)

### Como testar hoje (estado atual do agent-server)

O Agent Server atual possui um planner determinístico para o intent:

- `generate_policy_tests`

Prompts de explicação/remediação/alteração de regra/criação de exceção são úteis como roteiro de demo, mas hoje devem ser tratados como **TODO/placeholder de intents futuros**, a menos que você force `generate_policy_tests`.

### Request pronto (funciona hoje)

```bash
curl -s http://localhost:4711/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "gere testes JUnit para policy android em dev e prod",
    "intent": "generate_policy_tests",
    "context": {
      "env": "prod",
      "target": "mobile",
      "rootDir": "samples/android-panthereyes-demo"
    }
  }' | jq .
```

### Resultado esperado (estado atual do agente)

- intent resolvido: `generate_policy_tests`
- `planner.changeSet.dryRun = true`
- `planner.changeSet.changes` com **3 arquivos TypeScript/JSON/README** em `tests/policy/prod/`
- Observação: mesmo com prompt pedindo JUnit, o planner atual ainda gera um `ChangeSet` genérico (TS) no `agent-server`

### Prompts copy/paste (roteiro de demo)

Obrigatórios (incluídos para demo/comercial + técnico):

- `explique o finding AND-NET-001`
- `crie testes unitarios validando as diretivas de seguranca validas para cada ambiente`
- `gere testes JUnit para policy android em dev e prod`
- `altere a regra de cleartext para bloquear em prod e alertar em dev`
- `sugira remediacao para usesCleartextTraffic=true`
- `crie uma excecao temporaria para cleartext em dev com expiracao`

Mapeamento útil para a demo (estado atual):

- alias de demo `AND-NET-001` -> finding real do scanner: `mobile.android.cleartext-traffic-enabled`

## 9. Validar SDK / geração de testes unitários

### 9.1 Via script direto (sem LLM, recomendado para validação)

```bash
corepack pnpm --filter @panthereyes/policy-engine build
corepack pnpm --filter @panthereyes/sdk-ts build
```

Dry-run (`ChangeSet` no stdout):

```bash
node samples/android-panthereyes-demo/scripts/generate-policy-tests.mjs
```

Aplicar (write) os arquivos gerados:

```bash
node samples/android-panthereyes-demo/scripts/generate-policy-tests.mjs --write
```

### 9.2 Via agente (`generate_policy_tests`)

- O endpoint `/chat` retorna `ChangeSet` em dry-run
- Útil para validar planner + tools + adapters
- Estado atual: o planner do `agent-server` gera um `ChangeSet` genérico em `tests/policy/<env>/...` (TypeScript + snapshot + README), não arquivos JUnit diretamente

### Onde o ChangeSet aparece

- stdout do script (`changeset`)
- `samples/android-panthereyes-demo/artifacts/android-policy-test-changesets.json` (quando usar `--write`)
- resposta JSON do `agent-server` (`planner.changeSet`)
- no agente atual, o primeiro arquivo costuma ser `tests/policy/prod/mobile.effective-policy.test.ts`

### Como aplicar o ChangeSet (ou simular aplicação)

- usar `changeset` para revisar proposta
- usar `--write` para materializar arquivos de teste no projeto

### Arquivos de teste esperados

- `samples/android-panthereyes-demo/android/app/src/test/java/com/panthereyes/policy/PantherEyesPolicyDevTest.java`
- `samples/android-panthereyes-demo/android/app/src/test/java/com/panthereyes/policy/PantherEyesPolicyStagingTest.java`
- `samples/android-panthereyes-demo/android/app/src/test/java/com/panthereyes/policy/PantherEyesPolicyProdTest.java`

## 10. Rodar os testes gerados

### JUnit (Android Studio)

- Abra `samples/android-panthereyes-demo/android`
- Execute os testes do pacote `com.panthereyes.policy`

### JUnit (linha de comando, se `gradle` estiver disponível)

```bash
cd samples/android-panthereyes-demo/android
gradle :app:testDebugUnitTest
```

### Resultado esperado

- `SecurityPolicyLoaderTest` passa
- `PantherEyesPolicy*Test` (gerados) passam

### Observações sobre `SecurityPolicyLoader`

- Helper mínimo para carregar fixtures `dev/staging/prod`
- parser JSON simples para manter o sample pequeno e didático
- não depende de LLM

## 11. Validar correção / rerodar scan

### Exercício de remediação (manifest)

1. Abra `samples/android-panthereyes-demo/android/app/src/main/AndroidManifest.xml`
2. Altere `android:usesCleartextTraffic="true"` para `false`
3. Remova `android:debuggable="true"`
4. Rerode o scan

```bash
cargo run -p panthereyes-cli -- --json scan --phase static --target mobile samples/android-panthereyes-demo | jq '.summary'
```

### Mudança esperada

- findings de cleartext/debuggable desaparecem
- `summary.status` deixa de bloquear (a depender de checks futuros adicionados ao scanner)

## 12. Testar CI/CD (local ou por referência)

### Relação com os workflows do repositório

- PR CI: `.github/workflows/ci.yml`
- Release CI: `.github/workflows/release.yml`

### Gate local (simulando CI)

```bash
mkdir -p artifacts/scans
cargo run -p panthereyes-cli -- --json scan --phase static --target mobile samples/android-panthereyes-demo > artifacts/scans/android-demo-static.json
jq -r '.summary.status' artifacts/scans/android-demo-static.json
```

Se retornar `block`, o gate de PR (como modelado no workflow) deve falhar.

### Fixtures úteis

- findings esperados: `samples/shared-fixtures/expected-findings/android-static-prod.json`
- changeset esperado (SDK): `samples/shared-fixtures/expected-changesets/android-policy-tests.changeset.json`

## 13. Troubleshooting (muito importante)

### `agent-server` não responde

- valide `http://localhost:4711/health`
- reconstrua:
  - `corepack pnpm --filter @panthereyes/agent-server build`
- confira se a porta `4711` não está ocupada
- em ambientes sandboxados (CI local restrito/runner de ferramenta), pode ocorrer `EPERM` ao abrir porta (`listen 0.0.0.0:4711`)

### CLI não encontrado

- use `cargo run -p panthereyes-cli -- ...` na raiz do monorepo
- valide Rust: `rustc --version`

### config inválida / erro ao carregar policy

- revise YAML e indentação em `.panthereyes/*.yaml`
- rode `config validate` para checar leitura/extensão
- use `previewEffectivePolicy(...)` do `policy-engine` para validação de schema real
- observação: `panthereyes config validate` do CLI atual é scaffold (valida leitura/extensão, não schema completo)

### teste gerado não compila

- rode novamente o script com `--write`
- confira se os arquivos foram gerados no pacote `com.panthereyes.policy`
- confirme `namespace`/paths do projeto Android

### path errado do projeto no agente

- use `rootDir` como `samples/android-panthereyes-demo` (relativo à raiz do monorepo) ou caminho absoluto

### problemas de Android Studio / Gradle

- sincronize o projeto (`Sync Project with Gradle Files`)
- confirme Android SDK instalado
- se usar CLI, garanta `gradle` disponível no PATH (o sample não inclui `gradlew` por enquanto)

### `curl`/testes Node falham com `EPERM` em ambiente restrito

- Em alguns sandboxes, `curl` para `localhost` e `tsx --test` podem falhar por restrições de socket/IPC (`EPERM`)
- Valide localmente no terminal da sua máquina (fora do sandbox) para confirmar o comportamento real

## 14. Roteiro de demo rápida (5 minutos)

### Objetivo

Mostrar que o PantherEyes:
- valida config
- encontra risco real no manifest
- orienta próxima ação via agente (planner atual + prompts de roadmap)
- gera testes de policy por ambiente sem LLM

### Roteiro sugerido

1. Validar config

```bash
cargo run -p panthereyes-cli -- config validate samples/android-panthereyes-demo/.panthereyes/policy.yaml
```

2. Rodar scan e mostrar findings

```bash
cargo run -p panthereyes-cli -- --json scan --phase static --target mobile samples/android-panthereyes-demo | jq '.summary'
```

3. Mostrar prompt de explicação (roteiro)

- `explique o finding AND-NET-001`

4. Gerar testes de policy (SDK sem LLM)

```bash
node samples/android-panthereyes-demo/scripts/generate-policy-tests.mjs --env=prod | jq .
```

5. Mostrar resultado final

- `ChangeSet` com teste JUnit gerado
- policy `prod` mais rígida que `dev`
- scan bloqueando até remediação

## 15. Próximos passos

- Implementar checks Rust para `allowBackup=true` e hardcoded fake secret (para enriquecer a demo)
- Criar intents do agent para `explain_finding`, `suggest_remediation`, `update_policy_rule`, `create_exception`
- Adicionar `gradlew` ao sample Android (wrapper) para facilitar execução em qualquer máquina
- Adaptar para seu app real:
  - copie `.panthereyes/`
  - ajuste `rules.yaml`/`policy.yaml`
  - integre a geração de testes JUnit/XCTest no seu pipeline de CI
