//
//  SellerApplicationView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI
import UniformTypeIdentifiers

struct SellerApplicationView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("isApprovedSeller") private var isApprovedSeller = false

    @State private var businessName = ""
    @State private var businessAddress = ""
    @State private var email = ""
    @State private var phoneNumber = ""
    @State private var sourceType: ProductSourceType = .distributor
    @State private var distributorList = ""
    @State private var documentFileNames: [String] = []
    @State private var showFileImporter = false
    @State private var didSubmit = false

    private var canSubmit: Bool {
        !businessName.isEmpty && !businessAddress.isEmpty && !email.isEmpty
            && !distributorList.isEmpty && !documentFileNames.isEmpty
    }

    /// QA/demo shortcut: entering "test" in every field below (with the
    /// "Test" source option and any document attached) auto-approves the
    /// applicant as a seller on submit, skipping admin review entirely —
    /// there's no backend yet to actually review applications against.
    private var isTestApplication: Bool {
        let t = "test"
        return businessName.trimmingCharacters(in: .whitespaces).lowercased() == t
            && businessAddress.trimmingCharacters(in: .whitespaces).lowercased() == t
            && email.trimmingCharacters(in: .whitespaces).lowercased() == t
            && phoneNumber.trimmingCharacters(in: .whitespaces).lowercased() == t
            && sourceType == .test
            && !documentFileNames.isEmpty
    }

    var body: some View {
        Group {
            if didSubmit {
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
                header

                NeonCard {
                    VStack(alignment: .leading, spacing: 16) {
                        sectionTitle("Business Information", subtitle: "Provide your business details to get started.")

                        labeledField("Business Name", systemImage: "storefront") {
                            TextField("Enter business name...", text: $businessName)
                        }
                        labeledField("Business Address", systemImage: "mappin.and.ellipse") {
                            TextField("Enter business address...", text: $businessAddress)
                        }
                        labeledField("Email Address", systemImage: "envelope") {
                            TextField("Enter email address...", text: $email)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                        }
                        labeledField("Phone Number", systemImage: "phone") {
                            TextField("Enter phone number...", text: $phoneNumber)
                                .keyboardType(.phonePad)
                        }
                        labeledField("Product Source", systemImage: "shippingbox") {
                            Picker("Product Source", selection: $sourceType) {
                                ForEach(ProductSourceType.allCases) { type in
                                    Text(type.rawValue).tag(type)
                                }
                            }
                            .pickerStyle(.menu)
                            .labelsHidden()
                            .tint(AppTheme.textPrimary)
                        }

                        // Functional requirement from the written spec: a free-text
                        // distributor list, kept separate from the category picker
                        // above. This later seeds the "Source" dropdown on the
                        // sell-to-us item form (Milestone 4).
                        VStack(alignment: .leading, spacing: 6) {
                            Text("List Your Distributors").font(.footnote.weight(.semibold))
                            TextField("e.g. Acme Wholesale, Card Depot, direct from manufacturer...",
                                      text: $distributorList, axis: .vertical)
                                .padding(12)
                                .background(AppTheme.background)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
                            Text("Comma-separate multiple sources — you'll pick from these later when listing inventory.")
                                .font(.caption2)
                                .foregroundStyle(AppTheme.textTertiary)
                        }
                    }
                }

                verificationDocuments
                whyVerificationMatters

                HStack(spacing: 10) {
                    SecondaryButton(title: "Cancel") { dismiss() }
                    PrimaryButton(title: "Submit Application", systemImage: "paperplane.fill") { submit() }
                        .disabled(!canSubmit)
                        .opacity(canSubmit ? 1 : 0.5)
                }
            }
            .padding(20)
        }
    }

    private var header: some View {
        NeonCard {
            HStack(spacing: 14) {
                Image(systemName: "checkmark.shield").font(.system(size: 36))
                Rectangle().fill(AppTheme.accent).frame(width: 3)
                VStack(alignment: .leading, spacing: 4) {
                    Text("BECOME AN").font(.system(size: 16, weight: .heavy, design: .rounded))
                    Text("APPROVED SELLER")
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundStyle(AppTheme.accent)
                    Text("Apply to join our trusted seller network.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
    }

    private var verificationDocuments: some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle("Verification Documents", subtitle: "Upload any supporting documents for your business.")

                VStack(spacing: 10) {
                    Image(systemName: "icloud.and.arrow.up")
                        .font(.system(size: 34))
                        .foregroundStyle(AppTheme.accent)
                    Text("Upload Verification Documents").font(.footnote.weight(.bold))
                    Text("Business License, City Permit, Tax Permit, or Other Supporting Documents")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                        .multilineTextAlignment(.center)
                    Button {
                        showFileImporter = true
                    } label: {
                        Label("Choose Files", systemImage: "plus.circle.fill")
                            .font(.footnote.weight(.heavy))
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .background(AppTheme.accent)
                            .clipShape(Capsule())
                            .foregroundStyle(.white)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(20)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                        .foregroundStyle(AppTheme.accent.opacity(0.5))
                )

                ForEach(documentFileNames, id: \.self) { name in
                    HStack {
                        Image(systemName: "doc.fill").foregroundStyle(AppTheme.textSecondary)
                        Text(name).font(.caption).lineLimit(1)
                        Spacer()
                        Button {
                            documentFileNames.removeAll { $0 == name }
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                    .padding(8)
                    .background(AppTheme.background)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .fileImporter(isPresented: $showFileImporter,
                      allowedContentTypes: [.pdf, .image],
                      allowsMultipleSelection: true) { result in
            if case .success(let urls) = result {
                documentFileNames.append(contentsOf: urls.map(\.lastPathComponent))
            }
        }
    }

    private var whyVerificationMatters: some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "checkmark.shield.fill")
                Rectangle().fill(AppTheme.accent).frame(width: 3)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Why Verification Matters").font(.subheadline.weight(.bold))
                    Text("We verify all sellers to ensure a safe marketplace, authentic products, and a trusted experience for our buyers.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
    }

    private var confirmationState: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(AppTheme.verifiedGreen)
            Text(isTestApplication ? "Auto-Approved (Test)" : "Application Submitted")
                .font(.title3.weight(.bold))
            Text(isTestApplication
                 ? "Test application detected — you're approved immediately so you can try the approved-seller flow."
                 : "We'll review your business details and follow up by email once a decision is made.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            PrimaryButton(title: "Done") { dismiss() }
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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

    private func submit() {
        // TODO: POST to the SellerApplication API (Milestone 3 backend) with
        // businessName / businessAddress / email / phoneNumber / sourceType /
        // distributorList and the uploaded document set.
        if isTestApplication {
            isApprovedSeller = true
        }
        didSubmit = true
    }
}

#Preview {
    NavigationStack {
        SellerApplicationView()
    }
}
