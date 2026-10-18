//
//  SellToUsListTicketView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//
//  The Sell tab's list of tickets. Live server: the tickets come from the TSM
//  server (pull down to refresh) and approved sellers also get a link to the
//  seller dashboard website at the top.
//

import SwiftUI

struct SellToUsTicketListView: View {
    @EnvironmentObject private var ticketStore: SellToUsTicketStore
    @EnvironmentObject private var session: AppSession
    @AppStorage("isApprovedSeller") private var isApprovedSeller = false

    /// Live: the server's tickets. Demo: new tickets first, then the sample ones.
    private var submissions: [SellToUsSubmission] { ticketStore.tickets }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if isApprovedSeller {
                    SellerDashboardCard()
                }
                if let problem = ticketStore.loadError {
                    NeonCard {
                        VStack(spacing: 10) {
                            Text(problem)
                                .font(.footnote)
                                .foregroundStyle(AppTheme.textSecondary)
                                .multilineTextAlignment(.center)
                            SecondaryButton(title: "Try Again", systemImage: "arrow.clockwise") {
                                Task { await ticketStore.refresh(using: session) }
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                if ticketStore.usesServer && submissions.isEmpty && ticketStore.loadError == nil {
                    emptyState
                }
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
        .task { await ticketStore.refresh(using: session) }
        .refreshable {
            await session.refreshMe()
            await ticketStore.refresh(using: session)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            if ticketStore.isLoading {
                ProgressView().tint(AppTheme.accent)
            } else {
                Image(systemName: "tag")
                    .font(.system(size: 40))
                    .foregroundStyle(AppTheme.textTertiary)
                Text("No tickets yet").font(.headline)
                Text(isApprovedSeller
                     ? "Tap New Submission to send TSM a list of products. We'll answer with a price."
                     : "Approved sellers send TSM their sealed products from here. Tap New Submission to find out how to apply.")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 30)
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
                // A price from TSM is waiting for an answer.
                if submission.status == .offerSent, let cents = submission.offerCents {
                    Text("TSM offered \(Money.text(cents: cents)) · tap to answer")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(.yellow)
                }
                // Money only appears once a price was agreed (and, for "Total Sold", paid), per spec 3.6.
                if (submission.status == .approved || submission.status == .completed),
                   let total = submission.totalOffered {
                    Text("\(totalPrefix(submission)): \(total, format: .currency(code: "USD"))")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(AppTheme.verifiedGreen)
                }
            }
        }
    }

    /// "Agreed price" while payment is still to come, "Total Sold" once TSM paid.
    private func totalPrefix(_ submission: SellToUsSubmission) -> String {
        return submission.status == .completed ? "Total Sold" : "Agreed price"
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
        case .completed: return AppTheme.verifiedGreen
        case .declined: return .red
        }
    }
}

#Preview {
    NavigationStack {
        SellToUsTicketListView()
    }
    .environmentObject(SellToUsTicketStore())
    .environmentObject(AppSession(profile: ProfileStore()))
}
