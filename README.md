# react-native-device-attest

One unified device-attestation API for React Native, built with
[Nitro Modules](https://nitro.margelo.com). It proves to a backend that a
request comes from a genuine, unmodified build of your app running on a genuine
device, wrapping the two platform services behind a single call:

- **iOS** — Apple **App Attest** (`DCAppAttestService`, DeviceCheck framework)
- **Android** — Google **Play Integrity API** (Standard request flow)

[![Version](https://img.shields.io/npm/v/react-native-device-attest.svg)](https://www.npmjs.com/package/react-native-device-attest)
[![License](https://img.shields.io/npm/l/react-native-device-attest.svg)](https://github.com/baudtech/react-native-device-attest/LICENSE)

## Requirements

- React Native 0.76 or higher (new architecture)
- iOS 14+ on a **real device** (App Attest is unsupported on the Simulator)
- Android device with **Google Play Services**

## Installation

```bash
npm install react-native-device-attest react-native-nitro-modules
```

iOS:

```bash
cd ios && pod install
```

## API

```ts
import {
  configure,
  isSupported,
  attest,
  reset,
  type AttestationResult,
} from 'react-native-device-attest'
```

| Function                               | Description                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `configure(cloudProjectNumber): Promise<void>` | Prepare the service. **Android:** warms up the Play Integrity provider (required). **iOS:** no-op. Call once at startup.       |
| `isSupported(): Promise<boolean>`      | iOS: `DCAppAttestService.isSupported` (`false` on Simulator). Android: whether Google Play Services is available.             |
| `attest(challenge): Promise<AttestationResult>` | Produce an attestation bound to a server-issued `challenge` (nonce).                                                          |
| `reset(): Promise<void>`               | iOS: clear the stored App Attest key so the next `attest` re-attests. Android: no-op.                                        |

### `AttestationResult`

```ts
interface AttestationResult {
  platform: string          // 'ios' | 'android'
  token: string             // base64 attestation/assertion (iOS) | Play Integrity token (Android)
  keyId?: string            // iOS only — the attested key identifier
  attestationType?: string  // iOS only — 'attestation' (first call) | 'assertion' (subsequent)
}
```

### Usage

```ts
// Once, at app startup:
await configure('123456789012') // GCP project number (Android); ignored on iOS

if (await isSupported()) {
  // `challenge` is a fresh nonce fetched from your backend.
  const result = await attest(challenge)
  // Send `result` to your backend for verification.
}
```

On **iOS**, the first `attest` for a fresh key returns
`attestationType: 'attestation'` — send `keyId` + `token` to the backend to
register the attested public key. Every subsequent call returns
`attestationType: 'assertion'`. On **Android** every call returns a Play
Integrity `token` (no `keyId`).

The library generates the App Attest key once and keeps it (persisting the
`keyId` in the Keychain). If your backend **rejects** an attestation, call
`reset()` so the next `attest` generates and attests a fresh key — otherwise the
client keeps producing assertions for a key the server never accepted.

## Prerequisites (console setup)

**iOS** — enable the **App Attest** capability for your App ID in the Apple
Developer portal, and add the entitlement to the consuming app's
`.entitlements`:

```xml
<key>com.apple.developer.devicecheck.appattest-environment</key>
<string>development</string> <!-- or "production" -->
```

**Android** — register the app in **Google Play Console** with the **Play
Integrity API** enabled and linked to a **GCP project**, then pass that
project's **project number** to `configure(...)`.

## Server-side verification

This library only produces tokens; verification happens on your backend:

- **iOS** — validate the CBOR attestation object against Apple's App Attest
  root CA (first call), checking its embedded `clientDataHash` equals
  `SHA256(utf8(challenge))`. Then verify assertions against the registered
  public key and enforce the monotonically increasing signature counter (replay
  protection). See Apple's
  [Establishing your app's integrity](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)
  and Validating apps that connect to your server.
- **Android** — decode the integrity token via the Play Integrity API and check
  the verdicts, and that the token's `requestHash` equals
  `Base64URL_nopad(SHA256(utf8(challenge)))` (the encoding Google's Play
  Integrity sample uses). See
  [android/security-samples · PlayIntegrityAPI](https://github.com/android/security-samples/tree/main/PlayIntegrityAPI).

## Example

See [`example/`](./example) for a runnable demo screen
(`configure` → `isSupported` → `attest`). Attestation only works on real
devices, not simulators/emulators.

## Credits

Bootstrapped with [create-nitro-module](https://github.com/patrickkabwe/create-nitro-module).

## License

MIT
