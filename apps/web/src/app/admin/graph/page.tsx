"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Admin alias → primary Context Graph surface */
export default function AdminGraphRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/graph"); }, [router]);
  return null;
}
