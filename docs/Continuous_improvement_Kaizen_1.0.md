# FAIRWAY REFRESH --- CONTINUOUS IMPROVEMENT / KAIZEN

**Canonical path:** `docs/Continuous_improvement_Kaizen_1.0.md`

## 1. Purpose and Authority

This document is the Fairway Refresh Major Engineering Document and
canonical System of Truth for continuous improvement of the Fairway
Refresh development process.

It owns:

-   development-team learning and continuous improvement;
-   product-first engineering decision discipline;
-   prioritization and value-of-work principles;
-   evidence and diagnostic-value discipline;
-   diagnostic roadmaps, opt-out points, and failure-class correction;
-   reconsideration of existing engineering decisions;
-   efficient use of CPO and Development Team time;
-   retrospective practice; and
-   adoption and maintenance of durable development best practices.

It does not own product behavior, firmware architecture, hardware
implementation, deployment procedure, provisioning architecture, UX
behavior, or engineering truth assigned to another owner document.

The purpose of Kaizen is **not to add process**. Its purpose is to
continuously remove wasted work, improve decision quality, accelerate
learning, protect product fidelity, and increase the Development Team's
ability to deliver a robust and scalable Fairway Refresh system.

Any member of the Development Team, including the Lead Architect or VSC
engineering agent, may propose a Kaizen rule at any time.

**Only the CPO may approve a proposed rule for adoption into this
canonical SoT.**

A lesson learned, retrospective finding, recommendation, or agent
preference is not a canonical development rule until approved by the CPO
and incorporated here.

This SoT was established following the WP4 Device Health / golfer-first
retrospective.

## 2. Tier 1 Product Goal

> **Develop Fairway Refresh's codebase (full stack + hardware) as a
> modular productized system that allows for the business to scale from
> pilot to many hundreds of courses.**

Continuous improvement exists to make the Development Team increasingly
effective at achieving this goal.

Process, architecture, implementation, testing, documentation, tooling,
and development practices shall be evaluated according to whether they
advance this goal rather than whether they preserve an existing practice
for its own sake.

## 3. Definition of Done

> **The Fairway Refresh devices can be robustly deployed indefinitely on
> the course.**

Development decisions shall therefore optimize for a productized system
that is robust, maintainable, understandable, scalable, and
operationally deployable, not merely for successful completion of the
immediate development task.

A local fix that satisfies an immediate symptom but preserves a
recurring class of failure may therefore be inferior to a broader
correction that better satisfies the Definition of Done.

## 4. Tier 1 Product Goal --- Development Acceptance Criteria

### 4.1 CPO Time and Development Priority

> **The CPO's time is a valuable resource to be used to full potential,
> but not wasted. The Development Team must always understand
> objectives, priorities and the value of the tasks they propose. Always
> prioritize what is most uncertain, impactful and required to be done
> now before other items. If that prioritization is not clear, ask the
> CPO.**

This criterion applies to planning, research, diagnostics, architecture,
implementation, physical testing, validation, documentation, and
deployment.

Before proposing material work, the Development Team shall understand,
proportionate to the task:

1.  **Objective** --- What product or engineering objective does this
    work advance?
2.  **Uncertainty** --- What important uncertainty does it resolve?
3.  **Decision value** --- What decision could the result change?
4.  **Impact** --- Why does that decision matter?
5.  **Priority** --- Why is this required now?
6.  **Cost** --- What engineering, elapsed, CPO-attention, or
    physical-interaction cost does it impose?
7.  **Sufficiency** --- Is there a less expensive way to obtain
    sufficient evidence for the decision?

Not every small action requires a formal written response to these
questions. They are a decision discipline, not a paperwork requirement.

If the priority or value of material proposed work is unclear, ask the
CPO before proceeding.

## 5. Product-First Engineering Hierarchy

Fairway Refresh engineering shall reason in this direction:

> **Product Requirement → Architecture → Engineering Decision →
> Implementation**

### 5.1 Product Requirement

First establish what the product must accomplish and why.

Product requirements and priorities are owned by the CPO and the
appropriate canonical product and engineering SoTs.

### 5.2 Architecture

Determine the architecture that best satisfies the product requirement
as a coherent, modular, robust, and scalable system.

Architecture exists to serve product requirements. It shall not be
dictated merely by the current implementation.

### 5.3 Engineering Decision

Within the approved architecture, make the engineering decisions
necessary to implement it correctly and efficiently.

