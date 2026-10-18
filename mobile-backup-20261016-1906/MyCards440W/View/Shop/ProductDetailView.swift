//
//  ProductDetailView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct ProductDetailView: View {
    /// What the previous screen knew (name, type, lowest price, sold-out flag).
    /// In Live mode the sellers' offers and all images arrive from the server
    /// once this page opens, and `product` switches to that fuller version.
    private let initialProduct: Product

    @EnvironmentObject private var cartStore: CartStore
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var favorites: FavoritesStore
    @EnvironmentObject private var router: AppRouter
    @Environment(\.dismiss) private var dismiss

    @State private var selectedImageIndex = 0
    @State private var showFullScreenImage = false
    @State private var loaded: Product?
    @State private var offersError: String?
    @State private var toast: CartToast?

    init(product: Product) {
        self.initialProduct = product
    }

    private var product: Product { loaded ?? initialProduct }

    private var sortedListings: [Listing] { product.sortedListings }
    private var topListing: Listing? { sortedListings.first }
    private var otherListings: [Listing] { Array(sortedListings.dropFirst()) }

    /// There is something to buy: not sold out, and at least one seller has an offer.
    private var canBuy: Bool { !product.isFullySoldOut && !product.hasNoOffers }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    imageCarousel
                    titleRow
                    if let about = product.productDescription {
                        aboutSection(about)
                    }
                    if product.isFullySoldOut {
                        soldOutBanner
                    } else if canBuy {
                        bestPriceBanner
                    }
                    if sortedListings.isEmpty && !product.isFullySoldOut {
                        offersStatus
                    }
                    if let topListing {
                        sectionHeader("Lowest Available Offer")
                        ListingRow(listing: topListing, isTopOffer: true,
                                   onAddToCart: { addToCart(topListing) },
                                   onBuyNow: { buyNow(topListing) })
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
                                       onAddToCart: { addToCart(listing) },
                                       onBuyNow: { buyNow(listing) })
                        }
                    }
                }
                .padding(16)
                .padding(.bottom, canBuy ? 90 : 0) // room for the sticky bar
            }
            if canBuy {
                stickyBuyBar
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                CartToastView(toast: toast) {
                    self.toast = nil
                    router.path.append(HomeRoute.cart)
                }
                .padding(.bottom, canBuy ? 84 : 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.25), value: toast)
        .sensoryFeedback(.success, trigger: toast?.id)
        .task(id: session.mode) { await loadOffers() }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                backButton
            }
            ToolbarItem(placement: .topBarTrailing) {
                CartToolbarButton()
            }
        }
        .fullScreenCover(isPresented: $showFullScreenImage) {
            FullScreenImageView(photoPaths: product.galleryPaths, selectedIndex: $selectedImageIndex)
        }
    }

    /// Shown where the offers go while they load, or if they can't be loaded.
    @ViewBuilder
    private var offersStatus: some View {
        if let offersError {
            NeonCard {
                VStack(spacing: 10) {
                    Text(offersError)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                        .multilineTextAlignment(.center)
                    SecondaryButton(title: "Try Again", systemImage: "arrow.clockwise") {
                        Task { await loadOffers() }
                    }
                }
                .frame(maxWidth: .infinity)
            }
        } else if loaded == nil {
            ProgressView()
                .tint(AppTheme.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
        } else {
            Text(product.hasNoOffers
                 ? "No approved seller has listed this yet. Check back soon."
                 : "No sellers have this in stock right now.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func loadOffers() async {
        offersError = nil
        do {
            let fresh = try await session.fetchProductDetail(for: initialProduct)
            loaded = fresh
            favorites.refresh(with: fresh)
        } catch is CancellationError {
            // Left the page or switched data source; nothing to show.
        } catch {
            offersError = error.localizedDescription
        }
    }

    // MARK: Cart actions

    /// Adds one of this seller's offers to the cart and says so on screen.
    private func addToCart(_ listing: Listing) {
        cartStore.add(product: product, listing: listing)
        let message = "Added to cart · \(listing.seller.isCurrentUser ? "Your listing" : listing.seller.name)"
        toast = CartToast(message: message)
        let shown = toast
        Task {
            try? await Task.sleep(for: .seconds(4))
            if toast == shown {
                toast = nil
            }
        }
    }

    /// Skips the cart: goes straight to checkout with just this offer.
    private func buyNow(_ listing: Listing) {
        let line = CartLine(product: product, listing: listing, quantity: 1)
        router.path.append(HomeRoute.checkout(CheckoutRequest(lines: [line], clearsCart: false)))
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
                ForEach(Array(product.galleryPaths.enumerated()), id: \.offset) { index, path in
                    RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                        .fill(AppTheme.surfaceElevated)
                        .overlay(
                            ProductPhoto(path: path, contentMode: .fit, placeholderSize: 50)
                                .padding(8)
                        )
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
            Button { favorites.toggle(product) } label: {
                Image(systemName: favorites.isFavorite(product.id) ? "heart.fill" : "heart")
                    .font(.title3)
                    .foregroundStyle(favorites.isFavorite(product.id) ? AppTheme.accent : AppTheme.textSecondary)
            }
        }
    }

    /// What the product is, as written in the TSM admin site.
    private func aboutSection(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("About This Product")
            Text(text)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
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
                if let topListing { addToCart(topListing) }
            } label: {
                Image(systemName: "cart.badge.plus").padding(12)
                    .background(AppTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.25)))
            }
            Button {
                if let topListing { buyNow(topListing) }
            } label: {
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

                if hasSellerDetails {
                    sellerDetails
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

    // MARK: What the seller told us (live server only)

    /// Stock only matters while shopping; in the cart it could be out of date.
    private var stockToShow: Int? { showActions ? listing.quantityAvailable : nil }

    private var hasSellerDetails: Bool {
        listing.sourceLabel != nil || listing.distributor != nil || stockToShow != nil
    }

    private var sellerDetails: some View {
        VStack(alignment: .leading, spacing: 5) {
            if let label = listing.sourceLabel {
                infoRow("Sourced from", label)
            }
            if let distributor = listing.distributor {
                infoRow("Distributor", distributor)
            }
            if let stock = stockToShow {
                infoRow("Availability", stock <= 3 ? "Only \(stock) left" : "\(stock) in stock",
                        highlight: stock <= 3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(AppTheme.surfaceElevated.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func infoRow(_ title: String, _ value: String, highlight: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.system(size: 11))
                .foregroundStyle(AppTheme.textTertiary)
                .frame(width: 84, alignment: .leading)
            Text(value)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(highlight ? AppTheme.accent : AppTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct FullScreenImageView: View {
    let photoPaths: [String?]
    @Binding var selectedIndex: Int
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            TabView(selection: $selectedIndex) {
                ForEach(Array(photoPaths.enumerated()), id: \.offset) { index, path in
                    RoundedRectangle(cornerRadius: 8).fill(AppTheme.surfaceElevated)
                        .overlay(ProductPhoto(path: path, contentMode: .fit, placeholderSize: 60))
                        .tag(index)
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
    .environmentObject(FavoritesStore())
    .environmentObject(AppRouter())
    .environmentObject(AppSession(profile: ProfileStore()))
}
