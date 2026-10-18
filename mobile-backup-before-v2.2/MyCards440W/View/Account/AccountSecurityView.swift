//
//  AccountSecurityView.swift
//  TSM (The Sealed Market)
//
//  Change password, download my data, delete my account. The last two are
//  App Store requirements. Live mode only (the data lives on the server).
//

import SwiftUI

struct AccountSecurityView: View {
    @EnvironmentObject private var session: AppSession

    // Change password
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var passwordMessage: String?
    @State private var passwordMessageIsError = false
    @State private var isChangingPassword = false

    // Export
    @State private var exportURL: URL?
    @State private var exportMessage: String?
    @State private var isExporting = false

    // Delete
    @State private var showDeleteAlert = false
    @State private var deletePassword = ""
    @State private var deleteMessage: String?
    @State private var isDeleting = false

    private var canChangePassword: Bool {
        !currentPassword.isEmpty && !newPassword.isEmpty && newPassword == confirmPassword
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                changePasswordCard
                exportCard
                deleteCard
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Privacy & Security")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Delete your account?", isPresented: $showDeleteAlert) {
            SecureField("Your password", text: $deletePassword)
            Button("Delete Account", role: .destructive) {
                deleteAccount()
            }
            Button("Cancel", role: .cancel) {
                deletePassword = ""
            }
        } message: {
            Text("This permanently removes your personal details and takes any offers you have off the shop. Enter your password to confirm.")
        }
    }

    // MARK: Cards

    private var changePasswordCard: some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 14) {
                sectionTitle("Change Password",
                             subtitle: "At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.")

                secureField("Current password", text: $currentPassword)
                secureField("New password", text: $newPassword)
                secureField("Confirm new password", text: $confirmPassword)

                if !confirmPassword.isEmpty && newPassword != confirmPassword {
                    Label("Passwords must match to continue.", systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                }

                if let passwordMessage {
                    Text(passwordMessage)
                        .font(.footnote)
                        .foregroundStyle(passwordMessageIsError ? AppTheme.accent : AppTheme.verifiedGreen)
                }

                PrimaryButton(title: isChangingPassword ? "Updating…" : "Update Password",
                              systemImage: "key.fill") {
                    changePassword()
                }
                .disabled(!canChangePassword || isChangingPassword)
                .opacity(canChangePassword && !isChangingPassword ? 1 : 0.5)
            }
        }
    }

    private var exportCard: some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 14) {
                sectionTitle("Download My Data",
                             subtitle: "A copy of everything TSM stores about your account, as a JSON file.")

                SecondaryButton(title: isExporting ? "Preparing…" : "Export My Data",
                                systemImage: "square.and.arrow.down") {
                    exportData()
                }
                .disabled(isExporting)

                if let exportURL {
                    ShareLink(item: exportURL) {
                        Label("Share or save the file", systemImage: "square.and.arrow.up")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(AppTheme.accent)
                    }
                }

                if let exportMessage {
                    Text(exportMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }
            }
        }
    }

    private var deleteCard: some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 14) {
                sectionTitle("Delete Account",
                             subtitle: "Permanent. Your personal details are erased and your offers leave the shop.")

                Button(role: .destructive) {
                    deletePassword = ""
                    showDeleteAlert = true
                } label: {
                    Label(isDeleting ? "Deleting…" : "Delete My Account", systemImage: "trash")
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundStyle(AppTheme.accent)
                        .overlay(
                            RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
                                .stroke(AppTheme.accent, lineWidth: 1)
                        )
                }
                .disabled(isDeleting)

                if let deleteMessage {
                    Text(deleteMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }
            }
        }
    }

    // MARK: Pieces

    private func sectionTitle(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Rectangle().fill(AppTheme.accent).frame(width: 4, height: 18)
                Text(title).font(.headline)
            }
            Text(subtitle).font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func secureField(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.footnote.weight(.semibold))
            SecureField(title, text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(12)
                .background(AppTheme.background)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
        }
    }

    // MARK: Actions

    private func changePassword() {
        passwordMessage = nil
        isChangingPassword = true
        let oldPassword = currentPassword
        let freshPassword = newPassword
        let repeated = confirmPassword
        Task {
            do {
                try await session.changePassword(current: oldPassword, new: freshPassword, confirm: repeated)
                passwordMessageIsError = false
                passwordMessage = "Password updated."
                currentPassword = ""
                newPassword = ""
                confirmPassword = ""
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                passwordMessageIsError = true
                passwordMessage = error.localizedDescription
            }
            isChangingPassword = false
        }
    }

    private func exportData() {
        isExporting = true
        exportMessage = nil
        exportURL = nil
        Task {
            do {
                exportURL = try await session.exportMyData()
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                exportMessage = error.localizedDescription
            }
            isExporting = false
        }
    }

    private func deleteAccount() {
        let password = deletePassword
        deletePassword = ""
        isDeleting = true
        deleteMessage = nil
        Task {
            do {
                // On success the app signs out and returns to the sign-in screen.
                try await session.deleteAccount(password: password)
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                deleteMessage = error.localizedDescription
            }
            isDeleting = false
        }
    }
}

#Preview {
    let profile = ProfileStore()
    NavigationStack {
        AccountSecurityView()
    }
    .environmentObject(AppSession(profile: profile))
}
