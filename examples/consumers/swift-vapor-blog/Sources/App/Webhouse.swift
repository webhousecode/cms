// F125 reference reader for @webhouse/cms file-based content (Swift).
//
// Reads JSON documents from content/{collection}/ via Foundation FileManager.
// Designed to be thin (Foundation only) and safe — slugs and collection names
// are validated to prevent path traversal.

import Foundation

public enum WebhouseError: Error {
    case invalidName(String)
}

public struct WebhouseDocument: Decodable, Sendable {
    public let id: String?
    public let slug: String
    public let status: String
    public let locale: String?
    public let translationGroup: String?
    public let data: [String: AnyCodable]
    public let createdAt: String?
    public let updatedAt: String?

    public var isPublished: Bool { status == "published" }

    public func string(_ key: String, default defaultValue: String = "") -> String {
        guard let value = data[key]?.value as? String else { return defaultValue }
        return value
    }

    public func stringArray(_ key: String) -> [String] {
        guard let value = data[key]?.value as? [Any] else { return [] }
        return value.compactMap { $0 as? String }
    }
}

/// Type-erased Codable helper for the dynamic data field.
public struct AnyCodable: Decodable, Sendable {
    public let value: Sendable

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self.value = NSNull()
        } else if let s = try? container.decode(String.self) {
            self.value = s
        } else if let i = try? container.decode(Int.self) {
            self.value = i
        } else if let d = try? container.decode(Double.self) {
            self.value = d
        } else if let b = try? container.decode(Bool.self) {
            self.value = b
        } else if let arr = try? container.decode([AnyCodable].self) {
            self.value = arr.map { $0.value } as [Sendable]
        } else if let obj = try? container.decode([String: AnyCodable].self) {
            self.value = obj.mapValues { $0.value } as [String: Sendable]
        } else {
            self.value = NSNull()
        }
    }
}

public final class WebhouseReader: @unchecked Sendable {
    private static let safeName = try! NSRegularExpression(pattern: "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
    private let contentDir: URL
    private var globalsCache: WebhouseDocument?
    private let cacheLock = NSLock()

    public init(contentDir: String) {
        self.contentDir = URL(fileURLWithPath: contentDir).standardizedFileURL
    }

    private func validate(_ name: String) throws {
        let range = NSRange(location: 0, length: name.utf16.count)
        if Self.safeName.firstMatch(in: name, options: [], range: range) == nil {
            throw WebhouseError.invalidName(name)
        }
    }

    public func collection(_ name: String, locale: String? = nil) throws -> [WebhouseDocument] {
        try validate(name)
        let dir = contentDir.appendingPathComponent(name)
        guard let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return []
        }

        var docs: [WebhouseDocument] = []
        let decoder = JSONDecoder()
        for file in files where file.pathExtension == "json" {
            guard let data = try? Data(contentsOf: file),
                  let doc = try? decoder.decode(WebhouseDocument.self, from: data) else {
                continue
            }
            guard doc.isPublished else { continue }
            if let l = locale, doc.locale != l { continue }
            docs.append(doc)
        }

        return docs.sorted { (a, b) -> Bool in
            a.string("date") > b.string("date")
        }
    }

    public func document(_ collectionName: String, _ slug: String) throws -> WebhouseDocument? {
        try validate(collectionName)
        try validate(slug)

        let path = contentDir.appendingPathComponent(collectionName).appendingPathComponent("\(slug).json")
        let standardized = path.standardizedFileURL

        guard standardized.path.hasPrefix(contentDir.path) else {
            throw WebhouseError.invalidName(slug)
        }
        guard let data = try? Data(contentsOf: standardized) else { return nil }
        let decoder = JSONDecoder()
        guard let doc = try? decoder.decode(WebhouseDocument.self, from: data) else { return nil }
        return doc.isPublished ? doc : nil
    }

    public func findTranslation(_ doc: WebhouseDocument, in collectionName: String) throws -> WebhouseDocument? {
        guard let tg = doc.translationGroup else { return nil }
        let all = try collection(collectionName)
        return all.first { $0.translationGroup == tg && $0.locale != doc.locale }
    }

    public func globals() -> WebhouseDocument? {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        if let cached = globalsCache { return cached }
        let g = (try? document("globals", "site")) ?? nil
        globalsCache = g
        return g
    }
}
