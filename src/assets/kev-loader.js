import * as kev from 'https://esm.sh/@ai-ecoverse/kev.js@0.5.0?bundle';
import { Tokenizer } from 'https://esm.sh/@huggingface/tokenizers@0.2.0?bundle';
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.webgpu.bundle.min.mjs';

window.kevBrowserModules = { kev, ort, Tokenizer };
