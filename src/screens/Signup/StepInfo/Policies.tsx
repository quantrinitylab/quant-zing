import {useCallback} from 'react'

import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {atoms as a, useTheme} from '#/alf'
import {InlineLinkText} from '#/components/Link'
import {Text} from '#/components/Typography'
import {type com} from '#/lexicons'

export const Policies = ({
  serviceDescription: _serviceDescription,
}: {
  serviceDescription?: com.atproto.server.describeServer.$OutputBody
}) => {
  const t = useTheme()
  const {setShowLoggedOut, clearRequestedAccount} = useLoggedOutViewControls()

  const onPressLegalLink = useCallback(() => {
    clearRequestedAccount()
    setShowLoggedOut(false)
  }, [clearRequestedAccount, setShowLoggedOut])

  return (
    <Text style={[a.leading_snug, t.atoms.text_contrast_medium]}>
      By creating an account you agree to the{' '}
      <InlineLinkText
        label="Read the QuantZing Terms of Service"
        key="tos"
        to="/terms"
        onPress={onPressLegalLink}>
        Terms of Service
      </InlineLinkText>{' '}
      and{' '}
      <InlineLinkText
        label="Read the QuantZing Privacy Policy"
        key="pp"
        to="/privacy"
        onPress={onPressLegalLink}>
        Privacy Policy
      </InlineLinkText>
      .
    </Text>
  )
}
