import SwiftUI

struct ContentView: View {
    @ObservedObject var viewModel: PantherEyesLabViewModel

    var body: some View {
        PantherEyesLabView(viewModel: viewModel)
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView(viewModel: PantherEyesLabViewModel())
    }
}
