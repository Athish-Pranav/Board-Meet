"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, destroySession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await audit({ actorId: user.id, action: "logout", entityType: "User", entityId: user.id, summary: `${user.name} signed out` });
  }
  await destroySession();
  redirect("/login");
}
