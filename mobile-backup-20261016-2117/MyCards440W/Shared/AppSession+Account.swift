//
//  AppSession+Account.swift
//  TSM (The Sealed Market)
//
//  Account extras on top of AppSession: the saved shipping address, the
//  seller application (apply + current state), notifications, and the key
//  that keeps per-person data (favorites, tickets) separate.
//

import Foundation
import Combine

/// Demo mode remembers "I applied and I'm waiting" under this key.
let mockApplicationPendingKey = "mockSellerApplicationPending"

// MARK: - Seller application

/// Where the signed-in person stands as a seller.
enum SellerApplicationState: Equatable {
    case notApplied
    /// Sent in, waiting for TSM staff to review it.
    case pending
    case approved
    case declined(note: String?)
    /// Staff paused selling. The account still works for shopping.
    case suspended(note: String?)
    /// Staff removed selling. The account still works for shopping.
    case revoked(note: String?)
}

/// What the seller application form collects.
struct SellerApplicationDraft {
    var businessName = ""
    var businessAddress = ""
    var contactEmail = ""
    var phoneNumber = ""
    var sourceType: ProductSourceType = .distributor
    var distributorList = ""
    var documents: [PickedDocument] = []
}

/// A document the person chose in the file picker, already read into memory.
struct PickedDocument: Identifiable {
    let id = UUID()
    let filename: String
    let data: Data
}

extension ProductSourceType {
    /// The value the server's seller-application route expects.
    var apiValue: String {
        switch self {
        case .distributor: return "distributor"
        case .retailStore: return "retail_store"
        case .manufacturerDirect: return "manufacturer_direct"
        case .other: return "other"
        case .test: return "test"
        }
    }

    /// The options shown in the form. "Test" is a developer shortcut, so
    /// it only exists in debug builds.
    static var selectable: [ProductSourceType] {
        #if DEBUG
        return allCases
        #else
        return allCases.filter { $0 != .test }
        #endif
    }
}

extension AppSession {

    // MARK: Who's data this is

    /// Changes whenever a different person (or data source) is in use, so
    /// favorites and tickets kept on this device don't mix between accounts.
    var storageScope: String {
        switch mode {
        case .mock: return "mock"
        case .live: return "live-\(me?.id ?? "guest")"
        }
    }

    // MARK: Shipping address

    /// The saved shipping address: from the server in Live mode, from this
    /// device in Demo mode. nil until the person adds one.
    var shippingAddress: ShippingAddress? {
        switch mode {
        case .mock:
            return profile.address
        case .live:
            return me?.address?.toShippingAddress()
        }
    }

    func saveShippingAddress(_ address: ShippingAddress) async throws {
        switch mode {
        case .mock:
            profile.setAddress(address)
            objectWillChange.send()
        case .live:
            do {
                let _: AddressResponseDTO = try await api.put(
                    "/api/me/address",
                    body: [
                        "fullName": address.fullName,
                        "line1": address.line1,
                        "line2": address.line2,
                        "city": address.city,
                        "region": address.region,
                        "postalCode": address.postalCode,
                        "country": address.country
                    ]
                )
                await refreshMe()
            } catch {
                noteSessionProblem(error)
                throw error
            }
        }
    }

    // MARK: Seller application

    var sellerApplicationState: SellerApplicationState {
        switch mode {
        case .mock:
            let defaults = UserDefaults.standard
            if defaults.bool(forKey: "isApprovedSeller") { return .approved }
            if defaults.bool(forKey: mockApplicationPendingKey) { return .pending }
            return .notApplied
        case .live:
            guard let me else { return .notApplied }
            if me.isApprovedSeller { return .approved }
            if let standing = me.sellerProfile {
                if standing.status == "revoked" { return .revoked(note: standing.statusNote) }
                if standing.status == "suspended" { return .suspended(note: standing.statusNote) }
            }
            guard let application = me.sellerApplication else { return .notApplied }
            switch application.status {
            case "submitted", "under_review": return .pending
            case "approved": return .approved
            case "declined": return .declined(note: application.decisionNote)
            default: return .notApplied
            }
        }
    }

    /// When the latest application was sent in (Live mode).
    var sellerApplicationSubmittedAt: Date? {
        return APIDate.parse(me?.sellerApplication?.submittedAt)
    }

