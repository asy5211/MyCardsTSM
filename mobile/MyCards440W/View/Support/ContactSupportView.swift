//
//  ContactSupportView.swift
//  TSM (The Sealed Market)
//
//  Contact TSM support. Works with or without an account: a guest gives a
//  name and an email address and gets the answer by email; a signed-in person
//  can follow the conversation under "My requests".
//

import SwiftUI

struct ContactSupportView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    @State private var topic: SupportTopic
    @State private var subject: String
    @State private var message: String
    @State private var name = ""
    @State private var email = ""
    @State private var isSending = false
    @State private var errorText: String?
    @State private var sent: SupportRequestDTO?

    /// Set when the message is about one of the person's orders: it goes to that order's seller (TSM can read it too).
    private let orderID: String?
    private let orderLabel: String?
    private let sellerName: String?
    private let sellerIsTsm: Bool

    /// Starts with a topic, subject and message filled in (used by "Report a problem" on an order).
    init(topic: SupportTopic = .other, subject: String = "", message: String = "",
         orderID: String? = nil, orderLabel: String? = nil, sellerName: String? = nil, sellerIsTsm: Bool = false) {
        _topic = State(initialValue: orderID == nil ? topic : .order)
        _subject = State(initialValue: subject)
        _message = State(initialValue: message)
        self.orderID = orderID
        self.orderLabel = orderLabel
        self.sellerName = sellerName
        self.sellerIsTsm = sellerIsTsm
    }

    /// No account to answer to: ask for a name and an email address instead.
    private var isGuest: Bool { TokenStore.load() == nil }

    private var canSend: Bool {
        let subjectOK = subject.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3
        let messageOK = message.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10
        var whoOK = true
        if isGuest {
            let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
            whoOK = name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
                && cleanEmail.contains("@") && cleanEmail.contains(".")
        }
        return subjectOK && messageOK && whoOK
    }

    var body: some View {
        Group {
            if let sent {
                sentState(sent)
            } else {
                form
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Contact Support")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if session.isLive && !isGuest {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SupportRequestsView()
                    } label: {
                        Text("My Requests").font(.footnote.weight(.semibold))
                    }
                }
            }
        }
    }

    // MARK: Form

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                NeonCard {
                    HStack(spacing: 14) {
                        Image(systemName: "lifepreserver").font(.system(size: 34))
                        Rectangle().fill(AppTheme.accent).frame(width: 3)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("HOW CAN WE").font(.system(size: 16, weight: .heavy, design: .rounded))
                            Text("HELP?")
                                .font(.system(size: 24, weight: .heavy, design: .rounded))
                                .foregroundStyle(AppTheme.accent)
                            Text(isGuest
                                 ? "No account needed. We'll answer by email."
                                 : "We'll answer here, and you can follow it under My Requests.")
                                .font(.caption)
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                }

                if orderID != nil {
                    orderNote
                }

                if !session.isLive {
                    Text("Support needs the live server. Switch Data source to Live server in Account → Demo tools to send a message.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }

                NeonCard {
                    VStack(alignment: .leading, spacing: 16) {
                        if isGuest {
                            labeledField("Your Name", systemImage: "person") {
                                TextField("Enter your name...", text: $name)
                                    .textContentType(.name)
                            }
                            labeledField("Email Address", systemImage: "envelope") {
                                TextField("Where should we reply?", text: $email)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .textContentType(.emailAddress)
                            }
                        }

                        if orderID == nil {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Topic").font(.footnote.weight(.semibold))
                                Menu {
                                    ForEach(SupportTopic.allCases) { option in
                                        Button(option.title) { topic = option }
                                    }
                                } label: {
                                    HStack {
                                        Image(systemName: "list.bullet").foregroundStyle(AppTheme.textSecondary)
                                        Text(topic.title).foregroundStyle(AppTheme.textPrimary)
                                        Spacer()
                                        Image(systemName: "chevron.down").font(.caption).foregroundStyle(AppTheme.textSecondary)
                                    }
                                    .padding(12)
                                    .background(AppTheme.background)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
                                }
                            }
                        }

                        labeledField("Subject", systemImage: "text.alignleft") {
                            TextField("A few words about it...", text: $subject)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Message").font(.footnote.weight(.semibold))
                            TextField("Tell us what happened or what you need (at least 10 characters)...",
                                      text: $message, axis: .vertical)
                                .lineLimit(5...10)
                                .padding(12)
                                .background(AppTheme.background)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
                        }
                    }
                }

                if let errorText {
                    Text(errorText)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }

                PrimaryButton(title: isSending ? "Sending…" : "Send Message", systemImage: "paperplane.fill") {
                    send()
                }
                .disabled(!canSend || isSending || !session.isLive)
                .opacity(canSend && !isSending && session.isLive ? 1 : 0.5)
            }
            .padding(20)
        }
    }

    /// Says who gets the message when it is about an order.
    private var orderNote: some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "shippingbox").foregroundStyle(AppTheme.accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text("About \(orderLabel ?? "your order")")
                        .font(.footnote.weight(.bold))
                    if sellerIsTsm || (sellerName ?? "").isEmpty {
                        Text("This goes to TSM support.")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                    } else {
                        Text("This goes to \(sellerName ?? "the seller"), who sold you this order. TSM support can read it too and will step in if it isn't sorted out.")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func sentState(_ request: SupportRequestDTO) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(AppTheme.verifiedGreen)
            Text("Message Sent").font(.title3.weight(.bold))
            Text(request.ref)
                .font(.headline)
                .foregroundStyle(AppTheme.accent)
            Text(request.isGuest
                 ? "We'll reply to \(request.email). Keep the reference above if you write to us again."
                 : "We'll answer here. Follow it any time under My Requests.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            PrimaryButton(title: "Done") { dismiss() }
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func labeledField<Content: View>(_ label: String, systemImage: String,
                                              @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote.weight(.semibold))
            HStack {
                Image(systemName: systemImage).foregroundStyle(AppTheme.textSecondary)
                content().foregroundStyle(AppTheme.textPrimary)
            }
            .padding(12)
            .background(AppTheme.background)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
        }
    }

    private func send() {
        errorText = nil
        isSending = true
        let who = isGuest
        Task {
            do {
                sent = try await session.submitSupportRequest(
                    name: who ? name.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                    email: who ? email.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                    topic: topic,
                    subject: subject.trimmingCharacters(in: .whitespacesAndNewlines),
                    message: message.trimmingCharacters(in: .whitespacesAndNewlines),
                    orderID: orderID)
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                errorText = error.localizedDescription
            }
            isSending = false
        }
    }
}

