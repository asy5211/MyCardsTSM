//
//  TokenStore.swift
//  TSM (The Sealed Market)
//
//  Keeps the sign-in token in the iOS Keychain (not UserDefaults), so it is
//  encrypted at rest and never ends up in a backup of the app's plain files.
//

import Foundation
import Security

enum TokenStore {
    private static let account = "authToken"

    private static var service: String {
        Bundle.main.bundleIdentifier ?? "com.tsm.app"
    }

    private static func baseQuery() -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    static func save(_ token: String) {
        delete()
        var query = baseQuery()
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        _ = SecItemAdd(query as CFDictionary, nil)
    }

    static func load() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    static func delete() {
        _ = SecItemDelete(baseQuery() as CFDictionary)
    }
}
