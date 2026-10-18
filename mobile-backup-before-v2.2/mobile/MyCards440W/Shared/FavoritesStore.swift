//
//  FavoritesStore.swift
//  TSM (The Sealed Market)
//
//  The products a person has hearted. One shared list, so the heart on a
//  product page and the heart on the shop grid always agree, and so there is
//  a Favorites screen and a "favorites only" filter.
//
//  Live mode keeps each person's list on this device (a small snapshot of
//  each product: name, brand, price at the time). Demo mode keeps it in memory.
//

import Foundation
import Combine

final class FavoritesStore: ObservableObject {

    /// Newest first.
    @Published private(set) var products: [Product] = []

    private let defaults: UserDefaults
    private var scope = "mock"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: Reading

    func isFavorite(_ id: UUID) -> Bool {
        return products.contains { $0.id == id }
    }

    // MARK: Changing

    func toggle(_ product: Product) {
        if let index = products.firstIndex(where: { $0.id == product.id }) {
            products.remove(at: index)
        } else {
            products.insert(product, at: 0)
        }
        save()
    }

    /// Replaces the saved copy of a product with a fresher one (new price, new sold-out state).
    func refresh(with product: Product) {
        guard let index = products.firstIndex(where: { $0.id == product.id }) else { return }
        products[index] = product
        save()
    }

    /// Switches to another person's list (or the demo list). Called when the
    /// signed-in person or the data source changes.
    func useScope(_ newScope: String) {
        guard newScope != scope else { return }
        scope = newScope
        products = load()
    }

    // MARK: Saving (Live mode only)

    private struct Snapshot: Codable {
        let id: String
        let name: String
        let brand: String
        let type: String
        let imageNames: [String]
        let lowestPrice: Double
        let sellerCount: Int
        let isFullySoldOut: Bool
    }

    private var storageKey: String { "favorites.\(scope)" }
    private var persists: Bool { scope.hasPrefix("live-") }

    private func save() {
        guard persists else { return }
        let snapshots = products.map {
            Snapshot(id: $0.id.uuidString,
                     name: $0.name,
                     brand: $0.brand,
                     type: $0.type.rawValue,
                     imageNames: $0.imageNames,
                     lowestPrice: $0.lowestPrice,
                     sellerCount: $0.sellerCount,
                     isFullySoldOut: $0.isFullySoldOut)
        }
        if let data = try? JSONEncoder().encode(snapshots) {
            defaults.set(data, forKey: storageKey)
        }
    }

    private func load() -> [Product] {
        guard persists,
              let data = defaults.data(forKey: storageKey),
              let snapshots = try? JSONDecoder().decode([Snapshot].self, from: data) else {
            return []
        }
        return snapshots.compactMap { snapshot -> Product? in
            guard let uuid = UUID(uuidString: snapshot.id) else { return nil }
            var product = Product(id: uuid,
                                  name: snapshot.name,
                                  brand: snapshot.brand,
                                  type: ProductType(rawValue: snapshot.type) ?? .other,
                                  imageNames: snapshot.imageNames,
                                  listings: [])
            product.serverLowestPrice = snapshot.lowestPrice
            product.serverSellerCount = snapshot.sellerCount
            product.serverIsFullySoldOut = snapshot.isFullySoldOut
            return product
        }
    }
}
