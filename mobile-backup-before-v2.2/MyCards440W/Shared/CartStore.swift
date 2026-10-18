//
//  CartStore.swift
//  TSM (The Sealed Market)
//

import Foundation
import Combine

/// App-wide cart state, injected once at the root as an `@EnvironmentObject`.
/// Previously ProductDetailView's "Add to Cart" did nothing, and CartView
/// held its own disconnected local copy of sample data — this makes them
/// the same cart.
final class CartStore: ObservableObject {
    @Published private(set) var lines: [CartLine] = []

    var totalItemCount: Int { lines.reduce(0) { $0 + $1.quantity } }
    var subtotal: Double { lines.reduce(0) { $0 + $1.lineTotal } }

    /// Adds a listing to the cart, or increments quantity if that exact
    /// listing is already in the cart.
    func add(product: Product, listing: Listing, quantity: Int = 1) {
        if let idx = lines.firstIndex(where: { $0.listing.id == listing.id }) {
            lines[idx].quantity += quantity
        } else {
            lines.append(CartLine(product: product, listing: listing, quantity: quantity))
        }
    }

    func setQuantity(for lineID: UUID, to quantity: Int) {
        guard let idx = lines.firstIndex(where: { $0.id == lineID }) else { return }
        lines[idx].quantity = max(1, quantity)
    }

    func remove(_ line: CartLine) {
        lines.removeAll { $0.id == line.id }
    }

    func removeAll() {
        lines.removeAll()
    }
}
