//
//  OrderDetailView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct OrderDetailView: View {
    let order: Order

    @State private var showReviewSheet = false
    @State private var showReportSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                statusTimeline
                itemsSection
                if let tracking = order.trackingNumber {
                    trackingSection(tracking)
                }
                if let address = order.shippingAddress {
                    shippingSection(address)
                }
                actionButtons
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle(order.orderNumber)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showReviewSheet) { ReviewSellerSheet(order: order) }
        .sheet(isPresented: $showReportSheet) { FileReportSheet(order: order) }
    }

    private var header: some View {
        NeonCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.orderNumber).font(.headline.weight(.heavy))
                    Text(order.orderDate, style: .date).font(.caption).foregroundStyle(AppTheme.textSecondary)
                }
                Spacer()
                Text(order.total, format: .currency(code: "USD"))
                    .font(.title3.weight(.heavy))
                    .foregroundStyle(AppTheme.accent)
            }
        }
    }

    private var statusTimeline: some View {
        let stages: [OrderStatus] = [.placed, .processing, .shipped, .delivered]
        let currentIndex = stages.firstIndex(of: order.status) ?? 0
        return HStack(spacing: 4) {
            ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                VStack(spacing: 6) {
                    Circle()
                        .fill(index <= currentIndex ? AppTheme.accent : AppTheme.surface)
                        .frame(width: 12, height: 12)
                    Text(stage.rawValue)
                        .font(.system(size: 9))
                        .foregroundStyle(AppTheme.textSecondary)
                }
                if index < stages.count - 1 {
                    Rectangle()
                        .fill(index < currentIndex ? AppTheme.accent : AppTheme.surface)
                        .frame(height: 2)
                        .offset(y: -8)
                }
            }
        }
        .opacity(order.status == .cancelled ? 0.35 : 1)
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Items")
            ForEach(order.items) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.product.name).font(.subheadline.weight(.semibold))
                        Text("Sold by \(item.listing.seller.name) · Qty \(item.quantity)")
                            .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    }
                    Spacer()
                    Text(item.listing.price * Double(item.quantity), format: .currency(code: "USD"))
                        .font(.subheadline.weight(.bold))
                }
                .padding(12)
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private func shippingSection(_ address: ShippingAddress) -> some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "mappin.and.ellipse").foregroundStyle(AppTheme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Shipping to").font(.caption).foregroundStyle(AppTheme.textSecondary)
                    ForEach(address.displayLines, id: \.self) { line in
                        Text(line).font(.footnote.weight(.semibold))
                    }
                }
                Spacer()
            }
        }
    }

    private func trackingSection(_ tracking: String) -> some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            HStack {
                Image(systemName: "shippingbox").foregroundStyle(AppTheme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tracking Number").font(.caption).foregroundStyle(AppTheme.textSecondary)
                    Text(tracking).font(.footnote.weight(.semibold))
                }
                Spacer()
            }
        }
    }

    private var actionButtons: some View {
        VStack(spacing: 10) {
            if order.status == .delivered {
                SecondaryButton(title: "Review Seller", systemImage: "star") { showReviewSheet = true }
            }
            SecondaryButton(title: "File a Report", systemImage: "exclamationmark.bubble") { showReportSheet = true }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(AppTheme.accent).frame(width: 4, height: 16)
            Text(title).font(.headline)
        }
    }
}

// Minimal sheets for now — full versions land once the Reviews and
// Support Ticket APIs exist (Milestones 5/6); "File a Report" is meant to
// feed the same support-ticket shape used by Sell-to-Us review.
private struct ReviewSellerSheet: View {
    let order: Order
    @Environment(\.dismiss) private var dismiss
    @State private var rating = 5
    @State private var comment = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Rate your seller") {
                    Picker("Stars", selection: $rating) {
                        ForEach(1...5, id: \.self) { Text("\($0) ★") }
                    }
                    TextField("Leave a comment...", text: $comment, axis: .vertical)
                }
            }
            .navigationTitle("Review Seller")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") { dismiss() } // TODO: wire to Reviews API
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

private struct FileReportSheet: View {
    let order: Order
    @Environment(\.dismiss) private var dismiss
    @State private var reportText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("What went wrong?") {
                    TextField("Describe the issue...", text: $reportText, axis: .vertical)
                }
            }
            .navigationTitle("File a Report")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") { dismiss() } // TODO: feeds the shared Support Ticket system
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        OrderDetailView(order: SampleData.sampleOrders[0])
    }
}
