//
//  SellToUsTicketDetailView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct SellToUsTicketDetailView: View {
    let submission: SellToUsSubmission

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                itemsSection
                negotiationLink
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle(submission.submissionNumber)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(submission.submissionNumber).font(.headline.weight(.heavy))
                    Spacer()
                    statusBadge
                }
                Text("Submitted \(submission.submittedDate, style: .date)")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                if submission.status == .approved, let total = submission.totalOffered {
                    Text("Total Sold: \(total, format: .currency(code: "USD"))")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(AppTheme.verifiedGreen)
                }
            }
        }
    }

    private var statusBadge: some View {
        Text(submission.status.rawValue.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(AppTheme.accent.opacity(0.2))
            .foregroundStyle(AppTheme.accent)
            .clipShape(Capsule())
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Submitted Items")
            ForEach(submission.items) { item in
                itemRow(item)
            }
        }
    }

    private func itemRow(_ item: SellToUsLineItem) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.productName).font(.subheadline.weight(.semibold))
                Text("Qty \(item.quantity) · \(item.source) · Min \(item.minimumPricePerItem, format: .currency(code: "USD"))")
                    .font(.caption2)
                    .foregroundStyle(AppTheme.textSecondary)
            }
            Spacer()
            // Grayed out rather than deleted — an admin dropped this item
            // from the deal, per spec 3.6, so the seller can still see it.
            if item.isRemovedByAdmin {
                Text("REMOVED").font(.system(size: 9, weight: .heavy)).foregroundStyle(AppTheme.textTertiary)
            }
        }
        .padding(12)
        .background(AppTheme.surface)
        .opacity(item.isRemovedByAdmin ? 0.4 : 1)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var negotiationLink: some View {
        NavigationLink {
            NegotiationThreadView(submission: submission)
        } label: {
            HStack {
                Image(systemName: "bubble.left.and.bubble.right")
                Text("View Negotiation")
                Spacer()
                Image(systemName: "chevron.right")
            }
            .padding(14)
            .background(AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(AppTheme.textPrimary)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(AppTheme.accent).frame(width: 4, height: 16)
            Text(title).font(.headline)
        }
    }
}

struct NegotiationThreadView: View {
    let submission: SellToUsSubmission

    @EnvironmentObject private var ticketStore: SellToUsTicketStore
    @State private var draftMessage = ""

    /// The ticket as it is now, including messages sent from this screen.
    private var current: SellToUsSubmission {
        ticketStore.ticket(numbered: submission.submissionNumber) ?? submission
    }

    /// Newest message first.
    private var messages: [NegotiationMessage] {
        Array(current.negotiationMessages.reversed())
    }

    private var canSend: Bool {
        !draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Color.clear.frame(height: 0).id(Self.topID)
                        if messages.isEmpty {
                            Text("No negotiation messages yet.")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.textSecondary)
                                .padding(.top, 24)
                        } else {
                            Text("Newest messages first")
                                .font(.caption2)
                                .foregroundStyle(AppTheme.textTertiary)
                        }
                        ForEach(messages) { message in
                            messageBubble(message)
                        }
                    }
                    .padding(16)
                }
                composer(scrollProxy: proxy)
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Negotiation")
        .navigationBarTitleDisplayMode(.inline)
    }

    private static let topID = "negotiation-top"

    private func messageBubble(_ message: NegotiationMessage) -> some View {
        let isYou = message.author == "You"
        return HStack {
            if isYou { Spacer() }
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(message.author).font(.caption2.weight(.bold))
                    Text(message.date, format: .dateTime.month().day().hour().minute())
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textTertiary)
                }
                .foregroundStyle(AppTheme.textSecondary)
                Text(message.text).font(.footnote)
            }
            .padding(10)
            .background(isYou ? AppTheme.accent.opacity(0.25) : AppTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            if !isYou { Spacer() }
        }
    }

    private func composer(scrollProxy: ScrollViewProxy) -> some View {
        HStack {
            TextField("Type a message...", text: $draftMessage)
                .submitLabel(.send)
                .onSubmit { send(scrollProxy) }
                .padding(10)
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            Button {
                send(scrollProxy)
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(AppTheme.accent)
            }
            .disabled(!canSend)
            .opacity(canSend ? 1 : 0.4)
        }
        .padding(12)
        .background(.black.opacity(0.95))
    }

    /// Saves the message on this phone (the tickets server API comes later)
    /// and jumps to the top of the log, where the newest message sits.
    private func send(_ scrollProxy: ScrollViewProxy) {
        guard ticketStore.addMessage(draftMessage, to: submission.submissionNumber) != nil else { return }
        draftMessage = ""
        withAnimation {
            scrollProxy.scrollTo(Self.topID, anchor: .top)
        }
    }
}

#Preview {
    NavigationStack {
        SellToUsTicketDetailView(submission: SampleData.sampleSubmissions[0])
    }
    .environmentObject(SellToUsTicketStore())
}
