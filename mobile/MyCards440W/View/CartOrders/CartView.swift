//
//  CartView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct CartView: View {
    @EnvironmentObject private var cartStore: CartStore
    @Environment(\.dismiss) private var dismiss

    private var cartLines: [CartLine] { cartStore.lines }
    private var subtotal: Double { cartStore.subtotal }

    var body: some View {
        VStack(spacing: 0) {
            if cartLines.isEmpty {
                emptyState
            } else {
                ScrollView {
                    VStack(spacing: 14) {
                        ForEach(cartLines) { line in
                            cartLineCard(line)
                        }
                    }
                    .padding(16)
                }
                summaryBar
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Your Cart")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "cart").font(.system(size: 44)).foregroundStyle(AppTheme.textTertiary)
            Text("Your cart is empty").foregroundStyle(AppTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func cartLineCard(_ line: CartLine) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(line.product.name).font(.subheadline.weight(.bold))
                Spacer()
                Button { remove(line) } label: {
                    Image(systemName: "trash").foregroundStyle(AppTheme.accent)
                }
            }
            // Reuses the exact seller/source row from the product detail
            // page (spec 3.7), with the Add to Cart / Buy Now actions hidden.
            ListingRow(listing: line.listing, isTopOffer: false, showActions: false)
            HStack {
                Text("Qty").font(.caption).foregroundStyle(AppTheme.textSecondary)
                Stepper("\(line.quantity)", value: quantityBinding(for: line), in: 1...10)
                    .fixedSize()
                Spacer()
                Text(line.lineTotal, format: .currency(code: "USD")).font(.subheadline.weight(.bold))
            }
        }
        .padding(14)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius))
    }

    private func quantityBinding(for line: CartLine) -> Binding<Int> {
        Binding(
            get: { cartStore.lines.first(where: { $0.id == line.id })?.quantity ?? 1 },
            set: { newValue in cartStore.setQuantity(for: line.id, to: newValue) }
        )
    }

    private func remove(_ line: CartLine) {
        cartStore.remove(line)
    }

    private var summaryBar: some View {
        VStack(spacing: 10) {
            HStack {
                Text("Subtotal").foregroundStyle(AppTheme.textSecondary)
                Spacer()
                Text(subtotal, format: .currency(code: "USD")).font(.headline.weight(.heavy))
            }
            NavigationLink(value: HomeRoute.checkout(CheckoutRequest(lines: cartLines, clearsCart: true))) {
                Text("CHECKOUT")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(.white)
                    .background(AppTheme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius))
            }
            SecondaryButton(title: "Back to Shopping") { dismiss() }
        }
        .padding(16)
        .background(.black.opacity(0.95))
        .overlay(Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1), alignment: .top)
    }
}

#Preview {
    NavigationStack {
        CartView()
    }
    .environmentObject(CartStore())
}
