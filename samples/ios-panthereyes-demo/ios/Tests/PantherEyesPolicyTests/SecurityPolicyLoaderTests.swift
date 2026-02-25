import XCTest

final class SecurityPolicyLoaderTests: XCTestCase {
    func testLoadsProdPolicyFixture() throws {
        let policy = try SecurityPolicyLoader.load(env: "prod")

        XCTAssertEqual(policy.env, "prod")
        XCTAssertEqual(policy.mode, "enforce")
        XCTAssertEqual(policy.failOnSeverity, "medium")
        XCTAssertEqual(policy.directives["allowDemoCleartext"], "false")
    }

    func testProdIsStricterThanDev() throws {
        let dev = try SecurityPolicyLoader.load(env: "dev")
        let prod = try SecurityPolicyLoader.load(env: "prod")

        XCTAssertEqual(dev.mode, "audit")
        XCTAssertEqual(prod.mode, "enforce")
        XCTAssertNotEqual(dev.failOnSeverity, prod.failOnSeverity)
    }
}
