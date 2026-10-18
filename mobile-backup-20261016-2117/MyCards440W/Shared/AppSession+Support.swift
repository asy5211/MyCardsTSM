//
//  AppSession+Support.swift
//  TSM (The Sealed Market)
//
//  Contact support (guests and signed-in people), reviews, and the app config
//  (where the seller dashboard website lives). All of it needs the live server.
//

import Foundation

extension AppSession {

    // MARK: Helpers for screens

    /// The seller application is waiting for staff. The app asks the server for news while this is true.
    var isApplicationPending: Bool {
        return sellerApplicationState == .pending
    }

    /// Changes when the data source or the seller standing changes. `.task(id:)` on a screen
    /// that loads server data reloads it then.
    var reloadKey: String {
        return "\(mode.rawValue)-\(refreshToken.uuidString)"
    }

    private var needsLiveMessage: String {
        return "This needs the live server. Switch Data source to Live server in Account → Demo tools."
    }

    // MARK: Contact support

    /// Sends a message to TSM support. Guests must give a name and an email address;
    /// signed-in people are identified by their account.
    func submitSupportRequest(name: String?, email: String?, topic: SupportTopic,
                              subject: String, message: String) async throws -> SupportRequestDTO {
        guard mode == .live else { throw APIError.unexpected(needsLiveMessage) }
        var body: [String: Any] = ["topic": topic.rawValue, "subject": subject, "message": message]
        if TokenStore.load() == nil {
            body["name"] = name ?? ""
            body["email"] = email ?? ""
        }
        do {
            let created: SupportCreatedDTO = try await api.post("/api/support", body: body)
            return created.request
        } catch {
            noteSessionProblem(error)
            throw error
        }
    }

    /// The signed-in person's earlier requests, newest first.
    func fetchSupportRequests() async throws -> [SupportRequestDTO] {
        guard mode == .live else { return [] }
        do {
            let list: SupportListDTO = try await api.get("/api/support")
            return list.items
        } catch {
            if !(error is CancellationError) { noteSessionProblem(error) }
            throw error
        }
    }

    func fetchSupportDetail(id: String) async throws -> SupportDetailDTO {
        guard mode == .live else { throw APIError.unexpected(needsLiveMessage) }
        do {
            return try await api.get("/api/support/\(id)")
        } catch {
            if !(error is CancellationError) { noteSessionProblem(error) }
            throw error
        }
    }

    func sendSupportMessage(id: String, text: String) async throws {
        guard mode == .live else { throw APIError.unexpected(needsLiveMessage) }
        do {
            let _: ChatMessageDTO = try await api.post("/api/support/\(id)/messages", body: ["body": text])
        } catch {
            noteSessionProblem(error)
            throw error
        }
    }

    // MARK: Reviews (public: no sign-in needed)

    /// What buyers said about one seller, with their star summary.
    func fetchSellerReviews(sellerID: UUID) async throws -> ReviewsPageDTO {
        guard mode == .live else { throw APIError.unexpected(needsLiveMessage) }
        return try await api.get("/api/sellers/\(sellerID.uuidString.lowercased())/reviews",
                                 query: ["limit": "50"], auth: false)
    }

    /// What buyers said about one product (from every seller, or only `sellerID`).
    func fetchProductReviews(productID: UUID, sellerID: UUID? = nil) async throws -> ReviewsPageDTO {
        guard mode == .live else { throw APIError.unexpected(needsLiveMessage) }
        var query = ["limit": "50"]
        if let sellerID {
            query["sellerId"] = sellerID.uuidString.lowercased()
        }
        return try await api.get("/api/products/\(productID.uuidString.lowercased())/reviews",
                                 query: query, auth: false)
    }

    // MARK: Seller dashboard (website)

    /// Asks the server where the seller dashboard website is. Quietly keeps the old answer if it can't be reached.
    func refreshAppConfig() async {
        guard mode == .live else { return }
        do {
            let config: AppConfigDTO = try await api.get("/api/app-config", auth: false)
            sellerPortalURL = URL(string: config.sellerPortalUrl)
        } catch {
            // Not fatal: the default address is used instead.
        }
    }

    /// The seller dashboard address to open: the one typed in Demo tools, else the server's, else the default.
    var effectiveSellerPortalURL: URL? {
        let typed = sellerPortalOverride.trimmingCharacters(in: .whitespacesAndNewlines)
        if !typed.isEmpty, let url = AppConfig.makeWebURL(from: typed) {
            return url
        }
        if mode == .live, let sellerPortalURL {
            return sellerPortalURL
        }
        return URL(string: AppConfig.defaultSellerPortalURL)
    }
}
