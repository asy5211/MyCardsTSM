//
//  HomeView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

/// Everything pushed from Home uses value-based navigation (NavigationLink(value:)),
/// with every destination registered once, below, at the root of Home's stack.
/// Mixing in state-driven destinations (navigationDestination(item:)) made SwiftUI
/// re-push the shop page on top of the product page, so don't reintroduce them here.
private enum HomeRoute: Hashable {
    case cart
}

struct HomeView: View {
    @State private var searchText = ""
    @EnvironmentObject private var cartStore: CartStore
    @State private var hasUnreadNotifications = true
    @AppStorage("isApprovedSeller") private var isApprovedSeller = false
    @State private var showSellToUsSheet = false
    // Decided when the banner is tapped (not read live inside the sheet), so a
    // test application auto-approving mid-flow doesn't swap the sheet's content.
    @State private var sellSheetShowsItemForm = false

    private let banners = SampleData.featuredBanners
    private let brands = SampleData.brands

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    searchBar
                    bannerCarousel
                    sellToUsBanner
                    shopByBrand
                    trustRow
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(AppTheme.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 6) {
                        Image(systemName: "cube.transparent")

                        Text("TSM")
                            .font(.headline)
                            .fontWeight(.heavy)
                            .foregroundColor(AppTheme.accent)
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 16) {
                        badgeIcon(system: "bell", showDot: hasUnreadNotifications)
                        NavigationLink(value: HomeRoute.cart) {
                            badgeIcon(system: "cart", count: cartStore.totalItemCount)
                        }
                    }
                }
            }
            .foregroundStyle(AppTheme.textPrimary)
            .navigationDestination(for: HomeRoute.self) { route in
                switch route {
                case .cart: CartView()
                }
            }
            .navigationDestination(for: Brand.self) { brand in
                ShopBrowseView(brand: brand)
            }
            .navigationDestination(for: Product.self) { product in
                ProductDetailView(product: product)
            }
            .sheet(isPresented: $showSellToUsSheet) {
                Group {
                    if sellSheetShowsItemForm {
                        NavigationStack { SellToUsItemFormView() }
                    } else {
                        SellToUsGateView()
                    }
                }
                .tint(AppTheme.accent)
                .preferredColorScheme(.dark)
            }
        }
    }

    // MARK: Sections

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(AppTheme.textSecondary)
            TextField("Search Pokémon, Lorcana, Booster Boxes, Stores...", text: $searchText)
                .foregroundStyle(AppTheme.textPrimary)
        }
        .padding(12)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var bannerCarousel: some View {
        TabView {
            ForEach(banners) { banner in
                NeonCard {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(banner.eyebrow)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AppTheme.textSecondary)
                        Text(banner.headline)
                            .font(.system(size: 30, weight: .heavy, design: .rounded))
                        Text(banner.subheadline)
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .tabViewStyle(.page)
        .frame(height: 170)
    }

    private var sellToUsBanner: some View {
        NeonCard {
            HStack {
                Image(systemName: "cube.box")
                    .font(.system(size: 32))
                VStack(alignment: .leading, spacing: 2) {
                    Text("HAVE SEALED")
                        .font(.footnote.weight(.bold))
                    Text("PRODUCT TO SELL?")
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(AppTheme.accent)
                    Text("Sell sealed inventory from your store and reach thousands of buyers.")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                Spacer()
                Button {
                    sellSheetShowsItemForm = isApprovedSeller
                    showSellToUsSheet = true
                } label: {
                    Text("SELL HERE →")
                        .font(.caption.weight(.heavy))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(AppTheme.accent)
                        .clipShape(Capsule())
                        .foregroundStyle(.white)
                }
            }
        }
    }

    private var shopByBrand: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Rectangle()
                    .fill(AppTheme.accent)
                    .frame(width: 4, height: 18)
                Text("Shop by Brand")
                    .font(.title3.weight(.bold))
                Spacer()
                Text("View All")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AppTheme.accent)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(brands) { brand in
                    NavigationLink(value: brand) {
                        HStack {
                            Text(brand.name.uppercased())
                                .font(.footnote.weight(.heavy))
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .padding(14)
                        .background(AppTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(AppTheme.accent.opacity(0.6))
                        )
                        .foregroundStyle(AppTheme.textPrimary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var trustRow: some View {
        HStack {
            trustItem(system: "checkmark.shield",
                      title: "VERIFIED SOURCES",
                      subtitle: "All stores are pre-approved.")
            trustItem(system: "tag",
                      title: "LOWEST AVAILABLE PRICE",
                      subtitle: "Best price across all sellers.")
            trustItem(system: "shippingbox",
                      title: "CHOOSE EXACT STORE & BOX",
                      subtitle: "View by store, case, and box.")
        }
        .padding(.bottom, 24)
    }

    private func trustItem(system: String, title: String, subtitle: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: system)
                .foregroundStyle(AppTheme.accent)
            Text(title)
                .font(.system(size: 9, weight: .bold))
                .multilineTextAlignment(.center)
            Text(subtitle)
                .font(.system(size: 8))
                .foregroundStyle(AppTheme.textTertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func badgeIcon(system: String, count: Int = 0, showDot: Bool = false) -> some View {
        ZStack(alignment: .topTrailing) {
            Image(systemName: system)
                .foregroundStyle(AppTheme.textPrimary)
            if count > 0 {
                Text("\(count)")
                    .font(.system(size: 9, weight: .bold))
                    .padding(4)
                    .background(AppTheme.accent)
                    .clipShape(Circle())
                    .foregroundStyle(.white)
                    .offset(x: 8, y: -8)
            } else if showDot {
                Circle()
                    .fill(AppTheme.accent)
                    .frame(width: 8, height: 8)
                    .offset(x: 6, y: -6)
            }
        }
    }
}

// Customize equality/hash without re-declaring Hashable conformance
extension Brand {
    static func == (lhs: Brand, rhs: Brand) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

extension Product: Hashable {
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

#Preview {
    HomeView()
        .environmentObject(CartStore())
}
