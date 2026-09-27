/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";

// Tailwind `md` breakpoint: below it the app renders its mobile layout.
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/**
 * Closes a details side panel when a page is opened on a phone.
 * Module and cycle pages remember the panel state in localStorage and default to "open",
 * which on a phone buried the board under a full-width panel. On desktop the stored
 * state is left alone; on a phone the user can still open the panel from the header.
 */
export const useCollapseOnMobile = (isCollapsed: boolean, collapse: () => void) => {
  useEffect(() => {
    if (!isCollapsed && window.matchMedia(MOBILE_MEDIA_QUERY).matches) collapse();
    // only on page open — a panel opened by hand must stay open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
