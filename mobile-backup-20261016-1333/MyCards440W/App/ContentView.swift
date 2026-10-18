//
//  ContentView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

// MARK: - Tabs

enum AppTab: Hashable {
    case home, orders, sell, account
}

// MARK: - Root

/// App root. Shows the sign-in flow until the user signs in (or continues as
/// a guest), then shows the main tab bar:
///
///   Home     → HomeView (search, brands, cart, product detail, Sell to Us banner)
///   Orders   → PurchaseHistoryView → OrderDetailView
///   Sell     → SellToUsTicketListView → SellToUsTicketDetailView,
///              plus "New Submission" (gate → seller application, or item form)
///   Account  → edit profile & photo (tap the header), seller application, sign out
///
/// Brand pages, product detail, the cart, checkout and favorites are all pushed
/// inside Home's single NavigationStack (value-based links, destinations
/// registered once in HomeView). AppRouter owns that stack's path and the
/// selected tab, so any screen can jump around (e.g. Buy Now → checkout).
/// Deep link `tsm://reset-password?token=…` opens ResetPasswordView.
///
/// Demo data vs live server: AppSession (Shared/AppSession.swift) decides. In
/// Live mode it signs in against the TSM server and keeps the two flags below
/// in step with it; in Demo mode they behave exactly as they always did.
struct ContentView: View {
    @AppStorage("isSignedIn") private var isSignedIn = false
    @AppStorage("isApprovedSeller") private var isApprovedSeller = false
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var favorites: FavoritesStore
    @EnvironmentObject private var ticketStore: SellToUsTicketStore
    @EnvironmentObject private var orderStore: OrderStore
    @State private var isGuest = false
    @State private var showResetPassword = false
    @State private var resetToken: String?

    var body: some View {
        Group {
            if isSignedIn || isGuest {
                mainTabs
            } else {
                SignInView(isSignedIn: $isSignedIn, isGuest: $isGuest)
            }
        }
        .tint(AppTheme.accent)
        .preferredColorScheme(.dark)
        .task { await session.bootstrap() }
        // Favorites and tickets belong to one person (or the demo); switch lists when that changes.
        .task(id: session.storageScope) {
            favorites.useScope(session.storageScope)
            ticketStore.useScope(session.storageScope)
            orderStore.clear()
        }
        .onOpenURL { handle($0) }
        .sheet(isPresented: $showResetPassword) {
            NavigationStack { ResetPasswordView(token: resetToken) }
                .tint(AppTheme.accent)
                .preferredColorScheme(.dark)
        }
    }

    /// Handles incoming links. Register the `tsm` scheme under the
    /// target's Info → URL Types. Test in the simulator with (use the link
    /// printed by the backend's `npm run dev` window):
    ///   xcrun simctl openurl booted "tsm://reset-password?token=…"
    private func handle(_ url: URL) {
        guard url.scheme == "tsm" else { return }
        switch url.host {
        case "reset-password":
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
            resetToken = items?.first(where: { $0.name == "token" })?.value
            showResetPassword = true
        default:
            break
        }
    }

    private var mainTabs: some View {
        TabView(selection: $router.tab) {
            // HomeView already owns its NavigationStack.
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
                .tag(AppTab.home)

            // PurchaseHistoryView expects a parent NavigationStack.
            NavigationStack {
                PurchaseHistoryView()
            }
            .tabItem { Label("Orders", systemImage: "shippingbox") }
            .tag(AppTab.orders)

            SellTabView(isApprovedSeller: isApprovedSeller)
                .tabItem { Label("Sell", systemImage: "tag") }
                .tag(AppTab.sell)

            AccountTabView(isSignedIn: $isSignedIn,
                           isGuest: $isGuest,
                           isApprovedSeller: $isApprovedSeller)
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(AppTab.account)
        }
        .toolbarBackground(AppTheme.background, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
    }
}

// MARK: - Sell tab

/// Lists the user's Sell to Us tickets and starts a new submission.
/// Unapproved users see the approval gate (which leads to the seller
/// application); approved sellers go straight to the item form.
private struct SellTabView: View {
    let isApprovedSeller: Bool

    @EnvironmentObject private var session: AppSession

    @State private var showGate = false
    @State private var showItemForm = false

