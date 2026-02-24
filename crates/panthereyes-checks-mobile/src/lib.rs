use std::fs;
use std::path::{Path, PathBuf};

use panthereyes_core::{
    EngineError, Finding, ScanEngine, ScanReport, ScanRequest, Severity, TargetKind,
};

pub struct MobileChecksEngine {
    checks: Vec<Box<dyn MobileCheck>>,
}

impl Default for MobileChecksEngine {
    fn default() -> Self {
        Self {
            checks: vec![
                Box::new(IosAtsArbitraryLoadsCheck),
                Box::new(AndroidCleartextTrafficCheck),
                Box::new(AndroidDebuggableCheck),
            ],
        }
    }
}

impl ScanEngine for MobileChecksEngine {
    fn name(&self) -> &'static str {
        "panthereyes-checks-mobile"
    }

    fn target(&self) -> TargetKind {
        TargetKind::Mobile
    }

    fn scan(&self, request: &ScanRequest) -> Result<ScanReport, EngineError> {
        if request.target != TargetKind::Mobile {
            return Err(EngineError::InvalidRequest(format!(
                "mobile engine only supports target '{}', got '{}'",
                TargetKind::Mobile.as_str(),
                request.target.as_str()
            )));
        }

        let mut report = ScanReport::new(TargetKind::Mobile);
        let ctx = MobileScanContext::new(request.path.clone())?;

        for check in &self.checks {
            check.run(&ctx, &mut report)?;
        }

        report.recompute_status();
        Ok(report)
    }
}

pub fn scan_mobile_path(path: impl AsRef<Path>) -> Result<ScanReport, EngineError> {
    let request = ScanRequest::new(TargetKind::Mobile, path.as_ref());
    MobileChecksEngine::default().scan(&request)
}

// Kept for backward compatibility with older CLI code paths.
pub fn run_demo_mobile_checks(path: &str) -> ScanReport {
    scan_mobile_path(path).unwrap_or_else(|err| {
        let mut report = ScanReport::new(TargetKind::Mobile);
        report.push(Finding::new(
            "mobile.engine.error",
            "Falha ao executar checks mobile",
            Severity::High,
            TargetKind::Mobile,
            err.to_string(),
            "Revise permissões de leitura e o caminho informado.",
        ));
        report
    })
}

trait MobileCheck {
    fn run(&self, ctx: &MobileScanContext, report: &mut ScanReport) -> Result<(), EngineError>;
}

struct MobileScanContext {
    root: PathBuf,
    files: Vec<PathBuf>,
}

impl MobileScanContext {
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

