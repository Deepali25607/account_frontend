// Central route path constants. These are router-relative — React Router
// prepends the `basename` automatically — so they remain correct under any
// deployment base path ("/", "/account/", "/school/", …).
export const ROUTES = {
  home: "/",
  login: "/login",
  admin: "/admin",
  publicInvoice: "/i",

  inventory: "/inventory",
  warehouses: "/warehouses",
  purchases: "/purchases",
  sales: "/sales",
  parties: "/parties",
  payments: "/payments",
  expenses: "/expenses",
  reports: "/reports",
  accounting: "/accounting",
  manufacturing: "/manufacturing",
  team: "/team",
  company: "/company",
  appearance: "/appearance",
  printSettings: "/print-settings",
  billing: "/billing",
};
