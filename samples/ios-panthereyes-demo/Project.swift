import ProjectDescription

let project = Project(
    name: "PantherEyesIOSDemo",
    targets: [
        .target(
            name: "PantherEyesIOSDemo",
            destinations: .iOS,
            product: .app,
            bundleId: "com.panthereyes.samples.iosdemo",
            deploymentTargets: .iOS("16.0"),
            infoPlist: .file(path: "ios/Resources/Info.plist"),
            sources: ["ios/Sources/**"],
            // Info.plist is provided via `infoPlist` above and must not be copied as a bundled resource.
            resources: []
        ),
        .target(
            name: "PantherEyesIOSDemoTests",
            destinations: .iOS,
            product: .unitTests,
            bundleId: "com.panthereyes.samples.iosdemo.tests",
            deploymentTargets: .iOS("16.0"),
            infoPlist: .default,
            sources: ["ios/Tests/PantherEyesPolicyTests/**"],
            resources: ["ios/Tests/Fixtures/**"],
            dependencies: [.target(name: "PantherEyesIOSDemo")]
        )
    ]
)
