//
//  SellToUSModels.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import Foundation

enum SellToUsStatus: String, CaseIterable, Codable {
    case inReview = "In Review"
    case offerSent = "Offer Sent"
    case negotiation = "Negotiation"
    case approved = "Approved"
    case declined = "Declined"
}

struct SellToUsLineItem: Identifiable, Codable {
    let id: UUID
    var productName: String
    var quantity: Int
    var source: String
    var minimumPricePerItem: Double
    /// Set by an admin who dropped this item from the deal — the mobile
    /// tracker grays it out rather than deleting it, per spec 3.6.
    var isRemovedByAdmin: Bool

    init(id: UUID = UUID(), productName: String = "", quantity: Int = 1, source: String = "",
         minimumPricePerItem: Double = 0, isRemovedByAdmin: Bool = false) {
        self.id = id
        self.productName = productName
        self.quantity = quantity
        self.source = source
        self.minimumPricePerItem = minimumPricePerItem
        self.isRemovedByAdmin = isRemovedByAdmin
    }
}

struct NegotiationMessage: Identifiable, Codable {
    let id: UUID
    let author: String   // "You" or "Admin"
    let text: String
    let date: Date

    init(id: UUID = UUID(), author: String, text: String, date: Date = Date()) {
        self.id = id
        self.author = author
        self.text = text
        self.date = date
    }
}

struct SellToUsSubmission: Identifiable, Codable {
    let id: UUID
    let submissionNumber: String   // "SUB-10487"
    var items: [SellToUsLineItem]
    var status: SellToUsStatus
    let submittedDate: Date
    /// Only meaningful — and only shown — once `status == .approved`.
    var totalOffered: Double?
    var negotiationMessages: [NegotiationMessage]
}

extension SellToUsSubmission: Hashable {
    static func == (lhs: SellToUsSubmission, rhs: SellToUsSubmission) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

extension SampleData {
    /// Seeded from the seller's application distributor list until the
    /// SellerApplication API exists to fetch it for real.
    static let sellerSourceOptions = ["Acme Wholesale", "Card Depot", "Manufacturer Direct"]

    static let sampleSubmissions: [SellToUsSubmission] = [
        SellToUsSubmission(
            id: UUID(),
            submissionNumber: "SUB-10487",
            items: [
                SellToUsLineItem(productName: "Collector Set Alpha", quantity: 24,
                                  source: "Acme Wholesale", minimumPricePerItem: 95.00),
                SellToUsLineItem(productName: "Standard Pack", quantity: 200,
                                  source: "Card Depot", minimumPricePerItem: 3.50, isRemovedByAdmin: true)
            ],
            status: .inReview,
            submittedDate: Calendar.current.date(byAdding: .day, value: -1, to: Date())!,
            totalOffered: nil,
            negotiationMessages: [
                NegotiationMessage(author: "Admin", text: "Thanks for the submission — reviewing current demand now.")
            ]
        ),
        SellToUsSubmission(
            id: UUID(),
            submissionNumber: "SUB-10402",
            items: [
                SellToUsLineItem(productName: "Elite Series", quantity: 6,
                                  source: "Manufacturer Direct", minimumPricePerItem: 900.00)
            ],
            status: .approved,
            submittedDate: Calendar.current.date(byAdding: .day, value: -10, to: Date())!,
            totalOffered: 5400.00,
            negotiationMessages: []
        )
    ]
}
