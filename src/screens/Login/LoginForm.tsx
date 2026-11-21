import {useMemo, useRef, useState} from 'react'
import {Keyboard, type TextInput, View} from 'react-native'
import {LexAuthFactorError} from '@atproto/lex-password-session'
import {Trans, useLingui} from '@lingui/react/macro'

import {HITSLOP_10} from '#/lib/constants'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {getQuantZingColors} from '#/lib/quantos/client'
import {cleanError, isNetworkError} from '#/lib/strings/errors'
import {createFullHandle} from '#/lib/strings/handles'
import {checkAndFormatResetCode} from '#/lib/strings/password'
import {logger} from '#/logger'
import {useSetHasCheckedForStarterPack} from '#/state/preferences/used-starter-packs'
import {useSessionApi} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import * as Admonition from '#/components/Admonition'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {TokenField} from '#/components/dialogs/EmailDialog/components/TokenField'
import {PasswordField} from '#/components/forms/PasswordField'
import * as TextField from '#/components/forms/TextField'
import {At_Stroke2_Corner0_Rounded as AtIcon} from '#/components/icons/At'
import {Envelope_Stroke2_Corner0_Rounded as EmailIcon} from '#/components/icons/Envelope'
import {createStaticClick, InlineLinkText} from '#/components/Link'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {IS_IOS} from '#/env'
import {type com} from '#/lexicons'
import {FormContainer} from './FormContainer'

type ServiceDescription = com.atproto.server.describeServer.$OutputBody

const DEFAULT_QUANTZING_DOMAIN = '.quantzing.com'

