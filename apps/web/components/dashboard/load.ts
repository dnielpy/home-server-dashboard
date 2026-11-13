import { ApiUnavailableError, SourceUnavailableError } from "@/lib/api";

const SOURCE_NAMES: Record<string, string> = {
  bluetti: "The Bluetti API",
  homenet: "Home Net",
  localtube: "LocalTube",
  agent: "The agent on the server",
};

export type Loaded<T> = { data: T; error?: never } | { data?: never; error: string };

/** Runs a fetcher of the dashboard API and turns a failure into the message its card shows. */
export async function load<T>(fetcher: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await fetcher() };
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      return { error: `${SOURCE_NAMES[error.source] ?? error.source} is not answering.` };
    }
    if (error instanceof ApiUnavailableError) {
      return { error: "Could not reach the dashboard API. Make sure it is running." };
    }
    throw error;
  }
}
