import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const ANDROID_SDK =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk')

const BUILD_TOOLS_DIR = (() => {
  const base = path.join(ANDROID_SDK, 'build-tools')
  const versions = fs
    .readdirSync(base)
    .filter(v => !v.includes('rc'))
    .sort()
    .reverse()
  const chosen = versions[0] || fs.readdirSync(base).sort().reverse()[0]
  if (!chosen) throw new Error('No Android build-tools found under ' + base)
  return path.join(base, chosen)
})()

const PLATFORM_JAR = (() => {
  const base = path.join(ANDROID_SDK, 'platforms')
  const versions = fs.readdirSync(base).sort().reverse()
  const chosen = versions[0]
  if (!chosen) throw new Error('No Android platform jar found under ' + base)
  return path.join(base, chosen, 'android.jar')
})()

const isWin = process.platform === 'win32'
const AAPT2 = path.join(BUILD_TOOLS_DIR, isWin ? 'aapt2.exe' : 'aapt2')
const D8 = path.join(BUILD_TOOLS_DIR, isWin ? 'd8.bat' : 'd8')
const ZIPALIGN = path.join(BUILD_TOOLS_DIR, isWin ? 'zipalign.exe' : 'zipalign')
const APKSIGNER = path.join(
  BUILD_TOOLS_DIR,
  isWin ? 'apksigner.bat' : 'apksigner',
)

const KEYSTORE_PATH =
  process.env.QUANTZING_KEYSTORE_PATH ||
  path.join(os.homedir(), '.ssh', 'quantzing-android-release.jks')
const KEYSTORE_PASS =
  process.env.QUANTZING_KEYSTORE_PASS || 'QuantZingSovereignRelease2026'
const KEY_ALIAS = 'quantzing'

const OUT_APK =
  process.argv[2] ||
  path.join(projectRoot, '.quantzing-data', 'releases', 'quantzing-android.apk')

const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'quantzing-apk-'))

function run(cmd, args, opts = {}) {
  const useShell = isWin && cmd.toLowerCase().endsWith('.bat')
  return execFileSync(cmd, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    shell: useShell,
    ...opts,
  })
}

const MANIFEST_XML = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.quantzing.app"
    android:versionCode="1"
    android:versionName="1.139.0">

    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="35" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:label="QuantZing"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher"
        android:theme="@style/QuantZingTheme"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="false"
        android:allowBackup="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|smallestScreenSize|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <intent-filter android:autoVerify="false">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="quantzing.quantrinity.in" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`

const STYLES_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="QuantZingTheme" parent="android:Theme.DeviceDefault.NoActionBar">
        <item name="android:windowBackground">@android:color/black</item>
        <item name="android:colorBackground">@android:color/black</item>
        <item name="android:statusBarColor">@android:color/black</item>
        <item name="android:navigationBarColor">@android:color/black</item>
    </style>
