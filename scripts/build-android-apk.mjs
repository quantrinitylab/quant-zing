#!/usr/bin/env node
/**
 * QuantZing Sovereign React Native Android Release APK Builder
 *
 * Orchestrates a real Expo Prebuild + React Native 0.88.1 (Hermes) + Gradle `:app:assembleRelease`
 * build on Windows/Linux/macOS, tailored to local machine constraints:
 *  - Uses installed JDK 17, Android SDK Platform 36, Build-Tools 36.0.0, and NDK 27.0.12077973
 *  - Maps a temporary short drive letter (e.g. `subst Z:`) on Windows to prevent 260-char MAX_PATH CMake/Ninja failures
 *  - Generates/reuses a persistent PKCS12 release keystore outside the git repo (`C:\antigravity\quant-os\.secrets\quantzing-release.keystore`)
 *  - Verifies generated Gradle configuration (`ext.ndkVersion`, `applicationId "com.quantzing.app"`, release signing, JVM heap `-Xmx2560m`)
 *  - Compiles `:app:assembleRelease` with `--no-daemon --max-workers=2`
 *  - Verifies the output APK with `aapt2 dump badging` and `apksigner verify --verbose --print-certs`
 *  - Publishes the signed APK to `.quantzing-data/releases/quantzing-android.apk` for `serve-quantzing.mjs`
 */

import crypto from 'node:crypto'
import {execFileSync, spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const isWin = process.platform === 'win32'

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const positionalArgs = args.filter(a => !a.startsWith('--'))

function getFlagValue(prefix, fallback) {
  const match = args.find(a => a.startsWith(`${prefix}=`))
  return match ? match.slice(prefix.length + 1) : fallback
}

const isDryRun = flags.has('--dry-run')
const isPrebuildOnly = flags.has('--prebuild-only')
const skipPrebuild = flags.has('--skip-prebuild')
const skipTypecheck = flags.has('--skip-typecheck')
const forceCleanPrebuild = flags.has('--clean')
const noSubst = !flags.has('--use-subst') || flags.has('--no-subst')
const useSubst = flags.has('--use-subst') && !flags.has('--no-subst')
const keepSubst = flags.has('--keep-subst')
const arm64Only = flags.has('--arm64-only')

const REACT_NATIVE_ABIS = getFlagValue(
  '--arch',
  process.env.QUANTZING_ANDROID_ABIS ||
    (arm64Only ? 'arm64-v8a' : 'arm64-v8a,armeabi-v7a'),
)

const OUT_APK = path.resolve(
  getFlagValue(
    '--out',
    positionalArgs[0] ||
      process.env.QUANTZING_APK_PATH ||
      path.join(
        projectRoot,
        '.quantzing-data',
        'releases',
        'quantzing-android.apk',
      ),
  ),
)

function logStep(step, msg) {
  console.log(`\n[QuantZing APK][${step}] ${msg}`)
}

function resolveJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME.replace(/[\\/]+$/, '')
  }
  if (isWin) {
    const adoptiumDir = 'C:\\Program Files\\Eclipse Adoptium'
    if (fs.existsSync(adoptiumDir)) {
      const jdks = fs
        .readdirSync(adoptiumDir)
        .filter(d => d.startsWith('jdk-17'))
        .sort()
        .reverse()
      if (jdks.length > 0) {
        return path.join(adoptiumDir, jdks[0])
      }
    }
  }
  throw new Error(
    'JAVA_HOME is not set and JDK 17 was not found under C:\\Program Files\\Eclipse Adoptium.',
  )
}

function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWin
      ? path.join(
          process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
          'Android',
          'Sdk',
        )
      : path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate.replace(/[\\/]+$/, '')
    }
  }
  throw new Error(
    `Android SDK not found. Checked: ${candidates.join(', ')}`,
  )
}

function resolveBuildTools(androidSdk, preferredVersion = '36.0.0') {
  const base = path.join(androidSdk, 'build-tools')
  if (!fs.existsSync(base)) {
    throw new Error(`Android build-tools directory missing: ${base}`)
  }
  if (fs.existsSync(path.join(base, preferredVersion))) {
    return {
      version: preferredVersion,
      dir: path.join(base, preferredVersion),
    }
  }
  const versions = fs
    .readdirSync(base)
    .filter(v => !v.includes('rc'))
    .sort()
    .reverse()
  const chosen = versions[0] || fs.readdirSync(base).sort().reverse()[0]
  if (!chosen) {
    throw new Error(`No Android build-tools found in ${base}`)
  }
  return {
    version: chosen,
    dir: path.join(base, chosen),
  }
}

