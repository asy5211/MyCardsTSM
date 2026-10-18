//
//  ProductPhoto.swift
//  TSM (The Sealed Market)
//
//  A product photo uploaded in the admin site and served by the TSM server.
//  While it loads, when the product has no photo yet, or when the photo can't
//  be reached, the familiar shipping-box placeholder is shown instead — so a
//  card or page is never blank and never shows a broken-image icon.
//

import SwiftUI

struct ProductPhoto: View {
    /// The photo's path from the server ("/media/products/…"). nil = no photo yet.
    let path: String?
    /// .fill crops to the frame (shop cards); .fit shows the whole photo (product page).
    var contentMode: ContentMode = .fill
    /// Size of the placeholder icon.
    var placeholderSize: CGFloat = 24

    var body: some View {
        if let url = AppConfig.mediaURL(for: path) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                case .failure:
                    placeholder
                default:
                    placeholder.overlay(ProgressView().tint(AppTheme.textSecondary))
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        ZStack {
            Color.clear
            Image(systemName: "shippingbox.fill")
                .font(.system(size: placeholderSize))
                .foregroundStyle(AppTheme.textTertiary)
        }
    }
}
