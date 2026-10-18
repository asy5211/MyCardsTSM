//
//  SellToUsTicketDetailView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//
//  One Sell to Us ticket. Live server: when TSM sends a price the seller can
//  accept it, decline it, or counter with their own number. Payment for an
//  accepted price happens outside the app; TSM marks the ticket Completed
//  once the payment was sent.
//

import SwiftUI

struct SellToUsTicketDetailView: View {
    let submission: SellToUsSubmission

    @EnvironmentObject private var ticketStore: SellToUsTicketStore
    @EnvironmentObject private var session: AppSession

    @State private var showAcceptAlert = false
    @State private var showCounterSheet = false
    @State private var showDeclineAlert = false
    @State private var declineNote = ""
    @State private var isWorking = false
    @State private var errorText: String?

    /// The ticket as it is now (the list's copy can be older).
    private var current: SellToUsSubmission {
        ticketStore.ticket(numbered: submission.submissionNumber) ?? submission
    }

    private var isLive: Bool { ticketStore.usesServer }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if isLive {
                    offerSection
                }
                itemsSection
                negotiationLink
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle(submission.submissionNumber)
        .navigationBarTitleDisplayMode(.inline)
        .task { await ticketStore.loadDetail(numbered: submission.submissionNumber, using: session) }
        .refreshable { await ticketStore.loadDetail(numbered: submission.submissionNumber, using: session) }
        .sheet(isPresented: $showCounterSheet) {
            CounterOfferSheet(ticketNumber: submission.submissionNumber,
                              offerCents: current.offerCents,
                              askingCents: current.askingTotalCents)
                .tint(AppTheme.accent)
                .preferredColorScheme(.dark)
        }
        .alert("Accept TSM's offer?", isPresented: $showAcceptAlert) {
            Button("Accept") { accept() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You agree to sell the items still in the deal for \(Money.text(cents: current.offerCents ?? 0)). TSM pays you outside the app and marks the ticket Completed.")
        }
        .alert("Decline this ticket?", isPresented: $showDeclineAlert) {
            TextField("Reason (optional)", text: $declineNote)
            Button("Decline Ticket", role: .destructive) { decline() }
            Button("Keep Ticket", role: .cancel) {}
        } message: {
            Text("TSM is told you are walking away. This closes the ticket.")
        }
    }

    // MARK: Header and items

