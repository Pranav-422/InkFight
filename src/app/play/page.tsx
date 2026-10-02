import { requireUser } from "@/lib/auth";
import { PlayClient } from "./PlayClient";

export default async function PlayPage() {
  await requireUser("/play");
  return <PlayClient />;
}
