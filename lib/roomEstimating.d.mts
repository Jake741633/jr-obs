import type { PriceBookItem } from "./priceBook-core.mjs";

export type ElectricalRoomTemplateKey =
  | "kitchen"
  | "utility"
  | "lounge"
  | "dining"
  | "bedroom"
  | "bathroom"
  | "ensuite"
  | "hall"
  | "landing"
  | "garage"
  | "loft"
  | "office"
  | "external"
  | "custom";

export interface ElectricalRoomTemplate {
  key: ElectricalRoomTemplateKey;
  name: string;
}

export interface RoomEstimatePoint {
  id: string;
  priceBookItemId: string;
  quantity: number;
  notes: string;
}

export interface RoomEstimate {
  id: string;
  templateKey: ElectricalRoomTemplateKey;
  name: string;
  notes: string;
  internalNotes: string;
  points: RoomEstimatePoint[];
  createdAt: string;
  updatedAt: string;
}

export interface RoomEstimateLine {
  roomPointId?: string;
  priceBookItemId: string;
  quantity: number;
  description: string;
  unitLabel: string;
  sellingPrice: number;
  notes: string;
}

export interface RoomEstimateFinancials {
  room: RoomEstimate;
  pointCount: number;
  labourHours: number;
  labourCost: number;
  materialCost: number;
  totalCost: number;
  sellingPrice: number;
  grossProfit: number;
  vat: number;
  lines: RoomEstimateLine[];
}

export interface WholePropertyEstimateFinancials {
  roomCount: number;
  pointCount: number;
  labourHours: number;
  labourCost: number;
  materialCost: number;
  totalCost: number;
  sellingPrice: number;
  grossProfit: number;
  vat: number;
  rooms: RoomEstimateFinancials[];
}

export const electricalRoomTemplates: readonly ElectricalRoomTemplate[];

export function normaliseRoomEstimate(room?: Partial<RoomEstimate> & { points?: Array<Partial<RoomEstimatePoint>> }): RoomEstimate;
export function roomEstimateFinancials(
  room: Partial<RoomEstimate> & { points?: Array<Partial<RoomEstimatePoint>> },
  priceBookItems?: PriceBookItem[],
): RoomEstimateFinancials;
export function wholePropertyEstimateFinancials(
  rooms: Array<Partial<RoomEstimate> & { points?: Array<Partial<RoomEstimatePoint>> }>,
  priceBookItems?: PriceBookItem[],
): WholePropertyEstimateFinancials;
