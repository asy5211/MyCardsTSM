//
//  AddressModels.swift
//  TSM (The Sealed Market)
//
//  The shipping address a buyer saves in their account. Checkout asks for it.
//

import Foundation

struct ShippingAddress: Codable, Equatable {
    var fullName: String = ""
    var line1: String = ""
    var line2: String = ""
    var city: String = ""
    var region: String = ""
    var postalCode: String = ""
    /// Two-letter country code. The app only offers the United States for now.
    var country: String = "US"

    /// Everything except the second address line has to be filled in, and a
    /// US state has to be one of the 2-letter codes (OH, not Ohio).
    var isComplete: Bool {
        let required = [fullName, line1, city, region, postalCode]
        if required.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
            return false
        }
        return country != "US" || USStates.isValid(region)
    }

    /// The address as lines of text, ready to show.
    var displayLines: [String] {
        var lines = [fullName, line1]
        if !line2.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.append(line2)
        }
        lines.append("\(city), \(region) \(postalCode)")
        if country != "US" {
            lines.append(country)
        }
        return lines
    }

    /// "12 Pack Rat Lane, Austin, TX 78701" for one-line summaries.
    var summary: String {
        var parts = [line1]
        if !line2.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(line2)
        }
        parts.append("\(city), \(region) \(postalCode)")
        return parts.joined(separator: ", ")
    }

    /// 5 digits, or 5 + 4 (US only for now).
    var hasValidPostalCode: Bool {
        let trimmed = postalCode.trimmingCharacters(in: .whitespaces)
        let digits = trimmed.filter { $0.isNumber }
        if trimmed.count == 5 { return digits.count == 5 }
        if trimmed.count == 10 {
            let parts = trimmed.split(separator: "-")
            return parts.count == 2 && parts[0].count == 5 && parts[1].count == 4
                && parts.allSatisfy { $0.allSatisfy { $0.isNumber } }
        }
        return false
    }
}

// MARK: - US states

/// The states a shipping address can be in: the 50 states and DC, as the
/// 2-letter post office codes. Same list as the server (backend/src/lib/usStates.js).
enum USStates {
    static let all: [(code: String, name: String)] = [
        ("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"),
        ("CA", "California"), ("CO", "Colorado"), ("CT", "Connecticut"), ("DE", "Delaware"),
        ("DC", "District of Columbia"), ("FL", "Florida"), ("GA", "Georgia"), ("HI", "Hawaii"),
        ("ID", "Idaho"), ("IL", "Illinois"), ("IN", "Indiana"), ("IA", "Iowa"),
        ("KS", "Kansas"), ("KY", "Kentucky"), ("LA", "Louisiana"), ("ME", "Maine"),
        ("MD", "Maryland"), ("MA", "Massachusetts"), ("MI", "Michigan"), ("MN", "Minnesota"),
        ("MS", "Mississippi"), ("MO", "Missouri"), ("MT", "Montana"), ("NE", "Nebraska"),
        ("NV", "Nevada"), ("NH", "New Hampshire"), ("NJ", "New Jersey"), ("NM", "New Mexico"),
        ("NY", "New York"), ("NC", "North Carolina"), ("ND", "North Dakota"), ("OH", "Ohio"),
        ("OK", "Oklahoma"), ("OR", "Oregon"), ("PA", "Pennsylvania"), ("RI", "Rhode Island"),
        ("SC", "South Carolina"), ("SD", "South Dakota"), ("TN", "Tennessee"), ("TX", "Texas"),
        ("UT", "Utah"), ("VT", "Vermont"), ("VA", "Virginia"), ("WA", "Washington"),
        ("WV", "West Virginia"), ("WI", "Wisconsin"), ("WY", "Wyoming")
    ]

    /// Just the codes, A to Z, for the State dropdown.
    static let codes: [String] = all.map { $0.code }

    static func isValid(_ code: String) -> Bool {
        return codes.contains(code)
    }

    /// Turns something an older version let people type ("Ohio", "oh") into
    /// its code ("OH"). nil when it isn't a state we recognize.
    static func code(from text: String) -> String? {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if isValid(cleaned) { return cleaned }
        return all.first { $0.name.uppercased() == cleaned }?.code
    }
}