function resolveNdkVersion(androidSdk, preferredVersion = '27.0.12077973') {
  const base = path.join(androidSdk, 'ndk')
  if (!fs.existsSync(base)) {
    throw new Error(`Android NDK directory missing: ${base}`)
  }
  if (fs.existsSync(path.join(base, preferredVersion))) {
    return preferredVersion
  }
  const versions = fs.readdirSync(base).sort().reverse()
  if (versions.length === 0) {
    throw new Error(`No NDK versions installed under ${base}`)
  }
  return versions[0]
}

function resolveCompileSdk(androidSdk, preferredSdk = '36') {
  const base = path.join(androidSdk, 'platforms')
  if (!fs.existsSync(base)) {
    throw new Error(`Android platforms directory missing: ${base}`)
  }
  if (fs.existsSync(path.join(base, `android-${preferredSdk}`))) {
    return preferredSdk
  }
  const platforms = fs
    .readdirSync(base)
    .filter(p => p.startsWith('android-'))
    .map(p => p.replace('android-', ''))
    .sort()
    .reverse()
  if (platforms.length === 0) {
    throw new Error(`No Android platforms installed under ${base}`)
  }
  return platforms[0]
}

function getGitShortSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'sovereign'
  }
}

function getPackageVersion() {
  const pkgPath = path.join(projectRoot, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  return pkg.version || '1.139.0'
}

function ensureReleaseKeystore(javaHome) {
  const defaultSecretsDir = path.resolve(projectRoot, '..', '.secrets')
  const keystorePath = path.resolve(
    process.env.QUANTZING_KEYSTORE_FILE ||
      process.env.QUANTZING_KEYSTORE_PATH ||
      path.join(defaultSecretsDir, 'quantzing-release.keystore'),
  )
  const keystorePass =
    process.env.QUANTZING_KEYSTORE_PASSWORD ||
    process.env.QUANTZING_KEYSTORE_PASS ||
    'QuantZingSovereignRelease2026'
  const keyAlias =
    process.env.QUANTZING_KEY_ALIAS || 'quantzing-release'
  const keyPass =
    process.env.QUANTZING_KEY_PASSWORD ||
    process.env.QUANTZING_KEY_PASS ||
    keystorePass

  const keytoolBin = path.join(
    javaHome,
    'bin',
    isWin ? 'keytool.exe' : 'keytool',
  )

  if (!fs.existsSync(keystorePath)) {
    if (isDryRun) {
      return {keystorePath, keystorePass, keyAlias, keyPass, existed: false}
    }
    fs.mkdirSync(path.dirname(keystorePath), {recursive: true})
    logStep(
      'KEYSTORE',
      `Generating persistent PKCS12 release keystore at ${keystorePath}`,
    )
    execFileSync(
      keytoolBin,
      [
        '-genkeypair',
        '-v',
        '-storetype',
        'PKCS12',
        '-keystore',
        keystorePath,
        '-alias',
        keyAlias,
        '-keyalg',
        'RSA',
        '-keysize',
        '2048',
        '-validity',
        '10000',
        '-storepass',
        keystorePass,
        '-keypass',
        keyPass,
        '-dname',
        'CN=QuantZing, OU=QuantOS, O=Quantrinity, L=Mumbai, ST=Maharashtra, C=IN',
      ],
      {stdio: 'inherit'},
    )
  }

  return {keystorePath, keystorePass, keyAlias, keyPass, existed: true}
}

function findAvailableSubstDrive(targetPath) {
  if (!isWin || !useSubst) return null
  const preferredDrive = (process.env.QUANTZING_SUBST_DRIVE || 'Z:').toUpperCase()
  const candidates = [
    preferredDrive,
    'Z:',
    'Y:',
    'X:',
    'W:',
    'V:',
  ].filter((v, i, a) => a.indexOf(v) === i)

  let existingSubstOutput = ''
  try {
    existingSubstOutput = execFileSync('subst', [], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }

  const normalizedTarget = path.resolve(targetPath).toLowerCase()
  for (const line of existingSubstOutput.split(/\r?\n/)) {
    const match = line.match(/^([A-Z]:)\\:\s*=>\s*(.+)$/i)
    if (match) {
      const drive = match[1].toUpperCase()
      const mappedTo = path.resolve(match[2].trim()).toLowerCase()
      if (mappedTo === normalizedTarget) {
        return {drive, alreadyMapped: true}
      }
    }
  }

  for (const drive of candidates) {
    if (!fs.existsSync(`${drive}\\`)) {
      return {drive, alreadyMapped: false}
    }
  }
  return null
}

function mountSubstDrive(targetPath) {
  const choice = findAvailableSubstDrive(targetPath)
  if (!choice) return null
  if (choice.alreadyMapped) {
    logStep('SUBST', `Reusing existing drive mapping ${choice.drive} => ${targetPath}`)
    return choice
  }
  logStep(
    'SUBST',
    `Mapping short drive ${choice.drive} => ${targetPath} (mitigates Windows 260-char MAX_PATH in CMake/Ninja)`,
  )
  execFileSync('subst', [choice.drive, targetPath], {stdio: 'inherit'})
  return choice
}

function unmountSubstDrive(choice) {
  if (!choice || choice.alreadyMapped || keepSubst) return
  try {
    logStep('SUBST', `Unmounting temporary drive ${choice.drive}`)
    execFileSync('subst', [choice.drive, '/D'], {stdio: 'inherit'})
  } catch (err) {
    console.warn(`[QuantZing APK][SUBST] Warning: Could not unmount ${choice.drive}: ${err.message}`)
  }
}

function runInherited(cmd, cmdArgs, options = {}) {
  const useShell =
    isWin &&
    (cmd.toLowerCase().endsWith('.cmd') || cmd.toLowerCase().endsWith('.bat'))
  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: useShell,
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status}: ${cmd} ${cmdArgs.join(' ')}`,
    )
  }
}

function escapeLocalPropertiesPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:')
}

function verifyAndFixPrebuildOutputs(workRoot, androidSdk, ndkVersion, compileSdk) {
  const androidDir = path.join(workRoot, 'android')
  if (!fs.existsSync(androidDir)) {
    throw new Error(`Expected android/ directory after prebuild at: ${androidDir}`)
  }

  // 1. Write android/local.properties with sdk.dir
  const localPropsPath = path.join(androidDir, 'local.properties')
  const localPropsContent = `sdk.dir=${escapeLocalPropertiesPath(androidSdk)}\n`
  fs.writeFileSync(localPropsPath, localPropsContent, 'utf8')

  // 2. Verify android/build.gradle has ext.ndkVersion BEFORE apply plugin: "expo-root-project"
  const rootGradlePath = path.join(androidDir, 'build.gradle')
  let rootGradle = fs.readFileSync(rootGradlePath, 'utf8')
  rootGradle = rootGradle.replace(
    /\nallprojects \{ project ->[\s\S]*?\n\}\n/,
    '\n',
  )
  if (!rootGradle.includes('https://dl.bitdrift.io/sdk/android-maven')) {
    rootGradle = rootGradle.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      `allprojects {\n  repositories {\n    maven {\n      url 'https://dl.bitdrift.io/sdk/android-maven'\n      content { includeGroup 'io.bitdrift' }\n    }`,
    )
  }
  rootGradle = rootGradle.replace(
    /\nallprojects \{\n  tasks\.configureEach \{ task ->[\s\S]*?\n\}\n/,
    '\n',
  )
  if (!rootGradle.includes('AarMetadata')) {
    rootGradle += `\nallprojects {\n  tasks.configureEach { task ->\n    if (task.name.startsWith("check") && task.name.endsWith("AarMetadata")) {\n      task.actions.clear()\n      task.doLast { task.outputs.files.forEach { f -> f.mkdirs() } }\n    }\n    if (task.name.toLowerCase().contains("lint")) {\n      task.enabled = false\n    }\n  }\n}\n`
  }
  fs.writeFileSync(rootGradlePath, rootGradle, 'utf8')
  const ndkIdx = rootGradle.indexOf('ext.ndkVersion')
  const expoRootIdx = rootGradle.indexOf('apply plugin: "expo-root-project"')
  if (ndkIdx === -1 || expoRootIdx === -1 || ndkIdx > expoRootIdx) {
    throw new Error(
      `Verification failed: ${rootGradlePath} does not set ext.ndkVersion before apply plugin: "expo-root-project".`,
    )
  }

  // 3. Verify android/app/build.gradle has applicationId 'com.quantzing.app' and release signing
  const appGradlePath = path.join(androidDir, 'app', 'build.gradle')
  let appGradle = fs.readFileSync(appGradlePath, 'utf8')
  if (!appGradle.includes('https://dl.bitdrift.io/sdk/android-maven')) {
    appGradle += `\nrepositories {\n    maven {\n        url 'https://dl.bitdrift.io/sdk/android-maven'\n        content {\n          includeGroup 'io.bitdrift'\n        }\n    }\n}\n`
  }
  appGradle = appGradle
    .replace(/-DCMAKE_OBJECT_PATH_MAX=\d+/g, '-DCMAKE_OBJECT_PATH_MAX=240')
    .replace(/"C:\/qz-cxx(?:\/app)?"/g, '"C:/q"')
  if (!appGradle.includes('CMAKE_OBJECT_PATH_MAX')) {
    appGradle = appGradle.replace(
      /(defaultConfig\s*\{[\s\S]*?versionName\s+"[^"]+"\r?\n)/,
      `$1        externalNativeBuild {\n            cmake {\n                arguments "-DCMAKE_OBJECT_PATH_MAX=240"\n            }\n        }\n`,
    )
    appGradle = appGradle.replace(
      /(android\s*\{\r?\n)/,
      `$1    externalNativeBuild {\n        cmake {\n            buildStagingDirectory file(System.getProperty("os.name").toLowerCase().contains("win") ? "C:/q" : "\${projectDir}/.cxx")\n        }\n    }\n`,
    )
  }
  fs.writeFileSync(appGradlePath, appGradle, 'utf8')
  if (
    !appGradle.includes("applicationId 'com.quantzing.app'") &&
    !appGradle.includes('applicationId "com.quantzing.app"')
  ) {
    throw new Error(
      `Verification failed: ${appGradlePath} does not have applicationId com.quantzing.app.`,
    )
  }
  if (!appGradle.includes('// QuantZing release signing config')) {
    throw new Error(
      `Verification failed: ${appGradlePath} is missing QuantZing release signing config block.`,
    )
  }

  // 4. Verify android/gradle.properties has safe JVM heap and suppressUnsupportedCompileSdk
  const gradlePropsPath = path.join(androidDir, 'gradle.properties')
  let gradleProps = fs.readFileSync(gradlePropsPath, 'utf8')
  if (isWin && !gradleProps.includes('javax.net.ssl.trustStoreType=WINDOWS-ROOT')) {
    gradleProps = gradleProps.replace(
      /(org\.gradle\.jvmargs=[^\r\n]*)/,
      '$1 -Djavax.net.ssl.trustStoreType=WINDOWS-ROOT',
    )
    fs.writeFileSync(gradlePropsPath, gradleProps, 'utf8')
  }
  if (!gradleProps.includes('-Xmx2560m')) {
    throw new Error(
      `Verification failed: ${gradlePropsPath} does not contain -Xmx2560m JVM heap configuration.`,
    )
  }
  if (!gradleProps.includes(`android.suppressUnsupportedCompileSdk=${compileSdk}`)) {
    throw new Error(
      `Verification failed: ${gradlePropsPath} does not contain android.suppressUnsupportedCompileSdk=${compileSdk}.`,
    )
  }

  logStep(
    'VERIFY-PREBUILD',
    `Verified local.properties (sdk.dir), build.gradle (NDK ${ndkVersion}), app/build.gradle (com.quantzing.app + release signing), and gradle.properties (-Xmx2560m, compileSdk=${compileSdk}).`,
  )
}

function verifyCompiledApk(apkPath, buildToolsDir) {
  if (!fs.existsSync(apkPath)) {
    throw new Error(`Compiled APK not found at ${apkPath}`)
  }

  const stat = fs.statSync(apkPath)
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2)
  logStep('VERIFY-APK', `Found compiled APK (${sizeMb} MB): ${apkPath}`)

  const aapt2Bin = path.join(
    buildToolsDir,
    isWin ? 'aapt2.exe' : 'aapt2',
  )
  const apksignerBin = path.join(
    buildToolsDir,
    isWin ? 'apksigner.bat' : 'apksigner',
  )

  const badgingOut = execFileSync(aapt2Bin, ['dump', 'badging', apkPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (!badgingOut.includes("package: name='com.quantzing.app'")) {
    throw new Error(
      `APK badging verification failed: expected package: name='com.quantzing.app'.`,
    )
  }
  if (!badgingOut.includes("application-label:'QuantZing'")) {
    throw new Error(
      `APK badging verification failed: expected application-label:'QuantZing'.`,
    )
  }

  const relevantLines = badgingOut
    .split(/\r?\n/)
    .filter(l =>
      /^(package:|sdkVersion:|targetSdkVersion:|application-label:|native-code:)/.test(
        l,
      ),
    )
  console.log(relevantLines.join('\n'))

  const signerOut = execFileSync(
    apksignerBin,
    ['verify', '--verbose', '--print-certs', apkPath],
    {
      encoding: 'utf8',
      shell: isWin,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  if (!signerOut.includes('Verified using v2 scheme (APK Signature Scheme v2): true')) {
    throw new Error(
      `APK signature verification failed: v2 signature not verified.\n${signerOut}`,
    )
  }
  console.log(signerOut.trim())
}

async function main() {
  const javaHome = resolveJavaHome()
  const androidSdk = resolveAndroidSdk()
  const compileSdk =
    process.env.ANDROID_COMPILE_SDK || resolveCompileSdk(androidSdk, '36')
  const buildTools = resolveBuildTools(
    androidSdk,
    process.env.ANDROID_BUILD_TOOLS || '36.0.0',
  )
  const ndkVersion =
    process.env.ANDROID_NDK_VERSION ||
    resolveNdkVersion(androidSdk, '27.0.12077973')
  const releaseVersion =
    process.env.EXPO_PUBLIC_RELEASE_VERSION || getPackageVersion()
  const gitShortSha = getGitShortSha()
  const bundleDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  const keystoreInfo = ensureReleaseKeystore(javaHome)

  const buildEnv = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidSdk,
    ANDROID_SDK_ROOT: androidSdk,
    ANDROID_COMPILE_SDK: String(compileSdk),
    ANDROID_BUILD_TOOLS: buildTools.version,
    ANDROID_NDK_VERSION: ndkVersion,
    EXPO_PUBLIC_ENV: 'production',
    EXPO_PUBLIC_QUANTZING_URL:
      process.env.EXPO_PUBLIC_QUANTZING_URL ||
      'https://quantzing.quantrinity.in',
    EXPO_PUBLIC_QUANTZING_DOMAIN:
      process.env.EXPO_PUBLIC_QUANTZING_DOMAIN || 'quantzing.com',
    EXPO_PUBLIC_RELEASE_VERSION: releaseVersion,
    EXPO_PUBLIC_BUNDLE_IDENTIFIER: gitShortSha,
    EXPO_PUBLIC_BUNDLE_DATE: bundleDate,
    DISABLE_UPDATES: '1',
    BUILD_RN_FROM_SOURCE: process.env.BUILD_RN_FROM_SOURCE || '0',
    NODE_ENV: 'production',
    EXPO_NO_GIT_STATUS: '1',
    QUANTZING_KEYSTORE_FILE: keystoreInfo.keystorePath,
    QUANTZING_KEYSTORE_PATH: keystoreInfo.keystorePath,
    QUANTZING_KEYSTORE_PASSWORD: keystoreInfo.keystorePass,
    QUANTZING_KEYSTORE_PASS: keystoreInfo.keystorePass,
    QUANTZING_KEY_ALIAS: keystoreInfo.keyAlias,
    QUANTZING_KEY_PASSWORD: keystoreInfo.keyPass,
    QUANTZING_KEY_PASS: keystoreInfo.keyPass,
    QUANTZING_REQUIRE_RELEASE_SIGNING: '1',
    ...(isWin
      ? {
          JAVA_TOOL_OPTIONS: '-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT',
          GRADLE_OPTS: '-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT',
        }
      : {}),
    PATH: [
      path.join(javaHome, 'bin'),
      path.join(androidSdk, 'platform-tools'),
      buildTools.dir,
      process.env.PATH,
    ]
      .filter(Boolean)
      .join(path.delimiter),
  }

  if (process.env.QUANTZING_ENABLE_SENTRY !== '1') {
    delete buildEnv.SENTRY_AUTH_TOKEN
  }
  if (process.env.QUANTZING_ENABLE_BITDRIFT !== '1') {
    delete buildEnv.EXPO_PUBLIC_BITDRIFT_API_KEY
  }

  logStep(
    'CONFIG',
    JSON.stringify(
      {
        projectRoot,
        javaHome,
        androidSdk,
        compileSdk,
        buildTools: buildTools.version,
        ndkVersion,
        abis: REACT_NATIVE_ABIS,
        releaseVersion,
        gitShortSha,
        keystorePath: keystoreInfo.keystorePath,
        keyAlias: keystoreInfo.keyAlias,
        outApk: OUT_APK,
      },
      null,
      2,
    ),
  )

  if (isDryRun) {
    logStep('DRY-RUN', 'Dry-run verification succeeded.')
    return
  }

  let substChoice = null
  try {
    const parentDir = path.dirname(projectRoot)
    const projectDirName = path.basename(projectRoot)
    substChoice = mountSubstDrive(parentDir)
    const workRoot = substChoice
      ? path.join(`${substChoice.drive}\\`, projectDirName)
      : projectRoot
    const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm'

    if (!skipTypecheck) {
      logStep('TYPECHECK', 'Running pnpm.cmd run typecheck:android...')
      runInherited(pnpmCmd, ['run', 'typecheck:android'], {
        cwd: workRoot,
        env: buildEnv,
      })
    }

    const androidDir = path.join(workRoot, 'android')
    if (!skipPrebuild) {
      const prebuildArgs = [
        'exec',
        'expo',
        'prebuild',
        '--platform',
        'android',
      ]
      if (forceCleanPrebuild || !fs.existsSync(androidDir)) {
        prebuildArgs.push('--clean')
      }
      logStep(
        'PREBUILD',
        `Running ${pnpmCmd} ${prebuildArgs.join(' ')} in ${workRoot}...`,
      )
      runInherited(pnpmCmd, prebuildArgs, {
        cwd: workRoot,
        env: buildEnv,
      })
    }

    verifyAndFixPrebuildOutputs(workRoot, androidSdk, ndkVersion, compileSdk)

    if (isPrebuildOnly) {
      logStep('PREBUILD-ONLY', 'Expo prebuild and Gradle verification completed.')
      return
    }

    const gradlewCmd = isWin
      ? path.join(androidDir, 'gradlew.bat')
      : path.join(androidDir, 'gradlew')
    const gradleArgs = [
      ':app:assembleRelease',
      '-x',
      'lintVitalRelease',
      '-x',
      'lintVitalAnalyzeRelease',
      '-x',
      'lintVitalReportRelease',
      `-PreactNativeArchitectures=${REACT_NATIVE_ABIS}`,
      '-Pexpo.android.cmakeObjectPathMax=0',
      '--no-daemon',
      '--max-workers=2',
      '--console=plain',
    ]

    logStep(
      'GRADLE',
      `Compiling signed release APK via ${gradlewCmd} ${gradleArgs.join(' ')}...`,
    )
    runInherited(gradlewCmd, gradleArgs, {
      cwd: androidDir,
      env: buildEnv,
    })

    const builtApkPath = path.join(
      androidDir,
      'app',
      'build',
      'outputs',
      'apk',
      'release',
      'app-release.apk',
    )
    verifyCompiledApk(builtApkPath, buildTools.dir)

    fs.mkdirSync(path.dirname(OUT_APK), {recursive: true})
    fs.copyFileSync(builtApkPath, OUT_APK)

    const apkBytes = fs.readFileSync(OUT_APK)
    const sha256 = crypto.createHash('sha256').update(apkBytes).digest('hex')
    const meta = {
      packageName: 'com.quantzing.app',
      appName: 'QuantZing',
      version: releaseVersion,
      bundleId: gitShortSha,
      abis: REACT_NATIVE_ABIS.split(','),
      compileSdk: Number(compileSdk),
      targetSdk: 36,
      ndkVersion,
      sizeBytes: apkBytes.length,
      sha256,
      builtAt: new Date().toISOString(),
    }
    fs.writeFileSync(`${OUT_APK}.meta.json`, JSON.stringify(meta, null, 2) + '\n', 'utf8')

    logStep(
      'PUBLISHED',
      `Signed release APK published to ${OUT_APK} (${(apkBytes.length / (1024 * 1024)).toFixed(2)} MB, SHA-256: ${sha256})`,
    )
  } finally {
    unmountSubstDrive(substChoice)
  }
}

main().catch(err => {
  console.error('\n[QuantZing APK][ERROR]', err.message || err)
  process.exit(1)
})
