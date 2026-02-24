use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use clap::{Args, Parser, Subcommand, ValueEnum};
use panthereyes_checks_mobile::scan_mobile_path;
use panthereyes_checks_web::scan_web_path;
use panthereyes_core::{ScanReport, ScanStatus, Severity, TargetKind};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Parser, Clone, PartialEq, Eq)]
#[command(
    name = "panthereyes",
    about = "PantherEyes CLI scaffold for security checks, policy preview and diagnostics",
    version
)]
pub struct Cli {
    #[arg(long, global = true, help = "Emit JSON output")]
    pub json: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand, Clone, PartialEq, Eq)]
pub enum Commands {
    /// Run security checks against a target
    Scan(ScanArgs),
    /// Configuration related commands
    Config(ConfigArgs),
    /// Policy related commands
    Policy(PolicyArgs),
    /// Diagnose local environment and CLI readiness
    Doctor(DoctorArgs),
}

#[derive(Debug, Args, Clone, PartialEq, Eq)]
pub struct ConfigArgs {
    #[command(subcommand)]
    pub command: ConfigCommands,
}

#[derive(Debug, Subcommand, Clone, PartialEq, Eq)]
pub enum ConfigCommands {
    /// Validate PantherEyes configuration file shape (basic scaffold validation)
    Validate(ConfigValidateArgs),
}

#[derive(Debug, Args, Clone, PartialEq, Eq)]
pub struct PolicyArgs {
    #[command(subcommand)]
    pub command: PolicyCommands,
}

#[derive(Debug, Subcommand, Clone, PartialEq, Eq)]
pub enum PolicyCommands {
    /// Preview policy execution plan using current options
    Preview(PolicyPreviewArgs),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScanTarget {
    Web,
    Mobile,
}

impl ScanTarget {
    fn as_str(self) -> &'static str {
        match self {
            Self::Web => "web",
            Self::Mobile => "mobile",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScanPhase {
    Static,
    NonStatic,
}

impl ScanPhase {
    fn as_str(self) -> &'static str {
        match self {
            Self::Static => "static",
            Self::NonStatic => "non-static",
        }
    }
}

#[derive(Debug, Args, Clone, PartialEq, Eq)]
pub struct ScanArgs {
    #[arg(long, value_enum, default_value_t = ScanTarget::Web)]
    pub target: ScanTarget,

    #[arg(long, value_enum, default_value_t = ScanPhase::Static)]
    pub phase: ScanPhase,

    #[arg(
        long,
        help = "Optional config file for scan orchestration (reserved for future integration)"
    )]
    pub config: Option<PathBuf>,

    #[arg(long, help = "Named profile to load (reserved for future integration)")]
    pub profile: Option<String>,

    #[arg(default_value = ".")]
    pub path: PathBuf,
}

#[derive(Debug, Args, Clone, PartialEq, Eq)]
pub struct ConfigValidateArgs {
    #[arg(default_value = "panthereyes.toml")]
    pub path: PathBuf,
}

#[derive(Debug, Args, Clone, PartialEq, Eq)]
pub struct PolicyPreviewArgs {
    #[arg(long, value_enum, default_value_t = ScanTarget::Web)]
    pub target: ScanTarget,

    #[arg(long)]
    pub config: Option<PathBuf>,

    #[arg(long, help = "Rule catalog source (reserved for future integration)")]
    pub rules: Option<PathBuf>,

    #[arg(long, default_value_t = false)]
    pub strict: bool,
}

#[derive(Debug, Args, Clone, PartialEq, Eq)]
pub struct DoctorArgs {
    #[arg(
        long,
        default_value_t = false,
        help = "Include extra environment details"
    )]
    pub verbose: bool,
}

#[derive(Debug, Error)]
pub enum CliError {
    #[error("scan path not found: {path}")]
    ScanPathNotFound { path: PathBuf },

    #[error("config file not found: {path}")]
    ConfigNotFound { path: PathBuf },

    #[error("unsupported config extension '{ext}' for {path}")]
    UnsupportedConfigExtension { path: PathBuf, ext: String },
}

