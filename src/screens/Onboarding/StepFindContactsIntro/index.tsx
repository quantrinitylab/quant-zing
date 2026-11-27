import {View} from 'react-native'
import * as Contacts from 'expo-contacts/legacy'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQuery} from '@tanstack/react-query'

import {urls} from '#/lib/constants'
import {useCallOnce} from '#/lib/once'
import {atoms as a} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonText} from '#/components/Button'
import {ContactsHeroImage} from '#/components/contacts/components/HeroImage'
import {InlineLinkText} from '#/components/Link'
import {useAnalytics} from '#/analytics'
import {
  OnboardingControls,
  OnboardingDescriptionText,
  OnboardingPosition,
  OnboardingTitleText,
} from '../Layout'
import {useOnboardingInternalState} from '../state'

export function StepFindContactsIntro() {
  const ax = useAnalytics()
  const {_} = useLingui()
  const {dispatch} = useOnboardingInternalState()

  useCallOnce(() => {
    ax.metric('onboarding:contacts:presented', {})
  })()

  const {data: isAvailable, isSuccess} = useQuery({
    queryKey: ['contacts-available'],
    queryFn: async () => {
      try {
        return await Contacts.isAvailableAsync()
      } catch {
        return false
      }
    },
  })

  return (
    <View style={[a.w_full, a.gap_sm]}>
      <OnboardingPosition />
      <ContactsHeroImage />
      <OnboardingTitleText style={[a.mt_sm]}>
        <Trans>QuantZing is more fun with friends</Trans>
      </OnboardingTitleText>
      <OnboardingDescriptionText>
        <Trans>
          Find your friends on QuantZing by verifying your phone number and
          matching with your contacts. We protect your information and you
          control what happens next.{' '}
          <InlineLinkText
            to={urls.website.blog.findFriendsAnnouncement}
            label={_(
              msg({
                message: `Learn more about importing contacts`,
                context: `english-only-resource`,
              }),
            )}
            style={[a.text_md, a.leading_snug]}>
            <Trans context="english-only-resource">Learn more</Trans>
          </InlineLinkText>
        </Trans>
      </OnboardingDescriptionText>
      {!isAvailable && isSuccess && (
        <Admonition type="info">
          <Trans>
            Contact sync is optional. You can continue to explore QuantZing or
            browse suggested accounts to follow.
          </Trans>
        </Admonition>
      )}

      <OnboardingControls.Portal>
        <View style={[a.gap_md]}>
          {isAvailable ? (
            <Button
              onPress={() => dispatch({type: 'next'})}
              label={_(msg`Import contacts`)}
              size="large"
              color="primary">
              <ButtonText>
                <Trans>Import contacts</Trans>
              </ButtonText>
            </Button>
          ) : (
            <Button
              onPress={() => dispatch({type: 'skip-contacts'})}
              label={_(msg`Browse suggested people`)}
              size="large"
              color="primary">
              <ButtonText>
                <Trans>Browse suggested people</Trans>
              </ButtonText>
            </Button>
          )}
          <Button
            onPress={() => dispatch({type: 'skip-contacts'})}
            label={_(msg`Skip`)}
            size="large"
            color="secondary">
            <ButtonText>
              <Trans>Skip</Trans>
            </ButtonText>
          </Button>
        </View>
      </OnboardingControls.Portal>
    </View>
  )
}
