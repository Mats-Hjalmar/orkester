// Which of the trial queue designs the now-playing pane shows, remembered across
// restarts. An unknown stored value falls back to the first design.

export type QueueDesign = 'a' | 'b' | 'c';

export const QUEUE_DESIGNS: { id: QueueDesign; name: string }[] = [
  { id: 'a', name: 'Eclipse rotor' },
  { id: 'b', name: 'Kinetic cascade' },
  { id: 'c', name: 'Depth tunnel' },
];

const KEY = 'orkester.desktop.queueDesign';

export function readQueueDesign(): QueueDesign {
  const stored = localStorage.getItem(KEY);
  return QUEUE_DESIGNS.find((d) => d.id === stored)?.id ?? 'a';
}

export function writeQueueDesign(design: QueueDesign): void {
  localStorage.setItem(KEY, design);
}
