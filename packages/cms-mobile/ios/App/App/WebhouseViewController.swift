import UIKit
import Capacitor

/// Custom CAPBridgeViewController that adds native iOS pull-to-refresh.
///
/// Uses UIRefreshControl on the WKWebView's scrollView — the exact same
/// rubber-band physics, overscroll elasticity, and system spinner that
/// every native iOS app uses. Fires a CustomEvent to JS so React/TanStack
/// Query can invalidate and refetch.
class WebhouseViewController: CAPBridgeViewController {

    private let refreshControl = UIRefreshControl()
    private var refreshControlAttached = false

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        attachRefreshControl()
    }

    private func attachRefreshControl() {
        guard !refreshControlAttached, let wv = webView else { return }
        refreshControlAttached = true

        // Brand gold spinner (#F7BB2E)
        refreshControl.tintColor = UIColor(red: 0.969, green: 0.733, blue: 0.180, alpha: 1.0)
        refreshControl.addTarget(self, action: #selector(handlePullToRefresh), for: .valueChanged)

        // Make the area above the content transparent so the spinner is visible
        // against the dark background when pulling down.
        let brandDark = UIColor(red: 0.051, green: 0.051, blue: 0.051, alpha: 1.0) // #0D0D0D
        wv.isOpaque = false
        wv.backgroundColor = .clear
        wv.scrollView.backgroundColor = brandDark
        wv.scrollView.refreshControl = refreshControl
        wv.scrollView.bounces = true
        wv.scrollView.alwaysBounceVertical = true
    }

    @objc private func handlePullToRefresh() {
        // Dispatch event to JS — React hook picks this up and invalidates queries
        bridge?.webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('native-pull-refresh'))"
        )

        // Safety timeout: end refreshing after 3s even if JS doesn't call back.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            self?.refreshControl.endRefreshing()
        }
    }
}
