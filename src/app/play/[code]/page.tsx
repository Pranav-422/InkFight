import { notFound } from "next/navigation";
import { ROOM_CODE } from "@/game/protocol";
import { requireUser } from "@/lib/auth";
import { RoomClient } from "./RoomClient";

export default async function PlayRoomPage({ params, searchParams }: PageProps<"/play/[code]">) {
  const { code } = await params;
  const { fighter } = await searchParams;
  const room = code.toUpperCase();
  if (!ROOM_CODE.test(room)) notFound();
  const user = await requireUser(`/play/${room}`);
  return <RoomClient code={room} userId={user.userId} initialFighter={typeof fighter === "string" ? fighter : null} />;
}
