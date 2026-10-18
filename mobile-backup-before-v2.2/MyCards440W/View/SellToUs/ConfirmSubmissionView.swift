//
//  ConfirmSubmissionView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct ConfirmSubmissionView: View {
    let itemCount: Int
    var onSubmit: () -> Void
    @Environment(\.dismiss) private var dismiss

    private let marketDataSources: [(icon: String, label: String)] = [
        ("tag", "Marketplace Pricing"),
        ("chart.bar", "Distributor Pricing"),
        ("chart.line.uptrend.xyaxis", "Historical Sales Data"),
        ("book", "Industry Price Guides")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                infoBox
                marketDataCard
                disclaimerCard
                HStack(spacing: 10) {
                    SecondaryButton(title: "Back") { dismiss() }
                    PrimaryButton(title: "Submit", systemImage: "paperplane.fill") { onSubmit() }
                }
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
    }

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundStyle(AppTheme.accent)
            Text("CONFIRM").font(.system(size: 22, weight: .heavy, design: .rounded))
            Text("SUBMISSION")
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundStyle(AppTheme.accent)
            Text("You are about to submit your product list (\(itemCount) item\(itemCount == 1 ? "" : "s")) for review.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private var infoBox: some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "info.circle").foregroundStyle(AppTheme.textPrimary)
                Text("After review, a purchase offer may be provided based on current market data and inventory demand.")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private var marketDataCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("MARKET DATA MAY INCLUDE")
                .font(.caption.weight(.heavy))
                .foregroundStyle(AppTheme.accent)
            ForEach(marketDataSources, id: \.label) { entry in
                HStack {
                    Image(systemName: entry.icon).foregroundStyle(AppTheme.textSecondary).frame(width: 20)
                    Text(entry.label).font(.footnote)
                    Spacer()
                }
                .padding(10)
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var disclaimerCard: some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.shield")
                Text("Submission does not guarantee acceptance or purchase.")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
    }
}

#Preview {
    ConfirmSubmissionView(itemCount: 2) {}
}
