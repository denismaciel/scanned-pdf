# Critique of the scanned-PDF idea

A critical evaluation of the project as described in `README.md`, `docs/research.md`,
`docs/implementation-plan.md`, and `docs/benchmark-plan.md`. At time of writing the
repo is docs-only — no code exists yet.

## Summary

The idea is sound but small, and it lands in a crowded space. The architectural
instincts (client-only, benchmark-before-Rust) are good. The main problems are:

1. It is a solved problem with multiple existing browser tools, and the docs do not
   say why this one should exist.
2. The plan optimizes the well-understood parts (render/export pipeline) and defers
   the genuinely unproven part (does the scan effect look real?).
3. There is roughly 3x more planning than the pre-code stage warrants.
4. The dual-use / forgery dimension is unaddressed, including a metadata-spoofing
   feature copied uncritically from a reference repo.

## 1. The idea is sound but small, and the space is crowded

The research doc itself catalogs **four existing implementations**
(lookscanned.io, domdomegg/pdf-scanner, navchandar/look-like-scanned,
apurvmishra99/pdf-to-scan), two of which are already browser-based and cover
essentially the entire MVP. That is the most important fact in the repo, and the
plans do not reckon with it: **why build a fifth one?**

The honest answer is probably "to learn" or "to do it better." Both are fine, but
the docs read as if this were a greenfield opportunity. Before writing code, name a
concrete wedge:

- **Better effect realism** than lookscanned.io — the hardest and most defensible
  differentiator.
- **Better UX/performance** — the live-preview + benchmark focus hints at this.
- **Personal learning project** — in which case market positioning is irrelevant and
  the elaborate benchmark methodology is over-engineered for the goal.

## 2. What is this for? (the unaddressed elephant)

The docs never state the use case. It matters, because "make a digital document look
like it was physically scanned" has strong dishonest-use gravity: faking signed
contracts, forging wet-signature paper trails, making generated/template documents
look authentic, defeating "please scan and return" verification. Legitimate uses
exist (aesthetic preference, privacy-by-flattening, testing OCR pipelines,
redaction-by-rasterization) but they are the minority of why people search for this.

This is not a reason to abandon the project — the tools already exist. But a serious
plan should acknowledge the dual-use nature, because it shapes features. Notably,
**scanner-like metadata spoofing (Toshiba/Xerox creator/producer strings) appears in
the research as a feature to copy.** That single feature is the line between
"stylistic filter" and "forgery aid" — it exists purely to make a document lie about
its origin. Cut it, or flag it as a deliberate decision rather than copying it
unexamined.

## 3. What the planning gets right

- **Client-only / no-upload** is the correct architectural and trust decision, and a
  real differentiator worth leading with.
- **Benchmark-before-Rust discipline** is mature. The repeated "don't add Rust/WASM
  until data proves the bottleneck" resists the common premature-optimization trap.
- **Separating source-render cache from effect-output cache**, deterministic per-page
  seeds so preview matches export, and cancellable stale jobs — these are the actual
  hard parts of an interactive image tool, and the plan identifies them correctly.

## 4. The planning is over-built for a pre-code project

Three documents, zero lines of code. The benchmark plan alone specifies 7 fixture
PDFs, 5 config presets, a 3-way rasterizer/processing/output variant matrix, and a
p50/p95/max JSON-exporting harness — before a single page has been rendered to a
canvas. This is planning the measurement of a system that does not exist.

The risk: the benchmark scaffolding becomes the project. You spend Milestones 1-2
building a harness to compare `pdfjs-dist` vs `mupdf-js` before knowing whether the
effect even looks convincing. **The single highest-uncertainty question — "does the
scan effect actually look real?" — is purely visual and qualitative, and no amount of
p95 latency measurement answers it.**

Invert the sequence:

1. Crudest possible spike: pdfjs -> canvas -> a few hardcoded filters -> pdf-lib.
   One page, no UI, no workers, no benchmarks.
2. Look at the output. Iterate on *realism* until it is convincing. This is the real
   product risk.
3. Then add live preview, then benchmark, then decide on workers/Rust if it is slow.

The current plan front-loads the well-understood parts (all present in the four
reference repos) and defers the unproven part (effect quality).

## 5. Smaller technical notes

- **"Live preview p95 under 300ms"** is plausible for filter-only effects, but the
  plan lists per-pixel speckles/dropout/noise as preview controls. Per-pixel JS passes
  on a full-res page will blow that budget. The "expensive controls update on
  slider-release" escape hatch is right — make it the default expectation, not the
  fallback.
- **Output file size** will be the practical complaint. Rasterizing every page to JPEG
  and rebuilding the PDF can turn a 100KB text PDF into several MB. The benchmark plan
  measures size but sets no target or strategy. This deserves to be a first-class
  constraint, not an open question.
- **Losing the text layer** is dismissed as "acceptable because real scans are
  image-based too" — correct, but worth stating prominently to users, since it
  silently breaks search, copy, and accessibility.

## Bottom line

The idea is reasonable, the architecture instincts are good, and the no-upload +
benchmark-discipline framing is the right spine. To make the project worth doing:

1. Add a one-sentence reason this tool exists alongside the four that already do.
2. Spike the effect quality first; defer the benchmark cathedral until there is
   something worth benchmarking.
3. Make a deliberate call on metadata spoofing rather than copying it.
4. Treat output file size as a first-class constraint.