pub fn run(cli: Cli) -> Result<()> {
    let output = match cli.command {
        Commands::Scan(args) => handle_scan(args)?,
        Commands::Config(config) => match config.command {
            ConfigCommands::Validate(args) => handle_config_validate(args)?,
        },
        Commands::Policy(policy) => match policy.command {
            PolicyCommands::Preview(args) => handle_policy_preview(args)?,
        },
        Commands::Doctor(args) => handle_doctor(args)?,
    };

    print_output(&output, cli.json)
}

trait CheckRunner {
    fn run_scan(&self, target: ScanTarget, path: &Path) -> Result<ScanReport>;
}

struct DemoCheckRunner;

impl CheckRunner for DemoCheckRunner {
    fn run_scan(&self, target: ScanTarget, path: &Path) -> Result<ScanReport> {
        match target {
            ScanTarget::Web => scan_web_path(path).map_err(Into::into),
            ScanTarget::Mobile => scan_mobile_path(path).map_err(Into::into),
        }
    }
}

fn handle_scan(args: ScanArgs) -> Result<CommandOutput> {
    let runner = DemoCheckRunner;
    let path = args.path;

    if !path.exists() {
        return Err(CliError::ScanPathNotFound { path }.into());
    }

    let summary = match args.phase {
        ScanPhase::Static => runner
            .run_scan(args.target, &path)
            .with_context(|| format!("failed to run scan checks for {}", path.display()))?,
        ScanPhase::NonStatic => {
            let mut report = ScanReport::new(scan_target_kind(args.target));
            report.recompute_status();
            report
        }
    };

    Ok(CommandOutput::Scan(ScanCommandOutput {
        target: args.target,
        phase: args.phase,
        path,
        profile: args.profile,
        config: args.config,
        summary: ScanSummaryOutput::from(summary),
    }))
}

fn handle_config_validate(args: ConfigValidateArgs) -> Result<CommandOutput> {
    let path = args.path;

    if !path.exists() {
        return Err(CliError::ConfigNotFound { path }.into());
    }

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase());

    let supported = matches!(extension.as_deref(), Some("toml" | "yaml" | "yml" | "json"));
    if !supported {
        return Err(CliError::UnsupportedConfigExtension {
            path: path.clone(),
            ext: extension.unwrap_or_else(|| "<none>".to_string()),
        }
        .into());
    }

    let bytes = std::fs::read(&path)
        .with_context(|| format!("failed to read config file {}", path.display()))?;

    Ok(CommandOutput::ConfigValidate(ConfigValidateOutput {
        path,
        valid: true,
        bytes: bytes.len(),
        format: extension.unwrap_or_else(|| "unknown".to_string()),
        notes: vec![
            "Schema validation ainda nao implementada (scaffold).".to_string(),
            "Extensao reconhecida e arquivo acessivel.".to_string(),
        ],
    }))
}

fn handle_policy_preview(args: PolicyPreviewArgs) -> Result<CommandOutput> {
    let estimated_sources =
        usize::from(args.config.is_some()) + usize::from(args.rules.is_some()) + 1;
    let preview = PolicyPreviewOutput {
        target: args.target,
        strict: args.strict,
        config: args.config,
        rules: args.rules,
        stages: vec![
            "load-runtime-context".to_string(),
            "load-policy-config".to_string(),
            "load-rule-catalog".to_string(),
            "compose-evaluation-plan".to_string(),
            "simulate-decision-output".to_string(),
        ],
        estimated_sources,
    };

    Ok(CommandOutput::PolicyPreview(preview))
}

fn handle_doctor(args: DoctorArgs) -> Result<CommandOutput> {
    let cwd = std::env::current_dir().context("failed to read current directory")?;
    let cargo_manifest_exists = cwd.join("Cargo.toml").exists();
    let pnpm_workspace_exists = cwd.join("pnpm-workspace.yaml").exists();

    let mut checks = vec![
        DoctorCheck {
            name: "cwd-readable".to_string(),
            ok: true,
            detail: format!("Current dir: {}", cwd.display()),
        },
        DoctorCheck {
            name: "cargo-workspace".to_string(),
            ok: cargo_manifest_exists,
            detail: if cargo_manifest_exists {
                "Cargo.toml encontrado no diretório atual.".to_string()
            } else {
                "Cargo.toml nao encontrado no diretório atual.".to_string()
            },
        },
        DoctorCheck {
            name: "pnpm-workspace".to_string(),
            ok: pnpm_workspace_exists,
            detail: if pnpm_workspace_exists {
                "pnpm-workspace.yaml encontrado no diretório atual.".to_string()
            } else {
                "pnpm-workspace.yaml nao encontrado no diretório atual.".to_string()
            },
        },
    ];

    if args.verbose {
        checks.push(DoctorCheck {
            name: "cli-version".to_string(),
            ok: true,
            detail: env!("CARGO_PKG_VERSION").to_string(),
        });
    }

    Ok(CommandOutput::Doctor(DoctorOutput {
        ok: checks.iter().all(|check| check.ok),
        checks,
    }))
}

