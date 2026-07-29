import type { HybridObject } from 'react-native-nitro-modules'

/**
 * The result of a single {@link DeviceAttest.attest} call.
 *
 * The shape differs per platform — the fields a backend needs to verify the
 * token depend on which attestation service produced it.
 */
export interface AttestationResult {
  /** `'ios'` (Apple App Attest) or `'android'` (Google Play Integrity). */
  platform: string
  /**
   * The opaque attestation payload, base64-encoded.
   *
   * - iOS: the CBOR attestation object (first call) or assertion object
   *   (subsequent calls) produced by `DCAppAttestService`.
   * - Android: the Play Integrity token (a JWT the server decodes via the
   *   Play Integrity API).
   */
  token: string
  /**
   * iOS only — the App Attest key identifier the attestation/assertion was
   * produced with. The server needs it to look up the attested public key.
   * `undefined` on Android.
   */
  keyId?: string
  /**
   * iOS only — `'attestation'` for the first call with a fresh key (register
   * the key server-side), `'assertion'` for every subsequent call.
   * `undefined` on Android.
   */
  attestationType?: string
}

export interface DeviceAttest
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Prepare the platform attestation service.
   *
   * - Android: warms up the Play Integrity token provider for the given GCP
   *   project. **Must be called once at startup before {@link attest}.** The
   *   project number is passed as a STRING to avoid JS double-precision loss.
   * - iOS: no-op (resolves immediately); App Attest needs no project number.
   */
  configure(cloudProjectNumber: string): Promise<void>
  /**
   * Whether device attestation is available on this device.
   *
   * - iOS: `DCAppAttestService.isSupported` (always `false` on Simulator).
   * - Android: whether Google Play Services is available.
   */
  isSupported(): Promise<boolean>
  /**
   * Produce an attestation for `challenge` (a server-issued nonce).
   *
   * The SHA-256 of the UTF-8 bytes of `challenge` is bound into the token
   * (iOS `clientDataHash` / Android `requestHash`), so the server proves the
   * token was minted for this request by re-hashing the same bytes. To bind a
   * whole request the way Apple's App Attest sample does, pass the serialized
   * request payload (with the nonce inside it) as `challenge`.
   *
   * On iOS the first call for a fresh key returns an `attestation`
   * (register `keyId` server-side); every later call returns an `assertion`.
   */
  attest(challenge: string): Promise<AttestationResult>
  /**
   * Clear the stored iOS App Attest key so the next {@link attest} generates a
   * fresh key and returns an `attestation` again (key rotation / testing).
   * No-op on Android.
   */
  reset(): Promise<void>
}
