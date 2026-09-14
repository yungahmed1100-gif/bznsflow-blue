import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkBlue } from './check-blue-environment.mjs';

const project = JSON.parse(readFileSync(new URL('../.vercel/project.json', import.meta.url), 'utf8'));
checkBlue(process.env, project);
const result = spawnSync('vercel', ['deploy', '--prod', '--yes', '--project', project.projectId], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
