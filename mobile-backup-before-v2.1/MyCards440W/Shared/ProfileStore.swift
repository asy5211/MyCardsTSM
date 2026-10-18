//
//  ProfileStore.swift
//  TSM (The Sealed Market)
//

import Foundation
import Combine
import UIKit

/// App-wide profile state, injected once at the root as an `@EnvironmentObject`.
///
/// Persisted locally (name/email/phone in UserDefaults, the photo as a small
/// JPEG in the Documents folder). In Live mode AppSession overwrites the text
/// fields with what the server says after sign-in and after each profile save;
/// the photo stays on this device until photo upload is built.
final class ProfileStore: ObservableObject {
    @Published private(set) var username: String = ""
    @Published private(set) var email: String = ""
    @Published private(set) var phone: String = ""
    @Published private(set) var avatar: UIImage?

    private enum Keys {
        static let username = "profileUsername"
        static let email = "profileEmail"
        static let phone = "profilePhone"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.username = defaults.string(forKey: Keys.username) ?? ""
        self.email = defaults.string(forKey: Keys.email) ?? ""
        self.phone = defaults.string(forKey: Keys.phone) ?? ""
        self.avatar = UIImage(contentsOfFile: Self.avatarURL.path)
    }

    func update(username: String, email: String, phone: String) {
        self.username = username
        self.email = email
        self.phone = phone
        defaults.set(username, forKey: Keys.username)
        defaults.set(email, forKey: Keys.email)
        defaults.set(phone, forKey: Keys.phone)
    }

    /// Forgets everything about the signed-in person (used when switching
    /// between demo and live data, and when signing out of a live account).
    func clear() {
        update(username: "", email: "", phone: "")
        setAvatar(nil)
    }

    /// Pass nil to remove the photo.
    func setAvatar(_ image: UIImage?) {
        guard let image else {
            avatar = nil
            try? FileManager.default.removeItem(at: Self.avatarURL)
            return
        }
        let scaled = Self.downscaled(image, maxDimension: 512)
        avatar = scaled
        if let jpeg = scaled.jpegData(compressionQuality: 0.85) {
            try? jpeg.write(to: Self.avatarURL, options: .atomic)
        }
    }

    private static var avatarURL: URL {
        FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("profile-avatar.jpg")
    }

    private static func downscaled(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let longest = max(image.size.width, image.size.height)
        guard longest > maxDimension else { return image }
        let scale = maxDimension / longest
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        return UIGraphicsImageRenderer(size: newSize).image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
