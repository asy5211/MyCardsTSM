//
//  FavoritesView.swift
//  TSM (The Sealed Market)
//
//  Every product the person has hearted, in one place.
//

import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var favorites: FavoritesStore
    @EnvironmentObject private var session: AppSession

    var body: some View {
        ScrollView {
            if favorites.products.isEmpty {
                emptyState
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
                .padding(16)
            }
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
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "heart")
                .font(.system(size: 44))
                .foregroundStyle(AppTheme.textTertiary)
            Text("No favorites yet")
                .font(.headline)
            Text("Tap the heart on a product to save it here.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 80)
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
    .environmentObject(CartStore())
    .environmentObject(AppSession(profile: ProfileStore()))
}
