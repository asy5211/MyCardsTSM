//
//  SellToUsGateView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct SellToUsGateView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AppSession
    @State private var showApplication = false

    /// "Apply Now" until an application is in; then it opens the status page.
    private var applyButtonTitle: String {
        if session.sellerApplicationState == .notApplied {
            return "Apply Now"
        }
        return "Application Status"
    }

    private let approvedSources = ["Licensed Retail Stores", "Authorized Distributors", "Official Business Inventory"]
    private let acceptedTypes = ["Sealed Boxes", "Sealed Cases", "Sealed Packs", "Tins",
                                  "Factory-Sealed Products", "Other Verified Collectibles"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    checklistCard(title: "Approved Sources Include", systemImage: "storefront", items: approvedSources)
                    checklistCard(title: "Accepted Product Types", systemImage: "cube.box", items: acceptedTypes)
                }
                .padding(20)
            }
            .background(AppTheme.background.ignoresSafeArea())
            .foregroundStyle(AppTheme.textPrimary)
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 10) {
                    SecondaryButton(title: "Cancel") { dismiss() }
                    PrimaryButton(title: applyButtonTitle, systemImage: "arrow.right") { showApplication = true }
                }
                .padding(16)
                .background(.black.opacity(0.95))
            }
            .navigationDestination(isPresented: $showApplication) {
                SellerApplicationEntryView()
            }
        }
        // NOTE: once auth/session state exists, an already-approved seller
        // tapping "Sell to Us" should skip this gate entirely and land on
        // the sell-to-us item form (Milestone 4) instead.
    }

    private var header: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 46))
            Text("APPROVAL").font(.system(size: 24, weight: .heavy, design: .rounded))
            Text("REQUIRED")
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .foregroundStyle(AppTheme.accent)
            Text("TSM buys sealed product directly from sellers. To keep it trusted, only verified sellers may send us inventory to make an offer on.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func checklistCard(title: String, systemImage: String, items: [String]) -> some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            VStack(alignment: .leading, spacing: 10) {
                Label(title.uppercased(), systemImage: systemImage)
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(AppTheme.accent)
                ForEach(items, id: \.self) { item in
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark").foregroundStyle(AppTheme.accent)
                        Text(item).font(.footnote)
                    }
                }
            }
        }
    }
}

#Preview {
    SellToUsGateView()
        .environmentObject(AppRouter())
        .environmentObject(AppSession(profile: ProfileStore()))
}
