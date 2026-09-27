import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Point the app's DB singleton at an isolated scratch database so tests never
// touch the real pharmacy data. Runs before any test imports app modules.
const dir = mkdtempSync(join(tmpdir(), "medibill-test-"));
process.env.DATA_DIR = dir;