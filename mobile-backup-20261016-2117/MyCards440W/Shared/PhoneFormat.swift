//
//  PhoneFormat.swift
//  TSM (The Sealed Market)
//
//  US phone numbers are always shown (and sent to the server) as
//  "+1 (555) - 123 - 4567". The fields format the number while the person
//  types; the server checks and formats it again so every phone number in the
//  database looks the same.
//

import SwiftUI

enum PhoneFormat {

    /// The ten digits of the number, without the country code and without anything else.
    static func nationalDigits(_ text: String) -> String {
        var digits = ""
        for scalar in text.unicodeScalars where scalar.value >= 48 && scalar.value <= 57 {
            digits.append(Character(scalar))
        }
        // The "1" of "+1" (US country codes never start an area code).
        if digits.hasPrefix("1") {
            digits.removeFirst()
        }
        return String(digits.prefix(10))
    }

    /// Whatever was typed or pasted, shaped like "+1 (555) - 123 - 4567" as far as the digits go.
    /// An empty result means nothing has been typed yet.
    static func format(_ text: String) -> String {
        let national = nationalDigits(text)
        if national.isEmpty { return "" }
        let area = String(national.prefix(3))
        if national.count <= 3 {
            return "+1 (\(area)"
        }
        let middle = String(national.dropFirst(3).prefix(3))
        if national.count <= 6 {
            return "+1 (\(area)) - \(middle)"
        }
        let last = String(national.dropFirst(6))
        return "+1 (\(area)) - \(middle) - \(last)"
    }

    /// True for a blank field (a phone number is optional) or a full 10-digit number.
    static func isAcceptable(_ text: String) -> Bool {
        let national = nationalDigits(text)
        return national.isEmpty || national.count == 10
    }

    static let problemText = "Enter a 10-digit US phone number, like (555) 123-4567."
}

extension View {
    /// Keeps a text field's phone number in the "+1 (555) - 123 - 4567" shape as the person types.
    func phoneFormatted(_ text: Binding<String>) -> some View {
        self
            .onAppear {
                let formatted = PhoneFormat.format(text.wrappedValue)
                if formatted != text.wrappedValue { text.wrappedValue = formatted }
            }
            .onChange(of: text.wrappedValue) { _, newValue in
                let formatted = PhoneFormat.format(newValue)
                if formatted != newValue { text.wrappedValue = formatted }
            }
    }
}
