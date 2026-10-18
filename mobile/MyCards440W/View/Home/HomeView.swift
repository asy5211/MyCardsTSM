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
/// The routes themselves (HomeRoute) live in Shared/AppRouter.swift; the stack's
/// path is owned by AppRouter so other screens (Buy Now, order placed) can drive it.
struct HomeView: View {
    @State private var searchText = ""
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var cartStore: CartStore
    @EnvironmentObject private var session: AppSession
    @AppStorage(NotificationSeen.storageKey) private var seenNotificationsRaw = ""

    // Brands come from AppSession (sample data in Demo mode, the server in Live mode).
    @State private var brands: [Brand] = []
    @State private var brandsError: String?
    @State private var isLoadingBrands = false
    @State private var brandsLoadedFor: DataMode?
    @AppStorage("isApprovedSeller") private var isApprovedSeller = false
    @State private var showSellToUsSheet = false
    // Decided when the banner is tapped (not read live inside the sheet), so a
    // test application auto-approving mid-flow doesn't swap the sheet's content.
    @State private var sellSheetShowsItemForm = false

    private let banners = SampleData.featuredBanners

    /// Red dot on the bell: something in the list hasn't been opened yet.
    private var hasUnreadNotifications: Bool {
        let seen = NotificationSeen.ids(from: seenNotificationsRaw)
        return session.currentNotifications().contains { !seen.contains($0.id) }
    }

    var body: some View {
        NavigationStack(path: $router.path) {
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
            // Reloads when the data source changes, and when the seller standing changes
            // (for example the moment an application is approved).
            .task(id: session.reloadKey) { await loadBrands(force: true) }
            .refreshable {
                await session.refreshMe()
                await loadBrands(force: true)
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
                        NavigationLink(value: HomeRoute.favorites) {
                            badgeIcon(system: "heart")
                        }
                        NavigationLink(value: HomeRoute.notifications) {
                            badgeIcon(system: "bell", showDot: hasUnreadNotifications)
                        }
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
                case .search(let term): ShopBrowseView(brand: nil, searchQuery: term)
                case .favorites: FavoritesView()
                case .notifications: NotificationsView()
                case .checkout(let request): CheckoutView(request: request)
                case .orderConfirmation(let orderID): OrderConfirmationView(orderID: orderID)
                case .liveOrderConfirmation(let orderIDs): LiveOrderConfirmationView(orderIDs: orderIDs)
                case .sellerReviews(let sellerID, let name): ReviewsListView(subject: .seller(id: sellerID, name: name))
                case .sellerProductReviews(let sellerID, let sellerName, let productID, let productName):
                    ReviewsListView(subject: .sellerOnProduct(sellerID: sellerID, sellerName: sellerName,
                                                              productID: productID, productName: productName))
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
                .submitLabel(.search)
                .onSubmit { runSearch() }
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
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: "cube.box")
                    .font(.system(size: 32))
                VStack(alignment: .leading, spacing: 2) {
                    Text("HAVE SEALED PRODUCT?")
                        .font(.footnote.weight(.bold))
                    Text("SELL IT TO US")
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(AppTheme.accent)
                    // This is TSM buying from sellers, not a place to list on the shop.
                    Text("TSM buys sealed inventory from verified sellers. Send us a list and we'll make you an offer. It's not listed in the shop.")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                Button {
                    sellSheetShowsItemForm = isApprovedSeller
                    showSellToUsSheet = true
                } label: {
                    Text("SELL TO US →")
                        .font(.caption.weight(.heavy))
                        .fixedSize()
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
            if brands.isEmpty {
                if showBrandSpinner {
                    ProgressView()
                        .tint(AppTheme.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                } else {
                    brandsProblem
                }
            } else {
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
    }

    /// True while brands are loading, including the first instant before the load starts.
    private var showBrandSpinner: Bool {
        isLoadingBrands || (brandsError == nil && brandsLoadedFor != session.mode)
    }

    /// Shown instead of the brand grid when the server can't be reached.
    private var brandsProblem: some View {
        NeonCard {
            VStack(spacing: 10) {
                Text(brandsError ?? "No brands to show yet.")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
                    .multilineTextAlignment(.center)
                SecondaryButton(title: "Try Again", systemImage: "arrow.clockwise") {
                    Task { await loadBrands(force: true) }
                }
            }
            .frame(maxWidth: .infinity)
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

    // MARK: Actions

    private func runSearch() {
        let term = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return }
        searchText = ""
        router.path.append(HomeRoute.search(term))
    }

    private func loadBrands(force: Bool = false) async {
        if !force, brandsLoadedFor == session.mode, !brands.isEmpty {
            return
        }
        if brandsLoadedFor != session.mode {
            // Don't show the other data source's brands while loading.
            brands = []
        }
        isLoadingBrands = true
        brandsError = nil
        do {
            brands = try await session.fetchBrands()
            brandsLoadedFor = session.mode
        } catch is CancellationError {
            // Screen went away or the data source changed; the next load handles it.
        } catch {
            // A failed pull-to-refresh keeps the brands already on screen.
            if brands.isEmpty {
                brandsError = error.localizedDescription
            }
        }
        isLoadingBrands = false
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
        .environmentObject(FavoritesStore())
        .environmentObject(FavoriteSellersStore())
        .environmentObject(OrderStore())
        .environmentObject(LiveOrderStore())
        .environmentObject(AppRouter())
        .environmentObject(AppSession(profile: ProfileStore()))
}
