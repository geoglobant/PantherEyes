import XCTest

final class PantherEyesPolicyDevTests: XCTestCase {
    struct PolicyRule {
        let ruleId: String
        let enabled: Bool
        let effectiveSeverity: String
    }

    private let mode = "audit"
    private let failOnSeverity = "critical"
    private let policyRules: [PolicyRule] = [
        PolicyRule(ruleId: "mobile.android.cleartext.disabled", enabled: true, effectiveSeverity: "high"),
        PolicyRule(ruleId: "mobile.debug.disabled", enabled: true, effectiveSeverity: "medium"),
        PolicyRule(ruleId: "mobile.ios.ats.required", enabled: true, effectiveSeverity: "high")
    ]
    private let directives: [String: String] = [
        "minScore": "60",
        "requireApprovalForExceptions": "true",
        "sampleRate": "0.25"
    ]

    func testPolicyMetadata_dev() {
        XCTAssertEqual(mode, "audit")
        XCTAssertEqual(failOnSeverity, "critical")
        XCTAssertGreaterThanOrEqual(policyRules.count, 3)
    }

    func testDirectives_dev() {
        XCTAssertEqual(directives["minScore"], "60")
        XCTAssertEqual(directives["requireApprovalForExceptions"], "true")
        XCTAssertEqual(directives["sampleRate"], "0.25")
    }

    func testRule_mobile_android_cleartext_disabled_isPresent() {
        let rules = Set(policyRules.map(\.ruleId))
        XCTAssertTrue(rules.contains("mobile.android.cleartext.disabled"))
    }

    func testRule_mobile_debug_disabled_isPresent() {
        let rules = Set(policyRules.map(\.ruleId))
        XCTAssertTrue(rules.contains("mobile.debug.disabled"))
    }

    func testRule_mobile_ios_ats_required_isPresent() {
        let rules = Set(policyRules.map(\.ruleId))
        XCTAssertTrue(rules.contains("mobile.ios.ats.required"))
    }
}
