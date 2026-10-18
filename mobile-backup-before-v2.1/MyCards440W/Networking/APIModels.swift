//
//  APIModels.swift
//  TSM (The Sealed Market)
//
//  The JSON shapes the server sends, plus the conversions into the app's own
//  models (Brand, Product, Listing, Seller). Prices arrive as integer cents.
//

import Foundation

// MARK: - Catalog

struct BrandDTO: Decodable {
    let id: String
    let name: String
}

struct ProductSummaryDTO: Decodable {
    let id: String
    let name: String
    let brand: String
    let type: String
    let thumbnailKey: String?
    let lowestPriceCents: Int?
    let sellerCount: Int
    let isFullySoldOut: Bool
}

struct ProductListDTO: Decodable {
    let items: [ProductSummaryDTO]
    let total: Int
    let limit: Int
    let offset: Int
}

struct ProductImageDTO: Decodable {
    let slot: Int
    let imageKey: String
}

struct ListingSellerDTO: Decodable {
    let id: String
    let displayName: String
    let rating: Double
    let salesCount: Int
    let isVerified: Bool
}

struct ListingDTO: Decodable {
    let id: String
    let priceCents: Int
    let source: String
    let boxPosition: String?
    let condition: String?
    let quantityAvailable: Int
    let isMine: Bool
    let seller: ListingSellerDTO
}

struct ProductDetailDTO: Decodable {
    let id: String
    let name: String
    let brand: String
    let type: String
    let description: String?
    let thumbnailKey: String?
    let images: [ProductImageDTO]
    let lowestPriceCents: Int?
    let sellerCount: Int
    let isFullySoldOut: Bool
    let listings: [ListingDTO]
}

// MARK: - Accounts

struct UserDTO: Decodable {
    let id: String
    let username: String
    let email: String
    let phone: String?
    let avatarKey: String?
    let emailVerified: Bool
    let createdAt: String?
}

struct AuthResponseDTO: Decodable {
    let token: String
    let user: UserDTO
}

struct SellerProfileDTO: Decodable {
    let displayName: String
    let status: String
    let rating: Double
    let ratingCount: Int
    let salesCount: Int
    let approvedAt: String?
}

struct SellerApplicationDTO: Decodable {
    let id: String
    /// submitted | under_review | approved | declined
    let status: String
    let decisionNote: String?
    let submittedAt: String?
    let reviewedAt: String?
}

/// GET /api/me — the signed-in user plus their seller status.
struct MeDTO: Decodable {
    let id: String
    let username: String
    let email: String
    let phone: String?
    let avatarKey: String?
    let emailVerified: Bool
    let createdAt: String?
    let isApprovedSeller: Bool
    let sellerProfile: SellerProfileDTO?
    let sellerApplication: SellerApplicationDTO?
}

struct MessageDTO: Decodable {
    let message: String
}

struct HealthDTO: Decodable {
    let status: String
    let db: String
}

// MARK: - Conversions into the app's models

private func dollars(fromCents cents: Int) -> Double {
    return Double(cents) / 100.0
}

extension BrandDTO {
    func toBrand() -> Brand? {
        guard let uuid = UUID(uuidString: id) else { return nil }
        return Brand(id: uuid, name: name)
    }
}

extension ProductSummaryDTO {
    /// A product with no offers loaded yet — enough for a shop-grid card.
    func toProduct() -> Product? {
        guard let uuid = UUID(uuidString: id) else { return nil }
        var product = Product(
            id: uuid,
            name: name,
            brand: brand,
            type: ProductType(rawValue: type) ?? .other,
            imageNames: thumbnailKey.map { [$0] } ?? [],
            listings: []
        )
        product.serverLowestPrice = lowestPriceCents.map(dollars(fromCents:))
        product.serverSellerCount = sellerCount
        product.serverIsFullySoldOut = isFullySoldOut
        return product
    }
}

extension ListingDTO {
    func toListing() -> Listing? {
        guard let listingID = UUID(uuidString: id),
              let sellerID = UUID(uuidString: seller.id) else { return nil }
        let owner = Seller(
            id: sellerID,
            name: seller.displayName,
            rating: seller.rating,
            salesCount: seller.salesCount,
            isVerified: seller.isVerified,
            isCurrentUser: isMine
        )
        return Listing(
            id: listingID,
            seller: owner,
            price: dollars(fromCents: priceCents),
            source: source,
            boxPosition: boxPosition,
            condition: condition ?? "Factory Sealed",
            isSoldOut: quantityAvailable <= 0
        )
    }
}

extension ProductDetailDTO {
    func toProduct() -> Product? {
        guard let uuid = UUID(uuidString: id) else { return nil }

        var imageNames = images.sorted { $0.slot < $1.slot }.map { $0.imageKey }
        if imageNames.isEmpty {
            // Always at least one page so the image carousel isn't blank.
            imageNames = [thumbnailKey ?? "placeholder"]
        }

        var product = Product(
            id: uuid,
            name: name,
            brand: brand,
            type: ProductType(rawValue: type) ?? .other,
            imageNames: imageNames,
            listings: listings.compactMap { $0.toListing() }
        )
        product.serverLowestPrice = lowestPriceCents.map(dollars(fromCents:))
        product.serverSellerCount = sellerCount
        product.serverIsFullySoldOut = isFullySoldOut
        return product
    }
}
