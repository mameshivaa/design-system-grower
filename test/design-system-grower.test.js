import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  buildCatalog,
  classifyRole,
  extractClassCompositionCalls,
  extractCvaDefinitions,
  extractJsxClassNames,
  runInit,
  startReviewServer,
} from '../src/index.js';
import { main, parseArgs } from '../src/cli.js';
import { buildReviewHtml } from '../src/decisions.js';

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

test('extractJsxClassNames keeps only static class strings from template expressions', () => {
  const source = `
    export function Field({ invalid, disabled }) {
      return <input className={\`block w-full rounded border border-neutral-300 px-3 py-2 text-sm hover:border-neutral-400 data-[invalid=true]:border-red-500 \${invalid ? "border-red-500 focus:ring-red-500" : "focus:ring-neutral-300"} \${disabled ? 'opacity-50' : ''}\`} />;
    }
  `;

  const matches = extractJsxClassNames(source, 'src/Field.tsx');
  const classes = matches[0].classes;

  assert.equal(matches.length, 1);
  assert.ok(classes.includes('border-neutral-300'));
  assert.ok(classes.includes('hover:border-neutral-400'));
  assert.ok(classes.includes('data-[invalid=true]:border-red-500'));
  assert.ok(classes.includes('border-red-500'));
  assert.ok(classes.includes('focus:ring-red-500'));
  assert.ok(classes.includes('focus:ring-neutral-300'));
  assert.ok(classes.includes('opacity-50'));
  assert.ok(classes.every((className) => !className.startsWith('"')));
  assert.ok(classes.every((className) => !['${', ':', '?'].includes(className)));
});

