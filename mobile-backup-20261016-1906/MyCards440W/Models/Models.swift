//
//  Models.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import Foundation

// MARK: - Seller

struct Seller: Identifiable, Equatable {
    let id: UUID
    let name: String
    let rating: Double
    let salesCount: Int
    let isVerified: Bool
    /// True when this listing belongs to the signed-in user — drives the
    /// gold "your listing" highlight on the product detail page.
    let isCurrentUser: Bool

    init(id: UUID = UUID(), name: String, rating: Double, salesCount: Int,
         isVerified: Bool = true, isCurrentUser: Bool = false) {
        self.id = id
        self.name = name
        self.rating = rating
        self.salesCount = salesCount
        self.isVerified = isVerified
        self.isCurrentUser = isCurrentUser
    }
}

// MARK: - Listing (one seller's offer against a Product)

struct Listing: Identifiable, Equatable {
    let id: UUID
    let seller: Seller
    let price: Double
    let source: String        // "From Case", "Loose Product"
    let boxPosition: String?  // "Box 4 of 12" — nil when not applicable
    let condition: String     // "Factory Sealed"
    /// True once this seller's quantity_available hits 0 (spec 5.4). A
    /// sold-out listing drops out of the product's offer list entirely —
    /// it does not just gray out — while the product itself only grays
    /// out once every listing is sold out.
    let isSoldOut: Bool

    // Transparency details the seller filled in (live server only; nil in demo data).
    /// Who the seller bought it from, e.g. "Card Depot".
    let distributor: String?
    /// Where it was sourced, in plain words, e.g. "Authorized distributor".
    let sourceLabel: String?
    /// How many the seller has in stock right now.
    let quantityAvailable: Int?

    init(id: UUID = UUID(), seller: Seller, price: Double, source: String,
         boxPosition: String? = nil, condition: String = "Factory Sealed", isSoldOut: Bool = false,
         distributor: String? = nil, sourceLabel: String? = nil, quantityAvailable: Int? = nil) {
        self.id = id
        self.seller = seller
        self.price = price
        self.source = source
        self.boxPosition = boxPosition
        self.condition = condition
        self.isSoldOut = isSoldOut
        self.distributor = distributor
        self.sourceLabel = sourceLabel
        self.quantityAvailable = quantityAvailable
    }
}

// MARK: - Product

enum ProductType: String, CaseIterable, Identifiable {
    case all = "All"
    case sealedCase = "Sealed Cases"
    case boosterBox = "Booster Boxes"
    case blister = "Blisters"
    case singlePack = "Single Packs"
    case illustrationBox = "Illustration Boxes"
    case other = "Other"

    var id: String { rawValue }
}

struct Product: Identifiable, Equatable {
    let id: UUID
    let name: String
    let brand: String
    let type: ProductType
    /// Image names (sample data) or server image keys (live). The app draws
    /// placeholders for them until real product photography is added.
    let imageNames: [String]
    let listings: [Listing]

    // Filled in from the live server for shop-grid cards, where the offers
    // themselves haven't been downloaded yet. nil = work it out from `listings`.
    var serverLowestPrice: Double? = nil
    var serverSellerCount: Int? = nil
    var serverIsFullySoldOut: Bool? = nil

    // Set by the admin site and sent by the server (live mode). Photo paths stay
    // relative ("/media/products/…"); AppConfig.mediaURL(for:) makes the web address.
    /// What the product is, written in the admin site. nil = nothing written yet.
    var productDescription: String? = nil
    /// Photo paths in slot order. Empty = no photos uploaded yet (placeholder shown).
    var imagePaths: [String] = []
    /// The main photo (slot 1) — used on shop cards.
    var thumbnailPath: String? = nil

    /// Only sold-out sellers are dropped; the product itself stays listed
    /// as long as at least one seller still has stock (spec 5.4).
    var activeListings: [Listing] { listings.filter { !$0.isSoldOut } }

    var isFullySoldOut: Bool {
        serverIsFullySoldOut ?? (!listings.isEmpty && activeListings.isEmpty)
    }

    var lowestPrice: Double {
        serverLowestPrice ?? (activeListings.map(\.price).min() ?? 0)
    }

    var sellerCount: Int { serverSellerCount ?? activeListings.count }

    /// A product the admin has published that no approved seller has an offer on yet.
    /// (Not the same as sold out, where offers existed but ran out of stock.)
    var hasNoOffers: Bool { !isFullySoldOut && sellerCount == 0 }

