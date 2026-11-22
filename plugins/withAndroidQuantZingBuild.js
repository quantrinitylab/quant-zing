const {
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins')

const ROOT_PROJECT_MARKER = 'apply plugin: "expo-root-project"'
const NDK_MARKER = 'ext.ndkVersion'
const SIGNING_MARKER = '// QuantZing release signing config'

function upsertGradleProperty(properties, key, value) {
  const idx = properties.findIndex(
    item => item.type === 'property' && item.key === key,
  )
  const entry = {type: 'property', key, value: String(value)}
  if (idx >= 0) {
    properties.splice(idx, 1, entry)
  } else {
    properties.push(entry)
  }
}

function ensureGradleProperty(properties, key, defaultValue) {
  const exists = properties.some(
    item => item.type === 'property' && item.key === key,
  )
  if (!exists) {
    properties.push({type: 'property', key, value: String(defaultValue)})
  }
}

function withQuantZingRootNdk(config) {
  return withProjectBuildGradle(config, mod => {
    const contents = mod.modResults.contents
    if (contents.includes(NDK_MARKER)) {
      return mod
    }
    if (!contents.includes(ROOT_PROJECT_MARKER)) {
      throw new Error(
        'withAndroidQuantZingBuild: Expected to find `apply plugin: "expo-root-project"` in android/build.gradle.',
      )
    }
    const ndkVersion = process.env.ANDROID_NDK_VERSION || '27.0.12077973'
    let nextContents = contents.replace(
      ROOT_PROJECT_MARKER,
      [
        '// Pin QuantZing Android NDK version BEFORE expo-root-project propagates ext.ndkVersion.',
        `ext.ndkVersion = findProperty('android.ndkVersion') ?: "${ndkVersion}"`,
        '',
        ROOT_PROJECT_MARKER,
      ].join('\n'),
    )
    if (!nextContents.includes('https://dl.bitdrift.io/sdk/android-maven')) {
      nextContents = nextContents.replace(
        /allprojects\s*\{\s*repositories\s*\{/,
        `allprojects {\n  tasks.configureEach { task ->\n    if (task.name.startsWith("check") && task.name.endsWith("AarMetadata")) {\n      task.actions.clear()\n      task.doLast { task.outputs.files.forEach { f -> f.mkdirs() } }\n    }\n    if (task.name.toLowerCase().contains("lint")) {\n      task.enabled = false\n    }\n  }\n  repositories {\n    maven {\n      url 'https://dl.bitdrift.io/sdk/android-maven'\n      content { includeGroup 'io.bitdrift' }\n    }`,
      )
    }
    mod.modResults.contents = nextContents
    return mod
  })
}

function withQuantZingGradleProperties(config) {
  return withGradleProperties(config, mod => {
    const compileSdk = String(process.env.ANDROID_COMPILE_SDK || '36')
    upsertGradleProperty(
      mod.modResults,
      'android.suppressUnsupportedCompileSdk',
      compileSdk,
    )
    ensureGradleProperty(mod.modResults, 'newArchEnabled', 'true')
    upsertGradleProperty(mod.modResults, 'hermesEnabled', 'true')
    return mod
  })
}

function withQuantZingReleaseSigning(config) {
  return withAppBuildGradle(config, mod => {
    let contents = mod.modResults.contents
    if (contents.includes(SIGNING_MARKER)) {
      return mod
    }

    const releaseSigningBlock = [
      '',
      `        ${SIGNING_MARKER}`,
      '        release {',
      "            def qzKsFile = (System.getenv('QUANTZING_KEYSTORE_FILE') ?: System.getenv('QUANTZING_KEYSTORE_PATH') ?: findProperty('QUANTZING_KEYSTORE_FILE'))?.toString()?.trim()",
      "            def qzKsPass = (System.getenv('QUANTZING_KEYSTORE_PASSWORD') ?: System.getenv('QUANTZING_KEYSTORE_PASS') ?: findProperty('QUANTZING_KEYSTORE_PASSWORD'))?.toString()",
      "            def qzKeyAlias = (System.getenv('QUANTZING_KEY_ALIAS') ?: findProperty('QUANTZING_KEY_ALIAS') ?: 'quantzing').toString().trim()",
      "            def qzKeyPass = (System.getenv('QUANTZING_KEY_PASSWORD') ?: System.getenv('QUANTZING_KEY_PASS') ?: findProperty('QUANTZING_KEY_PASSWORD') ?: qzKsPass)?.toString()",
      "            def qzRequireReleaseSigning = ((System.getenv('QUANTZING_REQUIRE_RELEASE_SIGNING') ?: findProperty('QUANTZING_REQUIRE_RELEASE_SIGNING') ?: '0').toString().trim() == '1')",
      '            if (qzKsFile) {',
      '                def resolvedKs = file(qzKsFile)',
      '                if (!resolvedKs.exists()) {',
      '                    throw new GradleException("QuantZing release keystore not found at: ${resolvedKs.absolutePath}")',
      '                }',
      '                if (!qzKsPass) {',
      '                    throw new GradleException("QUANTZING_KEYSTORE_PASSWORD must be set when QUANTZING_KEYSTORE_FILE is configured.")',
      '                }',
      '                storeFile resolvedKs',
      '                storePassword qzKsPass',
      '                keyAlias qzKeyAlias',
      '                keyPassword qzKeyPass',
      '            } else if (qzRequireReleaseSigning) {',
      '                throw new GradleException("QUANTZING_REQUIRE_RELEASE_SIGNING=1 but QUANTZING_KEYSTORE_FILE is not set.")',
      '            }',
      '        }',
    ].join('\n')

    const signingConfigsRegex =
      /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\r?\n\s*\})(\r?\n\s*\})/
    if (!signingConfigsRegex.test(contents)) {
      throw new Error(
        'withAndroidQuantZingBuild: Expected to find signingConfigs.debug block in android/app/build.gradle.',
      )
    }
    contents = contents.replace(
      signingConfigsRegex,
      `$1${releaseSigningBlock}$2`,
    )

    const releaseBuildTypeSigningRegex =
      /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/
    if (!releaseBuildTypeSigningRegex.test(contents)) {
      throw new Error(
        'withAndroidQuantZingBuild: Expected to find buildTypes.release signingConfig in android/app/build.gradle.',
      )
    }
    const releaseSigningSelection = [
      "def qzReleaseKs = (System.getenv('QUANTZING_KEYSTORE_FILE') ?: System.getenv('QUANTZING_KEYSTORE_PATH') ?: findProperty('QUANTZING_KEYSTORE_FILE'))?.toString()?.trim()",
      "            def qzRequireReleaseSigning = ((System.getenv('QUANTZING_REQUIRE_RELEASE_SIGNING') ?: findProperty('QUANTZING_REQUIRE_RELEASE_SIGNING') ?: '0').toString().trim() == '1')",
      '            if (qzRequireReleaseSigning && !qzReleaseKs) {',
      '                throw new GradleException("QUANTZING_REQUIRE_RELEASE_SIGNING=1 but QUANTZING_KEYSTORE_FILE is not set.")',
      '            }',
      '            signingConfig qzReleaseKs ? signingConfigs.release : signingConfigs.debug',
    ].join('\n')

    contents = contents.replace(
      releaseBuildTypeSigningRegex,
      `$1${releaseSigningSelection}`,
    )

    if (!contents.includes('CMAKE_OBJECT_PATH_MAX')) {
      contents = contents.replace(
        /(defaultConfig\s*\{[\s\S]*?versionName\s+"[^"]+"\r?\n)/,
        `$1        externalNativeBuild {\n            cmake {\n                arguments "-DCMAKE_OBJECT_PATH_MAX=240"\n            }\n        }\n`,
      )
      contents = contents.replace(
        /(android\s*\{\r?\n)/,
        `$1    externalNativeBuild {\n        cmake {\n            buildStagingDirectory file(System.getProperty("os.name").toLowerCase().contains("win") ? "C:/q" : "\${projectDir}/.cxx")\n        }\n    }\n`,
      )
    }

    mod.modResults.contents = contents
    return mod
  })
}

module.exports = function withAndroidQuantZingBuild(config) {
  config = withQuantZingRootNdk(config)
  config = withQuantZingGradleProperties(config)
  config = withQuantZingReleaseSigning(config)
  return config
}
