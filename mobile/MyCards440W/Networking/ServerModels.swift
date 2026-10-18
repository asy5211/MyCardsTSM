//
//  ServerModels.swift
//  TSM (The Sealed Market)
//
//  The JSON shapes for the v4 server features: orders, order chat, reviews,
//  sell-to-us tickets, support requests and the app config. Prices arrive as
//  integer cents. (APIModels.swift has the catalog and account shapes.)
//

import Foundation

// MARK: - Money

enum Money {
    /// "$1,234.50" from 123450.
    nonisolated static func text(cents: Int) -> String {
        return (Double(cents) / 100.0).formatted(.currency(code: "USD"))
    }

    nonisolated static func dollars(cents: Int) -> Double {
        return Double(cents) / 100.0
    }

    /// Whole cents from what someone typed ("1250", "1,250.5"). nil when it isn't a positive amount.
    nonisolated static func cents(fromText text: String) -> Int? {
        let cleaned = text
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty, let value = Double(cleaned), value > 0, value <= 1_000_000 else { return nil }
        return Int((value * 100).rounded())
    }
}

// MARK: - Chat (order chats, sell-to-us negotiation, support)

struct ChatMessageDTO: Decodable, Identifiable {
    let id: Int
    /// user | seller | staff | system
    let senderType: String
    let senderName: String
    let body: String
    /// text | status | offer | counter | accept | decline …
    let kind: String
    let amountCents: Int?
    /// True when the signed-in person wrote it.
    let mine: Bool
    let createdAt: String?

    var date: Date { APIDate.parse(createdAt) ?? Date() }
}

struct ChatMessagesDTO: Decodable {
    let items: [ChatMessageDTO]
}

// MARK: - Orders

struct OrderSellerDTO: Decodable {
    let id: String
    let displayName: String
    /// True when the order is with TSM's own store (support for those orders is answered by TSM itself).
    let isTsm: Bool?
}

struct OrderShippingDTO: Decodable {
    let fullName: String
    let line1: String
    let line2: String?
    let city: String
    let region: String
    let postalCode: String
    let country: String

    func toShippingAddress() -> ShippingAddress {
        return ShippingAddress(fullName: fullName,
                               line1: line1,
                               line2: line2 ?? "",
                               city: city,
                               region: region,
                               postalCode: postalCode,
                               country: country)
    }
}

struct OrderReviewDTO: Decodable {
    let id: String
    let rating: Int
    let comment: String?
    let sellerResponse: String?
    let sellerRespondedAt: String?
    let createdAt: String?
}

struct OrderItemDTO: Decodable, Identifiable {
    let id: String
    let productId: String
    let productName: String
    let brandName: String?
    let thumbnailUrl: String?
    let quantity: Int
    let unitPriceCents: Int
    let lineTotalCents: Int
    let sourceLabel: String?
    let distributor: String?
    /// "Boxes 4–5 of 12" for a case offer; nil for loose product.
    let boxLabel: String?
    let boxFirst: Int?
    let boxLast: Int?
    let boxesInCase: Int?
    let review: OrderReviewDTO?
}

struct OrderDTO: Decodable, Identifiable {
    let id: String
    let orderNumber: String
    /// placed | shipped | delivered | cancelled
    let status: String
    let subtotalCents: Int
    let createdAt: String?
    let shippedAt: String?
    let deliveredAt: String?
    let carrier: String?
    let trackingNumber: String?
    let trackingUrl: String?
    let seller: OrderSellerDTO
    let shippingAddress: OrderShippingDTO
    let items: [OrderItemDTO]

    var createdDate: Date { APIDate.parse(createdAt) ?? Date() }
    var shippedDate: Date? { APIDate.parse(shippedAt) }
    var deliveredDate: Date? { APIDate.parse(deliveredAt) }
    var isShippedOrLater: Bool { status == "shipped" || status == "delivered" }

    var statusTitle: String {
        switch status {
        case "placed": return "Placed"
        case "shipped": return "Shipped"
        case "delivered": return "Delivered"
        case "cancelled": return "Cancelled"
        default: return status.capitalized
        }
    }

    var unitCount: Int { items.reduce(0) { $0 + $1.quantity } }
}

extension OrderDTO: Hashable {
    static func == (lhs: OrderDTO, rhs: OrderDTO) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct OrdersPageDTO: Decodable {
    let items: [OrderDTO]
    let total: Int
}

struct PlacedOrdersDTO: Decodable {
    let orders: [OrderDTO]
}

// MARK: - Reviews

struct ReviewDTO: Decodable, Identifiable {
    let id: String
    let rating: Int
    let comment: String?
    let reviewer: String
    let productId: String
    let productName: String
    let sellerId: String
    let sellerName: String
    let orderNumber: String
    let boxLabel: String?
    let sellerResponse: String?
    let sellerRespondedAt: String?
    let createdAt: String?

    var date: Date? { APIDate.parse(createdAt) }
}

struct ReviewSummaryDTO: Decodable {
    let count: Int
    let average: Double
    /// Star → how many reviews gave it ("1" … "5").
    let distribution: [String: Int]