    /// What the photo carousel pages through: one entry per photo (nil = draw the placeholder).
    /// Never empty, so the carousel always has a page. Demo data has no real photos, so it
    /// keeps one placeholder page per sample image name, as before.
    var galleryPaths: [String?] {
        if !imagePaths.isEmpty { return imagePaths.map { Optional($0) } }
        if let thumbnailPath { return [thumbnailPath] }
        return Array<String?>(repeating: nil, count: max(imageNames.count, 1))
    }

    /// Active listings sorted lowest → highest, with the current user's own
    /// listing (if any) pinned first regardless of price.
    var sortedListings: [Listing] {
        activeListings.sorted { lhs, rhs in
            if lhs.seller.isCurrentUser != rhs.seller.isCurrentUser {
                return lhs.seller.isCurrentUser
            }
            return lhs.price < rhs.price
        }
    }

    static func == (lhs: Product, rhs: Product) -> Bool { lhs.id == rhs.id }
}

// MARK: - Banner (home page featured carousel)

enum BannerDestination {
    case product(UUID)
    case url(URL)
}

struct FeaturedBanner: Identifiable {
    let id: UUID
    let imageName: String
    let eyebrow: String
    let headline: String
    let subheadline: String
    let destination: BannerDestination

    init(id: UUID = UUID(), imageName: String, eyebrow: String, headline: String,
         subheadline: String, destination: BannerDestination) {
        self.id = id
        self.imageName = imageName
        self.eyebrow = eyebrow
        self.headline = headline
        self.subheadline = subheadline
        self.destination = destination
    }
}

// MARK: - Brand (shop-by-brand grid)

struct Brand: Identifiable, Hashable {
    let id: UUID
    let name: String

    init(name: String) {
        self.id = UUID()
        self.name = name
    }

    /// Used for live brands, which keep the server's own id.
    init(id: UUID, name: String) {
        self.id = id
        self.name = name
    }
}

// MARK: - Sample data (swap for real API responses)

enum SampleData {
    static let brands: [Brand] = [
        "Pokémon", "Magic", "One Piece", "Lorcana", "Star Wars", "Rift Bound",
        "Union Arena", "Naruto", "Dragon Ball", "Panini", "Topps", "Upper Deck"
    ].map { Brand(name: $0) }

    static let currentUserSeller = Seller(
        name: "You", rating: 4.9, salesCount: 12, isVerified: true, isCurrentUser: true
    )

    static let sampleProducts: [Product] = [
        Product(
            id: UUID(),
            name: "Collector Set Alpha",
            brand: "Pokémon",
            type: .boosterBox,
            imageNames: ["collector_set_alpha_1", "collector_set_alpha_2"],
            listings: [
                Listing(seller: Seller(name: "TopTier Collectibles", rating: 4.9, salesCount: 1248),
                        price: 124.99, source: "From Case", boxPosition: "Box 4 of 12"),
                Listing(seller: Seller(name: "Elite Supply Co.", rating: 4.9, salesCount: 192),
                        price: 129.99, source: "From Case", boxPosition: "Box 9 of 12"),
                Listing(seller: Seller(name: "Prime Source", rating: 4.8, salesCount: 567),
                        price: 134.99, source: "Loose Product"),
                Listing(seller: currentUserSeller,
                        price: 127.99, source: "From Case", boxPosition: "Box 2 of 12")
            ]
        ),
        Product(
            id: UUID(),
            name: "Elite Series",
            brand: "Magic",
            type: .sealedCase,
            imageNames: ["elite_series_1"],
            listings: [
                Listing(seller: Seller(name: "Collector Hub", rating: 4.7, salesCount: 88),
                        price: 1049.99, source: "From Case", isSoldOut: true)
            ]
        ),
        Product(
            id: UUID(),
            name: "Standard Pack",
            brand: "One Piece",
            type: .singlePack,
            imageNames: ["standard_pack_1"],
            listings: [
                Listing(seller: Seller(name: "Alpha Inventory Co.", rating: 4.6, salesCount: 340),
                        price: 4.99, source: "Loose Product")
            ]
        )
    ]

    static let featuredBanners: [FeaturedBanner] = [
        FeaturedBanner(imageName: "banner_hero",
                       eyebrow: "SEALED · AUTHENTIC · TRUSTED",
                       headline: "YOUR NEXT PULL STARTS HERE",
                       subheadline: "Buy from verified stores. Choose your source.",
                       destination: .url(URL(string: "https://example.com")!))
    ]
}
