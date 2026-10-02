import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthForm } from "../AuthForm";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  if (await getSession()) redirect(nextPath ?? "/create");
  return (
    <div className="py-6">
      <AuthForm mode="signup" next={nextPath} />
    </div>
  );
}
