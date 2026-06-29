// mDNS discovery SPIKE — the screen the USER runs on a real device FIRST, before
// trusting the native control path. It runs ONLY the discovery transport (no
// control, no engine) and reports, live, whether react-native-zeroconf actually
// finds a Sonos speaker on the LAN over mDNS/Bonjour (`_sonos._tcp`).
//
// `.native.tsx` so it never enters the web bundle. Mount it from a throwaway dev
// entry (see app/src/native/README.md) — it is NOT wired into the shipping
// App.tsx.

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { SSDPResult } from '@orkester/core';
import { ZeroconfDiscoveryTransport } from './ZeroconfDiscoveryTransport';

type Status = 'idle' | 'searching' | 'done' | 'error';

export default function SpikeScreen() {
  const [status, setStatus] = React.useState<Status>('idle');
  const [results, setResults] = React.useState<SSDPResult[]>([]);
  const [error, setError] = React.useState<string>('');

  const run = React.useCallback(async () => {
    setStatus('searching');
    setResults([]);
    setError('');
    const found: SSDPResult[] = [];
    const transport = new ZeroconfDiscoveryTransport();
    // Markers so the spike is observable from `adb logcat` (ReactNativeJS tag)
    // without tapping/reading the screen — the [SPIKE] prefix is grep-friendly.
    // eslint-disable-next-line no-console
    console.log('[SPIKE] discovery start (react-native-zeroconf, _sonos._tcp, 4s)');
    try {
      await transport.discover({
        waitMs: 4000,
        onResult: (r) => {
          found.push(r);
          setResults([...found]);
          // eslint-disable-next-line no-console
          console.log(`[SPIKE] responder: ${r.address} ${r.usn} ${r.location}`);
        },
      });
      setStatus('done');
      // eslint-disable-next-line no-console
      console.log(`[SPIKE] done: ${found.length} responder(s)`);
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
      // eslint-disable-next-line no-console
      console.log(`[SPIKE] error: ${(e as Error).message}`);
    }
  }, []);

  // Auto-run once on mount so a fresh launch reports to logcat with no tap.
  React.useEffect(() => {
    void run();
  }, [run]);

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: '#F2EFE8' }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#1A1814' }}>
        mDNS discovery spike
      </Text>
      <Text style={{ color: '#6B6558', marginBottom: 16 }}>
        Confirms react-native-zeroconf can find a Sonos speaker over Bonjour
        (_sonos._tcp). Run on Wi-Fi with a speaker powered on. On iOS, grant the
        Local Network prompt on first run.
      </Text>

      <TouchableOpacity
        onPress={run}
        disabled={status === 'searching'}
        style={{
          backgroundColor: status === 'searching' ? '#C9D96B' : '#E4F289',
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text style={{ color: '#2A3308', fontWeight: '700' }}>
          {status === 'searching' ? 'Searching…' : 'Run discovery (4s)'}
        </Text>
      </TouchableOpacity>

      <Text style={{ marginBottom: 8, color: '#1A1814' }}>
        Status: {status}
        {status === 'done' ? ` — ${results.length} responder(s)` : ''}
      </Text>
      {error !== '' && <Text style={{ color: '#B86A6A', marginBottom: 8 }}>Error: {error}</Text>}

      <ScrollView style={{ flex: 1 }}>
        {results.map((r) => (
          <View key={r.location} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#C8C2B0' }}>
            <Text style={{ color: '#1A1814', fontWeight: '600' }}>{r.address || '(no ipv4)'}</Text>
            <Text style={{ color: '#6B6558', fontSize: 12 }}>{r.usn}</Text>
            <Text style={{ color: '#98927F', fontSize: 11 }}>{r.location}</Text>
          </View>
        ))}
        {status === 'done' && results.length === 0 && (
          <Text style={{ color: '#B86A6A' }}>
            No responders. Check the device is on the same Wi-Fi/subnet as the speakers, that the
            Local Network permission was granted (iOS), and that react-native-zeroconf loaded under
            the New Architecture. See README for the DNSSD-impl fallback on Android.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