These decisions may include timing, retry behavior, interfaces,
scheduling, state ownership, concurrency, libraries, protocols, hardware
choices, and similar design choices.

### 5.4 Implementation

Implement the approved engineering decisions faithfully in tracked
source and configuration.

Current tracked implementation remains authoritative for what the system
actually does.

### 5.5 Evidence Can Require Reconsideration

Although engineering reasoning begins with product requirements and
proceeds downward, implementation and physical evidence may reveal that
an assumption, engineering decision, architecture, or requirement
interpretation needs reconsideration.

When that happens, do not merely patch upward from the implementation.
Return to the appropriate higher level of the hierarchy and determine
the correct product-first response.

### 5.6 Fidelity Is Not Preservation of the Current Solution

Do not confuse fidelity to the current system with preservation of the
current solution.

Fidelity requires accurately establishing current truth, respecting
current approved decisions until changed, preserving evidence and
provenance, and observing authorization boundaries.

Fidelity does **not** create a presumption that the existing
architecture, engineering decision, or implementation is the best
solution to preserve.

## 6. Architecture Inputs Must Be Established Before Architecture Is Drafted

Before drafting an architecture proposal, identify the product-level
inputs that could materially determine the architecture.

These may include:

-   priority ordering between competing product or execution flows;
-   hard timing or performance budgets;
-   power, cost, memory, compute, bandwidth, or other resource
    constraints;
-   safety, installation, serviceability, or operational constraints;
-   scalability requirements;
-   external dependencies; and
-   existing engineering decisions or constants that may need
    reconsideration.

Do not draft a full architecture around self-inferred assumptions when
an unresolved product-level input could materially change the design.

If such an input is unclear, ask the CPO before designing around it.

This requirement is especially important where multiple flows compete
for execution, resources, timing, or user priority.

## 7. Canonical Does Not Mean Immutable

Canonical engineering decisions are authoritative **until changed**.

They are not automatically permanent.

The existence of a decision in an SoT means:

> **This is the currently approved decision. Do not silently deviate
> from it.**

It does not mean:

> **Preserve this decision regardless of cost, complexity, or new
> evidence.**

An existing engineering decision shall be surfaced for CPO/Architect
reconsideration when preserving it materially:

-   conflicts with a higher-order product requirement;
-   obstructs the approved architecture;
-   creates disproportionate implementation complexity;
-   requires repeated workarounds;
-   causes repeated diagnostic or validation cycles;
-   consumes significant CPO or Development Team time;
-   creates a recurring failure class; or
-   is contradicted by material new source, physical, operational, or
    validation evidence.

VSC shall not silently override the canonical decision.

The Architect shall not silently override it.

Instead, identify the constraining decision clearly, together with the
consequence of retaining it and the potential value of changing it.

The CPO decides whether the decision changes.

## 8. Evidence and Diagnostic Value

Diagnostics and evidence gathering exist to support decisions, not to
eliminate every theoretical uncertainty.

Before proposing material evidence-gathering work, determine:

> **What uncertainty does this address, what result could it produce,
> and how could that result change what we do next?**

If plausible results would not materially change the implementation,
engineering, or architectural decision, further diagnosis is normally
not warranted.

The fact that something remains unknown is not by itself sufficient
reason to investigate it.

**Sufficient evidence for the next decision is the objective.**

This principle does not permit unsupported assumptions where unresolved
evidence could materially change the decision.

### 8.1 Choose Evidence by Value

Source inspection, static analysis, build evidence, logs,
instrumentation, physical measurements, controlled experiments, and CPO
observations are tools for resolving uncertainty.

No diagnostic method is automatically first merely because it was
effective previously.

Choose the method that most efficiently attacks the:

> **most uncertain, impactful, and currently necessary question.**

Physical testing shall not be requested when existing source or other
evidence can establish the decision sufficiently.

Likewise, source analysis shall not substitute for physical evidence
when the unresolved question is inherently physical or operational.

The evidence hierarchy defined by the Fairway engineering system remains
controlling.

## 9. Diagnostic Roadmaps, Opt-Out Points, and Failure Classes

A diagnostic effort becomes a campaign when it is expected to require
repeated investigation, instrumentation, builds, flashes, physical CPO
interaction, or multiple decision cycles.

Before entering such a campaign, establish a bounded diagnostic roadmap
proportionate to the problem.

The roadmap should identify:

-   the uncertainty being investigated;
-   why resolving it matters;
-   the highest-value first investigation;
-   what useful evidence the proposed diagnostics can provide;
-   the decision that evidence affects;
-   expected physical/CPO interaction; and
-   known stop, pivot, or opt-out points.

