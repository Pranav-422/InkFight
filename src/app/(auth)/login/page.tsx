import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthForm } from "../AuthForm";
import { DEMO_ACCOUNTS } from "../demo";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  if (await getSession()) redirect(nextPath ?? "/create");
  return (
    <div className="py-6">
      <AuthForm mode="login" next={nextPath} demo={DEMO_ACCOUNTS.map(({ email, password }) => ({ email, password }))} />
    </div>
  );
}
