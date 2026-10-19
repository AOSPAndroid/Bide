// The hosted demo omits the model pack. Avoid shipping ONNX/WASM that cannot
// run there; the full offline build continues to use ai.ts unchanged.
export const aiBackend='';
export async function aiAvailable(){return false;}
export async function runModel():Promise<never>{throw new Error('AI models are included in the downloadable local edition.');}
