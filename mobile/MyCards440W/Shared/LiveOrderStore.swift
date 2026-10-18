//
//  LiveOrderStore.swift
//  TSM (The Sealed Market)
//
//  The person's real orders, kept on the TSM server. Checkout in Live mode
//  places them here; the Orders tab lists them with tracking, the chat with
//  the seller, "I received it" and the star review for each item.
//  (Demo mode keeps using OrderStore, which only lives in memory.)
//
//  Payment is not collected yet: an order is recorded as placed, and the
//  seller ships it from the seller dashboard.
//

import Foundation
import Combine

final class LiveOrderStore: ObservableObject {
    @Published private(set) var orders: [OrderDTO] = []
    @Published private(set) var isLoading = false
    @Published private(set) var loadError: String?
    /// False until the first load finished, so the screen can say "Loading…" instead of "No orders".
    @Published private(set) var hasLoaded = false

    func order(withID id: String) -> OrderDTO? {
        return orders.first { $0.id == id }
    }

    /// Forget everything (a different person signed in).
    func clear() {
        orders = []
        loadError = nil
        hasLoaded = false
    }

    // MARK: Loading

    /// Re-reads the person's orders, newest first.
    func refresh(using session: AppSession) async {
        guard session.isLive, TokenStore.load() != nil else {
            clear()
            return
        }
        isLoading = true
        loadError = nil
        do {
            let page: OrdersPageDTO = try await session.api.get("/api/orders", query: ["limit": "100"])
            orders = page.items
            hasLoaded = true
        } catch is CancellationError {
            // Left the screen; the next refresh will do it.
        } catch {
            session.noteSessionProblem(error)
            loadError = error.localizedDescription
        }
        isLoading = false
    }

    /// Re-reads one order (tracking, status, reviews).
    func reload(_ id: String, using session: AppSession) async {
        do {
            let fresh: OrderDTO = try await session.api.get("/api/orders/\(id)")
            put(fresh)
        } catch is CancellationError {
            // Left the screen.
        } catch {
            session.noteSessionProblem(error)
        }
    }

    // MARK: Buying

    /// Buys what is in the cart, with the saved shipping address. The server makes one order per
    /// seller and hands out the next box numbers of any case offer.
    func place(lines: [CartLine], using session: AppSession) async throws -> [OrderDTO] {
        let items: [[String: Any]] = lines.map { line in
            ["listingId": line.listing.id.uuidString.lowercased(), "quantity": line.quantity]
        }
        do {
            let placed: PlacedOrdersDTO = try await session.api.post("/api/orders", body: ["items": items])
            for order in placed.orders.reversed() {
                put(order)
            }
            hasLoaded = true
            return placed.orders
        } catch {
            session.noteSessionProblem(error)
            throw error
        }
    }

    /// "I received it" (only possible once the seller has shipped).
    func markReceived(_ id: String, using session: AppSession) async throws {
        do {
            let fresh: OrderDTO = try await session.api.post("/api/orders/\(id)/delivered", body: [:])
            put(fresh)
        } catch {
            session.noteSessionProblem(error)
            throw error
        }
    }

    /// Stars (and an optional comment) for one item of an order.
    func review(orderID: String, itemID: String, rating: Int, comment: String,
                using session: AppSession) async throws {
        var body: [String: Any] = ["rating": rating]
        let clean = comment.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty { body["comment"] = clean }
        do {
            let _: ReviewDTO = try await session.api.post("/api/orders/\(orderID)/items/\(itemID)/review", body: body)
        } catch {
            session.noteSessionProblem(error)
            throw error
        }
        await reload(orderID, using: session)
    }

    // MARK: Chat with the seller

    func messages(for orderID: String, using session: AppSession) async throws -> [ChatMessageDTO] {
        do {
            let result: ChatMessagesDTO = try await session.api.get("/api/orders/\(orderID)/messages")
            return result.items
        } catch {
            if !(error is CancellationError) { session.noteSessionProblem(error) }
            throw error
        }
    }

    func sendMessage(_ text: String, orderID: String, using session: AppSession) async throws {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        do {
            let _: ChatMessageDTO = try await session.api.post("/api/orders/\(orderID)/messages", body: ["body": clean])
        } catch {
            session.noteSessionProblem(error)
            throw error
        }
    }

    // MARK: Private

    /// Puts an order the server just sent into the list (replacing the older copy, otherwise at the top).
    private func put(_ order: OrderDTO) {
        if let index = orders.firstIndex(where: { $0.id == order.id }) {
            orders[index] = order
        } else {
            orders.insert(order, at: 0)
        }
    }
}
