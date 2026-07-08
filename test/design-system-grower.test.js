import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildCatalog,
  extractClassCompositionCalls,
  extractCvaDefinitions,
  extractJsxClassNames,
  startReviewServer,
} from '../src/index.js';
import { main, parseArgs } from '../src/cli.js';

test('extractJsxClassNames finds JSX elements with literal className strings', () => {
  const source = `
    export function Card() {
      return <article className="rounded border bg-white p-4 shadow">
        <button className={'inline-flex items-center rounded px-3 py-2 text-sm'}>Save</button>
      </article>;
    }
  `;

  const matches = extractJsxClassNames(source, 'src/Card.tsx');

  assert.equal(matches.length, 2);
  assert.equal(matches[0].element, 'article');
  assert.deepEqual(matches[0].classes, ['rounded', 'border', 'bg-white', 'p-4', 'shadow']);
  assert.equal(matches[1].element, 'button');
  assert.equal(matches[1].line, 4);
});

test('buildCatalog scans source files and scores duplicated UI clusters', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Button.tsx': `
      export function PrimaryButton() {
        return <button className="inline-flex items-center rounded px-3 py-2 text-sm font-medium bg-blue-600 text-white">Save</button>;
      }
      export function SecondaryButton() {
        return <button className="inline-flex items-center rounded px-3 py-2 text-sm font-medium bg-blue-600 text-white">Done</button>;
      }
    `,
    'src/Card.jsx': `
      export function Card() {
        return <section className="rounded border bg-white p-4 shadow-sm">Card</section>;
      }
    `,
    'src/Inline.js': `
      export function Inline() {
        return <span className="inline-flex items-center rounded px-3 py-2 text-sm">Label</span>;
      }
    `,
    'src/types.d.ts': 'export type Ignored = string;',
    'node_modules/vendor/Ignored.tsx': '<div className="ignored" />',
  });

  const catalog = await buildCatalog(fixtureDir);

  assert.equal(catalog.summary.filesScanned, 3);
  assert.equal(catalog.summary.elementsWithClassName, 4);
  assert.ok(catalog.summary.duplicateClusters >= 1);
  assert.equal(catalog.clusters[0].type, 'exact');
  assert.equal(catalog.clusters[0].occurrences, 2);
  assert.equal(catalog.clusters[0].examples[0].element, 'button');
  assert.deepEqual(catalog.clusters[0].variantClasses, []);
  assert.ok(catalog.clusters[0].score > 0);
});

test('extractClassCompositionCalls reads static classes from cn calls', () => {
  const source = `
    import { cn } from "@/lib/utils";
    export function Notice({ active }) {
      return <div className={cn("rounded border p-4", active && "bg-blue-50 text-blue-900")} />;
    }
  `;

  const calls = extractClassCompositionCalls(source, 'src/Notice.tsx');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].element, 'div');
  assert.deepEqual(calls[0].classes, ['rounded', 'border', 'p-4', 'bg-blue-50', 'text-blue-900']);
});

test('extractCvaDefinitions reads cva classes and variant names', () => {
  const source = `
    export const buttonVariants = cva(
      "inline-flex items-center rounded-md text-sm",
      {
        variants: {
          variant: {
            default: "bg-primary text-primary-foreground",
            destructive: "bg-destructive text-white"
          },
          size: {
            sm: "h-8 px-3",
            lg: "h-10 px-8"
          }
        }
      }
    );
  `;

  const definitions = extractCvaDefinitions(source, 'components/ui/button.tsx');

  assert.equal(definitions.length, 1);
  assert.ok(definitions[0].classes.includes('inline-flex'));
  assert.ok(definitions[0].classes.includes('bg-primary'));
  assert.ok(definitions[0].variants.includes('variant'));
  assert.ok(definitions[0].variants.includes('size'));
});

test('buildCatalog detects shadcn, cva, library customization, and legacy styling situations', async () => {
  const fixtureDir = await makeFixtureRepo({
    'components/ui/button.tsx': `
      import { cva } from "class-variance-authority";
      export const buttonVariants = cva("inline-flex items-center rounded-md text-sm", {
        variants: {
          variant: { default: "bg-primary text-primary-foreground", secondary: "bg-secondary" },
          size: { default: "h-9 px-4", sm: "h-8 px-3" }
        }
      });
      export function Button(props) {
        return <button className="inline-flex items-center rounded-md text-sm h-9 px-4" {...props} />;
      }
    `,
    'src/BillingActions.tsx': `
      import { Button } from "@/components/ui/button";
      import { cn } from "@/lib/utils";
      export function BillingActions() {
        return <>
          <Button className="inline-flex items-center rounded-md text-sm h-9 px-4 bg-black text-white" />
          <Button className="inline-flex items-center rounded-md text-sm h-9 px-4 bg-zinc-950 text-white" />
          <div className={cn("rounded border p-4", "bg-white shadow-sm")} />
          <section className={cn("rounded border p-4", "bg-white shadow-sm")} />
        </>;
      }
    `,
    'src/MuiThing.tsx': `
      import { Button } from "@mui/material";
      import { Box } from "@chakra-ui/react";
      import { Group } from "@mantine/core";
      import { Modal } from "antd";
      import * as Dialog from "@radix-ui/react-dialog";
      export function MuiThing() {
        return <Button sx={{ borderRadius: 999 }}>Pay</Button>;
      }
    `,
    'src/Legacy.tsx': `
      import styles from "./Legacy.module.css";
      export function Legacy() {
        return <div className={styles.root}>Legacy</div>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const situationIds = catalog.situations.map((situation) => situation.id);

  assert.equal(catalog.inventory.shadcn.detected, true);
  assert.ok(situationIds.includes('repeated-ui-patterns'));
  assert.ok(situationIds.includes('shadcn-project'));
  assert.ok(situationIds.includes('shadcn-classname-overrides'));
  assert.ok(situationIds.includes('shadcn-cva-variants'));
  assert.ok(situationIds.includes('component-library-customization'));
  assert.ok(situationIds.includes('primitive-wrappers'));
  assert.ok(situationIds.includes('legacy-mixed-styling'));
  assert.equal(catalog.situations.find((situation) => situation.id === 'primitive-wrappers').primaryResponse, 'observe-only primitive signal');
  assert.equal(catalog.situations.find((situation) => situation.id === 'component-library-customization').primaryResponse, 'observe-only library signal');
  assert.ok(catalog.candidates.some((candidate) => candidate.actionType === 'promote-variant'));
  assert.ok(catalog.candidates.some((candidate) => candidate.actionType === 'unsupported'));
});

