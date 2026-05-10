export type RunSummary = {
  id: string;
  name: string;
  difficulty: string;
  lengthM: number;
  dropM: number;
  bbox: [number, number, number, number];
};

export type LiftSummary = {
  id: string;
  name: string;
  liftType: string;
  lengthM: number;
  dropM: number;
  bbox: [number, number, number, number];
};
