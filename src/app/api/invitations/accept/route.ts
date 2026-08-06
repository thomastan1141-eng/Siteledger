import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Invitation accept is retired — access is granted immediately on Share. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Invitation links are no longer accepted. Ask the project owner to share access directly.",
      code: "invitations_disabled",
    },
    { status: 410 },
  );
}
