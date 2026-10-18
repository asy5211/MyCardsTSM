//
//  Theme.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

/// Design tokens pulled from the marketplace wireframes: black backgrounds,
/// red neon accents, bold condensed headline type.
enum AppTheme {
    // MARK: Colors
    static let background = Color.black
    static let surface = Color(red: 0.07, green: 0.07, blue: 0.07)
    static let surfaceElevated = Color(red: 0.11, green: 0.05, blue: 0.05)

    static let accent = Color(red: 0.90, green: 0.08, blue: 0.12)      // primary red
    static let accentDim = Color(red: 0.90, green: 0.08, blue: 0.12).opacity(0.35)
    static let gold = Color(red: 0.95, green: 0.78, blue: 0.20)        // "your listing" highlight
    static let verifiedGreen = Color(red: 0.30, green: 0.80, blue: 0.40)

    static let textPrimary = Color.white
    static let textSecondary = Color(white: 0.65)
    static let textTertiary = Color(white: 0.45)

    // MARK: Metrics
    static let cornerRadius: CGFloat = 14
    static let borderWidth: CGFloat = 1.5
    static let cardPadding: CGFloat = 14

    // MARK: Reusable border/glow style
    static func card() -> some ShapeStyle { surface }
}

/// A card container with the red neon border used throughout the wireframes.
struct NeonCard<Content: View>: View {
    var borderColor: Color = AppTheme.accent
    var fill: Color = AppTheme.surface
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(AppTheme.cardPadding)
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
                    .stroke(borderColor, lineWidth: AppTheme.borderWidth)
            )
    }
}

/// Filled red CTA button ("Buy Now", "Submit", "Create Account", ...).
struct PrimaryButton: View {
    let title: String
    var systemImage: String?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title.uppercased())
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(.white)
            .background(AppTheme.accent)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
        }
    }
}

/// Outlined secondary button ("Cancel", "Add to Cart", ...).
struct SecondaryButton: View {
    let title: String
    var systemImage: String?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title.uppercased())
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(.white)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.25), lineWidth: 1)
            )
        }
    }
}
