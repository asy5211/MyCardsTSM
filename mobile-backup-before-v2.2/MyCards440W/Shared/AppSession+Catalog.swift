//
//  AppSession+Catalog.swift
//  TSM (The Sealed Market)
//
//  Shop data for the Home, brand and product screens. In Demo mode this is
//  the built-in sample data (same behavior as before); in Live mode it asks
//  the server, which applies the filters, sorting and the sold-out rule.
//

import Foundation

extension SortOption {
    /// The `sort` value the server's /api/products understands.
    var apiValue: String {
        switch self {
        case .priceLowToHigh: return "price_asc"
        case .priceHighToLow: return "price_desc"
        case .mostSellers: return "sellers"
        }
    }
}

extension AppSession {

    // MARK: Brands (Home → Shop by Brand)

    func fetchBrands() async throws -> [Brand] {
        if mode == .mock {
            return SampleData.brands
        }
        let dtos: [BrandDTO] = try await api.get("/api/brands", auth: false)
        return dtos.compactMap { $0.toBrand() }
    }

    // MARK: Product list (brand page and search results)

    /// - Parameters:
    ///   - brand: only this brand's products (Live mode). nil for search across all brands.
    ///   - query: search text, matched against product and brand names.
    func fetchProducts(brand: Brand?,
                       type: ProductType,
                       sort: SortOption,
                       query: String?) async throws -> [Product] {
        let search = query?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if mode == .mock {
            return mockProducts(type: type, sort: sort, search: search)
        }

        var params: [String: String] = ["sort": sort.apiValue, "limit": "100"]
        if let brand {
            params["brand"] = brand.name
        }
        if type != .all {
            params["type"] = type.rawValue
        }
        if !search.isEmpty {
            params["q"] = search
        }

        // The server returns at most 100 at a time; keep asking until it has
        // sent everything (with a sanity cap).
        var all: [Product] = []
        var offset = 0
        while true {
            params["offset"] = String(offset)
            let page: ProductListDTO = try await api.get("/api/products", query: params, auth: false)
            all.append(contentsOf: page.items.compactMap { $0.toProduct() })
            offset += page.items.count
            if page.items.isEmpty || offset >= page.total || offset >= 1000 {
                break
            }
        }
        return all
    }

    // MARK: Product page

    /// Loads the full product page (images + every seller's offer). Offers
    /// come back cheapest first with the signed-in seller's own row first.
    func fetchProductDetail(for product: Product) async throws -> Product {
        if mode == .mock {
            return product
        }
        let id = product.id.uuidString.lowercased()
        let dto: ProductDetailDTO = try await api.get("/api/products/\(id)")
        guard let full = dto.toProduct() else {
            throw APIError.unexpected("The server sent a product the app couldn't read.")
        }
        return full
    }

    // MARK: Demo data

    private func mockProducts(type: ProductType, sort: SortOption, search: String) -> [Product] {
        // Demo mode keeps the original behavior: the same few sample products
        // on every brand page.
        var items = SampleData.sampleProducts
        if type != .all {
            items = items.filter { $0.type == type }
        }
        if !search.isEmpty {
            items = items.filter {
                $0.name.localizedStandardContains(search) || $0.brand.localizedStandardContains(search)
            }
        }
        switch sort {
        case .priceLowToHigh: return items.sorted { $0.lowestPrice < $1.lowestPrice }
        case .priceHighToLow: return items.sorted { $0.lowestPrice > $1.lowestPrice }
        case .mostSellers: return items.sorted { $0.sellerCount > $1.sellerCount }
        }
    }
}
