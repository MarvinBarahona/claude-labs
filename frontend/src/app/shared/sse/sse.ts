export interface ParsedSseEvent {
  readonly event: string;
  readonly data: unknown;
}

/** Parses one `event: <type>\ndata: <json>` SSE frame (blank-line-terminated) into a typed event. */
export function parseSseFrame(frame: string): ParsedSseEvent | null {
  let eventType = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  try {
    return { event: eventType, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

/** Reads a fetch `Response` body as newline-delimited SSE frames, invoking `onFrame` for each successfully parsed event in arrival order. */
export async function readSseStream(
  response: Response,
  onFrame: (event: ParsedSseEvent) => void | Promise<void>,
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) {
      buffer += decoder.decode(chunk.value, { stream: !done });
    }

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex !== -1) {
      const frame = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      const parsed = parseSseFrame(frame);
      if (parsed) {
        await onFrame(parsed);
      }
      boundaryIndex = buffer.indexOf('\n\n');
    }
  }
}
