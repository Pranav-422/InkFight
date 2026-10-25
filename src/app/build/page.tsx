import { requireUser } from "@/lib/auth";
import { clearedFloors } from "@/lib/dungeonProgress";
import { BuildClient } from "./BuildClient";

export const metadata = { title: "Build a fighter · Inkfight" };

export default async function BuildPage() {
  const user = await requireUser("/build");
  return <BuildClient cleared={await clearedFloors(user)} />;
}
