/**
 * Edge-safe entrypoint. All Node-only work lives in instrumentation.node.ts
 * and is loaded only when NEXT_RUNTIME === "nodejs".
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeInstrumentation } = await import(
      "./instrumentation.node"
    );
    await registerNodeInstrumentation();
  }
}
