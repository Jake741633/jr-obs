"use client";

import { FormEvent, useMemo, useState } from "react";
import { CarFront, Gauge, Plus, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { FleetVehicle, TeamMember, ToolAsset, ToolStatus, VehicleStatus } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const vehicleStatuses: VehicleStatus[] = ["Active", "Off road", "Sold"];
const toolStatuses: ToolStatus[] = ["Available", "Assigned", "In repair", "Retired"];
const blankVehicle = { registration: "", make: "", model: "", status: "Active" as VehicleStatus, assignedTeamMemberId: "", motDue: "", insuranceDue: "", serviceDue: "", currentMileage: "0", notes: "" };
const blankTool = { name: "", category: "", manufacturer: "", model: "", serialNumber: "", assetTag: "", status: "Available" as ToolStatus, assignedTeamMemberId: "", assignedVehicleId: "", purchaseDate: "", purchaseCost: "0", warrantyUntil: "", calibrationDue: "", notes: "" };

function formatDate(value: string) {
  if (!value) return "Not recorded";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default function AssetsPage() {
  const vehicles = useLocalStorageCollection<FleetVehicle>("jr-os-fleet");
  const tools = useLocalStorageCollection<ToolAsset>("jr-os-tools");
  const team = useLocalStorageCollection<TeamMember>("jr-os-team");
  const [vehicleForm, setVehicleForm] = useState(blankVehicle);
  const [toolForm, setToolForm] = useState(blankTool);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showToolForm, setShowToolForm] = useState(false);
  const [message, setMessage] = useState("");

  const activeVehicles = useMemo(() => vehicles.items.filter((vehicle) => vehicle.status === "Active"), [vehicles.items]);
  const assignedTools = useMemo(() => tools.items.filter((tool) => tool.status === "Assigned"), [tools.items]);
  const calibrationTracked = useMemo(() => tools.items.filter((tool) => Boolean(tool.calibrationDue)), [tools.items]);
  const assetValue = useMemo(() => tools.items.reduce((sum, tool) => sum + tool.purchaseCost, 0), [tools.items]);

  function teamName(id?: string) {
    return team.items.find((member) => member.id === id)?.name || "Unassigned";
  }

  function vehicleName(id?: string) {
    const vehicle = vehicles.items.find((item) => item.id === id);
    return vehicle ? `${vehicle.registration} · ${vehicle.make} ${vehicle.model}` : "No vehicle";
  }

  function addVehicle(event: FormEvent) {
    event.preventDefault();
    if (!vehicleForm.registration.trim()) { setMessage("Enter the vehicle registration."); return; }
    const now = new Date().toISOString();
    const vehicle: FleetVehicle = {
      id: makeId("vehicle"), registration: vehicleForm.registration.trim().toUpperCase(), make: vehicleForm.make.trim(), model: vehicleForm.model.trim(), status: vehicleForm.status,
      assignedTeamMemberId: vehicleForm.assignedTeamMemberId || undefined, motDue: vehicleForm.motDue, insuranceDue: vehicleForm.insuranceDue, serviceDue: vehicleForm.serviceDue,
      currentMileage: Number(vehicleForm.currentMileage || 0), notes: vehicleForm.notes.trim(), createdAt: now, updatedAt: now,
    };
    vehicles.setItems((current) => [vehicle, ...current]);
    setVehicleForm(blankVehicle); setShowVehicleForm(false); setMessage(`${vehicle.registration} added to fleet.`);
  }

  function addTool(event: FormEvent) {
    event.preventDefault();
    if (!toolForm.name.trim()) { setMessage("Enter the tool or tester name."); return; }
    const now = new Date().toISOString();
    const tool: ToolAsset = {
      id: makeId("tool"), name: toolForm.name.trim(), category: toolForm.category.trim(), manufacturer: toolForm.manufacturer.trim(), model: toolForm.model.trim(), serialNumber: toolForm.serialNumber.trim(), assetTag: toolForm.assetTag.trim(), status: toolForm.status,
      assignedTeamMemberId: toolForm.assignedTeamMemberId || undefined, assignedVehicleId: toolForm.assignedVehicleId || undefined, purchaseDate: toolForm.purchaseDate, purchaseCost: Number(toolForm.purchaseCost || 0), warrantyUntil: toolForm.warrantyUntil, calibrationDue: toolForm.calibrationDue,
      notes: toolForm.notes.trim(), createdAt: now, updatedAt: now,
    };
    tools.setItems((current) => [tool, ...current]);
    setToolForm(blankTool); setShowToolForm(false); setMessage(`${tool.name} added to the asset register.`);
  }

  if (!vehicles.isReady || !tools.isReady || !team.isReady) return <Card>Loading fleet and assets…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Operations" title="Fleet, Tools & Calibration" description="Manage vans, tool assignments, warranties, tester calibration and equipment records." />

    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setShowVehicleForm((current) => !current)}><Plus className="mr-2 size-4" />Add vehicle</Button>
      <Button variant="secondary" onClick={() => setShowToolForm((current) => !current)}><Wrench className="mr-2 size-4" />Add tool or tester</Button>
    </div>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CarFront className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Active vehicles</p><p className="mt-2 text-3xl font-bold">{activeVehicles.length}</p></Card>
      <Card><Wrench className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Registered tools</p><p className="mt-2 text-3xl font-bold">{tools.items.length}</p></Card>
      <Card><Gauge className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Assigned tools</p><p className="mt-2 text-3xl font-bold">{assignedTools.length}</p></Card>
      <Card><ShieldCheck className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Recorded asset value</p><p className="mt-2 text-3xl font-bold">{money.format(assetValue)}</p><p className="mt-1 text-xs text-slate-500">{calibrationTracked.length} calibration dates tracked</p></Card>
    </section>

    {showVehicleForm ? <Card><form onSubmit={addVehicle} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <InputField required label="Registration" value={vehicleForm.registration} onChange={(event) => setVehicleForm({ ...vehicleForm, registration: event.target.value })} />
      <InputField label="Make" value={vehicleForm.make} onChange={(event) => setVehicleForm({ ...vehicleForm, make: event.target.value })} />
      <InputField label="Model" value={vehicleForm.model} onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={vehicleForm.status} onChange={(event) => setVehicleForm({ ...vehicleForm, status: event.target.value as VehicleStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{vehicleStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Assigned to</span><select value={vehicleForm.assignedTeamMemberId} onChange={(event) => setVehicleForm({ ...vehicleForm, assignedTeamMemberId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Unassigned</option>{team.items.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <InputField label="Mileage" type="number" min="0" value={vehicleForm.currentMileage} onChange={(event) => setVehicleForm({ ...vehicleForm, currentMileage: event.target.value })} />
      <InputField label="MOT due" type="date" value={vehicleForm.motDue} onChange={(event) => setVehicleForm({ ...vehicleForm, motDue: event.target.value })} />
      <InputField label="Insurance due" type="date" value={vehicleForm.insuranceDue} onChange={(event) => setVehicleForm({ ...vehicleForm, insuranceDue: event.target.value })} />
      <InputField label="Service due" type="date" value={vehicleForm.serviceDue} onChange={(event) => setVehicleForm({ ...vehicleForm, serviceDue: event.target.value })} />
      <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Notes" value={vehicleForm.notes} onChange={(event) => setVehicleForm({ ...vehicleForm, notes: event.target.value })} /></div>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save vehicle</Button></div>
    </form></Card> : null}

    {showToolForm ? <Card><form onSubmit={addTool} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <InputField required label="Tool / tester name" value={toolForm.name} onChange={(event) => setToolForm({ ...toolForm, name: event.target.value })} />
      <InputField label="Category" placeholder="Tester, drill, access equipment…" value={toolForm.category} onChange={(event) => setToolForm({ ...toolForm, category: event.target.value })} />
      <InputField label="Asset tag" value={toolForm.assetTag} onChange={(event) => setToolForm({ ...toolForm, assetTag: event.target.value })} />
      <InputField label="Manufacturer" value={toolForm.manufacturer} onChange={(event) => setToolForm({ ...toolForm, manufacturer: event.target.value })} />
      <InputField label="Model" value={toolForm.model} onChange={(event) => setToolForm({ ...toolForm, model: event.target.value })} />
      <InputField label="Serial number" value={toolForm.serialNumber} onChange={(event) => setToolForm({ ...toolForm, serialNumber: event.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={toolForm.status} onChange={(event) => setToolForm({ ...toolForm, status: event.target.value as ToolStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{toolStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Assigned person</span><select value={toolForm.assignedTeamMemberId} onChange={(event) => setToolForm({ ...toolForm, assignedTeamMemberId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Unassigned</option>{team.items.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Assigned vehicle</span><select value={toolForm.assignedVehicleId} onChange={(event) => setToolForm({ ...toolForm, assignedVehicleId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">No vehicle</option>{vehicles.items.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration}</option>)}</select></label>
      <InputField label="Purchase date" type="date" value={toolForm.purchaseDate} onChange={(event) => setToolForm({ ...toolForm, purchaseDate: event.target.value })} />
      <InputField label="Purchase cost (£)" type="number" min="0" step="0.01" value={toolForm.purchaseCost} onChange={(event) => setToolForm({ ...toolForm, purchaseCost: event.target.value })} />
      <InputField label="Warranty until" type="date" value={toolForm.warrantyUntil} onChange={(event) => setToolForm({ ...toolForm, warrantyUntil: event.target.value })} />
      <InputField label="Calibration due" type="date" value={toolForm.calibrationDue} onChange={(event) => setToolForm({ ...toolForm, calibrationDue: event.target.value })} />
      <div className="md:col-span-2 xl:col-span-3"><TextareaField label="Notes" value={toolForm.notes} onChange={(event) => setToolForm({ ...toolForm, notes: event.target.value })} /></div>
      <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save asset</Button></div>
    </form></Card> : null}

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-3"><h2 className="text-xl font-bold">Fleet</h2>{vehicles.items.length === 0 ? <Card><p className="text-sm text-slate-400">No vehicles recorded.</p></Card> : vehicles.items.map((vehicle) => <Card key={vehicle.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{vehicle.status}</p><h3 className="mt-1 text-lg font-bold">{vehicle.registration}</h3><p className="text-sm text-slate-500">{vehicle.make} {vehicle.model} · {teamName(vehicle.assignedTeamMemberId)}</p></div><button onClick={() => vehicles.remove((item) => item.id === vehicle.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${vehicle.registration}`}><Trash2 className="size-4" /></button></div><div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2"><p>MOT: <span className="text-slate-200">{formatDate(vehicle.motDue)}</span></p><p>Insurance: <span className="text-slate-200">{formatDate(vehicle.insuranceDue)}</span></p><p>Service: <span className="text-slate-200">{formatDate(vehicle.serviceDue)}</span></p><p>Mileage: <span className="text-slate-200">{vehicle.currentMileage.toLocaleString("en-GB")}</span></p></div>{vehicle.notes ? <p className="mt-3 text-sm text-slate-300">{vehicle.notes}</p> : null}</Card>)}</div>
      <div className="space-y-3"><h2 className="text-xl font-bold">Tools & testers</h2>{tools.items.length === 0 ? <Card><p className="text-sm text-slate-400">No tools or testers recorded.</p></Card> : tools.items.map((tool) => <Card key={tool.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{tool.category || "Equipment"} · {tool.status}</p><h3 className="mt-1 text-lg font-bold">{tool.name}</h3><p className="text-sm text-slate-500">{tool.manufacturer} {tool.model}{tool.assetTag ? ` · ${tool.assetTag}` : ""}</p></div><button onClick={() => tools.remove((item) => item.id === tool.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${tool.name}`}><Trash2 className="size-4" /></button></div><div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2"><p>Person: <span className="text-slate-200">{teamName(tool.assignedTeamMemberId)}</span></p><p>Vehicle: <span className="text-slate-200">{vehicleName(tool.assignedVehicleId)}</span></p><p>Calibration: <span className="text-slate-200">{formatDate(tool.calibrationDue)}</span></p><p>Cost: <span className="text-slate-200">{money.format(tool.purchaseCost)}</span></p></div>{tool.serialNumber ? <p className="mt-3 text-xs text-slate-500">Serial: {tool.serialNumber}</p> : null}</Card>)}</div>
    </section>
  </div>;
}
