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

    /// Everything except the second address line has to be filled in.
    var isComplete: Bool {
        let required = [fullName, line1, city, region, postalCode]
        return !required.contains { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
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
