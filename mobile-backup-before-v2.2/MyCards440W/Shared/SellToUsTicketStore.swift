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

    private let defaults: UserDefaults
    private var scope = "mock"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.created = load()
    }

    /// Everything to show in the list: new tickets first, then the samples.
    var tickets: [SellToUsSubmission] {
        return created + SampleData.sampleSubmissions
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
    }

    // MARK: Saving

    private var storageKey: String { "sellToUsTickets.\(scope)" }

    private func save() {
        if let data = try? JSONEncoder().encode(created) {
            defaults.set(data, forKey: storageKey)
        }
    }

    private func load() -> [SellToUsSubmission] {
        guard let data = defaults.data(forKey: storageKey),
              let saved = try? JSONDecoder().decode([SellToUsSubmission].self, from: data) else {
            return []
        }
        return saved
    }
}
