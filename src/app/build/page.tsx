import { requireUser } from "@/lib/auth";
import { BuildClient } from "./BuildClient";

export const metadata = { title: "Build a fighter · Inkfight" };

export default async function BuildPage() {
  await requireUser("/build");
  return <BuildClient />;
}
