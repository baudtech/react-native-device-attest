# @baudtech/react-native-device-attest

One unified device-attestation API for React Native, built with
[Nitro Modules](https://nitro.margelo.com). It proves to a backend that a
request comes from a genuine, unmodified build of your app running on a genuine
device, wrapping the two platform services behind a single call:

- **iOS** — Apple **App Attest** (`DCAppAttestService`, DeviceCheck framework)
- **Android** — Google **Play Integrity API** (Standard request flow)

[![Version](https://img.shields.io/npm/v/@baudtech/react-native-device-attest.svg)](https://www.npmjs.com/package/@baudtech/react-native-device-attest)
[![License](https://img.shields.io/npm/l/@baudtech/react-native-device-attest.svg)](https://github.com/baudtech/react-native-device-attest/LICENSE)

## Requirements

- React Native 0.76 or higher (new architecture)
- iOS 14+ on a **real device** (App Attest is unsupported on the Simulator)
- Android device with **Google Play Services**
- Expo SDK 52 or higher, if you use Expo — a config plugin is included
  (Expo is an optional peer dependency; bare React Native needs nothing extra)

## Installation

```bash
npm install @baudtech/react-native-device-attest react-native-nitro-modules
```

iOS:

```bash
cd ios && pod install
```

### Expo

This module contains custom native code, so it does **not** work in Expo Go —
you need a
[development build](https://docs.expo.dev/develop/development-builds/introduction/).

```bash
npx expo install @baudtech/react-native-device-attest react-native-nitro-modules
```

Add the bundled config plugin to your app config:

```json
{
  "expo": {
    "plugins": ["@baudtech/react-native-device-attest"]
  }
}
```

Then regenerate the native projects:

```bash
npx expo prebuild --clean
```

The plugin writes the App Attest entitlement into the generated iOS
entitlements file. This has to be a plugin rather than a checked-in file
because `prebuild` regenerates the entitlements on every run. Android needs no
plugin configuration — the Play Integrity and Play Services dependencies come
from this library's own Gradle config via autolinking.

| Option                 | Type                            | Default         | Description                                                                                            |
| ---------------------- | ------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `appAttestEnvironment` | `'development' \| 'production'` | `'development'` | Value for `com.apple.developer.devicecheck.appattest-environment`. See the note on environments below. |

```json
{
  "expo": {
    "plugins": [
      [
        "@baudtech/react-native-device-attest",
        { "appAttestEnvironment": "production" }
      ]
    ]
  }
}
```

Builds distributed through TestFlight, the App Store, or the Apple Developer
Enterprise Program **ignore this entitlement** and always use the production
environment, so the default is fine for release builds. It only affects
locally signed builds — where `development` means your backend must verify
against `https://data-development.appattest.apple.com` rather than
`https://data.appattest.apple.com`.

You still need to enable the **App Attest** capability for your App ID in the
Apple Developer portal (see [Prerequisites](#prerequisites-console-setup)); the
plugin only writes the client-side entitlement.

## API

```ts
import {
  configure,
  isSupported,
  attest,
  reset,
  type AttestationResult,
} from '@baudtech/react-native-device-attest'
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

In Expo projects the [config plugin](#expo) writes this entitlement for you on
every `prebuild`; the Developer-portal capability still has to be enabled by
hand.

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
