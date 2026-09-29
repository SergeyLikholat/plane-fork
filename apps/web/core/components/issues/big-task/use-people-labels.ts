/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * People of a project: its labels under the «ЛЮДИ» parent label. Used by the
 * «Какой следующий шаг?» dialog and the ⋯ menu («Передать на контроль…»,
 * «Сменить исполнителя…»). Labels are fetched once per project.
 */
import { useContext } from "react";
import useSWR from "swr";
import { StoreContext } from "@/lib/store-context";
import { isPeopleParentName } from "./helpers";

export type TPerson = { id: string; name: string };

export function usePeople(workspaceSlug: string, projectId: string): TPerson[] {
  const rootStore = useContext(StoreContext);
  const { labelMap, fetchProjectLabels } = rootStore.label;
  useSWR(["BIG_TASK_PROJECT_LABELS", workspaceSlug, projectId], () => fetchProjectLabels(workspaceSlug, projectId), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  return (
    Object.values(labelMap)
      .filter((l) => l.project_id === projectId && l.parent && isPeopleParentName(labelMap[l.parent]?.name))
      // `filter` already returned a fresh array (ES2022 lib, no toSorted).
      // oxlint-disable-next-line unicorn/no-array-sort
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      .map((l) => ({ id: l.id, name: l.name }))
  );
}
