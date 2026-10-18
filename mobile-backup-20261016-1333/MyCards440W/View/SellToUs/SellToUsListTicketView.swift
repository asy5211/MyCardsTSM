//
//  SellToUsListTicketView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct SellToUsTicketListView: View {
    @EnvironmentObject private var ticketStore: SellToUsTicketStore

    /// New tickets first, then the sample ones.
    private var submissions: [SellToUsSubmission] { ticketStore.tickets }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(submissions) { submission in
                    NavigationLink(value: submission) {
                        ticketRow(submission)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Sell to Us Tickets")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: SellToUsSubmission.self) { submission in
            SellToUsTicketDetailView(submission: submission)
        }
    }

    private func ticketRow(_ submission: SellToUsSubmission) -> some View {
        NeonCard(borderColor: statusColor(submission.status).opacity(0.6)) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(submission.submissionNumber).font(.subheadline.weight(.bold))
                    Spacer()
                    statusBadge(submission.status)
                }
                Text(submission.submittedDate, style: .date)
                    .font(.caption2)
                    .foregroundStyle(AppTheme.textSecondary)
                Text("\(submission.items.count) item\(submission.items.count == 1 ? "" : "s") submitted")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                // Total sold only ever appears once the sale actually went
                // through, per spec 3.6.
                if submission.status == .approved, let total = submission.totalOffered {
                    Text("Total Sold: \(total, format: .currency(code: "USD"))")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(AppTheme.verifiedGreen)
                }
            }
        }
    }

    private func statusBadge(_ status: SellToUsStatus) -> some View {
        Text(status.rawValue.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(statusColor(status).opacity(0.2))
            .foregroundStyle(statusColor(status))
            .clipShape(Capsule())
    }

    private func statusColor(_ status: SellToUsStatus) -> Color {
        switch status {
        case .inReview: return AppTheme.textSecondary
        case .offerSent: return .yellow
        case .negotiation: return .orange
        case .approved: return AppTheme.verifiedGreen
        case .declined: return .red
        }
    }
}

#Preview {
    NavigationStack {
        SellToUsTicketListView()
    }
    .environmentObject(SellToUsTicketStore())
}
