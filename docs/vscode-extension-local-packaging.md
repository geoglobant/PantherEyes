# PantherEyes VS Code Extension: Local Packaging and Installation (Developer Tutorial)

This tutorial shows how to package the PantherEyes VS Code extension locally as a `.vsix` file and install it without using `F5` / Extension Development Host.

It also documents the common issues we hit while validating the local packaging flow.

## Goal

Generate:

- `apps/vscode-extension/panthereyes-vscode-extension.vsix`

Then install it in VS Code using:

- `Extensions: Install from VSIX...`

## Prerequisites

- Open the **PantherEyes monorepo root** in a terminal
- Node.js installed
- `corepack` available
- Internet access to download npm dependencies (first run / dependency updates)

## Important: Run from the Monorepo Root

Run all commands from:

```bash
/Users/george.michelon/Desktop/PantherEyes
```

You should see:

- `apps/`
- `packages/`
- `crates/`
- `package.json`

## 1) Install dependencies (and update lockfile if needed)

If this is your first time packaging the extension locally, or if `package.json` changed:

```bash
CI=1 corepack pnpm install --no-frozen-lockfile
```

Why `--no-frozen-lockfile`?

- Local packaging support (`@vscode/vsce`) was added to the extension workspace.
- If your `pnpm-lock.yaml` is older, `pnpm` may fail in CI/frozen mode.

## 2) Package the Extension (.vsix)

From the monorepo root:

```bash
corepack pnpm extension:package
```

This runs:

- extension build (`tsc`)
- `vsce package`

Expected output (summary):

- `DONE Packaged: panthereyes-vscode-extension.vsix`

## 3) Install the .vsix in VS Code

1. Open VS Code
2. `Cmd+Shift+P`
3. Run `Extensions: Install from VSIX...`
4. Select:

```text
apps/vscode-extension/panthereyes-vscode-extension.vsix
```

## 4) Use the Extension (No F5)

After installation:

1. Open the PantherEyes monorepo in VS Code
2. `Cmd+Shift+P`
3. Run `PantherEyes: Ask Agent`

The extension now supports:

- local agent auto-start (`localhost` endpoint)
- agent status command
- status bar indicator

## 5) Recommended First Validation

1. Run `PantherEyes: Agent Status`
2. Choose `Check Agent Health`
3. Run `PantherEyes: Ask Agent`
4. Submit a deterministic prompt (e.g. `generate_policy_tests`)

## Troubleshooting

### Error: `tsc: command not found`

Cause:

- Workspace dependencies are missing because `pnpm install` did not complete.

Fix:

```bash
CI=1 corepack pnpm install --no-frozen-lockfile
```

Then rerun:

```bash
corepack pnpm extension:package
```

### Error: `ERR_PNPM_OUTDATED_LOCKFILE`

Cause:

- `pnpm-lock.yaml` is out of sync with `package.json`.

Fix:

```bash
CI=1 corepack pnpm install --no-frozen-lockfile
```

### Error from `vsce`: repository/readme images could not be detected

Cause:

- Missing `repository` metadata in extension `package.json`.

Status:

- Already fixed in `apps/vscode-extension/package.json`.

### Error from `vsce`: `SVGs are restricted in README.md`

Cause:

- VS Code extension packaging (`vsce`) rejects SVG images referenced in the extension README.

Status:

- README was changed to text placeholders instead of inline SVG references.

### Error: `ENOTFOUND registry.npmjs.org`

Cause:

- DNS/proxy/VPN/corporate network issue (not usually admin permission related).

Checks:

```bash
curl -I https://registry.npmjs.org
corepack pnpm view typescript version
```

If you use a corporate proxy, configure pnpm/npm proxy settings.

### “I am not admin on this machine” — can that break packaging?

Usually **no**, not for this flow.

Local packaging runs inside your project directory and does not require admin privileges in normal cases.

Admin rights are more relevant for:

- global installs
- system-level Node/pnpm setup
- protected directories

## Optional: Package from Extension Directory

If you prefer, you can run packaging directly inside the extension folder:

```bash
cd apps/vscode-extension
corepack pnpm run package:vsix
```

But the workspace dependencies still need to be installed from the monorepo root first.

## Notes for Maintainers

- The extension README is kept `vsce`-safe (no SVG image references).
- `.vscodeignore` is configured to package `dist/` and `media/` while excluding source/dev files.
- Root helper script exists:
  - `package.json` -> `extension:package`
