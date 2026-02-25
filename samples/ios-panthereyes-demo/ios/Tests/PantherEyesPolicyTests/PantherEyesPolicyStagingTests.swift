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
        PolicyRule(ruleId: "mobile.ios.ats.arbitrary-loads-enabled", enabled: true, effectiveSeverity: "high"),
        PolicyRule(ruleId: "mobile.ios.hardcoded-fake-secret", enabled: true, effectiveSeverity: "medium")
    ]
    private let directives: [String: String] = [
        "allowDemoCleartext": "false",
        "minScore": "80",
        "networkProfile": "\"restricted\"",
        "platform": "\"ios\"",
        "requireExceptionApproval": "true",
        "sampleEnvironmentLabel": "\"ios-staging\""
    ]

    func testPolicyMetadata_staging() {
        XCTAssertEqual(mode, "warn")
        XCTAssertEqual(failOnSeverity, "high")
        XCTAssertGreaterThanOrEqual(policyRules.count, 2)
    }

    func testDirectives_staging() {
        XCTAssertEqual(directives["allowDemoCleartext"], "false")
        XCTAssertEqual(directives["minScore"], "80")
        XCTAssertEqual(directives["networkProfile"], "\"restricted\"")
        XCTAssertEqual(directives["platform"], "\"ios\"")
        XCTAssertEqual(directives["requireExceptionApproval"], "true")
        XCTAssertEqual(directives["sampleEnvironmentLabel"], "\"ios-staging\"")
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
