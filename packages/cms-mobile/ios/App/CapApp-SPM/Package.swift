// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.0"),
        .package(name: "CapacitorApp", path: "../../../../../node_modules/.pnpm/@capacitor+app@8.1.0_@capacitor+core@8.3.0/node_modules/@capacitor/app"),
        .package(name: "CapacitorPreferences", path: "../../../../../node_modules/.pnpm/@capacitor+preferences@8.0.1_@capacitor+core@8.3.0/node_modules/@capacitor/preferences"),
        .package(name: "CapacitorSplashScreen", path: "../../../../../node_modules/.pnpm/@capacitor+splash-screen@8.0.1_@capacitor+core@8.3.0/node_modules/@capacitor/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../../../../../node_modules/.pnpm/@capacitor+status-bar@8.0.2_@capacitor+core@8.3.0/node_modules/@capacitor/status-bar"),
        .package(name: "CapgoCapacitorNativeBiometric", path: "../../../../../node_modules/.pnpm/@capgo+capacitor-native-biometric@8.4.2_@capacitor+core@8.3.0/node_modules/@capgo/capacitor-native-biometric")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "CapgoCapacitorNativeBiometric", package: "CapgoCapacitorNativeBiometric")
            ]
        )
    ]
)
