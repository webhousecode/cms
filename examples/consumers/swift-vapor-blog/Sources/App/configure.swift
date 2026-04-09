import Vapor
import Leaf

public func configure(_ app: Application) throws {
    // Serve uploaded media from Public/uploads
    app.middleware.use(FileMiddleware(publicDirectory: app.directory.publicDirectory))

    // Leaf templates
    app.views.use(.leaf)
    app.leaf.cache.isEnabled = false  // Dev mode — no template caching

    try routes(app)
}
