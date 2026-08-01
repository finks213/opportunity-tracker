# LINEAGE Milestone 1 — Manual iPad Acceptance Checklist

**Status: `PENDING_HUMAN_DEVICE_TEST`**

Claude Code cannot self-certify this gate. It requires a human with a physical
device.

> **DO NOT PERFORM THIS TEST YET.** The overall milestone status is
> `M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED`.
> The device test is gated behind revision 8 surviving independent re-audit
> (structural code audit and AFE-Δ evidence audit). Running it earlier measures a
> build that is not yet accepted for device testing.

> **SECURITY NOTE.** `tools/serve.mjs` is bound on the local network for this
> workflow. Revision 2 contained a path-traversal defect that returned
> out-of-root files; it is repaired (revision 3, preserved in revision 4) and
> covered by `test/server-containment.test.js`. Run that test before exposing
> the server.

Any supplied measurement that violates a threshold makes this gate `FAIL` and
the overall status `M1_BLOCKED` until repaired and retested.

---

## 1. Test conditions

Use **one representative A14-class or newer iPad**, current Safari, **landscape**
orientation, at the browser's **default zoom**.

Serve the project and open it on the device on the same network:

```bash
node tools/serve.mjs 8080
# then open http://<your-computer-ip>:8080/ in Safari on the iPad
```

Record the device context before testing:

| Field | Value |
|---|---|
| iPad model | ______________________ |
| Chip (A14-class or newer) | ______________________ |
| iPadOS version | ______________________ |
| Safari version | ______________________ |
| Viewport (CSS px, landscape) | ______________________ |
| Device pixel ratio | ______________________ |
| Date of test | ______________________ |
| Tester | ______________________ |

The probe records viewport, DPR, and user agent automatically. In the Safari
console (or after connecting Web Inspector) run:

```js
lineageEnvironment
```

---

## 2. Required deterministic manual-test modes

The probe provides both modes required by §22.

### 2.1 Legibility mode

1. Tap **Load defining fixture**.
2. Tap **Legibility**.
3. The screen shows **ten randomized high-versus-low webbing pairs**. Pair order
   uses `uiRng` with the fixed manual-test seed **32001** and never touches
   biological state.
4. For each of the ten rows, the tester picks which animal has the wider
   (webbed) feet **without any raw trait values shown**. Leave the
   "show raw allocations and genome values" toggle **off**.
5. Record the score out of 10.

### 2.2 Render-stress mode

1. Tap **Render stress (360 glyphs)**.
2. Exactly **360 simultaneously visible procedural animal glyphs** are drawn
   across the three Canvas regions. This is a rendering benchmark only; it does
   not alter the biological acceptance model.
3. Allow a **30-second warm-up**, then collect frame intervals for **at least
   180 continuous seconds**.
4. Read the statistics from the console:

```js
lineageProbe.meter.summary()
```

### 2.3 Input latency

While in render-stress or normal mode, exercise **at least 20 control actions**
across pause, single-step, continuous-run toggle, fixture reset, and mode
switching. Every one of these controls is instrumented, so
`lineageProbe.meter.summary().p95InputToNextPaintMs` reports the 95th-percentile
input-to-next-paint latency across those actions.

---

## 3. Required evidence

Fill in every row. A missing measurement leaves the gate
`PENDING_HUMAN_DEVICE_TEST`.

| Evidence | Threshold | Measured | Pass? |
|---|---|---|---|
| median frame time | `<= 16.7 ms` | __________ | ☐ |
| 95th-percentile frame time | `<= 33.4 ms` | __________ | ☐ |
| 95th-percentile input-to-next-paint (>= 20 actions) | `<= 100 ms` | __________ | ☐ |
| tab reload count | `== 0` | __________ | ☐ |
| crash count | `== 0` | __________ | ☐ |
| blank Canvas / unrecoverable input / Safari-specific rendering failures | `== 0` | __________ | ☐ |
| all three zone regions and their animal occupancy distinguishable at default zoom, without opening the inspector | `true` | __________ | ☐ |
| webbing identification score on ten randomized pairs, no raw trait values | `>= 8 of 10` | ______ / 10 | ☐ |

Notes on any anomaly (rendering artefacts, dropped touches, thermal throttling,
Safari quirks):

```
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
```

---

## 4. Pass law (contract §22)

The human iPad gate passes only when **all** of the following are true:

```text
medianFrameTime <= 16.7 ms
p95FrameTime <= 33.4 ms
p95InputToNextPaint <= 100 ms
reloadCount == 0
crashCount == 0
blankOrUnrecoverableFailureCount == 0
allThreeZonesLegible == true
webbingIdentificationScore >= 8 of 10
```

## 5. Outcome

Circle one and record it in `FINAL_REPORT.md`:

- ☐ **PASS** — every threshold above met. Milestone 1 may then be reported
  `M1_ACCEPTED` only if every automated gate has ALSO passed independent
  re-audit. A device pass alone does not lift
  `M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED`.
- ☐ **FAIL** — at least one supplied measurement violates a threshold. Overall
  status becomes `M1_BLOCKED` until repaired and retested.
- ☑ **PENDING_HUMAN_DEVICE_TEST** — current state. No physical device test has
  been performed. Milestone 1 is reported
  `M1_BLOCKED — IMPLEMENTATION AND EVIDENCE REPAIRS REQUIRED`,
  with the process waiver and the device test separately pending.

Once completed, include this filled checklist and any measurement notes in the
audit bundle. Their absence alone does **not** make the implementation accepted;
the `PENDING_HUMAN_DEVICE_TEST` state is preserved (contract §27).
