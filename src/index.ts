import { NitroModules } from 'react-native-nitro-modules'

import type {
  AttestationResult,
  DeviceAttest as DeviceAttestSpec,
} from './specs/device-attest.nitro'

const impl =
  NitroModules.createHybridObject<DeviceAttestSpec>('DeviceAttest')

/**
 * Prepare the platform attestation service.
 *
 * Call this **once at startup**, before {@link attest}:
 * - Android: warms up the Play Integrity token provider for `cloudProjectNumber`
 *   (the GCP project number linked to the app in Play Console). Required.
 * - iOS: no-op — App Attest needs no project number.
 *
 * The project number is passed as a string to avoid JS double-precision loss.
 */
export const configure = (cloudProjectNumber: string): Promise<void> =>
  impl.configure(cloudProjectNumber)

/**
 * Whether device attestation is available on this device (App Attest on iOS —
 * `false` on Simulator; Google Play Services on Android).
 */
export const isSupported = (): Promise<boolean> => impl.isSupported()

/**
 * Produce an attestation for a server-issued `challenge` (nonce).
 *
 * On iOS the first call for a fresh key returns an `attestation` — send its
 * `keyId` + `token` to the backend to register the key; subsequent calls return
 * an `assertion`. On Android every call returns a Play Integrity `token`.
 */
export const attest = (challenge: string): Promise<AttestationResult> =>
  impl.attest(challenge)

/**
 * Clear the stored iOS App Attest key so the next {@link attest} generates a
 * fresh key and returns an `attestation` again. No-op on Android.
 */
export const reset = (): Promise<void> => impl.reset()

export type { AttestationResult } from './specs/device-attest.nitro'
