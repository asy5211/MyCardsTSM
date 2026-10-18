//
//  PurchaseHistoryView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct PurchaseHistoryView: View {
    @EnvironmentObject private var orderStore: OrderStore
    @EnvironmentObject private var session: AppSession

    private let sampleOrders = SampleData.sampleOrders

    var body: some View {
        Group {
            if session.isLive {
                // Real orders from the TSM server.
                LiveOrderListView()
            } else {
                demoOrders
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("My Orders")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Order.self) { order in
            OrderDetailView(order: order)
        }
    }

    /// Demo data: orders placed in this session plus the built-in samples.
    private var demoOrders: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if !orderStore.orders.isEmpty {
                    sectionLabel("Your Orders (demo checkout)")
                    ForEach(orderStore.orders) { order in
                        NavigationLink(value: order) {
                            orderRow(order)
                        }
                        .buttonStyle(.plain)
                    }
                    sectionLabel("Sample Orders")
                } else {
                    Text("Orders placed in the app appear here. Checkout is a demo for now, so new orders aren't kept after you close the app.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textTertiary)
                }
                ForEach(sampleOrders) { order in
                    NavigationLink(value: order) {
                        orderRow(order)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
        .refreshable {
            await session.refreshMe()
        }
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.caption.weight(.heavy))
            .foregroundStyle(AppTheme.accent)
            .padding(.top, 4)
    }

    private func orderRow(_ order: Order) -> some View {
        NeonCard(borderColor: order.status == .cancelled ? Color.white.opacity(0.15) : AppTheme.accent) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.orderNumber).font(.subheadline.weight(.bold))
                    Text(order.orderDate, style: .date).font(.caption2).foregroundStyle(AppTheme.textSecondary)
                    if let first = order.items.first {
                        Text(first.product.name).font(.caption).foregroundStyle(AppTheme.textSecondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    statusBadge(order.status)
                    Text(order.total, format: .currency(code: "USD")).font(.footnote.weight(.semibold))
                }
            }
        }
    }

    private func statusBadge(_ status: OrderStatus) -> some View {
        Text(status.rawValue.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(badgeColor(status).opacity(0.2))
            .foregroundStyle(badgeColor(status))
            .clipShape(Capsule())
    }

    private func badgeColor(_ status: OrderStatus) -> Color {
        switch status.color {
        case .neutral: return AppTheme.textSecondary
        case .accent: return AppTheme.accent
        case .success: return AppTheme.verifiedGreen
        case .danger: return .red
        }
    }
}

#Preview {
    NavigationStack {
        PurchaseHistoryView()
    }
    .environmentObject(OrderStore())
    .environmentObject(LiveOrderStore())
    .environmentObject(AppRouter())
    .environmentObject(AppSession(profile: ProfileStore()))
}