</resources>
`

const MAIN_ACTIVITY_JAVA = `package com.quantzing.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private static final String BASE_URL = "https://quantzing.quantrinity.in/";
    private static final String ALLOWED_HOST = "quantzing.quantrinity.in";
    private static final int FILE_CHOOSER_REQUEST = 1001;

    private FrameLayout rootContainer;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.BLACK);
        window.setNavigationBarColor(Color.BLACK);

        rootContainer = new FrameLayout(this);
        rootContainer.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " QuantZingAndroid/1.139.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String host = uri.getHost();
                String scheme = uri.getScheme();
                if (("https".equals(scheme) || "http".equals(scheme)) && host != null &&
                    (host.equalsIgnoreCase(ALLOWED_HOST) || host.endsWith(".quantrinity.in"))) {
                    return false;
                }
                try {
                    Intent external = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(external);
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                        "<style>body{margin:0;background:#000;color:#e7e9ea;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}" +
                        ".card{max-width:340px;background:#16181c;border:1px solid #2f3336;border-radius:20px;padding:28px}" +
                        "h1{margin:0 0 10px;font-size:22px}p{margin:0 0 20px;color:#71767b;font-size:14px;line-height:1.5}" +
                        "button{background:#1d9bf0;color:#fff;border:0;border-radius:999px;padding:12px 28px;font-size:15px;font-weight:700}</style></head>" +
                        "<body><div class='card'><h1>No Internet Connection</h1><p>QuantZing needs a network connection to load live Zings and Reels.</p>" +
                        "<button onclick='window.location.href=\\"" + BASE_URL + "\\"'>Retry</button></div></body></html>";
                    view.loadDataWithBaseURL(BASE_URL, html, "text/html", "UTF-8", null);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");

                String[] acceptTypes = fileChooserParams != null ? fileChooserParams.getAcceptTypes() : null;
                if (acceptTypes != null && acceptTypes.length > 0) {
                    boolean hasValid = false;
                    for (String t : acceptTypes) {
                        if (t != null && t.contains("/")) {
                            hasValid = true;
                            break;
                        }
                    }
                    if (hasValid) {
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes);
                    } else {
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
                    }
                } else {
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
                }

                if (fileChooserParams != null && fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }

                try {
                    startActivityForResult(Intent.createChooser(intent, "Select Media"), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                rootContainer.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                rootContainer.removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                webView.setVisibility(View.VISIBLE);
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {}
            }
        });

        rootContainer.addView(webView);
        setContentView(rootContainer);

        String startUrl = resolveIntentUrl(getIntent());
        webView.loadUrl(startUrl);
    }

    private String resolveIntentUrl(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri data = intent.getData();
            if (data != null && ALLOWED_HOST.equalsIgnoreCase(data.getHost())) {
                return data.toString();
            }
        }
        return BASE_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = resolveIntentUrl(intent);
        if (webView != null && !BASE_URL.equals(url)) {
            webView.loadUrl(url);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                ClipData clipData = data.getClipData();
                if (clipData != null && clipData.getItemCount() > 0) {
                    results = new Uri[clipData.getItemCount()];
                    for (int i = 0; i < clipData.getItemCount(); i++) {
                        results[i] = clipData.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            if (customViewCallback != null) customViewCallback.onCustomViewHidden();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
`

try {
  console.log('[APK] Using Android SDK:', ANDROID_SDK)
  console.log('[APK] Build-Tools:', BUILD_TOOLS_DIR)
  console.log('[APK] Platform JAR:', PLATFORM_JAR)

  const resDir = path.join(WORK_DIR, 'res')
  const valuesDir = path.join(resDir, 'values')
  const mipmapDir = path.join(resDir, 'mipmap-xxxhdpi')
  const javaDir = path.join(WORK_DIR, 'src', 'com', 'quantzing', 'app')
  const genDir = path.join(WORK_DIR, 'gen')
  const classesDir = path.join(WORK_DIR, 'classes')
  const dexDir = path.join(WORK_DIR, 'dex')
  const flatResDir = path.join(WORK_DIR, 'flat')

  for (const d of [valuesDir, mipmapDir, javaDir, genDir, classesDir, dexDir, flatResDir]) {
    fs.mkdirSync(d, {recursive: true})
  }

  // Copy real QuantZing app icon
  const iconSrc = path.join(
    projectRoot,
    'assets',
    'app-icons',
    'android_icon_default_next.png',
  )
  fs.copyFileSync(iconSrc, path.join(mipmapDir, 'ic_launcher.png'))
  fs.writeFileSync(path.join(valuesDir, 'styles.xml'), STYLES_XML, 'utf8')
  fs.writeFileSync(path.join(WORK_DIR, 'AndroidManifest.xml'), MANIFEST_XML, 'utf8')
  fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), MAIN_ACTIVITY_JAVA, 'utf8')

  // 1. Compile Android resources with aapt2
  console.log('[APK] 1/6 Compiling resources with aapt2...')
  const resZip = path.join(flatResDir, 'res.zip')
  run(AAPT2, ['compile', '--dir', resDir, '-o', resZip])

  // 2. Link resources + manifest into base APK
  console.log('[APK] 2/6 Linking manifest & resources with aapt2...')
  const unsignedApk = path.join(WORK_DIR, 'unsigned.apk')
  run(AAPT2, [
    'link',
    '-I',
    PLATFORM_JAR,
    '--manifest',
    path.join(WORK_DIR, 'AndroidManifest.xml'),
    '--java',
    genDir,
    '-o',
    unsignedApk,
    resZip,
  ])

  // 3. Compile Java sources
  console.log('[APK] 3/6 Compiling MainActivity.java with javac...')
  const javaFiles = [
    path.join(javaDir, 'MainActivity.java'),
    path.join(genDir, 'com', 'quantzing', 'app', 'R.java'),
  ].filter(f => fs.existsSync(f))
  run('javac', [
    '-source',
    '11',
    '-target',
    '11',
    '-cp',
    PLATFORM_JAR,
    '-d',
    classesDir,
    ...javaFiles,
  ])

  // 4. Convert .class -> classes.dex via d8
  console.log('[APK] 4/6 Dexing bytecode with d8...')
  const classFiles = []
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (ent.name.endsWith('.class')) classFiles.push(p)
    }
  }
  walk(classesDir)
  run(D8, [
    '--release',
    '--min-api',
    '24',
    '--lib',
    PLATFORM_JAR,
    '--output',
    dexDir,
    ...classFiles,
  ])

  // 5. Add classes.dex into unsigned.apk using jar uf (pure JDK, preserves zip structure)
  console.log('[APK] 5/6 Packaging classes.dex & running zipalign...')
  run('jar', ['uf', unsignedApk, '-C', dexDir, 'classes.dex'])

  const alignedApk = path.join(WORK_DIR, 'aligned.apk')
  run(ZIPALIGN, ['-f', '-p', '4', unsignedApk, alignedApk])

  // 6. Ensure persistent QuantZing release keystore exists & sign APK (v1 + v2 + v3)
  console.log('[APK] 6/6 Signing APK with apksigner...')
  if (!fs.existsSync(KEYSTORE_PATH)) {
    fs.mkdirSync(path.dirname(KEYSTORE_PATH), {recursive: true})
    run('keytool', [
      '-genkeypair',
      '-v',
      '-keystore',
      KEYSTORE_PATH,
      '-storetype',
      'PKCS12',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-alias',
      KEY_ALIAS,
      '-storepass',
      KEYSTORE_PASS,
      '-keypass',
      KEYSTORE_PASS,
      '-dname',
      'CN=QuantZing, OU=Quantrinity, O=Quantrinity Lab, L=Bengaluru, S=Karnataka, C=IN',
    ])
  }

  fs.mkdirSync(path.dirname(OUT_APK), {recursive: true})
  run(APKSIGNER, [
    'sign',
    '--ks',
    KEYSTORE_PATH,
    '--ks-key-alias',
    KEY_ALIAS,
    '--ks-pass',
    `pass:${KEYSTORE_PASS}`,
    '--key-pass',
    `pass:${KEYSTORE_PASS}`,
    '--v1-signing-enabled',
    'true',
    '--v2-signing-enabled',
    'true',
    '--v3-signing-enabled',
    'true',
    '--out',
    OUT_APK,
    alignedApk,
  ])

  // Verify signed APK
  const verifyOut = run(APKSIGNER, ['verify', '--verbose', OUT_APK])
  const badgingOut = run(AAPT2, ['dump', 'badging', OUT_APK])
  const stat = fs.statSync(OUT_APK)
  const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(OUT_APK))
    .digest('hex')

  console.log('\n[APK] SUCCESS!')
  console.log('[APK] Output:', OUT_APK)
  console.log('[APK] Size:', stat.size, 'bytes')
  console.log('[APK] SHA256:', sha256)
  console.log('[APK] Badging:', badgingOut.split('\n').slice(0, 4).join(' | '))
  console.log('[APK] Verify:', verifyOut.split('\n').slice(0, 6).join(' | '))
} finally {
  fs.rmSync(WORK_DIR, {recursive: true, force: true})
}
