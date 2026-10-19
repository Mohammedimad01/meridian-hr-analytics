"use client";

import { use } from "react";
import type {
  ComplianceData,
  Employee,
  EngagementData,
  MonthlySnapshot,
  OnboardingRecord,
  Requisition,
} from "./types";

/**
 * Datasets are code-split: each JSON file becomes its own chunk and is only
 * fetched by pages that need it. Promises are cached for the session, and
 * `useDataset` suspends until the data is ready so pages can show skeletons.
 */
const loaders = {
  employees: () => import("@/data/employees.json").then((m) => m.default as unknown as Employee[]),
  snapshots: () => import("@/data/snapshots.json").then((m) => m.default as unknown as MonthlySnapshot[]),
  requisitions: () => import("@/data/requisitions.json").then((m) => m.default as unknown as Requisition[]),
  onboarding: () => import("@/data/onboarding.json").then((m) => m.default as unknown as OnboardingRecord[]),
  compliance: () => import("@/data/compliance.json").then((m) => m.default as unknown as ComplianceData),
  engagement: () => import("@/data/engagement.json").then((m) => m.default as unknown as EngagementData),
};

export type DatasetName = keyof typeof loaders;
type DatasetOf<K extends DatasetName> = Awaited<ReturnType<(typeof loaders)[K]>>;

const cache = new Map<DatasetName, Promise<unknown>>();

export function loadDataset<K extends DatasetName>(name: K): Promise<DatasetOf<K>> {
  let promise = cache.get(name);
  if (!promise) {
    promise = loaders[name]();
    cache.set(name, promise);
  }
  return promise as Promise<DatasetOf<K>>;
}

export function useDataset<K extends DatasetName>(name: K): DatasetOf<K> {
  return use(loadDataset(name));
}