    func count(forStars stars: Int) -> Int {
        return distribution[String(stars)] ?? 0
    }
}

struct ReviewsPageDTO: Decodable {
    let summary: ReviewSummaryDTO
    let items: [ReviewDTO]
    let total: Int
}

// MARK: - Sell-to-us tickets

struct TicketItemDTO: Decodable {
    let id: String
    let productName: String
    let quantity: Int
    let source: String
    let minPricePerItemCents: Int
    let removedByAdmin: Bool
}

struct TicketDTO: Decodable {
    let id: String
    let ticketNumber: String
    /// submitted | in_review | offer_sent | countered | accepted | declined | completed
    let status: String
    let statusLabel: String
    let offerCents: Int?
    /// staff | user — who named the price on the table.
    let offerBy: String?
    let decisionNote: String?
    let askingTotalCents: Int
    let createdAt: String?
    let updatedAt: String?
    let closedAt: String?
    let items: [TicketItemDTO]
    /// Only the single-ticket call sends the conversation.
    let messages: [ChatMessageDTO]?
}

struct TicketsPageDTO: Decodable {
    let items: [TicketDTO]
    let total: Int
}

extension TicketDTO {
    /// The app's own ticket model (what the Sell tab screens draw). nil if the id isn't a UUID.
    func toSubmission() -> SellToUsSubmission? {
        guard let uuid = UUID(uuidString: id) else { return nil }
        let lines = items.map { item in
            SellToUsLineItem(id: UUID(uuidString: item.id) ?? UUID(),
                             productName: item.productName,
                             quantity: item.quantity,
                             source: item.source,
                             minimumPricePerItem: Money.dollars(cents: item.minPricePerItemCents),
                             isRemovedByAdmin: item.removedByAdmin)
        }
        let appStatus: SellToUsStatus
        switch status {
        case "submitted", "in_review": appStatus = .inReview
        case "offer_sent": appStatus = .offerSent
        case "countered": appStatus = .negotiation
        case "accepted": appStatus = .approved
        case "completed": appStatus = .completed
        case "declined": appStatus = .declined
        default: appStatus = .inReview
        }
        let agreed = (status == "accepted" || status == "completed") ? offerCents : nil
        var submission = SellToUsSubmission(id: uuid,
                                            submissionNumber: ticketNumber,
                                            items: lines,
                                            status: appStatus,
                                            submittedDate: APIDate.parse(createdAt) ?? Date(),
                                            totalOffered: agreed.map { Money.dollars(cents: $0) },
                                            negotiationMessages: (messages ?? []).map { $0.toNegotiationMessage() })
        submission.offerCents = offerCents
        submission.offerBy = offerBy
        submission.decisionNote = decisionNote
        submission.askingTotalCents = askingTotalCents
        submission.hasLoadedMessages = messages != nil
        return submission
    }
}

extension ChatMessageDTO {
    func toNegotiationMessage() -> NegotiationMessage {
        return NegotiationMessage(id: UUID(),
                                  author: mine ? "You" : "TSM",
                                  text: body,
                                  date: date)
    }
}

// MARK: - Support

struct SupportRequestDTO: Decodable, Identifiable {
    let id: String
    let ref: String
    let topic: String
    let subject: String
    /// open | answered | closed
    let status: String
    let name: String
    let email: String
    let isGuest: Bool
    /// Set when the message is about one of the person's orders (then it also went to that order's seller).
    let orderId: String?
    let orderNumber: String?
    let seller: SupportSellerDTO?
    /// seller | tsm: who is answering right now.
    let handler: String?
    let createdAt: String?
    let updatedAt: String?

    var statusTitle: String {
        switch status {
        case "open": return "Open"
        case "answered": return "Answered"
        case "closed": return "Closed"
        default: return status.capitalized
        }
    }

    var updatedDate: Date? { APIDate.parse(updatedAt) ?? APIDate.parse(createdAt) }

    /// "About TSM-1042 · answered by Card Depot", or nil for a request that isn't about an order.
    var aboutLine: String? {
        guard let orderNumber else { return nil }
        var text = "About \(orderNumber)"
        if handler == "seller", let name = seller?.displayName, !name.isEmpty {
            text += " · with \(name)"
        } else if seller != nil {
            text += " · with TSM support"
        }
        return text
    }
}

struct SupportSellerDTO: Decodable {
    let id: String
    let displayName: String?
    let isTsm: Bool?
}

struct SupportCreatedDTO: Decodable {
    let request: SupportRequestDTO
}

struct SupportListDTO: Decodable {
    let items: [SupportRequestDTO]
}

struct SupportDetailDTO: Decodable {
    let request: SupportRequestDTO
    let messages: [ChatMessageDTO]
}

/// What a person can ask support about.
enum SupportTopic: String, CaseIterable, Identifiable {
    case account, order, selling, payment, other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .account: return "My account"
        case .order: return "An order"
        case .selling: return "Selling"
        case .payment: return "Payment"
        case .other: return "Something else"
        }
    }
}

// MARK: - App config

/// GET /api/app-config — facts about this server that aren't user data.
struct AppConfigDTO: Decodable {
    /// Where approved sellers manage their business (the seller dashboard website).
    let sellerPortalUrl: String
    let sellerPortalIsConfigured: Bool
}
