/**
 * Extracted from gateway/service.ts. Keep this module focused on its named gateway boundary.
 */
import type { Readable, Writable } from "node:stream";


/**
 * `Readable#pipe` forwards data, not failures: the destination learns when the
 * source ends, but a source `error` event stays on the source.
 *
 * Upstream providers and local proxies routinely close the socket in the middle
 * of a streaming response. The `Readable.fromWeb(upstreamResponse.body)` source
 * created for those responses then emits `TypeError: terminated`
 * (`UND_ERR_SOCKET: other side closed`). Because `pipe` never installs an
 * `error` listener on the source, Node reports it as an unhandled error and
 * terminates the whole gateway process — killing every in-flight session, not
 * just the request that failed.
 *
 * Forwarding the source failure into the piped destination moves it onto the
 * stream the gateway actually sends, so one aborted upstream response becomes
 * one failed client response instead of a gateway crash.
 */
export function pipeWithUpstreamErrorForwarding<T extends Readable & Writable>(
  source: Readable,
  destination: T
): T {
  source.on("error", (error: Error): void => {
    if (!destination.destroyed) {
      destination.destroy(error);
    }
  });
  return source.pipe(destination);
}
