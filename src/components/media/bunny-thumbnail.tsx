"use client";



import { useEffect, useState } from "react";

import { fetchBunnyPlayback } from "@/lib/bunny/client-upload";

import type { MediaItem } from "@/lib/types";



function isPermanentBunnyCdnUrl(url: string | null | undefined) {

  if (!url) return false;

  return /b-cdn\.net/i.test(url) && !/[?&]token=/i.test(url);

}



/**

 * Bunny thumbnails for normal Client/staff UI never use a permanent CDN URL.

 * When a MediaItem is provided, always load a short-lived signed thumbnail

 * from the authenticated playback endpoint. Fall back to a placeholder.

 */

export function BunnyThumbnail({

  src,

  item,

  workspaceId,

  alt,

  className,

  style,

}: {

  src?: string | null;

  item?: MediaItem;

  workspaceId?: string;

  alt: string;

  className?: string;

  style?: React.CSSProperties;

}) {

  const [failed, setFailed] = useState(false);

  const [secureSrc, setSecureSrc] = useState<string | null>(null);



  useEffect(() => {

    setFailed(false);

    if (!item) {

      setSecureSrc(isPermanentBunnyCdnUrl(src) ? null : src || null);

      return;

    }

    const ws = workspaceId || item.workspaceId || item.companyId;

    if (!ws) {

      setSecureSrc(null);

      return;

    }

    let active = true;

    fetchBunnyPlayback({

      mediaId: item.id,

      projectId: item.projectId,

      workspaceId: ws,

    })

      .then((playback) => {

        if (active) setSecureSrc(playback.thumbnailUrl || null);

      })

      .catch(() => {

        if (active) setSecureSrc(null);

      });

    return () => {

      active = false;

    };

  }, [

    item,

    item?.id,

    item?.projectId,

    item?.workspaceId,

    item?.companyId,

    src,

    workspaceId,

  ]);



  if (!secureSrc || failed) {

    return (

      <div

        className={className}

        style={{

          width: "100%",

          height: "100%",

          background: "#222",

          display: "grid",

          placeItems: "center",

          color: "#fff",

          fontSize: 12,

          ...style,

        }}

      >

        Video

      </div>

    );

  }



  return (

    // eslint-disable-next-line @next/next/no-img-element

    <img

      src={secureSrc}

      alt={alt}

      className={className}

      style={style}

      loading="lazy"

      referrerPolicy="strict-origin-when-cross-origin"

      onError={() => setFailed(true)}

    />

  );

}


