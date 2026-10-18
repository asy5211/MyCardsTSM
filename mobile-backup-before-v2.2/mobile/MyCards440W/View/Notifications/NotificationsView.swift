//
//  NotificationsView.swift
//  TSM (The Sealed Market)
//
//  Opened from the bell on Home. Opening it marks everything as seen, which
//  clears the red dot on the bell.
//

import SwiftUI

/// Remembers which notifications have been opened (their ids, comma-separated).
enum NotificationSeen {
    static let storageKey = "seenNotificationIDs"

    static func ids(from raw: String) -> Set<String> {
        return Set(raw.split(separator: ",").map(String.init))
    }

    static func raw(from ids: Set<String>) -> String {
        return ids.sorted().joined(separator: ",")
    }
}

struct NotificationsView: View {
    @EnvironmentObject private var session: AppSession
    @AppStorage(NotificationSeen.storageKey) private var seenRaw = ""

    private var items: [AppNotification] { session.currentNotifications() }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if items.isEmpty {
                    emptyState
                } else {
                    ForEach(items) { item in
                        row(item)
                    }
                    Text("Alerts about orders, offers and messages will appear here as those features go live.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textTertiary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 8)
                }
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await session.refreshMe()
        }
        .onAppear { markAllSeen() }
        .onChange(of: items.count) { _, _ in markAllSeen() }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "bell.slash")
                .font(.system(size: 40))
                .foregroundStyle(AppTheme.textTertiary)
            Text("You're all caught up")
                .font(.headline)
            Text("New alerts will show up here — like the result of your seller application.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    private func row(_ item: AppNotification) -> some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: item.systemImage)
                    .font(.title3)
                    .foregroundStyle(AppTheme.accent)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).font(.subheadline.weight(.bold))
                    Text(item.message)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                    if let date = item.date {
                        Text(date, style: .date)
                            .font(.caption2)
                            .foregroundStyle(AppTheme.textTertiary)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func markAllSeen() {
        var seen = NotificationSeen.ids(from: seenRaw)
        for item in items {
            seen.insert(item.id)
        }
        seenRaw = NotificationSeen.raw(from: seen)
    }
}

#Preview {
    NavigationStack {
        NotificationsView()
    }
    .environmentObject(AppSession(profile: ProfileStore()))
}
