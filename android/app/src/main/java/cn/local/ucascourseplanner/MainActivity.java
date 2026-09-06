package cn.local.ucascourseplanner;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private Insets safeArea = Insets.NONE;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlannerDocumentsPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() == null) return;
        configureEdgeToEdge();
    }

    @SuppressWarnings("deprecation")
    private void configureEdgeToEdge() {
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? Color.TRANSPARENT : Color.BLACK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attributes);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);

        WebView webView = getBridge().getWebView();
        View container = (View) webView.getParent();
        container.setBackgroundColor(Color.WHITE);
        // Supply CSS insets consistently, including WebViews older than version 140.
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            view.setPadding(0, 0, 0, keyboardVisible ? keyboard : 0);
            safeArea = Insets.of(bars.left, bars.top, bars.right, keyboardVisible ? 0 : bars.bottom);
            updateSafeArea(webView);
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                updateSafeArea(view);
                ViewCompat.requestApplyInsets(container);
            }
        });
        ViewCompat.requestApplyInsets(container);
    }

    private void updateSafeArea(WebView webView) {
        float density = getResources().getDisplayMetrics().density;
        webView.evaluateJavascript(String.format(Locale.US,
            "(() => { const s = document.documentElement.style; " +
            "s.setProperty('--safe-area-inset-top', '%.2fpx'); " +
            "s.setProperty('--safe-area-inset-right', '%.2fpx'); " +
            "s.setProperty('--safe-area-inset-bottom', '%.2fpx'); " +
            "s.setProperty('--safe-area-inset-left', '%.2fpx'); })()",
            safeArea.top / density, safeArea.right / density, safeArea.bottom / density, safeArea.left / density), null);
    }
}