#[derive(Debug, Serialize)]
#[serde(tag = "command", rename_all = "kebab-case")]
enum CommandOutput {
    Scan(ScanCommandOutput),
    ConfigValidate(ConfigValidateOutput),
    PolicyPreview(PolicyPreviewOutput),
    Doctor(DoctorOutput),
}

#[derive(Debug, Serialize)]
struct ScanCommandOutput {
    target: ScanTarget,
    phase: ScanPhase,
    path: PathBuf,
    profile: Option<String>,
    config: Option<PathBuf>,
    summary: ScanSummaryOutput,
}

#[derive(Debug, Serialize)]
struct ScanSummaryOutput {
    target: String,
    status: String,
    findings: Vec<FindingOutput>,
}

impl From<ScanReport> for ScanSummaryOutput {
    fn from(summary: ScanReport) -> Self {
        Self {
            target: target_label(summary.target).to_string(),
            status: scan_status_label(summary.status).to_string(),
            findings: summary
                .findings
                .into_iter()
                .map(|finding| FindingOutput {
                    id: finding.id,
                    title: finding.title,
                    severity: severity_label(finding.severity).to_string(),
                    target: target_label(finding.target).to_string(),
                    file: finding.file.map(|path| path.display().to_string()),
                    message: finding.message,
                    remediation: finding.remediation,
                })
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
struct FindingOutput {
    id: String,
    title: String,
    severity: String,
    target: String,
    file: Option<String>,
    message: String,
    remediation: String,
}

#[derive(Debug, Serialize)]
struct ConfigValidateOutput {
    path: PathBuf,
    valid: bool,
    bytes: usize,
    format: String,
    notes: Vec<String>,
}

#[derive(Debug, Serialize)]
struct PolicyPreviewOutput {
    target: ScanTarget,
    strict: bool,
    config: Option<PathBuf>,
    rules: Option<PathBuf>,
    stages: Vec<String>,
    estimated_sources: usize,
}

#[derive(Debug, Serialize)]
struct DoctorOutput {
    ok: bool,
    checks: Vec<DoctorCheck>,
}

#[derive(Debug, Serialize)]
struct DoctorCheck {
    name: String,
    ok: bool,
    detail: String,
}

fn print_output(output: &CommandOutput, json: bool) -> Result<()> {
    if json {
        let body =
            serde_json::to_string_pretty(output).context("failed to serialize JSON output")?;
        println!("{body}");
        return Ok(());
    }

    match output {
        CommandOutput::Scan(value) => print_scan_text(value),
        CommandOutput::ConfigValidate(value) => print_config_validate_text(value),
        CommandOutput::PolicyPreview(value) => print_policy_preview_text(value),
        CommandOutput::Doctor(value) => print_doctor_text(value),
    }

    Ok(())
}

fn print_scan_text(value: &ScanCommandOutput) {
    println!("PantherEyes scan");
    println!("target: {}", value.target.as_str());
    println!("phase: {}", value.phase.as_str());
    println!("path: {}", value.path.display());
    if let Some(profile) = &value.profile {
        println!("profile: {profile}");
    }
    if let Some(config) = &value.config {
        println!("config: {}", config.display());
    }
    println!("status: {}", value.summary.status);
    println!("findings: {}", value.summary.findings.len());
    for finding in &value.summary.findings {
        println!(
            "- [{}] {} ({}) :: {}",
            finding.severity, finding.id, finding.target, finding.title
        );
        if let Some(file) = &finding.file {
            println!("  file: {file}");
        }
        println!("  message: {}", finding.message);
        println!("  remediation: {}", finding.remediation);
    }
}

fn print_config_validate_text(value: &ConfigValidateOutput) {
    println!("PantherEyes config validate");
    println!("path: {}", value.path.display());
    println!("valid: {}", value.valid);
    println!("format: {}", value.format);
    println!("bytes: {}", value.bytes);
    for note in &value.notes {
        println!("- {note}");
    }
}

fn print_policy_preview_text(value: &PolicyPreviewOutput) {
    println!("PantherEyes policy preview");
    println!("target: {}", value.target.as_str());
    println!("strict: {}", value.strict);
    if let Some(config) = &value.config {
        println!("config: {}", config.display());
    }
    if let Some(rules) = &value.rules {
        println!("rules: {}", rules.display());
    }
    println!("estimated sources: {}", value.estimated_sources);
    println!("stages:");
    for stage in &value.stages {
        println!("- {stage}");
    }
}

fn print_doctor_text(value: &DoctorOutput) {
    println!("PantherEyes doctor");
    println!("status: {}", if value.ok { "ok" } else { "warn" });
    for check in &value.checks {
        println!(
            "- {} [{}] {}",
            check.name,
            if check.ok { "ok" } else { "fail" },
            check.detail
        );
    }
}

fn severity_label(severity: Severity) -> &'static str {
    severity.as_str()
}

fn scan_target_kind(target: ScanTarget) -> TargetKind {
    match target {
        ScanTarget::Web => TargetKind::Web,
        ScanTarget::Mobile => TargetKind::Mobile,
    }
}

fn target_label(target: TargetKind) -> &'static str {
    target.as_str()
}

fn scan_status_label(status: ScanStatus) -> &'static str {
    status.as_str()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scan_with_json_flag() {
        let cli = Cli::try_parse_from([
            "panthereyes",
            "--json",
            "scan",
            "--target",
            "mobile",
            "--profile",
            "ci",
            "./app.apk",
        ])
        .expect("cli should parse");

        assert!(cli.json);
        assert_eq!(
            cli.command,
            Commands::Scan(ScanArgs {
                target: ScanTarget::Mobile,
                phase: ScanPhase::Static,
                config: None,
                profile: Some("ci".to_string()),
                path: PathBuf::from("./app.apk"),
            })
        );
    }

