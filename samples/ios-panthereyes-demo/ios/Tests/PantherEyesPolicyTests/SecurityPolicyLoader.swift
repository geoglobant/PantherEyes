import Foundation

struct LoadedSecurityPolicy: Decodable {
    let env: String
    let mode: String
    let failOnSeverity: String
    let directives: [String: String]
}

enum SecurityPolicyLoaderError: Error {
    case missingFixture(String)
    case invalidData(String)
}

enum SecurityPolicyLoader {
    static func load(env: String, bundle: Bundle = .moduleCompatible) throws -> LoadedSecurityPolicy {
        guard let url = bundle.url(forResource: env, withExtension: "json", subdirectory: "policy") else {
            throw SecurityPolicyLoaderError.missingFixture(env)
        }

        let data = try Data(contentsOf: url)
        do {
            return try JSONDecoder().decode(LoadedSecurityPolicy.self, from: data)
        } catch {
            throw SecurityPolicyLoaderError.invalidData(error.localizedDescription)
        }
    }
}

private final class BundleFinder {}

private extension Bundle {
    static var moduleCompatible: Bundle {
        #if SWIFT_PACKAGE
        return .module
        #else
        return Bundle(for: BundleFinder.self)
        #endif
    }
}