    func submitSellerApplication(_ draft: SellerApplicationDraft) async throws {
        switch mode {
        case .mock:
            let defaults = UserDefaults.standard
            if draft.sourceType == .test {
                // Demo shortcut: the "Test" source approves immediately.
                defaults.set(true, forKey: "isApprovedSeller")
            } else {
                defaults.set(true, forKey: mockApplicationPendingKey)
            }
            objectWillChange.send()
        case .live:
            let files = draft.documents.map {
                UploadFile(fieldName: "documents", filename: $0.filename, data: $0.data)
            }
            do {
                let _: SellerApplicationSubmittedDTO = try await api.postForm(
                    "/api/me/seller-application",
                    fields: [
                        "businessName": draft.businessName,
                        "businessAddress": draft.businessAddress,
                        "contactEmail": draft.contactEmail,
                        "phoneNumber": draft.phoneNumber,
                        "sourceType": draft.sourceType.apiValue,
                        "distributorList": draft.distributorList
                    ],
                    files: files
                )
                // Pick up the new status ("under review", or "approved" for a test application).
                await refreshMe()
            } catch {
                noteSessionProblem(error)
                // The server already has an application for this person (maybe sent
                // from another device): refresh so the screen shows its real state.
                if let apiError = error as? APIError,
                   apiError.serverCode == "application_pending" || apiError.serverCode == "already_seller" {
                    await refreshMe()
                }
                throw error
            }
        }
    }

    // MARK: Notifications (bell on Home)

    /// What the bell shows. Today that is the seller-application result, plus
    /// a few labelled examples in Demo mode. Order and offer alerts arrive
    /// with the notifications feature.
    func currentNotifications() -> [AppNotification] {
        var items: [AppNotification] = []

        if mode == .mock {
            items.append(AppNotification(
                id: "demo-welcome",
                systemImage: "hand.wave",
                title: "Welcome to TSM",
                message: "This is demo data. Alerts about orders, offers and messages will show up here.",
                date: Date()))
            items.append(AppNotification(
                id: "demo-shipped",
                systemImage: "shippingbox",
                title: "Your order has shipped",
                message: "ORD-28510 is on its way. Tracking is in your order details.",
                date: Calendar.current.date(byAdding: .day, value: -1, to: Date())))
            items.append(AppNotification(
                id: "demo-offer",
                systemImage: "tag",
                title: "Offer received",
                message: "TSM sent an offer on your Sell to Us ticket SUB-10487.",
                date: Calendar.current.date(byAdding: .day, value: -2, to: Date())))
        }

        if mode == .live, let standing = me?.sellerProfile, standing.status != "active" {
            let removed = standing.status == "revoked"
            items.append(AppNotification(
                id: "seller-standing-\(standing.status)",
                systemImage: "exclamationmark.triangle",
                title: removed ? "Selling privileges removed" : "Selling suspended",
                message: standing.statusNote ?? "Your account still works for shopping. Contact support for details.",
                date: nil))
        }

        if mode == .live, let application = me?.sellerApplication {
            let when = APIDate.parse(application.reviewedAt) ?? APIDate.parse(application.submittedAt)
            switch application.status {
            case "submitted", "under_review":
                items.append(AppNotification(
                    id: "seller-\(application.id)-\(application.status)",
                    systemImage: "hourglass",
                    title: "Seller application pending",
                    message: "We received your documents. You'll see the decision here.",
                    date: when))
            case "approved":
                // A seller whose selling was removed or paused has the alert above instead.
                if me?.isApprovedSeller == true {
                    items.append(AppNotification(
                        id: "seller-\(application.id)-approved",
                        systemImage: "checkmark.seal.fill",
                        title: "You're an approved seller",
                        message: "You can now submit products from the Sell tab.",
                        date: when))
                }
            case "declined":
                let reason = application.decisionNote ?? "Open Account → Seller Application for details."
                items.append(AppNotification(
                    id: "seller-\(application.id)-declined",
                    systemImage: "xmark.seal",
                    title: "Seller application declined",
                    message: reason,
                    date: when))
            default:
                break
            }
        }
        return items
    }
}

/// One line in the notifications list.
struct AppNotification: Identifiable {
    /// Stable between launches, so "already seen" can be remembered.
    let id: String
    let systemImage: String
    let title: String
    let message: String
    let date: Date?
}
