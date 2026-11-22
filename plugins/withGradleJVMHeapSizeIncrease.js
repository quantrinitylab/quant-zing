const {withGradleProperties} = require('expo/config-plugins')

function setGradlePropertiesValue(config, key, value) {
  return withGradleProperties(config, exportedConfig => {
    const keyIdx = exportedConfig.modResults.findIndex(
      item => item.type === 'property' && item.key === key,
    )
    if (keyIdx >= 0) {
      exportedConfig.modResults.splice(keyIdx, 1, {
        type: 'property',
        key,
        value,
      })
    } else {
      exportedConfig.modResults.push({
        type: 'property',
        key,
        value,
      })
    }

    return exportedConfig
  })
}

module.exports = function withGradleJVMHeapSizeIncrease(config) {
  const defaultJvmArgs =
    process.platform === 'win32'
      ? '-Xmx2560m -XX:MaxMetaspaceSize=768m -Djavax.net.ssl.trustStoreType=WINDOWS-ROOT'
      : '-Xmx2560m -XX:MaxMetaspaceSize=768m'
  config = setGradlePropertiesValue(
    config,
    'org.gradle.jvmargs',
    process.env.QUANTZING_GRADLE_JVMARGS || defaultJvmArgs,
  )

  return config
}
