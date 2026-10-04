# Paid-character early visual diagnostic

Updated 2026-10-02T19:54:50.028212+00:00. Bounded diagnostic SUCCESS; final mandatory QA is still required.

Method: direct decoded192px PNG contact sheets against original Choose Character portraits; all252 cells examined across initial and targeted passes. Corrected run P3 Raven/Panther/Cobra/Badger now changes near-arm direction and leg overlap. Badger P5 reaches with opposite arm. Gecko P6 keeps complete foot inside cell. All18 preserve head anatomy, palette and armor; all6-frame climb sheets face back with alternate reaches. No broad clipping/anatomy defects.

| ID | Identity / pose / climb | Approx skull headTop |
|---|---|---|
| kestrel-void | Pass | 52 ±6px |
| lynx-void | Pass | 46 ±6px |
| raven-void | Pass | 50 ±6px |
| panther-void | Pass | 39 ±6px |
| wolf-void | Pass | 54 ±6px |
| otter-void | Pass | 43 ±6px |
| heron-void | Pass | 52 ±6px |
| yak-void | Pass | 49 ±6px |
| mantis-void | Pass | 55 ±6px |
| cobra-void | Pass | 27 ±6px |
| badger-void | Pass | 30 ±6px |
| falcon-void | Pass | 49 ±6px |
| marmot-void | Pass | 48 ±6px |
| bison-void | Pass | 48 ±6px |
| ibex-void | Pass | 55 ±6px |
| sentinel-void | Pass | 48 ±6px |
| viking-void | Pass | 35 ±6px |
| gecko-void | Pass | 27 ±6px |

Nonblocking polish: sparse1px green edge flecks on Badger silhouette visible on black; no broad halo on gray.

AC-1: PASS for side-by-side identity across18. AC-2: FAIL/untestable at this stage—application integration and real first-run/saved/refresh/switch/reduced-motion/fallback flows remain pending. AC-3: PASS for compiled geometry snapshot18/18 per compiler; final registered-art check remains required. AC-4: FAIL/untestable until native registration. Untestable ACs route to software-engineer integration, not an asserted product defect.

F-1 not yet exercised; F-2 art compilation/review passes with corrected assets. All final animated rendering and application flow checks must follow required reviews.

Evidence: /tmp/paid-character-review/diagnostic/<id>-void.jpg and reviewed-snapshot.json (compiled/master SHA256 per ID); compiler-report.json18/18. Prior15 identity evidence retained. Exact per-ID estimates/hash matrix is in loop/handoffs/qa-acceptance-2026-10-02T19-54-50Z.json.
