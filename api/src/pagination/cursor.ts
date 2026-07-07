import { badRequest } from "../errors/problem.js";

interface SeqCursor {
  seq: number;
}

export function encodeCursor(seq: number): string {
  return Buffer.from(JSON.stringify({ seq }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "seq" in parsed &&
      typeof (parsed as SeqCursor).seq === "number" &&
      Number.isInteger((parsed as SeqCursor).seq) &&
      (parsed as SeqCursor).seq >= 0
    ) {
      return (parsed as SeqCursor).seq;
    }
  } catch {
    // fall through to badRequest below
  }

  throw badRequest("Invalid cursor.", [{ field: "cursor", message: "is not a valid cursor" }]);
}
