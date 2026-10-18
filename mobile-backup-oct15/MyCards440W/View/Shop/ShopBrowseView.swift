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
    let brand: Brand

    @State private var selectedType: ProductType = .all
    @State private var sortOption: SortOption = .priceLowToHigh
    @State private var favorites: Set<UUID> = []

    // Swap for a real API call filtered by `brand` when the Products API lands.
    private var products: [Product] {
        let base = SampleData.sampleProducts
        let filtered = selectedType == .all ? base : base.filter { $0.type == selectedType }
        switch sortOption {
        case .priceLowToHigh: return filtered.sorted { $0.lowestPrice < $1.lowestPrice }
        case .priceHighToLow: return filtered.sorted { $0.lowestPrice > $1.lowestPrice }
        case .mostSellers: return filtered.sorted { $0.sellerCount > $1.sellerCount }
        }
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
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle(brand.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        NeonCard {
            HStack {
                Image(systemName: "shippingbox").font(.system(size: 28))
                VStack(alignment: .leading, spacing: 2) {
                    Text(brand.name.uppercased())
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
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

    private var productGrid: some View {
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
}
