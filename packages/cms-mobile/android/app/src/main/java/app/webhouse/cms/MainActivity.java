package app.webhouse.cms;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Find the WebView that Capacitor created
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        // Wrap in SwipeRefreshLayout for native Android pull-to-refresh
        android.view.ViewGroup parent = (android.view.ViewGroup) webView.getParent();
        if (parent == null) return;

        int index = parent.indexOfChild(webView);
        parent.removeView(webView);

        SwipeRefreshLayout swipeRefresh = new SwipeRefreshLayout(this);
        // Brand gold (#F7BB2E)
        swipeRefresh.setColorSchemeColors(0xFFF7BB2E);
        swipeRefresh.addView(webView,
                new android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT));

        parent.addView(swipeRefresh, index,
                new android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT));

        swipeRefresh.setOnRefreshListener(() -> {
            // Dispatch same event as iOS — React hook handles the rest
            getBridge().eval("window.dispatchEvent(new CustomEvent('native-pull-refresh'))", (value) -> {});

            // Safety timeout: end after 3s
            webView.postDelayed(() -> swipeRefresh.setRefreshing(false), 3000);
        });
    }
}
