// Thin re-export of the stable UI-facing state types, now owned by
// @orkester/core/state. Kept here so existing import sites (`./state/types`)
// do not churn.
export type { Motif, Track, Room, Group, Config, MView, TopologyStatus } from '@orkester/core/state';
