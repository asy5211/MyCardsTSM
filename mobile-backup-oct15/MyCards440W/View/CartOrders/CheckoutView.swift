//
//  CheckoutView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct CheckoutView: View {
    let cartLines: [CartLine]

    private var subtotal: Double { cartLines.reduce(0) { $0 + $1.lineTotal } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                sectionHeader("Order Summary")
                ForEach(cartLines) { line in
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

                Divider().overlay(Color.white.opacity(0.1))

                HStack {
                    Text("Total").font(.headline)
                    Spacer()
                    Text(subtotal, format: .currency(code: "USD"))
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(AppTheme.accent)
                }

                Text("Payment is processed securely through Shopify. Funds settle to the marketplace account first; sellers are paid out afterward, per Milestone 4.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)

                PrimaryButton(title: "Proceed to Payment", systemImage: "lock.fill") {
                    launchShopifyCheckout()
                }
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Checkout")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(AppTheme.accent).frame(width: 4, height: 16)
            Text(title).font(.headline)
        }
    }

    private func launchShopifyCheckout() {
        // TODO: hand off to Shopify Checkout (hosted checkout URL, or the
        // Shopify Mobile Buy SDK) once the backend Orders/Payments API
        // exists — this call is where a CartLine list becomes a real Order.
    }
}

#Preview {
    NavigationStack {
        CheckoutView(cartLines: SampleData.makeCartLines())
    }
}
