import XCTest

final class PantherEyesPolicyStagingTests: XCTestCase {
    struct PolicyRule {
        let ruleId: String
        let enabled: Bool
        let effectiveSeverity: String
    }

    private let mode = "warn"
    private let failOnSeverity = "high"
    private let policyRules: [PolicyRule] = [
        PolicyRule(ruleId: "mobile.android.cleartext.disabled", enabled: true, effectiveSeverity: "high"),
        PolicyRule(ruleId: "mobile.debug.disabled", enabled: true, effectiveSeverity: "medium"),
        PolicyRule(ruleId: "mobile.ios.ats.required", enabled: true, effectiveSeverity: "high")
    ]
    private let directives: [String: String] = [
        "minScore": "85",
        "requireApprovalForExceptions": "true"
    ]

    func testPolicyMetadata_staging() {
        XCTAssertEqual(mode, "warn")
        XCTAssertEqual(failOnSeverity, "high")
        XCTAssertGreaterThanOrEqual(policyRules.count, 3)
    }

    func testDirectives_staging() {
        XCTAssertEqual(directives["minScore"], "85")
        XCTAssertEqual(directives["requireApprovalForExceptions"], "true")
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
