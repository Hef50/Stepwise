declare module "hershey" {
  /** One polyline stroke: array of [x, y] points (Hershey Y-up units). */
  export type HersheyStroke = number[][];

  export interface HersheyBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }

  export interface HersheyStringPaths {
    bounds: HersheyBounds;
    /** Strokes in pen order for the whole string. */
    paths: HersheyStroke[];
  }

  export function stringToPaths(text: string): HersheyStringPaths;
  export function parseCharacterDescriptor(descriptor: string): unknown;
}
