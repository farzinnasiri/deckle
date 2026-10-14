"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createDeskStorage, type DeskStorage } from "@/lib/storage";
const fallback = createDeskStorage();
const Context = createContext<DeskStorage>(fallback);
export const useDeskStorage = () => useContext(Context);
export function DeskStorageProvider({
  storage,
  children,
}: {
  storage: DeskStorage;
  children: ReactNode;
}) {
  return <Context.Provider value={storage}>{children}</Context.Provider>;
}
