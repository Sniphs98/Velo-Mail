import { build } from 'esbuild';
import { electronBuilds } from './electron-builds.mjs';

await Promise.all(electronBuilds.map((options) => build(options)));
