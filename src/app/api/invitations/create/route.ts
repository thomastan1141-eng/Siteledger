import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Invitation create is retired — use POST /api/access/share. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Invitations are no longer used. Share the project directly with an existing verified SiteLedger account.",
      code: "invitations_disabled",
    },
    { status: 410 },
  );
}
