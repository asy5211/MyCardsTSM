//
//  EditProfileView.swift
//  TSM (The Sealed Market)
//

import SwiftUI
import PhotosUI
import UIKit

/// Reached by tapping the account header on the Account tab. Changes are
/// staged locally and only applied when the user taps Save — backing out
/// discards them (including a newly picked photo).
struct EditProfileView: View {
    @EnvironmentObject private var profile: ProfileStore
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    @State private var username = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var draftImage: UIImage?
    @State private var avatarChanged = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var didLoadDraft = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var phoneLooksValid: Bool { PhoneFormat.isAcceptable(phone) }

    private var emailLooksValid: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty || (trimmed.contains("@") && trimmed.contains("."))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                avatarSection

                NeonCard {
                    VStack(alignment: .leading, spacing: 16) {
                        field("Username", systemImage: "person") {
                            TextField("Choose a username...", text: $username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }

                        field("Email Address", systemImage: "envelope") {
                            TextField("Enter your email address...", text: $email)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .disabled(session.isLive)
                                .opacity(session.isLive ? 0.6 : 1)
                        }
                        if session.isLive {
                            Text("Your email address can't be changed yet.")
                                .font(.caption)
                                .foregroundStyle(AppTheme.textTertiary)
                        }
                        if !emailLooksValid {
                            Label("Enter a valid email address.", systemImage: "info.circle")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.accent)
                        }

                        field("Phone Number", systemImage: "phone") {
                            TextField("+1 (555) - 123 - 4567", text: $phone)
                                .keyboardType(.phonePad)
                                .textContentType(.telephoneNumber)
                                .phoneFormatted($phone)
                        }
                        if !phoneLooksValid {
                            Label(PhoneFormat.problemText, systemImage: "info.circle")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.accent)
                        }
                    }
                }

                addressCard

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }

                PrimaryButton(title: isSaving ? "Saving…" : "Save Changes", systemImage: "checkmark") {
                    save()
                }
                .disabled(!emailLooksValid || !phoneLooksValid || isSaving)
                .opacity(emailLooksValid && phoneLooksValid && !isSaving ? 1 : 0.5)
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Edit Profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { loadDraftIfNeeded() }
        .onChange(of: pickerItem) { _, item in
            loadPhoto(from: item)
        }
    }

    // MARK: Subviews

    private var avatarSection: some View {
        VStack(spacing: 12) {
            PhotosPicker(selection: $pickerItem, matching: .images) {
                VStack(spacing: 10) {
                    ZStack(alignment: .bottomTrailing) {
                        AvatarView(image: draftImage, size: 110)
                        Image(systemName: "camera.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(8)
                            .background(AppTheme.accent)
                            .clipShape(Circle())
                    }
                    Text(draftImage == nil ? "Add Profile Photo" : "Change Photo")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.accent)
                }
            }

            if draftImage != nil {
                Button(role: .destructive) {
                    draftImage = nil
                    avatarChanged = true
                    pickerItem = nil
                } label: {
                    Text("Remove Photo").font(.footnote.weight(.semibold))
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    /// Shipping address summary with a way in to add or change it (saved on its own screen).
    private var addressCard: some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    Rectangle().fill(AppTheme.accent).frame(width: 4, height: 18)
                    Text("Shipping Address").font(.headline)
                }
                if let address = session.shippingAddress, address.isComplete {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(address.displayLines, id: \.self) { line in
                            Text(line).font(.footnote)
                        }
                    }
                } else {
                    Text("No address saved yet. You'll need one to check out.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                NavigationLink {
                    ShippingAddressView()
                } label: {
                    Label(session.shippingAddress == nil ? "Add Address" : "Change Address",
                          systemImage: "mappin.and.ellipse")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.accent)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
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
        guard !didLoadDraft else { return }
        username = profile.username
        email = profile.email
        phone = PhoneFormat.format(profile.phone)
        draftImage = profile.avatar
        didLoadDraft = true
    }

    private func loadPhoto(from item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                draftImage = image
                avatarChanged = true
            }
        }
    }

    private func save() {
        errorMessage = nil
        isSaving = true
        let newName = username.trimmingCharacters(in: .whitespaces)
        let newEmail = email.trimmingCharacters(in: .whitespaces)
        let newPhone = phone.trimmingCharacters(in: .whitespaces)
        Task {
            do {
                // Demo mode saves on this device; Live mode saves to the server.
                try await session.saveProfile(username: newName, email: newEmail, phone: newPhone)
                if avatarChanged {
                    profile.setAvatar(draftImage)
                }
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
    let profile = ProfileStore()
    NavigationStack {
        EditProfileView()
    }
    .environmentObject(profile)
    .environmentObject(AppSession(profile: profile))
}
