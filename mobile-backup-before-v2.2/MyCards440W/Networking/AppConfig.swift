//
//  AppConfig.swift
//  TSM (The Sealed Market)
//
//  Where the app gets its data, and the address of the TSM server.
//

import Foundation

/// Where the app gets its data.
///  - mock: the built-in sample data, exactly like before (works with no server).
///  - live: the real TSM server (`npm run dev` in ~/School/backend).
enum DataMode: String, CaseIterable, Identifiable {
    case mock
    case live

    var id: String { rawValue }

    var title: String {
        switch self {
        case .mock: return "Demo data"
        case .live: return "Live server"
        }
    }
}

enum AppConfig {
    /// The iOS Simulator reaches the Mac's own server at 127.0.0.1.
    /// A real iPhone needs the Mac's network address instead (type it in
    /// Account → Demo tools → Server address).
    static let defaultServerAddress = "http://127.0.0.1:4000"

    static let modeKey = "dataMode"
    static let serverAddressKey = "serverAddress"

    /// Turns what someone typed into a usable base URL, or nil if it isn't one.
    static func makeBaseURL(from text: String) -> URL? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") {
            trimmed.removeLast()
        }
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host, !host.isEmpty else {
            return nil
        }
        return url
    }

    /// The address to talk to right now. Falls back to the default if the
    /// saved text isn't a valid address.
    static func currentBaseURL() -> URL {
        let saved = UserDefaults.standard.string(forKey: serverAddressKey) ?? defaultServerAddress
        if let url = makeBaseURL(from: saved) {
            return url
        }
        return URL(string: defaultServerAddress)!
    }
}
