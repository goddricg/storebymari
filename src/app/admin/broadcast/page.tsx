import { redirect } from "next/navigation";

export default function AdminBroadcastRedirectPage() {
  redirect("/admin?menu=operator-mimi");
}
