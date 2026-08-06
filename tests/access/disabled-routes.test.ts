import { describe, expect, it } from "vitest";
import { POST as createInvitation } from "../../src/app/api/invitations/create/route";
import { POST as acceptInvitation } from "../../src/app/api/invitations/accept/route";
import { POST as accessCreate } from "../../src/app/api/access/create/route";

describe("disabled invitation and legacy access routes", () => {
  it("rejects invitation create with 410", async () => {
    const res = await createInvitation();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe("invitations_disabled");
  });

  it("rejects invitation accept with 410", async () => {
    const res = await acceptInvitation();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe("invitations_disabled");
  });

  it("rejects legacy access create with 410", async () => {
    const res = await accessCreate();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe("access_create_disabled");
  });
});
