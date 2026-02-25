import XCTest

final class PantherEyesPolicyProdTests: XCTestCase {
    struct PolicyRule {
        let ruleId: String
        let enabled: Bool
        let effectiveSeverity: String
    }

    private let mode = "enforce"
    private let failOnSeverity = "medium"
    private let policyRules: [PolicyRule] = [
        PolicyRule(ruleId: "mobile.ios.ats.arbitrary-loads-enabled", enabled: true, effectiveSeverity: "critical"),
        PolicyRule(ruleId: "mobile.ios.hardcoded-fake-secret", enabled: true, effectiveSeverity: "high")
    ]
    private let directives: [String: String] = [
        "allowDemoCleartext": "false",
        "minScore": "95",
        "networkProfile": "\"strict\"",
        "platform": "\"ios\"",
        "requireExceptionApproval": "true",
        "requireTlsEverywhere": "true",
        "sampleEnvironmentLabel": "\"ios-prod\""
    ]

    func testPolicyMetadata_prod() {
        XCTAssertEqual(mode, "enforce")
        XCTAssertEqual(failOnSeverity, "medium")
        XCTAssertGreaterThanOrEqual(policyRules.count, 2)
    }

    func testDirectives_prod() {
        XCTAssertEqual(directives["allowDemoCleartext"], "false")
        XCTAssertEqual(directives["minScore"], "95")
        XCTAssertEqual(directives["networkProfile"], "\"strict\"")
        XCTAssertEqual(directives["platform"], "\"ios\"")
        XCTAssertEqual(directives["requireExceptionApproval"], "true")
        XCTAssertEqual(directives["requireTlsEverywhere"], "true")
        XCTAssertEqual(directives["sampleEnvironmentLabel"], "\"ios-prod\"")
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
