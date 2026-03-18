import { redirect } from "next/navigation";

export default async function Root() {
  // Always show the landing page — login is at /admin/login
  redirect("/home");
}
