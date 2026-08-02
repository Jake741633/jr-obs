"use client";

import { supabaseFetch } from "./supabase/client";

export async function updateRecoveredPassword(password: string) {
  if (password.length < 8) throw new Error("Your new password must be at least 8 characters long.");
  await supabaseFetch("/auth/v1/user", {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}
