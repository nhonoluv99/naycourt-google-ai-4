/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

export default function App() {
  return <RouterProvider router={router} />;
}
