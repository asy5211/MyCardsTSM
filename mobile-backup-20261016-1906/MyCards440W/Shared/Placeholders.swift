//
//  Placeholders.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

// These stand in for screens/components that belong to later milestones
// or that already exist elsewhere in your project. Replace each with the
// real thing when you get there — they exist only so this milestone's
// files compile and preview on their own.

/// Replace with your existing AccountIcon component (profile photo /
/// default avatar + edit-profile entry point, per your PhotosPicker work).
struct AccountIcon: View {
    var body: some View {
        Image(systemName: "person.crop.circle")
            .font(.title2)
            .foregroundStyle(AppTheme.textPrimary)
    }
}


