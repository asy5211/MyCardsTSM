//
//  CheckoutView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//
//  Order summary → shipping address → "Proceed to Payment". Payment is a demo
//  for now (no card is charged, nothing is sent to the server): it records an
//  order on this phone so the whole buying flow can be tried end to end.
//  Shopify payments replace the confirm step when the orders API is built.
//

import SwiftUI

struct CheckoutView: View {
    let request: CheckoutRequest

    @EnvironmentObject private var cartStore: CartStore
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var orderStore: OrderStore
    @EnvironmentObject private var router: AppRouter
    @AppStorage("isSignedIn") private var isSignedIn = false

    @State private var showAddressSheet = false
    @State private var showMissingAddressAlert = false
    @State private var showSignInAlert = false
    @State private var showPaymentConfirm = false

    private var lines: [CartLine] { request.lines }
    private var subtotal: Double { lines.reduce(0) { $0 + $1.lineTotal } }
    private var address: ShippingAddress? { session.shippingAddress }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                sectionHeader("Order Summary")
                ForEach(lines) { line in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.product.name).font(.subheadline.weight(.semibold))
                            Text("Qty \(line.quantity) · \(line.listing.seller.name)")
                                .font(.caption).foregroundStyle(AppTheme.textSecondary)
                        }
                        Spacer()
                        Text(line.lineTotal, format: .currency(code: "USD")).font(.subheadline.weight(.bold))
                    }
                    .padding(12)
                    .background(AppTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                sectionHeader("Ship To")
                shippingCard

                Divider().overlay(Color.white.opacity(0.1))

                HStack {
                    Text("Total").font(.headline)
                    Spacer()
                    Text(subtotal, format: .currency(code: "USD"))
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(AppTheme.accent)
                }

                Text("Payment will be processed securely through Shopify. It isn't connected yet, so for now this places a demo order and no card is charged.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)

                PrimaryButton(title: "Proceed to Payment", systemImage: "lock.fill") {
                    proceedToPayment()
                }
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Checkout")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showAddressSheet) {
            NavigationStack {
                ShippingAddressView(showsCancel: true)
            }
            .tint(AppTheme.accent)
            .preferredColorScheme(.dark)
        }
        .alert("Add a shipping address", isPresented: $showMissingAddressAlert) {
            Button("Add Address") { showAddressSheet = true }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("We need to know where to send your order. Add your address in your account settings, then try again.")
        }
        .alert("Sign in to check out", isPresented: $showSignInAlert) {
            Button("Go to Account") {
                router.popToHome()
                router.tab = .account
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You need an account to place an order.")
        }
        .alert("Place demo order?", isPresented: $showPaymentConfirm) {
            Button("Place Order") { placeOrder() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Shopify payment isn't connected yet, so no card is charged. This records a demo order on this phone for \(subtotal.formatted(.currency(code: "USD"))).")
        }
    }

    // MARK: Pieces

    @ViewBuilder
    private var shippingCard: some View {
        if let address, address.isComplete {
            NeonCard(borderColor: Color.white.opacity(0.15)) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "mappin.and.ellipse")
                        .foregroundStyle(AppTheme.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(address.displayLines, id: \.self) { line in
                            Text(line).font(.footnote)
                        }
                    }
                    Spacer()
                    Button("Change") { showAddressSheet = true }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.accent)
                }
            }
        } else {
            NeonCard {
                VStack(alignment: .leading, spacing: 10) {
                    Label("No shipping address yet", systemImage: "exclamationmark.triangle")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(AppTheme.accent)
                    Text("Add the address to ship this order to. You can change it any time in Account → Edit Profile.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                    SecondaryButton(title: "Add Shipping Address", systemImage: "plus") {
                        showAddressSheet = true
                    }
                }
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(AppTheme.accent).frame(width: 4, height: 16)
            Text(title).font(.headline)
        }
    }

    // MARK: Actions

    private func proceedToPayment() {
        guard isSignedIn else {
            showSignInAlert = true
            return
        }
        guard let address, address.isComplete else {
            showMissingAddressAlert = true
            return
        }
        showPaymentConfirm = true
    }

    private func placeOrder() {
        guard let address, address.isComplete else {
            showMissingAddressAlert = true
            return
        }
        let order = orderStore.place(lines: lines, address: address)
        if request.clearsCart {
            cartStore.removeAll()
        }
        // Replace the whole stack so Back can't return to this checkout and order twice.
        router.path = NavigationPath([HomeRoute.orderConfirmation(order.id)])
    }
}

#Preview {
    NavigationStack {
        CheckoutView(request: CheckoutRequest(lines: SampleData.makeCartLines(), clearsCart: true))
    }
    .environmentObject(CartStore())
    .environmentObject(OrderStore())
    .environmentObject(AppRouter())
    .environmentObject(AppSession(profile: ProfileStore()))
}
