import SwiftUI

@main
struct PantherEyesIOSDemoApp: App {
    @StateObject private var viewModel = PantherEyesLabViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(viewModel: viewModel)
        }
    }
}
