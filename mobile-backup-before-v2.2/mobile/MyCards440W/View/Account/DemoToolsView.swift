//
//  DemoToolsView.swift
//  TSM (The Sealed Market)
//
//  The Demo data ⇄ Live server switch. A compact menu for the sign-in screen,
//  and the full set of rows for Account → Demo tools.
//

import SwiftUI

/// Small "Using: Live server ▾" menu shown under the sign-in form so the data
/// source can be changed before anyone is signed in.
struct DataSourceMenu: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        Menu {
            Picker("Data source", selection: $session.mode) {
                ForEach(DataMode.allCases) { option in
                    Text(option.title).tag(option)
                }
            }
        } label: {
            Label("Data source: \(session.mode.title)", systemImage: "externaldrive.connected.to.line.below")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.textSecondary)
        }
    }
}

/// Rows for the "Demo tools" section of the Account tab.
struct DemoToolsRows: View {
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var cartStore: CartStore

    @State private var isChecking = false
    @State private var checkResult: String?

    private var addressIsValid: Bool {
        AppConfig.makeBaseURL(from: session.serverAddress) != nil
    }

    var body: some View {
        Picker("Data source", selection: $session.mode) {
            ForEach(DataMode.allCases) { option in
                Text(option.title).tag(option)
            }
        }
        .onChange(of: session.mode) { _, _ in
            // Cart lines point at products from one data source only.
            cartStore.removeAll()
            checkResult = nil
        }

        if session.isLive {
            VStack(alignment: .leading, spacing: 6) {
                Text("Server address").font(.footnote.weight(.semibold))
                TextField(AppConfig.defaultServerAddress, text: $session.serverAddress)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                if !addressIsValid {
                    Text("That isn't a valid address. Example: \(AppConfig.defaultServerAddress)")
                        .font(.caption)
                        .foregroundStyle(AppTheme.accent)
                }
            }

            Button {
                runCheck()
            } label: {
                Label(isChecking ? "Checking…" : "Test connection", systemImage: "bolt.horizontal")
            }
            .disabled(isChecking || !addressIsValid)

            if let checkResult {
                Text(checkResult)
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
            }

            Button {
                session.serverAddress = AppConfig.defaultServerAddress
                checkResult = nil
            } label: {
                Label("Use the default address", systemImage: "arrow.uturn.backward")
            }
        } else {
            Text("Demo data works without the server. Nothing here is saved to the database.")
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func runCheck() {
        isChecking = true
        checkResult = nil
        Task {
            checkResult = await session.checkServer()
            isChecking = false
        }
    }
}
