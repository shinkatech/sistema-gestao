import { useEffect, useRef } from "react";

export type DataTopic = "clients" | "vehicles" | "suppliers" | "orders" | "payables" | "receivables" | "settings";

const listeners = new Map<DataTopic, Set<() => void>>();

export const emitData = (...topics: DataTopic[]) => {
  topics.forEach((topic) => {
    listeners.get(topic)?.forEach((listener) => listener());
  });
};

export const onData = (topic: DataTopic, listener: () => void) => {
  const set = listeners.get(topic) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(topic, set);
  return () => {
    set.delete(listener);
  };
};

export const useOnData = (topic: DataTopic, listener: () => void) => {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => onData(topic, () => ref.current()), [topic]);
};