test('buildCatalog does not require shadcn to produce reusable UI candidates', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Marketing.tsx': `
      export function Marketing() {
        return <>
          <button className="inline-flex items-center rounded px-4 py-2 text-sm bg-black text-white">Start</button>
          <a className="inline-flex items-center rounded px-4 py-2 text-sm bg-zinc-950 text-white">Docs</a>
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const situationIds = catalog.situations.map((situation) => situation.id);

  assert.equal(catalog.inventory.shadcn.detected, false);
  assert.ok(situationIds.includes('repeated-ui-patterns'));
  assert.equal(catalog.candidates[0].actionType, 'promote-variant');
});

test('buildCatalog recommends wrappers for repeated component overrides', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Cards.tsx': `
      export function Cards() {
        return <>
          <Card className="rounded border bg-white p-4 shadow-sm" />
          <Card className="rounded border bg-white p-4 shadow-sm" />
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);

  assert.equal(catalog.candidates[0].actionType, 'wrap');
  assert.equal(catalog.candidates[0].safetyLevel, 'review-required');
});

test('main writes a JSON catalog to the requested output path', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <>
          <input className="block w-full rounded border px-3 py-2 text-sm" />
          <select className="block w-full rounded border px-3 py-2 text-sm" />
        </>;
      }
    `,
  });
  const outputPath = path.join(fixtureDir, 'catalog.json');
  let stdout = '';

  const exitCode = await main([fixtureDir, '--out', outputPath], {
    stdout: { write: (message) => { stdout += message; } },
  });
  const catalog = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  const inventory = JSON.parse(await fs.readFile(path.join(fixtureDir, 'inventory.json'), 'utf8'));
  const situations = JSON.parse(await fs.readFile(path.join(fixtureDir, 'situations.json'), 'utf8'));
  const candidates = JSON.parse(await fs.readFile(path.join(fixtureDir, 'candidates.json'), 'utf8'));
  const decisionData = JSON.parse(await fs.readFile(path.join(fixtureDir, 'decisions.json'), 'utf8'));
  const assets = JSON.parse(await fs.readFile(path.join(fixtureDir, 'assets.json'), 'utf8'));
  const assetsMarkdown = await fs.readFile(path.join(fixtureDir, 'assets.md'), 'utf8');
  const decisions = await fs.readFile(path.join(fixtureDir, 'decisions.md'), 'utf8');
  const agentRules = await fs.readFile(path.join(fixtureDir, 'agent-rules.md'), 'utf8');
  const reviewHtml = await fs.readFile(path.join(fixtureDir, 'review.html'), 'utf8');

  assert.equal(exitCode, 0);
  assert.match(stdout, /Wrote 1 clusters/);
  assert.equal(catalog.summary.duplicateClusters, 1);
  assert.equal(inventory.counts.files, 1);
  assert.ok(Array.isArray(situations));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].assetNameSuggestion, 'FieldPattern');
  assert.equal(decisionData[0].status, 'needs-decision');
  assert.deepEqual(assets, []);
  assert.match(assetsMarkdown, /No UI assets have been approved yet/);
  assert.match(decisions, /Candidate Decisions/);
  assert.match(decisions, /Suggested asset name: FieldPattern/);
  assert.match(decisions, /dsg decide design-system candidate-001 reuse --name FieldPattern/);
  assert.match(agentRules, /Do not rewrite usages automatically/);
  assert.match(reviewHtml, /Needs Your Decision/);
  assert.match(reviewHtml, /candidate-001/);
  assert.match(reviewHtml, /Recommended decision/);
  assert.match(reviewHtml, /FieldPattern/);
  assert.match(reviewHtml, /dsg decide design-system candidate-001 reuse --name FieldPattern/);
  assert.match(reviewHtml, /Decision options/);
  assert.match(reviewHtml, /catalog\.json/);
  assert.match(reviewHtml, /agent-rules\.md/);
  assert.match(reviewHtml, /Source locations/);
  assert.match(reviewHtml, /Variant classes/);
});

test('review server serves review board and generated artifacts', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <>
          <input className="block w-full rounded border px-3 py-2 text-sm" />
          <select className="block w-full rounded border px-3 py-2 text-sm" />
        </>;
      }
    `,
  });
  const outputPath = path.join(fixtureDir, 'design-system', 'catalog.json');

  await main([fixtureDir, '--out', outputPath], {
    stdout: { write: () => {} },
  });

  const review = await startReviewServer({
    artifactsDir: path.join(fixtureDir, 'design-system'),
    port: 0,
  });

  try {
    const reviewResponse = await fetch(review.url);
    const reviewHtml = await reviewResponse.text();
    const candidatesResponse = await fetch(new URL('/candidates.json', review.url));
    const candidates = await candidatesResponse.json();

    assert.equal(reviewResponse.status, 200);
    assert.match(reviewHtml, /design-system-grower review/);
    assert.match(reviewHtml, /dsg decide design-system candidate-001 reuse --name FieldPattern/);
    assert.equal(candidatesResponse.status, 200);
    assert.equal(candidates[0].assetNameSuggestion, 'FieldPattern');
  } finally {
    await new Promise((resolve) => {
      review.server.close(resolve);
    });
  }
});

