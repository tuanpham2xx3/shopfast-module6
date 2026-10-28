import { matchPath } from "react-router-dom";

export type Screen =
  | "auth"
  | "catalog"
  | "cart"
  | "orders"
  | "inventory"
  | "tickets"
  | "admin"
  | "notfound";
export type AuthMode = "login" | "register" | "verify" | "account";
type Definition = {
  path: string;
  screen: Screen;
  mode?: AuthMode;
  roles?: string[];
  unverified?: boolean;
  panel?: string;
};
export const appRoutes: Definition[] = [
  { path: "/", screen: "auth" },
  { path: "/login", screen: "auth", mode: "login" },
  { path: "/register", screen: "auth", mode: "register" },
  {
    path: "/verify-email",
    screen: "auth",
    mode: "verify",
    roles: [],
    unverified: true,
  },
  {
    path: "/account",
    screen: "auth",
    mode: "account",
    roles: [],
    unverified: true,
  },
  { path: "/products", screen: "catalog" },
  { path: "/products/:id", screen: "catalog" },
  { path: "/cart", screen: "cart", roles: ["CUSTOMER"] },
  { path: "/checkout", screen: "cart", roles: ["CUSTOMER"] },
  { path: "/orders", screen: "orders", roles: ["CUSTOMER"] },
  { path: "/orders/:id", screen: "orders", roles: ["CUSTOMER"] },
  { path: "/tickets", screen: "tickets", roles: ["CUSTOMER", "WAREHOUSE"] },
  { path: "/tickets/:id", screen: "tickets", roles: ["CUSTOMER", "WAREHOUSE"] },
  { path: "/staff/orders", screen: "orders", roles: ["WAREHOUSE", "ADMIN"] },
  {
    path: "/staff/orders/:id",
    screen: "orders",
    roles: ["WAREHOUSE", "ADMIN"],
  },
  {
    path: "/staff/inventory",
    screen: "inventory",
    roles: ["WAREHOUSE", "ADMIN"],
  },
  { path: "/staff/tickets", screen: "tickets", roles: ["SUPPORT", "ADMIN"] },
  {
    path: "/staff/tickets/:id",
    screen: "tickets",
    roles: ["SUPPORT", "ADMIN"],
  },
  {
    path: "/admin/catalog",
    screen: "admin",
    roles: ["ADMIN"],
    panel: "catalog",
  },
  {
    path: "/admin/promotions",
    screen: "admin",
    roles: ["ADMIN"],
    panel: "promotions",
  },
  {
    path: "/admin/operations",
    screen: "admin",
    roles: ["ADMIN"],
    panel: "operations",
  },
];
export function resolveRoute(pathname: string) {
  for (const route of appRoutes) {
    const match = matchPath({ path: route.path, end: true }, pathname);
    if (match) return { ...route, id: match.params.id };
  }
  return {
    screen: "notfound" as Screen,
    path: pathname,
    id: undefined,
    roles: undefined,
    mode: undefined,
    unverified: false,
    panel: undefined,
  };
}
export function safeReturnTo(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "/account";
  const path = value.split(/[?#]/)[0];
  const route = resolveRoute(path);
  return route.screen === "notfound" || route.screen === "auth"
    ? "/account"
    : value;
}
