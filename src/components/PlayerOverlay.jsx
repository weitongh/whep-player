import { useStreamContext } from "../context/streamContext";

export default function PlayerOverlay() {
  const { status } = useStreamContext();

  if (status === "live") return null;

  return (
      <div
        className="size-[clamp(3.5rem,8vw,5.5rem)] animate-spin rounded-full
        border-[clamp(4px,0.7vw,6px)] border-muted/30 border-t-foreground"
      />
  );
}
