export type Difficulty = "novice" | "easy" | "intermediate" | "advanced" | "expert" | "freeride" | "other";

export type ResortIndexEntry = {
  id: string;
  slug: string;
  name: string;
  country: string;
  region?: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** [lon, lat] center */
  center: [number, number];
  elevationMin?: number;
  elevationMax?: number;
  runKm?: number;
  runCount?: number;
  liftCount?: number;
  image?: string;
  imageAttribution?: string;
  wikidataID?: string | null;
};

export type ResortDetail = {
  index: ResortIndexEntry;
  runs: GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString, RunProps>;
  lifts: GeoJSON.FeatureCollection<GeoJSON.LineString, LiftProps>;
};

export type RunProps = {
  name?: string;
  difficulty: Difficulty;
  ref?: string;
};

export type LiftProps = {
  name?: string;
  liftType?: string;
};
