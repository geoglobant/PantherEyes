use std::error::Error;
use std::fmt::{Display, Formatter};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetKind {
    Web,
    Mobile,
    Ios,
    Android,
}

impl TargetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Web => "web",
            Self::Mobile => "mobile",
            Self::Ios => "ios",
            Self::Android => "android",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

impl Severity {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanStatus {
    Pass,
    Warn,
    Block,
}

impl ScanStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pass => "pass",
            Self::Warn => "warn",
            Self::Block => "block",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub id: String,
    pub title: String,
    pub severity: Severity,
    pub target: TargetKind,
    pub file: Option<PathBuf>,
    pub message: String,
    pub remediation: String,
}

impl Finding {
    pub fn new(
        id: impl Into<String>,
        title: impl Into<String>,
        severity: Severity,
        target: TargetKind,
        message: impl Into<String>,
        remediation: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            severity,
            target,
            file: None,
            message: message.into(),
            remediation: remediation.into(),
        }
    }

    pub fn with_file(mut self, file: impl Into<PathBuf>) -> Self {
        self.file = Some(file.into());
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyResult {
    pub status: ScanStatus,
    pub blocking_severity: Severity,
}

impl Default for PolicyResult {
    fn default() -> Self {
        Self {
            status: ScanStatus::Pass,
            blocking_severity: Severity::High,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanReport {
    pub target: TargetKind,
    pub findings: Vec<Finding>,
    pub status: ScanStatus,
    pub policy: PolicyResult,
}

impl ScanReport {
    pub fn new(target: TargetKind) -> Self {
        let policy = PolicyResult::default();
        Self {
            target,
            findings: Vec::new(),
            status: policy.status,
            policy,
        }
    }

    pub fn with_policy(mut self, policy: PolicyResult) -> Self {
        self.policy = policy;
        self.status = derive_status(&self.findings, self.policy.blocking_severity);
        self
    }

    pub fn push(&mut self, finding: Finding) {
        self.findings.push(finding);
        self.status = derive_status(&self.findings, self.policy.blocking_severity);
        self.policy.status = self.status;
    }

    pub fn recompute_status(&mut self) {
        self.status = derive_status(&self.findings, self.policy.blocking_severity);
        self.policy.status = self.status;
    }
}

fn derive_status(findings: &[Finding], blocking_severity: Severity) -> ScanStatus {
    if findings.is_empty() {
        return ScanStatus::Pass;
    }

    if findings
        .iter()
        .any(|finding| finding.severity >= blocking_severity)
    {
        return ScanStatus::Block;
    }

    ScanStatus::Warn
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanRequest {
    pub target: TargetKind,
    pub path: PathBuf,
}

impl ScanRequest {
    pub fn new(target: TargetKind, path: impl Into<PathBuf>) -> Self {
        Self {
            target,
            path: path.into(),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[derive(Debug)]
pub enum EngineError {
    InvalidRequest(String),
    Io {
        path: Option<PathBuf>,
        source: std::io::Error,
    },
}

impl EngineError {
    pub fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Self::Io {
            path: Some(path.into()),
            source,
        }
    }
}

impl Display for EngineError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message) => write!(f, "{message}"),
            Self::Io { path, source } => match path {
                Some(path) => write!(f, "I/O error at {}: {source}", path.display()),
                None => write!(f, "I/O error: {source}"),
            },
        }
    }
}

impl Error for EngineError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidRequest(_) => None,
            Self::Io { source, .. } => Some(source),
        }
    }
}

pub trait ScanEngine {
    fn name(&self) -> &'static str;
    fn target(&self) -> TargetKind;
    fn scan(&self, request: &ScanRequest) -> Result<ScanReport, EngineError>;
}
