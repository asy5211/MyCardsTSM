//
//  LiveOrdersView.swift
//  TSM (The Sealed Market)
//
//  The Orders tab for a real (Live server) account: the list of orders, one
//  order with its tracking, the chat with the seller, "I received it" and the
//  star review for each item, plus the screen shown right after checkout.
//

import SwiftUI

private func orderStatusColor(_ status: String) -> Color {
    switch status {
    case "shipped": return AppTheme.accent
    case "delivered": return AppTheme.verifiedGreen
    case "cancelled": return .red
    default: return AppTheme.textSecondary
    }
}

private struct LiveOrderStatusBadge: View {
    let order: OrderDTO

    var body: some View {
        Text(order.statusTitle.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(orderStatusColor(order.status).opacity(0.2))
            .foregroundStyle(orderStatusColor(order.status))
            .clipShape(Capsule())
    }
}

// MARK: - List

struct LiveOrderListView: View {
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var liveOrders: LiveOrderStore
    @EnvironmentObject private var router: AppRouter
    @AppStorage("isSignedIn") private var isSignedIn = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if !isSignedIn {
                    signInNeeded
                } else if !liveOrders.hasLoaded && liveOrders.loadError == nil {
                    ProgressView()
                        .tint(AppTheme.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                } else {
                    if let problem = liveOrders.loadError {
                        NeonCard {
                            VStack(spacing: 10) {
                                Text(problem)
                                    .font(.footnote)
                                    .foregroundStyle(AppTheme.textSecondary)
                                    .multilineTextAlignment(.center)
                                SecondaryButton(title: "Try Again", systemImage: "arrow.clockwise") {
                                    Task { await liveOrders.refresh(using: session) }
                                }
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    if liveOrders.orders.isEmpty && liveOrders.loadError == nil {
                        VStack(spacing: 10) {
                            Image(systemName: "shippingbox")
                                .font(.system(size: 40))
                                .foregroundStyle(AppTheme.textTertiary)
                            Text("No orders yet").font(.headline)
                            Text("Orders you place show up here with tracking, the chat with the seller and your reviews.")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.textSecondary)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                    }
                    ForEach(liveOrders.orders) { order in
                        NavigationLink(value: order) {
                            row(order)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await liveOrders.refresh(using: session) }
        .task(id: "\(session.reloadKey)|\(isSignedIn)") {
            if isSignedIn { await liveOrders.refresh(using: session) }
        }
        .navigationDestination(for: OrderDTO.self) { order in
            LiveOrderDetailView(orderID: order.id)
        }
    }

    private var signInNeeded: some View {
        VStack(spacing: 14) {
            Image(systemName: "person.crop.circle.badge.exclamationmark")
                .font(.system(size: 44))
                .foregroundStyle(AppTheme.accent)
            Text("Sign in to see your orders").font(.headline)
            Text("Your orders, tracking numbers and seller chats live in your account.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
            PrimaryButton(title: "Go to Account") {
                router.tab = .account
            }
            .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }

    private func row(_ order: OrderDTO) -> some View {
        NeonCard(borderColor: order.status == "cancelled" ? Color.white.opacity(0.15) : AppTheme.accent) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.orderNumber).font(.subheadline.weight(.bold))
                    Text(order.createdDate, style: .date)
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                    if let first = order.items.first {
                        Text(order.items.count > 1 ? "\(first.productName) + \(order.items.count - 1) more" : first.productName)
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                        if let box = first.boxLabel, !box.isEmpty {
                            Text(box)
                                .font(.caption2)
                                .foregroundStyle(AppTheme.textTertiary)
                        }
                    }
                    Text("Sold by \(order.seller.displayName)")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textTertiary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    LiveOrderStatusBadge(order: order)
                    Text(Money.text(cents: order.subtotalCents)).font(.footnote.weight(.semibold))
                }
            }
        }
    }
}

// MARK: - One order

struct LiveOrderDetailView: View {
    let orderID: String

    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var liveOrders: LiveOrderStore

    @State private var reviewTarget: OrderItemDTO?
    @State private var isWorking = false
    @State private var errorText: String?
    @State private var showReceivedConfirm = false

    private var order: OrderDTO? { liveOrders.order(withID: orderID) }

    var body: some View {
        Group {
            if let order {
                content(order)
            } else {
                VStack(spacing: 10) {
                    Text("Order not found").font(.title3.weight(.bold))
                    Text("Pull down on the Orders list to refresh it.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle(order?.orderNumber ?? "Order")
        .navigationBarTitleDisplayMode(.inline)
        .task { await liveOrders.reload(orderID, using: session) }
        .sheet(item: $reviewTarget) { item in
            ReviewItemSheet(orderID: orderID, item: item, sellerName: order?.seller.displayName)
                .tint(AppTheme.accent)
                .preferredColorScheme(.dark)
        }
        .alert("Did you receive this order?", isPresented: $showReceivedConfirm) {
            Button("Yes, I Received It") { markReceived() }
            Button("Not Yet", role: .cancel) {}
        } message: {
            Text("This tells the seller it arrived. You can still message them or contact support afterwards.")
        }
    }

    private func content(_ order: OrderDTO) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header(order)
                timeline(order)
                itemsSection(order)
                trackingSection(order)
                shippingSection(order.shippingAddress.toShippingAddress())
                actions(order)
            }
            .padding(16)
        }
        .refreshable { await liveOrders.reload(orderID, using: session) }
    }

    // MARK: Pieces

    private func header(_ order: OrderDTO) -> some View {
        NeonCard {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.orderNumber).font(.headline.weight(.heavy))
                    Text(order.createdDate, style: .date)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                    Text("Sold by \(order.seller.displayName)")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    Text(Money.text(cents: order.subtotalCents))
                        .font(.title3.weight(.heavy))
                        .foregroundStyle(AppTheme.accent)
                    LiveOrderStatusBadge(order: order)
                }
            }
        }
    }

    private func timeline(_ order: OrderDTO) -> some View {
        let stages = ["Placed", "Shipped", "Delivered"]
        let keys = ["placed", "shipped", "delivered"]
        let currentIndex = keys.firstIndex(of: order.status) ?? 0
        return HStack(spacing: 4) {
            ForEach(Array(stages.enumerated()), id: \.offset) { index, stage in
                VStack(spacing: 6) {
                    Circle()
                        .fill(index <= currentIndex ? AppTheme.accent : AppTheme.surface)
                        .frame(width: 12, height: 12)
                    Text(stage)
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
        .opacity(order.status == "cancelled" ? 0.35 : 1)
    }

    private func itemsSection(_ order: OrderDTO) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Items")
            ForEach(order.items) { item in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 12) {
                        ProductPhoto(path: item.thumbnailUrl, contentMode: .fit, placeholderSize: 20)
                            .frame(width: 52, height: 52)
                            .background(AppTheme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.productName).font(.subheadline.weight(.semibold))
                            Text("Qty \(item.quantity) · \(Money.text(cents: item.unitPriceCents)) each")
                                .font(.caption)
                                .foregroundStyle(AppTheme.textSecondary)
                            if let box = item.boxLabel, !box.isEmpty {
                                Label(box, systemImage: "shippingbox")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(AppTheme.accent)
                            }
                            if let sourceText = sourceLine(for: item) {
                                Text(sourceText)
                                    .font(.caption2)
                                    .foregroundStyle(AppTheme.textTertiary)
                            }
                        }
                        Spacer()
                        Text(Money.text(cents: item.lineTotalCents))
                            .font(.subheadline.weight(.bold))
                    }
                    reviewArea(order: order, item: item)
                }
                .padding(12)
                .background(AppTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    /// "Sourced from Authorized distributor · Card Depot", or nil when the seller gave nothing.
    private func sourceLine(for item: OrderItemDTO) -> String? {
        guard let label = item.sourceLabel, !label.isEmpty else { return nil }
        var text = "Sourced from " + label
        if let distributor = item.distributor, !distributor.isEmpty {
            text += " · " + distributor
        }
        return text
    }

    @ViewBuilder
    private func reviewArea(order: OrderDTO, item: OrderItemDTO) -> some View {
        if let review = item.review {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text("Your review").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                    StarRatingView(rating: Double(review.rating))
                }
                if let comment = review.comment, !comment.isEmpty {
                    Text(comment).font(.footnote)
                }
                if let reply = review.sellerResponse, !reply.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Reply from \(order.seller.displayName)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(AppTheme.textSecondary)
                        Text(reply).font(.footnote)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(AppTheme.surfaceElevated.opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if order.status != "cancelled" {
            // A review is open as soon as the purchase is made (not on a cancelled order).
            Button {
                reviewTarget = item
            } label: {
                Label("Review \(order.seller.displayName) for this purchase", systemImage: "star")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(AppTheme.accent)
            }
        }
    }

    private func trackingSection(_ order: OrderDTO) -> some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "shippingbox").foregroundStyle(AppTheme.accent)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Tracking").font(.caption).foregroundStyle(AppTheme.textSecondary)
                        if let number = order.trackingNumber, !number.isEmpty {
                            if let carrier = order.carrier, !carrier.isEmpty {
                                Text(carrier.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                            }
                            Text(number).font(.footnote.weight(.semibold)).textSelection(.enabled)
                            if let shipped = order.shippedDate {
                                Text("Shipped \(shipped, style: .date)")
                                    .font(.caption2)
                                    .foregroundStyle(AppTheme.textTertiary)
                            }
                        } else {
                            Text("Tracking appears here as soon as the seller ships your order.")
                                .font(.footnote)
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                    Spacer()
                }
                if let link = order.trackingUrl, let url = URL(string: link) {
                    Link(destination: url) {
                        Label("Track package", systemImage: "arrow.up.right.square")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(AppTheme.accent)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
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

    private func actions(_ order: OrderDTO) -> some View {
        VStack(spacing: 10) {
            if let errorText {
                Text(errorText)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.accent)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if order.status == "shipped" {
                PrimaryButton(title: isWorking ? "Saving…" : "I Received It", systemImage: "checkmark.circle") {
                    showReceivedConfirm = true
                }
                .disabled(isWorking)
                .opacity(isWorking ? 0.5 : 1)
            }
            NavigationLink {
                ChatThreadView(
                    title: "Message Seller",
                    intro: "Chat with \(order.seller.displayName) about \(order.orderNumber).",
                    canSend: order.status != "cancelled",
                    closedText: "This order was cancelled.",
                    load: { try await liveOrders.messages(for: orderID, using: session) },
                    send: { text in try await liveOrders.sendMessage(text, orderID: orderID, using: session) }
                )
            } label: {
                actionLabel("Message the Seller", systemImage: "bubble.left.and.bubble.right")
            }
            NavigationLink {
                ContactSupportView(topic: .order,
                                   subject: "Problem with \(order.orderNumber) (\(order.seller.displayName))",
                                   orderID: order.id,
                                   orderLabel: order.orderNumber,
                                   sellerName: order.seller.displayName,
                                   sellerIsTsm: order.seller.isTsm ?? false)
            } label: {
                actionLabel("Report a Problem", systemImage: "exclamationmark.bubble")
            }
        }
    }

    private func actionLabel(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
            Text(title.uppercased())
                .font(.system(size: 15, weight: .heavy, design: .rounded))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .foregroundStyle(.white)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.cornerRadius, style: .continuous)
                .stroke(Color.white.opacity(0.25), lineWidth: 1)
        )
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(AppTheme.accent).frame(width: 4, height: 16)
            Text(title).font(.headline)
        }
    }

    // MARK: Actions

    private func markReceived() {
        isWorking = true
        errorText = nil
        Task {
            do {
                try await liveOrders.markReceived(orderID, using: session)
            } catch is CancellationError {
                // Left the screen.
            } catch {
                errorText = error.localizedDescription
            }
            isWorking = false
        }
    }
}

// MARK: - Rate an item

struct ReviewItemSheet: View {
    let orderID: String
    let item: OrderItemDTO
    /// A review is of the seller (on this product), so the sheet says who it is about.
    var sellerName: String? = nil

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var liveOrders: LiveOrderStore

    @State private var rating = 5
    @State private var comment = ""
    @State private var isSending = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(sellerName.map { "\($0) · \(item.productName)" } ?? item.productName) {
                    HStack {
                        Spacer()
                        StarPicker(rating: $rating)
                        Spacer()
                    }
                    .padding(.vertical, 6)
                    TextField("What did you think? (optional)", text: $comment, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section {
                    Text("Your review is of the seller and shows on their offer for this product. It is public and shows your username. Reviews can't be changed once sent.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let errorText {
                    Section {
                        Text(errorText).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Review the Seller")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSending ? "Sending…" : "Submit") { submit() }
                        .disabled(isSending)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func submit() {
        isSending = true
        errorText = nil
        Task {
            do {
                try await liveOrders.review(orderID: orderID, itemID: item.id, rating: rating,
                                            comment: comment, using: session)
                dismiss()
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                errorText = error.localizedDescription
            }
            isSending = false
        }
    }
}

// MARK: - After checkout

/// Shown right after the server accepted the order(s). One order is made per seller.
struct LiveOrderConfirmationView: View {
    let orderIDs: [String]

    @EnvironmentObject private var liveOrders: LiveOrderStore
    @EnvironmentObject private var router: AppRouter

    private var placed: [OrderDTO] {
        orderIDs.compactMap { liveOrders.order(withID: $0) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(AppTheme.verifiedGreen)
                    .padding(.top, 30)

                if placed.isEmpty {
                    Text("Order Placed").font(.title2.weight(.heavy))
                    Text("Find it under Orders.")
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textSecondary)
                } else {
                    Text(placed.count == 1 ? "Order Placed" : "\(placed.count) Orders Placed")
                        .font(.title2.weight(.heavy))
                    if placed.count > 1 {
                        Text("Each seller ships their own order.")
                            .font(.footnote)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                    ForEach(placed) { order in
                        orderCard(order)
                    }
                    if let first = placed.first {
                        NeonCard(borderColor: Color.white.opacity(0.15)) {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "mappin.and.ellipse").foregroundStyle(AppTheme.accent)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Shipping to").font(.caption).foregroundStyle(AppTheme.textSecondary)
                                    ForEach(first.shippingAddress.toShippingAddress().displayLines, id: \.self) { line in
                                        Text(line).font(.footnote)
                                    }
                                }
                                Spacer()
                            }
                        }
                    }
                }

                Text("Payment isn't connected yet, so no card was charged. Your seller will ship the order; tracking and the chat with the seller are in Orders.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textTertiary)
                    .multilineTextAlignment(.center)

                PrimaryButton(title: "View My Orders", systemImage: "shippingbox") {
                    router.popToHome()
                    router.tab = .orders
                }
                SecondaryButton(title: "Keep Shopping") {
                    router.popToHome()
                }
            }
            .padding(20)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Order Placed")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
    }

    private func orderCard(_ order: OrderDTO) -> some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(order.orderNumber).font(.headline).foregroundStyle(AppTheme.accent)
                    Spacer()
                    Text("Sold by \(order.seller.displayName)")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                ForEach(order.items) { item in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.productName).font(.subheadline.weight(.semibold))
                            Text("Qty \(item.quantity)")
                                .font(.caption)
                                .foregroundStyle(AppTheme.textSecondary)
                            if let box = item.boxLabel, !box.isEmpty {
                                Label(box, systemImage: "shippingbox")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(AppTheme.accent)
                            }
                        }
                        Spacer()
                        Text(Money.text(cents: item.lineTotalCents))
                            .font(.subheadline.weight(.bold))
                    }
                }
                Divider().overlay(Color.white.opacity(0.1))
                HStack {
                    Text("Total").font(.headline)
                    Spacer()
                    Text(Money.text(cents: order.subtotalCents))
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(AppTheme.accent)
                }
            }
        }
    }
}
