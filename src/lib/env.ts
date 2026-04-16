export function isLocalMode() {
  return process.env.NEXT_PUBLIC_LOCAL_MODE === "true";
}
