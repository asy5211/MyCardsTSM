//
//  AppSession.swift
//  TSM (The Sealed Market)
//
//  Who is signed in, and whether the app is using demo data or the live
//  server. Injected once at the root as an `@EnvironmentObject`.
//
//  It still writes the same two UserDefaults flags the screens already read
//  ("isSignedIn", "isApprovedSeller" — the @AppStorage ones), so existing
//  screens keep working. In Live mode the server decides those flags.
//

import Foundation
import Combine

final class AppSession: ObservableObject {

    private enum Keys {
        static let signedIn = "isSignedIn"
        static let approvedSeller = "isApprovedSeller"
    }

    // MARK: State

    /// Demo data (no server needed) or the live server. Changing it signs
    /// out, because demo accounts and live accounts are separate worlds.
    @Published var mode: DataMode {
        didSet {
            guard mode != oldValue else { return }
            UserDefaults.standard.set(mode.rawValue, forKey: AppConfig.modeKey)
            startFresh()
        }
    }

    /// Where the live server is. The default works for the iOS Simulator.
    @Published var serverAddress: String {
        didSet {
            UserDefaults.standard.set(serverAddress, forKey: AppConfig.serverAddressKey)
        }
    }

    /// The signed-in person as the server sees them (Live mode only).
    @Published private(set) var me: MeDTO? = nil

    let api = APIClient()
    private let profile: ProfileStore

    var isLive: Bool { mode == .live }

    init(profile: ProfileStore) {
        self.profile = profile
        let defaults = UserDefaults.standard
        let savedMode = defaults.string(forKey: AppConfig.modeKey).flatMap { DataMode(rawValue: $0) }
        self.mode = savedMode ?? .live
        self.serverAddress = defaults.string(forKey: AppConfig.serverAddressKey) ?? AppConfig.defaultServerAddress
    }

    // MARK: Helpers used by screens

    /// Plain-words seller status for the Account tab.
    var sellerStatusText: String {
        guard let me else {
            return UserDefaults.standard.bool(forKey: Keys.signedIn) ? "Not loaded yet" : "Sign in required"
        }
        if me.isApprovedSeller { return "Approved seller" }
        if let status = me.sellerApplication?.status {
            switch status {
            case "submitted", "under_review": return "Application under review"
            case "declined": return "Application declined"
            case "approved": return "Approved"
            default: return status
            }
        }
        return "Not applied"
    }

    // MARK: Launch

    /// Called once at launch. In Live mode, confirms the saved token still
    /// works and loads the person's seller status.
    func bootstrap() async {
        guard mode == .live else { return }
        if TokenStore.load() == nil {
            // The app thinks someone is signed in (e.g. left over from the
            // demo build) but there is no token to prove it.
            if UserDefaults.standard.bool(forKey: Keys.signedIn) {
                startFresh()
            }
            return
        }
        await refreshMe()
    }

    // MARK: Sign in / up / out

    func signIn(login: String, password: String) async throws {
        switch mode {
        case .mock:
            if profile.email.isEmpty {
                // Seed the profile so Edit Profile isn't blank the first time.
                profile.update(username: profile.username, email: login, phone: profile.phone)
            }
            UserDefaults.standard.set(true, forKey: Keys.signedIn)
        case .live:
            let result: AuthResponseDTO = try await api.post(
                "/api/auth/login",
                body: ["login": login, "password": password],
                auth: false
            )
            await completeSignIn(result)
        }
    }

    func register(username: String, email: String, password: String,
                  confirmPassword: String, acceptedTerms: Bool) async throws {
        switch mode {
        case .mock:
            profile.update(username: username, email: email, phone: "")
            UserDefaults.standard.set(true, forKey: Keys.signedIn)
        case .live:
            let result: AuthResponseDTO = try await api.post(
                "/api/auth/register",
                body: [
                    "username": username,
                    "email": email,
                    "password": password,
                    "confirmPassword": confirmPassword,
                    "acceptedTerms": acceptedTerms
                ],
                auth: false
            )
            await completeSignIn(result)
        }
    }

    /// Signing out just forgets the token on this device (tokens aren't
    /// tracked on the server yet).
    func signOut() {
        if mode == .live {
            TokenStore.delete()
            me = nil
            profile.clear()
            UserDefaults.standard.set(false, forKey: Keys.approvedSeller)
        }
        UserDefaults.standard.set(false, forKey: Keys.signedIn)
    }

