import type { PriceBookItem, PriceBookQuoteLine } from "./priceBook-core.mjs";

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
  unitSellingPrice: number;
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

export type RoomEstimateInput = Partial<RoomEstimate> & { points?: Array<Partial<RoomEstimatePoint>> };
export type RoomEstimateIdFactory = (value: string) => string;

export const electricalRoomTemplates: readonly ElectricalRoomTemplate[];

export function normaliseRoomEstimate(room?: RoomEstimateInput): RoomEstimate;
export function roomEstimateFinancials(
  room: RoomEstimateInput,
  priceBookItems?: PriceBookItem[],
): RoomEstimateFinancials;
export function roomEstimateToQuoteLines(
  room: RoomEstimateInput,
  priceBookItems?: PriceBookItem[],
  makeId?: RoomEstimateIdFactory,
): PriceBookQuoteLine[];
export function wholePropertyEstimateFinancials(
  rooms: RoomEstimateInput[],
  priceBookItems?: PriceBookItem[],
): WholePropertyEstimateFinancials;
export function wholePropertyEstimateToQuoteLines(
  rooms: RoomEstimateInput[],
  priceBookItems?: PriceBookItem[],
  makeId?: RoomEstimateIdFactory,
): PriceBookQuoteLine[];
