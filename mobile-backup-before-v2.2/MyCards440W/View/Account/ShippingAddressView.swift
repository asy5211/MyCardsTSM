//
//  ShippingAddressView.swift
//  TSM (The Sealed Market)
//
//  Where orders get shipped. Reached from Account → Edit Profile, the
//  Account tab, and from checkout when no address is saved yet.
//  Live mode saves it to the server; Demo mode keeps it on this phone.
//

import SwiftUI

struct ShippingAddressView: View {
    /// True when shown as a pop-up (from checkout), which needs its own Cancel button.
    var showsCancel = false

    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    @State private var draft = ShippingAddress()
    @State private var didLoad = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showProblems = false

    /// What is still wrong with the form, in plain words (empty when it's fine).
    private var problems: [String] {
        var list: [String] = []
        if draft.fullName.trimmingCharacters(in: .whitespaces).count < 2 { list.append("Enter the name for the package.") }
        if draft.line1.trimmingCharacters(in: .whitespaces).count < 3 { list.append("Enter your street address.") }
        if draft.city.trimmingCharacters(in: .whitespaces).count < 2 { list.append("Enter your city.") }
        if draft.region.trimmingCharacters(in: .whitespaces).count < 2 { list.append("Enter your state.") }
        if !draft.hasValidPostalCode { list.append("Enter a 5-digit ZIP code, like 78701.") }
        return list
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                NeonCard {
                    VStack(alignment: .leading, spacing: 16) {
                        sectionTitle("Shipping Address",
                                     subtitle: "Orders are sent here. You can change it any time.")

                        field("Full Name", systemImage: "person") {
                            TextField("Name on the package...", text: $draft.fullName)
                                .textContentType(.name)
                        }
                        field("Street Address", systemImage: "house") {
                            TextField("Street and number...", text: $draft.line1)
                                .textContentType(.streetAddressLine1)
                        }
                        field("Apt, Suite (optional)", systemImage: "building.2") {
                            TextField("Apartment, suite, unit...", text: $draft.line2)
                                .textContentType(.streetAddressLine2)
                        }
                        field("City", systemImage: "mappin.and.ellipse") {
                            TextField("City...", text: $draft.city)
                                .textContentType(.addressCity)
                        }
                        HStack(alignment: .top, spacing: 12) {
                            field("State", systemImage: "map") {
                                TextField("TX", text: $draft.region)
                                    .textContentType(.addressState)
                                    .textInputAutocapitalization(.characters)
                                    .autocorrectionDisabled()
                            }
                            field("ZIP Code", systemImage: "number") {
                                TextField("78701", text: $draft.postalCode)
                                    .textContentType(.postalCode)
                                    .keyboardType(.numbersAndPunctuation)
                            }
                        }
                        Label("United States only for now.", systemImage: "globe.americas")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textTertiary)
                    }
                }

                if showProblems && !problems.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(problems, id: \.self) { problem in
                            Label(problem, systemImage: "info.circle")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.accent)
                        }
                    }
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }

                PrimaryButton(title: isSaving ? "Saving…" : "Save Address", systemImage: "checkmark") {
                    save()
                }
                .disabled(isSaving)
                .opacity(isSaving ? 0.5 : 1)
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Shipping Address")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if showsCancel {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .onAppear { loadDraftIfNeeded() }
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

    private func field<Content: View>(_ label: String, systemImage: String,
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

    // MARK: Actions

    private func loadDraftIfNeeded() {
        guard !didLoad else { return }
        if let saved = session.shippingAddress {
            draft = saved
        }
        didLoad = true
    }

    private func save() {
        errorMessage = nil
        guard problems.isEmpty else {
            showProblems = true
            return
        }
        var clean = draft
        clean.fullName = clean.fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        clean.line1 = clean.line1.trimmingCharacters(in: .whitespacesAndNewlines)
        clean.line2 = clean.line2.trimmingCharacters(in: .whitespacesAndNewlines)
        clean.city = clean.city.trimmingCharacters(in: .whitespacesAndNewlines)
        clean.region = clean.region.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        clean.postalCode = clean.postalCode.trimmingCharacters(in: .whitespacesAndNewlines)
        clean.country = "US"
        isSaving = true
        Task {
            do {
                try await session.saveShippingAddress(clean)
                dismiss()
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }
}

#Preview {
    NavigationStack {
        ShippingAddressView()
    }
    .environmentObject(AppSession(profile: ProfileStore()))
}
