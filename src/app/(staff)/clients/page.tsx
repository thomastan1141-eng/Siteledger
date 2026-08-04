import { redirect } from "next/navigation";

/** @deprecated use /access */
export default function ClientsRedirectPage() {
  redirect("/access");
}
