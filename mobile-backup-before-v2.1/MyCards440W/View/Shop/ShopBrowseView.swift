//
//  ShopBrowseView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

enum SortOption: String, CaseIterable {
    case priceLowToHigh = "Price: Low to High"
    case priceHighToLow = "Price: High to Low"
    case mostSellers = "Most Sellers"
}

struct ShopBrowseView: View {
    /// One brand's page. nil when this screen shows search results instead.
    let brand: Brand?
    /// Search text from the Home search bar (matches product and brand names).
    var searchQuery: String? = nil

    @EnvironmentObject private var session: AppSession

    @State private var selectedType: ProductType = .all
    @State private var sortOption: SortOption = .priceLowToHigh
    @State private var favorites: Set<UUID> = []

    // Products come from AppSession: sample data in Demo mode, the server in
    // Live mode (the server applies the brand, type, search and sort).
    @State private var products: [Product] = []
    @State private var isLoading = false
    @State private var hasLoaded = false
    @State private var loadError: String?
    @State private var latestLoad = 0

    /// Changing any of these reloads the list.
    private var reloadKey: String {
        "\(session.mode.rawValue)|\(selectedType.rawValue)|\(sortOption.rawValue)"
    }

    private var headerTitle: String {
        if let brand { return brand.name }
        if let searchQuery { return "Results for “\(searchQuery)”" }
        return "All Products"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                filterRow
                productGrid
            }
            .padding(16)
        }
        .task(id: reloadKey) { await load() }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle(brand?.name ?? "Search")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        NeonCard {
            HStack {
                Image(systemName: "shippingbox").font(.system(size: 28))
                VStack(alignment: .leading, spacing: 2) {
                    Text(headerTitle.uppercased())
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .lineLimit(2)
                    Text("\(products.reduce(0) { $0 + $1.sellerCount }) Listings Available")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                Spacer()
            }
        }
    }

    private var filterRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Filter by Product Type").font(.subheadline.weight(.semibold))
                Spacer()
                Menu {
                    ForEach(SortOption.allCases, id: \.self) { option in
                        Button(option.rawValue) { sortOption = option }
                    }
                } label: {
                    Label("Sort", systemImage: "arrow.up.arrow.down")
                        .font(.footnote.weight(.semibold))
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ProductType.allCases) { type in
                        Button {
                            selectedType = type
                        } label: {
                            Text(type.rawValue)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .background(selectedType == type ? AppTheme.accent : AppTheme.surface)
                                .clipShape(Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var productGrid: some View {
        if products.isEmpty && (isLoading || (!hasLoaded && loadError == nil)) {
            ProgressView()
                .tint(AppTheme.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
        } else if let loadError, products.isEmpty {
            NeonCard {
                VStack(spacing: 10) {
                    Text(loadError)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                        .multilineTextAlignment(.center)
                    SecondaryButton(title: "Try Again", systemImage: "arrow.clockwise") {
                        Task { await load() }
                    }
                }
                .frame(maxWidth: .infinity)
            }
        } else if products.isEmpty {
            Text("No products found.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
        } else {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                ForEach(products) { product in
                    NavigationLink(value: product) {
                        ProductCard(product: product,
                                    isFavorite: favorites.contains(product.id),
                                    onToggleFavorite: { toggleFavorite(product.id) })
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// Only the newest request is allowed to change the screen, so a slow
    /// earlier answer can't overwrite a newer one.
    private func load() async {
        latestLoad += 1
        let mine = latestLoad
        isLoading = true
        loadError = nil
        do {
            let result = try await session.fetchProducts(brand: brand,
                                                         type: selectedType,
                                                         sort: sortOption,
                                                         query: searchQuery)
            if mine == latestLoad {
                products = result
                hasLoaded = true
            }
        } catch is CancellationError {
            // Reloaded or left the screen; the newer request takes over.
        } catch {
            if mine == latestLoad {
                products = []
                loadError = error.localizedDescription
                hasLoaded = true
            }
        }
        if mine == latestLoad {
            isLoading = false
        }
    }

    private func toggleFavorite(_ id: UUID) {
        if favorites.contains(id) { favorites.remove(id) } else { favorites.insert(id) }
    }
}

private struct ProductCard: View {
    let product: Product
    let isFavorite: Bool
    let onToggleFavorite: () -> Void

    var body: some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 8) {
                ZStack(alignment: .topTrailing) {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(AppTheme.surfaceElevated)
                        .aspectRatio(1, contentMode: .fit)
                        .overlay(Image(systemName: "shippingbox.fill").foregroundStyle(AppTheme.textTertiary))
                    Button(action: onToggleFavorite) {
                        Image(systemName: isFavorite ? "heart.fill" : "heart")
                            .foregroundStyle(isFavorite ? AppTheme.accent : .white)
                            .padding(6)
                    }
                }
                Label("Verified Sources", systemImage: "checkmark.seal.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.verifiedGreen)
                Text(product.name).font(.subheadline.weight(.bold)).lineLimit(1)
                Text(product.type.rawValue)
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(AppTheme.surfaceElevated)
                    .clipShape(Capsule())
                if product.isFullySoldOut {
                    Text("Sold Out").font(.caption2).foregroundStyle(AppTheme.textTertiary)
                } else {
                    Text("\(product.sellerCount) Sellers")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                HStack {
                    VStack(alignment: .leading, spacing: 0) {
                        if product.isFullySoldOut {
                            Text("SOLD OUT")
                                .font(.headline.weight(.heavy))
                                .foregroundStyle(AppTheme.textTertiary)
                        } else {
                            Text("From").font(.caption2).foregroundStyle(AppTheme.textSecondary)
                            Text(product.lowestPrice, format: .currency(code: "USD"))
                                .font(.headline.weight(.heavy))
                                .foregroundStyle(AppTheme.accent)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundStyle(product.isFullySoldOut ? AppTheme.textTertiary : AppTheme.accent)
                }
            }
            .opacity(product.isFullySoldOut ? 0.55 : 1)
        }
    }
}

#Preview {
    NavigationStack {
        ShopBrowseView(brand: Brand(name: "Pokémon"))
            .navigationDestination(for: Product.self) { product in
                ProductDetailView(product: product)
            }
    }
    .environmentObject(CartStore())
    .environmentObject(AppSession(profile: ProfileStore()))
}
