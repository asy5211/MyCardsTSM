//
//  CartToolbarButton.swift
//  TSM (The Sealed Market)
//
//  The cart icon with an item-count badge, for the top corner of any screen
//  pushed inside Home's stack. Tapping it opens the cart.
//

import SwiftUI

struct CartToolbarButton: View {
    @EnvironmentObject private var cartStore: CartStore

    var body: some View {
        NavigationLink(value: HomeRoute.cart) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "cart")
                    .foregroundStyle(AppTheme.textPrimary)
                if cartStore.totalItemCount > 0 {
                    Text("\(cartStore.totalItemCount)")
                        .font(.system(size: 9, weight: .bold))
                        .padding(4)
                        .background(AppTheme.accent)
                        .clipShape(Circle())
                        .foregroundStyle(.white)
                        .offset(x: 8, y: -8)
                }
            }
        }
        .accessibilityLabel("Cart, \(cartStore.totalItemCount) items")
    }
}

/// A short message that slides in above the bottom bar, e.g. "Added to cart".
struct CartToast: Equatable {
    let id = UUID()
    let message: String
}

/// The pill shown for a CartToast, with a shortcut to the cart.
struct CartToastView: View {
    let toast: CartToast
    let onViewCart: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(AppTheme.verifiedGreen)
            Text(toast.message)
                .font(.footnote.weight(.semibold))
                .lineLimit(2)
            Spacer(minLength: 8)
            Button(action: onViewCart) {
                Text("VIEW CART")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(AppTheme.accent)
                    .clipShape(Capsule())
                    .foregroundStyle(.white)
            }
        }
        .padding(12)
        .background(AppTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(AppTheme.verifiedGreen.opacity(0.6)))
        .padding(.horizontal, 14)
        .foregroundStyle(AppTheme.textPrimary)
    }
}
