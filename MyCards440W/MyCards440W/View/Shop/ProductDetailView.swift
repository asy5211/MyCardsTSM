//
//  ProductDetailView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct ProductDetailView: View {
    let product: Product

    @EnvironmentObject private var cartStore: CartStore
    @Environment(\.dismiss) private var dismiss

    @State private var isFavorite = false
    @State private var selectedImageIndex = 0
    @State private var showFullScreenImage = false

    private var sortedListings: [Listing] { product.sortedListings }
    private var topListing: Listing? { sortedListings.first }
    private var otherListings: [Listing] { Array(sortedListings.dropFirst()) }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    imageCarousel
                    titleRow
                    if product.isFullySoldOut {
                        soldOutBanner
                    } else {
                        bestPriceBanner
                    }
                    if let topListing {
                        sectionHeader("Lowest Available Offer")
                        ListingRow(listing: topListing, isTopOffer: true,
                                   onAddToCart: { cartStore.add(product: product, listing: topListing) })
                    }
                    if !otherListings.isEmpty {
                        HStack {
                            sectionHeader("Other Available Sources")
                            Spacer()
                            Text("\(otherListings.count) Listings")
                                .font(.caption)
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                        ForEach(otherListings) { listing in
                            ListingRow(listing: listing, isTopOffer: false,
                                       onAddToCart: { cartStore.add(product: product, listing: listing) })
                        }
                    }
                }
                .padding(16)
                .padding(.bottom, product.isFullySoldOut ? 0 : 90) // room for the sticky bar
            }
            if !product.isFullySoldOut {
                stickyBuyBar
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                backButton
            }
        }
        .fullScreenCover(isPresented: $showFullScreenImage) {
            FullScreenImageView(imageNames: product.imageNames, selectedIndex: $selectedImageIndex)
        }
    }

    private var backButton: some View {
        Button { dismiss() } label: {
            Image(systemName: "chevron.left")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .padding(10)
                .background(.black.opacity(0.55))
                .clipShape(Circle())
        }
    }

    // MARK: Sections

    private var imageCarousel: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView(selection: $selectedImageIndex) {
                ForEach(Array(product.imageNames.enumerated()), id: \.offset) { index, _ in
                    RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                        .fill(AppTheme.surfaceElevated)
                        .overlay(Image(systemName: "shippingbox.fill").font(.system(size: 50))
                                    .foregroundStyle(AppTheme.textTertiary))
                        .tag(index)
                }
            }
            .tabViewStyle(.page)
            .aspectRatio(3.0/4.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius))

            Button { showFullScreenImage = true } label: {
                Image(systemName: "magnifyingglass")
                    .padding(10)
                    .background(.black.opacity(0.6))
                    .clipShape(Circle())
                    .foregroundStyle(.white)
            }
            .padding(10)
        }
    }

    private var titleRow: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text(product.name).font(.title3.weight(.bold))
                HStack(spacing: 6) {
                    tagChip(product.type.rawValue, systemImage: "cube.box")
                    tagChip("Sealed Product", systemImage: "checkmark.shield")
                }
            }
            Spacer()
            Button { isFavorite.toggle() } label: {
                Image(systemName: isFavorite ? "heart.fill" : "heart")
                    .foregroundStyle(isFavorite ? AppTheme.accent : AppTheme.textSecondary)
            }
        }
    }

    private var bestPriceBanner: some View {
        NeonCard {
            HStack {
                Image(systemName: "tag.fill").foregroundStyle(AppTheme.accent)
                VStack(alignment: .leading, spacing: 0) {
                    Text("BEST AVAILABLE PRICE").font(.caption2.weight(.bold))
                        .foregroundStyle(AppTheme.textSecondary)
                    Text("Starting at").font(.caption2).foregroundStyle(AppTheme.textSecondary)
                }
                Spacer()
                Text(product.lowestPrice, format: .currency(code: "USD"))
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                    .foregroundStyle(AppTheme.accent)
            }
        }
    }

    private var soldOutBanner: some View {
        NeonCard(borderColor: Color.white.opacity(0.2)) {
            HStack {
                Image(systemName: "xmark.seal.fill").foregroundStyle(AppTheme.textTertiary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("SOLD OUT").font(.headline.weight(.heavy)).foregroundStyle(AppTheme.textTertiary)
                    Text("Every seller is out of stock — check back later.")
                        .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                }
                Spacer()
            }
        }
    }

    private var stickyBuyBar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 0) {
                Text("Best Price").font(.caption2).foregroundStyle(AppTheme.textSecondary)
                Text(product.lowestPrice, format: .currency(code: "USD"))
                    .font(.headline.weight(.heavy)).foregroundStyle(AppTheme.accent)
            }
            Spacer()
            Button {
                if let topListing { cartStore.add(product: product, listing: topListing) }
            } label: {
                Image(systemName: "cart").padding(12)
                    .background(AppTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.25)))
            }
            Button { /* buy now */ } label: {
                Label("Buy Now", systemImage: "bolt.fill")
                    .font(.subheadline.weight(.heavy))
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .background(AppTheme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.white)
            }
        }
        .padding(14)
        .background(.black.opacity(0.95))
        .overlay(Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1), alignment: .top)
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(AppTheme.accent).frame(width: 4, height: 16)
            Text(title).font(.headline)
        }
    }

    private func tagChip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.system(size: 11, weight: .semibold))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(AppTheme.surface)
            .clipShape(Capsule())
    }
}

