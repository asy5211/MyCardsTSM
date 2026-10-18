//
//  APIClient.swift
//  TSM (The Sealed Market)
//
//  One small client for the whole TSM server API. Every request reads the
//  current server address and sign-in token at the moment it is sent, so
//  changing the address or signing in/out needs no extra wiring.
//

import Foundation

// MARK: - Errors

/// One problem the server pointed at a specific field, e.g. password too weak.
struct FieldIssue {
    let field: String
    let message: String
}

/// What can go wrong talking to the server, with messages fit to show a person.
enum APIError: LocalizedError {
    /// Couldn't connect at all (server not running, wrong address, no network).
    case unreachable(String)
    /// iOS refused a plain-http connection (App Transport Security).
    case blockedByATS
    /// The server answered with its standard error JSON.
    case server(status: Int, code: String, message: String, issues: [FieldIssue])
    /// The server answered with something the app couldn't read.
    case unexpected(String)

    var errorDescription: String? {
        switch self {
        case .unreachable(let address):
            return "Can't reach the TSM server at \(address). Is it running? (npm run dev in the backend folder)"
        case .server(_, _, let message, let issues):
            // Field-level messages are more useful than "Some fields are invalid".
            if issues.isEmpty { return message }
            var seen: [String] = []
            for issue in issues where !seen.contains(issue.message) {
                seen.append(issue.message)
            }
            return seen.joined(separator: "\n")
        case .blockedByATS:
            return "iOS blocked the connection because the server address starts with http://. In Xcode: click the project, pick the app target, open the Info tab, add \"App Transport Security Settings\" and inside it \"Allows Local Networking\" = YES."
        case .unexpected(let text):
            return text
        }
    }

    var statusCode: Int? {
        if case .server(let status, _, _, _) = self { return status }
        return nil
    }

    var serverCode: String? {
        if case .server(_, let code, _, _) = self { return code }
        return nil
    }

    /// True when the server says the sign-in token is missing, expired or revoked.
    var isUnauthorized: Bool { statusCode == 401 && serverCode != "invalid_credentials" }
}

// MARK: - Client

final class APIClient {
    private let urlSession: URLSession

    init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    // MARK: Convenience calls

    func get<T: Decodable>(_ path: String,
                           query: [String: String] = [:],
                           auth: Bool = true) async throws -> T {
        let data = try await perform("GET", path, query: query, body: nil, auth: auth)
        return try decode(T.self, from: data)
    }

    func post<T: Decodable>(_ path: String,
                            body: [String: Any],
                            auth: Bool = true) async throws -> T {
        let data = try await perform("POST", path, query: [:], body: body, auth: auth)
        return try decode(T.self, from: data)
    }

    func patch<T: Decodable>(_ path: String,
                             body: [String: Any],
                             auth: Bool = true) async throws -> T {
        let data = try await perform("PATCH", path, query: [:], body: body, auth: auth)
        return try decode(T.self, from: data)
    }

    /// For calls that answer with no body (e.g. DELETE /api/me → 204).
    func delete(_ path: String, body: [String: Any]? = nil, auth: Bool = true) async throws {
        _ = try await perform("DELETE", path, query: [:], body: body, auth: auth)
    }

    /// Raw bytes, for downloads such as the data export.
    func getData(_ path: String, auth: Bool = true) async throws -> Data {
        return try await perform("GET", path, query: [:], body: nil, auth: auth)
    }

    // MARK: Core

    private func perform(_ method: String,
                         _ path: String,
                         query: [String: String],
                         body: [String: Any]?,
                         auth: Bool) async throws -> Data {
        let base = AppConfig.currentBaseURL()

        guard var components = URLComponents(string: base.absoluteString + path) else {
            throw APIError.unexpected("The server address looks wrong: \(base.absoluteString)")
        }
        if !query.isEmpty {
            components.queryItems = query
                .sorted { $0.key < $1.key }
                .map { URLQueryItem(name: $0.key, value: $0.value) }
            // URLComponents leaves "+" alone, but servers read a "+" as a space.
            components.percentEncodedQuery = components.percentEncodedQuery?
                .replacingOccurrences(of: "+", with: "%2B")
        }
        guard let url = components.url else {
            throw APIError.unexpected("The server address looks wrong: \(base.absoluteString)")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        if auth, let token = TokenStore.load() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let result: (Data, URLResponse)
        do {
            result = try await urlSession.data(for: request)
        } catch let urlError as URLError {
            if urlError.code == .cancelled {
                // The screen went away or was reloaded; callers treat this quietly.
                throw CancellationError()
            }
            if urlError.code == .appTransportSecurityRequiresSecureConnection {
                throw APIError.blockedByATS
            }
            throw APIError.unreachable(base.absoluteString)
        }

        guard let http = result.1 as? HTTPURLResponse else {
            throw APIError.unexpected("The server sent a reply the app couldn't read.")
        }
        if (200..<300).contains(http.statusCode) {
            return result.0
        }

        if let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: result.0) {
            let issues = (envelope.error.details ?? []).map {
                FieldIssue(field: $0.field ?? "", message: $0.message)
            }
            throw APIError.server(status: http.statusCode,
                                  code: envelope.error.code,
                                  message: envelope.error.message,
                                  issues: issues)
        }
        // The server's rate limiter answers with plain text rather than the standard JSON.
        let fallback = http.statusCode == 429
            ? "Too many attempts. Please wait a few minutes and try again."
            : "The server returned an error (\(http.statusCode))."
        throw APIError.server(status: http.statusCode,
                              code: "http_\(http.statusCode)",
                              message: fallback,
                              issues: [])
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw APIError.unexpected("The server's reply wasn't in the format the app expected.")
        }
    }
}

// MARK: - The server's standard error JSON

private struct ErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String
        let message: String
        let details: [Detail]?
    }

    struct Detail: Decodable {
        let field: String?
        let message: String
    }

    let error: Body
}
