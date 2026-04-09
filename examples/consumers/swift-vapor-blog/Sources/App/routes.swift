import Vapor
import Markdown

let cms = WebhouseReader(contentDir: FileManager.default.currentDirectoryPath + "/content")

func routes(_ app: Application) throws {
    app.get { req async throws -> View in
        let posts = (try? cms.collection("posts", locale: "en")) ?? []
        return try await req.view.render("home", makeContext(req, locale: "en", posts: posts))
    }

    app.get("da") { req async throws -> View in
        let posts = (try? cms.collection("posts", locale: "da")) ?? []
        return try await req.view.render("home", makeContext(req, locale: "da", posts: posts))
    }

    app.get("blog", ":slug") { req async throws -> View in
        guard let slug = req.parameters.get("slug") else {
            throw Abort(.badRequest)
        }

        let post: WebhouseDocument?
        do {
            post = try cms.document("posts", slug)
        } catch WebhouseError.invalidName {
            throw Abort(.badRequest, reason: "Invalid slug")
        }

        guard let post = post else {
            throw Abort(.notFound, reason: "Post not found")
        }

        let translation = try? cms.findTranslation(post, in: "posts")
        let contentMd = post.string("content")
        let document = Document(parsing: contentMd)
        let contentHtml = HTMLFormatter.format(document)

        return try await req.view.render("post", makePostContext(req, post: post, translation: translation, contentHtml: contentHtml))
    }
}

// MARK: - Context helpers

private func makeContext(_ req: Request, locale: String, posts: [WebhouseDocument]) -> [String: Any] {
    let g = cms.globals()
    return [
        "brandPrefix": g?.string("brandPrefix", default: "@webhouse/cms") ?? "@webhouse/cms",
        "brandSuffix": g?.string("brandSuffix", default: "Swift · Vapor") ?? "Swift · Vapor",
        "footerText": g?.string("footerText", default: "Powered by @webhouse/cms") ?? "Powered by @webhouse/cms",
        "locale": locale,
        "posts": posts.map { post in
            [
                "slug": post.slug,
                "title": post.string("title"),
                "excerpt": post.string("excerpt"),
                "date": post.string("date"),
                "locale": post.locale ?? "",
            ]
        },
    ]
}

private func makePostContext(_ req: Request, post: WebhouseDocument, translation: WebhouseDocument?, contentHtml: String) -> [String: Any] {
    let g = cms.globals()
    var ctx: [String: Any] = [
        "brandPrefix": g?.string("brandPrefix", default: "@webhouse/cms") ?? "@webhouse/cms",
        "brandSuffix": g?.string("brandSuffix", default: "Swift · Vapor") ?? "Swift · Vapor",
        "footerText": g?.string("footerText", default: "Powered by @webhouse/cms") ?? "Powered by @webhouse/cms",
        "post": [
            "slug": post.slug,
            "title": post.string("title"),
            "author": post.string("author", default: "Unknown"),
            "date": post.string("date"),
            "locale": post.locale ?? "",
        ],
        "contentHtml": contentHtml,
    ]
    if let t = translation {
        ctx["translation"] = [
            "slug": t.slug,
            "title": t.string("title"),
            "locale": t.locale ?? "",
        ]
    }
    return ctx
}

// Re-encode helper to convert [String: Any] to ViewContext via Encodable wrapper
// Removed the `view` extension — Request already has `req.view` via Vapor.

private struct DictContext: Encodable {
    let dict: [String: Any]

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DynamicCodingKey.self)
        try encodeAny(dict, into: &container)
    }

    private func encodeAny(_ value: [String: Any], into container: inout KeyedEncodingContainer<DynamicCodingKey>) throws {
        for (k, v) in value {
            let key = DynamicCodingKey(stringValue: k)!
            try encodeValue(v, key: key, into: &container)
        }
    }

    private func encodeValue(_ v: Any, key: DynamicCodingKey, into container: inout KeyedEncodingContainer<DynamicCodingKey>) throws {
        if let s = v as? String {
            try container.encode(s, forKey: key)
        } else if let i = v as? Int {
            try container.encode(i, forKey: key)
        } else if let d = v as? Double {
            try container.encode(d, forKey: key)
        } else if let b = v as? Bool {
            try container.encode(b, forKey: key)
        } else if let arr = v as? [[String: Any]] {
            var nested = container.nestedUnkeyedContainer(forKey: key)
            for item in arr {
                try nested.encode(DictContext(dict: item))
            }
        } else if let obj = v as? [String: Any] {
            try container.encode(DictContext(dict: obj), forKey: key)
        }
    }
}

private struct DynamicCodingKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

extension ViewRenderer {
    func render(_ name: String, _ dict: [String: Any]) async throws -> View {
        try await render(name, DictContext(dict: dict))
    }
}
