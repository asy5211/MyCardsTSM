//
//  SellToUsTicketStore.swift
//  TSM (The Sealed Market)
//
//  The person's Sell to Us tickets.
//
//  Live server: the tickets live on the TSM server. Staff review them in the
//  admin site, send a price, and the seller accepts, declines or counters it
//  here. Payment for an accepted offer happens outside the app.
//
//  Demo data: a new submission is added here and remembered on this device
//  (separately for each account), below the built-in sample tickets.
//

import Foundation
import Combine

final class SellToUsTicketStore: ObservableObject {

    /// Tickets created in Demo mode, newest first.
    @Published private(set) var created: [SellToUsSubmission] = []

    /// Messages the person wrote in a ticket's Negotiation screen in Demo mode, oldest
    /// first, kept by ticket number (so they also work on the sample tickets).
    @Published private(set) var addedMessages: [String: [NegotiationMessage]] = [:]

    // Live server
    @Published private(set) var serverTickets: [SellToUsSubmission] = []
    @Published private(set) var isLoading = false
    @Published private(set) var loadError: String?
    /// True when the tickets come from the server instead of this phone.
    @Published private(set) var usesServer = false

    private let defaults: UserDefaults
    private var scope = "mock"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.created = load()
        self.addedMessages = loadMessages()
    }

    /// Everything to show in the list. Live: the server's tickets, most recently changed first.
    /// Demo: new tickets first, then the samples, each with the messages added from the Negotiation screen.
    var tickets: [SellToUsSubmission] {
        if usesServer { return serverTickets }
        return (created + SampleData.sampleSubmissions).map { (ticket: SellToUsSubmission) -> SellToUsSubmission in
            guard let extra = addedMessages[ticket.submissionNumber], !extra.isEmpty else { return ticket }
            var copy = ticket
            copy.negotiationMessages += extra
            return copy
        }
    }

    /// The up-to-date version of one ticket, or nil if it isn't there any more.
    func ticket(numbered number: String) -> SellToUsSubmission? {
        return tickets.first { $0.submissionNumber == number }
    }

    // MARK: Demo mode

    /// Adds the person's message to a ticket's negotiation. Blank messages are ignored.
    @discardableResult
    func addMessage(_ text: String, to ticketNumber: String) -> NegotiationMessage? {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        let message = NegotiationMessage(author: "You", text: clean)
        addedMessages[ticketNumber, default: []].append(message)
        saveMessages()
        return message
    }

    /// Records a new submission and returns it (status: In Review).
    @discardableResult
    func submit(items: [SellToUsLineItem]) -> SellToUsSubmission {
        var number = "SUB-\(Int.random(in: 20000...99999))"
        let taken = Set(tickets.map(\.submissionNumber))
        while taken.contains(number) {
            number = "SUB-\(Int.random(in: 20000...99999))"
        }
        let submission = SellToUsSubmission(id: UUID(),
                                            submissionNumber: number,
                                            items: items,
                                            status: .inReview,
                                            submittedDate: Date(),
                                            totalOffered: nil,
                                            negotiationMessages: [])
        created.insert(submission, at: 0)
        save()
        return submission
    }

    /// Switches to another person's tickets. Called when the signed-in person
    /// or the data source changes.
    func useScope(_ newScope: String) {
        guard newScope != scope else { return }
        scope = newScope
        usesServer = newScope.hasPrefix("live-")
        serverTickets = []
        loadError = nil
        created = load()
        addedMessages = loadMessages()
    }

    // MARK: Live server

    /// Re-reads the person's tickets from the server. Keeps the conversations already loaded.
    func refresh(using session: AppSession) async {
        guard usesServer, TokenStore.load() != nil else { return }
        isLoading = true
        loadError = nil
        do {
            let page: TicketsPageDTO = try await session.api.get("/api/sell-tickets")
            var loadedBefore: [UUID: SellToUsSubmission] = [:]
            for ticket in serverTickets where ticket.hasLoadedMessages == true {
                loadedBefore[ticket.id] = ticket
            }
            var fresh: [SellToUsSubmission] = []
            for dto in page.items {
                guard var ticket = dto.toSubmission() else { continue }
                if ticket.hasLoadedMessages != true, let old = loadedBefore[ticket.id] {
                    ticket.negotiationMessages = old.negotiationMessages
                    ticket.hasLoadedMessages = true
                }
                fresh.append(ticket)
            }
            serverTickets = fresh
        } catch is CancellationError {
            // Left the screen; the next refresh will do it.
        } catch {
            session.noteSessionProblem(error)
            if let apiError = error as? APIError, apiError.statusCode == 403 {
                // Not an approved seller (yet, or any more): there are simply no tickets to show.
                serverTickets = []
            } else {
                loadError = error.localizedDescription
            }
        }
        isLoading = false
    }

    /// Loads one ticket with its whole conversation.
    func loadDetail(numbered number: String, using session: AppSession) async {
        guard usesServer, let ticket = ticket(numbered: number) else { return }
        do {
            let dto: TicketDTO = try await session.api.get("/api/sell-tickets/\(serverID(ticket))")
            store(dto)
        } catch is CancellationError {
            // Left the screen.
        } catch {
            session.noteSessionProblem(error)
        }
    }

    /// Sends a new submission to the server for staff to review.
    @discardableResult
    func submitToServer(items: [SellToUsLineItem], using session: AppSession) async throws -> SellToUsSubmission {
        let lines: [[String: Any]] = items.map { item in
            [
                "productName": item.productName,
                "quantity": item.quantity,
                "source": item.source,
                "minPricePerItemCents": Int((item.minimumPricePerItem * 100).rounded())
            ]
        }
        let dto: TicketDTO = try await call(session) {
            try await session.api.post("/api/sell-tickets", body: ["items": lines])
        }
        guard let ticket = store(dto) else {
            throw APIError.unexpected("The server's reply wasn't in the format the app expected.")
        }
        return ticket
    }

    /// Writes to the other side of the negotiation.
    func send(_ text: String, to number: String, using session: AppSession) async throws {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, let ticket = ticket(numbered: number) else { return }
        let _: ChatMessageDTO = try await call(session) {
            try await session.api.post("/api/sell-tickets/\(serverID(ticket))/messages", body: ["body": clean])
        }
        await loadDetail(numbered: number, using: session)
    }

    /// Takes TSM's price.
    func accept(_ number: String, using session: AppSession) async throws {
        guard let ticket = ticket(numbered: number) else { return }
        let dto: TicketDTO = try await call(session) {
            try await session.api.post("/api/sell-tickets/\(serverID(ticket))/accept", body: [:])
        }
        store(dto)
    }

    /// Answers TSM's price with the seller's own number (cents).
    func counter(_ number: String, amountCents: Int, message: String?, using session: AppSession) async throws {
        guard let ticket = ticket(numbered: number) else { return }
        var body: [String: Any] = ["amountCents": amountCents]
        let note = message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !note.isEmpty { body["message"] = note }
        let dto: TicketDTO = try await call(session) {
            try await session.api.post("/api/sell-tickets/\(serverID(ticket))/counter", body: body)
        }
        store(dto)
    }

    /// Walks away from the deal (also withdraws a ticket that is still being reviewed).
    func decline(_ number: String, note: String?, using session: AppSession) async throws {
        guard let ticket = ticket(numbered: number) else { return }
        var body: [String: Any] = [:]
        let clean = note?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !clean.isEmpty { body["note"] = clean }
        let dto: TicketDTO = try await call(session) {
            try await session.api.post("/api/sell-tickets/\(serverID(ticket))/decline", body: body)
        }
        store(dto)
    }

    // MARK: Live helpers

    /// The server writes ids in lower case.
    private func serverID(_ ticket: SellToUsSubmission) -> String {
        return ticket.id.uuidString.lowercased()
    }

    /// Runs one server call; signs out if the sign-in has expired.
    private func call<T>(_ session: AppSession, _ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch {
            session.noteSessionProblem(error)
            throw error
        }
    }

    /// Puts a ticket the server just sent into the list (replacing the older copy).
    @discardableResult
    private func store(_ dto: TicketDTO) -> SellToUsSubmission? {
        guard let ticket = dto.toSubmission() else { return nil }
        if let index = serverTickets.firstIndex(where: { $0.id == ticket.id }) {
            serverTickets[index] = ticket
        } else {
            serverTickets.insert(ticket, at: 0)
        }
        return ticket
    }

    // MARK: Saving (Demo mode)

    private var storageKey: String { "sellToUsTickets.\(scope)" }
    private var messagesKey: String { "sellToUsMessages.\(scope)" }

    private func save() {
        if let data = try? JSONEncoder().encode(created) {
            defaults.set(data, forKey: storageKey)
        }
    }

    private func saveMessages() {
        if let data = try? JSONEncoder().encode(addedMessages) {
            defaults.set(data, forKey: messagesKey)
        }
    }

    private func loadMessages() -> [String: [NegotiationMessage]] {
        guard let data = defaults.data(forKey: messagesKey),
              let saved = try? JSONDecoder().decode([String: [NegotiationMessage]].self, from: data) else {
            return [:]
        }
        return saved
    }

    private func load() -> [SellToUsSubmission] {
        guard let data = defaults.data(forKey: storageKey),
              let saved = try? JSONDecoder().decode([SellToUsSubmission].self, from: data) else {
            return []
        }
        return saved
    }
}
