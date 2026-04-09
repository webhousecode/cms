import UIKit
import Capacitor

/// Minimal custom ViewController.
/// Only does two things:
///   1. Enables scrollView bounce for native PTR feel
///   2. Shows a native reload indicator via KVO on contentOffset
class WebhouseViewController: CAPBridgeViewController {

    private var setupDone = false
    private var scrollObservation: NSKeyValueObservation?
    private var indicator: UIView?
    private var isRefreshing = false

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !setupDone else { return }
        setupDone = true

        guard let wv = webView else { return }
        let sv = wv.scrollView

        // Enable bounce — this is what gives the native PTR feel
        sv.bounces = true
        sv.alwaysBounceVertical = true

        // Dark background in the bounce area
        let dark = UIColor(red: 0.051, green: 0.051, blue: 0.051, alpha: 1)
        wv.isOpaque = false
        wv.backgroundColor = .clear
        sv.backgroundColor = dark

        // Build indicator and add to window
        let ind = makeIndicator()
        self.indicator = ind

        // Observe scroll — show indicator on negative offset (pull down)
        scrollObservation = sv.observe(\.contentOffset, options: [.new]) { [weak self] _, change in
            guard let self = self, let ind = self.indicator, !self.isRefreshing else { return }
            guard let offset = change.newValue else { return }

            if offset.y < -15 {
                let progress = min(abs(offset.y + 15) / 100.0, 1.0)
                ind.alpha = progress
                ind.transform = CGAffineTransform(rotationAngle: progress * .pi * 2)
            } else {
                if ind.alpha > 0 {
                    ind.alpha = 0
                    ind.transform = .identity
                }
            }

            // Trigger refresh when pulled far enough and released
            if offset.y < -120 && !self.isRefreshing {
                self.triggerRefresh()
            }
        }
    }

    private func makeIndicator() -> UIView {
        let size: CGFloat = 44
        let container = UIView(frame: CGRect(
            x: (view.bounds.width - size) / 2,
            y: view.safeAreaInsets.top + 12,
            width: size, height: size
        ))
        container.backgroundColor = UIColor(red: 0.13, green: 0.13, blue: 0.21, alpha: 1)
        container.layer.cornerRadius = size / 2
        container.layer.borderWidth = 1
        container.layer.borderColor = UIColor.white.withAlphaComponent(0.15).cgColor
        container.layer.shadowColor = UIColor.black.cgColor
        container.layer.shadowOpacity = 0.4
        container.layer.shadowRadius = 8
        container.layer.shadowOffset = .zero
        container.alpha = 0
        container.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin]

        // Gold reload arrow (SF Symbol)
        let cfg = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
        if let img = UIImage(systemName: "arrow.clockwise", withConfiguration: cfg) {
            let iv = UIImageView(image: img)
            iv.tintColor = UIColor(red: 0.969, green: 0.733, blue: 0.180, alpha: 1)
            iv.frame = CGRect(x: (size - 22) / 2, y: (size - 22) / 2, width: 22, height: 22)
            iv.contentMode = .scaleAspectFit
            container.addSubview(iv)
        }

        // Add to window (above everything)
        DispatchQueue.main.async {
            if let w = self.view.window {
                w.addSubview(container)
            }
        }

        return container
    }

    private func triggerRefresh() {
        isRefreshing = true
        guard let ind = indicator else { return }

        // Haptic
        // Double haptic tap for a more satisfying feel
        let haptic = UIImpactFeedbackGenerator(style: .heavy)
        haptic.impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            haptic.impactOccurred(intensity: 0.6)
        }

        // Spin
        ind.alpha = 1
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = CGFloat.pi * 2
        spin.duration = 0.7
        spin.repeatCount = .infinity
        ind.layer.add(spin, forKey: "spin")

        // Tell JS
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('native-pull-refresh'))")

        // Done after 1s
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self = self, let ind = self.indicator else { return }
            self.isRefreshing = false
            ind.layer.removeAnimation(forKey: "spin")
            UIView.animate(withDuration: 0.25) {
                ind.alpha = 0
                ind.transform = .identity
            }
        }
    }

    deinit {
        scrollObservation?.invalidate()
        indicator?.removeFromSuperview()
    }
}
