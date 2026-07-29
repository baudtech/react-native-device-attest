package com.deviceattest

import android.util.Base64
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.margelo.nitro.deviceattest.AttestationResult
import com.margelo.nitro.deviceattest.HybridDeviceAttestSpec
import java.security.MessageDigest

/**
 * Google Play Integrity (Standard request flow) implementation of the
 * DeviceAttest HybridObject.
 *
 * Mirrors Google's `security-samples/PlayIntegrityAPI` client: warm up a
 * [StandardIntegrityTokenProvider] once and reuse it for every token request,
 * binding a `requestHash` (SHA-256 of the challenge, Base64 URL-safe) into each
 * token. If `attest` is reached before the provider is ready it lazily prepares
 * one, provided a project number was supplied via [configure].
 */
class HybridDeviceAttest : HybridDeviceAttestSpec() {

  /** Prepared by [configure] (or lazily by [attest]) and reused across requests. */
  private var tokenProvider: StandardIntegrityTokenProvider? = null

  /** Retained from [configure] so [attest] can lazily re-prepare the provider. */
  private var cloudProjectNumber: Long? = null

  override fun configure(cloudProjectNumber: String): Promise<Unit> {
    val promise = Promise<Unit>()

    val projectNumber = cloudProjectNumber.toLongOrNull()
    if (projectNumber == null) {
      promise.reject(
        IllegalArgumentException("Invalid cloudProjectNumber: \"$cloudProjectNumber\".")
      )
      return promise
    }
    this.cloudProjectNumber = projectNumber

    prepareProvider(
      projectNumber,
      onSuccess = { promise.resolve(Unit) },
      onFailure = { error -> promise.reject(error) }
    )
    return promise
  }

  override fun isSupported(): Promise<Boolean> {
    val context = NitroModules.applicationContext ?: return Promise.resolved(false)
    val status = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
    return Promise.resolved(status == ConnectionResult.SUCCESS)
  }

  override fun attest(challenge: String): Promise<AttestationResult> {
    val promise = Promise<AttestationResult>()
    val requestHash = sha256Base64Url(challenge)

    val provider = tokenProvider
    if (provider != null) {
      requestToken(provider, requestHash, promise)
      return promise
    }

    // Provider not ready yet — lazily prepare it if configure() supplied a
    // project number (Google's sample warms up on demand the same way).
    val projectNumber = cloudProjectNumber
    if (projectNumber == null) {
      promise.reject(
        IllegalStateException(
          "Play Integrity is not configured. Call configure(cloudProjectNumber) at " +
            "startup before attest()."
        )
      )
      return promise
    }

    prepareProvider(
      projectNumber,
      onSuccess = { prepared -> requestToken(prepared, requestHash, promise) },
      onFailure = { error -> promise.reject(error) }
    )
    return promise
  }

  /** No stored key on Android — nothing to reset. */
  override fun reset(): Promise<Unit> = Promise.resolved(Unit)

  private fun prepareProvider(
    projectNumber: Long,
    onSuccess: (StandardIntegrityTokenProvider) -> Unit,
    onFailure: (Throwable) -> Unit
  ) {
    val context = NitroModules.applicationContext
    if (context == null) {
      onFailure(IllegalStateException("No application context available."))
      return
    }

    IntegrityManagerFactory.createStandard(context)
      .prepareIntegrityToken(
        PrepareIntegrityTokenRequest.builder()
          .setCloudProjectNumber(projectNumber)
          .build()
      )
      .addOnSuccessListener { provider ->
        tokenProvider = provider
        onSuccess(provider)
      }
      .addOnFailureListener { error -> onFailure(error) }
  }

  private fun requestToken(
    provider: StandardIntegrityTokenProvider,
    requestHash: String,
    promise: Promise<AttestationResult>
  ) {
    provider
      .request(
        StandardIntegrityTokenRequest.builder()
          .setRequestHash(requestHash)
          .build()
      )
      .addOnSuccessListener { response ->
        promise.resolve(
          AttestationResult(
            platform = "android",
            token = response.token(),
            keyId = null,
            attestationType = null
          )
        )
      }
      .addOnFailureListener { error -> promise.reject(error) }
  }

  /**
   * SHA-256 of the challenge, Base64 URL-safe and unpadded — the encoding used
   * by Google's Play Integrity sample. The server must re-hash the same
   * challenge bytes the same way to verify the token's `requestDetails`.
   */
  private fun sha256Base64Url(input: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
  }
}
