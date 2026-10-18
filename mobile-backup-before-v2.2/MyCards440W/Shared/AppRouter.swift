//
//  AppRouter.swift
//  TSM (The Sealed Market)
//
//  Lets any screen move around the app: switch tabs, or push something onto
//  the Home tab's stack (the cart, checkout, favorites...). Home's
//  NavigationStack is bound to `path`, so "Buy Now" can jump straight to
//  checkout and a finished order can clear the stack back to Home.
//

import SwiftUI
import Combine

/// Everything that can be pushed onto Home's stack by value. The destinations
/// for these are registered once, in HomeView.
enum HomeRoute: Hashable {
    case cart
    case search(String)
    case favorites
    case notifications
    case checkout(CheckoutRequest)
    case orderConfirmation(UUID)
}

/// What is being bought: the whole cart, or a single "Buy Now" listing.
struct CheckoutRequest: Hashable {
    let id = UUID()
    let lines: [CartLine]
    /// True when this is the cart, so a placed order empties it.
    let clearsCart: Bool

    static func == (lhs: CheckoutRequest, rhs: CheckoutRequest) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

final class AppRouter: ObservableObject {
    @Published var tab: AppTab = .home
    @Published var path = NavigationPath()

    /// Back to the Home screen itself.
    func popToHome() {
        path = NavigationPath()
    }

    /// Open something on the Home tab, replacing whatever was pushed there.
    func showOnHome(_ route: HomeRoute) {
        path = NavigationPath([route])
        tab = .home
    }
}
