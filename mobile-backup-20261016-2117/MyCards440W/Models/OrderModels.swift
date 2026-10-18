//
//  OrderModels.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import Foundation

// MARK: - Cart

/// One line in the shopping cart — a specific listing (seller + source) at
/// a given quantity, tied back to its parent product.
struct CartLine: Identifiable {
    let id: UUID
    let product: Product
    let listing: Listing
    var quantity: Int

    var lineTotal: Double { listing.price * Double(quantity) }

    init(id: UUID = UUID(), product: Product, listing: Listing, quantity: Int = 1) {
        self.id = id
        self.product = product
        self.listing = listing
        self.quantity = quantity
    }
}

// MARK: - Orders

enum OrderStatus: String, CaseIterable {
    case placed = "Placed"
    case processing = "Processing"
    case shipped = "Shipped"
    case delivered = "Delivered"
    case cancelled = "Cancelled"

    var color: OrderStatusColor {
        switch self {
        case .placed: return .neutral
        case .processing: return .accent
        case .shipped: return .accent
        case .delivered: return .success
        case .cancelled: return .danger
        }
    }
}

enum OrderStatusColor { case neutral, accent, success, danger }

struct OrderItem: Identifiable {
    let id: UUID
    let product: Product
    let listing: Listing
    let quantity: Int

    init(id: UUID = UUID(), product: Product, listing: Listing, quantity: Int) {
        self.id = id
        self.product = product
        self.listing = listing
        self.quantity = quantity
    }
}

struct Order: Identifiable {
    let id: UUID
    let orderNumber: String        // "ORD-28491"
    let items: [OrderItem]
    let status: OrderStatus
    let orderDate: Date
    /// Filled in by the seller once they ship — empty until then.
    let trackingNumber: String?
    let hasBeenReviewed: Bool
    /// Where it ships. nil on the built-in sample orders.
    var shippingAddress: ShippingAddress? = nil

    var total: Double {
        items.reduce(0) { $0 + ($1.listing.price * Double($1.quantity)) }
    }
}

extension Order: Hashable {
    static func == (lhs: Order, rhs: Order) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Sample data

extension SampleData {
    static func makeCartLines() -> [CartLine] {
        let product = sampleProducts[0]
        return [
            CartLine(product: product, listing: product.sortedListings.first!, quantity: 1)
        ]
    }

    static let sampleOrders: [Order] = [
        Order(
            id: UUID(),
            orderNumber: "ORD-28491",
            items: [OrderItem(product: sampleProducts[0],
                               listing: sampleProducts[0].listings[0],
                               quantity: 1)],
            status: .delivered,
            orderDate: Calendar.current.date(byAdding: .day, value: -6, to: Date())!,
            trackingNumber: "1Z999AA10123456784",
            hasBeenReviewed: false
        ),
        Order(
            id: UUID(),
            orderNumber: "ORD-28510",
            items: [OrderItem(product: sampleProducts[1],
                               listing: sampleProducts[1].listings[0],
                               quantity: 1)],
            status: .shipped,
            orderDate: Calendar.current.date(byAdding: .day, value: -2, to: Date())!,
            trackingNumber: "1Z999AA10198765432",
            hasBeenReviewed: false
        ),
        Order(
            id: UUID(),
            orderNumber: "ORD-28522",
            items: [OrderItem(product: sampleProducts[2],
                               listing: sampleProducts[2].listings[0],
                               quantity: 3)],
            status: .processing,
            orderDate: Date(),
            trackingNumber: nil,
            hasBeenReviewed: false
        )
    ]
}
