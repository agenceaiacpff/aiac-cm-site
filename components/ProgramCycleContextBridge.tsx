"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

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

type Hierarchy = { body: string; program: string; project: string; activity: string; task: string };

export default function ProgramCycleContextBridge() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function hierarchyFromReport(reportId: string): Promise<Hierarchy | null> {
      const { data: report, error: reportError } = await supabase
        .from("task_reports")
        .select("task_id")
        .eq("id", reportId)
        .single();
      if (reportError || !report?.task_id) return null;

      const { data: task, error: taskError } = await supabase
        .from("activity_tasks")
        .select("id,activity_id")
        .eq("id", report.task_id)
        .single();
      if (taskError || !task?.activity_id) return null;

      const { data: activity, error: activityError } = await supabase
        .from("activities")
        .select("id,project_id")
        .eq("id", task.activity_id)
        .single();
      if (activityError || !activity?.project_id) return null;

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id,program_id")
        .eq("id", activity.project_id)
        .single();
      if (projectError || !project?.program_id) return null;

      const { data: program, error: programError } = await supabase
        .from("programs")
        .select("id,body_id")
        .eq("id", project.program_id)
        .single();
      if (programError || !program?.body_id) return null;

      return {
        body: program.body_id,
        program: project.program_id,
        project: activity.project_id,
        activity: task.activity_id,
        task: report.task_id,
      };
    }

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      let hierarchy: Hierarchy = {
        body: params.get("body") || "",
        program: params.get("program") || "",
        project: params.get("project") || "",
        activity: params.get("activity") || "",
        task: params.get("task") || "",
      };
      const mode = params.get("mode") || "";
      const report = params.get("report") || "";

      if (report && !hierarchy.body) {
        const resolved = await hierarchyFromReport(report);
        if (cancelled) return;
        if (resolved) hierarchy = resolved;
      }

      if (hierarchy.body) {
        await setHierarchySelect("Organe", hierarchy.body);
        await setHierarchySelect("Programme", hierarchy.program);
        await setHierarchySelect("Projet", hierarchy.project);
        await setHierarchySelect("Activité", hierarchy.activity);
        await setHierarchySelect("Tâche", hierarchy.task);
      }
      if (cancelled) return;

      if (mode === "report" || report) {
        await openReportingSection();
      } else if (hierarchy.body) {
        document.querySelector(".hierarchicalCycle")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    })();

    return () => { cancelled = true; };
  }, [supabase]);

  return null;
}