    var body: some View {
        NavigationStack {
            SellToUsTicketListView()
                .safeAreaInset(edge: .bottom) {
                    PrimaryButton(title: "New Submission", systemImage: "plus") {
                        if isApprovedSeller {
                            showItemForm = true
                        } else {
                            showGate = true
                        }
                    }
                    .padding(16)
                    .background(.black.opacity(0.95))
                }
                .navigationDestination(isPresented: $showItemForm) {
                    SellToUsItemFormView()
                }
                .sheet(isPresented: $showGate) {
                    SellToUsGateView()
                }
        }
        // Pick up a decision on the seller application made since last time.
        .task { await session.refreshMe() }
    }
}

// MARK: - Account tab

private struct AccountTabView: View {
    @Binding var isSignedIn: Bool
    @Binding var isGuest: Bool
    @Binding var isApprovedSeller: Bool

    @EnvironmentObject private var profile: ProfileStore
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var router: AppRouter

    @State private var showSignOutConfirm = false

    private var displayName: String {
        let name = profile.username.trimmingCharacters(in: .whitespaces)
        if !name.isEmpty { return name }
        return isSignedIn ? "Your Account" : "Guest"
    }

    private var subtitle: String {
        profile.email.isEmpty ? "Edit profile & photo" : profile.email
    }

