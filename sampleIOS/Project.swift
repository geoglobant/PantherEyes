import ProjectDescription

let project = Project(
    name: "PantherEyesSampleIOS",
    targets: [
        .target(
            name: "PantherEyesSampleIOS",
            destinations: .iOS,
            product: .app,
            bundleId: "com.panthereyes.sampleios",
            deploymentTargets: .iOS("16.0"),
            infoPlist: .default,
            sources: ["ios/Sources/**"],
            resources: []
        ),
        .target(
            name: "PantherEyesPolicyTests",
            destinations: .iOS,
            product: .unitTests,
            bundleId: "com.panthereyes.sampleios.tests",
            deploymentTargets: .iOS("16.0"),
            infoPlist: .default,
            sources: ["ios/Tests/**"],
            resources: [],
            dependencies: [.target(name: "PantherEyesSampleIOS")]
        )
    ]
)