test('instruct regenerates agent rules from approved decisions', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Actions.tsx': `
      export function Actions() {
        return <>
          <button className="inline-flex items-center rounded px-4 py-2 text-sm bg-black text-white">Save</button>
          <a className="inline-flex items-center rounded px-4 py-2 text-sm bg-zinc-950 text-white">Docs</a>
        </>;
      }
    `,
  });
  const outputPath = path.join(fixtureDir, 'catalog.json');

  await main([fixtureDir, '--out', outputPath], {
    stdout: { write: () => {} },
  });

  const decisionsPath = path.join(fixtureDir, 'decisions.json');
  const decisions = JSON.parse(await fs.readFile(decisionsPath, 'utf8'));
  decisions[0] = {
    ...decisions[0],
    userDecision: 'promote-variant',
    status: 'approved',
    assetName: 'PrimaryAction',
  };
  await fs.writeFile(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`, 'utf8');

  let stdout = '';
  const exitCode = await main(['instruct', fixtureDir], {
    stdout: { write: (message) => { stdout += message; } },
  });
  const agentRules = await fs.readFile(path.join(fixtureDir, 'agent-rules.md'), 'utf8');
  const assets = JSON.parse(await fs.readFile(path.join(fixtureDir, 'assets.json'), 'utf8'));
  const assetsMarkdown = await fs.readFile(path.join(fixtureDir, 'assets.md'), 'utf8');

  assert.equal(exitCode, 0);
  assert.match(stdout, /Wrote agent rules/);
  assert.match(agentRules, /Approved UI Decisions/);
  assert.match(agentRules, /Use or introduce PrimaryAction/);
  assert.doesNotMatch(agentRules, /Review candidate-001 before adding similar UI/);
  assert.equal(assets[0].name, 'PrimaryAction');
  assert.equal(assets[0].actionType, 'promote-variant');
  assert.match(assetsMarkdown, /## PrimaryAction/);
});

