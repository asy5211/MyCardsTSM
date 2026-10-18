//
//  MyCards440WApp.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

// NOTE: kept this file named MyCards440WApp.swift so your existing Xcode
// project reference isn't orphaned — only the type name changed below.
// If you want the file itself renamed to TSMApp.swift, do that from
// Xcode's Project Navigator (right-click > Rename) rather than replacing
// the file on disk, so the project reference moves with it.
@main
struct TSMApp: App {
    @StateObject private var cartStore = CartStore()
    @StateObject private var profileStore: ProfileStore
    // Knows who is signed in and whether the app uses demo data or the live
    // server. It needs the profile store, so both are created together.
    @StateObject private var session: AppSession

    init() {
        let profile = ProfileStore()
        _profileStore = StateObject(wrappedValue: profile)
        _session = StateObject(wrappedValue: AppSession(profile: profile))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(cartStore)
                .environmentObject(profileStore)
                .environmentObject(session)
        }
    }
}
