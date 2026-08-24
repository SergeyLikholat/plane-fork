/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { startTransition, StrictMode } from "react";
import { setDefaultOptions } from "date-fns";
import { ru } from "date-fns/locale";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// This deployment is Russian-only. date-fns formats with the English locale
// unless told otherwise, which is why filter chips read "Aug 17 - 24, 2026"
// while the rest of the UI is translated. Setting the default once here
// covers every format() call in the app and in @plane/utils.
setDefaultOptions({ locale: ru, weekStartsOn: 1 });

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
});
