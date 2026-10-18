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
    /// Relative web path of the photo the admin uploaded ("/media/products/…"). nil = no photo yet.
    let thumbnailUrl: String?
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
    /// Relative web path ("/media/products/…"); nil for the built-in placeholder artwork.
    let url: String?
}

struct ListingSellerDTO: Decodable {
    let id: String
    let displayName: String
    let rating: Double
    /// How many buyer reviews the rating is built from (0 = no reviews yet).
    let ratingCount: Int?
    let salesCount: Int
    let isVerified: Bool
}

struct ListingDTO: Decodable {
    let id: String
    let priceCents: Int
    let source: String
    let boxPosition: String?
    let boxNumber: Int?
    let boxesInCase: Int?
    /// "distributor", "direct", … plus the plain-English label the seller's offer is shown with.
    let sourceType: String?
    let sourceLabel: String?
    /// Who the seller bought it from (free text the seller typed). nil = not given.
    let distributor: String?
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
    let thumbnailUrl: String?
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
    /// active | suspended | revoked
    let status: String
    /// The reason staff gave when selling was suspended or removed.
    let statusNote: String?
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
    /// The saved shipping address. Missing/null until the person adds one.
    let address: AddressDTO?
}

/// The saved shipping address (GET/PUT /api/me/address, and inside /api/me).
struct AddressDTO: Decodable {
    let fullName: String
    let line1: String
    let line2: String?
    let city: String
    let region: String
    let postalCode: String
    let country: String

    func toShippingAddress() -> ShippingAddress {
        return ShippingAddress(fullName: fullName,
                               line1: line1,
                               line2: line2 ?? "",
                               city: city,
                               region: region,
                               postalCode: postalCode,
                               country: country)
    }
}

/// What POST /api/me/seller-application answers with (only the parts the app uses).
struct SubmittedApplicationDTO: Decodable {
    let id: String
    let status: String
}

struct SellerApplicationSubmittedDTO: Decodable {
    let application: SubmittedApplicationDTO
}

struct AddressResponseDTO: Decodable {
    let address: AddressDTO?
}

struct MessageDTO: Decodable {
    let message: String
}

struct HealthDTO: Decodable {
    let status: String
    let db: String
}

// MARK: - Dates

/// The server sends times like "2026-09-24T12:00:00.000Z".
enum APIDate {
    static func parse(_ text: String?) -> Date? {
        guard let text else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: text) {
            return date
        }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: text)
    }
}

// MARK: - Conversions into the app's models

private func dollars(fromCents cents: Int) -> Double {
    return Double(cents) / 100.0
}

private extension String {
    /// nil for blank text, so "no distributor given" never shows as an empty line.
    var nilIfEmpty: String? { isEmpty ? nil : self }
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
        product.thumbnailPath = thumbnailUrl
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
            isCurrentUser: isMine,
            ratingCount: seller.ratingCount ?? 0
        )
        return Listing(
            id: listingID,
            seller: owner,
            price: dollars(fromCents: priceCents),
            source: source,
            boxPosition: boxPosition,
            condition: condition ?? "Factory Sealed",
            isSoldOut: quantityAvailable <= 0,
            distributor: distributor?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            sourceLabel: sourceLabel?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            quantityAvailable: quantityAvailable
        )
    }
}

extension ProductDetailDTO {
    func toProduct() -> Product? {
        guard let uuid = UUID(uuidString: id) else { return nil }

        let orderedImages = images.sorted { $0.slot < $1.slot }
        var imageNames = orderedImages.map { $0.imageKey }
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
        product.productDescription = description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        product.imagePaths = orderedImages.compactMap { $0.url }
        product.thumbnailPath = thumbnailUrl ?? product.imagePaths.first
        return product
    }
}
