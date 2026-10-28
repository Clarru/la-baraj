export type SeatPoint = [number, number, number];
export type BenchDefinition = {
  id: string;
  label: string;
  /** Centre of the usable seat surface in world metres. */
  center: SeatPoint;
  width: number;
  depth: number;
  /** Root/floor datum for the authored seated animation. */
  floorHeight: number;
  facing: number;
  /** Optional explicit authored capacity; otherwise derived from usable width. */
  capacity?: number;
  endMargin?: number;
  seatSpacing?: number;
};
export type BenchSeat = {
  id: string;
  benchId: string;
  index: number;
  center: SeatPoint;
  anchor: SeatPoint;
  facing: number;
  seatHeight: number;
  occupantId: string | null;
  /** Keeps the departing seat unavailable until a seated scoot completes. */
  reservedBy?: string | null;
};
export type RegisteredBench = BenchDefinition & { seats: readonly BenchSeat[] };
