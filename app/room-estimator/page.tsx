"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import type { PriceBookItem } from "../../lib/priceBook-core.mjs";
import {
  electricalRoomTemplates,
  normaliseRoomEstimate,
  roomEstimateFinancials,
  wholePropertyEstimateFinancials,
  type ElectricalRoomTemplateKey,
  type RoomEstimate,
} from "../../lib/roomEstimating.mjs";
import { makeId, useCloudLocalCollection } from "../../lib/storage";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export default function RoomEstimatorPage() {
  const rooms = useCloudLocalCollection<RoomEstimate>("jr-os-room-estimates");
  const priceBook = useCloudLocalCollection<PriceBookItem>("jr-os-price-book");
  const [templateKey, setTemplateKey] = useState<ElectricalRoomTemplateKey>("kitchen");
  const [message, setMessage] = useState("");

  const activeItems = useMemo(
    () => priceBook.items.filter((item) => item.active).sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name)),
    [priceBook.items],
  );
  const summary = useMemo(() => wholePropertyEstimateFinancials(rooms.items, activeItems), [activeItems, rooms.items]);

  function addRoom() {
    const template = electricalRoomTemplates.find((item) => item.key === templateKey);
    const now = new Date().toISOString();
    const room = normaliseRoomEstimate({
      id: makeId("room"),
      templateKey,
      name: template?.name ?? "Custom room or area",
      points: [],
      createdAt: now,
      updatedAt: now,
    });
    rooms.setItems((current) => [...current, room]);
    setMessage(`${room.name} added.`);
  }

  function patchRoom(id: string, patch: Partial<RoomEstimate>) {
    rooms.setItems((current) => current.map((room) => room.id === id
      ? normaliseRoomEstimate({ ...room, ...patch, updatedAt: new Date().toISOString() })
      : room));
  }

  function addPoint(roomId: string, priceBookItemId: string) {
    if (!priceBookItemId) return;
    rooms.setItems((current) => current.map((room) => {
      if (room.id !== roomId) return room;
      const existing = room.points.find((point) => point.priceBookItemId === priceBookItemId);
      const points = existing
        ? room.points.map((point) => point.priceBookItemId === priceBookItemId ? { ...point, quantity: point.quantity + 1 } : point)
        : [...room.points, { id: makeId("room-point"), priceBookItemId, quantity: 1, notes: "" }];
      return normaliseRoomEstimate({ ...room, points, updatedAt: new Date().toISOString() });
    }));
  }

  function patchPoint(roomId: string, pointId: string, patch: { quantity?: number; notes?: string }) {
    rooms.setItems((current) => current.map((room) => room.id === roomId
      ? normaliseRoomEstimate({
        ...room,
        points: room.points.map((point) => point.id === pointId ? { ...point, ...patch } : point),
        updatedAt: new Date().toISOString(),
      })
      : room));
  }

  if (!rooms.isReady || !priceBook.isReady) return <Card>Loading room estimator…</Card>;

  return <div className="space-y-6 pb-32">
    <PageHeader
      eyebrow="Electrical estimating"
      title="Room Estimator"
      description="Build a room-by-room electrical estimate from your saved Price Book. Labour, materials and profit remain internal while customer quote lines stay clean."
    />

    <div className="grid gap-3 sm:grid-cols-4">
      <Card><p className="text-sm text-slate-400">Rooms</p><p className="mt-1 text-2xl font-bold">{summary.roomCount}</p></Card>
      <Card><p className="text-sm text-slate-400">Points</p><p className="mt-1 text-2xl font-bold">{summary.pointCount}</p></Card>
      <Card><p className="text-sm text-slate-400">Selling price</p><p className="mt-1 text-2xl font-bold text-cyan-200">{money.format(summary.sellingPrice)}</p></Card>
      <Card><p className="text-sm text-slate-400">Gross profit</p><p className="mt-1 text-2xl font-bold text-emerald-300">{money.format(summary.grossProfit)}</p></Card>
    </div>

    <Card>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-medium text-slate-300">
          <span>Room or area</span>
          <select className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" value={templateKey} onChange={(event) => setTemplateKey(event.target.value as ElectricalRoomTemplateKey)}>
            {electricalRoomTemplates.map((room) => <option key={room.key} value={room.key}>{room.name}</option>)}
          </select>
        </label>
        <Button onClick={addRoom}><Plus className="mr-2 size-4" />Add room</Button>
      </div>
    </Card>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}

    <section className="space-y-4">
      {rooms.items.map((room) => {
        const financials = roomEstimateFinancials(room, activeItems);
        return <Card key={room.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <InputField label="Room name" value={room.name} onChange={(event) => patchRoom(room.id, { name: event.target.value })} />
            </div>
            <button type="button" aria-label={`Delete ${room.name}`} className="mt-7 min-h-11 min-w-11 rounded-xl border border-red-500/30 p-2 text-red-300" onClick={() => rooms.remove((item) => item.id === room.id)}><Trash2 className="mx-auto size-5" /></button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-slate-500">Points</p><p className="mt-1 font-bold">{financials.pointCount}</p></div>
            <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-slate-500">Labour</p><p className="mt-1 font-bold">{financials.labourHours.toFixed(2)} h</p></div>
            <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-slate-500">Sell</p><p className="mt-1 font-bold text-cyan-200">{money.format(financials.sellingPrice)}</p></div>
            <div className="rounded-xl bg-slate-950/70 p-3"><p className="text-slate-500">Profit</p><p className="mt-1 font-bold text-emerald-300">{money.format(financials.grossProfit)}</p></div>
          </div>

          <div className="mt-4">
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              <span>Add electrical point</span>
              <select className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" defaultValue="" onChange={(event) => { addPoint(room.id, event.target.value); event.target.value = ""; }}>
                <option value="">Choose from Price Book…</option>
                {activeItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {financials.lines.map((line) => {
              const point = room.points.find((item) => item.id === line.roomPointId);
              if (!point) return null;
              return <div key={point.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-medium">{line.description}</p><p className="text-sm text-slate-400">{money.format(line.unitSellingPrice)} per {line.unitLabel}</p></div>
                  <button type="button" aria-label={`Remove ${line.description}`} className="min-h-11 min-w-11 rounded-xl border border-slate-700 p-2" onClick={() => patchRoom(room.id, { points: room.points.filter((item) => item.id !== point.id) })}><Trash2 className="mx-auto size-4" /></button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
                  <InputField label="Quantity" type="number" min="0.01" step="0.25" value={String(point.quantity)} onChange={(event) => patchPoint(room.id, point.id, { quantity: Number(event.target.value) })} />
                  <InputField label="Customer note" value={point.notes} onChange={(event) => patchPoint(room.id, point.id, { notes: event.target.value })} />
                </div>
              </div>;
            })}
            {!room.points.length ? <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">Add sockets, lighting, alarms or other saved Price Book items to this room.</p> : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextareaField label="Customer room notes" value={room.notes} onChange={(event) => patchRoom(room.id, { notes: event.target.value })} />
            <TextareaField label="Internal room notes" value={room.internalNotes} onChange={(event) => patchRoom(room.id, { internalNotes: event.target.value })} />
          </div>
        </Card>;
      })}
    </section>

    {!rooms.items.length ? <Card><p className="text-sm text-slate-400">Add the first room to begin a property estimate.</p></Card> : null}

    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 px-4 lg:left-64">
      <div className="mx-auto flex max-w-3xl items-center justify-between rounded-2xl border border-cyan-500/20 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
        <div><p className="text-xs text-slate-400">Property estimate</p><p className="font-bold text-cyan-200">{money.format(summary.sellingPrice)}</p></div>
        <p className="text-right text-xs text-slate-400">{summary.roomCount} rooms<br />{summary.pointCount} points</p>
      </div>
    </div>
  </div>;
}
