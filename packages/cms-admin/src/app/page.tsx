import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("cms-session")?.value;
    if (!token) return false;
    const secret = process.env.CMS_JWT_SECRET ?? "cms-dev-secret-change-me-in-production";
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export default async function Root() {
  if (await isAuthenticated()) {
    redirect("/admin");
  }
  // Unauthenticated users go to login
  redirect("/admin/login");
}