    fn find_by_name(&self, file_name: &str) -> Vec<&PathBuf> {
        self.files
            .iter()
            .filter(|path| {
                path.file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case(file_name))
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

struct IosAtsArbitraryLoadsCheck;

impl MobileCheck for IosAtsArbitraryLoadsCheck {
    fn run(&self, ctx: &MobileScanContext, report: &mut ScanReport) -> Result<(), EngineError> {
        for plist_path in ctx.find_by_name("Info.plist") {
            let raw = ctx.read_to_string(plist_path)?;
            if contains_ios_ats_arbitrary_loads_enabled(&raw) {
                report.push(
                    Finding::new(
                        "mobile.ios.ats.arbitrary-loads-enabled",
                        "ATS permite carregamentos arbitrários",
                        Severity::High,
                        TargetKind::Ios,
                        "NSAllowsArbitraryLoads=true detectado no Info.plist.",
                        "Desabilite NSAllowsArbitraryLoads e configure exceções ATS específicas por domínio.",
                    )
                    .with_file(ctx.relative_path(plist_path)),
                );
            }
        }
        Ok(())
    }
}

struct AndroidCleartextTrafficCheck;

impl MobileCheck for AndroidCleartextTrafficCheck {
    fn run(&self, ctx: &MobileScanContext, report: &mut ScanReport) -> Result<(), EngineError> {
        for manifest_path in ctx.find_by_name("AndroidManifest.xml") {
            let raw = ctx.read_to_string(manifest_path)?;
            if contains_android_cleartext_enabled(&raw) {
                report.push(
                    Finding::new(
                        "mobile.android.cleartext-traffic-enabled",
                        "Cleartext traffic habilitado",
                        Severity::High,
                        TargetKind::Android,
                        "android:usesCleartextTraffic=\\\"true\\\" detectado no AndroidManifest.xml.",
                        "Desabilite cleartext traffic ou restrinja via Network Security Config para domínios específicos.",
                    )
                    .with_file(ctx.relative_path(manifest_path)),
                );
            }
        }
        Ok(())
    }
}

struct AndroidDebuggableCheck;

impl MobileCheck for AndroidDebuggableCheck {
    fn run(&self, ctx: &MobileScanContext, report: &mut ScanReport) -> Result<(), EngineError> {
        for manifest_path in ctx.find_by_name("AndroidManifest.xml") {
            let raw = ctx.read_to_string(manifest_path)?;
            if contains_android_debuggable_enabled(&raw) {
                report.push(
                    Finding::new(
                        "mobile.android.debuggable-enabled",
                        "Aplicação Android debuggable",
                        Severity::Medium,
                        TargetKind::Android,
                        "android:debuggable=\\\"true\\\" detectado no AndroidManifest.xml.",
                        "Garanta builds release com android:debuggable=false e revise configuração por variante.",
                    )
                    .with_file(ctx.relative_path(manifest_path)),
                );
            }
        }
        Ok(())
    }
}

fn contains_android_cleartext_enabled(manifest: &str) -> bool {
    manifest.contains("usesCleartextTraffic=\"true\"")
        || manifest.contains("usesCleartextTraffic='true'")
        || manifest.contains("android:usesCleartextTraffic=\"true\"")
        || manifest.contains("android:usesCleartextTraffic='true'")
}

fn contains_android_debuggable_enabled(manifest: &str) -> bool {
    manifest.contains("android:debuggable=\"true\"")
        || manifest.contains("android:debuggable='true'")
}

fn contains_ios_ats_arbitrary_loads_enabled(plist: &str) -> bool {
    let key_pos = plist.find("NSAllowsArbitraryLoads");
    let Some(key_pos) = key_pos else {
        return false;
    };

    let tail = &plist[key_pos..];
    tail.contains("<true/>") || tail.contains("<true />")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let pid = std::process::id();
        let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("{}-{}-{}-{}", prefix, pid, nanos, seq))
    }

    fn write_file(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create dirs");
        }
        fs::write(path, contents).expect("write file");
    }

    #[test]
    fn detects_ios_ats_arbitrary_loads() {
        let root = unique_temp_dir("panthereyes-mobile-ios-ats");
        let plist_path = root.join("ios/App/Info.plist");
        write_file(
            &plist_path,
            r#"
                <plist version="1.0">
                  <dict>
                    <key>NSAppTransportSecurity</key>
                    <dict>
                      <key>NSAllowsArbitraryLoads</key>
                      <true/>
                    </dict>
                  </dict>
                </plist>
            "#,
        );

        let report = scan_mobile_path(&root).expect("scan should succeed");
        let finding = report
            .findings
            .iter()
            .find(|finding| finding.id == "mobile.ios.ats.arbitrary-loads-enabled")
            .expect("ATS finding should exist");

        assert_eq!(finding.target, TargetKind::Ios);
        assert_eq!(finding.severity, Severity::High);
        assert_eq!(
            finding.file.as_deref(),
            Some(Path::new("ios/App/Info.plist"))
        );
        assert_eq!(report.status, panthereyes_core::ScanStatus::Block);

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn detects_android_cleartext_traffic() {
        let root = unique_temp_dir("panthereyes-mobile-android-cleartext");
        let manifest_path = root.join("android/app/src/main/AndroidManifest.xml");
        write_file(
            &manifest_path,
            r#"
                <manifest package="com.example.app" xmlns:android="http://schemas.android.com/apk/res/android">
                  <application android:usesCleartextTraffic="true" />
                </manifest>
            "#,
        );

        let report = scan_mobile_path(&root).expect("scan should succeed");
        let finding = report
            .findings
            .iter()
            .find(|finding| finding.id == "mobile.android.cleartext-traffic-enabled")
            .expect("cleartext finding should exist");

        assert_eq!(finding.target, TargetKind::Android);
        assert_eq!(finding.severity, Severity::High);
        assert_eq!(
            finding.file.as_deref(),
            Some(Path::new("android/app/src/main/AndroidManifest.xml"))
        );

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn detects_android_debuggable_manifest() {
        let root = unique_temp_dir("panthereyes-mobile-android-debug");
        let manifest_path = root.join("AndroidManifest.xml");
        write_file(
            &manifest_path,
            r#"<application android:debuggable="true"></application>"#,
        );

        let report = scan_mobile_path(&root).expect("scan should succeed");
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.id == "mobile.android.debuggable-enabled"));
        assert_eq!(report.status, panthereyes_core::ScanStatus::Warn);

        fs::remove_dir_all(root).ok();
    }
}
