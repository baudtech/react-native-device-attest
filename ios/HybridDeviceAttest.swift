//
//  HybridDeviceAttest.swift
//  DeviceAttest
//
//  Apple App Attest (DeviceCheck) implementation of the DeviceAttest HybridObject.
//
//  Key lifecycle follows Apple's "Establishing your app's integrity" guidance:
//  generate a key once and persist its identifier immediately; on the first
//  `attest` call for a key produce an *attestation*, and on every later call
//  produce an *assertion*. If `attestKey` fails with `serverUnavailable` the
//  key is kept so the next call retries it; any other attestation error
//  discards the key so a fresh one is generated (Apple recommends keeping the
//  device's key count low).
//

import CryptoKit
import DeviceCheck
import Foundation
import NitroModules
import Security

final class HybridDeviceAttest: HybridDeviceAttestSpec {
  private let service = DCAppAttestService.shared

  /// Keychain coordinates for the persisted App Attest state.
  private let keychainService = "react-native-device-attest"
  /// Stores the App Attest key identifier.
  private let keyIdAccount = "appAttestKeyId"
  /// Present once the stored key has been successfully attested at least once.
  private let attestedAccount = "appAttestAttested"

  // MARK: - Spec

  /// App Attest needs no project number — no-op on iOS.
  func configure(cloudProjectNumber: String) throws -> Promise<Void> {
    return Promise.resolved(withResult: ())
  }

  func isSupported() throws -> Promise<Bool> {
    return Promise.resolved(withResult: service.isSupported)
  }

  func attest(challenge: String) throws -> Promise<AttestationResult> {
    let promise = Promise<AttestationResult>()

    guard service.isSupported else {
      promise.reject(
        withError: RuntimeError.error(
          withMessage:
            "App Attest is not supported on this device (Simulator, or iOS < 14)."))
      return promise
    }

    // Bind the server-issued challenge into the request. For an attestation
    // Apple hashes the challenge alone; for an assertion its sample hashes the
    // full request payload. We hash the UTF-8 bytes of `challenge` in both
    // cases — a caller wanting Apple-style per-request binding passes the
    // serialized request (including the server nonce) as `challenge`, and the
    // server re-hashes the same bytes to verify.
    let clientDataHash = Data(SHA256.hash(data: Data(challenge.utf8)))

    if let keyId = keychainGet(keyIdAccount) {
      if keychainGet(attestedAccount) != nil {
        // Key already attested → produce an assertion (subsequent calls).
        generateAssertion(keyId: keyId, clientDataHash: clientDataHash, promise: promise)
      } else {
        // Key exists but its attestation never completed (e.g. a prior
        // `serverUnavailable`) → retry the attestation with the same key.
        attestKey(keyId: keyId, clientDataHash: clientDataHash, promise: promise)
      }
    } else {
      // No key yet → generate one, persist it immediately, then attest.
      service.generateKey { keyId, error in
        if let error = error {
          promise.reject(withError: error)
          return
        }
        guard let keyId = keyId else {
          promise.reject(
            withError: RuntimeError.error(withMessage: "App Attest returned no keyId."))
          return
        }
        do {
          try self.keychainSet(self.keyIdAccount, keyId)
        } catch {
          promise.reject(withError: error)
          return
        }
        self.attestKey(keyId: keyId, clientDataHash: clientDataHash, promise: promise)
      }
    }

    return promise
  }

  func reset() throws -> Promise<Void> {
    do {
      try keychainDelete(keyIdAccount)
      try keychainDelete(attestedAccount)
      return Promise.resolved(withResult: ())
    } catch {
      return Promise.rejected(withError: error)
    }
  }

  // MARK: - App Attest operations

  private func attestKey(
    keyId: String, clientDataHash: Data, promise: Promise<AttestationResult>
  ) {
    service.attestKey(keyId, clientDataHash: clientDataHash) { attestation, error in
      if let error = error {
        // `serverUnavailable` is transient — keep the key so the next call
        // retries it. Any other error means the key is unusable: discard it
        // so a fresh key is generated next time.
        if !self.isServerUnavailable(error) {
          try? self.keychainDelete(self.keyIdAccount)
          try? self.keychainDelete(self.attestedAccount)
        }
        promise.reject(withError: error)
        return
      }
      guard let attestation = attestation else {
        promise.reject(
          withError: RuntimeError.error(withMessage: "App Attest returned no attestation."))
        return
      }
      // Mark the key attested so future calls use the assertion path.
      do {
        try self.keychainSet(self.attestedAccount, "1")
      } catch {
        promise.reject(withError: error)
        return
      }
      promise.resolve(
        withResult: AttestationResult(
          platform: "ios",
          token: attestation.base64EncodedString(),
          keyId: keyId,
          attestationType: "attestation"))
    }
  }

  private func generateAssertion(
    keyId: String, clientDataHash: Data, promise: Promise<AttestationResult>
  ) {
    service.generateAssertion(keyId, clientDataHash: clientDataHash) { assertion, error in
      if let error = error {
        promise.reject(withError: error)
        return
      }
      guard let assertion = assertion else {
        promise.reject(
          withError: RuntimeError.error(withMessage: "App Attest returned no assertion."))
        return
      }
      promise.resolve(
        withResult: AttestationResult(
          platform: "ios",
          token: assertion.base64EncodedString(),
          keyId: keyId,
          attestationType: "assertion"))
    }
  }

  /// Whether a DeviceCheck error is the transient `serverUnavailable` case that
  /// Apple says to retry with the same key.
  private func isServerUnavailable(_ error: Error) -> Bool {
    return (error as? DCError)?.code == .serverUnavailable
  }

  // MARK: - Keychain

  private func keychainGet(_ account: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data,
      let value = String(data: data, encoding: .utf8)
    else {
      return nil
    }
    return value
  }

  private func keychainSet(_ account: String, _ value: String) throws {
    // Replace any existing entry.
    SecItemDelete(
      [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: keychainService,
        kSecAttrAccount as String: account,
      ] as CFDictionary)

    let addQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: account,
      kSecValueData as String: Data(value.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemAdd(addQuery as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw RuntimeError.error(
        withMessage: "Failed to store App Attest \(account) in Keychain (OSStatus \(status)).")
    }
  }

  private func keychainDelete(_ account: String) throws {
    let status = SecItemDelete(
      [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: keychainService,
        kSecAttrAccount as String: account,
      ] as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw RuntimeError.error(
        withMessage: "Failed to delete App Attest \(account) from Keychain (OSStatus \(status)).")
    }
  }
}
