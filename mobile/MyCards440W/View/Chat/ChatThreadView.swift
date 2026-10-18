//
//  ChatThreadView.swift
//  TSM (The Sealed Market)
//
//  One conversation screen used for the chat with a seller about an order and
//  for support requests. Newest message first, like the Sell to Us negotiation.
//  New messages from the other side show up on their own every few seconds.
//

import SwiftUI

struct ChatThreadView: View {
    let title: String
    /// A line of context above the messages (who you are talking to).
    var intro: String? = nil
    /// False when the conversation is closed.
    var canSend: Bool = true
    var closedText: String = "This conversation is closed."
    let load: () async throws -> [ChatMessageDTO]
    let send: (String) async throws -> Void

    @State private var messages: [ChatMessageDTO] = []
    @State private var draft = ""
    @State private var isLoading = true
    @State private var isSending = false
    @State private var errorText: String?

    private var newestFirst: [ChatMessageDTO] { Array(messages.reversed()) }

    private var canPressSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let intro {
                        Text(intro)
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                    if isLoading && messages.isEmpty {
                        ProgressView()
                            .tint(AppTheme.accent)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 24)
                    } else if messages.isEmpty {
                        Text("No messages yet. Write the first one below.")
                            .font(.footnote)
                            .foregroundStyle(AppTheme.textSecondary)
                            .padding(.top, 24)
                    } else {
                        Text("Newest messages first")
                            .font(.caption2)
                            .foregroundStyle(AppTheme.textTertiary)
                    }
                    ForEach(newestFirst) { message in
                        bubble(message)
                    }
                }
                .padding(16)
            }
            .refreshable { await reload() }

            if let errorText {
                Text(errorText)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.accent)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.95))
            }
            if canSend {
                composer
            } else {
                Text(closedText)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(14)
                    .background(.black.opacity(0.95))
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await reload()
            // Pick up replies without making the person pull to refresh.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                if Task.isCancelled { break }
                await reload(quiet: true)
            }
        }
    }

    // MARK: Pieces

    @ViewBuilder
    private func bubble(_ message: ChatMessageDTO) -> some View {
        if message.senderType == "system" {
            Text(message.body)
                .font(.caption)
                .foregroundStyle(AppTheme.textTertiary)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        } else {
            HStack {
                if message.mine { Spacer(minLength: 40) }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(message.mine ? "You" : message.senderName).font(.caption2.weight(.bold))
                        Text(message.date, format: .dateTime.month().day().hour().minute())
                            .font(.caption2)
                            .foregroundStyle(AppTheme.textTertiary)
                    }
                    .foregroundStyle(AppTheme.textSecondary)
                    Text(message.body).font(.footnote)
                }
                .padding(10)
                .background(message.mine ? AppTheme.accent.opacity(0.25) : AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                if !message.mine { Spacer(minLength: 40) }
            }
        }
    }

    private var composer: some View {
        HStack {
            TextField("Type a message...", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .padding(10)
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            Button {
                submit()
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(AppTheme.accent)
            }
            .disabled(!canPressSend)
            .opacity(canPressSend ? 1 : 0.4)
        }
        .padding(12)
        .background(.black.opacity(0.95))
    }

    // MARK: Actions

    private func reload(quiet: Bool = false) async {
        do {
            messages = try await load()
            if !quiet { errorText = nil }
        } catch is CancellationError {
            // Left the screen.
        } catch {
            if !quiet { errorText = error.localizedDescription }
        }
        isLoading = false
    }

    private func submit() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        isSending = true
        errorText = nil
        Task {
            do {
                try await send(text)
                draft = ""
                await reload()
            } catch is CancellationError {
                // Left the screen.
            } catch {
                errorText = error.localizedDescription
            }
            isSending = false
        }
    }
}
