import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  attest,
  configure,
  isSupported,
  reset,
  type AttestationResult,
} from '@baudtech/react-native-device-attest';

// Android: the GCP project number linked to this app in Play Console.
// Replace with your own before testing on a real Android device.
const CLOUD_PROJECT_NUMBER = '000000000000';

function truncate(value: string, head = 24, tail = 12): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)} (${value.length} chars)`;
}

function App(): React.JSX.Element {
  const [challenge, setChallenge] = useState('server-issued-challenge-123');
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [result, setResult] = useState<AttestationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAttestation = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await configure(CLOUD_PROJECT_NUMBER);
      const available = await isSupported();
      setSupported(available);
      if (!available) {
        setError('Device attestation is not supported on this device.');
        return;
      }
      setResult(await attest(challenge));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runReset = async () => {
    setBusy(true);
    setError(null);
    try {
      await reset();
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>@baudtech/react-native-device-attest</Text>
      <Text style={styles.subtitle}>Platform: {Platform.OS}</Text>

      <Text style={styles.label}>Challenge</Text>
      <TextInput
        style={styles.input}
        value={challenge}
        onChangeText={setChallenge}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={runAttestation}
        disabled={busy}>
        <Text style={styles.buttonText}>Attest</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary, busy && styles.buttonDisabled]}
        onPress={runReset}
        disabled={busy}>
        <Text style={styles.buttonText}>Reset (iOS key)</Text>
      </TouchableOpacity>

      {busy && <ActivityIndicator style={styles.spinner} />}

      {supported !== null && (
        <Text style={styles.row}>isSupported: {String(supported)}</Text>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.row}>platform: {result.platform}</Text>
          {result.attestationType != null && (
            <Text style={styles.row}>attestationType: {result.attestationType}</Text>
          )}
          {result.keyId != null && (
            <Text style={styles.row}>keyId: {result.keyId}</Text>
          )}
          <Text style={styles.row}>token: {truncate(result.token)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 4,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonSecondary: {
    backgroundColor: '#64748b',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  spinner: {
    marginVertical: 12,
  },
  row: {
    fontSize: 14,
    color: '#111',
    marginBottom: 4,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginTop: 12,
  },
  resultBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
});

export default App;
