import { SHAPES } from "@/game/pieces";
import type { PieceId } from "@/game/types";
import { cn } from "@/lib/utils";

const COLOR: Record<PieceId, string> = {
  I: "bg-i",
  O: "bg-o",
  T: "bg-t",
  S: "bg-s",
  Z: "bg-z",
  J: "bg-j",
  L: "bg-l",
};

export function MiniPiece({ type, cell = 8 }: { type: PieceId | null; cell?: number }) {
  if (!type) {
    return <div className="opacity-30" style={{ width: cell * 4, height: cell * 3 }} />;
  }
  const cells = SHAPES[type][0]!;
  return (
    <div className="relative" style={{ width: cell * 4, height: cell * 3 }}>
      {cells.map(([x, y], i) => (
        <span
          key={i}
          className={cn("absolute", COLOR[type])}
          style={{ left: x * cell, top: y * cell, width: cell - 1, height: cell - 1 }}
        />
      ))}
    </div>
  );
}
