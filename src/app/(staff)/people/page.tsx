import { redirect } from "next/navigation";

/** Backward-compatible route → Project Access */
export default function PeopleRedirectPage() {
  redirect("/access");
}