    private func completeSignIn(_ result: AuthResponseDTO) async {
        TokenStore.save(result.token)
        profile.update(username: result.user.username,
                       email: result.user.email,
                       phone: result.user.phone ?? "")
        UserDefaults.standard.set(true, forKey: Keys.signedIn)
        await refreshMe()
    }

    /// Wipes any signed-in state, in either mode.
    private func startFresh() {
        TokenStore.delete()
        me = nil
        profile.clear()
        UserDefaults.standard.set(false, forKey: Keys.signedIn)
        UserDefaults.standard.set(false, forKey: Keys.approvedSeller)
    }

    // MARK: Account (Live)

    /// Re-reads the signed-in person from the server. Quietly does nothing
    /// if the server can't be reached; signs out if the token is no longer valid.
    func refreshMe() async {
        guard mode == .live, TokenStore.load() != nil else { return }
        do {
            let fresh: MeDTO = try await api.get("/api/me")
            apply(me: fresh)
        } catch {
            noteIfSessionExpired(error)
        }
    }

    private func apply(me fresh: MeDTO) {
        me = fresh
        profile.update(username: fresh.username, email: fresh.email, phone: fresh.phone ?? "")
        UserDefaults.standard.set(fresh.isApprovedSeller, forKey: Keys.approvedSeller)
        UserDefaults.standard.set(true, forKey: Keys.signedIn)
    }

    /// Saves the edit-profile screen. Live mode can change username and phone;
    /// the email address is fixed for now.
    func saveProfile(username: String, email: String, phone: String) async throws {
        switch mode {
        case .mock:
            profile.update(username: username, email: email, phone: phone)
        case .live:
            do {
                let updated: MeDTO = try await api.patch(
                    "/api/me",
                    body: ["username": username, "phone": phone]
                )
                apply(me: updated)
            } catch {
                noteIfSessionExpired(error)
                throw error
            }
        }
    }

    func changePassword(current: String, new: String, confirm: String) async throws {
        guard mode == .live else { return }
        do {
            let _: MessageDTO = try await api.post(
                "/api/me/change-password",
                body: ["currentPassword": current, "newPassword": new, "confirmPassword": confirm]
            )
        } catch {
            noteIfSessionExpired(error)
            throw error
        }
    }

    /// Writes the person's data (as JSON) to a temporary file and returns it,
    /// ready for the share sheet. Required by App Store privacy rules.
    func exportMyData() async throws -> URL {
        guard mode == .live else {
            throw APIError.unexpected("Data export needs the live server. Switch Data source to Live server.")
        }
        do {
            let data = try await api.getData("/api/me/export")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("tsm-data-export.json")
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            noteIfSessionExpired(error)
            throw error
        }
    }

    /// Permanently deletes the account (App Store requirement), then signs out.
    func deleteAccount(password: String) async throws {
        guard mode == .live else {
            throw APIError.unexpected("Deleting an account needs the live server. Switch Data source to Live server.")
        }
        do {
            try await api.delete("/api/me", body: ["password": password])
            signOut()
        } catch {
            noteIfSessionExpired(error)
            throw error
        }
    }

    // MARK: Forgot / reset password

    func requestPasswordReset(email: String) async throws {
        guard mode == .live else { return }
        let _: MessageDTO = try await api.post(
            "/api/auth/forgot-password",
            body: ["email": email],
            auth: false
        )
    }

    func resetPassword(token: String, newPassword: String, confirmPassword: String) async throws {
        guard mode == .live else { return }
        let _: MessageDTO = try await api.post(
            "/api/auth/reset-password",
            body: ["token": token, "newPassword": newPassword, "confirmPassword": confirmPassword],
            auth: false
        )
    }

    // MARK: Connection check (Demo tools)

    func checkServer() async -> String {
        do {
            let health: HealthDTO = try await api.get("/health", auth: false)
            if health.db == "up" {
                return "Connected. The server and its database are up."
            }
            return "The server answered, but its database is \(health.db)."
        } catch is CancellationError {
            return "Cancelled."
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: Private

    private func noteIfSessionExpired(_ error: Error) {
        if let apiError = error as? APIError, apiError.isUnauthorized {
            signOut()
        }
    }
}
