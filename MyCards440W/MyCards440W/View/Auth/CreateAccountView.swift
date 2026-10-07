//
//  CreateAccountView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct CreateAccountView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var agreedToTerms = false
    @State private var agreedToPrivacy = false
    @State private var isPasswordVisible = false
    @State private var errorMessage: String?

    // MARK: Password rule evaluation

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
    private var canSubmit: Bool {
        !username.isEmpty && !email.isEmpty && isPasswordValid && passwordsMatch
            && agreedToTerms && agreedToPrivacy
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                NeonCard {
                    VStack(alignment: .leading, spacing: 16) {
                        sectionTitle("Account Information", subtitle: "Enter your details to get started.")

                        labeledField("Username", systemImage: "person") {
                            TextField("Choose a username...", text: $username)
                                .textInputAutocapitalization(.never)
                        }

                        labeledField("Email Address", systemImage: "envelope") {
                            TextField("Enter your email address...", text: $email)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                        }

                        labeledField("Password", systemImage: "lock") {
                            HStack {
                                Group {
                                    if isPasswordVisible {
                                        TextField("Create a password...", text: $password)
                                    } else {
                                        SecureField("Create a password...", text: $password)
                                    }
                                }
                                Button { isPasswordVisible.toggle() } label: {
                                    Image(systemName: isPasswordVisible ? "eye.slash" : "eye")
                                        .foregroundStyle(AppTheme.textSecondary)
                                }
                            }
                        }

                        passwordRequirements

                        labeledField("Confirm Password", systemImage: "lock") {
                            SecureField("Re-enter your password...", text: $confirmPassword)
                        }
                        if !confirmPassword.isEmpty {
                            Label(passwordsMatch ? "Passwords match." : "Passwords must match to continue.",
                                  systemImage: passwordsMatch ? "checkmark.circle.fill" : "info.circle")
                                .font(.footnote)
                                .foregroundStyle(passwordsMatch ? AppTheme.verifiedGreen : AppTheme.textSecondary)
                        }

                        agreementToggle(isOn: $agreedToTerms, label: "I agree to the ", link: "Terms of Service")
                        agreementToggle(isOn: $agreedToPrivacy, label: "I agree to the ", link: "Privacy Policy")
                    }
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }

                PrimaryButton(title: "Create Account", systemImage: "person.badge.plus") {
                    submit()
                }
                .disabled(!canSubmit)
                .opacity(canSubmit ? 1 : 0.5)

                HStack {
                    Spacer()
                    Text("Already have an account?")
                        .foregroundStyle(AppTheme.textSecondary)
                    Button("Sign In") { dismiss() }
                        .foregroundStyle(AppTheme.accent)
                    Spacer()
                }
                .font(.footnote.weight(.semibold))
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
    }

    // MARK: Subviews

    private var header: some View {
        NeonCard {
            HStack(spacing: 14) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 40))
                Rectangle().fill(AppTheme.accent).frame(width: 3)
                VStack(alignment: .leading, spacing: 4) {
                    Text("CREATE").font(.system(size: 22, weight: .heavy, design: .rounded))
                    Text("ACCOUNT")
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                        .foregroundStyle(AppTheme.accent)
                    Text("Create your account to buy from verified sellers and access exclusive inventory.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
    }

    private var passwordRequirements: some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Password Requirements").font(.subheadline.weight(.bold))
                Text("Your password must include:")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
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
    }

    private func requirementRow(_ text: String, met: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(met ? AppTheme.verifiedGreen : AppTheme.textTertiary)
            Text(text).font(.caption).foregroundStyle(AppTheme.textPrimary)
        }
    }

    private func sectionTitle(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Rectangle().fill(AppTheme.accent).frame(width: 4, height: 18)
                Text(title).font(.headline)
            }
            Text(subtitle).font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func labeledField<Content: View>(_ label: String, systemImage: String,
                                              @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote.weight(.semibold))
            HStack {
                Image(systemName: systemImage).foregroundStyle(AppTheme.textSecondary)
                content()
                    .foregroundStyle(AppTheme.textPrimary)
            }
            .padding(12)
            .background(AppTheme.background)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
        }
    }
    
    private func agreementToggle(isOn: Binding<Bool>, label: String, link: String) -> some View {
        HStack(spacing: 8) {
            Button { isOn.wrappedValue.toggle() } label: {
                Image(systemName: isOn.wrappedValue ? "checkmark.square.fill" : "square")
                    .foregroundStyle(isOn.wrappedValue ? AppTheme.accent : AppTheme.textSecondary)
            }

            HStack(spacing: 0) {
                Text(label)
                    .foregroundStyle(AppTheme.textSecondary)

                Text(link)
                    .foregroundStyle(AppTheme.accent)
                    .underline()
            }
            .font(.footnote)
        }
    }


    private func submit() {
        // TODO: wire to the Auth API from the backend data-model phase.
        errorMessage = nil
    }
}

#Preview {
    CreateAccountView()
}
