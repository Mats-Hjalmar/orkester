// SSDP discovery SPIKE — the screen the USER runs on the Nothing Phone FIRST,
// before trusting the native control path. It runs ONLY the discovery transport
// (no control, no engine) and reports, live, whether react-native-jsi-udp +
// MulticastLock actually find a Sonos speaker on the LAN.
//
// `.native.tsx` so it never enters the web bundle. Mount it from a throwaway
// dev entry (see app/src/native/README.md) — it is NOT wired into the shipping
// App.tsx.

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { SSDPResult } from '@orkester/core';
import { JsiUdpDiscoveryTransport, type MulticastLock } from './JsiUdpDiscoveryTransport';

type Status = 'idle' | 'searching' | 'done' | 'error';

/**
 * Pass the Android MulticastLock here once the config-plugin module exists; the
 * spike works without it too (it will warn, and likely find nothing on Android —
 * which is itself the signal that the lock is required).
 */
export default function SpikeScreen({ lock }: { lock?: MulticastLock }) {
  const [status, setStatus] = React.useState<Status>('idle');
  const [results, setResults] = React.useState<SSDPResult[]>([]);
  const [error, setError] = React.useState<string>('');

  const run = React.useCallback(async () => {
    setStatus('searching');
    setResults([]);
    setError('');
    const found: SSDPResult[] = [];
    const transport = new JsiUdpDiscoveryTransport(lock);
    try {
      await transport.discover({
        waitMs: 4000,
        onResult: (r) => {
          found.push(r);
          setResults([...found]);
        },
      });
      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }, [lock]);

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: '#F2EFE8' }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#1A1814' }}>
        SSDP discovery spike
      </Text>
      <Text style={{ color: '#6B6558', marginBottom: 16 }}>
        Confirms react-native-jsi-udp can find a Sonos speaker. Run on Wi-Fi with a speaker powered on.
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
            <Text style={{ color: '#1A1814', fontWeight: '600' }}>{r.address}</Text>
            <Text style={{ color: '#6B6558', fontSize: 12 }}>{r.usn}</Text>
            <Text style={{ color: '#98927F', fontSize: 11 }}>{r.location}</Text>
          </View>
        ))}
        {status === 'done' && results.length === 0 && (
          <Text style={{ color: '#B86A6A' }}>
            No responders. On Android this usually means the MulticastLock is required (or jsi-udp
            multicast RX is broken on this RN/arch). See README for fallbacks.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
