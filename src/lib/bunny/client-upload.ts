import * as tus from "tus-js-client";
import { getFirebaseAuth } from "@/lib/firebase";

export type BunnyUploadProgress = {
  status:
    | "preparing"
    | "uploading"
    | "paused"
    | "retrying"
    | "complete"
    | "processing"
    | "failed"
    | "cancelled";
  percent: number;
  mediaId?: string;
  error?: string;
};

async function authHeaders() {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function createBunnyUploadSession(input: {
  projectId: string;
  workspaceId: string;
  file: File;
  clientUploadId: string;
  title?: string;
  description?: string;
  clientVisible?: boolean;
  capturedAt?: string;
}) {
  const res = await fetch("/api/bunny/videos/create-upload", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      title: input.title || input.file.name,
      description: input.description,
      clientVisible: Boolean(input.clientVisible),
      capturedAt: input.capturedAt,
      fileName: input.file.name,
      fileType: input.file.type || "video/mp4",
      fileSize: input.file.size,
      clientUploadId: input.clientUploadId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error || "The video upload could not be completed. You can try again.",
    );
  }
  return data as {
    mediaId: string;
    videoId: string;
    libraryId: string;
    expirationTime: number;
    signature: string;
    tusEndpoint: string;
  };
}

export function startBunnyTusUpload(input: {
  file: File;
  session: {
    mediaId: string;
    videoId: string;
    libraryId: string;
    expirationTime: number;
    signature: string;
    tusEndpoint: string;
  };
  onProgress: (update: BunnyUploadProgress) => void;
}): {
  abort: () => void;
  promise: Promise<string>;
} {
  let upload: tus.Upload | null = null;
  let aborted = false;

  const promise = new Promise<string>((resolve, reject) => {
    upload = new tus.Upload(input.file, {
      endpoint: input.session.tusEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
      removeFingerprintOnSuccess: true,
      headers: {
        AuthorizationSignature: input.session.signature,
        AuthorizationExpire: String(input.session.expirationTime),
        VideoId: input.session.videoId,
        LibraryId: input.session.libraryId,
      },
      metadata: {
        filetype: input.file.type || "video/mp4",
        title: input.file.name,
      },
      onError(error) {
        if (aborted) return;
        input.onProgress({
          status: "failed",
          percent: 0,
          mediaId: input.session.mediaId,
          error:
            "The video upload could not be completed. You can try again.",
        });
        reject(error);
      },
      onProgress(bytesUploaded, bytesTotal) {
        if (aborted || !bytesTotal) return;
        input.onProgress({
          status: "uploading",
          percent: Math.min(
            99,
            Math.round((bytesUploaded / bytesTotal) * 100),
          ),
          mediaId: input.session.mediaId,
        });
      },
      onSuccess() {
        if (aborted) return;
        input.onProgress({
          status: "complete",
          percent: 100,
          mediaId: input.session.mediaId,
        });
        resolve(input.session.mediaId);
      },
    });

    void (async () => {
      try {
        input.onProgress({
          status: "preparing",
          percent: 0,
          mediaId: input.session.mediaId,
        });
        const previous = await upload!.findPreviousUploads();
        if (previous.length) {
          upload!.resumeFromPreviousUpload(previous[0]!);
        }
        if (aborted) return;
        input.onProgress({
          status: "uploading",
          percent: 0,
          mediaId: input.session.mediaId,
        });
        upload!.start();
      } catch (err) {
        if (!aborted) reject(err);
      }
    })();
  });

  return {
    abort() {
      aborted = true;
      try {
        upload?.abort(true);
      } catch {
        /* ignore */
      }
      input.onProgress({
        status: "cancelled",
        percent: 0,
        mediaId: input.session.mediaId,
      });
    },
    promise,
  };
}

export async function markBunnyUploadComplete(input: {
  mediaId: string;
  projectId: string;
  workspaceId: string;
}) {
  const res = await fetch(
    `/api/bunny/videos/${encodeURIComponent(input.mediaId)}/upload-complete`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      }),
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data.error || "The video upload could not be completed. You can try again.",
    );
  }
}

export async function cancelBunnyUpload(input: {
  mediaId: string;
  projectId: string;
  workspaceId: string;
}) {
  await fetch(
    `/api/bunny/videos/${encodeURIComponent(input.mediaId)}/cancel`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      }),
    },
  ).catch(() => undefined);
}

export async function syncBunnyMedia(input: {
  mediaId: string;
  projectId: string;
  workspaceId: string;
}) {
  const res = await fetch(
    `/api/bunny/videos/${encodeURIComponent(input.mediaId)}/sync`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Could not refresh video status.");
  }
  return data;
}

export async function deleteBunnyMedia(input: {
  mediaId: string;
  projectId: string;
  workspaceId: string;
}) {
  const res = await fetch(
    `/api/bunny/videos/${encodeURIComponent(input.mediaId)}`,
    {
      method: "DELETE",
      headers: await authHeaders(),
      body: JSON.stringify({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error || "The video could not be deleted. Please try again.",
    );
  }
}

export async function fetchBunnyPlayback(input: {
  mediaId: string;
  projectId: string;
  workspaceId: string;
}) {
  const params = new URLSearchParams({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  const res = await fetch(
    `/api/bunny/videos/${encodeURIComponent(input.mediaId)}/playback?${params}`,
    {
      headers: await authHeaders(),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        data.error || "You do not have access to this video.",
      );
    }
    throw new Error(
      data.error || "Your video session expired. Press Play to continue.",
    );
  }
  return data as {
    embedUrl: string;
    expires: number;
  };
}

/** Upload one video file via Bunny TUS and mark processing. */
export async function uploadVideoFileViaBunny(input: {
  projectId: string;
  workspaceId: string;
  file: File;
  title?: string;
  clientVisible?: boolean;
  capturedAt?: string;
  onProgress?: (pct: number, status: BunnyUploadProgress["status"]) => void;
}): Promise<string> {
  const clientUploadId = crypto.randomUUID();
  input.onProgress?.(0, "preparing");
  const session = await createBunnyUploadSession({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    file: input.file,
    clientUploadId,
    title: input.title || input.file.name,
    clientVisible: input.clientVisible,
    capturedAt: input.capturedAt,
  });

  const { promise } = startBunnyTusUpload({
    file: input.file,
    session,
    onProgress(update) {
      input.onProgress?.(update.percent, update.status);
    },
  });

  const mediaId = await promise;
  await markBunnyUploadComplete({
    mediaId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  input.onProgress?.(100, "processing");
  return mediaId;
}
