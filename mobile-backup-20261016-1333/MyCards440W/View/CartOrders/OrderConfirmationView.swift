//
//  OrderConfirmationView.swift
//  TSM (The Sealed Market)
//
//  Shown right after an order is placed.
//

import SwiftUI

struct OrderConfirmationView: View {
    let orderID: UUID

    @EnvironmentObject private var orderStore: OrderStore
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(AppTheme.verifiedGreen)
                    .padding(.top, 30)

                if let order = orderStore.order(withID: orderID) {
                    Text("Order Placed").font(.title2.weight(.heavy))
                    Text(order.orderNumber)
                        .font(.headline)
                        .foregroundStyle(AppTheme.accent)

                    summaryCard(order)

                    if let address = order.shippingAddress {
                        NeonCard(borderColor: Color.white.opacity(0.15)) {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "mappin.and.ellipse").foregroundStyle(AppTheme.accent)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Shipping to").font(.caption).foregroundStyle(AppTheme.textSecondary)
                                    ForEach(address.displayLines, id: \.self) { line in
                                        Text(line).font(.footnote)
                                    }
                                }
                                Spacer()
                            }
                        }
                    }

                    Text("This is a demo order — no card was charged, and it is only kept on this phone until you close the app.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textTertiary)
                        .multilineTextAlignment(.center)
                } else {
                    Text("Order not found").font(.title3.weight(.bold))
                    Text("This demo order is no longer available.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                }

                PrimaryButton(title: "View My Orders", systemImage: "shippingbox") {
                    router.popToHome()
                    router.tab = .orders
                }
                SecondaryButton(title: "Keep Shopping") {
                    router.popToHome()
                }
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Order Placed")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
    }

    private func summaryCard(_ order: Order) -> some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(order.items) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.product.name).font(.subheadline.weight(.semibold))
                            Text("Qty \(item.quantity) · \(item.listing.seller.name)")
                                .font(.caption)
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                        Spacer()
                        Text(item.listing.price * Double(item.quantity), format: .currency(code: "USD"))
                            .font(.subheadline.weight(.bold))
                    }
                }
                Divider().overlay(Color.white.opacity(0.1))
                HStack {
                    Text("Total").font(.headline)
                    Spacer()
                    Text(order.total, format: .currency(code: "USD"))
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(AppTheme.accent)
                }
            }
        }
    }
}
