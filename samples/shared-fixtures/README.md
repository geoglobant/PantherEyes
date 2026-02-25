# PantherEyes Sample Fixtures

Shared expected outputs for sample app labs.

## Contents

- `expected-findings/*.json`: CLI `panthereyes scan --phase static --target mobile ...` JSON outputs captured from the initial insecure sample state.
- `expected-changesets/*.changeset.json`: deterministic SDK `PolicyTestGenerator` dry-run outputs (captured for `prod`).

## Usage

Use these fixtures to compare:
- CLI scan output shape and finding IDs
- SDK-generated policy test `ChangeSet` structure
- CI/CD regression expectations in local scripts or GitHub Actions jobs
