//
//  SellToUsTicketStore.swift
//  TSM (The Sealed Market)
//
//  The person's Sell to Us tickets. A new submission is added here, so it
//  shows up in the Sell tab's list right away. The tickets a person creates
//  are remembered on this device (separately for each account). The
//  built-in sample tickets are still shown below them until the tickets
//  server API exists.
//

import Foundation
import Combine

final class SellToUsTicketStore: ObservableObject {

    /// Tickets created in this app, newest first.
    @Published private(set) var created: [SellToUsSubmission] = []

    /// Messages the person wrote in a ticket's Negotiation screen, oldest
    /// first, kept by ticket number (so they also work on the sample tickets).
    @Published private(set) var addedMessages: [String: [NegotiationMessage]] = [:]

    private let defaults: UserDefaults
    private var scope = "mock"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.created = load()
        self.addedMessages = loadMessages()
    }

    /// Everything to show in the list: new tickets first, then the samples.
    /// Each ticket includes the messages added from the Negotiation screen.
    var tickets: [SellToUsSubmission] {
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
        created = load()
        addedMessages = loadMessages()
    }

    // MARK: Saving

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
