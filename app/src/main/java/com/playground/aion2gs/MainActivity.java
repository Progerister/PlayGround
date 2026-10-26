package com.playground.aion2gs;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Thin native shell: storage, network, Material You colours, haptics, browser hand-off. */
public class MainActivity extends Activity {

    private static final String ASSET_URL = "file:///android_asset/index.html";
    private static final String VERSION_NAME = "__VERSION_NAME__";
    private static final String PREFS = "aion2gs";

    private WebView web;
    private SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private String cachedColors;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        web = new WebView(this);
        setContentView(web);
        configure();
        if (savedInstanceState == null) web.loadUrl(ASSET_URL);
        else web.restoreState(savedInstanceState);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configure() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " Aion2GS/" + VERSION_NAME);

        web.setBackgroundColor(Color.parseColor("#0E1514"));
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                return false;
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        io.shutdownNow();
    }

    private int colorOf(String resName) {
        int id = getResources().getIdentifier(resName, "color", "android");
        if (id == 0) return Integer.MIN_VALUE;
        try {
            return getResources().getColor(id, getTheme());
        } catch (Exception e) {
            try {
                return getResources().getColor(id);
            } catch (Exception ignored) {
                return Integer.MIN_VALUE;
            }
        }
    }

    private static String hex(int color) {
        return String.format(Locale.US, "#%06X", (0xFFFFFF & color));
    }

    private static String snake(String camel) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < camel.length(); i++) {
            char c = camel.charAt(i);
            if (Character.isUpperCase(c)) sb.append('_').append(Character.toLowerCase(c));
            else sb.append(c);
        }
        return sb.toString();
    }

    private static final String[] ROLES = {
            "primary", "onPrimary", "primaryContainer", "onPrimaryContainer",
            "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
            "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
            "error", "onError", "errorContainer", "onErrorContainer",
            "background", "onBackground", "surface", "onSurface",
            "surfaceVariant", "onSurfaceVariant",
            "surfaceContainerLowest", "surfaceContainerLow", "surfaceContainer",
            "surfaceContainerHigh", "surfaceContainerHighest",
            "surfaceBright", "surfaceDim", "outline", "outlineVariant"
    };

    private String dynamicColors() {
        if (cachedColors != null) return cachedColors;
        if (Build.VERSION.SDK_INT < 31) return "";
        try {
            JSONObject light = new JSONObject();
            JSONObject dark = new JSONObject();
            for (String role : ROLES) {
                String base = "system_" + snake(role);
                int l = colorOf(base + "_light");
                int d = colorOf(base + "_dark");
                if (l == Integer.MIN_VALUE || d == Integer.MIN_VALUE) return "";
                light.put(role, hex(l));
                dark.put(role, hex(d));
            }
            int accentLight = colorOf("system_accent1_400");
            int accentDark = colorOf("system_accent1_800");
            if (accentLight != Integer.MIN_VALUE) light.put("inversePrimary", hex(accentLight));
            if (accentDark != Integer.MIN_VALUE) dark.put("inversePrimary", hex(accentDark));

            JSONObject out = new JSONObject();
            out.put("api", Build.VERSION.SDK_INT);
            out.put("light", light);
            out.put("dark", dark);
            cachedColors = out.toString();
            return cachedColors;
        } catch (Exception e) {
            cachedColors = "";
            return "";
        }
    }

    private static int parseHex(String value) {
        try {
            return Color.parseColor(value);
        } catch (Exception e) {
            return 0xFF0E1514;
        }
    }

    public class Bridge {

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public String getString(String key) {
            if (key == null) return "";
            return prefs.getString(key, "");
        }

        @JavascriptInterface
        public void putString(String key, String value) {
            if (key == null) return;
            prefs.edit().putString(key, value == null ? "" : value).apply();
        }

        @JavascriptInterface
        public String fetchGuide(String url) {
            if (url == null || url.isEmpty()) return "";
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(9000);
                conn.setReadTimeout(12000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("Accept", "application/json,text/plain,*/*");
                conn.setRequestProperty("Cache-Control", "no-cache");
                int code = conn.getResponseCode();
                if (code >= 400) return "";
                InputStream in = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder(16 * 1024);
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                return sb.toString();
            } catch (Exception e) {
                return "";
            } finally {
                if (conn != null) conn.disconnect();
            }
        }

        @JavascriptInterface
        public String getDynamicColors() {
            return dynamicColors();
        }

        @JavascriptInterface
        public void setSystemBars(final String colorHex, final boolean darkIcons) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    int color = parseHex(colorHex);
                    if (Build.VERSION.SDK_INT >= 21) {
                        getWindow().setStatusBarColor(color);
                        getWindow().setNavigationBarColor(color);
                    }
                    View decor = getWindow().getDecorView();
                    int flags = decor.getSystemUiVisibility();
                    if (darkIcons) {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    } else {
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        if (Build.VERSION.SDK_INT >= 26) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                    decor.setSystemUiVisibility(flags);
                }
            });
        }

        @JavascriptInterface
        public void haptic(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                int duration = Math.max(5, Math.min(80, ms));
                if (Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(duration);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void openUrl(String url) {
            if (url == null || url.isEmpty()) return;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
        }
    }
}
