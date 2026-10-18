//
//  SellToUsItemFormView.swift
//  TSM (The Sealed Market)
//
//  Created by Dev twelve on 9/24/26.
//

import SwiftUI

struct SellToUsItemFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var items: [SellToUsLineItem] = [SellToUsLineItem()]
    @State private var showConfirmation = false
    @State private var didSubmit = false

    private let productOptions = SampleData.sampleProducts.map(\.name)
    private let sourceOptions = SampleData.sellerSourceOptions

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
        .sheet(isPresented: $showConfirmation) {
            ConfirmSubmissionView(itemCount: items.count) {
                // TODO: POST to the SellToUsSubmission API (Milestone 4 backend)
                // with `items`, then this is where the new submission would
                // show up in SellToUsTicketListView with status .inReview.
                showConfirmation = false
                didSubmit = true
            }
        }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                ForEach($items) { $item in
                    itemCard(item: $item)
                }
                addAnotherButton
                HStack(spacing: 10) {
                    SecondaryButton(title: "Cancel") { dismiss() }
                    PrimaryButton(title: "Next", systemImage: "arrow.right") { showConfirmation = true }
                        .disabled(!canProceed)
                        .opacity(canProceed ? 1 : 0.5)
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

                VStack(alignment: .leading, spacing: 6) {
                    Text("Product Name").font(.footnote.weight(.semibold))
                    Menu {
                        ForEach(productOptions, id: \.self) { name in
                            Button(name) { item.wrappedValue.productName = name }
                        }
                    } label: {
                        fieldRow(systemImage: "magnifyingglass",
                                 text: item.wrappedValue.productName.isEmpty ? "Enter product name..." : item.wrappedValue.productName)
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
            Text("Track its status anytime from your Sell to Us tickets.")
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
}