    var body: some View {
        NavigationStack {
            List {
                // Tap the account header to edit profile info and photo.
                Section {
                    NavigationLink {
                        EditProfileView()
                    } label: {
                        HStack(spacing: 14) {
                            AvatarView(image: profile.avatar, size: 56)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(displayName)
                                    .font(.headline)
                                Text(subtitle)
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.textSecondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listRowBackground(AppTheme.surface)

                Section("Shopping") {
                    Button {
                        router.showOnHome(.favorites)
                    } label: {
                        Label("Favorites", systemImage: "heart")
                    }
                    if isSignedIn {
                        NavigationLink {
                            ShippingAddressView()
                        } label: {
                            HStack {
                                Label("Shipping Address", systemImage: "mappin.and.ellipse")
                                Spacer()
                                Text(session.shippingAddress == nil ? "Not set" : "Saved")
                                    .font(.footnote)
                                    .foregroundStyle(AppTheme.textSecondary)
                            }
                        }
                    }
                }
                .listRowBackground(AppTheme.surface)

                Section("Selling") {
                    NavigationLink {
                        SellerApplicationEntryView()
                    } label: {
                        Label("Seller Application", systemImage: "doc.text")
                    }

                    if session.isLive {
                        // Live: the server decides (staff approve applications).
                        HStack {
                            Label("Seller status", systemImage: "checkmark.seal")
                            Spacer()
                            Text(session.sellerStatusText)
                                .font(.footnote)
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                    } else {
                        // Demo: stand-in for approval. Turn on to skip the gate
                        // and open the item form directly.
                        Toggle(isOn: $isApprovedSeller) {
                            Label("Approved Seller (demo)", systemImage: "checkmark.seal")
                        }
                    }
                }
                .listRowBackground(AppTheme.surface)

                if isSignedIn && session.isLive {
                    Section("Privacy & security") {
                        NavigationLink {
                            AccountSecurityView()
                        } label: {
                            Label("Password, data export & deletion", systemImage: "lock.shield")
                        }
                    }
                    .listRowBackground(AppTheme.surface)
                }

                Section("Demo tools") {
                    DemoToolsRows()
                }
                .listRowBackground(AppTheme.surface)

                Section {
                    if isSignedIn {
                        Button(role: .destructive) {
                            showSignOutConfirm = true
                        } label: {
                            Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    } else {
                        Button {
                            isGuest = false
                        } label: {
                            Label("Sign In or Create Account", systemImage: "person.badge.key")
                        }
                    }
                }
                .listRowBackground(AppTheme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(AppTheme.background.ignoresSafeArea())
            .foregroundStyle(AppTheme.textPrimary)
            .navigationTitle("Account")
            .task { await session.refreshMe() }
            .alert("Sign out?", isPresented: $showSignOutConfirm) {
                Button("Sign Out", role: .destructive) { signOut() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Are you sure you want to sign out?")
            }
        }
    }

    private func signOut() {
        session.signOut()
        isSignedIn = false
        isGuest = false
        // Start the next sign-in from the Home screen.
        router.popToHome()
        router.tab = .home
    }
}

// MARK: - Sign in

/// Entry screen that makes CreateAccountView and ForgotPasswordView reachable.
private struct SignInView: View {
    @Binding var isSignedIn: Bool
    @Binding var isGuest: Bool

    @EnvironmentObject private var session: AppSession

    @State private var email = ""
    @State private var password = ""
    @State private var isPasswordVisible = false
    @State private var isWorking = false
    @State private var errorMessage: String?

    private var canSubmit: Bool { !email.isEmpty && !password.isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header

                    NeonCard {
                        VStack(alignment: .leading, spacing: 16) {
                            field(session.isLive ? "Email or Username" : "Email Address", systemImage: "envelope") {
                                TextField(session.isLive ? "Enter your email or username..." : "Enter your email address...",
                                          text: $email)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                            }

                            field("Password", systemImage: "lock") {
                                HStack {
                                    Group {
                                        if isPasswordVisible {
                                            TextField("Enter your password...", text: $password)
                                        } else {
                                            SecureField("Enter your password...", text: $password)
                                        }
                                    }
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()

                                    Button { isPasswordVisible.toggle() } label: {
                                        Image(systemName: isPasswordVisible ? "eye.slash" : "eye")
                                            .foregroundStyle(AppTheme.textSecondary)
                                    }
                                }
                            }

                            HStack {
                                Spacer()
                                NavigationLink {
                                    ForgotPasswordView()
                                } label: {
                                    Text("Forgot password?")
                                        .font(.footnote.weight(.semibold))
                                        .foregroundStyle(AppTheme.accent)
                                }
                            }
                        }
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.accent)
                    }

                    PrimaryButton(title: isWorking ? "Signing In…" : "Sign In", systemImage: "arrow.right") {
                        signIn()
                    }
                    .disabled(!canSubmit || isWorking)
                    .opacity(canSubmit && !isWorking ? 1 : 0.5)

                    SecondaryButton(title: "Continue as Guest") {
                        isGuest = true
                    }

                    HStack {
                        Spacer()
                        Text("New here?")
                            .foregroundStyle(AppTheme.textSecondary)
                        NavigationLink {
                            CreateAccountView()
                        } label: {
                            Text("Create Account")
                                .foregroundStyle(AppTheme.accent)
                        }
                        Spacer()
                    }
                    .font(.footnote.weight(.semibold))

                    #if DEBUG
                    if session.isLive {
                        demoLogins
                    }
                    #endif

                    HStack {
                        Spacer()
                        DataSourceMenu()
                        Spacer()
                    }
                }
                .padding(20)
            }
            .background(AppTheme.background.ignoresSafeArea())
            .foregroundStyle(AppTheme.textPrimary)
        }
    }

    #if DEBUG
    /// Shortcuts to the seed-data accounts. Only compiled into debug builds.
    private var demoLogins: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Demo logins (debug builds only)")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(AppTheme.textTertiary)
            HStack(spacing: 8) {
                demoLoginButton("Buyer", login: "buyer@tsm.test")
                demoLoginButton("Seller", login: "seller@tsm.test")
                demoLoginButton("Applicant", login: "applicant@tsm.test")
            }
        }
    }

    private func demoLoginButton(_ title: String, login: String) -> some View {
        Button {
            email = login
            password = "Password1!"
        } label: {
            Text(title)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(AppTheme.surface)
                .clipShape(Capsule())
                .foregroundStyle(AppTheme.textSecondary)
        }
    }
    #endif

    private var header: some View {
        NeonCard {
            HStack(spacing: 14) {
                Image(systemName: "cube.transparent")
                    .font(.system(size: 40))
                Rectangle().fill(AppTheme.accent).frame(width: 3)
                VStack(alignment: .leading, spacing: 4) {
                    Text("WELCOME").font(.system(size: 22, weight: .heavy, design: .rounded))
                    Text("BACK")
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                        .foregroundStyle(AppTheme.accent)
                    Text("Sign in to buy from verified sellers and manage your orders.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
    }

    private func field<Content: View>(_ label: String, systemImage: String,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote.weight(.semibold))
            HStack {
                Image(systemName: systemImage).foregroundStyle(AppTheme.textSecondary)
                content().foregroundStyle(AppTheme.textPrimary)
            }
            .padding(12)
            .background(AppTheme.background)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
        }
    }

    private func signIn() {
        errorMessage = nil
        isWorking = true
        let login = email.trimmingCharacters(in: .whitespaces)
        let secret = password
        Task {
            do {
                try await session.signIn(login: login, password: secret)
                isSignedIn = true
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                errorMessage = error.localizedDescription
            }
            isWorking = false
        }
    }
}

#Preview {
    let profile = ProfileStore()
    ContentView()
        .environmentObject(CartStore())
        .environmentObject(profile)
        .environmentObject(AppSession(profile: profile))
        .environmentObject(AppRouter())
        .environmentObject(FavoritesStore())
        .environmentObject(OrderStore())
        .environmentObject(SellToUsTicketStore())
}
