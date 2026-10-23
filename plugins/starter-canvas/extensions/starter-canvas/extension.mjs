import { createCanvas, joinSession } from "@github/copilot-sdk/extension";
import { canvasOptions } from "./canvas.mjs";

await joinSession({ canvases: [createCanvas(canvasOptions)] });