    #[test]
    fn parses_config_validate_nested_command() {
        let cli =
            Cli::try_parse_from(["panthereyes", "config", "validate", "panthereyes.yaml"]).unwrap();

        assert_eq!(
            cli.command,
            Commands::Config(ConfigArgs {
                command: ConfigCommands::Validate(ConfigValidateArgs {
                    path: PathBuf::from("panthereyes.yaml"),
                }),
            })
        );
    }

    #[test]
    fn parses_policy_preview_strict() {
        let cli = Cli::try_parse_from([
            "panthereyes",
            "policy",
            "preview",
            "--target",
            "web",
            "--strict",
            "--config",
            "panthereyes.toml",
        ])
        .unwrap();

        assert_eq!(
            cli.command,
            Commands::Policy(PolicyArgs {
                command: PolicyCommands::Preview(PolicyPreviewArgs {
                    target: ScanTarget::Web,
                    config: Some(PathBuf::from("panthereyes.toml")),
                    rules: None,
                    strict: true,
                }),
            })
        );
    }

    #[test]
    fn parses_doctor_verbose() {
        let cli = Cli::try_parse_from(["panthereyes", "doctor", "--verbose"]).unwrap();

        assert_eq!(cli.command, Commands::Doctor(DoctorArgs { verbose: true }));
    }

    #[test]
    fn parses_scan_non_static_phase() {
        let cli = Cli::try_parse_from([
            "panthereyes",
            "scan",
            "--phase",
            "non-static",
            "--target",
            "web",
            ".",
        ])
        .unwrap();

        assert_eq!(
            cli.command,
            Commands::Scan(ScanArgs {
                target: ScanTarget::Web,
                phase: ScanPhase::NonStatic,
                config: None,
                profile: None,
                path: PathBuf::from("."),
            })
        );
    }
}
