//
//  FavoritesView.swift
//  TSM (The Sealed Market)
//
//  Every product and every seller the person has hearted, in one place.
//

import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var favorites: FavoritesStore
    @EnvironmentObject private var favoriteSellers: FavoriteSellersStore
    @EnvironmentObject private var session: AppSession

    private enum Tab: String, CaseIterable, Identifiable {
        case products = "Products"
        case sellers = "Sellers"
        var id: String { rawValue }
    }

    @State private var tab: Tab = .products
    @State private var errorText: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Picker("Show", selection: $tab) {
                    ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)

                switch tab {
                case .products:
                    productsList
                case .sellers:
                    sellersList
                }
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Favorites")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                CartToolbarButton()
            }
        }
        .task(id: session.storageScope) {
            await refreshPrices()
        }
        .task(id: session.reloadKey) {
            await favoriteSellers.refresh(using: session)
        }
        .alert("Couldn't update favorite sellers", isPresented: Binding(
            get: { errorText != nil },
            set: { if !$0 { errorText = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorText ?? "")
        }
    }

    // MARK: Products

    @ViewBuilder
    private var productsList: some View {
        if favorites.products.isEmpty {
            emptyState(title: "No favorite products yet",
                       hint: "Tap the heart on a product to save it here.")
        } else {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                ForEach(favorites.products) { product in
                    NavigationLink(value: product) {
                        ProductCard(product: product,
                                    isFavorite: true,
                                    onToggleFavorite: { favorites.toggle(product) })
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: Sellers

    @ViewBuilder
    private var sellersList: some View {
        if favoriteSellers.sellers.isEmpty {
            emptyState(title: "No favorite sellers yet",
                       hint: "Tap the heart next to a seller's name on a product page to save them here.")
        } else {
            LazyVStack(spacing: 10) {
                ForEach(favoriteSellers.sellers) { seller in
                    sellerRow(seller)
                }
            }
        }
    }

    private func sellerRow(_ seller: FavoriteSeller) -> some View {
        NeonCard(borderColor: seller.isTsm ? AppTheme.featured : AppTheme.accent) {
            HStack(spacing: 10) {
                NavigationLink(value: HomeRoute.sellerReviews(seller.id, seller.name)) {
                    HStack(spacing: 10) {
                        Image(systemName: "storefront.fill")
                            .foregroundStyle(seller.isTsm ? AppTheme.featured : AppTheme.textPrimary)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(seller.name)
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(AppTheme.textPrimary)
                            HStack(spacing: 4) {
                                Image(systemName: "star.fill").font(.caption2).foregroundStyle(.yellow)
                                Text(ratingText(seller))
                                    .font(.caption2)
                                    .foregroundStyle(AppTheme.textSecondary)
                            }
                            if seller.liveListingCount > 0 {
                                Text("\(seller.liveListingCount) offer\(seller.liveListingCount == 1 ? "" : "s") for sale now")
                                    .font(.caption2)
                                    .foregroundStyle(AppTheme.textTertiary)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Button {
                    Task {
                        do {
                            try await favoriteSellers.remove(seller, using: session)
                        } catch is CancellationError {
                            // Left the screen.
                        } catch {
                            errorText = error.localizedDescription
                        }
                    }
                } label: {
                    Image(systemName: "heart.fill")
                        .foregroundStyle(AppTheme.accent)
                        .padding(8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove \(seller.name) from favorite sellers")
            }
        }
    }

    private func ratingText(_ seller: FavoriteSeller) -> String {
        if seller.ratingCount > 0 {
            return String(format: "%.1f", seller.rating) + " · \(seller.ratingCount) review\(seller.ratingCount == 1 ? "" : "s") · \(seller.salesCount) sales"
        }
        if seller.isTsm { return "Sold and shipped by The Sealed Market" }
        return "No reviews yet (\(seller.salesCount) sales)"
    }

    private func emptyState(title: String, hint: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "heart")
                .font(.system(size: 44))
                .foregroundStyle(AppTheme.textTertiary)
            Text(title)
                .font(.headline)
            Text(hint)
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    /// Saved copies can be out of date (price, sold out). In Live mode, ask the
    /// server for each product again and update the saved copy.
    private func refreshPrices() async {
        guard session.isLive else { return }
        for saved in favorites.products {
            do {
                let fresh = try await session.fetchProductDetail(for: saved)
                favorites.refresh(with: fresh)
            } catch is CancellationError {
                return
            } catch {
                // Keep the saved copy if the server can't be reached.
                continue
            }
        }
    }
}

#Preview {
    NavigationStack {
        FavoritesView()
    }
    .environmentObject(FavoritesStore())
    .environmentObject(FavoriteSellersStore())
    .environmentObject(CartStore())
    .environmentObject(AppSession(profile: ProfileStore()))
}
