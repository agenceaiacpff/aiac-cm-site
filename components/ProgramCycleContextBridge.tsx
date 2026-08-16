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

async function openReportingSection() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const buttons = Array.from(document.querySelectorAll(".fieldReporting .operationNav button"));
    const button = buttons.find((item) => item.textContent?.includes("Saisir et suivre"));
    if (button instanceof HTMLButtonElement) {
      button.click();
      await wait(150);
      document.querySelector(".officialReportDetail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
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
    const mode = params.get("mode") || "";
    const report = params.get("report") || "";

    void (async () => {
      if (body) {
        await setHierarchySelect("Organe", body);
        await setHierarchySelect("Programme", program);
        await setHierarchySelect("Projet", project);
        await setHierarchySelect("Activité", activity);
        await setHierarchySelect("Tâche", task);
      }
      if (mode === "report" || report) {
        await openReportingSection();
      } else if (body) {
        document.querySelector(".hierarchicalCycle")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    })();
  }, []);

  return null;
}