/// Reused as-is on the Cart screen (Milestone 2) to show which exact
/// seller/source a cart line came from.
struct ListingRow: View {
    let listing: Listing
    let isTopOffer: Bool
    var showActions: Bool = true
    var onAddToCart: () -> Void = {}
    var onBuyNow: () -> Void = {}

    private var isOwnListing: Bool { listing.seller.isCurrentUser }

    var body: some View {
        NeonCard(borderColor: isOwnListing ? AppTheme.gold : AppTheme.accent) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: "storefront.fill")
                        .foregroundStyle(isOwnListing ? AppTheme.gold : AppTheme.textPrimary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(isOwnListing ? "Your Listing" : listing.seller.name)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(isOwnListing ? AppTheme.gold : AppTheme.textPrimary)
                        HStack(spacing: 4) {
                            Image(systemName: "star.fill").font(.caption2).foregroundStyle(.yellow)
                            Text("\(listing.seller.rating, specifier: "%.1f") (\(listing.seller.salesCount) sales)")
                                .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                    Spacer()
                    if listing.seller.isVerified {
                        Label("Verified Seller", systemImage: "checkmark.seal.fill")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(AppTheme.verifiedGreen)
                    }
                }

                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Price").font(.caption2).foregroundStyle(AppTheme.textSecondary)
                        Text(listing.price, format: .currency(code: "USD"))
                            .font(.title3.weight(.heavy))
                            .foregroundStyle(isOwnListing ? AppTheme.gold : AppTheme.accent)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        detailLine(icon: "shippingbox", text: listing.source)
                        if let box = listing.boxPosition {
                            detailLine(icon: "shippingbox", text: box)
                        }
                        detailLine(icon: "checkmark.circle", text: listing.condition)
                    }
                }

                if showActions {
                    HStack(spacing: 10) {
                        SecondaryButton(title: "Add to Cart", systemImage: "cart", action: onAddToCart)
                        PrimaryButton(title: "Buy Now", systemImage: "bolt.fill", action: onBuyNow)
                    }
                }
            }
        }
    }

    private func detailLine(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 9))
            Text(text).font(.system(size: 11))
        }
        .foregroundStyle(AppTheme.textSecondary)
    }
}

private struct FullScreenImageView: View {
    let imageNames: [String]
    @Binding var selectedIndex: Int
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            TabView(selection: $selectedIndex) {
                ForEach(Array(imageNames.enumerated()), id: \.offset) { index, _ in
                    RoundedRectangle(cornerRadius: 8).fill(AppTheme.surfaceElevated).tag(index)
                        .padding()
                }
            }
            .tabViewStyle(.page)
            Button { dismiss() } label: {
                Image(systemName: "xmark").padding(16).foregroundStyle(.white)
            }
        }
    }
}

#Preview {
    NavigationStack {
        ProductDetailView(product: SampleData.sampleProducts[0])
    }
    .environmentObject(CartStore())
}
