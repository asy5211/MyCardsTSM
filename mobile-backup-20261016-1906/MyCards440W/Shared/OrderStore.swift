//
//  OrderStore.swift
//  TSM (The Sealed Market)
//
//  Orders placed from this app. For now checkout is a demo (no card is
//  charged and nothing is sent to the server), so these live in memory and
//  are cleared when the app closes. Real orders and Shopify payments replace
//  this when the orders API is built.
//

import Foundation
import Combine

final class OrderStore: ObservableObject {
    @Published private(set) var orders: [Order] = []

    func order(withID id: UUID) -> Order? {
        return orders.first { $0.id == id }
    }

    /// Turns checkout lines into an order and records it (newest first).
    @discardableResult
    func place(lines: [CartLine], address: ShippingAddress) -> Order {
        var number = "ORD-\(Int.random(in: 30000...99999))"
        while orders.contains(where: { $0.orderNumber == number }) {
            number = "ORD-\(Int.random(in: 30000...99999))"
        }
        let items = lines.map {
            OrderItem(product: $0.product, listing: $0.listing, quantity: $0.quantity)
        }
        let order = Order(id: UUID(),
                          orderNumber: number,
                          items: items,
                          status: .placed,
                          orderDate: Date(),
                          trackingNumber: nil,
                          hasBeenReviewed: false,
                          shippingAddress: address)
        orders.insert(order, at: 0)
        return order
    }

    /// Demo orders belong to one person; forget them when someone else signs in.
    func clear() {
        orders = []
    }
}