export const LoginForm = ({
  error,
  serviceUrl,
  serviceDescription,
  initialHandle,
  setError,
  setServiceUrl: _setServiceUrl,
  onPressRetryConnect,
  onPressBack,
  onPressForgotPassword,
  onAttemptSuccess,
  onAttemptFailed,
  onPressCreateAccount,
}: {
  error: string
  serviceUrl: string
  serviceDescription: ServiceDescription | undefined
  initialHandle: string
  setError: (v: string) => void
  setServiceUrl?: (v: string) => void
  onPressRetryConnect: () => void
  onPressBack: () => void
  onPressForgotPassword: () => void
  onAttemptSuccess: () => void
  onAttemptFailed: () => void
  onPressCreateAccount: () => void
}) => {
  const t = useTheme()
  const colors = useMemo(
    () => getQuantZingColors(t.scheme === 'dark'),
    [t.scheme],
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorField, setErrorField] = useState<
    'none' | 'identifier' | 'password' | '2fa'
  >('none')
  const [isAuthFactorTokenNeeded, setIsAuthFactorTokenNeeded] = useState(false)
  const [identifier, setIdentifier] = useState(initialHandle || '')
  const [password, setPassword] = useState('')
  const [authFactorToken, setAuthFactorToken] = useState('')
  const identifierRef = useRef<React.ComponentRef<typeof TextInput>>(null)
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null)
  const hasFocusedOnce = useRef(false)
  const {t: l} = useLingui()
  const {login} = useSessionApi()
  const requestNotificationsPermission = useRequestNotificationsPermission()
  const {setShowLoggedOut, clearRequestedAccount} = useLoggedOutViewControls()
  const setHasCheckedForStarterPack = useSetHasCheckedForStarterPack()
  const {gtMobile} = useBreakpoints()

  const trimmedIdentifier = identifier.trim()
  const isEmailInput =
    trimmedIdentifier.includes('@') && !trimmedIdentifier.startsWith('@')

  const attemptLogin = async (service: string, fullIdent: string) => {
    setIsProcessing(true)

    try {
      await login(
        {
          service,
          identifier: fullIdent,
          password,
          authFactorToken:
            checkAndFormatResetCode(authFactorToken) || authFactorToken.trim(),
        },
        'LoginForm',
      )
      onAttemptSuccess()
      clearRequestedAccount()
      setShowLoggedOut(false)
      setHasCheckedForStarterPack(true)
      void requestNotificationsPermission('Login')
    } catch (err) {
      const errMsg = String(err)
      setIsProcessing(false)
      /*
       * `LexAuthFactorError` is what `PasswordSession.login` throws when the
       * server demands an email 2FA token.
       */
      if (err instanceof LexAuthFactorError) {
        setIsAuthFactorTokenNeeded(true)
      } else {
        onAttemptFailed()
        if (errMsg.includes('Token is invalid')) {
          logger.debug('Failed to login due to invalid 2fa token', {
            error: errMsg,
          })
          setError(l`Invalid 2FA confirmation code.`)
          setErrorField('2fa')
        } else if (
          errMsg.includes('Authentication Required') ||
          errMsg.includes('Invalid identifier or password')
        ) {
          logger.debug('Failed to login due to invalid credentials', {
            error: errMsg,
          })
          setError(l`Incorrect username or password`)
        } else if (isNetworkError(err)) {
          logger.warn('Failed to login due to network error', {error: errMsg})
          setError(
            'Unable to contact QuantZing servers. Please check your connection and try again.',
          )
        } else {
          logger.warn('Failed to login', {error: errMsg})
          /* the error object, not its stringification: cleanError only
           * extracts the clean server message from a live LexError */
          setError(cleanError(err))
        }
      }
    }
  }

  const onPressNext = async () => {
    if (isProcessing) return
    Keyboard.dismiss()
    setError('')
    setErrorField('none')

    const normalizedIdentifier = identifier
      .toLowerCase()
      .trim()
      .replace(/^@/, '')

    if (!normalizedIdentifier) {
      setError('Please enter your handle or email.')
      setErrorField('identifier')
      return
    }

    if (!password) {
      setError(l`Please enter your password`)
      setErrorField('password')
      return
    }

    // Expand bare usernames to the primary QuantZing handle domain
    let fullIdent = normalizedIdentifier
    if (
      !normalizedIdentifier.includes('@') && // not an email
      !normalizedIdentifier.includes('.') && // not a domain
      !normalizedIdentifier.startsWith('did:') // not a DID
    ) {
      const primaryDomain =
        serviceDescription?.availableUserDomains?.[0] ||
        DEFAULT_QUANTZING_DOMAIN
      fullIdent = createFullHandle(normalizedIdentifier, primaryDomain)
    }

    await attemptLogin(serviceUrl, fullIdent)
  }

  return (
    <FormContainer testID="loginForm" titleText="Sign in to QuantZing">
      {gtMobile && (
        <View style={[a.pb_sm]}>
          <Text style={[a.text_3xl, a.font_bold, {color: colors.text}]}>
            Sign in to QuantZing
          </Text>
        </View>
      )}

      <View>
        <TextField.LabelText>Handle or email</TextField.LabelText>
        <TextField.Root isInvalid={errorField === 'identifier'}>
          <TextField.Icon icon={isEmailInput ? EmailIcon : AtIcon} />
          <TextField.Input
            testID="loginUsernameInput"
            inputRef={identifierRef}
            label="Handle or email"
            placeholder="Handle or email (e.g. you.quantzing.com)"
            autoCapitalize="none"
            autoFocus={!IS_IOS && !initialHandle}
            autoCorrect={false}
            autoComplete="username"
            returnKeyType="next"
            textContentType="username"
            value={identifier}
            onChangeText={v => {
              setIdentifier(v)
              if (errorField) setErrorField('none')
            }}
            onSubmitEditing={() => {
              passwordRef.current?.focus()
            }}
            blurOnSubmit={false} // prevents flickering due to onSubmitEditing going to next field
            editable={!isProcessing}
            accessibilityHint="Enter your QuantZing handle or email address"
          />
        </TextField.Root>
      </View>

      <View>
        <TextField.LabelText>
          <Trans>Password</Trans>
        </TextField.LabelText>
        <PasswordField
          isInvalid={errorField === 'password'}
          testID="loginPasswordInput"
          inputRef={passwordRef}
          label={l`Password`}
          placeholder="Enter your password"
          autoFocus={!IS_IOS && !!initialHandle}
          autoComplete="current-password"
          returnKeyType="done"
          enablesReturnKeyAutomatically={true}
          value={password}
          onChangeText={v => {
            setPassword(v)
            if (errorField) setErrorField('none')
          }}
          onSubmitEditing={() => void onPressNext()}
          blurOnSubmit={false} // HACK: https://github.com/facebook/react-native/issues/21911#issuecomment-558343069 Keyboard blur behavior is now handled in onSubmitEditing
          editable={!isProcessing}
          accessibilityHint={l`Enter your password`}
          onLayout={
            IS_IOS
              ? () => {
                  if (hasFocusedOnce.current) return
                  hasFocusedOnce.current = true
                  if (initialHandle) {
                    passwordRef.current?.focus()
                  } else {
                    identifierRef.current?.focus()
                  }
                }
              : undefined
          }
        />

        {!isAuthFactorTokenNeeded && (
          <Button
            label={l`Forgot password?`}
            accessibilityHint={l`Reset your password by sending a code to your email`}
            style={[a.mt_md, a.self_start]}
            hoverStyle={{opacity: 0.5}}
            hitSlop={HITSLOP_10}
            onPress={onPressForgotPassword}>
            <ButtonText style={[t.atoms.text_contrast_medium]}>
              <Trans>Forgot password?</Trans>
            </ButtonText>
          </Button>
        )}
      </View>

      {isAuthFactorTokenNeeded && (
        <View>
          <TextField.LabelText>
            <Trans>2FA Confirmation</Trans>
          </TextField.LabelText>
          <TokenField
            testID="loginAuthFactorTokenInput"
            autoFocus
            autoComplete="one-time-code"
            returnKeyType="done"
            blurOnSubmit={false} // prevents flickering due to onSubmitEditing going to next field
            value={authFactorToken}
            onChangeText={text => {
              setAuthFactorToken(text)
              if (errorField) setErrorField('none')
            }}
            onSubmitEditing={() => void onPressNext()}
            editable={!isProcessing}
            isInvalid={errorField === '2fa'}
            accessibilityHint={l`Enter the code from your email or authenticator app`}
          />
          <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.mt_sm]}>
            <Trans>
              Enter the sign in code from your email or authenticator app.
            </Trans>
          </Text>
        </View>
      )}

      {error ? (
        <Admonition.Admonition type="error">{error}</Admonition.Admonition>
      ) : null}

      <View
        style={[
          a.pt_md,
          gtMobile
            ? [a.justify_between, a.flex_row, a.align_center, a.gap_sm]
            : [a.gap_sm],
        ]}>
        {gtMobile && (
          <Button
            label={l`Back`}
            color="secondary"
            size="large"
            shape="default"
            style={[
              a.rounded_full,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}
            onPress={onPressBack}>
            <ButtonText style={{color: colors.text}}>
              <Trans>Back</Trans>
            </ButtonText>
          </Button>
        )}
        {!serviceDescription && error ? (
          <Button
            testID="loginRetryButton"
            label={l`Retry`}
            accessibilityHint={l`Retries signing in`}
            color="primary_subtle"
            size="large"
            style={[a.rounded_full]}
            onPress={onPressRetryConnect}>
            <ButtonText>
              <Trans>Retry</Trans>
            </ButtonText>
          </Button>
        ) : !serviceDescription ? (
          <Button
            label="Connecting to QuantZing..."
            size="large"
            color="secondary"
            style={[a.rounded_full]}
            disabled>
            <ButtonIcon icon={Loader} />
            <ButtonText>
              <Trans>Connecting…</Trans>
            </ButtonText>
          </Button>
        ) : (
          <Button
            testID="loginNextButton"
            label={l`Sign in`}
            accessibilityHint="Sign in to your QuantZing account"
            color="primary"
            size="large"
            style={[
              a.rounded_full,
              {
                backgroundColor: colors.ctaBg,
                paddingHorizontal: 28,
              },
            ]}
            onPress={() => void onPressNext()}>
            <ButtonText style={[a.font_bold, {color: colors.ctaText}]}>
              <Trans>Sign in</Trans>
            </ButtonText>
            {isProcessing && <ButtonIcon icon={Loader} />}
          </Button>
        )}
      </View>

      <Text
        style={[
          a.text_sm,
          a.mt_md,
          !gtMobile && a.text_center,
          {color: colors.muted},
        ]}>
        New to QuantZing?{' '}
        <InlineLinkText
          label="Create a QuantZing account"
          style={[a.text_sm, a.font_semi_bold, {color: colors.accent}]}
          {...createStaticClick(() => onPressCreateAccount())}>
          Create account
        </InlineLinkText>
      </Text>
    </FormContainer>
  )
}
