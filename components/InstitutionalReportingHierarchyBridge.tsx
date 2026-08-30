"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

type StructureRow = {
  scope_body_id: string;
  body_id: string;
  body_code: string;
  body_name: string;
  program_id: string;
  program_code: string;
  program_name: string;
  program_status: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  project_status: string | null;
  activity_id: string | null;
  activity_code: string | null;
  activity_title: string | null;
  activity_status: string | null;
};

type Choice = { value: string; label: string };

function uniqueChoices(rows: StructureRow[], kind: "program" | "project" | "activity"): Choice[] {
  const map = new Map<string, Choice>();
  for (const row of rows) {
    let value = "";
    let label = "";
    if (kind === "program") {
      value = row.program_id;
      label = `${row.program_code} · ${row.program_name}`;
    } else if (kind === "project") {
      value = row.project_id || "";
      label = row.project_id ? `${row.project_code || ""} · ${row.project_name || ""}` : "";
    } else {
      value = row.activity_id || "";
      label = row.activity_id ? `${row.activity_code || ""} · ${row.activity_title || ""}` : "";
    }
    if (value && !map.has(value)) map.set(value, { value, label });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}

function appendScopedOptions(select: HTMLSelectElement, choices: Choice[], selectedValue: string) {
  select.querySelectorAll('option[data-aiac-hierarchy="true"]').forEach((option) => option.remove());
  const existing = new Set(Array.from(select.options).map((option) => option.value));
  for (const choice of choices) {
    if (existing.has(choice.value)) continue;
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    option.dataset.aiacHierarchy = "true";
    select.appendChild(option);
  }
  if (choices.length > 0) select.disabled = false;
  if (selectedValue && Array.from(select.options).some((option) => option.value === selectedValue)) {
    select.value = selectedValue;
  }
}

export default function InstitutionalReportingHierarchyBridge() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const root = document.getElementById("centre-rapports");
    if (!root) return;

    let disposed = false;
    let catalog: StructureRow[] = [];
    let catalogReady = false;
    let frame = 0;
    const selected = ["", "", "", ""];

    const filterSelects = () => Array.from(root.querySelectorAll("select")).slice(0, 4) as HTMLSelectElement[];
    const initial = filterSelects();
    initial.forEach((select, index) => { selected[index] = select.value; });

    const observer = new MutationObserver(() => scheduleApply());

    function scheduleApply() {
      if (disposed || !catalogReady || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyCatalog();
      });
    }

    function applyCatalog() {
      if (disposed || !catalogReady) return;
      const selects = filterSelects();
      if (selects.length < 4) return;

      observer.disconnect();
      try {
        const [bodySelect, programSelect, projectSelect, activitySelect] = selects;
        const bodyId = selected[0] || bodySelect.value;
        selected[0] = bodyId;

        const bodyRows = catalog.filter((row) => !bodyId || row.scope_body_id === bodyId);
        const programChoices = uniqueChoices(bodyRows, "program");
        appendScopedOptions(programSelect, programChoices, selected[1]);

        const programId = selected[1];
        const programRows = bodyRows.filter((row) => !programId || row.program_id === programId);
        const projectChoices = uniqueChoices(programRows, "project");
        appendScopedOptions(projectSelect, projectChoices, selected[2]);

        const projectId = selected[2];
        const projectRows = programRows.filter((row) => !projectId || row.project_id === projectId);
        const activityChoices = uniqueChoices(projectRows, "activity");
        appendScopedOptions(activitySelect, activityChoices, selected[3]);
      } finally {
        observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
      }
    }

    function handleChange(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const selects = filterSelects();
      const index = selects.indexOf(target);
      if (index < 0 || index > 3) return;
      selected[index] = target.value;
      for (let next = index + 1; next < selected.length; next += 1) selected[next] = "";
      window.setTimeout(scheduleApply, 0);
    }

    root.addEventListener("change", handleChange, true);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });

    void (async () => {
      const { data, error } = await supabase.rpc("institutional_reporting_filter_catalog");
      if (disposed) return;
      if (error) {
        console.error("AIAC hierarchy filter catalog:", error.message);
        return;
      }
      catalog = (data || []) as StructureRow[];
      catalogReady = true;
      scheduleApply();
    })();

    return () => {
      disposed = true;
      root.removeEventListener("change", handleChange, true);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [supabase]);

  return null;
}
