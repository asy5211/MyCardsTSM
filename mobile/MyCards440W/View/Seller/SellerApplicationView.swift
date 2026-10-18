//
//  SellerApplicationView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//
//  The "become a seller" form. In Live mode it sends the details and the
//  chosen documents to the TSM server, where staff review them. Once an
//  application exists, Account → Seller Application shows its status
//  (SellerApplicationStatusView) instead of this form again. A waiting
//  application is labelled "Pending".
//

import SwiftUI
import UniformTypeIdentifiers

/// The largest document the server accepts, and how many can be attached.
private enum ApplicationLimits {
    static let maxDocumentBytes = 10 * 1024 * 1024
    static let maxDocuments = 5
}

struct SellerApplicationView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var router: AppRouter

    @State private var businessName = ""
    @State private var businessAddress = ""
    @State private var email = ""
    @State private var phoneNumber = ""
    @State private var sourceType: ProductSourceType = .distributor
    @State private var distributorList = ""
    @State private var documents: [PickedDocument] = []
    @State private var showFileImporter = false
    @State private var documentProblem: String?
    @State private var isSubmitting = false
    @State private var submitError: String?
    @State private var didSubmit = false

    private var isTestApplication: Bool { sourceType == .test }

    /// Real applications need at least one document; the debug-only "Test"
    /// source skips that so the approved-seller flow can be tried quickly.
    private var canSubmit: Bool {
        let text = [businessName, businessAddress, email, distributorList]
        let filled = !text.contains { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return filled && PhoneFormat.isAcceptable(phoneNumber) && (!documents.isEmpty || isTestApplication)
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
        .navigationTitle("Seller Application")
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
                            TextField("+1 (555) - 123 - 4567", text: $phoneNumber)
                                .keyboardType(.phonePad)
                                .textContentType(.telephoneNumber)
                                .phoneFormatted($phoneNumber)
                        }
                        if !PhoneFormat.isAcceptable(phoneNumber) {
                            Label(PhoneFormat.problemText, systemImage: "info.circle")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.accent)
                        }
                        labeledField("Product Source", systemImage: "shippingbox") {
                            Picker("Product Source", selection: $sourceType) {
                                ForEach(ProductSourceType.selectable) { type in
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

                if let submitError {
                    Text(submitError)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }

                HStack(spacing: 10) {
                    SecondaryButton(title: "Cancel") { dismiss() }
                    PrimaryButton(title: isSubmitting ? "Sending…" : "Submit Application", systemImage: "paperplane.fill") { submit() }
                        .disabled(!canSubmit || isSubmitting)
                        .opacity(canSubmit && !isSubmitting ? 1 : 0.5)
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

                if let documentProblem {
                    Text(documentProblem)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }

                ForEach(documents) { document in
                    HStack {
                        Image(systemName: "doc.fill").foregroundStyle(AppTheme.textSecondary)
                        Text(document.filename).font(.caption).lineLimit(1)
                        Spacer()
                        Text(sizeText(document.data.count))
                            .font(.caption2)
                            .foregroundStyle(AppTheme.textTertiary)
                        Button {
                            documents.removeAll { $0.id == document.id }
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
                addDocuments(from: urls)
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
            Text(isTestApplication ? "Test Application Sent" : "Application Submitted")
                .font(.title3.weight(.bold))
            Text(isTestApplication
                 ? "Test applications are approved right away so you can try the approved-seller flow."
                 : "Your application is Pending. We'll review your business details and documents, and the decision shows up in your Account.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            if isTestApplication {
                PrimaryButton(title: "Done") { dismiss() }
                    .padding(.horizontal, 40)
            } else {
                // Takes you to Account → Seller Application, where the status lives.
                PrimaryButton(title: "Check Status", systemImage: "arrow.right") {
                    dismiss()
                    router.openSellerApplication()
                }
                .padding(.horizontal, 40)
                SecondaryButton(title: "Done") { dismiss() }
                    .padding(.horizontal, 40)
            }
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

    private func sizeText(_ bytes: Int) -> String {
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    /// Reads the chosen files into memory so they can be uploaded.
    private func addDocuments(from urls: [URL]) {
        documentProblem = nil
        for url in urls {
            if documents.count >= ApplicationLimits.maxDocuments {
                documentProblem = "You can attach up to \(ApplicationLimits.maxDocuments) documents."
                break
            }
            // Files picked from the Files app need explicit permission to be read.
            let opened = url.startAccessingSecurityScopedResource()
            defer {
                if opened { url.stopAccessingSecurityScopedResource() }
            }
            do {
                let data = try Data(contentsOf: url)
                if data.count > ApplicationLimits.maxDocumentBytes {
                    documentProblem = "\(url.lastPathComponent) is larger than 10 MB. Choose a smaller file."
                } else {
                    documents.append(PickedDocument(filename: url.lastPathComponent, data: data))
                }
            } catch {
                documentProblem = "Couldn't read \(url.lastPathComponent)."
            }
        }
    }

    private func submit() {
        submitError = nil
        isSubmitting = true
        var draft = SellerApplicationDraft()
        draft.businessName = businessName.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.businessAddress = businessAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.contactEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.phoneNumber = phoneNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.sourceType = sourceType
        draft.distributorList = distributorList.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.documents = documents
        Task {
            do {
                try await session.submitSellerApplication(draft)
                didSubmit = true
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                submitError = error.localizedDescription
            }
            isSubmitting = false
        }
    }
}

// MARK: - Status (after applying)

/// What Account → Seller Application shows once an application exists:
/// waiting for review, approved, or declined (with the reason).
struct SellerApplicationStatusView: View {
    @EnvironmentObject private var session: AppSession
    @State private var isRefreshing = false
    @State private var showForm = false

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                switch session.sellerApplicationState {
                case .pending:
                    pendingCard
                case .approved:
                    approvedCard
                case .declined(let note):
                    declinedCard(note: note)
                case .suspended(let note):
                    standingCard(title: "Selling Suspended",
                                 systemImage: "pause.circle.fill",
                                 note: note,
                                 explanation: "TSM paused your selling. Your account still works for shopping. Contact support to sort it out.")
                case .revoked(let note):
                    standingCard(title: "Selling Removed",
                                 systemImage: "minus.circle.fill",
                                 note: note,
                                 explanation: "Your selling privileges were removed. Your account still works for shopping. Contact support if you think this is a mistake.")
                case .notApplied:
                    EmptyView()
                }
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Seller Application")
        .navigationBarTitleDisplayMode(.inline)
        .task { await session.refreshMe() }
        .refreshable { await session.refreshMe() }
        .navigationDestination(isPresented: $showForm) {
            SellerApplicationView()
        }
    }

    private var pendingCard: some View {
        VStack(spacing: 14) {
            Image(systemName: "hourglass")
                .font(.system(size: 52))
                .foregroundStyle(AppTheme.accent)
            Text("Pending").font(.title2.weight(.heavy))
            if let when = session.sellerApplicationSubmittedAt {
                Text("Submitted \(when, style: .date)")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
            }
            Text("Thanks for applying. Our team is checking your business details and documents, so there's nothing more to do right now. You'll see the decision here and in your notifications.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
            SecondaryButton(title: isRefreshing ? "Checking…" : "Check Status", systemImage: "arrow.clockwise") {
                refresh()
            }
            .disabled(isRefreshing)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 30)
    }

    private var approvedCard: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 52))
                .foregroundStyle(AppTheme.verifiedGreen)
            Text("You're an Approved Seller").font(.title2.weight(.heavy))
            Text("Open the Sell tab and tap New Submission to send us products.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
            SellerDashboardCard()
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 30)
    }

    /// Selling was paused or removed by staff (the account itself is fine).
    private func standingCard(title: String, systemImage: String, note: String?, explanation: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 52))
                .foregroundStyle(AppTheme.accent)
            Text(title).font(.title2.weight(.heavy))
            if let note, !note.isEmpty {
                NeonCard(borderColor: Color.white.opacity(0.15)) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Note from TSM")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AppTheme.textSecondary)
                        Text(note).font(.footnote)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Text(explanation)
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
            NavigationLink {
                ContactSupportView(topic: .selling, subject: "My selling status")
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "lifepreserver")
                    Text("CONTACT SUPPORT").font(.system(size: 15, weight: .heavy, design: .rounded))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(.white)
                .background(AppTheme.accent)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 30)
    }

    private func declinedCard(note: String?) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "xmark.seal.fill")
                .font(.system(size: 52))
                .foregroundStyle(AppTheme.accent)
            Text("Application Declined").font(.title2.weight(.heavy))
            if let note, !note.isEmpty {
                NeonCard(borderColor: Color.white.opacity(0.15)) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Note from the review team")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AppTheme.textSecondary)
                        Text(note).font(.footnote)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Text("You can fix the issue and apply again.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
            PrimaryButton(title: "Apply Again", systemImage: "arrow.right") {
                showForm = true
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 30)
    }

    private func refresh() {
        isRefreshing = true
        Task {
            await session.refreshMe()
            isRefreshing = false
        }
    }
}

// MARK: - Entry point

/// The one place to open "Seller Application" from. Decides between the
/// sign-in prompt, the form (never applied), and the status screen.
struct SellerApplicationEntryView: View {
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var router: AppRouter
    @AppStorage("isSignedIn") private var isSignedIn = false

    var body: some View {
        Group {
            if !isSignedIn {
                signInNeeded
            } else {
                switch session.sellerApplicationState {
                case .notApplied:
                    SellerApplicationView()
                case .pending, .approved, .declined, .suspended, .revoked:
                    SellerApplicationStatusView()
                }
            }
        }
        .task { await session.refreshMe() }
    }

    private var signInNeeded: some View {
        VStack(spacing: 14) {
            Image(systemName: "person.crop.circle.badge.exclamationmark")
                .font(.system(size: 48))
                .foregroundStyle(AppTheme.accent)
            Text("Sign in to apply").font(.title3.weight(.bold))
            Text("You need an account to apply as a seller.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
            PrimaryButton(title: "Go to Account") {
                router.popToHome()
                router.tab = .account
            }
            .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Seller Application")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        SellerApplicationEntryView()
    }
    .environmentObject(AppRouter())
    .environmentObject(AppSession(profile: ProfileStore()))
}
