// Ambient types for react-native-zeroconf (v0.14.0 ships no .d.ts). Declares only
// the surface used by ZeroconfDiscoveryTransport, plus the ImplType enum for the
// Android DNSSD fallback documented in README.
declare module 'react-native-zeroconf' {
  export interface Service {
    name?: string;
    fullName?: string;
    host?: string;
    port?: number;
    addresses?: string[];
    txt?: Record<string, string | undefined> | null;
  }

  export enum ImplType {
    NSD = 'NSD',
    DNSSD = 'DNSSD',
  }

  type ZeroconfEvent = 'start' | 'stop' | 'found' | 'resolved' | 'remove' | 'error' | 'update';

  export default class Zeroconf {
    constructor();
    scan(type?: string, protocol?: string, domain?: string, implType?: ImplType): void;
    stop(implType?: ImplType): void;
    on(event: 'resolved', callback: (service: Service) => void): void;
    on(event: 'error', callback: (error: unknown) => void): void;
    on(event: ZeroconfEvent, callback: (...args: unknown[]) => void): void;
    removeDeviceListeners(): void;
    getServices(): Record<string, Service>;
  }
}
