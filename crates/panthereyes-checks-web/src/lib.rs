use std::fs;
use std::path::{Path, PathBuf};

use panthereyes_core::{
    EngineError, Finding, ScanEngine, ScanReport, ScanRequest, Severity, TargetKind,
};

pub struct WebChecksEngine {
    checks: Vec<Box<dyn WebCheck>>,
}

impl Default for WebChecksEngine {
    fn default() -> Self {
        Self {
            checks: vec![
                Box::new(NginxCspHeaderCheck),
                Box::new(NginxHstsHeaderCheck),
                Box::new(PreparedPlaceholderCheck),
            ],
        }
    }
}

impl ScanEngine for WebChecksEngine {
    fn name(&self) -> &'static str {
        "panthereyes-checks-web"
    }

    fn target(&self) -> TargetKind {
        TargetKind::Web
    }

    fn scan(&self, request: &ScanRequest) -> Result<ScanReport, EngineError> {
        if request.target != TargetKind::Web {
            return Err(EngineError::InvalidRequest(format!(
                "web engine only supports target '{}', got '{}'",
                TargetKind::Web.as_str(),
                request.target.as_str()
            )));
        }

        let mut report = ScanReport::new(TargetKind::Web);
        let ctx = WebScanContext::new(request.path.clone())?;

        for check in &self.checks {
            check.run(&ctx, &mut report)?;
        }

        report.recompute_status();
        Ok(report)
    }
}

pub fn scan_web_path(path: impl AsRef<Path>) -> Result<ScanReport, EngineError> {
    let request = ScanRequest::new(TargetKind::Web, path.as_ref());
    WebChecksEngine::default().scan(&request)
}

// Kept for backward compatibility with older CLI code paths.
pub fn run_demo_web_checks(path: &str) -> ScanReport {
    scan_web_path(path).unwrap_or_else(|err| {
        let mut report = ScanReport::new(TargetKind::Web);
        report.push(Finding::new(
            "web.engine.error",
            "Falha ao executar checks web",
            Severity::High,
            TargetKind::Web,
            err.to_string(),
            "Revise o caminho informado e o acesso aos arquivos de configuracao web.",
        ));
        report
    })
}

trait WebCheck {
    fn run(&self, ctx: &WebScanContext, report: &mut ScanReport) -> Result<(), EngineError>;
}

struct WebScanContext {
    root: PathBuf,
    files: Vec<PathBuf>,
}

impl WebScanContext {
    fn new(root: PathBuf) -> Result<Self, EngineError> {
        if !root.exists() {
            return Err(EngineError::InvalidRequest(format!(
                "scan path not found: {}",
                root.display()
            )));
        }

        let mut files = Vec::new();
        collect_files(&root, &mut files)?;
        Ok(Self { root, files })
    }

    fn candidate_config_files(&self) -> Vec<&PathBuf> {
        self.files
            .iter()
            .filter(|path| {
                let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
                    return false;
                };
                let lower = name.to_ascii_lowercase();
                lower == "nginx.conf"
                    || lower.ends_with(".conf")
                    || lower == "caddyfile"
                    || lower == "vercel.json"
                    || lower == "netlify.toml"
            })
            .collect()
    }

    fn read_to_string(&self, path: &Path) -> Result<String, EngineError> {
        fs::read_to_string(path).map_err(|source| EngineError::io(path.to_path_buf(), source))
    }

    fn relative_path(&self, path: &Path) -> PathBuf {
        path.strip_prefix(&self.root)
            .map_or_else(|_| path.to_path_buf(), Path::to_path_buf)
    }
}

fn collect_files(root: &Path, out: &mut Vec<PathBuf>) -> Result<(), EngineError> {
    if root.is_file() {
        out.push(root.to_path_buf());
        return Ok(());
    }

    let entries =
        fs::read_dir(root).map_err(|source| EngineError::io(root.to_path_buf(), source))?;
    for entry in entries {
        let entry = entry.map_err(|source| EngineError::io(root.to_path_buf(), source))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|source| EngineError::io(path.clone(), source))?;

        if file_type.is_dir() {
            collect_files(&path, out)?;
        } else if file_type.is_file() {
            out.push(path);
        }
    }

    Ok(())
}

struct NginxCspHeaderCheck;

impl WebCheck for NginxCspHeaderCheck {
    fn run(&self, ctx: &WebScanContext, report: &mut ScanReport) -> Result<(), EngineError> {
        for config in ctx.candidate_config_files() {
            let raw = ctx.read_to_string(config)?;
            if looks_like_nginx_config(&raw) && !raw.contains("Content-Security-Policy") {
                report.push(
                    Finding::new(
                        "web.headers.csp.missing",
                        "Content-Security-Policy ausente",
                        Severity::High,
                        TargetKind::Web,
                        "Arquivo de configuracao web aparenta nao definir header Content-Security-Policy.",
                        "Adicione um header CSP apropriado (ex.: via add_header no Nginx) e ajuste por app/rota.",
                    )
                    .with_file(ctx.relative_path(config)),
                );
            }
        }
        Ok(())
    }
}

struct NginxHstsHeaderCheck;

impl WebCheck for NginxHstsHeaderCheck {
    fn run(&self, ctx: &WebScanContext, report: &mut ScanReport) -> Result<(), EngineError> {
        for config in ctx.candidate_config_files() {
            let raw = ctx.read_to_string(config)?;
            if looks_like_nginx_config(&raw)
                && raw.contains("listen 443")
                && !raw.contains("Strict-Transport-Security")
            {
                report.push(
                    Finding::new(
                        "web.headers.hsts.missing",
                        "HSTS ausente em listener HTTPS",
                        Severity::Medium,
                        TargetKind::Web,
                        "Configuracao com listener HTTPS encontrada sem header Strict-Transport-Security.",
                        "Configure HSTS (Strict-Transport-Security) com max-age adequado e includeSubDomains quando aplicavel.",
                    )
                    .with_file(ctx.relative_path(config)),
                );
            }
        }
        Ok(())
    }
}

struct PreparedPlaceholderCheck;

impl WebCheck for PreparedPlaceholderCheck {
    fn run(&self, _ctx: &WebScanContext, _report: &mut ScanReport) -> Result<(), EngineError> {
        // Reserved for future checks (framework-specific config, IaC, CDN/WAF, etc.)
        Ok(())
    }
}

fn looks_like_nginx_config(raw: &str) -> bool {
    raw.contains("server {") || raw.contains("http {") || raw.contains("location /")
}
