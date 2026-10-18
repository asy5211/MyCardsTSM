//
//  SellToUsItemFormView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct SellToUsItemFormView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var ticketStore: SellToUsTicketStore

    @State private var items: [SellToUsLineItem] = [SellToUsLineItem()]
    @State private var showConfirmation = false
    @State private var didSubmit = false
    @State private var submittedNumber: String?
    @State private var isSubmitting = false
    @State private var submitError: String?

    // Every product on the shop (any brand, even sold-out ones), loaded once.
    @State private var catalog: [Product] = []
    @State private var catalogError: String?
    @State private var isLoadingCatalog = false
    /// The brand chosen in each product card's first dropdown (by card id). Missing = all brands.
    @State private var brandFilters: [UUID: String] = [:]

    private let sourceOptions = SampleData.sellerSourceOptions

    /// Brands that have products, A to Z.
    private var brandNames: [String] {
        let unique = Set(catalog.map(\.brand))
        return unique.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    /// The products to pick from for one card: its brand's products, or all of them.
    private func products(for item: SellToUsLineItem) -> [Product] {
        let chosen = brandFilters[item.id]
        let matching = catalog.filter { chosen == nil || $0.brand == chosen }
        return matching.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private var canProceed: Bool {
        !items.isEmpty && items.allSatisfy {
            !$0.productName.isEmpty && $0.quantity > 0 && !$0.source.isEmpty && $0.minimumPricePerItem > 0
        }
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
        .task(id: session.mode) { await loadCatalog() }
        .sheet(isPresented: $showConfirmation) {
            ConfirmSubmissionView(itemCount: items.count) {
                showConfirmation = false
                submitTicket()
            }
        }
    }

    /// Live server: sends the list to TSM, where staff review it and send a price.
    /// Demo data: saves the ticket on this phone. Either way it appears at the top of the Sell tab's list.
    private func submitTicket() {
        submitError = nil
        guard ticketStore.usesServer else {
            let ticket = ticketStore.submit(items: items)
            submittedNumber = ticket.submissionNumber
            didSubmit = true
            return
        }
        isSubmitting = true
        let lines = items
        Task {
            do {
                let ticket = try await ticketStore.submitToServer(items: lines, using: session)
                submittedNumber = ticket.submissionNumber
                didSubmit = true
            } catch is CancellationError {
                // Screen went away; nothing to show.
            } catch {
                submitError = error.localizedDescription
            }
            isSubmitting = false
        }
    }

    private func loadCatalog() async {
        isLoadingCatalog = true
        catalogError = nil
        do {
            catalog = try await session.fetchProducts(brand: nil, type: .all, sort: .priceLowToHigh, query: nil)
        } catch is CancellationError {
            // Left the screen or switched data source; nothing to show.
        } catch {
            catalogError = error.localizedDescription
        }
        isLoadingCatalog = false
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                ForEach($items) { $item in
                    itemCard(item: $item)
                }
                addAnotherButton
                if let submitError {
                    Text(submitError)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.accent)
                }
                HStack(spacing: 10) {
                    SecondaryButton(title: "Cancel") { dismiss() }
                    PrimaryButton(title: isSubmitting ? "Sending…" : "Next", systemImage: "arrow.right") { showConfirmation = true }
                        .disabled(!canProceed || isSubmitting)
                        .opacity(canProceed && !isSubmitting ? 1 : 0.5)
                }
            }
            .padding(20)
        }
    }

    private var header: some View {
        NeonCard {
            HStack(spacing: 14) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 32))

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 0) {
                        Text("SELL ")
                            .foregroundStyle(AppTheme.textPrimary)

                        Text("SEALED PRODUCTS")
                            .foregroundStyle(AppTheme.accent)
                    }
                    .font(.system(size: 18, weight: .heavy, design: .rounded))

                    Text("Submit the products you want to sell to us.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
    }


    private func itemCard(item: Binding<SellToUsLineItem>) -> some View {
        NeonCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    sectionTitle("Add Product", subtitle: "Enter the details for each product you want to sell.")
                    Spacer()
                    if items.count > 1 {
                        Button { remove(item.wrappedValue) } label: {
                            Image(systemName: "trash").foregroundStyle(AppTheme.accent)
                        }
                    }
                }

                // First dropdown narrows the list by brand; the second picks the product.
                VStack(alignment: .leading, spacing: 6) {
                    Text("Brand (filter)").font(.footnote.weight(.semibold))
                    Menu {
                        Button("All Brands") { setBrand(nil, for: item) }
                        ForEach(brandNames, id: \.self) { brand in
                            Button(brand) { setBrand(brand, for: item) }
                        }
                    } label: {
                        fieldRow(systemImage: "line.3.horizontal.decrease.circle",
                                 text: brandFilters[item.wrappedValue.id] ?? "All Brands")
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Product").font(.footnote.weight(.semibold))
                    Menu {
                        let choices = products(for: item.wrappedValue)
                        if choices.isEmpty {
                            Text(isLoadingCatalog ? "Loading products…" : "No products found")
                        }
                        ForEach(choices) { product in
                            Button(brandFilters[item.wrappedValue.id] == nil
                                   ? "\(product.brand) · \(product.name)"
                                   : product.name) {
                                item.wrappedValue.productName = product.name
                            }
                        }
                    } label: {
                        fieldRow(systemImage: "magnifyingglass",
                                 text: item.wrappedValue.productName.isEmpty ? "Select product..." : item.wrappedValue.productName)
                    }
                    if let catalogError {
                        HStack {
                            Text(catalogError)
                                .font(.caption)
                                .foregroundStyle(AppTheme.accent)
                            Spacer()
                            Button("Try Again") { Task { await loadCatalog() } }
                                .font(.caption.weight(.semibold))
                        }
                    } else if isLoadingCatalog && catalog.isEmpty {
                        Text("Loading the product list…")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textTertiary)
                    }
                }

                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Quantity").font(.footnote.weight(.semibold))
                        HStack(spacing: 12) {
                            stepperButton(systemImage: "minus.circle.fill") {
                                if item.wrappedValue.quantity > 1 { item.wrappedValue.quantity -= 1 }
                            }
                            Text("\(item.wrappedValue.quantity)")
                                .font(.headline)
                                .frame(minWidth: 24)
                            stepperButton(systemImage: "plus.circle.fill") {
                                item.wrappedValue.quantity += 1
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Source").font(.footnote.weight(.semibold))
                        Menu {
                            ForEach(sourceOptions, id: \.self) { source in
                                Button(source) { item.wrappedValue.source = source }
                            }
                        } label: {
                            fieldRow(systemImage: "shippingbox",
                                     text: item.wrappedValue.source.isEmpty ? "Select source..." : item.wrappedValue.source)
                        }
                    }
                }

                // Required by the written spec (3.5b) even though the
                // wireframe's visible crop doesn't show it: the minimum
                // price the seller will accept, per item.
                VStack(alignment: .leading, spacing: 6) {
                    Text("Minimum Accepted Price (per item)").font(.footnote.weight(.semibold))
                    HStack {
                        Image(systemName: "dollarsign.circle").foregroundStyle(AppTheme.textSecondary)
                        TextField("0.00", value: item.minimumPricePerItem, format: .number)
                            .keyboardType(.decimalPad)
                    }
                    .padding(12)
                    .background(AppTheme.background)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
                }
            }
        }
    }

    /// Picks a brand for one card. If the product chosen earlier is from another brand, clear it.
    private func setBrand(_ brand: String?, for item: Binding<SellToUsLineItem>) {
        brandFilters[item.wrappedValue.id] = brand
        if let brand {
            let stillValid = catalog.contains { $0.brand == brand && $0.name == item.wrappedValue.productName }
            if !stillValid {
                item.wrappedValue.productName = ""
            }
        }
    }

    private var addAnotherButton: some View {
        Button {
            items.append(SellToUsLineItem())
        } label: {
            Label("ADD ANOTHER PRODUCT", systemImage: "plus.circle.fill")
                .font(.footnote.weight(.heavy))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
        }
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.cornerRadius)
                .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                .foregroundStyle(AppTheme.accent.opacity(0.6))
        )
        .foregroundStyle(AppTheme.accent)
    }

    private var confirmationState: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(AppTheme.verifiedGreen)
            Text("Submission Sent").font(.title3.weight(.bold))
            if let submittedNumber {
                Text(submittedNumber)
                    .font(.headline)
                    .foregroundStyle(AppTheme.accent)
            }
            Text("It's now at the top of your Sell to Us tickets, where you can track its status.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            PrimaryButton(title: "Done") { dismiss() }
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func remove(_ item: SellToUsLineItem) {
        items.removeAll { $0.id == item.id }
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

    private func fieldRow(systemImage: String, text: String) -> some View {
        HStack {
            Image(systemName: systemImage).foregroundStyle(AppTheme.textSecondary)
            Text(text).foregroundStyle(AppTheme.textPrimary)
            Spacer()
            Image(systemName: "chevron.down").font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
        .padding(12)
        .background(AppTheme.background)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15)))
    }

    private func stepperButton(systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage).font(.title3).foregroundStyle(AppTheme.accent)
        }
    }
}

#Preview {
    NavigationStack {
        SellToUsItemFormView()
    }
    .environmentObject(SellToUsTicketStore())
    .environmentObject(AppSession(profile: ProfileStore()))
}
