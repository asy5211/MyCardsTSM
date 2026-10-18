//
//  SellerModels.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import Foundation

enum ProductSourceType: String, CaseIterable, Identifiable {
    case distributor = "Authorized Distributor"
    case retailStore = "Licensed Retail Store"
    case manufacturerDirect = "Manufacturer Direct"
    case other = "Other"
    /// QA/demo option — paired with the "test" auto-approve shortcut in
    /// SellerApplicationView so the approved-seller flow can be tested
    /// end-to-end without a real backend to review applications.
    case test = "Test"

    var id: String { rawValue }
}

enum SellerApplicationStatus: String {
    case submitted = "Submitted"
    case underReview = "Under Review"
    case approved = "Approved"
    case declined = "Declined"
}

struct SellerApplication: Identifiable {
    let id: UUID
    var businessName: String
    var businessAddress: String
    var contactEmail: String
    var phoneNumber: String
    var sourceType: ProductSourceType
    /// Free text, comma-separated. Per the written spec this is what a seller
    /// later picks from as the "Source" dropdown on the sell-to-us item form
    /// (Milestone 4) — kept separate from `sourceType`, which is just the
    /// wireframe's high-level category selector.
    var distributorList: String
    var documentFileNames: [String]
    var status: SellerApplicationStatus
    var submittedDate: Date

    init(id: UUID = UUID(), businessName: String = "", businessAddress: String = "",
         contactEmail: String = "", phoneNumber: String = "",
         sourceType: ProductSourceType = .distributor, distributorList: String = "",
         documentFileNames: [String] = [], status: SellerApplicationStatus = .submitted,
         submittedDate: Date = Date()) {
        self.id = id
        self.businessName = businessName
        self.businessAddress = businessAddress
        self.contactEmail = contactEmail
        self.phoneNumber = phoneNumber
        self.sourceType = sourceType
        self.distributorList = distributorList
        self.documentFileNames = documentFileNames
        self.status = status
        self.submittedDate = submittedDate
    }
}
