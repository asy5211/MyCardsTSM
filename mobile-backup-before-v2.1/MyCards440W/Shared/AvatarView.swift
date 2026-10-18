//
//  AvatarView.swift
//  TSM (The Sealed Market)
//

import SwiftUI
import UIKit

/// Circular profile picture, or a default person icon when there's no photo.
struct AvatarView: View {
    let image: UIImage?
    var size: CGFloat = 56

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Circle().fill(AppTheme.surfaceElevated)
                    Image(systemName: "person.fill")
                        .font(.system(size: size * 0.45))
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(AppTheme.accent, lineWidth: 2))
    }
}

#Preview {
    HStack(spacing: 20) {
        AvatarView(image: nil, size: 56)
        AvatarView(image: nil, size: 110)
    }
    .padding()
    .background(AppTheme.background)
}
