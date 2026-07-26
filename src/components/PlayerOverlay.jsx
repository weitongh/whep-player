import { useStreamContext } from "../context/streamContext";

export default function PlayerOverlay() {
  const { status } = useStreamContext();

  if (status === "live") return null;

  return (
    <div className="absolute inset-0 z-2 flex flex-col items-center justify-center gap-3">
      <div className="text-[clamp(1rem,2.5vw,1.5rem)] font-bold text-foreground">暂未开播，请稍等...</div>
      <div className="text-[clamp(0.6rem,1.5vw,0.9rem)] text-muted">(开播请使用本站推流码)</div>
    </div>
  );
}