test('decide approves a candidate and refreshes agent rules and assets', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Cards.tsx': `
      export function Cards() {
        return <>
          <Card className="rounded border bg-white p-4 shadow-sm" />
          <Card className="rounded border bg-white p-4 shadow-sm" />
        </>;
      }
    `,
  });
  const outputPath = path.join(fixtureDir, 'catalog.json');

  await main([fixtureDir, '--out', outputPath], {
    stdout: { write: () => {} },
  });

  let stdout = '';
  const exitCode = await main(['decide', fixtureDir, 'candidate-001', 'wrap', '--name', 'SurfaceCard'], {
    stdout: { write: (message) => { stdout += message; } },
  });
  const decisions = JSON.parse(await fs.readFile(path.join(fixtureDir, 'decisions.json'), 'utf8'));
  const agentRules = await fs.readFile(path.join(fixtureDir, 'agent-rules.md'), 'utf8');
  const assets = JSON.parse(await fs.readFile(path.join(fixtureDir, 'assets.json'), 'utf8'));
  const assetsMarkdown = await fs.readFile(path.join(fixtureDir, 'assets.md'), 'utf8');

  assert.equal(exitCode, 0);
  assert.match(stdout, /Approved candidate-001 as wrap/);
  assert.equal(decisions[0].status, 'approved');
  assert.equal(decisions[0].userDecision, 'wrap');
  assert.equal(decisions[0].assetName, 'SurfaceCard');
  assert.match(agentRules, /Prefer SurfaceCard as a wrapper component/);
  assert.equal(assets[0].name, 'SurfaceCard');
  assert.equal(assets[0].candidateId, 'candidate-001');
  assert.equal(assets[0].actionType, 'wrap');
  assert.ok(assets[0].commonClasses.includes('rounded'));
  assert.equal(assets[0].source.occurrences, 2);
  assert.match(assetsMarkdown, /## SurfaceCard/);
});

test('install-instructions writes AGENTS and CLAUDE files without overwriting by default', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Actions.tsx': `
      export function Actions() {
        return <>
          <button className="inline-flex items-center rounded px-4 py-2 text-sm bg-black text-white">Save</button>
          <a className="inline-flex items-center rounded px-4 py-2 text-sm bg-zinc-950 text-white">Docs</a>
        </>;
      }
    `,
  });
  const outputPath = path.join(fixtureDir, 'design-system', 'catalog.json');

  await main([fixtureDir, '--out', outputPath], {
    stdout: { write: () => {} },
  });
  await main(['decide', path.join(fixtureDir, 'design-system'), 'candidate-001', 'promote-variant', '--name', 'PrimaryAction'], {
    stdout: { write: () => {} },
  });

  const agentsPath = path.join(fixtureDir, 'AGENTS.md');
  const claudePath = path.join(fixtureDir, 'CLAUDE.md');
  let stdout = '';
  const exitCode = await main([
    'install-instructions',
    path.join(fixtureDir, 'design-system'),
    '--agents-out',
    agentsPath,
    '--claude-out',
    claudePath,
  ], {
    stdout: { write: (message) => { stdout += message; } },
  });
  const agents = await fs.readFile(agentsPath, 'utf8');
  const claude = await fs.readFile(claudePath, 'utf8');

  assert.equal(exitCode, 0);
  assert.match(stdout, /Installed UI agent instructions/);
  assert.match(agents, /# AGENTS.md/);
  assert.match(agents, /Use or introduce PrimaryAction/);
  assert.match(claude, /# CLAUDE.md/);
  await assert.rejects(
    () => main([
      'install-instructions',
      path.join(fixtureDir, 'design-system'),
      '--agents-out',
      agentsPath,
      '--claude-out',
      claudePath,
    ], { stdout: { write: () => {} } }),
    /already exists/,
  );
});

test('parseArgs rejects invalid options before running the scanner', () => {
  assert.throws(() => parseArgs(['--min-occurrences', '1']), /greater than or equal to 2/);
  assert.throws(() => parseArgs(['--missing']), /Unknown option/);
  assert.deepEqual(parseArgs(['scan', 'repo', '-o', 'catalog.json']), {
    command: 'scan',
    target: 'repo',
    output: 'catalog.json',
  });
  assert.deepEqual(parseArgs(['scan', 'repo', '--artifacts-dir', 'design-system']), {
    command: 'scan',
    target: 'repo',
    artifactsDir: 'design-system',
  });
  assert.deepEqual(parseArgs(['repo', '-o', 'catalog.json']), {
    command: 'scan',
    target: 'repo',
    output: 'catalog.json',
  });
  assert.deepEqual(parseArgs(['instruct', 'design-system']), {
    command: 'instruct',
    target: 'design-system',
  });
  assert.deepEqual(parseArgs(['review', 'design-system', '--port', '0', '--no-open']), {
    command: 'review',
    target: 'design-system',
    port: 0,
    noOpen: true,
  });
  assert.deepEqual(parseArgs(['decide', 'design-system', 'candidate-001', 'wrap']), {
    command: 'decide',
    target: 'design-system',
    candidateId: 'candidate-001',
    userDecision: 'wrap',
  });
  assert.deepEqual(parseArgs(['decide', 'design-system', 'candidate-001', 'wrap', '--name', 'SurfaceCard']), {
    command: 'decide',
    target: 'design-system',
    candidateId: 'candidate-001',
    userDecision: 'wrap',
    assetName: 'SurfaceCard',
  });
  assert.deepEqual(parseArgs([
    'install-instructions',
    'design-system',
    '--agents-out',
    'AGENTS.md',
    '--claude-out',
    'CLAUDE.md',
    '--force',
  ]), {
    command: 'install-instructions',
    target: 'design-system',
    agentsOut: 'AGENTS.md',
    claudeOut: 'CLAUDE.md',
    force: true,
  });
  assert.throws(() => parseArgs(['decide', 'design-system', 'candidate-001', 'bad-action']), /Unknown decision action/);
});

test('package bin entry can invoke the CLI module', () => {
  const packageJson = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8'));
  const result = spawnSync(process.execPath, ['src/cli.mjs', '--help'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
  });

  assert.equal(packageJson.bin.dsg, './src/cli.mjs');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /design-system-grower/);
});

async function makeFixtureRepo(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsg-'));

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents, 'utf8');
  }

  return root;
}
