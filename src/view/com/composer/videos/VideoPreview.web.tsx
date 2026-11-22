import {useState} from 'react'
import {View} from 'react-native'
import {type ImagePickerAsset} from 'expo-image-picker'
import {Trans} from '@lingui/react/macro'

import {type CompressedVideo} from '#/lib/media/video/types'
import {logger} from '#/logger'
import {useAutoplayDisabled} from '#/state/preferences'
import {ExternalEmbedRemoveBtn} from '#/view/com/composer/ExternalEmbedRemoveBtn'
import {atoms as a, useBreakpoints} from '#/alf'
import {Text} from '#/components/Typography'
import {PlayButtonIcon} from '#/components/video/PlayButtonIcon'

export function VideoPreview({
  asset,
  video,
  clear,
}: {
  asset: ImagePickerAsset
  video: CompressedVideo
  isActivePost: boolean
  clear: () => void
}) {
  // TODO: figure out how to pause a GIF for reduced motion
  // it's not possible using an img tag -sfn
  const autoplayDisabled = useAutoplayDisabled()
  const {gtMobile} = useBreakpoints()
  const [previewFailed, setPreviewFailed] = useState(false)

  const maxH = gtMobile ? 300 : 210
  let previewHeight = maxH
  if (asset.width && asset.height && asset.width > asset.height) {
    const landscapeH = Math.round((asset.height / asset.width) * (gtMobile ? 480 : 320))
    if (Number.isFinite(landscapeH) && landscapeH >= 150) {
      previewHeight = Math.min(maxH, landscapeH)
    }
  }

  return (
    <View style={[a.pt_xs]}>
      <View
        style={[
          a.w_full,
          a.rounded_md,
          a.overflow_hidden,
          a.relative,
          {
            backgroundColor: '#000000',
            height: previewHeight,
          },
        ]}>
          {video.mimeType === 'image/gif' ? (
            <img
              src={video.uri}
              style={{width: '100%', height: '100%', objectFit: 'contain'}}
              alt="GIF"
            />
          ) : previewFailed ? (
            <View style={[a.flex_1, a.justify_center, a.align_center, a.px_lg]}>
              <Text
                style={[
                  a.text_sm,
                  a.leading_snug,
                  a.text_center,
                  {color: 'white'},
                ]}>
                <Trans>
                  This video can’t be previewed in your browser. It will still
                  be uploaded.
                </Trans>
              </Text>
            </View>
          ) : (
            <>
              <video
                src={video.uri}
                style={{width: '100%', height: '100%', objectFit: 'contain'}}
                autoPlay={!autoplayDisabled}
                loop
                muted
                playsInline
                onError={e => {
                  /*
                   * A preview render failure must not remove the video. The
                   * upload is already in flight, and clearing here aborts it
                   * even though the compressed file may be perfectly valid.
                   */
                  const mediaError = e.currentTarget.error
                  logger.error('Video preview failed to render', {
                    safeMessage: mediaError
                      ? `code ${mediaError.code}: ${mediaError.message}`
                      : 'unknown media error',
                  })
                  setPreviewFailed(true)
                }}
              />
              {autoplayDisabled && (
                <View
                  style={[
                    a.absolute,
                    a.inset_0,
                    a.justify_center,
                    a.align_center,
                  ]}>
                  <PlayButtonIcon />
                </View>
              )}
            </>
          )}
          <ExternalEmbedRemoveBtn onRemove={clear} />
      </View>
    </View>
  )
}
