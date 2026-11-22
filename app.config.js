// @ts-check
const fs = require('fs')
const path = require('path')
const pkg = require('./package.json')
const {getNativeQueries} = require('./src/components/ShareDialog/catalog.ts')

/**
 * @param {import('@expo/config-types').ExpoConfig} _config
 * @returns {{ expo: import('@expo/config-types').ExpoConfig }}
 */
module.exports = function (_config) {
  /**
   * App version number. Should be incremented as part of a release cycle.
   */
  const VERSION = pkg.version

  /**
   * Uses built-in Expo env vars
   *
   * @see https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
   */
  const PLATFORM = process.env.EAS_BUILD_PLATFORM ?? 'web'

  const IS_TESTFLIGHT = process.env.EXPO_PUBLIC_ENV === 'testflight'
  const IS_PRODUCTION = process.env.EXPO_PUBLIC_ENV === 'production'
  const IS_E2E = process.env.EXPO_PUBLIC_ENV === 'e2e'
  const IS_DEV = !IS_TESTFLIGHT && !IS_PRODUCTION

  const ASSOCIATED_DOMAINS = [
    'applinks:quantzing.quantrinity.in',
    'applinks:quantzing.com',
    'applinks:www.quantzing.com',
    'applinks:quantzing.in',
    'appclips:quantzing.quantrinity.in',
    'appclips:quantzing.com',
    'webcredentials:quantzing.quantrinity.in',
    'webcredentials:quantzing.com',
    'webcredentials:quantzing.in',
    ...(IS_DEV || IS_TESTFLIGHT ? [] : []),
  ]

  /*
   * Keep Expo OTA updates disabled unless explicitly enabled with a
   * QuantZing-owned signing certificate so upstream OTA certificates and
   * manifest endpoints are never embedded in QuantZing release builds.
   */
  const UPDATES_ENABLED =
    (IS_TESTFLIGHT || IS_PRODUCTION) &&
    process.env.ENABLE_EXPO_UPDATES === '1' &&
    process.env.DISABLE_UPDATES !== '1'

  const USE_SENTRY = Boolean(process.env.SENTRY_AUTH_TOKEN)
  const USE_BITDRIFT = Boolean(process.env.EXPO_PUBLIC_BITDRIFT_API_KEY)
  const HAS_GOOGLE_SERVICES = fs.existsSync(
    path.join(__dirname, 'google-services.json'),
  )

  /**
   * Apps the share sheet can detect, generated from the share platform
   * catalog. Changing these needs a native build.
   */
  const SHARE_PLATFORM_QUERIES = getNativeQueries()

  const IOS_ICON_FILE =
    PLATFORM === 'web' // web build doesn't like .icon files
      ? './assets/app-icons/ios_icon_default_next.png'
      : IS_TESTFLIGHT
        ? './assets/app-icons/ios_icon_testflight.icon'
        : './assets/app-icons/ios_icon_default.icon'

  return {
    expo: {
      version: VERSION,
      name: 'QuantZing',
      slug: 'quantzing',
      scheme: 'quantzing',
      owner: 'quantzing',
      runtimeVersion: {
        policy: 'appVersion',
      },
      icon: './assets/app-icons/ios_icon_default_next.png',
      userInterfaceStyle: 'automatic',
      primaryColor: '#1D9BF0',
      ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.quantzing.app',
        appleTeamId: process.env.EXPO_APPLE_TEAM_ID,
        config: {
          usesNonExemptEncryption: false,
        },
        icon: IOS_ICON_FILE,
        infoPlist: {
          UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
          'UISupportedInterfaceOrientations~ipad': [
            'UIInterfaceOrientationPortrait',
            'UIInterfaceOrientationPortraitUpsideDown',
            'UIInterfaceOrientationLandscapeLeft',
            'UIInterfaceOrientationLandscapeRight',
          ],
          CADisableMinimumFrameDurationOnPhone: true,
          UIBackgroundModes: ['remote-notification'],
          NSUserActivityTypes: ['INSendMessageIntent'],
          LSApplicationQueriesSchemes: SHARE_PLATFORM_QUERIES.iosSchemes,
          NSCameraUsageDescription:
            'Used for profile pictures, posts, and other kinds of content.',
          NSPhotoLibraryAddUsageDescription:
            'Used to save images to your library.',
          NSPhotoLibraryUsageDescription:
            'Used for profile pictures, posts, and other kinds of content',
          CFBundleSpokenName: 'QuantZing',
          CFBundleLocalizations: [
            'en',
            'an',
            'ast',
            'ca',
            'cs',
            'cy',
            'da',
            'de',
            'el',
            'eo',
            'es',
            'eu',
            'fi',
            'fr',
            'fy',
            'ga',
            'gd',
            'gl',
            'hi',
            'hu',
            'ia',
            'id',
            'it',
            'ja',
            'km',
            'ko',
            'ne',
            'nl',
            'pl',
            'pt-BR',
            'pt-PT',
            'ro',
            'ru',
            'sv',
            'th',
            'tr',
            'uk',
            'vi',
            'yue',
            'zh-Hans',
            'zh-Hant',
          ],
        },
        associatedDomains: ASSOCIATED_DOMAINS,
        entitlements: {
          'com.apple.developer.kernel.increased-memory-limit': true,
          'com.apple.developer.kernel.extended-virtual-addressing': true,
          'com.apple.security.application-groups': ['group.com.quantzing.app'],
          'com.apple.developer.usernotifications.communication': true,
          // 'com.apple.developer.device-information.user-assigned-device-name': true,
          'com.apple.developer.declared-age-range': true,
        },
        privacyManifests: {
          NSPrivacyCollectedDataTypes: [
            {
              NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
            {
              NSPrivacyCollectedDataType:
                'NSPrivacyCollectedDataTypePerformanceData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
            {
              NSPrivacyCollectedDataType:
                'NSPrivacyCollectedDataTypeOtherDiagnosticData',
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: [
                'NSPrivacyCollectedDataTypePurposeAppFunctionality',
              ],
            },
          ],
          NSPrivacyAccessedAPITypes: [
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategoryFileTimestamp',
              NSPrivacyAccessedAPITypeReasons: ['C617.1', '3B52.1', '0A2A.1'],
            },
            {
              NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
              NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
            },
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategorySystemBootTime',
              NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
            },
            {
              NSPrivacyAccessedAPIType:
                'NSPrivacyAccessedAPICategoryUserDefaults',
              NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
            },
          ],
        },
      },
      android: {
        icon: './assets/app-icons/android_icon_default_next.png',
        adaptiveIcon: {
          foregroundImage: './assets/icon-android-foreground.png',
          monochromeImage: './assets/icon-android-monochrome.png',
          backgroundColor: '#000000',
        },
        googleServicesFile: HAS_GOOGLE_SERVICES
          ? './google-services.json'
          : undefined,
        package: 'com.quantzing.app',
        blockedPermissions: ['android.permission.ACCESS_FINE_LOCATION'],
        intentFilters: [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [
              {
                scheme: 'https',
                host: 'quantzing.quantrinity.in',
              },
              {
                scheme: 'https',
                host: 'quantzing.com',
              },
              {
                scheme: 'https',
                host: 'quantzing.in',
              },
              ...(IS_DEV
                ? [
                    {
                      scheme: 'http',
                      host: 'localhost:19006',
                    },
                  ]
                : []),
            ],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
      },
      web: {
        bundler: 'metro',
        favicon: './assets/favicon.png',
      },
      updates: {
        url: UPDATES_ENABLED
          ? process.env.EXPO_UPDATES_URL ||
            'https://updates.quantzing.com/manifest'
          : undefined,
        enabled: UPDATES_ENABLED,
        fallbackToCacheTimeout: 30000,
        codeSigningCertificate: UPDATES_ENABLED
          ? './code-signing/certificate.pem'
          : undefined,
        codeSigningMetadata: UPDATES_ENABLED
          ? {
              keyid: 'main',
              alg: 'rsa-v1_5-sha256',
            }
          : undefined,
        checkAutomatically: 'NEVER',
      },
      plugins: [
        [
          'expo-dev-client',
          {
            toolsButton: false,
            ...(IS_E2E
              ? {
                  launchMode: 'most-recent',
                  skipOnboarding: true,
                  showMenuAtLaunch: false,
                  ios: {
                    defaultLaunchURL: 'http://localhost:8081',
                  },
                  android: {
                    defaultLaunchURL: 'http://10.0.2.2:8081',
                  },
                }
              : {}),
          },
        ],
        'expo-asset',
        'expo-sharing',
        'expo-video',
        [
          'expo-camera',
          {
            microphonePermission: false,
            recordAudioAndroid: false,
          },
        ],
        [
          'expo-image-picker',
          {
            microphonePermission: false,
          },
        ],
        [
          'expo-localization',
          {
            /*
             * React Native 0.88 fixed Android RTL detection, which until then
             * always reported LTR. Opt out so Android keeps rendering LTR like
             * iOS, until RTL layouts get a proper QA pass.
             */
            supportsRTL: false,
          },
        ],
        'expo-web-browser',
        'expo-background-task',
        // edits expo-widgets' output, and mods run in reverse order
        './plugins/withTrendingWidget.js',
        [
          'expo-widgets',
          {
            bundleIdentifier: 'com.quantzing.app.QuantZingWidgets',
            groupIdentifier: 'group.com.quantzing.app',
            enableAndroid: true,
            widgets: [
              {
                name: 'TrendingTopicsWidget',
                displayName: 'Trending Topics',
                description: 'See what people are talking about on QuantZing.',
                ios: {
                  contentMarginsDisabled: true,
                  supportedFamilies: [
                    'systemSmall',
                    'systemMedium',
                    'systemLarge',
                  ],
                  // lets the widget render before the app is first opened
                  initialLayout:
                    'src/features/trendingWidget/TrendingTopicsWidget.ios.tsx',
                },
                android: {
                  // 4x3 cells, or 250x180dp on Android 11 and lower
                  minWidth: 250,
                  minHeight: 180,
                  targetCellWidth: 4,
                  targetCellHeight: 3,
                  // lets the widget render before the app is first opened
                  initialLayout:
                    'src/features/trendingWidget/TrendingTopicsWidget.android.tsx',
                },
              },
            ],
          },
        ],
        [
          'react-native-nano-icons',
          {
            /*
             * One font per codegen directory under `assets/icons/`, see
             * `scripts/icons/README.md`.
             */
            iconSets: ['ui', 'brands', 'community'].map(lane => ({
              inputDir: `./assets/icons/${lane}`,
              outputDir: './assets/nano-icons/nanoicons',
              fontFamily: `icons-${lane}`,
            })),
          },
        ],
        /*
         * Mods run in reverse registration order. Register the system bars
         * plugin before expo-navigation-bar, which removes
         * `android:windowLightNavigationBar` when no `style` is set.
         */
        './plugins/withAndroidStylesSystemBarsPlugin.js',
        ['expo-navigation-bar', {enforceContrast: false}],
        /*
         * Expo runs Gradle mods in reverse registration order. Keep Bitdrift
         * before Sentry so its plugins block is prepended after Sentry's apply
         * statement and remains at the top, as required by Gradle.
         */
        [
          '@bitdrift/react-native',
          {
            networkInstrumentation: USE_BITDRIFT,
          },
        ],
        ...(USE_SENTRY
          ? [
              /** @type {[string, any]} */ ([
                '@sentry/react-native/expo',
                {
                  organization: 'quantzing',
                  project: 'quant-zing',
                  url: 'https://sentry.io',
                  experimental_android: {
                    enableAndroidGradlePlugin: true,
                  },
                },
              ]),
            ]
          : []),
        [
          'expo-build-properties',
          {
            ios: {
              deploymentTarget: '16.4',
              buildReactNativeFromSource:
                process.env.BUILD_RN_FROM_SOURCE === '1',
              ccacheEnabled: IS_DEV,
              cxxLanguageStandard: 'c++23',
              extraPods: [
                {
                  name: 'MCEmojiPicker',
                  git: 'https://github.com/bluesky-social/MCEmojiPicker.git',
                  branch: 'main',
                },
              ],
            },
            android: {
              compileSdkVersion: Number(process.env.ANDROID_COMPILE_SDK || 36),
              targetSdkVersion: Number(process.env.ANDROID_TARGET_SDK || 35),
              buildToolsVersion: process.env.ANDROID_BUILD_TOOLS || '36.0.0',
              buildReactNativeFromSource:
                process.env.BUILD_RN_FROM_SOURCE === '1',
              enableMinifyInReleaseBuilds: true,
            },
          },
        ],
        [
          'expo-notifications',
          {
            icon: './assets/icon-android-notification.png',
            color: '#1D9BF0',
            sounds: PLATFORM === 'ios' ? ['assets/dm.aiff'] : ['assets/dm.mp3'],
          },
        ],
        './plugins/starterPackAppClipExtension/withStarterPackAppClip.js',
        './plugins/withGradleJVMHeapSizeIncrease.js',
        './plugins/withAndroidManifestLargeHeapPlugin.js',
        './plugins/withAndroidManifestFCMIconPlugin.js',
        './plugins/withAndroidManifestIntentQueriesPlugin.js',
        [
          './plugins/withAndroidManifestSharePlatformQueriesPlugin.js',
          {
            packages: SHARE_PLATFORM_QUERIES.androidPackages,
            schemes: SHARE_PLATFORM_QUERIES.androidSchemes,
          },
        ],
        './plugins/withAndroidManifestOptionalCameraPlugin.js',
        './plugins/withAndroidStylesAccentColorPlugin.js',
        './plugins/withAndroidNoJitpackPlugin.js',
        './plugins/withAndroidPreparedTextLayoutPlugin.js',
        './plugins/withAndroidComposeVersion.js',
        './plugins/withAndroidQuantZingBuild.js',
        './plugins/withIOSWindowingControlStyle.js',
        './plugins/shareExtension/withShareExtensions.js',
        './plugins/notificationsExtension/withNotificationsExtension.js',
        [
          'expo-font',
          {
            ios: {
              /*
               * Uncompressed TTF rather than WOFF2: iOS decompresses WOFF2
               * fonts on every launch, which took ~200 ms of the startup
               * critical path. These are the same Inter 4.001 fonts as the
               * WOFF2 files used on web.
               */
              fonts: [
                './assets/fonts/inter/InterVariable.ttf',
                './assets/fonts/inter/InterVariable-Italic.ttf',
              ],
            },
            android: {
              fonts: [
                './assets/fonts/inter/InterVariable.woff2',
                './assets/fonts/inter/InterVariable-Italic.woff2',
                './assets/fonts/inter/Inter-Regular.otf',
                './assets/fonts/inter/Inter-Italic.otf',
                './assets/fonts/inter/Inter-Medium.otf',
                './assets/fonts/inter/Inter-MediumItalic.otf',
                './assets/fonts/inter/Inter-SemiBold.otf',
                './assets/fonts/inter/Inter-SemiBoldItalic.otf',
                './assets/fonts/inter/Inter-Bold.otf',
                './assets/fonts/inter/Inter-BoldItalic.otf',
              ],
            },
          },
        ],
        [
          'expo-splash-screen',
          {
            ios: {
              enableFullScreenImage_legacy: true, // iOS only
              backgroundColor: '#000000',
              image: './assets/splash/splash.png',
              resizeMode: 'cover',
              dark: {
                enableFullScreenImage_legacy: true, // iOS only
                backgroundColor: '#000000',
                image: './assets/splash/splash-dark.png',
                resizeMode: 'cover',
              },
            },
            android: {
              backgroundColor: '#000000',
              image: './assets/splash/android-splash-logo-white.png',
              imageWidth: 102, // even division of 306px
              dark: {
                backgroundColor: '#000000',
                image: './assets/splash/android-splash-logo-white.png',
                imageWidth: 102,
              },
            },
          },
        ],
        [
          '@bsky.app/expo-dynamic-app-icon',
          {
            /**
             * Default set
             */
            default_light: {
              ios: './assets/app-icons/ios_icon_legacy_light.png',
              android: './assets/app-icons/android_icon_legacy_light.png',
              prerendered: true,
            },
            default_dark: {
              ios: './assets/app-icons/ios_icon_legacy_dark.png',
              android: './assets/app-icons/android_icon_legacy_dark.png',
              prerendered: true,
            },

            /**
             * QuantZing Pro core set
             */
            core_aurora: {
              ios: './assets/app-icons/ios_icon_core_aurora.png',
              android: './assets/app-icons/android_icon_core_aurora.png',
              prerendered: true,
            },
            core_bonfire: {
              ios: './assets/app-icons/ios_icon_core_bonfire.png',
              android: './assets/app-icons/android_icon_core_bonfire.png',
              prerendered: true,
            },
            core_sunrise: {
              ios: './assets/app-icons/ios_icon_core_sunrise.png',
              android: './assets/app-icons/android_icon_core_sunrise.png',
              prerendered: true,
            },
            core_sunset: {
              ios: './assets/app-icons/ios_icon_core_sunset.png',
              android: './assets/app-icons/android_icon_core_sunset.png',
              prerendered: true,
            },
            core_midnight: {
              ios: './assets/app-icons/ios_icon_core_midnight.png',
              android: './assets/app-icons/android_icon_core_midnight.png',
              prerendered: true,
            },
            core_flat_blue: {
              ios: './assets/app-icons/ios_icon_core_flat_blue.png',
              android: './assets/app-icons/android_icon_core_flat_blue.png',
              prerendered: true,
            },
            core_flat_white: {
              ios: './assets/app-icons/ios_icon_core_flat_white.png',
              android: './assets/app-icons/android_icon_core_flat_white.png',
              prerendered: true,
            },
            core_flat_black: {
              ios: './assets/app-icons/ios_icon_core_flat_black.png',
              android: './assets/app-icons/android_icon_core_flat_black.png',
              prerendered: true,
            },
            core_classic: {
              ios: './assets/app-icons/ios_icon_core_classic.png',
              android: './assets/app-icons/android_icon_core_classic.png',
              prerendered: true,
            },
          },
        ],
        ['expo-screen-orientation'],
        [
          'expo-location',
          {
            locationWhenInUsePermission:
              'QuantZing uses your approximate location via GPS to determine the content and features available in your region.',
            locationAlwaysAndWhenInUsePermission: false,
            locationAlwaysPermission: false,
            motionUsagePermission: false,
            locationFullAccuracyPermission: false,
            isIosReducedAccuracyByDefault: true,
          },
        ],
        [
          'expo-contacts',
          {
            contactsPermission:
              'I agree to allow QuantZing to use my contacts for friend discovery until I opt out.',
          },
        ],
      ],
      extra: {
        eas: {
          build: {
            experimental: {
              ios: {
                appExtensions: [
                  {
                    targetName: 'Share-with-QuantZing',
                    bundleIdentifier: 'com.quantzing.app.Share-with-QuantZing',
                    entitlements: {
                      'com.apple.security.application-groups': [
                        'group.com.quantzing.app',
                      ],
                    },
                  },
                  {
                    targetName: 'QuantZingNSE',
                    bundleIdentifier: 'com.quantzing.app.QuantZingNSE',
                    entitlements: {
                      'com.apple.security.application-groups': [
                        'group.com.quantzing.app',
                      ],
                    },
                  },
                  {
                    targetName: 'QuantZingClip',
                    bundleIdentifier: 'com.quantzing.app.AppClip',
                    parentBundleIdentifier: 'com.quantzing.app',
                    entitlements: {
                      'com.apple.security.application-groups': [
                        'group.com.quantzing.app',
                      ],
                      'com.apple.developer.parent-application-identifiers': [
                        '$(AppIdentifierPrefix)com.quantzing.app',
                      ],
                      'com.apple.developer.associated-domains':
                        ASSOCIATED_DOMAINS,
                    },
                  },
                ],
              },
            },
          },
          projectId: '55bd077a-d905-4184-9c7f-94789ba0f302',
        },
      },
      experiments: {
        baseUrl: '/static',
        buildCacheProvider: 'eas',
      },
    },
  }
}
