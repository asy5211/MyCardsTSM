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
/// Brand pages, product detail and the cart are all pushed inside Home's single
/// NavigationStack (value-based links, destinations registered once in HomeView).
/// Deep link `tsm://reset-password` opens ResetPasswordView.
struct ContentView: View {
    // TODO: replace these flags with real session state once the Auth API
    // exists (e.g. an ObservableObject holding the token + user profile).
    @AppStorage("isSignedIn") private var isSignedIn = false
    @AppStorage("isApprovedSeller") private var isApprovedSeller = false
    @State private var isGuest = false
    @State private var selectedTab: AppTab = .home
    @State private var showResetPassword = false

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
        .onOpenURL { handle($0) }
        .sheet(isPresented: $showResetPassword) {
            NavigationStack { ResetPasswordView() }
                .tint(AppTheme.accent)
                .preferredColorScheme(.dark)
        }
    }

    /// Handles incoming links. Register the `tsm` scheme under the
    /// target's Info → URL Types. Test in the simulator with:
    ///   xcrun simctl openurl booted "tsm://reset-password"
    private func handle(_ url: URL) {
        guard url.scheme == "tsm" else { return }
        switch url.host {
        case "reset-password":
            // TODO: read the reset token from the URL's query items and
            // pass it to ResetPasswordView once that view accepts one.
            showResetPassword = true
        default:
            break
        }
    }

    private var mainTabs: some View {
        TabView(selection: $selectedTab) {
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
    }
}

// MARK: - Account tab

private struct AccountTabView: View {
    @Binding var isSignedIn: Bool
    @Binding var isGuest: Bool
    @Binding var isApprovedSeller: Bool

    @EnvironmentObject private var profile: ProfileStore

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

                Section("Selling") {
                    NavigationLink {
                        SellerApplicationView()
                    } label: {
                        Label("Seller Application", systemImage: "doc.text")
                    }

                    // Stand-in until approval status comes from the backend.
                    // Turn on to skip the gate and open the item form directly.
                    Toggle(isOn: $isApprovedSeller) {
                        Label("Approved Seller (demo)", systemImage: "checkmark.seal")
                    }
                }
                .listRowBackground(AppTheme.surface)

                Section {
                    if isSignedIn {
                        Button(role: .destructive) {
                            isSignedIn = false
                            isGuest = false
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
        }
    }
}

// MARK: - Sign in

/// Entry screen that makes CreateAccountView and ForgotPasswordView reachable.
private struct SignInView: View {
    @Binding var isSignedIn: Bool
    @Binding var isGuest: Bool

    @EnvironmentObject private var profile: ProfileStore

    @State private var email = ""
    @State private var password = ""
    @State private var isPasswordVisible = false

    private var canSubmit: Bool { !email.isEmpty && !password.isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header

                    NeonCard {
                        VStack(alignment: .leading, spacing: 16) {
                            field("Email Address", systemImage: "envelope") {
                                TextField("Enter your email address...", text: $email)
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

                    PrimaryButton(title: "Sign In", systemImage: "arrow.right") {
                        signIn()
                    }
                    .disabled(!canSubmit)
                    .opacity(canSubmit ? 1 : 0.5)

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
                }
                .padding(20)
            }
            .background(AppTheme.background.ignoresSafeArea())
            .foregroundStyle(AppTheme.textPrimary)
        }
    }

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
        // TODO: authenticate against the Auth API; only set isSignedIn on success
        // and show an error message otherwise.
        if profile.email.isEmpty {
            // Seed the profile so Edit Profile isn't blank the first time.
            profile.update(username: profile.username, email: email, phone: profile.phone)
        }
        isSignedIn = true
    }
}

#Preview {
    ContentView()
        .environmentObject(CartStore())
        .environmentObject(ProfileStore())
}
