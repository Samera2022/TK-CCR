import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function patchAiGatewaySource(source) {
  const marker = "if(!t.error||t.completed||t.syntheticCompletionSent)return;";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    if (source.includes("event: response.failed") && source.includes("msg_gateway_error_")) return source;
    throw new Error("Unable to locate ai-gateway synthetic error response.");
  }
  const functionStart = source.lastIndexOf("function ", markerIndex);
  const functionEnd = source.indexOf("}async function ", markerIndex);
  if (functionStart < 0 || functionEnd < 0) {
    throw new Error("Unable to bound ai-gateway synthetic error response.");
  }
  const functionName = source.slice(functionStart + "function ".length, source.indexOf("(", functionStart));
  const replacement = `function ${functionName}(e,n,t){if(!t.error||t.completed||t.syntheticCompletionSent)return;t.syntheticCompletionSent=!0;const r=t.responseId||\`resp_gateway_error_\${Date.now()}\`,o=\`msg_gateway_error_\${Date.now()}\`,i=t.error.code||t.error.type||"upstream_error",s=t.error.message||"Upstream Responses stream failed.",u={id:r,object:"response",created_at:Math.floor(Date.now()/1e3),status:"failed",model:t.responseModel||"unknown",output_text:"",output:t.outputItems.filter(Boolean),error:{type:t.error.type||"upstream_error",code:i,message:s}};n.enqueue(e.encode("event: response.failed\\ndata: "+JSON.stringify({type:"response.failed",response:u})+"\\n\\n"))}`;
  const patched = source.slice(0, functionStart) + replacement + source.slice(functionEnd + 1);
  if (!patched.includes("event: response.failed") || patched.includes("event: response.completed")) {
    throw new Error("Failed to patch ai-gateway synthetic error response.");
  }
  return patched;
}

export function patchInstalledAiGateway(packageRoot) {
  const entry = path.join(packageRoot, "dist", "index.js");
  const source = readFileSync(entry, "utf8");
  const patched = patchAiGatewaySource(source);
  if (patched !== source) writeFileSync(entry, patched);
}