test('classifyRole identifies core UI roles from tags and class heuristics', () => {
  assert.equal(classifyRole({
    source: { examples: [{ element: 'button' }] },
    commonClasses: ['inline-flex', 'rounded-md', 'px-4', 'py-2'],
    variantClasses: [],
    categories: [],
  }), 'Button');
  assert.equal(classifyRole({
    source: { examples: [{ element: 'div' }] },
    commonClasses: ['w-full', 'rounded-md', 'border', 'px-3', 'py-2', 'focus:ring-2'],
    variantClasses: [],
    categories: [],
  }), 'FormField');
  assert.equal(classifyRole({
    source: { examples: [{ element: 'div' }] },
    commonClasses: ['rounded-md', 'border', 'bg-red-50', 'p-3', 'text-sm'],
    variantClasses: [],
    categories: [],
  }), 'Alert');
  assert.equal(classifyRole({
    source: { examples: [{ element: 'span' }] },
    commonClasses: ['inline-flex', 'items-center', 'rounded-full', 'px-2', 'text-xs'],
    variantClasses: [],
    categories: [],
  }), 'Badge');
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

test('buildCatalog adds candidate roles and summarizes role variants', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Roles.tsx': `
      export function Roles() {
        return <>
          <button className="inline-flex cursor-pointer items-center rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Save</button>
          <button className="inline-flex cursor-pointer items-center rounded-md bg-blue-600 px-4 py-2 text-sm text-white">Done</button>
          <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-blue-500" />
          <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-blue-500" />
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">Error</div>
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">Warning</div>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">New</span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Beta</span>
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const roles = new Set(catalog.candidates.map((candidate) => candidate.role));

  assert.ok(roles.has('Button'));
  assert.ok(roles.has('FormField'));
  assert.ok(roles.has('Alert'));
  assert.ok(roles.has('Badge'));
  assert.equal(catalog.summary.roles.Button.variants, 1);
  assert.equal(catalog.summary.roles.FormField.variants, 1);
  assert.equal(catalog.summary.roles.Alert.variants, 1);
  assert.equal(catalog.summary.roles.Badge.variants, 1);
  assert.equal(catalog.summary.roles.Button.competingFamilies, 0);
  assert.match(catalog.summary.roles.Button.topExample, /bg-blue-600/);
});

test('buildCatalog excludes template expression syntax tokens from candidate commonClasses', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Fields.tsx': `
      export function Fields({ invalid }) {
        return <>
          <input className={\`block w-full rounded border border-neutral-300 px-3 py-2 text-sm hover:border-neutral-400 \${invalid ? "border-red-500 focus:ring-red-500" : "focus:ring-neutral-300"}\`} />
          <input className={\`block w-full rounded border border-neutral-300 px-3 py-2 text-sm hover:border-neutral-400 \${invalid ? "border-red-500 focus:ring-red-500" : "focus:ring-neutral-300"}\`} />
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const commonClasses = catalog.candidates[0].commonClasses;

  assert.ok(commonClasses.includes('border-neutral-300'));
  assert.ok(commonClasses.includes('hover:border-neutral-400'));
  assert.ok(commonClasses.includes('focus:ring-neutral-300'));
  assert.ok(commonClasses.every((className) => !className.startsWith('"')));
  assert.ok(commonClasses.every((className) => !['${', ':', '?'].includes(className)));
});

test('buildCatalog excludes cn template condition identifiers from candidate commonClasses', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Notices.tsx': `
      import { cn } from "@/lib/utils";
      export function Notices({ error, isOpen }) {
        return <>
          <div className={cn(\`px-3 py-2 rounded border text-sm \${error ? "border-red-300" : "border-slate-300"} \${isOpen ? "bg-white" : "bg-slate-50"}\`)} />
          <div className={cn(\`px-3 py-2 rounded border text-sm \${error ? "border-red-300" : "border-slate-300"} \${isOpen ? "bg-white" : "bg-slate-50"}\`)} />
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const commonClasses = catalog.candidates[0].commonClasses;

  assert.ok(commonClasses.includes('border-red-300'));
  assert.ok(commonClasses.includes('border-slate-300'));
  assert.ok(commonClasses.includes('bg-white'));
  assert.ok(commonClasses.includes('bg-slate-50'));
  assert.ok(!commonClasses.includes('error'));
  assert.ok(!commonClasses.includes('isOpen'));
});

test('buildCatalog excludes comparison-operand string literals from template classes', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/ToneNotice.tsx': `
      export function ToneNotice({ message }) {
        return <>
          <div className={\`rounded-md border px-3 py-2 text-sm \${
            message.tone === "error"
              ? "border-red-200 bg-red-50"
              : message.tone === "success"
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-slate-50"
          }\`} />
          <div className={\`rounded-md border px-3 py-2 text-sm \${
            message.tone === "error"
              ? "border-red-200 bg-red-50"
              : message.tone === "success"
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-slate-50"
          }\`} />
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const commonClasses = catalog.candidates[0].commonClasses;

  assert.ok(commonClasses.includes('border-red-200'));
  assert.ok(commonClasses.includes('bg-emerald-50'));
  assert.ok(commonClasses.includes('border-slate-200'));
  assert.ok(!commonClasses.includes('error'));
  assert.ok(!commonClasses.includes('success'));
});

test('buildCatalog merges near-duplicate class clusters before building candidates', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <>
          <label className="block rounded-sm px-1 py-0.5 text-sm font-medium leading-none text-neutral-900 tracking-wide mb-2">Email</label>
          <label className="block rounded-sm px-1 py-0.5 text-sm font-medium leading-none text-neutral-900 tracking-wide mb-2">Name</label>
          <label className="block rounded-sm px-1 py-0.5 text-sm font-medium leading-none text-neutral-900 tracking-wide mb-1">Company</label>
          <label className="block rounded-sm px-1 py-0.5 text-sm font-medium leading-none text-neutral-900 tracking-wide mb-1">Role</label>

          <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />
          <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />
          <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />
          <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const labelCandidates = catalog.candidates.filter((candidate) => (
    candidate.source.examples.every((example) => example.element === 'label')
  ));
  const inputCandidates = catalog.candidates.filter((candidate) => (
    candidate.source.examples.every((example) => example.element === 'input')
  ));

  assert.equal(labelCandidates.length, 1);
  assert.equal(labelCandidates[0].source.occurrences, 4);
  assert.equal(inputCandidates.length, 1);
  assert.equal(inputCandidates[0].source.occurrences, 4);
  assert.ok(inputCandidates[0].variantClasses.includes('focus:ring-blue-500'));
  assert.ok(inputCandidates[0].variantClasses.includes('focus:ring-red-500'));
});

test('buildCatalog merges high-jaccard clusters before actionType can split candidates', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Actions.tsx': `
      export function Actions() {
        return <>
          <BillingButton className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white" />
          <BillingButton className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white" />
          <button className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white h-9 shadow-sm focus:ring-2">Save</button>
          <button className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white h-10 shadow-md focus:ring-4">Continue</button>
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const buttonCandidates = catalog.candidates.filter((candidate) => (
    candidate.commonClasses.includes('inline-flex')
      && candidate.commonClasses.includes('justify-center')
      && candidate.commonClasses.includes('bg-blue-600')
  ));

  assert.equal(buttonCandidates.length, 1);
  assert.equal(buttonCandidates[0].source.occurrences, 4);
  assert.equal(buttonCandidates[0].source.examples.length, 4);
  assert.equal(buttonCandidates[0].actionType, 'extract-block');
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

test('buildCatalog filters low-signal clusters and ranks repeated button patterns', async () => {
  const fixtureDir = await makeFixtureRepo({
    'components/ui/button.tsx': `
      import { cva } from "class-variance-authority";
      export const buttonVariants = cva("inline-flex items-center rounded-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90");
      export function Button(props) {
        return <button className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90" {...props} />;
      }
      export function IconButton(props) {
        return <button className="inline-flex items-center rounded-md px-2 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90" {...props} />;
      }
    `,
    'src/variants.tsx': `
      export const localCard = cva("rounded border bg-white p-4 text-sm shadow-sm hover:bg-zinc-50");
      export function LocalCard() {
        return <>
          <section className="rounded border bg-white p-4 text-sm shadow-sm hover:bg-zinc-50">A</section>
          <article className="rounded border bg-white p-4 text-sm shadow-sm hover:bg-zinc-50">B</article>
        </>;
      }
    `,
    'src/Noise.tsx': `
      import { Icons } from "./icons";
      export function Noise() {
        return <>
          <div className="flex gap-2 items-center">One</div>
          <div className="flex gap-2 items-center">Two</div>
          <section className="mt-8">A</section>
          <aside className="mt-8">B</aside>
          <Icons.plus className="h-4 w-4" />
          <Icons.minus className="h-4 w-4" />
        </>;
      }
    `,
    'src/Actions.tsx': `
      export function Actions() {
        return <>
          <button className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">Save</button>
          <a className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700">Docs</a>
          <button className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">Continue</button>
        </>;
      }
    `,
  });

  const catalog = await buildCatalog(fixtureDir);
  const topCandidate = catalog.candidates[0];
  const candidateClassSets = catalog.candidates.map((candidate) => candidate.commonClasses.join(' '));
  const candidateFiles = catalog.candidates.flatMap((candidate) => candidate.source.examples.map((example) => example.file));

  assert.ok(topCandidate.commonClasses.includes('rounded-md'));
  assert.ok(topCandidate.commonClasses.includes('px-4'));
  assert.ok(topCandidate.commonClasses.includes('text-sm'));
  assert.ok(topCandidate.commonClasses.includes('text-white'));
  assert.ok(topCandidate.commonClasses.some((className) => className.startsWith('hover:')));
  assert.doesNotMatch(candidateClassSets.join('\n'), /flex gap-2 items-center|mt-8|h-4 w-4/);
  assert.ok(catalog.candidates.every((candidate) => candidate.commonClasses.length > 0));
  assert.ok(candidateFiles.every((file) => !file.startsWith('components/ui/') && file !== 'src/variants.tsx'));
  assert.ok(catalog.inventory.existingDesignSystem.files.includes('components/ui/button.tsx'));
  assert.ok(catalog.inventory.existingDesignSystem.files.includes('src/variants.tsx'));
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

test('buildCatalog detects competing color families and canonicalize decisions deprecate the losing side', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/StatusNotices.tsx': `
      export function StatusNotices() {
        return <>
          <div className="rounded-md border px-3 py-2 text-sm bg-emerald-50 border-emerald-200 text-emerald-900">Ready</div>
          <div className="rounded-md border px-3 py-2 text-sm bg-emerald-50 border-emerald-200 text-emerald-900">Synced</div>
          <div className="rounded-md border px-3 py-2 text-sm bg-emerald-50 border-emerald-200 text-emerald-900">Active</div>
          <div className="rounded-md border px-3 py-2 text-sm bg-green-50 border-green-200 text-green-900">Legacy</div>
        </>;
      }
    `,
  });
  const outputPath = path.join(fixtureDir, 'design-system', 'catalog.json');

  await main([fixtureDir, '--out', outputPath], {
    stdout: { write: () => {} },
  });

  const catalog = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  const driftCandidates = catalog.candidates.filter((candidate) => candidate.actionType === 'canonicalize');
  const driftCandidate = driftCandidates[0];

  assert.equal(driftCandidates.length, 1);
  assert.equal(driftCandidate.recommendedSide, 1);
  assert.equal(driftCandidate.sides[0].occurrences, 3);
  assert.ok(driftCandidate.sides[0].classes.includes('bg-emerald-50'));
  assert.ok(driftCandidate.sides[1].classes.includes('bg-green-50'));

  await main([
    'decide',
    path.join(fixtureDir, 'design-system'),
    driftCandidate.id,
    'canonicalize',
    '--name',
    'StatusNotice',
    '--side',
    String(driftCandidate.recommendedSide),
  ], {
    stdout: { write: () => {} },
  });

  const decisions = JSON.parse(await fs.readFile(path.join(fixtureDir, 'design-system', 'decisions.json'), 'utf8'));
  const assets = JSON.parse(await fs.readFile(path.join(fixtureDir, 'design-system', 'assets.json'), 'utf8'));
  const agentRules = await fs.readFile(path.join(fixtureDir, 'design-system', 'agent-rules.md'), 'utf8');
  const approved = decisions.find((decision) => decision.candidateId === driftCandidate.id);

  assert.equal(approved.userDecision, 'canonicalize');
  assert.equal(approved.canonicalSide.side, 1);
  assert.ok(approved.canonicalClasses.includes('bg-emerald-50'));
  assert.ok(approved.deprecatedClasses.includes('bg-green-50'));
  assert.ok(assets.find((asset) => asset.candidateId === driftCandidate.id).deprecatedClasses.includes('bg-green-50'));
  assert.match(agentRules, /Use StatusNotice \(.*bg-emerald-50/);
  assert.match(agentRules, /The .*bg-green-50.* family is deprecated — do not use it in new code/);
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
  assert.match(stdout, /FormField: 1 variant \(0 competing families\)/);
  assert.equal(catalog.summary.duplicateClusters, 1);
  assert.equal(catalog.summary.roles.FormField.variants, 1);
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

test('init writes artifacts, prints summary, starts review server, and shows next steps', async () => {
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
  const designSystemDir = path.join(fixtureDir, 'design-system');
  let stdout = '';
  let serverStarted = false;

  const exitCode = await runInit({
    target: fixtureDir,
    designSystem: designSystemDir,
    noOpen: true,
    port: 0,
    waitForShutdown: async (server) => {
      serverStarted = true;
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /design-system-grower review/);
      await new Promise((resolve) => {
        server.close(resolve);
      });
    },
  }, {
    stdout: { write: (message) => { stdout += message; } },
    stderr: { write: () => {} },
  });

  const catalog = JSON.parse(await fs.readFile(path.join(designSystemDir, 'catalog.json'), 'utf8'));
  const candidates = JSON.parse(await fs.readFile(path.join(designSystemDir, 'candidates.json'), 'utf8'));
  const decisions = JSON.parse(await fs.readFile(path.join(designSystemDir, 'decisions.json'), 'utf8'));
  const reviewHtml = await fs.readFile(path.join(designSystemDir, 'review.html'), 'utf8');

  assert.equal(exitCode, 0);
  assert.equal(serverStarted, true);
  assert.equal(catalog.summary.filesScanned, 1);
  assert.equal(candidates.length, 1);
  assert.equal(decisions[0].candidateId, 'candidate-001');
  assert.match(reviewHtml, /candidate-001/);
  assert.match(stdout, /Candidates: 1/);
  assert.match(stdout, /Drift candidates: 0/);
  assert.match(stdout, /FormField: 1 variant \(0 competing families\)/);
  assert.match(stdout, /candidate-001: FieldPattern/);
  assert.match(stdout, /Review URL: http:\/\/127\.0\.0\.1:/);
  assert.match(stdout, /dsg decide .*design-system.* candidate-001 reuse --name FieldPattern/);
  assert.match(stdout, /dsg install-instructions .*design-system/);
  assert.match(stdout, /dsg check \. --design-system .*design-system --strict/);
});

test('init preserves existing decisions when regenerating design-system artifacts', async () => {
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
  const designSystemDir = path.join(fixtureDir, 'design-system');
  await fs.mkdir(designSystemDir, { recursive: true });
  await fs.writeFile(path.join(designSystemDir, 'decisions.json'), `${JSON.stringify([
    {
      candidateId: 'candidate-001',
      status: 'approved',
      userDecision: 'reuse',
      assetName: 'PreservedField',
    },
  ], null, 2)}\n`, 'utf8');

  await runInit({
    target: fixtureDir,
    designSystem: designSystemDir,
    noOpen: true,
    port: 0,
    waitForShutdown: (server) => new Promise((resolve) => {
      server.close(resolve);
    }),
  }, {
    stdout: { write: () => {} },
    stderr: { write: () => {} },
  });

  const decisions = JSON.parse(await fs.readFile(path.join(designSystemDir, 'decisions.json'), 'utf8'));
  const assets = JSON.parse(await fs.readFile(path.join(designSystemDir, 'assets.json'), 'utf8'));

  assert.equal(decisions[0].status, 'approved');
  assert.equal(decisions[0].userDecision, 'reuse');
  assert.equal(decisions[0].assetName, 'PreservedField');
  assert.equal(assets[0].name, 'PreservedField');
});

test('review server returns source snippets and rejects traversal', async () => {
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
    const snippetResponse = await fetch(new URL('/api/snippet?candidateId=candidate-001&example=0&context=1', review.url));
    const snippet = await snippetResponse.json();
    const traversalResponse = await fetch(new URL('/api/snippet?file=../package.json&line=1', review.url));
    const traversal = await traversalResponse.json();

    assert.equal(snippetResponse.status, 200);
    assert.equal(snippet.file, 'src/Form.tsx');
    assert.ok(snippet.lines.some((line) => line.highlight && line.text.includes('input')));
    assert.equal(traversalResponse.status, 403);
    assert.match(traversal.error, /inside the scanned repo/);
  } finally {
    await new Promise((resolve) => {
      review.server.close(resolve);
    });
  }
});

test('review server decide endpoint saves decisions and regenerates assets', async () => {
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
  const outputPath = path.join(fixtureDir, 'design-system', 'catalog.json');

  await main([fixtureDir, '--out', outputPath], {
    stdout: { write: () => {} },
  });

  const review = await startReviewServer({
    artifactsDir: path.join(fixtureDir, 'design-system'),
    port: 0,
  });

  try {
    const decideResponse = await fetch(new URL('/api/decide', review.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'candidate-001',
        decision: 'wrap',
        assetName: 'SurfaceCard',
      }),
    });
    const decidePayload = await decideResponse.json();
    const decisions = JSON.parse(await fs.readFile(path.join(fixtureDir, 'design-system', 'decisions.json'), 'utf8'));
    const assets = JSON.parse(await fs.readFile(path.join(fixtureDir, 'design-system', 'assets.json'), 'utf8'));
    const assetsMarkdown = await fs.readFile(path.join(fixtureDir, 'design-system', 'assets.md'), 'utf8');
    const agentRules = await fs.readFile(path.join(fixtureDir, 'design-system', 'agent-rules.md'), 'utf8');

    assert.equal(decideResponse.status, 200);
    assert.equal(decidePayload.decision.assetName, 'SurfaceCard');
    assert.equal(decisions[0].status, 'approved');
    assert.equal(decisions[0].userDecision, 'wrap');
    assert.equal(assets[0].name, 'SurfaceCard');
    assert.match(assetsMarkdown, /## SurfaceCard/);
    assert.match(agentRules, /Prefer SurfaceCard as a wrapper component/);
  } finally {
    await new Promise((resolve) => {
      review.server.close(resolve);
    });
  }
});

test('review HTML renders only top 20 scored candidates by default', () => {
  const candidates = Array.from({ length: 25 }, (_, index) => {
    const score = index + 1;
    return {
      id: `candidate-${String(index + 1).padStart(3, '0')}`,
      clusterId: `cluster-${index + 1}`,
      title: `Candidate ${index + 1}`,
      assetNameSuggestion: `Asset${index + 1}`,
      actionType: index % 2 === 0 ? 'reuse' : 'wrap',
      safetyLevel: 'safe',
      recommendedAction: index % 2 === 0 ? 'reuse' : 'wrap',
      rationale: 'Repeated UI pattern.',
      source: {
        occurrences: 2,
        files: 1,
        examples: [{
          file: 'src/App.tsx',
          line: index + 1,
          column: 1,
          element: 'div',
          sourceType: 'className',
        }],
      },
      commonClasses: ['rounded', `p-${index + 1}`],
      variantClasses: [],
      categories: [{ category: index % 2 === 0 ? 'border' : 'spacing', count: 1 }],
      score,
    };
  });
  const html = buildReviewHtml({
    target: '/tmp/project',
    summary: {
      filesScanned: 1,
      situations: 0,
      candidates: candidates.length,
    },
    situations: [],
    candidates,
  });
  const renderedCards = html.match(/\n    <article class="card candidate-card"/g) ?? [];

  assert.equal(renderedCards.length, 20);
  assert.match(html, /20 of 25 candidates shown/);
  assert.match(html, /Show all/);
  assert.match(html, /Candidate 25/);
  assert.doesNotMatch(html, /Candidate 1<\/h2>/);
  assert.match(html, /reuse \/ border/);
  assert.match(html, /<span class="badge">10 of 13 candidates<\/span>/);
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
  assert.match(agentRules, /### PrimaryAction/);
  assert.match(agentRules, /Use or introduce PrimaryAction/);
  assert.match(agentRules, /- Common classes: `.*inline-flex/);
  assert.match(agentRules, /Machine-readable data: `assets\.json`/);
  assert.doesNotMatch(agentRules, /Review candidate-001 before adding similar UI/);
  assert.doesNotMatch(agentRules, /Review candidate-\d+ before adding similar UI/);
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
  assert.match(agentRules, /### SurfaceCard/);
  assert.match(agentRules, /- Common classes: `.*rounded/);
  assert.match(agentRules, /```jsx/);
  assert.match(agentRules, /- Representative usage:/);
  assert.equal(assets[0].name, 'SurfaceCard');
  assert.ok(assets[0].usageExample?.snippet, 'approved asset exposes a usage example snippet');
  assert.ok(Array.isArray(assets[0].referenceLocations) && assets[0].referenceLocations.length > 0);
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

test('check reports a near-miss against an approved asset', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir, '--files', 'src/**/*.tsx'], {
    stdout: { write: (message) => { stdout += message; } },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /near-miss FormInput/);
  assert.match(stdout, /Almost matches FormInput/);
  assert.match(stdout, /src\/Form\.tsx:3/);
  assert.match(stdout, /missing: focus:ring-blue-500/);
  assert.match(stdout, /extra: focus:ring-red-500/);
});

test('check does not report an exact approved asset match', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />;
      }
    `,
  });
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir], {
    stdout: { write: (message) => { stdout += message; } },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /no design-system drift found/);
  assert.doesNotMatch(stdout, /near-miss/);
});

test('check exits 1 in strict mode when drift is found', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir, '--strict'], {
    stdout: { write: () => {} },
  });

  assert.equal(exitCode, 1);
});

test('check writes a markdown report', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  const reportPath = path.join(fixtureDir, 'dsg-check.md');

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir, '--report', reportPath], {
    stdout: { write: () => {} },
  });
  const report = await fs.readFile(reportPath, 'utf8');

  assert.equal(exitCode, 0);
  assert.match(report, /## dsg check/);
  assert.match(report, /\| Location \| Type \| Asset \| Diff \|/);
  assert.match(report, /\| Type \| Count \|/);
  assert.match(report, /\| near-miss \| 1 \|/);
  assert.match(report, /src\/Form\.tsx:3/);
  assert.match(report, /FormInput/);
  assert.match(report, /focus:ring-red-500/);
});

test('check --blame reports claude attribution from git blame', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  assertGit(fixtureDir, ['init']);
  assertGit(fixtureDir, ['config', 'user.email', 'committer@example.com']);
  assertGit(fixtureDir, ['config', 'user.name', 'Committer']);
  assertGit(fixtureDir, ['add', 'src/Form.tsx']);
  assertGit(fixtureDir, ['commit', '-m', 'add claude variant'], {
    GIT_AUTHOR_NAME: 'Claude',
    GIT_AUTHOR_EMAIL: 'noreply@anthropic.com',
    GIT_AUTHOR_DATE: '2026-07-06T00:00:00Z',
    GIT_COMMITTER_DATE: '2026-07-06T00:00:00Z',
  });
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  const reportPath = path.join(fixtureDir, 'dsg-check.md');
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir, '--blame', '--report', reportPath], {
    stdout: { write: (message) => { stdout += message; } },
  });
  const report = await fs.readFile(reportPath, 'utf8');

  assert.equal(exitCode, 0);
  assert.match(stdout, /near-miss FormInput/);
  assert.match(stdout, /introduced by: claude \(/);
  assert.match(report, /\| Location \| Type \| Asset \| Introduced By \| Diff \|/);
  assert.match(report, /\| claude \(/);
});

test('check --blame reports human attribution for human authors', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  assertGit(fixtureDir, ['init']);
  assertGit(fixtureDir, ['config', 'user.email', 'human@example.com']);
  assertGit(fixtureDir, ['config', 'user.name', 'Human Author']);
  assertGit(fixtureDir, ['add', 'src/Form.tsx']);
  assertGit(fixtureDir, ['commit', '-m', 'add human variant']);
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir, '--blame'], {
    stdout: { write: (message) => { stdout += message; } },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /introduced by: human \(/);
});

test('check --blame omits attribution for untracked files', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  assertGit(fixtureDir, ['init']);
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir, '--blame'], {
    stdout: { write: (message) => { stdout += message; } },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /near-miss FormInput/);
  assert.doesNotMatch(stdout, /introduced by:/);
});

test('check without --blame does not invoke git blame', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  const binDir = path.join(fixtureDir, 'bin');
  const fakeGitPath = path.join(binDir, 'git');
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(fakeGitPath, '#!/bin/sh\nexit 99\n', 'utf8');
  await fs.chmod(fakeGitPath, 0o755);
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  const previousPath = process.env.PATH;
  let stdout = '';

  try {
    process.env.PATH = `${binDir}${path.delimiter}${previousPath}`;
    const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir], {
      stdout: { write: (message) => { stdout += message; } },
    });

    assert.equal(exitCode, 0);
    assert.match(stdout, /near-miss FormInput/);
    assert.doesNotMatch(stdout, /introduced by:/);
  } finally {
    process.env.PATH = previousPath;
  }
});

test('check reports a new-variant from unapproved catalog candidates', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/NewButton.tsx': `
      export function NewButton() {
        return <button className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-indigo-600 text-white shadow-sm">Save</button>;
      }
    `,
  });
  const designSystemDir = await makeCandidateOnlyDesignSystem(fixtureDir);
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir], {
    stdout: { write: (message) => { stdout += message; } },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /new-variant Button/);
  assert.match(stdout, /invents a new variant of an existing pattern/);
  assert.match(stdout, /Button variant #5/);
});

test('check does not report an exact unapproved candidate match as a new-variant', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/ExistingButton.tsx': `
      export function ExistingButton() {
        return <button className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 text-white">Save</button>;
      }
    `,
  });
  const designSystemDir = await makeCandidateOnlyDesignSystem(fixtureDir);
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir], {
    stdout: { write: (message) => { stdout += message; } },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /no design-system drift found/);
  assert.doesNotMatch(stdout, /new-variant/);
});

test('check reports near-miss instead of new-variant for the same usage', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  await writeCatalogCandidates(designSystemDir, [
    candidateFixture('candidate-variant-input', 'FormField', 'input', [
      'block',
      'w-full',
      'rounded-md',
      'border',
      'border-neutral-300',
      'px-3',
      'py-2',
      'text-sm',
      'shadow-sm',
      'focus:border-blue-500',
      'focus:ring-blue-500',
      'disabled:opacity-50',
    ]),
  ]);
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir], {
    stdout: { write: (message) => { stdout += message; } },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /near-miss FormInput/);
  assert.doesNotMatch(stdout, /new-variant/);
});

test('check --base scans only files changed since the git ref plus uncommitted changes', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Changed.tsx': `
      export function Changed() {
        return <button className="text-sm">Save</button>;
      }
    `,
    'src/Unchanged.tsx': `
      export function Unchanged() {
        return <button className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-indigo-600 text-white shadow-sm">Skip</button>;
      }
    `,
  });
  const designSystemDir = await makeCandidateOnlyDesignSystem(fixtureDir);
  assertGit(fixtureDir, ['init']);
  assertGit(fixtureDir, ['config', 'user.email', 'test@example.com']);
  assertGit(fixtureDir, ['config', 'user.name', 'Test User']);
  assertGit(fixtureDir, ['add', '.']);
  assertGit(fixtureDir, ['commit', '-m', 'baseline']);
  await fs.writeFile(path.join(fixtureDir, 'src/Changed.tsx'), `
    export function Changed() {
      return <button className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-indigo-600 text-white shadow-sm">Save</button>;
    }
  `, 'utf8');
  let stdout = '';

  const exitCode = await main(['check', fixtureDir, '--design-system', designSystemDir, '--base', 'HEAD'], {
    stdout: { write: (message) => { stdout += message; } },
    stderr: { write: () => {} },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /src\/Changed\.tsx:3/);
  assert.doesNotMatch(stdout, /src\/Unchanged\.tsx/);
});

test('hook-check exits 2 with blocking feedback for a violating file', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-red-500" />;
      }
    `,
  });
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  let stderr = '';

  const exitCode = await main(['hook-check', '--design-system', designSystemDir], {
    stdin: Readable.from([JSON.stringify({ tool_input: { file_path: path.join(fixtureDir, 'src', 'Form.tsx') } })]),
    stdout: { write: () => {} },
    stderr: { write: (message) => { stderr += message; } },
  });

  assert.equal(exitCode, 2);
  assert.match(stderr, /design-system drift detected/);
  assert.match(stderr, /target asset: FormInput/);
  assert.match(stderr, /canonical classes: .*focus:ring-blue-500/);
  assert.match(stderr, /diff: missing focus:ring-blue-500; extra focus:ring-red-500/);
});

test('hook-check exits 0 quietly for a clean file', async () => {
  const fixtureDir = await makeFixtureRepo({
    'src/Form.tsx': `
      export function Form() {
        return <input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />;
      }
    `,
  });
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  let stdout = '';
  let stderr = '';

  const exitCode = await main(['hook-check', '--design-system', designSystemDir], {
    stdin: Readable.from([JSON.stringify({ tool_input: { file_path: path.join(fixtureDir, 'src', 'Form.tsx') } })]),
    stdout: { write: (message) => { stdout += message; } },
    stderr: { write: (message) => { stderr += message; } },
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout, '');
  assert.equal(stderr, '');
});

test('hook-check exits 0 quietly for invalid hook JSON', async () => {
  const fixtureDir = await makeFixtureRepo({});
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  let stderr = '';

  const exitCode = await main(['hook-check', '--design-system', designSystemDir], {
    stdin: Readable.from(['{not json']),
    stdout: { write: () => {} },
    stderr: { write: (message) => { stderr += message; } },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, '');
});

test('install-hooks creates a new Claude settings file', async () => {
  const fixtureDir = await makeFixtureRepo({});
  const settingsPath = path.join(fixtureDir, '.claude', 'settings.json');
  const designSystemDir = path.join(fixtureDir, 'design-system');
  let stdout = '';

  const exitCode = await main(['install-hooks', '--design-system', designSystemDir, '--settings', settingsPath], {
    stdout: { write: (message) => { stdout += message; } },
  });
  const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));

  assert.equal(exitCode, 0);
  assert.match(stdout, /Writing Claude Code hook settings/);
  assert.equal(settings.hooks.PostToolUse.length, 1);
  assert.equal(settings.hooks.PostToolUse[0].matcher, 'Write|Edit');
  assert.match(settings.hooks.PostToolUse[0].hooks[0].command, /design-system-grower hook-check --design-system/);
});

test('install-hooks preserves existing settings and appends a PostToolUse hook', async () => {
  const fixtureDir = await makeFixtureRepo({});
  const settingsPath = path.join(fixtureDir, '.claude', 'settings.json');
  const designSystemDir = path.join(fixtureDir, 'design-system');
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify({
    permissions: { allow: ['Bash(npm test)'] },
    hooks: {
      PostToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'echo existing' }],
        },
      ],
    },
  }, null, 2)}\n`, 'utf8');

  const exitCode = await main(['install-hooks', '--design-system', designSystemDir, '--settings', settingsPath], {
    stdout: { write: () => {} },
  });
  const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));

  assert.equal(exitCode, 0);
  assert.deepEqual(settings.permissions, { allow: ['Bash(npm test)'] });
  assert.equal(settings.hooks.PostToolUse.length, 2);
  assert.equal(settings.hooks.PostToolUse[0].matcher, 'Bash');
  assert.equal(settings.hooks.PostToolUse[1].matcher, 'Write|Edit');
});

test('install-hooks does not duplicate the same hook on repeated runs', async () => {
  const fixtureDir = await makeFixtureRepo({});
  const settingsPath = path.join(fixtureDir, '.claude', 'settings.json');
  const designSystemDir = path.join(fixtureDir, 'design-system');

  await main(['install-hooks', '--design-system', designSystemDir, '--settings', settingsPath], {
    stdout: { write: () => {} },
  });
  await main(['install-hooks', '--design-system', designSystemDir, '--settings', settingsPath], {
    stdout: { write: () => {} },
  });
  const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));

  assert.equal(settings.hooks.PostToolUse.length, 1);
});

test('mcp stdio server lists, looks up, and checks approved assets', async () => {
  const fixtureDir = await makeFixtureRepo({});
  const designSystemDir = await makeDesignSystemArtifacts(fixtureDir);
  const responses = await runMcpSession(designSystemDir, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_assets', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'lookup_pattern', arguments: { query: 'input block w-full rounded-md' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'check_classes', arguments: { classes: 'block w-full rounded border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:ring-red-500' } } },
    { jsonrpc: '2.0', id: 6, method: 'unknown/method', params: {} },
  ]);

  assert.equal(responses.length, 6);
  assert.equal(responses[0].result.protocolVersion, '2025-06-18');
  assert.deepEqual(responses[0].result.capabilities, { tools: {} });
  assert.equal(responses[0].result.serverInfo.name, 'design-system-grower');
  assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), ['list_assets', 'lookup_pattern', 'check_classes']);

  const listedAssets = parseToolText(responses[2]);
  assert.equal(listedAssets[0].name, 'FormInput');
  assert.equal(listedAssets[0].action, 'reuse');
  assert.deepEqual(listedAssets[0].elementTags, ['input']);
  assert.ok(listedAssets[0].commonClasses.includes('focus:ring-blue-500'));
  assert.ok(listedAssets[0].deprecatedClasses.includes('focus:ring-red-500'));

  const matches = parseToolText(responses[3]);
  assert.equal(matches[0].name, 'FormInput');
  assert.ok(matches[0].canonicalClasses.includes('rounded-md'));
  assert.match(matches[0].usageExample.snippet, /className=/);
  assert.deepEqual(matches[0].referenceLocation, { file: 'src/Approved.tsx', line: 1, column: 1, element: 'input' });

  const check = parseToolText(responses[4]);
  assert.equal(check.verdict, 'deprecated');
  assert.equal(check.assetName, 'FormInput');
  assert.deepEqual(check.missingClasses, []);
  assert.deepEqual(check.extraClasses, []);
  assert.equal(responses[5].error.code, -32601);
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
  assert.deepEqual(parseArgs(['init', 'repo', '--design-system', 'design-system', '--port', '0', '--no-open']), {
    command: 'init',
    target: 'repo',
    designSystem: 'design-system',
    port: 0,
    noOpen: true,
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
  assert.deepEqual(parseArgs(['decide', 'design-system', 'candidate-002', 'canonicalize', '--name', 'StatusNotice', '--side', '1']), {
    command: 'decide',
    target: 'design-system',
    candidateId: 'candidate-002',
    userDecision: 'canonicalize',
    assetName: 'StatusNotice',
    side: 1,
  });
  assert.deepEqual(parseArgs([
    'check',
    'repo',
    '--design-system',
    'design-system',
    '--files',
    'src/**/*.tsx,components/*.tsx',
    '--base',
    'origin/main',
    '--strict',
    '--blame',
    '--report',
    'report.md',
  ]), {
    command: 'check',
    target: 'repo',
    designSystem: 'design-system',
    files: 'src/**/*.tsx,components/*.tsx',
    base: 'origin/main',
    strict: true,
    blame: true,
    report: 'report.md',
  });
  assert.deepEqual(parseArgs([
    'mcp',
    '--design-system',
    'design-system',
  ]), {
    command: 'mcp',
    designSystem: 'design-system',
  });
  assert.deepEqual(parseArgs([
    'hook-check',
    '--design-system',
    'design-system',
  ]), {
    command: 'hook-check',
    designSystem: 'design-system',
  });
  assert.deepEqual(parseArgs([
    'install-hooks',
    '--design-system',
    'design-system',
    '--settings',
    '.claude/settings.json',
    '--force',
  ]), {
    command: 'install-hooks',
    designSystem: 'design-system',
    settings: '.claude/settings.json',
    force: true,
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
  assert.throws(() => parseArgs(['check', 'repo']), /--design-system/);
  assert.throws(() => parseArgs(['hook-check']), /--design-system/);
  assert.throws(() => parseArgs(['mcp']), /--design-system/);
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

async function runMcpSession(designSystemDir, requests) {
  const child = spawn(process.execPath, ['src/cli.mjs', 'mcp', '--design-system', designSystemDir], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  for (const request of requests) {
    child.stdin.write(`${JSON.stringify(request)}\n`);
  }
  child.stdin.end();

  const exitCode = await new Promise((resolve) => {
    child.on('close', resolve);
  });

  assert.equal(exitCode, 0, stderr);
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseToolText(response) {
  assert.equal(response.result.content[0].type, 'text');
  return JSON.parse(response.result.content[0].text);
}

async function makeCandidateOnlyDesignSystem(root) {
  const designSystemDir = path.join(root, 'design-system');
  await fs.mkdir(designSystemDir, { recursive: true });
  await fs.writeFile(path.join(designSystemDir, 'assets.json'), '[]\n', 'utf8');
  await fs.writeFile(path.join(designSystemDir, 'decisions.json'), '[]\n', 'utf8');
  await writeCatalogCandidates(designSystemDir, [
    candidateFixture('candidate-button-001', 'Button', 'button', [
      'inline-flex',
      'items-center',
      'justify-center',
      'rounded-md',
      'px-4',
      'py-2',
      'text-sm',
      'font-medium',
      'bg-blue-600',
      'text-white',
    ]),
    candidateFixture('candidate-button-002', 'Button', 'button', [
      'inline-flex',
      'items-center',
      'justify-center',
      'rounded-md',
      'px-4',
      'py-2',
      'text-sm',
      'font-medium',
      'bg-slate-900',
      'text-white',
    ]),
    candidateFixture('candidate-button-003', 'Button', 'button', [
      'inline-flex',
      'items-center',
      'justify-center',
      'rounded-md',
      'px-3',
      'py-1.5',
      'text-sm',
      'font-medium',
      'border',
      'border-neutral-300',
    ]),
    candidateFixture('candidate-button-004', 'Button', 'button', [
      'inline-flex',
      'items-center',
      'justify-center',
      'rounded-md',
      'px-4',
      'py-2',
      'text-sm',
      'font-medium',
      'bg-white',
      'text-neutral-900',
    ]),
  ]);
  return designSystemDir;
}

async function writeCatalogCandidates(designSystemDir, candidates) {
  await fs.writeFile(path.join(designSystemDir, 'catalog.json'), `${JSON.stringify({
    summary: {
      candidates: candidates.length,
    },
    candidates,
  }, null, 2)}\n`, 'utf8');
}

function candidateFixture(id, role, element, commonClasses) {
  return {
    id,
    role,
    status: 'needs-decision',
    source: {
      occurrences: 2,
      files: 1,
      examples: [
        {
          file: `src/${id}.tsx`,
          line: 1,
          column: 1,
          element,
          sourceType: 'className',
        },
      ],
    },
    commonClasses,
    variantClasses: [],
  };
}

function assertGit(cwd, args, env = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function makeDesignSystemArtifacts(root) {
  const designSystemDir = path.join(root, 'design-system');
  const commonClasses = [
    'block',
    'w-full',
    'rounded-md',
    'border',
    'border-neutral-300',
    'px-3',
    'py-2',
    'text-sm',
    'shadow-sm',
    'focus:border-blue-500',
    'focus:ring-blue-500',
  ];
  await fs.mkdir(designSystemDir, { recursive: true });
  await fs.writeFile(path.join(designSystemDir, 'assets.json'), `${JSON.stringify([
    {
      id: 'asset-form-input',
      name: 'FormInput',
      candidateId: 'candidate-001',
      actionType: 'reuse',
      status: 'approved',
      commonClasses,
      variantClasses: [],
      deprecatedClasses: [
        'block',
        'w-full',
        'rounded',
        'border',
        'border-neutral-300',
        'px-3',
        'py-2',
        'text-sm',
        'shadow-sm',
        'focus:border-red-500',
        'focus:ring-red-500',
      ],
      elementTags: ['input'],
      usageExample: {
        file: 'src/Approved.tsx',
        line: 1,
        column: 1,
        element: 'input',
        sourceType: 'className',
        snippet: '<input className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500" />',
      },
      referenceLocations: [{ file: 'src/Approved.tsx', line: 1, column: 1, element: 'input' }],
    },
  ], null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(designSystemDir, 'decisions.json'), `${JSON.stringify([
    {
      candidateId: 'candidate-001',
      status: 'approved',
      userDecision: 'reuse',
      assetName: 'FormInput',
    },
  ], null, 2)}\n`, 'utf8');
  return designSystemDir;
}
