/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { SchedulesRoot } from "./schedules-root";
import { TransferRulesRoot } from "./transfer-rules-root";

export type TCustomAutomationsRootProps = {
  projectId: string;
  workspaceSlug: string;
};

export function CustomAutomationsRoot(props: TCustomAutomationsRootProps) {
  return (
    <>
      <TransferRulesRoot projectId={props.projectId} workspaceSlug={props.workspaceSlug} />
      <SchedulesRoot projectId={props.projectId} workspaceSlug={props.workspaceSlug} />
    </>
  );
}
