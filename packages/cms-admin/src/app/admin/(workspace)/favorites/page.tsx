import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { FavoritesList } from "@/components/favorites-list";

export default async function FavoritesPage() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) redirect("/admin/login");

  return (
    <>
      <ActionBar>
        <ActionBarBreadcrumb items={["Favorites"]} />
      </ActionBar>
      <div className="p-8">
        <FavoritesList />
      </div>
    </>
  );
}
