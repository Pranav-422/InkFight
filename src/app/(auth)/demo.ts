// Sample accounts created by prisma/seed.ts. Shown on the login page on purpose.
export const DEMO_ACCOUNTS = [
  { email: "demo1@inkfight.app", password: "inkfight123", name: "InkNinja" },
  { email: "demo2@inkfight.app", password: "inkfight123", name: "DoodleDon" },
];

// Everyone shares these, so nobody may set their security question or reset their password (that locks everyone else out).
export const isDemoEmail = (email: string) => DEMO_ACCOUNTS.some((a) => a.email === email.trim().toLowerCase());
