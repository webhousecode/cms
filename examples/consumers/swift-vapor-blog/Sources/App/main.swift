import Vapor

let env = try Environment.detect()
let app = try await Application.make(env)

// Bind to PORT env var if set
if let portStr = Environment.get("PORT"), let port = Int(portStr) {
    app.http.server.configuration.port = port
}
app.http.server.configuration.hostname = "0.0.0.0"

defer { Task { try? await app.asyncShutdown() } }

try configure(app)
print("swift-vapor-blog listening on :\(app.http.server.configuration.port)")
try await app.execute()
