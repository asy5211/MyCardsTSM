//
//  ReviewViews.swift
//  TSM (The Sealed Market)
//
//  Star ratings and what buyers wrote about a seller or a product. Anyone can
//  read them; only a buyer whose order shipped can leave one (from the order).
//

import SwiftUI

// MARK: - Stars

/// A read-only row of stars, e.g. ★★★★☆.
struct StarRatingView: View {
    let rating: Double
    var size: CGFloat = 12

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { star in
                Image(systemName: symbol(for: star))
                    .font(.system(size: size))
                    .foregroundStyle(.yellow)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(rating.formatted(.number.precision(.fractionLength(1)))) out of 5 stars")
    }

    private func symbol(for star: Int) -> String {
        let value = Double(star)
        if rating >= value - 0.25 { return "star.fill" }
        if rating >= value - 0.75 { return "star.leadinghalf.filled" }
        return "star"
    }
}

/// Tap-to-choose stars for writing a review.
struct StarPicker: View {
    @Binding var rating: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(1...5, id: \.self) { star in
                Button {
                    rating = star
                } label: {
                    Image(systemName: star <= rating ? "star.fill" : "star")
                        .font(.system(size: 32))
                        .foregroundStyle(.yellow)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(star) star\(star == 1 ? "" : "s")")
            }
        }
    }
}

// MARK: - A seller's (or product's) reviews

/// Which reviews to show.
enum ReviewSubject {
    case seller(id: UUID, name: String)
    case product(id: UUID, name: String)

    var title: String {
        switch self {
        case .seller(_, let name): return name
        case .product(_, let name): return name
        }
    }

    var heading: String {
        switch self {
        case .seller: return "Seller reviews"
        case .product: return "Product reviews"
        }
    }
}

struct ReviewsListView: View {
    let subject: ReviewSubject

    @EnvironmentObject private var session: AppSession
    @State private var page: ReviewsPageDTO?
    @State private var errorText: String?
    @State private var isLoading = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let page {
                    summaryCard(page.summary)
                    if page.items.isEmpty {
                        Text("No reviews yet. Buyers can review an item once the seller has shipped it.")
                            .font(.footnote)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                    ForEach(page.items) { review in
                        reviewCard(review)
                    }
                } else if let errorText {
                    NeonCard {
                        VStack(spacing: 10) {
                            Text(errorText)
                                .font(.footnote)
                                .foregroundStyle(AppTheme.textSecondary)
                                .multilineTextAlignment(.center)
                            SecondaryButton(title: "Try Again", systemImage: "arrow.clockwise") {
                                Task { await load() }
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                } else {
                    ProgressView()
                        .tint(AppTheme.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                }
            }
            .padding(16)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle(subject.heading)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: session.reloadKey) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorText = nil
        do {
            switch subject {
            case .seller(let id, _):
                page = try await session.fetchSellerReviews(sellerID: id)
            case .product(let id, _):
                page = try await session.fetchProductReviews(productID: id)
            }
        } catch is CancellationError {
            // Left the screen.
        } catch {
            if page == nil { errorText = error.localizedDescription }
        }
        isLoading = false
    }

    private func summaryCard(_ summary: ReviewSummaryDTO) -> some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(subject.title).font(.headline.weight(.heavy))
                if summary.count == 0 {
                    Text("No reviews yet").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(summary.average.formatted(.number.precision(.fractionLength(1))))
                            .font(.system(size: 40, weight: .heavy, design: .rounded))
                        VStack(alignment: .leading, spacing: 2) {
                            StarRatingView(rating: summary.average, size: 15)
                            Text("\(summary.count) review\(summary.count == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                    VStack(spacing: 5) {
                        ForEach([5, 4, 3, 2, 1], id: \.self) { stars in
                            distributionRow(stars: stars, count: summary.count(forStars: stars), total: summary.count)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func distributionRow(stars: Int, count: Int, total: Int) -> some View {
        HStack(spacing: 8) {
            Text("\(stars)★")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(AppTheme.textSecondary)
                .frame(width: 26, alignment: .leading)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(AppTheme.surfaceElevated)
                    Capsule()
                        .fill(Color.yellow)
                        .frame(width: total > 0 ? geometry.size.width * CGFloat(count) / CGFloat(total) : 0)
                }
            }
            .frame(height: 6)
            Text("\(count)")
                .font(.caption2)
                .foregroundStyle(AppTheme.textSecondary)
                .frame(width: 26, alignment: .trailing)
        }
    }

    private func reviewCard(_ review: ReviewDTO) -> some View {
        NeonCard(borderColor: Color.white.opacity(0.15)) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    StarRatingView(rating: Double(review.rating))
                    Spacer()
                    if let date = review.date {
                        Text(date, style: .date)
                            .font(.caption2)
                            .foregroundStyle(AppTheme.textTertiary)
                    }
                }
                if let comment = review.comment, !comment.isEmpty {
                    Text(comment).font(.footnote)
                }
                Text(byLine(review))
                    .font(.caption2)
                    .foregroundStyle(AppTheme.textTertiary)
                if let reply = review.sellerResponse, !reply.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Reply from \(review.sellerName)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(AppTheme.textSecondary)
                        Text(reply).font(.footnote)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(AppTheme.surfaceElevated.opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// "Alex · Booster Box · Boxes 4–5 of 12" — who, what, and which box (for case offers).
    private func byLine(_ review: ReviewDTO) -> String {
        var parts = [review.reviewer]
        switch subject {
        case .seller:
            parts.append(review.productName)
        case .product:
            parts.append(review.sellerName)
        }
        if let box = review.boxLabel, !box.isEmpty {
            parts.append(box)
        }
        return parts.joined(separator: " · ")
    }
}

// MARK: - A short "reviews" line for the product page

/// "★ 4.8 · 23 reviews  >" under the offers on a product page. Hidden until there is something to read.
struct ProductReviewsLink: View {
    let productID: UUID
    let productName: String

    @EnvironmentObject private var session: AppSession
    @State private var summary: ReviewSummaryDTO?

    var body: some View {
        Group {
            if session.isLive {
                NavigationLink(value: HomeRoute.productReviews(productID, productName)) {
                    NeonCard(borderColor: Color.white.opacity(0.15)) {
                        HStack(spacing: 10) {
                            Image(systemName: "star.bubble").foregroundStyle(AppTheme.accent)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Buyer reviews").font(.subheadline.weight(.bold))
                                if let summary, summary.count > 0 {
                                    HStack(spacing: 6) {
                                        StarRatingView(rating: summary.average)
                                        Text("\(summary.average.formatted(.number.precision(.fractionLength(1)))) · \(summary.count) review\(summary.count == 1 ? "" : "s")")
                                            .font(.caption)
                                            .foregroundStyle(AppTheme.textSecondary)
                                    }
                                } else {
                                    Text(summary == nil ? "See what buyers said" : "No reviews yet")
                                        .font(.caption)
                                        .foregroundStyle(AppTheme.textSecondary)
                                }
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                }
                .buttonStyle(.plain)
                .task(id: session.reloadKey) { await loadSummary() }
            }
        }
    }

    private func loadSummary() async {
        do {
            let page = try await session.fetchProductReviews(productID: productID)
            summary = page.summary
        } catch {
            // The link still works; it just has no numbers to show.
        }
    }
}
