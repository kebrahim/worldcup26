"use client";

export default function SyncTime({ value }: { value: string }) {
  return <>{new Date(value).toLocaleString()}</>;
}
