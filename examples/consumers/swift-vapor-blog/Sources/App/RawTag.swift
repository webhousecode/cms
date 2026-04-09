import Leaf

/// Custom Leaf tag that outputs HTML without escaping.
/// Usage in .leaf templates: #raw(contentHtml)
struct RawTag: UnsafeUnescapedLeafTag {
    func render(_ ctx: LeafContext) throws -> LeafData {
        guard let str = ctx.parameters.first?.string else {
            return .string("")
        }
        return .string(str)
    }
}
