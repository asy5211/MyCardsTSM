//
//  FavoriteSellersStore.swift
//  TSM (The Sealed Market)
//
//  The sellers a person has hearted (the heart next to a seller's name on a
//  product page). Live mode keeps the list on the TSM server, so it follows the
//  person to another phone; Demo mode keeps it in memory.
//
//  Hearting is instant on screen and is sent to the server in the background; if
//  the server says no, the heart goes back and the person is told why.
//

import Foundation
import Combine

/// One hearted seller, as the Favorites screen draws it.
struct FavoriteSeller: Identifiable, Equatable {
    let id: UUID
    var name: String
    var rating: Double
    var ratingCount: Int
    var salesCount: Int
    var isTsm: Bool
    /// How many offers they have for sale right now (live server; 0 in demo).
    var liveListingCount: Int
}

// MARK: - Server shapes

struct FavoriteSellerDTO: Decodable {
    let id: String
    let displayName: String
    let rating: Double
    let ratingCount: Int
    let salesCount: Int
    let isTsm: Bool
    let liveListingCount: Int
    let favoritedAt: String?
}

struct FavoriteSellersPageDTO: Decodable {
    let items: [FavoriteSellerDTO]
}

struct FavoriteSellerResultDTO: Decodable {
    let sellerId: String
    let isFavorite: Bool
}

extension FavoriteSellerDTO {
    func toFavoriteSeller() -> FavoriteSeller? {
        guard let uuid = UUID(uuidString: id) else { return nil }
        return FavoriteSeller(id: uuid, name: displayName, rating: rating, ratingCount: ratingCount,
                              salesCount: salesCount, isTsm: isTsm, liveListingCount: liveListingCount)
    }
}

extension FavoriteSeller {
    init(_ seller: Seller) {
        self.init(id: seller.id, name: seller.name, rating: seller.rating, ratingCount: seller.ratingCount,
                  salesCount: seller.salesCount, isTsm: seller.isTsm, liveListingCount: 0)
    }
}

// MARK: - Store

final class FavoriteSellersStore: ObservableObject {

    /// Newest first.
    @Published private(set) var sellers: [FavoriteSeller] = []

    private var scope = "mock"

    // MARK: Reading

    func isFavorite(_ id: UUID) -> Bool {
        return sellers.contains { $0.id == id }
    }

    // MARK: Switching person or data source

    /// Switches to another person's list (or the demo list). Called when the signed-in person or the data source changes.
    func useScope(_ newScope: String) {
        guard newScope != scope else { return }
        scope = newScope
        sellers = []
    }

    func clear() {
        sellers = []
    }

    // MARK: Loading (Live mode)

    /// Re-reads the person's hearted sellers from the server.
    func refresh(using session: AppSession) async {
        guard session.isLive, TokenStore.load() != nil else {
            if session.isLive { sellers = [] }
            return
        }
        do {
            let page: FavoriteSellersPageDTO = try await session.api.get("/api/me/favorite-sellers", query: ["limit": "200"])
            sellers = page.items.compactMap { $0.toFavoriteSeller() }
        } catch is CancellationError {
            // Left the screen; the next refresh will do it.
        } catch {
            session.noteSessionProblem(error)
        }
    }

    /// A product page already says which sellers are hearted; add any this list doesn't know yet.
    func merge(from listings: [Listing]) {
        for listing in listings where listing.seller.isFavorite && !isFavorite(listing.seller.id) {
            sellers.insert(FavoriteSeller(listing.seller), at: 0)
        }
    }

    // MARK: Changing

    /// Hearts or un-hearts a seller. Throws (and puts the heart back) if the server refuses.
    func toggle(_ seller: Seller, using session: AppSession) async throws {
        if session.isLive, TokenStore.load() == nil {
            throw APIError.unexpected("Sign in to save your favorite sellers.")
        }
        let wasFavorite = isFavorite(seller.id)
        let before = sellers

        // Instant on screen.
        if wasFavorite {
            sellers.removeAll { $0.id == seller.id }
        } else {
            sellers.insert(FavoriteSeller(seller), at: 0)
        }

        guard session.isLive else { return }
        let path = "/api/me/favorite-sellers/\(seller.id.uuidString.lowercased())"
        do {
            if wasFavorite {
                try await session.api.delete(path)
            } else {
                let _: FavoriteSellerResultDTO = try await session.api.put(path, body: [:])
            }
        } catch {
            sellers = before
            if !(error is CancellationError) { session.noteSessionProblem(error) }
            throw error
        }
    }

    /// Removes a seller from the list (the heart on the Favorites screen).
    func remove(_ favorite: FavoriteSeller, using session: AppSession) async throws {
        let seller = Seller(id: favorite.id, name: favorite.name, rating: favorite.rating,
                            salesCount: favorite.salesCount, ratingCount: favorite.ratingCount, isTsm: favorite.isTsm)
        guard isFavorite(favorite.id) else { return }
        try await toggle(seller, using: session)
    }
}
