"use client";

export default function MatchTime({ value }: { value: string }) {
  return (
    <>
      {new Date(value).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </>
  );
}
