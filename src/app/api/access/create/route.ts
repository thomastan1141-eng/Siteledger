import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Legacy password-provisioning bypass is disabled.
 * Use POST /api/access/share with an existing, email-verified account.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Creating accounts from Project Access is disabled. Share with an existing verified SiteLedger account.",
      code: "access_create_disabled",
    },
    { status: 410 },
  );
}