The Development Team shall deliberately reassess the roadmap when an
opt-out point is reached.

Do not continue a diagnostic sequence merely because another diagnostic
can be constructed.

Do not allow sunk effort in a diagnostic channel to justify continued
effort if the channel is not producing decision-relevant information.

There is no automatic entitlement to a fixed number of diagnostic
iterations. The relevant test is **information value**, not iteration
count.

### 9.1 Prefer Failure-Class Elimination

When evidence reveals that a product requirement can be violated by a
broader architectural dependency, evaluate whether the dependency itself
should be removed or redesigned before continuing to localize one
occurrence.

Ask:

> **Are we fixing this instance, or preventing this class of failure?**

Localized fixes are appropriate when the architecture is sound and the
defect is genuinely local.

When multiple symptoms arise from the same architectural dependency, or
a local correction merely exposes the next blocker in the same
dependency chain, reconsider the architecture before accumulating
additional fixes.

The goal is not automatically to make the largest change.

The goal is the **smallest coherent correction that prevents recurrence
while satisfying the product requirement and architecture.**

## 10. CPO Interaction and Physical Validation

CPO attention, decision time, and physical interaction with prototypes
are engineering resources.

They shall be used where they provide meaningful value.

Repeated requests for the CPO to flash devices, reset or power-cycle
hardware, observe indicators, manipulate wiring, perform measurements,
compare ambiguous physical behaviors, or wait through diagnostic cycles
shall be evaluated against their expected information and decision
value.

When VSC believes the evidence justifies physical flashing, its
responsibility is to state clearly:

> **I think we can flash now.**

It shall explain concisely what is ready, what the flash is expected to
establish, and any relevant risk.

**The CPO decides whether flashing is appropriate and authorizes it.**

There is no standing or implied flash authorization.

Existing authorization boundaries for planning, editing, building,
flashing, physical validation, cleanup, commit, and push remain in force
unless explicitly authorized otherwise.

## 11. Roles and Responsibilities

### 11.1 CPO

The CPO owns:

-   product intent;
-   product priorities;
-   acceptance of material product tradeoffs;
-   reconsideration of canonical decisions when surfaced;
-   authorization decisions assigned to the CPO; and
-   approval of durable Kaizen rules.

The Development Team should bring the CPO **decisions worth making**,
not unresolved technical detail that can be answered without CPO
involvement.

### 11.2 Lead Architect

The Lead Architect owns:

-   maintaining coherence from Product Requirement through Architecture,
    Engineering Decision, and Implementation;
-   determining whether engineering work remains aligned with the
    product objective;
-   identifying product-level inputs that must be resolved before
    architecture is drafted;
-   evaluating evidence sufficiency for architectural and engineering
    decisions;
-   recognizing when the engineering question has changed;
-   preventing diagnostic momentum from replacing decision-making;
-   identifying when a canonical decision should be reconsidered;
-   framing material CPO decisions concisely;
-   protecting coherence across owner SoTs;
-   protecting CPO time from avoidable engineering churn; and
-   independently assessing VSC results before recommending the next
    safe action.

The Architect should not become merely the director of increasingly
narrow debugging.

### 11.3 VSC Engineering Agent

VSC owns:

-   establishing current implementation truth from the canonical
    repository;
-   implementing approved engineering decisions faithfully;
-   performing authorized investigation and engineering work;
-   identifying implementation constraints and relevant evidence;
-   identifying unresolved product-level inputs before drafting
    architecture;
-   identifying when a canonical decision is causing disproportionate
    complexity or repeated workaround logic;
-   surfacing such decisions rather than silently engineering around
    them;
-   proposing Kaizen improvements when useful;
-   maintaining Git, build, and evidence discipline; and
-   reporting what was actually established rather than overstating
    validation.

VSC does not independently redefine product requirements, architecture,
or canonical engineering decisions.

When such a change appears warranted, VSC escalates it.

## 12. Authorization Discipline

Continuous improvement shall not be used as justification for weakening
controls that protect the integrity of the engineering system.

Explicit separation of planning, implementation, build, flash,
validation, cleanup, commit, and push remains valuable engineering
governance.

Kaizen should reduce **unnecessary work**, not remove valuable controls.

Where repeated authorization interactions appear wasteful, improve the
scope, sequencing, and clarity of the proposed work rather than assuming
broader authority.

## 13. Retrospective / Kaizen Cycle