// MARK: - My requests

/// The signed-in person's earlier support requests.
struct SupportRequestsView: View {
    @EnvironmentObject private var session: AppSession
    @State private var requests: [SupportRequestDTO] = []
    @State private var isLoading = true
    @State private var errorText: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if isLoading && requests.isEmpty {
                    ProgressView().tint(AppTheme.accent).padding(.top, 30)
                } else if let errorText, requests.isEmpty {
                    Text(errorText)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 30)
                } else if requests.isEmpty {
                    Text("You haven't contacted support yet.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding(.top, 30)
                }
                ForEach(requests) { request in
                    NavigationLink {
                        SupportThreadView(request: request)
                    } label: {
                        row(request)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("My Requests")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func row(_ request: SupportRequestDTO) -> some View {
        NeonCard(borderColor: request.status == "answered" ? AppTheme.verifiedGreen.opacity(0.6) : AppTheme.accent.opacity(0.6)) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(request.ref).font(.subheadline.weight(.bold))
                    Spacer()
                    Text(request.statusTitle.uppercased())
                        .font(.system(size: 10, weight: .heavy))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(statusColor(request.status).opacity(0.2))
                        .foregroundStyle(statusColor(request.status))
                        .clipShape(Capsule())
                }
                Text(request.subject).font(.footnote)
                if let about = request.aboutLine {
                    Text(about)
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                if let date = request.updatedDate {
                    Text(date, style: .date)
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "answered": return AppTheme.verifiedGreen
        case "closed": return AppTheme.textSecondary
        default: return .yellow
        }
    }

    private func load() async {
        do {
            requests = try await session.fetchSupportRequests()
            errorText = nil
        } catch is CancellationError {
            // Left the screen.
        } catch {
            errorText = error.localizedDescription
        }
        isLoading = false
    }
}

/// One support request with its conversation.
struct SupportThreadView: View {
    let request: SupportRequestDTO
    @EnvironmentObject private var session: AppSession

    var body: some View {
        ChatThreadView(
            title: request.ref,
            intro: "\(request.subject) · \(request.statusTitle)",
            canSend: request.status != "closed",
            closedText: "This request is closed. Send a new message to support if you still need help.",
            load: {
                let detail = try await session.fetchSupportDetail(id: request.id)
                return detail.messages
            },
            send: { text in
                try await session.sendSupportMessage(id: request.id, text: text)
            }
        )
    }
}

#Preview {
    NavigationStack {
        ContactSupportView()
    }
    .environmentObject(AppSession(profile: ProfileStore()))
}
