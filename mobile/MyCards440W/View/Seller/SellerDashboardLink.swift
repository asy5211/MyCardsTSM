//
//  SellerDashboardLink.swift
//  TSM (The Sealed Market)
//
//  Approved sellers run their business on the TSM website: sales by day, week
//  and month, shipping and tracking numbers, buyer messages, reviews, fees and
//  payouts. The app only shows the way in. The address comes from the server
//  (and can be overridden in Account → Demo tools).
//

import SwiftUI

/// One row for the Account tab's Selling section.
struct SellerDashboardLinkRow: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        if let url = session.effectiveSellerPortalURL {
            Link(destination: url) {
                HStack {
                    Label("Seller dashboard", systemImage: "chart.bar.xaxis")
                    Spacer()
                    Text("Opens in Safari")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                    Image(systemName: "arrow.up.right.square")
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
    }
}

/// A card for the top of the Sell tab (approved sellers only).
struct SellerDashboardCard: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        if let url = session.effectiveSellerPortalURL {
            Link(destination: url) {
                NeonCard(borderColor: AppTheme.gold.opacity(0.8)) {
                    HStack(spacing: 12) {
                        Image(systemName: "chart.bar.xaxis")
                            .font(.system(size: 26))
                            .foregroundStyle(AppTheme.gold)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Seller dashboard").font(.subheadline.weight(.heavy))
                            Text("Sales by day, week and month, shipping and tracking, buyer messages, reviews and payouts.")
                                .font(.caption2)
                                .foregroundStyle(AppTheme.textSecondary)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "arrow.up.right.square")
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                }
            }
            .buttonStyle(.plain)
        }
    }
}