A formal Development Team retrospective shall occur:

-   after every major development sprint; and
-   whenever the CPO calls for one.

The retrospective includes the CPO, Lead Architect, and VSC engineering
agent.

Its purpose is not to create a historical record for its own sake.

Its purpose is to determine:

-   what worked;
-   what did not;
-   what consumed disproportionate time;
-   where assumptions were wrong;
-   where decisions were made too early or too late;
-   whether the correct product-first hierarchy was followed;
-   whether architecture inputs were established before design;
-   whether evidence was sufficient or excessive;
-   whether CPO time was used effectively;
-   whether architecture eliminated or preserved failure classes;
-   whether existing SoT decisions should have been reconsidered;
-   what practices should be retained; and
-   what practices should change.

Any participant may propose a Kaizen rule during or outside a
retrospective.

Only CPO-approved lessons become canonical rules.

## 14. Kaizen Must Reduce Process Burden

Continuous improvement can itself become waste.

Therefore:

-   prefer a small number of durable principles over large checklists;
-   do not create mandatory artifacts without demonstrated value;
-   do not create a process merely because a failure happened once;
-   consolidate overlapping rules;
-   remove obsolete rules;
-   avoid rules that prescribe a particular diagnostic technique where a
    broader decision principle is sufficient; and
-   periodically challenge whether existing Kaizen rules still create
    value.

A Kaizen rule that creates more burden than the failure it prevents
should be reconsidered.

Preserve the durable lesson, not unnecessary historical narrative.

## 15. Relationship to Other Systems of Truth

This document owns continuous-improvement and development-decision
practice.

Other Major Engineering Documents shall reference this SoT where needed
rather than duplicate its detailed rules.

When a clause currently owned by another SoT is determined to belong
here:

1.  identify the ownership change;
2.  migrate the detailed truth here;
3.  remove the competing detailed statement from the prior owner;
4.  leave only the minimum cross-reference necessary for navigation or
    context; and
5.  ensure no gap or contradictory authority is created.

The Fidelity Mandate remains owned by `docs/ENGINEERING_GUIDE.md`.

The Fidelity Mandate establishes how current engineering truth and
authorization are protected.

This Kaizen SoT establishes how the Development Team continuously
improves **the quality, value, and efficiency of the decisions made
within those controls.**

The two are complementary.

### 15.1 Required Canonical Registration

When this document is adopted, the engineering document hierarchy shall
be reconciled so that this SoT is discoverable through the canonical
read path.

At minimum:

-   `docs/README.md` shall identify
    `docs/Continuous_improvement_Kaizen_1.0.md` as the owner of
    continuous-improvement and development-decision practice and include
    it in the Major Engineering Documents;
-   `docs/ENGINEERING_GUIDE.md` shall include it in the Documentation
    Map;
-   the canonical Fidelity Mandate's Major Engineering Document read
    list shall include it.

The CPO-maintained Durable Lead Architect Handoff and Durable VSC Engineering
Handoff should direct their respective agents to the canonical repository entry
point and this SoT. The handoffs remain external bootstrap/role instructions
and are not themselves canonical engineering SoTs.

Detailed continuous-improvement clauses that are migrated here shall be
removed from competing owner documents and replaced only with the
minimum necessary cross-reference.

# 16. Approved Kaizen Rule Register

This section contains durable rules approved by the CPO.

Retrospective observations do not belong here unless promoted by the
CPO.

## K-001 --- Product First

**Rule**

Engineering reasoning shall proceed:

> **Product Requirement → Architecture → Engineering Decision →
> Implementation**

Do not allow inherited implementation or engineering decisions to
silently redefine the product requirement.

**Origin**

WP4 Device Health / golfer-first architecture retrospective.

**Failure prevented**

Local implementation constraints driving product behavior or
architecture without explicit decision.

## K-002 --- Establish Architecture Inputs Before Designing

**Rule**

Before drafting architecture, identify product-level priorities, hard
timing/performance/resource constraints, operational requirements, and
existing engineering decisions that could materially determine the
architecture.

If a material input is unknown, ask the CPO rather than drafting around
a self-inferred assumption.

**Origin**

WP4 Device Health / golfer-first architecture retrospective.

**Failure prevented**

Architecture planning rounds built around unconfirmed product
priorities, timing budgets, or inherited engineering assumptions.

## K-003 --- Know the Value Before Doing the Work

**Rule**

Before material work, understand the objective, uncertainty being
resolved, decision it can change, impact, priority, and why the work is
required now.

