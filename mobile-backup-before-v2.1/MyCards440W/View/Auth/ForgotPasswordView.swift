//
//  ForgotPasswordView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AppSession
    @State private var email = ""
    @State private var didSend = false
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if didSend {
                confirmationState
            } else {
                form
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 18) {
            NeonCard {
                HStack(spacing: 14) {
                    Image(systemName: "key.horizontal").font(.system(size: 32))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("RESET").font(.system(size: 20, weight: .heavy, design: .rounded))
                        Text("PASSWORD")
                            .font(.system(size: 24, weight: .heavy, design: .rounded))
                            .foregroundStyle(AppTheme.accent)
                        Text("Enter your account email and we'll send a reset link.")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Email Address").font(.footnote.weight(.semibold))
                HStack {
                    Image(systemName: "envelope").foregroundStyle(AppTheme.textSecondary)
                    TextField("Enter your email address...", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                }
                .padding(12)
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.accent)
            }

            PrimaryButton(title: isWorking ? "Sending…" : "Send Reset Link", systemImage: "paperplane.fill") {
                send()
            }
            .disabled(email.isEmpty || isWorking)
            .opacity(email.isEmpty || isWorking ? 0.5 : 1)

            Spacer()
        }
        .padding(20)
    }

    private var confirmationState: some View {
        VStack(spacing: 16) {
            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 56))
                .foregroundStyle(AppTheme.verifiedGreen)
            Text("Check Your Email").font(.title3.weight(.bold))
            Text("If an account exists for \(email), a reset link is on its way.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            #if DEBUG
            if session.isLive {
                Text("Developer tip: until a real email service is connected, the reset link prints in the Terminal window running the server (npm run dev).")
                    .font(.caption2)
                    .foregroundStyle(AppTheme.textTertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 30)
            }
            #endif
            PrimaryButton(title: "Done") { dismiss() }
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func send() {
        errorMessage = nil
        isWorking = true
        let address = email.trimmingCharacters(in: .whitespaces)
        Task {
            do {
                try await session.requestPasswordReset(email: address)
                didSend = true
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                errorMessage = error.localizedDescription
            }
            isWorking = false
        }
    }
}

#Preview {
    NavigationStack {
        ForgotPasswordView()
    }
    .environmentObject(AppSession(profile: ProfileStore()))
}
