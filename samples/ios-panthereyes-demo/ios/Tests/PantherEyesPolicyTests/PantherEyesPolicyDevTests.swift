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
        PolicyRule(ruleId: "mobile.ios.ats.arbitrary-loads-enabled", enabled: true, effectiveSeverity: "medium"),
        PolicyRule(ruleId: "mobile.ios.hardcoded-fake-secret", enabled: true, effectiveSeverity: "medium")
    ]
    private let directives: [String: String] = [
        "allowDemoCleartext": "true",
        "minScore": "60",
        "networkProfile": "\"relaxed\"",
        "platform": "\"ios\"",
        "requireExceptionApproval": "true",
        "sampleEnvironmentLabel": "\"ios-dev\""
    ]

    func testPolicyMetadata_dev() {
        XCTAssertEqual(mode, "audit")
        XCTAssertEqual(failOnSeverity, "critical")
        XCTAssertGreaterThanOrEqual(policyRules.count, 2)
    }

    func testDirectives_dev() {
        XCTAssertEqual(directives["allowDemoCleartext"], "true")
        XCTAssertEqual(directives["minScore"], "60")
        XCTAssertEqual(directives["networkProfile"], "\"relaxed\"")
        XCTAssertEqual(directives["platform"], "\"ios\"")
        XCTAssertEqual(directives["requireExceptionApproval"], "true")
        XCTAssertEqual(directives["sampleEnvironmentLabel"], "\"ios-dev\"")
    }

    func testRule_mobile_ios_ats_arbitrary_loads_enabled_isPresent() {
        let rules = Set(policyRules.map(\.ruleId))
        XCTAssertTrue(rules.contains("mobile.ios.ats.arbitrary-loads-enabled"))
    }

    func testRule_mobile_ios_hardcoded_fake_secret_isPresent() {
        let rules = Set(policyRules.map(\.ruleId))
        XCTAssertTrue(rules.contains("mobile.ios.hardcoded-fake-secret"))
    }
}