If that prioritization is unclear, ask the CPO.

**Origin**

WP4 retrospective and Tier 1 Product Goal Development Acceptance
Criteria.

**Failure prevented**

Low-value engineering activity, premature work, and unnecessary
CPO/Development Team effort.

## K-004 --- Diagnose With a Roadmap and Opt-Out Points

**Rule**

Nontrivial diagnostic campaigns shall identify their intended
information gain, the decisions affected, and the conditions under which
the team will stop, pivot, or escalate.

Do not continue diagnostics that cannot materially change the
engineering decision.

**Origin**

WP4 Device Health / golfer-first architecture retrospective.

**Failure prevented**

Diagnostic momentum, sunk-cost continuation, and excessive localization.

## K-005 --- Canonical Decisions Are Reconsiderable

**Rule**

Canonical engineering decisions remain binding until changed, but shall
be surfaced for reconsideration when preserving them causes material
complexity, repeated workarounds, significant delay, substantial CPO
effort, or conflict with higher-order product requirements or
architecture.

VSC and the Architect may propose reconsideration.

The CPO decides.

**Origin**

WP4 Device Health / golfer-first architecture retrospective.

**Failure prevented**

Treating earlier engineering decisions as immutable constraints and
engineering unnecessary complexity around them.

## K-006 --- Eliminate Failure Classes

**Rule**

When evidence exposes an architectural failure mode, evaluate
eliminating the failure class before continuing to localize or patch
individual occurrences.

Prefer the smallest coherent correction that prevents recurrence and
satisfies the product requirement.

**Origin**

WP4 golfer-first correction.

**Failure prevented**

Repeated symptom fixes that preserve the underlying architectural
dependency.

## K-007 --- Capture and Reuse Verified Procedures for Repeated External Requests

**Rule**

When the Development Team is asked to repeat a request that depends on a
tool, procedure, or environment fact previously discovered through search
or trial and error (for example: locating an out-of-repository artifact,
or finding a working document-conversion tool on this machine), the
verified procedure shall be captured the first time it is confirmed
working, rather than rediscovered from first principles on each
subsequent request.

Capture, at minimum: the identity/location of the artifact or tool, the
verified working command(s), and any known-broken alternatives so they
are not retried.

**Verified Procedure --- Fairway Refresh SoT Summary PDF (External, CPO Command)**

The CPO-facing "current canonical SoTs" PDF is a convenience export of
the current tracked owner documents in `nfed/docs/`, kept outside the
repository. It is not a repo file, is never committed, and is not part
of the Fidelity Mandate's Major Engineering Document read path.

There shall always be exactly one such export, and it always reflects the
live current SoTs at the time the CPO requests an update.

Canonical location: `~/Documents/feather_code/` (the parent workspace
folder, outside the `nfed` repository). Do not create or leave the
export in any other location (e.g. Desktop, Downloads), even if an older
artifact is found there.

Verified working procedure:

1.  Confirm current git truth first (branch/HEAD) so the new export's
    provenance header is accurate, explicitly noting when HEAD is on a
    feature branch not yet merged to `main`.
2.  Freshly read the current Major Engineering Documents in Fidelity
    Mandate read order (README first, then the mandate's list, with any
    newly-registered SoT such as Kaizen inserted at its Documentation Map
    position) and concatenate them with a plain-text provenance header
    (source commit, branch, milestone state, and an explicit "reference
    export only, tracked Markdown remains canonical" disclaimer).
3.  Convert the assembled text to PDF with `cupsfilter <file>.txt >
    <file>.pdf` (verified working on this machine). `textutil -convert
    pdf` does **not** support PDF output on this machine and should not
    be retried; `pandoc`, `wkhtmltopdf`, and `weasyprint` are not
    installed.
4.  Verify fidelity with `pdftotext -layout` against the source text
    (line-wrap differences are cosmetic and expected; content must
    match).
5.  Before writing the new file, delete every existing file in the
    canonical location matching `Fairway_Refresh_Current_Canonical_SoTs_*.pdf`,
    then write the new export named with the new source commit short SHA,
    so exactly one export exists at any time.

**Origin**

Repeated CPO requests to regenerate the external SoT summary PDF, each of
which required rediscovering the file's location and a working
text-to-PDF conversion path from scratch.

**Failure prevented**

Repeated, avoidable rediscovery/troubleshooting time (file location,
non-working tools such as `textutil -convert pdf`) spent re-solving an
already-solved problem each time this recurring CPO request is made.
