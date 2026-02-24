# panthereyes-cli

PantherEyes CLI for running scans, validating configuration, previewing policies, and diagnosing the local environment.

## Initial Features

- `scan`
- `config validate`
- `policy preview`
- `doctor`
- optional JSON output with `--json`

## Build

```bash
cargo build -p panthereyes-cli
```

## Tests

```bash
cargo test -p panthereyes-cli
```

## Usage Examples

### Scan (text)

```bash
cargo run -p panthereyes-cli -- scan --target web .
```

### Scan (JSON)

```bash
cargo run -p panthereyes-cli -- --json scan --target mobile ./app.apk
```

### Validate config

```bash
cargo run -p panthereyes-cli -- config validate ./panthereyes.toml
```

### Policy preview

```bash
cargo run -p panthereyes-cli -- policy preview --target web --strict --config ./panthereyes.toml
```

### Doctor

```bash
cargo run -p panthereyes-cli -- doctor --verbose
```

## Notes

- `scan` uses demo checks (`web` and `mobile`) at this stage.
- The structure is ready to integrate real checks through the `CheckRunner` layer.
