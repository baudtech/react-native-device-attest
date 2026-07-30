/**
 * Expo config plugin for @baudtech/react-native-device-attest.
 *
 * `expo prebuild` regenerates the iOS entitlements file, so the App Attest
 * entitlement can't simply be checked in — it has to be re-applied on every
 * prebuild. That is all this plugin does.
 *
 * Android needs no configuration: the Play Integrity and Play Services
 * dependencies come from this library's own `android/build.gradle` and are
 * picked up by autolinking.
 */

import { withEntitlementsPlist, type ConfigPlugin } from 'expo/config-plugins'

export type AppAttestEnvironment = 'development' | 'production'

export type DeviceAttestPluginProps = {
  /**
   * Value written to the `com.apple.developer.devicecheck.appattest-environment`
   * entitlement. Defaults to `'development'`, matching what Xcode writes when
   * you enable the App Attest capability.
   *
   * Builds distributed through TestFlight, the App Store, or the Apple
   * Developer Enterprise Program ignore this entitlement and always use the
   * production environment — so it only affects locally signed builds, where
   * `'development'` means your backend must verify tokens against
   * `https://data-development.appattest.apple.com`.
   */
  appAttestEnvironment?: AppAttestEnvironment
}

const APP_ATTEST_ENTITLEMENT =
  'com.apple.developer.devicecheck.appattest-environment'

const ENVIRONMENTS: readonly AppAttestEnvironment[] = [
  'development',
  'production',
]

const withDeviceAttest: ConfigPlugin<DeviceAttestPluginProps | undefined> = (
  config,
  props
) => {
  const environment = props?.appAttestEnvironment ?? 'development'

  // Props come from the app config (JSON or untyped JS), so validate rather
  // than trusting the declared type — a typo here would otherwise surface as
  // an opaque code-signing failure at build time.
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error(
      '[@baudtech/react-native-device-attest] Invalid `appAttestEnvironment`: ' +
        `${JSON.stringify(environment)}. Expected ` +
        `${ENVIRONMENTS.map((value) => `"${value}"`).join(' or ')}.`
    )
  }

  return withEntitlementsPlist(config, (entitlementsConfig) => {
    entitlementsConfig.modResults[APP_ATTEST_ENTITLEMENT] = environment
    return entitlementsConfig
  })
}

export default withDeviceAttest
