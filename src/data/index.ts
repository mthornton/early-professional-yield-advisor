// Data layer: everything the rules engine and interface read lives in JSON files here.
import catalogJson from './catalog.json';
import configJson from './config.json';
import taxJson from './taxTables.json';
import disclosuresJson from './disclosures.json';
import priya from './personas/priya.json';
import devon from './personas/devon.json';
import elena from './personas/elena.json';
import jordan from './personas/jordan.json';
import sam from './personas/sam.json';
import type { Catalog, Config, Persona, TaxTables } from '../engine/types';

export const catalog = catalogJson as unknown as Catalog;
export const config = configJson as unknown as Config;
export const taxTables = taxJson as unknown as TaxTables;
export const disclosures = disclosuresJson as {
  placeholder_label: string;
  items: Record<string, { title: string; short: string; full: string }>;
  documents: { label: string; href: string }[];
};
export const personas = [priya, devon, elena, jordan, sam] as unknown as Persona[];
export const personaById = (id: string) => personas.find((p) => p.id === id)!;
