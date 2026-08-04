import { NextResponse } from "next/server";
import { BUNNY_MAX_UPLOAD_BYTES } from "@/lib/bunny/config";
import {
  createBunnyMediaRecord,
  findMediaByClientUploadId,
} from "@/lib/bunny/media-store";
import {
  createBunnyVideo,
  createTusCredentials,
  deleteBunnyVideo,
} from "@/lib/bunny/server";
import { authErrorResponse, verifyAuthenticatedRequest } from "@/lib/server/auth";
import { bunnyConfig } from "@/lib/server/bunny-config";
import {
  assertClientVisibleAllowed,
  assertProjectPermission,
} from "@/lib/server/project-permissions";
import { getAdminDb } from "@/lib/firebase-admin";
import { todayKey } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  workspaceId?: string;
  title?: string;
  description?: string;
  clientVisible?: boolean;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  clientUploadId?: string;
};

export async function POST(request: Request) {
  try {
    const user = await verifyAuthenticatedRequest(request);
    const body = (await request.json()) as Body;

    const projectId = (body.projectId || "").trim();
    const fileName = (body.fileName || "").trim();
    const fileType = (body.fileType || "").trim().toLowerCase();
    const fileSize = Number(body.fileSize || 0);
    const clientUploadId = (body.clientUploadId || "").trim();
    const title = (body.title || fileName || "Untitled video").trim();
    const description = (body.description || "").trim() || null;
    const clientVisible = Boolean(body.clientVisible);

    if (!projectId) {
      return NextResponse.json({ error: "Project is required." }, { status: 400 });
    }
    if (!fileName || !fileType || !clientUploadId) {
      return NextResponse.json(
        { error: "File details are required." },
        { status: 400 },
      );
    }
    if (!fileType.startsWith("video/")) {
      return NextResponse.json(
        { error: "Only video files can be uploaded here." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json(
        { error: "The video file is empty." },
        { status: 400 },
      );
    }
    if (fileSize > BUNNY_MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "This video is too large. Maximum size is 5 GB." },
        { status: 400 },
      );
    }

    const ctx = await assertProjectPermission({
      uid: user.uid,
      projectId,
      workspaceId: body.workspaceId,
      action: "UPLOAD_MEDIA",
    });
    await assertClientVisibleAllowed(ctx, clientVisible);

    const existing = await findMediaByClientUploadId(
      ctx.workspaceId,
      projectId,
      clientUploadId,
    );
    const existingVideoId = existing
      ? String(existing.bunnyVideoId || "")
      : "";
    if (existing && existingVideoId) {
      const tus = createTusCredentials(existingVideoId);
      return NextResponse.json({
        mediaId: existing.id,
        videoId: tus.videoId,
        libraryId: tus.libraryId,
        expirationTime: tus.expirationTime,
        signature: tus.signature,
        tusEndpoint: tus.tusEndpoint,
        resumed: true,
      });
    }

    let bunnyVideoId = "";
    try {
      bunnyVideoId = await createBunnyVideo(title);
      const account = await getAdminDb().doc(`users/${user.uid}`).get();
      const companyUser = await getAdminDb()
        .doc(`companies/${ctx.workspaceId}/users/${user.uid}`)
        .get();
      const uploadedByName =
        String(
          account.data()?.displayName ||
            companyUser.data()?.displayName ||
            user.email ||
            "Team",
        ) || "Team";

      const media = await createBunnyMediaRecord({
        workspaceId: ctx.workspaceId,
        projectId,
        bunnyVideoId,
        title,
        description,
        clientVisible,
        fileName,
        fileType,
        fileSize,
        uploadedBy: user.uid,
        uploadedByName,
        clientUploadId,
        date: todayKey(),
      });

      const tus = createTusCredentials(bunnyVideoId);
      return NextResponse.json({
        mediaId: media.id,
        videoId: tus.videoId,
        libraryId: bunnyConfig.libraryId,
        expirationTime: tus.expirationTime,
        signature: tus.signature,
        tusEndpoint: tus.tusEndpoint,
        resumed: false,
      });
    } catch (err) {
      if (bunnyVideoId) {
        const rolledBack = await deleteBunnyVideo(bunnyVideoId);
        console.error("[bunny] create-upload rollback", {
          bunnyVideoId,
          rolledBack,
        });
      }
      throw err;
    }
  } catch (err) {
    const auth = authErrorResponse(err);
    if (auth.status === 401 || auth.status === 403) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const status =
      typeof err === "object" && err && "status" in err
        ? Number((err as { status?: number }).status) || 500
        : 500;
    console.error("[bunny/create-upload]", err);
    return NextResponse.json(
      {
        error:
          status === 503
            ? "Video service is not configured."
            : err instanceof Error && status < 500
              ? err.message
              : "The video upload could not be started. Please try again.",
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
