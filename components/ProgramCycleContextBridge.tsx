"use client";

import { useEffect } from "react";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setHierarchySelect(labelPrefix: string, value: string) {
  if (!value) return;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const labels = Array.from(document.querySelectorAll(".hierarchicalCycle label"));
    const label = labels.find((item) => item.textContent?.trim().startsWith(labelPrefix));
    const select = label?.querySelector("select");
    if (select instanceof HTMLSelectElement) {
      const hasValue = Array.from(select.options).some((option) => option.value === value);
      if (hasValue && !select.disabled) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
    await wait(100);
  }
}

export default function ProgramCycleContextBridge() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const body = params.get("body") || "";
    const program = params.get("program") || "";
    const project = params.get("project") || "";
    const activity = params.get("activity") || "";
    const task = params.get("task") || "";
    if (!body) return;

    void (async () => {
      await setHierarchySelect("Organe", body);
      await setHierarchySelect("Programme", program);
      await setHierarchySelect("Projet", project);
      await setHierarchySelect("Activité", activity);
      await setHierarchySelect("Tâche", task);
      document.querySelector(".hierarchicalCycle")?.scrollIntoView({ behavior: "smooth", block: "start" });
    })();
  }, []);

  return null;
}
