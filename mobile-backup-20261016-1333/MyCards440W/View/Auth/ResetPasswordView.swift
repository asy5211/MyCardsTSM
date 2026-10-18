//
//  ResetPasswordView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

/// Reached via the link emailed from ForgotPasswordView:
/// `tsm://reset-password?token=…`. ContentView reads the token out of the link
/// and passes it in; it is sent to the server along with the new password.
/// (`token` is only nil in Demo mode and previews.)
struct ResetPasswordView: View {
    var token: String? = nil

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AppSession
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isPasswordVisible = false
    @State private var didReset = false
    @State private var isWorking = false
    @State private var errorMessage: String?

    private var hasMinLength: Bool { password.count >= 8 }
    private var hasUppercase: Bool { password.contains { $0.isUppercase } }
    private var hasLowercase: Bool { password.contains { $0.isLowercase } }
    private var hasNumber: Bool { password.contains { $0.isNumber } }
    private var hasSymbol: Bool { password.contains { "!@#$%^&*()-_=+[]{}|;:,.<>?/~`".contains($0) } }

    private var isPasswordValid: Bool {
        hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSymbol
    }
    private var passwordsMatch: Bool {
        !confirmPassword.isEmpty && password == confirmPassword
    }
    private var canSubmit: Bool { isPasswordValid && passwordsMatch }

    var body: some View {
        Group {
            if didReset {
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
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                NeonCard {
                    HStack(spacing: 14) {
                        Image(systemName: "lock.rotation").font(.system(size: 32))
                        VStack(alignment: .leading, spacing: 4) {
                            Text("SET A NEW").font(.system(size: 16, weight: .heavy, design: .rounded))
                            Text("PASSWORD")
                                .font(.system(size: 22, weight: .heavy, design: .rounded))
                                .foregroundStyle(AppTheme.accent)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("New Password").font(.footnote.weight(.semibold))
                    HStack {
                        Group {
                            if isPasswordVisible {
                                TextField("Create a new password...", text: $password)
                            } else {
                                SecureField("Create a new password...", text: $password)
                            }
                        }
                        Button { isPasswordVisible.toggle() } label: {
                            Image(systemName: isPasswordVisible ? "eye.slash" : "eye")
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                    .padding(12)
                    .background(AppTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
                }

                NeonCard(borderColor: Color.white.opacity(0.15)) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Password Requirements").font(.subheadline.weight(.bold))
                        let columns = [GridItem(.flexible()), GridItem(.flexible())]
                        LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                            requirementRow("At least 8 characters", met: hasMinLength)
                            requirementRow("One number", met: hasNumber)
                            requirementRow("One uppercase letter", met: hasUppercase)
                            requirementRow("One symbol", met: hasSymbol)
                            requirementRow("One lowercase letter", met: hasLowercase)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Confirm New Password").font(.footnote.weight(.semibold))
                    SecureField("Re-enter your new password...", text: $confirmPassword)
                        .padding(12)
                        .background(AppTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
                }
                if !confirmPassword.isEmpty {
                    Label(passwordsMatch ? "Passwords match." : "Passwords must match to continue.",
                          systemImage: passwordsMatch ? "checkmark.circle.fill" : "info.circle")
                        .font(.footnote)
                        .foregroundStyle(passwordsMatch ? AppTheme.verifiedGreen : AppTheme.textSecondary)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }

                PrimaryButton(title: isWorking ? "Updating…" : "Reset Password", systemImage: "checkmark.shield.fill") {
                    submit()
                }
                .disabled(!canSubmit || isWorking)
                .opacity(canSubmit && !isWorking ? 1 : 0.5)
            }
            .padding(20)
        }
    }

    private func submit() {
        errorMessage = nil
        let code = token ?? ""
        if session.isLive && code.isEmpty {
            errorMessage = "This screen needs the link from your reset email. Open that link on this device."
            return
        }
        isWorking = true
        let fresh = password
        let repeated = confirmPassword
        Task {
            do {
                try await session.resetPassword(token: code, newPassword: fresh, confirmPassword: repeated)
                didReset = true
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                errorMessage = error.localizedDescription
            }
            isWorking = false
        }
    }

    private func requirementRow(_ text: String, met: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(met ? AppTheme.verifiedGreen : AppTheme.textTertiary)
            Text(text).font(.caption).foregroundStyle(AppTheme.textPrimary)
        }
    }

    private var confirmationState: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(AppTheme.verifiedGreen)
            Text("Password Updated").font(.title3.weight(.bold))
            Text("Sign in with your new password.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
            PrimaryButton(title: "Done") { dismiss() }
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    NavigationStack {
        ResetPasswordView()
    }
    .environmentObject(AppSession(profile: ProfileStore()))
}
