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
    @Environment(\.dismiss) private var dismiss

    @State private var username = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var draftImage: UIImage?
    @State private var avatarChanged = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var didLoadDraft = false

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
                        }
                        if !emailLooksValid {
                            Label("Enter a valid email address.", systemImage: "info.circle")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.accent)
                        }

                        field("Phone Number", systemImage: "phone") {
                            TextField("Enter your phone number...", text: $phone)
                                .keyboardType(.phonePad)
                        }
                    }
                }

                PrimaryButton(title: "Save Changes", systemImage: "checkmark") {
                    save()
                }
                .disabled(!emailLooksValid)
                .opacity(emailLooksValid ? 1 : 0.5)
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
        phone = profile.phone
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
        profile.update(username: username.trimmingCharacters(in: .whitespaces),
                       email: email.trimmingCharacters(in: .whitespaces),
                       phone: phone.trimmingCharacters(in: .whitespaces))
        if avatarChanged {
            profile.setAvatar(draftImage)
        }
        dismiss()
    }
}

#Preview {
    NavigationStack {
        EditProfileView()
    }
    .environmentObject(ProfileStore())
}