    private var header: some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(current.submissionNumber).font(.headline.weight(.heavy))
                    Spacer()
                    statusBadge
                }
                Text("Submitted \(current.submittedDate, style: .date)")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                if (current.status == .approved || current.status == .completed), let total = current.totalOffered {
                    Text("\(totalPrefix): \(total, format: .currency(code: "USD"))")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(AppTheme.verifiedGreen)
                }
            }
        }
    }

    /// "Agreed price" while payment is still to come, "Total Sold" once TSM paid.
    private var totalPrefix: String {
        return current.status == .completed ? "Total Sold" : "Agreed price"
    }

    private var statusBadge: some View {
        Text(current.status.rawValue.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(AppTheme.accent.opacity(0.2))
            .foregroundStyle(AppTheme.accent)
            .clipShape(Capsule())
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Submitted Items")
            ForEach(current.items) { item in
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

    // MARK: The price on the table (Live server)

    @ViewBuilder
    private var offerSection: some View {
        switch current.status {
        case .inReview:
            infoCard(icon: "hourglass",
                     title: "In review",
                     text: "A TSM team member is looking at your list. A price will show up here, and you'll get to accept, decline or counter it.",
                     canWithdraw: true)
        case .offerSent:
            offerCard
        case .negotiation:
            infoCard(icon: "arrow.left.arrow.right",
                     title: "Your counter offer",
                     text: "You countered with \(Money.text(cents: current.offerCents ?? 0)). TSM will accept it or send a new price.",
                     canWithdraw: true)
        case .approved:
            infoCard(icon: "checkmark.seal.fill",
                     title: "Price agreed: \(Money.text(cents: current.offerCents ?? 0))",
                     text: "TSM pays you outside the app. This ticket becomes Completed once the payment was sent.",
                     canWithdraw: false)
        case .completed:
            infoCard(icon: "checkmark.circle.fill",
                     title: "Completed",
                     text: "TSM sent the payment of \(Money.text(cents: current.offerCents ?? 0)).",
                     canWithdraw: false)
        case .declined:
            infoCard(icon: "xmark.circle.fill",
                     title: "Declined",
                     text: current.decisionNote.map { "Note: " + $0 } ?? "This ticket was closed without a sale.",
                     canWithdraw: false)
        }
    }

    /// TSM named a price: the seller answers it.
    private var offerCard: some View {
        NeonCard(borderColor: Color.yellow.opacity(0.8)) {
            VStack(alignment: .leading, spacing: 12) {
                Label("TSM sent you a price", systemImage: "tag.fill")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(.yellow)
                Text(Money.text(cents: current.offerCents ?? 0))
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                if let asking = current.askingTotalCents {
                    Text("For all the items still in the deal. You asked for \(Money.text(cents: asking)).")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(AppTheme.accent)
                }
                PrimaryButton(title: isWorking ? "Working…" : "Accept This Price", systemImage: "checkmark") {
                    errorText = nil
                    showAcceptAlert = true
                }
                .disabled(isWorking)
                .opacity(isWorking ? 0.5 : 1)
                HStack(spacing: 10) {
                    SecondaryButton(title: "Counter", systemImage: "arrow.left.arrow.right") {
                        errorText = nil
                        showCounterSheet = true
                    }
                    SecondaryButton(title: "Decline", systemImage: "xmark") {
                        errorText = nil
                        declineNote = ""
                        showDeclineAlert = true
                    }
                }
                .disabled(isWorking)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func infoCard(icon: String, title: String, text: String, canWithdraw: Bool) -> some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            VStack(alignment: .leading, spacing: 10) {
                Label(title, systemImage: icon).font(.subheadline.weight(.heavy))
                Text(text)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
                if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(AppTheme.accent)
                }
                if canWithdraw {
                    Button {
                        errorText = nil
                        declineNote = ""
                        showDeclineAlert = true
                    } label: {
                        Text("Withdraw this ticket")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(AppTheme.accent)
                    }
                    .disabled(isWorking)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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

    // MARK: Actions

    private func accept() {
        isWorking = true
        errorText = nil
        Task {
            do {
                try await ticketStore.accept(submission.submissionNumber, using: session)
            } catch is CancellationError {
                // Left the screen.
            } catch {
                errorText = error.localizedDescription
            }
            isWorking = false
        }
    }

    private func decline() {
        isWorking = true
        errorText = nil
        let note = declineNote
        Task {
            do {
                try await ticketStore.decline(submission.submissionNumber, note: note, using: session)
            } catch is CancellationError {
                // Left the screen.
            } catch {
                errorText = error.localizedDescription
            }
            isWorking = false
        }
    }
}

// MARK: - Counter offer

/// The seller answers TSM's price with their own number.
struct CounterOfferSheet: View {
    let ticketNumber: String
    let offerCents: Int?
    let askingCents: Int?

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var ticketStore: SellToUsTicketStore

    @State private var amountText = ""
    @State private var message = ""
    @State private var isSending = false
    @State private var errorText: String?

    private var amountCents: Int? { Money.cents(fromText: amountText) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let offerCents {
                        row("TSM offered", Money.text(cents: offerCents))
                    }
                    if let askingCents {
                        row("You asked for", Money.text(cents: askingCents))
                    }
                }
                Section("Your counter offer (total for all items)") {
                    HStack {
                        Text("$")
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                    }
                    TextField("Message to TSM (optional)", text: $message, axis: .vertical)
                        .lineLimit(2...5)
                }
                if let errorText {
                    Section {
                        Text(errorText).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Counter Offer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSending ? "Sending…" : "Send") { send() }
                        .disabled(amountCents == nil || isSending)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value).foregroundStyle(.secondary)
        }
    }

    private func send() {
        guard let cents = amountCents else { return }
        isSending = true
        errorText = nil
        let note = message
        Task {
            do {
                try await ticketStore.counter(ticketNumber, amountCents: cents, message: note, using: session)
                dismiss()
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                errorText = error.localizedDescription
            }
            isSending = false
        }
    }
}

// MARK: - Negotiation

struct NegotiationThreadView: View {
    let submission: SellToUsSubmission

    @EnvironmentObject private var ticketStore: SellToUsTicketStore
    @EnvironmentObject private var session: AppSession
    @State private var draftMessage = ""
    @State private var isSending = false
    @State private var sendError: String?

    /// The ticket as it is now, including messages sent from this screen.
    private var current: SellToUsSubmission {
        ticketStore.ticket(numbered: submission.submissionNumber) ?? submission
    }

    /// Newest message first.
    private var messages: [NegotiationMessage] {
        Array(current.negotiationMessages.reversed())
    }

    private var canSend: Bool {
        !draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }

    /// A closed ticket (declined or completed) can't take more messages on the server.
    private var isClosed: Bool {
        ticketStore.usesServer && (current.status == .declined || current.status == .completed)
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
                .refreshable {
                    await ticketStore.loadDetail(numbered: submission.submissionNumber, using: session)
                }
                if let sendError {
                    Text(sendError)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(.black.opacity(0.95))
                }
                if isClosed {
                    Text("This ticket is closed. Start a new ticket if you have more to sell.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(14)
                        .background(.black.opacity(0.95))
                } else {
                    composer(scrollProxy: proxy)
                }
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Negotiation")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            // Live server: pick up TSM's replies every few seconds while this screen is open.
            guard ticketStore.usesServer else { return }
            await ticketStore.loadDetail(numbered: submission.submissionNumber, using: session)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                if Task.isCancelled { break }
                await ticketStore.loadDetail(numbered: submission.submissionNumber, using: session)
            }
        }
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

    /// Live server: sends the message to TSM. Demo data: saves it on this phone.
    /// Either way, jumps to the top of the log, where the newest message sits.
    private func send(_ scrollProxy: ScrollViewProxy) {
        guard canSend else { return }
        if ticketStore.usesServer {
            let text = draftMessage
            isSending = true
            sendError = nil
            Task {
                do {
                    try await ticketStore.send(text, to: submission.submissionNumber, using: session)
                    draftMessage = ""
                    withAnimation {
                        scrollProxy.scrollTo(Self.topID, anchor: .top)
                    }
                } catch is CancellationError {
                    // Left the screen.
                } catch {
                    sendError = error.localizedDescription
                }
                isSending = false
            }
            return
        }
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
    .environmentObject(AppSession(profile: ProfileStore()))
}
